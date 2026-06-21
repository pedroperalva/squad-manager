import type { Club, CupState, CupTie, GameState } from "@/engine/types";
import {
  CUP_FINAL_LEAGUE_ROUND,
  CUP_LEAGUE_GATES,
  CUP_PHASE_NAMES,
  CUP_TEAM_COUNT,
  DISTRITAL_DIVISION,
  NATIONAL_DIVISION_COUNT,
  getGameSeed,
} from "@/engine/types";
import { applyMatchMorale } from "@/engine/club";
import {
  assignGoalScorers,
  buildGoalTimeline,
  calculateTeamStrength,
  simulateExtraTimeScore,
  simulateMatch,
  simulatePenaltyShootout,
} from "@/engine/match";
import { getPlayersByClub, tickRegistrationAfterMatch } from "@/engine/player";
import { buildDefaultSquad } from "@/engine/squad";
import { createRng } from "@/data/name-generator";
import { shuffleInPlace } from "@/engine/rng";
import {
  fixtureHasHumanClub,
  resetLocalManagerTurn,
} from "@/engine/local-play";
import {
  registerCoachMatchResultForClub,
  registerCoachTitleForClub,
} from "@/engine/coach";

/** 64 clubes: divisões 1–4 + distrital. */
export function getCupParticipantIds(clubs: Club[]): number[] {
  return clubs
    .filter(
      (c) =>
        c.division <= NATIONAL_DIVISION_COUNT ||
        c.division === DISTRITAL_DIVISION
    )
    .map((c) => c.id);
}

export function createCupState(clubs: Club[], season: number): CupState {
  const participantIds = getCupParticipantIds(clubs);
  return {
    season,
    participantIds: [...participantIds],
    remainingClubIds: [...participantIds],
    ties: [],
    championClubId: null,
    finalistsClubIds: null,
    nextTieId: 1,
    pendingHumanTieId: null,
    processedGates: [],
  };
}

export function migrateCupState(state: GameState): CupState | null {
  if (state.cup) {
    const participantIds =
      state.cup.participantIds.length > 0
        ? state.cup.participantIds
        : getCupParticipantIds(state.clubs);
    return {
      ...state.cup,
      participantIds,
      remainingClubIds:
        state.cup.remainingClubIds.length > 0
          ? state.cup.remainingClubIds
          : [...participantIds],
      processedGates: state.cup.processedGates ?? [],
      finalistsClubIds: state.cup.finalistsClubIds ?? null,
      pendingHumanTieId: state.cup.pendingHumanTieId ?? null,
    };
  }
  const ids = getCupParticipantIds(state.clubs);
  if (ids.length === 0) return null;
  return createCupState(state.clubs, state.season);
}

export function isCupLeagueGate(leagueRound: number): boolean {
  return (CUP_LEAGUE_GATES as readonly number[]).includes(leagueRound);
}

export function getCupPhaseName(leagueRound: number): string {
  return CUP_PHASE_NAMES[leagueRound] ?? "Copa Geral";
}

/** Rótulo exibido no painel para a fase da copa em andamento. */
export function getCupRoundLabel(leagueRoundGate: number): string {
  const labels: Record<number, string> = {
    2: "Rodada 1 da copa — 64 times",
    4: "Rodada 2 da copa — 32 times",
    6: "Oitavas de final da copa — 16 times",
    8: "Quartas de final da copa — 8 times",
    10: "Semifinal da copa — 4 times",
    12: "Sorteio da final da copa",
    14: "Final da copa — 2 times",
  };
  return labels[leagueRoundGate] ?? getCupPhaseName(leagueRoundGate);
}

export function drawCupTies(
  teamIds: number[],
  leagueRoundGate: number,
  nextTieId: number,
  rng: () => number
): { ties: CupTie[]; nextId: number } {
  const shuffled = [...teamIds];
  shuffleInPlace(shuffled, rng);

  const ties: CupTie[] = [];
  let id = nextTieId;

  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    const a = shuffled[i]!;
    const b = shuffled[i + 1]!;
    const homeFirst = rng() < 0.5;
    ties.push({
      id: id++,
      leagueRoundGate,
      homeClubId: homeFirst ? a : b,
      awayClubId: homeFirst ? b : a,
      played: false,
      homeGoals: null,
      awayGoals: null,
      winnerClubId: null,
    });
  }

  return { ties, nextId: id };
}

