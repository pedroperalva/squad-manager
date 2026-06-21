import type { CountryCode, Formation, GameState, Club } from "@/engine/types";
import { formatCountriesLabel, formatDivisionLabel, getGameSeed, MIN_GAME_TEAMS } from "@/engine/types";
import { distributeClubsFromCountries, createStandings } from "@/engine/club";
import {
  generateFixtures,
  getTotalRounds,
  getNextHumanFixture,
  resetSeasonStandings,
  regenerateFixtures,
  getDivisionStandings,
} from "@/engine/league";
import {
  createCoach,
  createCoachRecord,
  initializeCoachRegistry,
  generateCoachOffers,
  getCoachRanking,
  acceptCoachOffer,
  rejectCoachOffer,
  applyNewCoachToClub,
  fillClubVacancyUntilFilled,
} from "@/engine/coach";
import {
  applyChampionForceBoost,
  type DivisionChampionAward,
  getPlayersByClub,
  resetPlayerSeasonStats,
} from "@/engine/player";
import {
  acceptTransfer,
  rejectTransfer,
  buyPlayer,
  getPlayerBuyPrice,
} from "@/engine/transfer";
import {
  acceptPlayerRaise,
  rejectPlayerRaise,
  resetContractsForNewSeason,
  setHumanTicketPrice,
} from "@/engine/finances";
import { playRound } from "@/engine/league";
import {
  prepareLiveRound,
  finalizeLiveRound,
  prepareLiveCupRound,
  prepareLiveCupRoundAll,
  finalizeLiveCupMatch,
  finalizeLiveCupRound,
  computeHumanSecondHalf,
  computeHumanCupSecondHalf,
  setLineup,
} from "@/engine/live-round";
import {
  buildLineupForFormation,
  detectFormationMatch,
  removeUnavailableFromSquad,
} from "@/engine/squad";
import {
  canStartGameWithCountries,
  getNewGameValidation,
  getSelectableHumanClubs,
} from "@/data/teams-catalog";
import { createRng, generateCoachName, generateRunSeed } from "@/data/name-generator";
import { createCupState } from "@/engine/cup";
import { processLeagueSeasonClose } from "@/engine/season-end";
import { shuffledCopy } from "@/engine/rng";

function pickLocalManagerClubs(
  clubs: Club[],
  managerCount: number,
  runSeed: number,
  season: number
): Club[] {
  const div4 = clubs.filter((c) => c.division === 4);
  if (div4.length < managerCount) {
    throw new Error("Não há clubes suficientes na 4ª divisão para todos os jogadores.");
  }
  const rng = createRng(runSeed * 313 + season * 17 + managerCount * 19);
  return shuffledCopy(div4, rng).slice(0, managerCount);
}

