import type {
  Club,
  Fixture,
  GameState,
  Standing,
} from "@/engine/types";
import {
  DISTRITAL_DIVISION,
  NATIONAL_DIVISION_COUNT,
  getGameSeed,
  PROMOTION_SPOTS,
  RELEGATION_SPOTS,
} from "@/engine/types";
import {
  applyTablePressureMorale,
  applyMatchMorale,
  createStandings,
  getClubsByDivision,
  getStandingPosition,
  sortStandings,
  updateStanding,
} from "@/engine/club";
import {
  getPlayersByClub,
  resetRoundSkillVariation,
  tickRegistrationAfterMatch,
} from "@/engine/player";
import {
  assignGoalScorers,
  buildGoalTimeline,
  calculateTeamStrength,
  simulateMatch,
} from "@/engine/match";
import {
  applyDisciplineAfterMatch,
  generateMatchCardEvents,
  tickSuspensionsAfterRound,
} from "@/engine/cards";
import {
  appendMatchInjuries,
  applyInjuriesAfterMatch,
  tickInjuriesAfterMatch,
} from "@/engine/injuries";
import { buildDefaultSquad } from "@/engine/squad";
import { recordPlayersMatchHistory } from "@/engine/player-history";
import { applyPostRoundFinances } from "@/engine/finances";
import { createRng } from "@/data/name-generator";
import {
  cupBlocksSeasonEnd,
  processCupAfterLeagueRound,
} from "@/engine/cup";
import {
  processMidSeasonCoaches,
  registerCoachMatchResultForClub,
  registerCoachTitleForClub,
} from "@/engine/coach";
import { processLeagueSeasonClose } from "@/engine/season-end";

function roundRobinPairs(ids: number[]): [number, number][][] {
  const n = ids.length;
  const isOdd = n % 2 !== 0;
  const teams = isOdd ? [...ids, -1] : [...ids];
  const rounds: [number, number][][] = [];
  const count = teams.length;

  for (let round = 0; round < count - 1; round++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < count / 2; i++) {
      const home = teams[i];
      const away = teams[count - 1 - i];
      if (home !== -1 && away !== -1) {
        pairs.push(round % 2 === 0 ? [home, away] : [away, home]);
      }
    }
    rounds.push(pairs);
    const fixed = teams[0];
    const rotated = [fixed, teams[count - 1], ...teams.slice(1, count - 1)];
    teams.splice(0, teams.length, ...rotated);
  }

  return rounds;
}

export function generateFixtures(clubs: Club[]): Fixture[] {
  const fixtures: Fixture[] = [];
  let id = 1;
  const nationalClubs = clubs.filter((c) => c.division <= NATIONAL_DIVISION_COUNT);
  const divisions = [...new Set(nationalClubs.map((c) => c.division))].sort();

  for (const division of divisions) {
    const divClubs = getClubsByDivision(clubs, division);
    const ids = divClubs.map((c) => c.id);
    const firstLeg = roundRobinPairs(ids);
    const secondLeg = firstLeg.map((round) =>
      round.map(([h, a]) => [a, h] as [number, number])
    );
    const allRounds = [...firstLeg, ...secondLeg];

    allRounds.forEach((pairs, roundIndex) => {
      for (const [homeClubId, awayClubId] of pairs) {
        fixtures.push({
          id: id++,
          round: roundIndex + 1,
          division,
          homeClubId,
          awayClubId,
          played: false,
          homeGoals: null,
          awayGoals: null,
        });
      }
    });
  }

  return fixtures;
}

export function getTotalRounds(fixtures: Fixture[]): number {
  return fixtures.reduce((max, f) => Math.max(max, f.round), 0);
}

export function getFixturesForRound(
  fixtures: Fixture[],
  round: number
): Fixture[] {
  return fixtures.filter((f) => f.round === round && !f.played);
}