export function getCupTiesForLeagueRound(
  cup: CupState,
  leagueRound: number
): CupTie[] {
  return cup.ties.filter((t) => t.leagueRoundGate === leagueRound);
}

export function getPendingHumanCupTie(
  state: GameState,
  clubId: number = state.humanClubId
): CupTie | null {
  if (!state.cup) return null;
  return (
    state.cup.ties.find(
      (t) =>
        !t.played &&
        (t.homeClubId === clubId || t.awayClubId === clubId)
    ) ?? null
  );
}

export function hasPendingHumanCupTies(state: GameState): boolean {
  if (!state.cup) return false;
  return state.cup.ties.some(
    (t) =>
      !t.played &&
      fixtureHasHumanClub(state, t.homeClubId, t.awayClubId)
  );
}

function clubName(state: GameState, clubId: number): string {
  return state.clubs.find((c) => c.id === clubId)?.name ?? "?";
}

function simulateCupTieResult(
  state: GameState,
  tie: CupTie,
  _rng: () => number
): { tie: CupTie; messages: string[] } {
  const homeClub = state.clubs.find((c) => c.id === tie.homeClubId)!;
  const awayClub = state.clubs.find((c) => c.id === tie.awayClubId)!;
  const seed =
    state.season * 5000 + tie.id * 13 + getGameSeed(state);

  const homePlayers = getPlayersByClub(state.players, homeClub.id);
  const awayPlayers = getPlayersByClub(state.players, awayClub.id);
  const homeLineupIds = buildDefaultSquad(homePlayers).lineupIds;
  const awayLineupIds = buildDefaultSquad(awayPlayers).lineupIds;
  const homeLineup = homeLineupIds
    .map((id) => homePlayers.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const awayLineup = awayLineupIds
    .map((id) => awayPlayers.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const result = simulateMatch(
    tie.id,
    homeClub,
    awayClub,
    homePlayers,
    awayPlayers,
    seed,
    homeLineupIds,
    awayLineupIds,
    false,
    0,
    0
  );

  let finalHomeGoals = result.homeGoals;
  let finalAwayGoals = result.awayGoals;
  let winnerId: number;
  let resolution = "";

  const goalRng = createRng(seed + 1000);
  const goalEvents = buildGoalTimeline(
    result.homeGoals,
    result.awayGoals,
    homeLineup,
    awayLineup,
    goalRng
  );

  if (result.homeGoals === result.awayGoals) {
    const extra = simulateExtraTimeScore(
      tie.id,
      homeClub,
      awayClub,
      homePlayers,
      awayPlayers,
      seed,
      homeLineupIds,
      awayLineupIds
    );
    finalHomeGoals += extra.homeGoals;
    finalAwayGoals += extra.awayGoals;
    resolution = " (após prorrogação)";
    goalEvents.push(
      ...buildGoalTimeline(
        extra.homeGoals,
        extra.awayGoals,
        homeLineup,
        awayLineup,
        createRng(seed + 2000),
        91,
        120
      )
    );

    if (finalHomeGoals === finalAwayGoals) {
      const shootout = simulatePenaltyShootout(
        homePlayers,
        awayPlayers,
        homeLineupIds,
        awayLineupIds,
        seed + 77
      );
      winnerId = shootout.winnerTeam === "home" ? tie.homeClubId : tie.awayClubId;
      resolution = ` (prorrogação e pênaltis ${shootout.homeGoals}-${shootout.awayGoals})`;
    } else {
      winnerId = finalHomeGoals > finalAwayGoals ? tie.homeClubId : tie.awayClubId;
    }
  } else {
    winnerId = finalHomeGoals > finalAwayGoals ? tie.homeClubId : tie.awayClubId;
  }

  assignGoalScorers(state.players, goalEvents);

  const homeStrength = calculateTeamStrength(
    homeClub,
    homePlayers,
    true,
    homeLineupIds,
    false
  );
  const awayStrength = calculateTeamStrength(
    awayClub,
    awayPlayers,
    false,
    awayLineupIds,
    false
  );
  applyMatchMorale(
    homeClub,
    finalHomeGoals,
    finalAwayGoals,
    homeStrength,
    awayStrength,
    {
      competition: "cup",
      ownDivision: homeClub.division,
      opponentDivision: awayClub.division,
    }
  );
  applyMatchMorale(
    awayClub,
    finalAwayGoals,
    finalHomeGoals,
    awayStrength,
    homeStrength,
    {
      competition: "cup",
      ownDivision: awayClub.division,
      opponentDivision: homeClub.division,
    }
  );
  registerCoachMatchResultForClub(
    state,
    homeClub.id,
    finalHomeGoals,
    finalAwayGoals
  );
  registerCoachMatchResultForClub(
    state,
    awayClub.id,
    finalAwayGoals,
    finalHomeGoals
  );

  tickRegistrationAfterMatch(
    state.players,
    [tie.homeClubId, tie.awayClubId]
  );

  const phase = getCupPhaseName(tie.leagueRoundGate);
  const messages = [
    `Copa (${phase}): ${homeClub.name} ${finalHomeGoals} x ${finalAwayGoals} ${awayClub.name}${resolution}`,
  ];

  return {
    tie: {
      ...tie,
      played: true,
      homeGoals: finalHomeGoals,
      awayGoals: finalAwayGoals,
      winnerClubId: winnerId,
    },
    messages,
  };
}

function gateAlreadyProcessed(cup: CupState, gate: number): boolean {
  return cup.processedGates.includes(gate);
}

function markGateProcessed(cup: CupState, gate: number): CupState {
  if (gateAlreadyProcessed(cup, gate)) return cup;
  return { ...cup, processedGates: [...cup.processedGates, gate] };
}

function applyTieResultsToCup(
  cup: CupState,
  gate: number,
  updatedTies: CupTie[],
  messages: string[]
): { cup: CupState; messages: string[] } {
  const gateTies = updatedTies.filter((t) => t.leagueRoundGate === gate);
  const winners = gateTies
    .filter((t) => t.played && t.winnerClubId !== null)
    .map((t) => t.winnerClubId!);

  const allPlayed = gateTies.length > 0 && gateTies.every((t) => t.played);
  if (!allPlayed) {
    return {
      cup: { ...cup, ties: updatedTies },
      messages,
    };
  }

  let nextCup: CupState = {
    ...cup,
    ties: updatedTies,
    pendingHumanTieId: null,
    remainingClubIds: winners,
  };

  if (winners.length === 2) {
    nextCup.finalistsClubIds = [...winners];
  }

  nextCup = markGateProcessed(nextCup, gate);
  return { cup: nextCup, messages };
}

function playFinalTie(
  state: GameState,
  cup: CupState,
  finalTie: CupTie,
  rng: () => number,
  simulateHuman: boolean
): GameState {
  const messages = [...state.messages];
  const clubs = state.clubs.map((c) => ({ ...c }));

  const isHuman =
    fixtureHasHumanClub(state, finalTie.homeClubId, finalTie.awayClubId);

  if (isHuman && !simulateHuman) {
    return resetLocalManagerTurn({
      ...state,
      clubs,
      cup: {
        ...cup,
        ties: [...cup.ties.filter((t) => t.id !== finalTie.id), finalTie],
        pendingHumanTieId: finalTie.id,
      },
      messages: [
        ...messages,
        `Final da Copa: ${clubName(state, finalTie.homeClubId)} x ${clubName(state, finalTie.awayClubId)} — aguardando jogo.`,
      ],
    });
  }

  const result = simulateCupTieResult({ ...state, clubs }, finalTie, rng);
  const champion = clubs.find((c) => c.id === result.tie.winnerClubId);
  if (champion) {
    messages.push(...result.messages);
    messages.push(`${champion.name} campeão da Copa Geral!`);
    registerCoachTitleForClub(state, champion.id);
  }

  const nextCup = markGateProcessed(
    {
      ...cup,
      ties: [...cup.ties.filter((t) => t.id !== finalTie.id), result.tie],
      remainingClubIds: [],
      championClubId: result.tie.winnerClubId,
      pendingHumanTieId: null,
    },
    CUP_FINAL_LEAGUE_ROUND
  );

  return { ...state, clubs, cup: nextCup, messages };
}

function drawFinalForRound14(
  state: GameState,
  cup: CupState,
  remaining: number[],
  rng: () => number
): { cup: CupState; messages: string[] } {
  const homeFirst = rng() < 0.5;
  const homeId = homeFirst ? remaining[0]! : remaining[1]!;
  const awayId = homeFirst ? remaining[1]! : remaining[0]!;

  const finalTie: CupTie = {
    id: cup.nextTieId++,
    leagueRoundGate: CUP_FINAL_LEAGUE_ROUND,
    homeClubId: homeId,
    awayClubId: awayId,
    played: false,
    homeGoals: null,
    awayGoals: null,
    winnerClubId: null,
  };

  const messages = [
    ...state.messages,
    `Copa (Sorteio da final): ${clubName(state, homeId)} x ${clubName(state, awayId)} — mando: ${clubName(state, homeId)}. Decisão na rodada ${CUP_FINAL_LEAGUE_ROUND}.`,
  ];

  const nextCup = markGateProcessed(
    {
      ...cup,
      ties: [...cup.ties, finalTie],
      finalistsClubIds: [...remaining],
    },
    12
  );

  return { cup: nextCup, messages };
}

export function processCupAfterLeagueRound(
  state: GameState,
  playedRound: number,
  options: { simulateHuman?: boolean } = {}
): GameState {
  if (!state.cup || state.cup.championClubId) return state;
  if (!isCupLeagueGate(playedRound)) return state;
  if (gateAlreadyProcessed(state.cup, playedRound)) return state;

  const rng = createRng(
    state.season * 9000 + playedRound * 31 + getGameSeed(state)
  );

  let cup = { ...state.cup, ties: [...state.cup.ties] };
  const messages = [...state.messages];
  const clubs = state.clubs.map((c) => ({ ...c }));
  const remaining = [...cup.remainingClubIds];

  if (playedRound === CUP_FINAL_LEAGUE_ROUND) {
    let finalTie = cup.ties.find(
      (t) => t.leagueRoundGate === CUP_FINAL_LEAGUE_ROUND && !t.played
    );

    const finalists = cup.finalistsClubIds ?? remaining;
    if (!finalTie && finalists.length === 2) {
      const homeFirst = rng() < 0.5;
      finalTie = {
        id: cup.nextTieId++,
        leagueRoundGate: CUP_FINAL_LEAGUE_ROUND,
        homeClubId: homeFirst ? finalists[0]! : finalists[1]!,
        awayClubId: homeFirst ? finalists[1]! : finalists[0]!,
        played: false,
        homeGoals: null,
        awayGoals: null,
        winnerClubId: null,
      };
      cup.ties.push(finalTie);
    }

    if (!finalTie || finalists.length !== 2) {
      cup = markGateProcessed(cup, playedRound);
      return { ...state, cup, messages };
    }

    return playFinalTie(
      state,
      cup,
      finalTie,
      rng,
      options.simulateHuman ?? false
    );
  }

  if (playedRound === 12) {
    if (remaining.length !== 2) {
      messages.push(
        `Copa: esperados 2 finalistas na rodada 12 (há ${remaining.length}).`
      );
      cup = markGateProcessed(cup, playedRound);
      return { ...state, cup, messages };
    }

    const drawn = drawFinalForRound14(state, cup, remaining, rng);
    return { ...state, cup: drawn.cup, messages: drawn.messages };
  }

  if (remaining.length <= 2) {
    cup = markGateProcessed(cup, playedRound);
    return { ...state, cup, messages };
  }

  if (remaining.length % 2 !== 0) {
    messages.push(
      `Copa: número ímpar de classificados (${remaining.length}). Esperado ${CUP_TEAM_COUNT} participantes.`
    );
    cup = markGateProcessed(cup, playedRound);
    return { ...state, cup, messages };
  }

  const phase = getCupPhaseName(playedRound);
  messages.push(`Copa (${phase}): sorteio puro — ${remaining.length} clubes.`);

  const { ties: newTies, nextId } = drawCupTies(
    remaining,
    playedRound,
    cup.nextTieId,
    rng
  );
  cup.nextTieId = nextId;

  const humanTie = newTies.find((t) =>
    fixtureHasHumanClub(state, t.homeClubId, t.awayClubId)
  );

  if (humanTie && !options.simulateHuman) {
    cup.ties = [...cup.ties, ...newTies];
    cup.pendingHumanTieId = humanTie.id;
    messages.push(
      `Copa: ${clubName(state, humanTie.homeClubId)} x ${clubName(state, humanTie.awayClubId)} — aguardando no painel.`
    );
    return resetLocalManagerTurn({ ...state, clubs, cup, messages });
  }

  const updatedTies = [...cup.ties];
  let pendingHumanTieId: number | null = null;

  for (const tie of newTies) {
    const isHuman = fixtureHasHumanClub(state, tie.homeClubId, tie.awayClubId);

    if (isHuman && !options.simulateHuman) {
      updatedTies.push(tie);
      pendingHumanTieId ??= tie.id;
      messages.push(
        `Copa: ${clubName(state, tie.homeClubId)} x ${clubName(state, tie.awayClubId)} — aguardando escalação.`
      );
      continue;
    }

    const result = simulateCupTieResult({ ...state, clubs }, tie, rng);
    updatedTies.push(result.tie);
    messages.push(...result.messages);
  }

  cup.ties = updatedTies;
  cup.pendingHumanTieId = pendingHumanTieId;

  if (pendingHumanTieId !== null) {
    return resetLocalManagerTurn({ ...state, clubs, cup, messages });
  }

  const applied = applyTieResultsToCup(cup, playedRound, updatedTies, messages);
  return { ...state, clubs, cup: applied.cup, messages: applied.messages };
}

export function completeHumanCupTie(
  state: GameState,
  tieId: number,
  homeGoals: number,
  awayGoals: number,
  options: {
    winnerClubId?: number;
    shootout?: { homeGoals: number; awayGoals: number } | null;
  } = {}
): GameState {
  if (!state.cup) return state;

  const tie = state.cup.ties.find((t) => t.id === tieId && !t.played);
  if (!tie) return state;

  let winnerId: number;
  if (options.winnerClubId != null) {
    winnerId = options.winnerClubId;
  } else if (homeGoals > awayGoals) {
    winnerId = tie.homeClubId;
  } else if (awayGoals > homeGoals) {
    winnerId = tie.awayClubId;
  } else {
    const shootout = options.shootout;
    if (shootout) {
      winnerId = shootout.homeGoals > shootout.awayGoals ? tie.homeClubId : tie.awayClubId;
    } else {
      const rng = createRng(state.season * 6000 + tieId + getGameSeed(state));
      winnerId = rng() < 0.5 ? tie.homeClubId : tie.awayClubId;
    }
  }

  const homeClub = state.clubs.find((c) => c.id === tie.homeClubId)!;
  const awayClub = state.clubs.find((c) => c.id === tie.awayClubId)!;
  const homePlayers = getPlayersByClub(state.players, homeClub.id);
  const awayPlayers = getPlayersByClub(state.players, awayClub.id);
  const homeLineupIds = buildDefaultSquad(homePlayers).lineupIds;
  const awayLineupIds = buildDefaultSquad(awayPlayers).lineupIds;
  const homeStrength = calculateTeamStrength(
    homeClub,
    homePlayers,
    true,
    homeLineupIds,
    false
  );
  const awayStrength = calculateTeamStrength(
    awayClub,
    awayPlayers,
    false,
    awayLineupIds,
    false
  );
  applyMatchMorale(homeClub, homeGoals, awayGoals, homeStrength, awayStrength, {
    competition: "cup",
    ownDivision: homeClub.division,
    opponentDivision: awayClub.division,
  });
  applyMatchMorale(awayClub, awayGoals, homeGoals, awayStrength, homeStrength, {
    competition: "cup",
    ownDivision: awayClub.division,
    opponentDivision: homeClub.division,
  });
  registerCoachMatchResultForClub(state, homeClub.id, homeGoals, awayGoals);
  registerCoachMatchResultForClub(state, awayClub.id, awayGoals, homeGoals);
  tickRegistrationAfterMatch(
    state.players,
    [tie.homeClubId, tie.awayClubId]
  );

  const updatedTie: CupTie = {
    ...tie,
    played: true,
    homeGoals,
    awayGoals,
    winnerClubId: winnerId,
  };

  const updatedTies = state.cup.ties.map((t) =>
    t.id === tieId ? updatedTie : t
  );

  const phase = getCupPhaseName(tie.leagueRoundGate);
  const shootoutSuffix = options.shootout
    ? ` (pênaltis ${options.shootout.homeGoals}-${options.shootout.awayGoals})`
    : "";
  const messages = [
    ...state.messages,
    `Copa (${phase}): ${homeClub.name} ${homeGoals} x ${awayGoals} ${awayClub.name}${shootoutSuffix}`,
  ];

  let cup: CupState = {
    ...state.cup,
    ties: updatedTies,
    pendingHumanTieId: null,
  };

  const gate = tie.leagueRoundGate;
  const gateTies = updatedTies.filter((t) => t.leagueRoundGate === gate);
  const allPlayed = gateTies.every((t) => t.played);

  if (!allPlayed) {
    return { ...state, cup, messages };
  }

  if (gate === CUP_FINAL_LEAGUE_ROUND) {
    const clubs = state.clubs.map((c) => ({ ...c }));
    const champion = clubs.find((c) => c.id === winnerId);
    if (champion) {
      messages.push(`${champion.name} campeão da Copa Geral!`);
      registerCoachTitleForClub(state, champion.id);
    }
    cup = markGateProcessed(
      {
        ...cup,
        remainingClubIds: [],
        championClubId: winnerId,
      },
      gate
    );
    return { ...state, clubs, cup, messages };
  }

  const winners = gateTies
    .map((t) => t.winnerClubId)
    .filter((id): id is number => id !== null);

  cup = {
    ...cup,
    remainingClubIds: winners,
  };
  cup = markGateProcessed(cup, gate);
  if (winners.length === 2) {
    cup.finalistsClubIds = [...winners];
  }

  return { ...state, cup, messages };
}

export function cupBlocksSeasonEnd(state: GameState): boolean {
  if (!state.cup) return false;
  if (state.cup.championClubId) return false;
  if (state.cup.pendingHumanTieId) return true;
  if (hasPendingHumanCupTies(state)) return true;
  if (
    state.round >= CUP_FINAL_LEAGUE_ROUND &&
    !gateAlreadyProcessed(state.cup, CUP_FINAL_LEAGUE_ROUND)
  ) {
    return true;
  }
  return false;
}

export function getCupBracketSummary(state: GameState): {
  remaining: number;
  champion: string | null;
  finalists: string[];
  nextPhase: string | null;
} {
  if (!state.cup) {
    return { remaining: 0, champion: null, finalists: [], nextPhase: null };
  }
  const champion = state.cup.championClubId
    ? clubName(state, state.cup.championClubId)
    : null;
  const finalists = (state.cup.finalistsClubIds ?? []).map((id) =>
    clubName(state, id)
  );
  const nextGate = CUP_LEAGUE_GATES.find(
    (g) => !state.cup!.processedGates.includes(g)
  );
  return {
    remaining: state.cup.remainingClubIds.length,
    champion,
    finalists,
    nextPhase: nextGate ? getCupPhaseName(nextGate) : null,
  };
}