export function createNewGame(
  countries: CountryCode[],
  coachNameOrManagers: string | string[],
  humanClubSlug?: string
): GameState {
  if (!canStartGameWithCountries(countries)) {
    const { message } = getNewGameValidation(countries);
    throw new Error(
      message ??
        `Selecione países com pelo menos ${MIN_GAME_TEAMS} clubes no total (32 na liga + 32 distritais).`
    );
  }

  const managerNames = Array.isArray(coachNameOrManagers)
    ? coachNameOrManagers
        .map((n) => n.trim())
        .filter((n) => n.length > 0)
        .slice(0, 4)
    : [];

  const isLocalMode = managerNames.length > 0;
  const coachName = Array.isArray(coachNameOrManagers)
    ? managerNames[0] ?? "Jogador 1"
    : coachNameOrManagers;

  const selectable = getSelectableHumanClubs(countries);
  if (!isLocalMode && !selectable.some((t) => t.slug === humanClubSlug)) {
    throw new Error("Escolha um clube entre os 32 mais fortes do pool selecionado.");
  }

  const runSeed = generateRunSeed();
  const { clubs, players } = distributeClubsFromCountries(
    countries,
    isLocalMode ? undefined : humanClubSlug,
    runSeed
  );
  for (const club of clubs) {
    club.morale = 50;
  }

  let humanClub: Club;
  let localManagers: GameState["localManagers"];

  if (isLocalMode) {
    const picked = pickLocalManagerClubs(clubs, managerNames.length, runSeed, 1);
    for (const club of clubs) {
      club.isHuman = picked.some((p) => p.id === club.id);
    }
    humanClub = picked[0]!;
    localManagers = picked.map((club, i) => ({
      id: `P${i + 1}`,
      name: managerNames[i]!,
      clubId: club.id,
      ready: false,
      lineupPlayerIds: [],
      benchPlayerIds: [],
      formation: null,
    }));
  } else {
    const selected = clubs.find((c) => c.slug === humanClubSlug);
    if (!selected) {
      throw new Error(`Clube não encontrado: ${humanClubSlug}`);
    }
    humanClub = selected;
    humanClub.isHuman = true;
    localManagers = [
      {
        id: "P1",
        name: coachName,
        clubId: humanClub.id,
        ready: false,
        lineupPlayerIds: [],
        benchPlayerIds: [],
        formation: null,
      },
    ];
  }

  const coach = createCoach(coachName);
  const registry = initializeCoachRegistry(clubs, humanClub.id, coachName, 1);
  coach.coachId = registry.humanCoachId;
  coach.currentClubId = humanClub.id;
  humanClub.coachName = coach.name;
  humanClub.coachId = registry.humanCoachId;
  humanClub.coachRecentlyFired = false;

  const fixtures = generateFixtures(clubs);

  const introMessages = [
    `Nova temporada — ${formatCountriesLabel(countries)}.`,
    `Você comanda o ${humanClub.name} (${formatDivisionLabel(humanClub.division)} divisão · força ${humanClub.strengthIndex}).`,
    `Liga mista: top 32 por índice de força (1–50); demais 32 entram no distrital e na Copa.`,
  ];
  if (isLocalMode && managerNames.length > 1) {
    introMessages.push(
      "Modo local ativado:",
      ...localManagers.map((m, idx) => {
        const club = clubs.find((c) => c.id === m.clubId)!;
        return `J${idx + 1} ${m.name} → ${club.name} (${formatDivisionLabel(club.division)})`;
      })
    );
  }

  const state: GameState = {
    id: crypto.randomUUID(),
    runSeed,
    countries,
    country: countries[0]!,
    season: 1,
    round: 1,
    totalRounds: getTotalRounds(fixtures),
    phase: "regular",
    clubs,
    players,
    standings: createStandings(clubs),
    fixtures,
    cup: createCupState(clubs, 1),
    coach,
    coaches: registry.coaches,
    nextCoachId: registry.nextCoachId,
    localManagers,
    activeManagerIndex: 0,
    isLocalMultiplayer: isLocalMode && managerNames.length > 1,
    auctionBidderClubId: humanClub.id,
    humanClubId: humanClub.id,
    humanFormation: null,
    lineupPlayerIds: [],
    benchPlayerIds: [],
    transferOffers: [],
    auctionListings: [],
    auctionQueue: [],
    auctionSession: null,
    nextAuctionId: 1,
    nextAuctionLotId: 1,
    messages: introMessages,
    nextFixtureId: null,
    lastRoundResults: null,
    seasonSummary: null,
    leagueSeasonProcessed: false,
  };

  state.nextFixtureId = getNextHumanFixture(state)?.id ?? null;
  return state;
}