export function getNextHumanFixture(state: GameState): Fixture | null {
  if (!state.isLocalMultiplayer && state.coach.currentClubId === null) {
    return null;
  }

  const humanClub = state.clubs.find((c) => c.id === state.humanClubId);
  if (!humanClub || humanClub.division === DISTRITAL_DIVISION) return null;

  const currentRound = state.fixtures.find(
    (f) =>
      !f.played &&
      f.round === state.round &&
      (f.homeClubId === state.humanClubId ||
        f.awayClubId === state.humanClubId)
  );
  if (currentRound) return currentRound;

  return (
    state.fixtures
      .filter(
        (f) =>
          !f.played &&
          (f.homeClubId === state.humanClubId ||
            f.awayClubId === state.humanClubId)
      )
      .sort((a, b) => a.round - b.round)[0] ?? null
  );
}

export function playFixture(
  state: GameState,
  fixture: Fixture
): GameState {
  const homeClub = state.clubs.find((c) => c.id === fixture.homeClubId)!;
  const awayClub = state.clubs.find((c) => c.id === fixture.awayClubId)!;
  const homePlayers = getPlayersByClub(state.players, homeClub.id);
  const awayPlayers = getPlayersByClub(state.players, awayClub.id);

  const homeManager = state.localManagers.find((m) => m.clubId === homeClub.id);
  const awayManager = state.localManagers.find((m) => m.clubId === awayClub.id);
  let homeLineupIds =
    homeManager && homeManager.lineupPlayerIds.length > 0
      ? homeManager.lineupPlayerIds
      : homeClub.id === state.humanClubId && state.lineupPlayerIds.length > 0
        ? state.lineupPlayerIds
        : buildDefaultSquad(homePlayers).lineupIds;
  let awayLineupIds =
    awayManager && awayManager.lineupPlayerIds.length > 0
      ? awayManager.lineupPlayerIds
      : awayClub.id === state.humanClubId && state.lineupPlayerIds.length > 0
        ? state.lineupPlayerIds
        : buildDefaultSquad(awayPlayers).lineupIds;

  const homeLineup = homeLineupIds
    .map((id) => homePlayers.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const awayLineup = awayLineupIds
    .map((id) => awayPlayers.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const seed =
    state.season * 10000 + fixture.id + getGameSeed(state);
  const rng = createRng(seed);

  const homeCards = generateMatchCardEvents(homeLineup, "home", seed + 100, 1, 90);
  const awayCards = generateMatchCardEvents(awayLineup, "away", seed + 200, 1, 90);
  const homeExp = homeCards.events.filter((e) => e.type === "red").length;
  const awayExp = awayCards.events.filter((e) => e.type === "red").length;

  const injuryPlan = appendMatchInjuries(
    state.players,
    {
      fixtureId: fixture.id,
      division: fixture.division,
      homeClubId: fixture.homeClubId,
      awayClubId: fixture.awayClubId,
      homeName: homeClub.name,
      awayName: awayClub.name,
      isHumanMatch: false,
      competition: "league",
      events: [],
      cardEvents: [],
      finalHomeGoals: 0,
      finalAwayGoals: 0,
      secondHalfPending: false,
      homeLineupIds,
      awayLineupIds,
    },
    homeLineup,
    awayLineup,
    seed,
    1,
    90
  );
  homeLineupIds = injuryPlan.homeLineupIds;
  awayLineupIds = injuryPlan.awayLineupIds;
  const injuryEvents = injuryPlan.injuryEvents ?? [];

  const result = simulateMatch(
    fixture.id,
    homeClub,
    awayClub,
    homePlayers,
    awayPlayers,
    seed,
    homeLineupIds,
    awayLineupIds,
    true,
    homeExp,
    awayExp
  );

  const goalEvents = buildGoalTimeline(
    result.homeGoals,
    result.awayGoals,
    homeLineup,
    awayLineup,
    rng
  );
  assignGoalScorers(state.players, goalEvents);

  recordPlayersMatchHistory(
    state.players,
    {
      fixtureId: fixture.id,
      division: fixture.division,
      homeClubId: fixture.homeClubId,
      awayClubId: fixture.awayClubId,
      homeName: homeClub.name,
      awayName: awayClub.name,
      isHumanMatch: false,
      competition: "league",
      events: goalEvents,
      cardEvents: [...homeCards.events, ...awayCards.events],
      injuryEvents,
      finalHomeGoals: result.homeGoals,
      finalAwayGoals: result.awayGoals,
      secondHalfPending: false,
      homeLineupIds,
      awayLineupIds,
    },
    state,
    fixture.round
  );

  const disciplineRecords = [...homeCards.records, ...awayCards.records];
  const discipline = applyDisciplineAfterMatch(state.players, disciplineRecords);
  tickSuspensionsAfterRound(
    state.players,
    [homeClub.id, awayClub.id],
    discipline.newlySuspended
  );

  const injuries = applyInjuriesAfterMatch(state.players, injuryEvents);
  if (injuries.messages.length > 0) {
    state.messages.push(...injuries.messages);
  }
  tickInjuriesAfterMatch(
    state.players,
    [homeClub.id, awayClub.id],
    injuries.newlyInjured
  );
  tickRegistrationAfterMatch(state.players, [homeClub.id, awayClub.id]);

  fixture.played = true;
  fixture.homeGoals = result.homeGoals;
  fixture.awayGoals = result.awayGoals;

  const divStandings = state.standings.filter((s) => {
    const club = state.clubs.find((c) => c.id === s.clubId)!;
    return club.division === fixture.division;
  });

  updateStanding(divStandings, homeClub.id, result.homeGoals, result.awayGoals);
  updateStanding(divStandings, awayClub.id, result.awayGoals, result.homeGoals);

  const homeStrength = calculateTeamStrength(
    homeClub,
    homePlayers,
    true,
    homeLineupIds,
    true,
    homeExp
  );
  const awayStrength = calculateTeamStrength(
    awayClub,
    awayPlayers,
    false,
    awayLineupIds,
    false,
    awayExp
  );

  const messages = [
    ...applyMatchMorale(
      homeClub,
      result.homeGoals,
      result.awayGoals,
      homeStrength,
      awayStrength,
      {
        competition: "league",
        ownDivision: homeClub.division,
        opponentDivision: awayClub.division,
      }
    ),
    ...applyMatchMorale(
      awayClub,
      result.awayGoals,
      result.homeGoals,
      awayStrength,
      homeStrength,
      {
        competition: "league",
        ownDivision: awayClub.division,
        opponentDivision: homeClub.division,
      }
    ),
    ...discipline.messages,
  ];

  return {
    ...state,
    messages: [
      ...state.messages,
      `${homeClub.name} ${result.homeGoals} x ${result.awayGoals} ${awayClub.name}`,
      ...messages,
    ],
  };
}

export function playRound(state: GameState): GameState {
  let current = state;
  resetRoundSkillVariation(current.players);
  const roundFixtures = getFixturesForRound(current.fixtures, current.round);

  for (const fixture of roundFixtures) {
    current = playFixture(current, fixture);
    if (fixture.homeGoals != null && fixture.awayGoals != null) {
      registerCoachMatchResultForClub(
        current,
        fixture.homeClubId,
        fixture.homeGoals,
        fixture.awayGoals
      );
      registerCoachMatchResultForClub(
        current,
        fixture.awayClubId,
        fixture.awayGoals,
        fixture.homeGoals
      );
    }
  }

  const allPlayed = roundFixtures.every((f) => f.played);
  const playedRound = current.round;
  const nextRound = allPlayed ? current.round + 1 : current.round;
  const seasonDone = nextRound > current.totalRounds;

  if (allPlayed) {
    const homeClubIds = roundFixtures.map((f) => f.homeClubId);
    const previousChampion = current.cup?.championClubId ?? null;
    current = applyPostRoundFinances(current, playedRound, homeClubIds);
    if (seasonDone && !current.leagueSeasonProcessed) {
      current = processLeagueSeasonClose(current);
    }
    current = processCupAfterLeagueRound(current, playedRound, {
      simulateHuman: true,
    });
    applyTablePressureMorale(current.clubs, current.standings);
    if (
      current.coach.currentClubId !== null &&
      previousChampion == null &&
      current.cup?.championClubId === current.humanClubId
    ) {
      registerCoachTitleForClub(current, current.humanClubId);
      current.messages.push("Título conquistado na Copa Geral.");
    }
    current = processMidSeasonCoaches(current, roundFixtures);
  }

  const canEndSeason = seasonDone && !cupBlocksSeasonEnd(current);

  return {
    ...current,
    round: seasonDone ? current.round : nextRound,
    phase: canEndSeason ? "ended" : "regular",
    nextFixtureId: getNextHumanFixture(current)?.id ?? null,
  };
}

export interface PromotionResult {
  promoted: { clubId: number; from: number; to: number }[];
  relegated: { clubId: number; from: number; to: number }[];
  distritalPromoted: { clubId: number }[];
}

export const PRIZE_DIVISION_CHAMPION: Record<number, number> = {
  1: 20_000_000,
  2: 5_000_000,
  3: 2_500_000,
  4: 1_500_000,
};
export const PRIZE_CUP_CHAMPION = 10_000_000;
export const PRIZE_TOP_SCORER_CLUB = 3_000_000;

export function applySeasonPrizes(state: GameState): GameState {
  const messages = [...state.messages];
  const clubs = state.clubs.map((c) => ({ ...c }));
  const awards: {
    competition: string;
    clubId: number;
    clubName: string;
    amount: number;
  }[] = [];

  const awardDivisionChampion = (division: 1 | 2 | 3 | 4) => {
    const divisionStandings = getDivisionStandings({ ...state, clubs }, division);
    if (divisionStandings.length === 0) return;
    const championId = divisionStandings[0]!.clubId;
    const champion = clubs.find((c) => c.id === championId);
    const prize = PRIZE_DIVISION_CHAMPION[division];
    if (!champion || !prize) return;
    champion.finances += prize;
    awards.push({
      competition: `${division}ª divisão`,
      clubId: champion.id,
      clubName: champion.name,
      amount: prize,
    });
    messages.push(
      `${champion.name} campeão da ${division}ª divisão: +${prize.toLocaleString()}.`
    );
  };

  awardDivisionChampion(1);

  if (state.cup?.championClubId) {
    const champion = clubs.find((c) => c.id === state.cup!.championClubId);
    if (champion) {
      champion.finances += PRIZE_CUP_CHAMPION;
      awards.push({
        competition: "Copa Geral",
        clubId: champion.id,
        clubName: champion.name,
        amount: PRIZE_CUP_CHAMPION,
      });
      messages.push(
        `${champion.name} campeão da Copa Geral: +${PRIZE_CUP_CHAMPION.toLocaleString()}.`
      );
    }
  }

  awardDivisionChampion(2);
  awardDivisionChampion(3);
  awardDivisionChampion(4);

  const topScorer = [...state.players]
    .filter((p) => p.seasonGoals > 0 && p.clubId > 0)
    .sort((a, b) => b.seasonGoals - a.seasonGoals || b.skill - a.skill)[0];

  if (topScorer) {
    const scorerClub = clubs.find((c) => c.id === topScorer.clubId);
    if (scorerClub) {
      scorerClub.finances += PRIZE_TOP_SCORER_CLUB;
      messages.push(
        `${scorerClub.name} artilheiro (${topScorer.name}, ${topScorer.seasonGoals} gols): +${PRIZE_TOP_SCORER_CLUB.toLocaleString()}.`
      );
    }
  }

  return {
    ...state,
    clubs,
    messages,
    seasonSummary: {
      season: state.season,
      awards,
      topScorer: topScorer
        ? {
            playerId: topScorer.id,
            playerName: topScorer.name,
            position: topScorer.position,
            goals: topScorer.seasonGoals,
            clubId: topScorer.clubId,
            clubName:
              clubs.find((c) => c.id === topScorer.clubId)?.name ?? "?",
            amount: PRIZE_TOP_SCORER_CLUB,
          }
        : null,
    },
  };
}

export function processPromotionRelegation(
  clubs: Club[],
  standings: Standing[],
  rng: () => number
): PromotionResult {
  const promoted: PromotionResult["promoted"] = [];
  const relegated: PromotionResult["relegated"] = [];
  const distritalPromoted: PromotionResult["distritalPromoted"] = [];
  const changes = new Map<number, number>();

  const oldDistritalIds = clubs
    .filter((c) => c.division === DISTRITAL_DIVISION)
    .map((c) => c.id);

  for (let div = 1; div <= NATIONAL_DIVISION_COUNT; div++) {
    const divClubs = clubs.filter((c) => c.division === div);
    const divStandings = standings.filter((s) =>
      divClubs.some((c) => c.id === s.clubId)
    );
    const sorted = sortStandings(divStandings, clubs);

    if (div > 1) {
      for (let i = 0; i < PROMOTION_SPOTS && i < sorted.length; i++) {
        const clubId = sorted[i]!.clubId;
        if (changes.has(clubId)) continue;
        promoted.push({ clubId, from: div, to: div - 1 });
        changes.set(clubId, div - 1);
      }
    }

    for (
      let i = sorted.length - 1;
      i >= sorted.length - RELEGATION_SPOTS && i >= 0;
      i--
    ) {
      const clubId = sorted[i]!.clubId;
      if (changes.has(clubId)) continue;
      const toDiv =
        div === NATIONAL_DIVISION_COUNT ? DISTRITAL_DIVISION : div + 1;
      relegated.push({ clubId, from: div, to: toDiv });
      changes.set(clubId, toDiv);
    }
  }

  const relegatedToDistritalIds = relegated
    .filter((r) => r.to === DISTRITAL_DIVISION)
    .map((r) => r.clubId);

  const distritalCandidates = oldDistritalIds.filter(
    (id) => !relegatedToDistritalIds.includes(id)
  );

  const slots = Math.min(
    PROMOTION_SPOTS,
    distritalCandidates.length,
    relegatedToDistritalIds.length
  );
  const shuffled = [...distritalCandidates].sort(() => rng() - 0.5);

  for (let i = 0; i < slots; i++) {
    const clubId = shuffled[i]!;
    promoted.push({
      clubId,
      from: DISTRITAL_DIVISION,
      to: NATIONAL_DIVISION_COUNT,
    });
    changes.set(clubId, NATIONAL_DIVISION_COUNT);
    distritalPromoted.push({ clubId });
  }

  for (const [clubId, newDiv] of changes) {
    const club = clubs.find((c) => c.id === clubId)!;
    club.division = newDiv as Club["division"];
  }

  return { promoted, relegated, distritalPromoted };
}

export function resetSeasonStandings(clubs: Club[]): Standing[] {
  return createStandings(clubs);
}

export function regenerateFixtures(clubs: Club[]): Fixture[] {
  return generateFixtures(clubs);
}

export function getDivisionStandings(
  state: GameState,
  division: number
): Standing[] {
  const divClubs = getClubsByDivision(state.clubs, division);
  const divStandings = state.standings.filter((s) =>
    divClubs.some((c) => c.id === s.clubId)
  );
  return sortStandings(divStandings, state.clubs);
}

export function getHumanStandingPosition(state: GameState): number {
  const humanClub = state.clubs.find((c) => c.id === state.humanClubId)!;
  const divStandings = getDivisionStandings(state, humanClub.division);
  return getStandingPosition(divStandings, state.clubs, state.humanClubId);
}

export function getDivisionsCount(_clubs: Club[]): number {
  return NATIONAL_DIVISION_COUNT;
}