export function simulateRound(state: GameState): GameState {
  if (state.phase !== "regular") return state;
  if (!areAllManagersReady(state)) {
    throw new Error("Todos os jogadores locais precisam marcar pronto antes da rodada.");
  }
  const updated = playRound(state);
  const resetManagers = updated.localManagers.map((m) => ({ ...m, ready: false }));
  const first = resetManagers[0];
  const syncManagerClub =
    state.isLocalMultiplayer || updated.coach.currentClubId != null;
  const nextState = {
    ...updated,
    localManagers: resetManagers,
    activeManagerIndex: 0,
    humanClubId:
      syncManagerClub && first ? first.clubId : updated.humanClubId,
    lineupPlayerIds:
      syncManagerClub && first ? first.lineupPlayerIds : updated.lineupPlayerIds,
    benchPlayerIds:
      syncManagerClub && first ? first.benchPlayerIds : updated.benchPlayerIds,
    humanFormation:
      syncManagerClub && first ? first.formation : updated.humanFormation,
    auctionBidderClubId:
      syncManagerClub && first ? first.clubId : updated.humanClubId,
    coach:
      syncManagerClub && first
        ? {
            ...updated.coach,
            coachId:
              updated.clubs.find((c) => c.id === first.clubId)?.coachId ??
              updated.coach.coachId,
            name: first.name,
            currentClubId: first.clubId,
          }
        : updated.coach,
  };
  nextState.nextFixtureId = getNextHumanFixture(nextState)?.id ?? null;
  return nextState;
}

export { processEndOfSeason, processLeagueSeasonClose, finalizeSeasonAfterCup } from "@/engine/season-end";

export function startNextSeason(state: GameState): GameState {
  if (state.coach.currentClubId === null && state.coach.offers.length > 0) {
    return state;
  }

  const closedState = state.leagueSeasonProcessed
    ? state
    : processLeagueSeasonClose(state);

  const standings = resetSeasonStandings(closedState.clubs);
  const fixtures = regenerateFixtures(closedState.clubs);
  const coaches = closedState.coaches.map((coach) => ({ ...coach }));
  let nextCoachId = closedState.nextCoachId;

  const divisionChampionAwards: DivisionChampionAward[] = [];
  let cupChampionClubId: number | null = null;
  for (const award of closedState.seasonSummary?.awards ?? []) {
    if (award.competition === "Copa Geral") {
      cupChampionClubId = award.clubId;
      continue;
    }
    const divisionMatch = award.competition.match(/^([1-4])ª divisão$/);
    if (!divisionMatch) continue;
    const division = Number(divisionMatch[1]) as 1 | 2 | 3 | 4;
    divisionChampionAwards.push({ clubId: award.clubId, division });
  }

  if (cupChampionClubId == null) {
    cupChampionClubId = closedState.cup?.championClubId ?? null;
  }

  const nationalChampionIds = new Set<number>();
  if (divisionChampionAwards.length > 0 || cupChampionClubId != null) {
    for (const award of divisionChampionAwards) {
      nationalChampionIds.add(award.clubId);
    }
    if (cupChampionClubId != null) nationalChampionIds.add(cupChampionClubId);
  } else {
    for (const division of [1, 2, 3, 4]) {
      const divisionStandings = getDivisionStandings(closedState, division);
      if (divisionStandings[0]) {
        nationalChampionIds.add(divisionStandings[0].clubId);
      }
    }
    if (closedState.cup?.championClubId) {
      nationalChampionIds.add(closedState.cup.championClubId);
    }
  }

  const coachFillState: GameState = { ...closedState, coaches, nextCoachId };

  for (const club of closedState.clubs) {
    club.winStreak = 0;
    club.lossStreak = 0;
    if (nationalChampionIds.has(club.id)) {
      club.morale = 100;
    }
    club.coachRecentlyFired = false;
    if (club.coachId == null || club.coachName === "Cargo vago") {
      fillClubVacancyUntilFilled(coachFillState, club);
    }
  }
  nextCoachId = coachFillState.nextCoachId;

  const championBoostRng = createRng((closedState.season + 1) * 9151 + getGameSeed(closedState));
  applyChampionForceBoost(
    closedState.players,
    closedState.clubs,
    divisionChampionAwards,
    cupChampionClubId,
    championBoostRng
  );

  resetPlayerSeasonStats(closedState.players);
  const players = resetContractsForNewSeason(closedState.players);

  const resetManagers = closedState.localManagers.map((manager, index) => ({
    ...manager,
    clubId:
      !closedState.isLocalMultiplayer && index === 0
        ? closedState.humanClubId
        : manager.clubId,
    ready: false,
    lineupPlayerIds: [],
    benchPlayerIds: [],
    formation: null,
  }));
  const humanClubId = closedState.humanClubId;
  const humanCoachClub = closedState.clubs.find((club) => club.id === humanClubId);
  const humanUnemployed = closedState.coach.currentClubId === null;
  const unemployedOffers = humanUnemployed
    ? closedState.coach.offers.length > 0
      ? closedState.coach.offers
      : generateCoachOffers(
          closedState,
          humanClubId,
          (closedState.season + 1) * 555 + getGameSeed(closedState)
        )
    : [];

  return {
    ...closedState,
    players,
    season: closedState.season + 1,
    round: 1,
    totalRounds: getTotalRounds(fixtures),
    phase: "regular",
    standings,
    fixtures,
    cup: createCupState(closedState.clubs, closedState.season + 1),
    transferOffers: [],
    lastRoundResults: null,
    seasonSummary: null,
    leagueSeasonProcessed: false,
    localManagers: resetManagers,
    activeManagerIndex: 0,
    lineupPlayerIds: [],
    benchPlayerIds: [],
    humanFormation: null,
    humanClubId,
    auctionBidderClubId: closedState.isLocalMultiplayer
      ? (resetManagers[0]?.clubId ?? humanClubId)
      : humanClubId,
    coach: {
      ...closedState.coach,
      offers: humanUnemployed ? unemployedOffers : [],
      coachId: humanUnemployed
        ? closedState.coach.coachId
        : (humanCoachClub?.coachId ?? closedState.coach.coachId),
      name: closedState.coach.name,
      currentClubId: closedState.coach.currentClubId,
    },
    coaches,
    nextCoachId,
    messages: [
      ...closedState.messages,
      `Temporada ${closedState.season + 1} iniciada!`,
    ],
    nextFixtureId: getNextHumanFixture({
      ...closedState,
      round: 1,
      fixtures,
      phase: "regular",
    })?.id ?? null,
  };
}

export function setFormation(state: GameState, formation: Formation): GameState {
  const squad = getPlayersByClub(state.players, state.humanClubId);
  const built = buildLineupForFormation(squad, formation);
  const { lineupIds, benchIds } = removeUnavailableFromSquad(
    built.lineupIds,
    built.benchIds,
    squad
  );
  const storedFormation =
    formation === "Melhores" ? ("Melhores" as Formation) : formation;
  const localManagers = state.localManagers.map((m, idx) =>
    idx === state.activeManagerIndex
      ? {
          ...m,
          lineupPlayerIds: lineupIds,
          benchPlayerIds: benchIds,
          formation: storedFormation,
        }
      : m
  );
  return {
    ...state,
    localManagers,
    humanFormation: storedFormation,
    lineupPlayerIds: lineupIds,
    benchPlayerIds: benchIds,
  };
}

export function setSquad(
  state: GameState,
  lineupIds: number[],
  benchIds: number[]
): GameState {
  const squad = getPlayersByClub(state.players, state.humanClubId);
  const sanitized = removeUnavailableFromSquad(lineupIds, benchIds, squad);
  lineupIds = sanitized.lineupIds;
  benchIds = sanitized.benchIds;
  const matched = detectFormationMatch(lineupIds, squad);
  const localManagers = state.localManagers.map((m, idx) =>
    idx === state.activeManagerIndex
      ? {
          ...m,
          lineupPlayerIds: lineupIds,
          benchPlayerIds: benchIds,
          formation: lineupIds.length === 0 ? null : matched ?? m.formation,
        }
      : m
  );
  return {
    ...state,
    localManagers,
    lineupPlayerIds: lineupIds,
    benchPlayerIds: benchIds,
    humanFormation:
      lineupIds.length === 0 ? null : matched ?? state.humanFormation,
  };
}

export function areAllManagersReady(state: GameState): boolean {
  if (!state.isLocalMultiplayer) return true;
  return state.localManagers.length > 0 && state.localManagers.every((m) => m.ready);
}

export function markActiveManagerReady(state: GameState): GameState {
  if (!state.isLocalMultiplayer) return state;
  const updatedManagers = state.localManagers.map((m, idx) =>
    idx === state.activeManagerIndex ? { ...m, ready: true } : m
  );
  const nextIndex = updatedManagers.findIndex((m) => !m.ready);
  if (nextIndex === -1) {
    return {
      ...state,
      localManagers: updatedManagers,
      messages: [...state.messages, "Todos os jogadores estão prontos para a rodada."],
    };
  }
  const next = updatedManagers[nextIndex]!;
  return {
    ...state,
    localManagers: updatedManagers,
    activeManagerIndex: nextIndex,
    humanClubId: next.clubId,
    lineupPlayerIds: next.lineupPlayerIds,
    benchPlayerIds: next.benchPlayerIds,
    humanFormation: next.formation,
    auctionBidderClubId: next.clubId,
    coach: { ...state.coach, name: next.name, currentClubId: next.clubId },
  };
}

export function getAvailableClubsForCountries(countries: CountryCode[]) {
  return getSelectableHumanClubs(countries);
}

export {
  canStartGameWithCountries,
  countTeamsFromCountries,
  getSelectableHumanClubs,
  getTeamsFromCountries,
  ALL_COUNTRIES,
} from "@/data/teams-catalog";
export {
  advanceLocalManagerTurn,
  fixtureHasHumanClub,
  getHumanClubIds,
  resetLocalManagerTurn,
  syncLocalManagerView,
} from "@/engine/local-play";

export {
  getCoachRanking,
  acceptCoachOffer,
  rejectCoachOffer,
  acceptTransfer,
  rejectTransfer,
  buyPlayer,
  getPlayerBuyPrice,
  acceptPlayerRaise,
  rejectPlayerRaise,
  setHumanTicketPrice,
  getNextHumanFixture,
  getDivisionStandings,
  prepareLiveRound,
  finalizeLiveRound,
  prepareLiveCupRound,
  prepareLiveCupRoundAll,
  finalizeLiveCupMatch,
  finalizeLiveCupRound,
  computeHumanSecondHalf,
  computeHumanCupSecondHalf,
  setLineup,
};

export {
  listPlayerOnAuctionQueue,
  removeFromAuctionQueue,
  updateAuctionQueueMinBid,
  resolveAuctionLot,
  skipRemainingAuctionLots,
  submitAuctionHumanBid,
  submitAuctionSkipVote,
  completeAuctionSession,
  sellPlayerInstantly,
  getMinBidBounds,
  clampMinBid,
  getHumanQueuedListing,
  computeClubAuctionBudget,
} from "@/engine/auction";

export {
  getCupBracketSummary,
  getCupPhaseName,
  getCupRoundLabel,
  getCupTiesForLeagueRound,
  getPendingHumanCupTie,
  hasPendingHumanCupTies,
  isCupLeagueGate,
} from "@/engine/cup";

export {
  getClubPayroll,
  getSeasonPayrollEstimate,
  getDefaultTicketPrice,
  getSalaryBandForSkill,
  projectNextHomeRevenue,
  getNextPayrollRound,
  getPayrollPaymentsPerSeason,
  playerBlocksSale,
  autoRenewAllContracts,
  requestClubLoan,
  repayClubLoan,
  expandHumanStadium,
  estimateLoanInterestRateBps,
  getStadiumExpansionCost,
  STADIUM_EXPANSION_STEP,
  STADIUM_CAPACITY_MAX,
} from "@/engine/finances";

export type { GameState };
