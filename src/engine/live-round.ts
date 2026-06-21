import type {
  Fixture,
  GameState,
  LiveMatchPlan,
  MatchDisciplineRecord,
  PenaltyChanceEvent,
  PenaltyShootoutSummary,
  Player,
} from "@/engine/types";
import type { CupTie } from "@/engine/types";
import { getGameSeed } from "@/engine/types";
import { getFixturesForRound, getNextHumanFixture } from "@/engine/league";
import { getPlayersByClub, tickRegistrationAfterMatch } from "@/engine/player";
import {
  assignGoalScorers,
  buildGoalTimeline,
  calculateTeamStrength,
  resolvePenaltyKick,
  simulateExtraTimeScore,
  simulateHalfMatch,
  simulateMatch,
  simulatePenaltyShootout,
} from "@/engine/match";
import {
  applyDisciplineAfterMatch,
  disciplineRecordsFromCardEvents,
  generateMatchCardEvents,
  tickSuspensionsAfterRound,
} from "@/engine/cards";
import {
  appendMatchInjuries,
  applyInjuriesAfterMatch,
  tickInjuriesAfterMatch,
} from "@/engine/injuries";
import { createRng } from "@/data/name-generator";
import { formatPlayerNameWithStar } from "@/engine/stars";
import {
  applyTablePressureMorale,
  applyMatchMorale,
  updateStanding,
} from "@/engine/club";
import { recordPlayersMatchHistory } from "@/engine/player-history";
import { applyPostRoundFinances } from "@/engine/finances";
import {
  completeHumanCupTie,
  cupBlocksSeasonEnd,
  getCupRoundLabel,
  processCupAfterLeagueRound,
} from "@/engine/cup";
import { resetRoundSkillVariation } from "@/engine/player";
import {
  buildDefaultSquad,
  pickBenchPlayers,
  removeUnavailableFromSquad,
  deriveTacticLabel,
  detectFormationMatch,
} from "@/engine/squad";
import {
  fixtureHasHumanClub,
  getHumanClubIds,
  isHumanManagedClub,
  resetLocalManagerTurn,
} from "@/engine/local-play";
import {
  processMidSeasonCoaches,
  registerCoachMatchResultForClub,
  registerCoachTitleForClub,
} from "@/engine/coach";
import { processLeagueSeasonClose } from "@/engine/season-end";

export const MATCH_SPEED_OPTIONS: { label: string; seconds: 60 | 45 | 30 | 15 }[] = [
  { label: "Muito lenta (60s)", seconds: 60 },
  { label: "Lenta (45s)", seconds: 45 },
  { label: "Normal (30s)", seconds: 30 },
  { label: "Rápida (15s)", seconds: 15 },
];

function getClubLineup(
  state: GameState,
  clubId: number,
  humanLineupIds: number[]
): number[] {
  const manager = state.localManagers.find((m) => m.clubId === clubId);
  if (manager && manager.lineupPlayerIds.length > 0) {
    return manager.lineupPlayerIds;
  }
  if (clubId === state.humanClubId && humanLineupIds.length > 0) {
    return humanLineupIds;
  }
  const squad = getPlayersByClub(state.players, clubId);
  return buildDefaultSquad(squad).lineupIds;
}

function lineupPlayers(state: GameState, clubId: number, ids: number[]) {
  const squad = getPlayersByClub(state.players, clubId);
  return ids
    .map((id) => squad.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);
}

function pickPenaltySufferedPlayer(lineup: Player[], rng: () => number): Player | null {
  const outfield = lineup.filter((p) => p.position !== "GK");
  if (outfield.length === 0) return lineup[0] ?? null;
  const weights = outfield.map((p) => (p.position === "FW" ? 4 : p.position === "MF" ? 2 : 1));
  const total = weights.reduce((acc, n) => acc + n, 0);
  let roll = rng() * total;
  for (let i = 0; i < outfield.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return outfield[i]!;
  }
  return outfield[outfield.length - 1] ?? null;
}

const PENALTY_COUNT_WEIGHTS = [0.8, 0.15, 0.04, 0.01] as const;

const PENALTY_MINUTE_WINDOWS: ReadonlyArray<readonly [number, number]> = [
  [8, 35],
  [40, 70],
  [71, 88],
];

function rollPenaltyCount(rng: () => number): number {
  const roll = rng();
  let cumulative = 0;
  for (let count = 0; count < PENALTY_COUNT_WEIGHTS.length; count++) {
    cumulative += PENALTY_COUNT_WEIGHTS[count]!;
    if (roll < cumulative) return count;
  }
  return 0;
}

function shufflePenaltyWindows(rng: () => number, maxMinute: number): Array<[number, number]> {
  const windows = PENALTY_MINUTE_WINDOWS.map(
    ([min, max]) => [min, Math.min(max, maxMinute)] as [number, number]
  ).filter(([min, max]) => max > min);

  for (let i = windows.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [windows[i], windows[j]] = [windows[j]!, windows[i]!];
  }
  return windows;
}

export function buildLivePenaltyChances(
  seed: number,
  homeLineup: Player[],
  awayLineup: Player[],
  maxMinute = 90
): PenaltyChanceEvent[] {
  const rng = createRng(seed + 777);
  const count = rollPenaltyCount(rng);
  if (count === 0) return [];

  const events: PenaltyChanceEvent[] = [];
  const windows = shufflePenaltyWindows(rng, maxMinute);
  let serial = 1;

  for (let i = 0; i < count && i < windows.length; i++) {
    const [min, max] = windows[i]!;
    const team = rng() < 0.5 ? "home" : "away";
    const suffered = pickPenaltySufferedPlayer(
      team === "home" ? homeLineup : awayLineup,
      rng
    );
    events.push({
      id: `pk-${seed}-${serial++}`,
      minute: Math.floor(min + rng() * (max - min + 1)),
      team,
      sufferedPlayerId: suffered?.id,
      sufferedPlayerName: suffered
        ? formatPlayerNameWithStar(suffered.name, suffered.isStar)
        : undefined,
    });
  }

  return events.sort((a, b) => a.minute - b.minute);
}

function getManualInjurySubsTeams(
  state: GameState,
  plan: Pick<LiveMatchPlan, "homeClubId" | "awayClubId">
): Set<"home" | "away"> {
  const manual = new Set<"home" | "away">();
  if (isHumanManagedClub(state, plan.homeClubId)) manual.add("home");
  if (isHumanManagedClub(state, plan.awayClubId)) manual.add("away");
  return manual;
}

function countFirstHalfReds(
  cardEvents: LiveMatchPlan["cardEvents"],
  team: "home" | "away"
): number {
  const reds = new Set<number>();
  for (const e of cardEvents) {
    if (e.team === team && e.type === "red" && e.minute <= 45) {
      reds.add(e.playerId);
    }
  }
  return reds.size;
}

export function prepareLiveRound(
  state: GameState,
  lineupIds: number[] = state.lineupPlayerIds
): LiveMatchPlan[] {
  const fixtures = getFixturesForRound(state.fixtures, state.round);
  const matches: LiveMatchPlan[] = [];

  for (const fixture of fixtures) {
    const homeClub = state.clubs.find((c) => c.id === fixture.homeClubId)!;
    const awayClub = state.clubs.find((c) => c.id === fixture.awayClubId)!;
    const isHumanMatch = fixtureHasHumanClub(
      state,
      fixture.homeClubId,
      fixture.awayClubId
    );
    const seed = state.season * 10000 + fixture.id + getGameSeed(state);
    const rng = createRng(seed);

    const homeLineupIds = getClubLineup(state, homeClub.id, lineupIds);
    const awayLineupIds = getClubLineup(state, awayClub.id, lineupIds);
    const homeLineup = lineupPlayers(state, homeClub.id, homeLineupIds);
    const awayLineup = lineupPlayers(state, awayClub.id, awayLineupIds);

    if (isHumanMatch) {
      const homeCards1 = generateMatchCardEvents(
        homeLineup,
        "home",
        seed + 100,
        1,
        45
      );
      const awayCards1 = generateMatchCardEvents(
        awayLineup,
        "away",
        seed + 200,
        1,
        45
      );
      const homeExp1 = homeCards1.events.filter(
        (e) => e.type === "red"
      ).length;
      const awayExp1 = awayCards1.events.filter(
        (e) => e.type === "red"
      ).length;

      const firstHalf = simulateHalfMatch(
        fixture.id,
        homeClub,
        awayClub,
        getPlayersByClub(state.players, homeClub.id),
        getPlayersByClub(state.players, awayClub.id),
        seed,
        "first",
        homeLineupIds,
        awayLineupIds,
        0,
        0,
        homeExp1,
        awayExp1
      );

      const firstEvents = buildGoalTimeline(
        firstHalf.homeGoals,
        firstHalf.awayGoals,
        homeLineup,
        awayLineup,
        rng,
        1,
        45
      );
      const penaltyChances = buildLivePenaltyChances(seed, homeLineup, awayLineup, 90);

      const humanPlan = appendMatchInjuries(
        state.players,
        {
          fixtureId: fixture.id,
          division: fixture.division,
          homeClubId: fixture.homeClubId,
          awayClubId: fixture.awayClubId,
          homeName: homeClub.name,
          awayName: awayClub.name,
          isHumanMatch: true,
          competition: "league",
          events: firstEvents,
          cardEvents: [...homeCards1.events, ...awayCards1.events],
          finalHomeGoals: firstHalf.homeGoals,
          finalAwayGoals: firstHalf.awayGoals,
          penaltyChances,
          secondHalfPending: true,
          homeLineupIds,
          awayLineupIds,
        },
        homeLineup,
        awayLineup,
        seed,
        1,
        45,
        getManualInjurySubsTeams(state, {
          homeClubId: fixture.homeClubId,
          awayClubId: fixture.awayClubId,
        })
      );
      matches.push(humanPlan);
    } else {
      const homeCards = generateMatchCardEvents(
        homeLineup,
        "home",
        seed + 100,
        1,
        90
      );
      const awayCards = generateMatchCardEvents(
        awayLineup,
        "away",
        seed + 200,
        1,
        90
      );
      const homeExp = homeCards.events.filter((e) => e.type === "red").length;
      const awayExp = awayCards.events.filter((e) => e.type === "red").length;

      const result = simulateMatch(
        fixture.id,
        homeClub,
        awayClub,
        getPlayersByClub(state.players, homeClub.id),
        getPlayersByClub(state.players, awayClub.id),
        seed,
        homeLineupIds,
        awayLineupIds,
        false,
        homeExp,
        awayExp
      );

      const events = buildGoalTimeline(
        result.homeGoals,
        result.awayGoals,
        homeLineup,
        awayLineup,
        rng
      );

      matches.push(
        appendMatchInjuries(
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
            events,
            cardEvents: [...homeCards.events, ...awayCards.events],
            finalHomeGoals: result.homeGoals,
            finalAwayGoals: result.awayGoals,
            penaltyChances: [],
            secondHalfPending: false,
            homeLineupIds,
            awayLineupIds,
          },
          homeLineup,
          awayLineup,
          seed,
          1,
          90
        )
      );
    }
  }

  return matches.sort(
    (a, b) => a.division - b.division || a.fixtureId - b.fixtureId
  );
}

function buildCupMatchPlan(
  state: GameState,
  tie: CupTie,
  lineupIds: number[],
  liveHuman: boolean
): LiveMatchPlan {
  const homeClub = state.clubs.find((c) => c.id === tie.homeClubId)!;
  const awayClub = state.clubs.find((c) => c.id === tie.awayClubId)!;
  const isHumanMatch = fixtureHasHumanClub(state, tie.homeClubId, tie.awayClubId);
  const seed = state.season * 10000 + tie.id + 50000 + getGameSeed(state);
  const rng = createRng(seed);

  const homeLineupIds = getClubLineup(state, homeClub.id, lineupIds);
  const awayLineupIds = getClubLineup(state, awayClub.id, lineupIds);
  const homeLineup = lineupPlayers(state, homeClub.id, homeLineupIds);
  const awayLineup = lineupPlayers(state, awayClub.id, awayLineupIds);

  const base = {
    fixtureId: -tie.id,
    division: 0,
    homeClubId: tie.homeClubId,
    awayClubId: tie.awayClubId,
    homeName: homeClub.name,
    awayName: awayClub.name,
    isHumanMatch,
    competition: "cup" as const,
    cupTieId: tie.id,
    cupPhaseLabel: getCupRoundLabel(tie.leagueRoundGate),
    homeLineupIds,
    awayLineupIds,
    penaltyChances: [] as PenaltyChanceEvent[],
    knockoutWinnerClubId: tie.winnerClubId,
    penaltyShootout: null as PenaltyShootoutSummary | null,
  };

  if (liveHuman && isHumanMatch) {
    const homeCards1 = generateMatchCardEvents(
      homeLineup,
      "home",
      seed + 100,
      1,
      45
    );
    const awayCards1 = generateMatchCardEvents(
      awayLineup,
      "away",
      seed + 200,
      1,
      45
    );
    const homeExp1 = homeCards1.events.filter((e) => e.type === "red").length;
    const awayExp1 = awayCards1.events.filter((e) => e.type === "red").length;

    const firstHalf = simulateHalfMatch(
      tie.id,
      homeClub,
      awayClub,
      getPlayersByClub(state.players, homeClub.id),
      getPlayersByClub(state.players, awayClub.id),
      seed,
      "first",
      homeLineupIds,
      awayLineupIds,
      0,
      0,
      homeExp1,
      awayExp1
    );

    const firstEvents = buildGoalTimeline(
      firstHalf.homeGoals,
      firstHalf.awayGoals,
      homeLineup,
      awayLineup,
      rng,
      1,
      45
    );
    const penaltyChances = buildLivePenaltyChances(seed + 50000, homeLineup, awayLineup, 120);

    return appendMatchInjuries(
      state.players,
      {
        ...base,
        events: firstEvents,
        cardEvents: [...homeCards1.events, ...awayCards1.events],
        finalHomeGoals: firstHalf.homeGoals,
        finalAwayGoals: firstHalf.awayGoals,
        penaltyChances,
        secondHalfPending: true,
      },
      homeLineup,
      awayLineup,
      seed,
      1,
      45,
      getManualInjurySubsTeams(state, base)
    );
  }

  const homeCards = generateMatchCardEvents(
    homeLineup,
    "home",
    seed + 100,
    1,
    90
  );
  const awayCards = generateMatchCardEvents(
    awayLineup,
    "away",
    seed + 200,
    1,
    90
  );
  const homeExp = homeCards.events.filter((e) => e.type === "red").length;
  const awayExp = awayCards.events.filter((e) => e.type === "red").length;

  const result = simulateMatch(
    tie.id,
    homeClub,
    awayClub,
    getPlayersByClub(state.players, homeClub.id),
    getPlayersByClub(state.players, awayClub.id),
    seed,
    homeLineupIds,
    awayLineupIds,
    false,
    homeExp,
    awayExp
  );

  const events = buildGoalTimeline(
    result.homeGoals,
    result.awayGoals,
    homeLineup,
    awayLineup,
    rng
  );

  return appendMatchInjuries(
    state.players,
    {
      ...base,
      events,
      cardEvents: [...homeCards.events, ...awayCards.events],
      finalHomeGoals: result.homeGoals,
      finalAwayGoals: result.awayGoals,
      penaltyChances: [],
      secondHalfPending: false,
    },
    homeLineup,
    awayLineup,
    seed,
    1,
    90
  );
}

function buildCupMatchPlanFromPlayedTie(
  state: GameState,
  tie: CupTie
): LiveMatchPlan {
  const homeClub = state.clubs.find((c) => c.id === tie.homeClubId)!;
  const awayClub = state.clubs.find((c) => c.id === tie.awayClubId)!;
  const isHumanMatch = fixtureHasHumanClub(state, tie.homeClubId, tie.awayClubId);
  const seed = state.season * 10000 + tie.id + 50000 + getGameSeed(state);
  const rng = createRng(seed);

  const homeLineupIds = getClubLineup(state, homeClub.id, state.lineupPlayerIds);
  const awayLineupIds = getClubLineup(state, awayClub.id, state.lineupPlayerIds);
  const homeLineup = lineupPlayers(state, homeClub.id, homeLineupIds);
  const awayLineup = lineupPlayers(state, awayClub.id, awayLineupIds);

  const homeGoals = tie.homeGoals ?? 0;
  const awayGoals = tie.awayGoals ?? 0;

  const homeCards = generateMatchCardEvents(
    homeLineup,
    "home",
    seed + 100,
    1,
    90
  );
  const awayCards = generateMatchCardEvents(
    awayLineup,
    "away",
    seed + 200,
    1,
    90
  );

  const events = buildGoalTimeline(
    homeGoals,
    awayGoals,
    homeLineup,
    awayLineup,
    rng
  );

  return {
    fixtureId: -tie.id,
    division: 0,
    homeClubId: tie.homeClubId,
    awayClubId: tie.awayClubId,
    homeName: homeClub.name,
    awayName: awayClub.name,
    isHumanMatch,
    competition: "cup",
    cupTieId: tie.id,
    cupPhaseLabel: getCupRoundLabel(tie.leagueRoundGate),
    homeLineupIds,
    awayLineupIds,
    events,
    cardEvents: [...homeCards.events, ...awayCards.events],
    finalHomeGoals: homeGoals,
    finalAwayGoals: awayGoals,
    penaltyChances: [],
    knockoutWinnerClubId: tie.winnerClubId,
    penaltyShootout: null,
    secondHalfPending: false,
  };
}

/** Todos os jogos da fase da copa: jogos humanos primeiro, demais em sequência. */
export function prepareLiveCupRoundAll(
  state: GameState,
  lineupIds: number[] = state.lineupPlayerIds
): LiveMatchPlan[] {
  if (!state.cup) return [];

  const humanClubIds = getHumanClubIds(state);
  const humanTies = state.cup.ties.filter(
    (t) =>
      !t.played &&
      humanClubIds.some(
        (id) => id === t.homeClubId || id === t.awayClubId
      )
  );
  if (humanTies.length === 0) return [];

  const gate = humanTies[0]!.leagueRoundGate;
  const ties = state.cup.ties.filter((t) => t.leagueRoundGate === gate);
  const humanTieIds = new Set(humanTies.map((t) => t.id));

  const sorted = [...ties].sort((a, b) => {
    const aHuman = humanTieIds.has(a.id);
    const bHuman = humanTieIds.has(b.id);
    if (aHuman && !bHuman) return -1;
    if (!aHuman && bHuman) return 1;
    if (aHuman && bHuman) {
      const aIdx = humanClubIds.findIndex(
        (id) => id === a.homeClubId || id === a.awayClubId
      );
      const bIdx = humanClubIds.findIndex(
        (id) => id === b.homeClubId || id === b.awayClubId
      );
      return aIdx - bIdx;
    }
    return a.id - b.id;
  });

  return sorted.map((tie) => {
    if (tie.played && tie.homeGoals != null && tie.awayGoals != null) {
      return buildCupMatchPlanFromPlayedTie(state, tie);
    }
    const isHumanMatch = fixtureHasHumanClub(
      state,
      tie.homeClubId,
      tie.awayClubId
    );
    return buildCupMatchPlan(state, tie, lineupIds, isHumanMatch);
  });
}

export function prepareLiveCupRound(
  state: GameState,
  lineupIds: number[] = state.lineupPlayerIds
): LiveMatchPlan | null {
  const plans = prepareLiveCupRoundAll(state, lineupIds);
  return plans.find((p) => p.isHumanMatch) ?? plans[0] ?? null;
}

export function computeHumanCupSecondHalf(
  state: GameState,
  humanMatch: LiveMatchPlan,
  _lineupIds: number[]
): LiveMatchPlan {
  const tieId = humanMatch.cupTieId ?? -humanMatch.fixtureId;
  const homeClub = state.clubs.find((c) => c.id === humanMatch.homeClubId)!;
  const awayClub = state.clubs.find((c) => c.id === humanMatch.awayClubId)!;
  const seed =
    state.season * 10000 + tieId + 50000 + getGameSeed(state);
  const rng = createRng(seed + 9999);

  const homeLineupIds = humanMatch.homeLineupIds;
  const awayLineupIds = humanMatch.awayLineupIds;
  const homeLineup = lineupPlayers(state, homeClub.id, homeLineupIds);
  const awayLineup = lineupPlayers(state, awayClub.id, awayLineupIds);

  const firstHalfHome = humanMatch.events.filter((e) => e.team === "home").length;
  const firstHalfAway = humanMatch.events.filter((e) => e.team === "away").length;

  const homeExp1 = countFirstHalfReds(humanMatch.cardEvents, "home");
  const awayExp1 = countFirstHalfReds(humanMatch.cardEvents, "away");

  const homePriorCards = humanMatch.cardEvents.filter((e) => e.team === "home");
  const awayPriorCards = humanMatch.cardEvents.filter((e) => e.team === "away");

  const homeCards2 = generateMatchCardEvents(
    homeLineup,
    "home",
    seed + 300,
    46,
    90,
    homePriorCards
  );
  const awayCards2 = generateMatchCardEvents(
    awayLineup,
    "away",
    seed + 400,
    46,
    90,
    awayPriorCards
  );
  const homeExp2 = homeCards2.events.filter((e) => e.type === "red").length;
  const awayExp2 = awayCards2.events.filter((e) => e.type === "red").length;

  const fullMatch = simulateHalfMatch(
    tieId,
    homeClub,
    awayClub,
    getPlayersByClub(state.players, homeClub.id),
    getPlayersByClub(state.players, awayClub.id),
    seed,
    "second",
    homeLineupIds,
    awayLineupIds,
    firstHalfHome,
    firstHalfAway,
    homeExp1 + homeExp2,
    awayExp1 + awayExp2
  );

  const secondHalfHome = fullMatch.homeGoals - firstHalfHome;
  const secondHalfAway = fullMatch.awayGoals - firstHalfAway;
  const secondEvents = buildGoalTimeline(
    secondHalfHome,
    secondHalfAway,
    homeLineup,
    awayLineup,
    rng,
    46,
    90
  );

  return appendMatchInjuries(
    state.players,
    {
      ...humanMatch,
      events: [...humanMatch.events, ...secondEvents],
      cardEvents: [
        ...humanMatch.cardEvents,
        ...homeCards2.events,
        ...awayCards2.events,
      ],
      finalHomeGoals: fullMatch.homeGoals,
      finalAwayGoals: fullMatch.awayGoals,
      secondHalfPending: false,
      homeLineupIds,
      awayLineupIds,
    },
    homeLineup,
    awayLineup,
    seed,
    46,
    90,
    getManualInjurySubsTeams(state, humanMatch)
  );
}

function getTeamLineupPlayers(
  state: GameState,
  plan: LiveMatchPlan,
  team: "home" | "away",
  humanLineupIds: number[]
): Player[] {
  const clubId = team === "home" ? plan.homeClubId : plan.awayClubId;
  const lineupIds = getClubLineup(state, clubId, humanLineupIds);
  return lineupPlayers(state, clubId, lineupIds);
}

function getPenaltyKeeper(players: Player[]): Player {
  return (
    [...players].find((p) => p.position === "GK") ??
    [...players].sort((a, b) => b.skill - a.skill)[0] ??
    players[0]!
  );
}

export function resolveLiveMatchPenalty(
  state: GameState,
  plan: LiveMatchPlan,
  team: "home" | "away",
  kickerId: number | null,
  minute: number,
  humanLineupIds: number[]
): {
  plan: LiveMatchPlan;
  kicker: Pick<Player, "name" | "isStar">;
  kickerName: string;
  outcome: "goal" | "saved" | "off_target" | "post";
} {
  const seedBase = (plan.cupTieId ?? plan.fixtureId) * 37 + state.season * 997 + minute * 13;
  const rng = createRng(seedBase);
  const attacking = getTeamLineupPlayers(state, plan, team, humanLineupIds);
  const defending = getTeamLineupPlayers(state, plan, team === "home" ? "away" : "home", humanLineupIds);
  const kicker =
    (kickerId != null ? attacking.find((p) => p.id === kickerId) : null) ??
    [...attacking].filter((p) => p.position !== "GK").sort((a, b) => b.skill - a.skill)[0] ??
    attacking[0]!;
  const keeper = getPenaltyKeeper(defending);
  const outcome = resolvePenaltyKick(kicker, keeper, rng);

  if (outcome !== "goal") {
    return {
      plan,
      kicker: { name: kicker.name, isStar: kicker.isStar },
      kickerName: formatPlayerNameWithStar(kicker.name, kicker.isStar),
      outcome,
    };
  }

  const updatedPlan: LiveMatchPlan = {
    ...plan,
    finalHomeGoals: team === "home" ? plan.finalHomeGoals + 1 : plan.finalHomeGoals,
    finalAwayGoals: team === "away" ? plan.finalAwayGoals + 1 : plan.finalAwayGoals,
    events: [
      ...plan.events,
      {
        minute,
        team,
        playerId: kicker.id,
        playerName: formatPlayerNameWithStar(kicker.name, kicker.isStar),
        isPenalty: true,
      },
    ].sort((a, b) => a.minute - b.minute),
  };
  return {
    plan: updatedPlan,
    kicker: { name: kicker.name, isStar: kicker.isStar },
    kickerName: formatPlayerNameWithStar(kicker.name, kicker.isStar),
    outcome,
  };
}

export function resolveCupLiveKnockout(
  state: GameState,
  plan: LiveMatchPlan,
  humanLineupIds: number[]
): LiveMatchPlan {
  if (plan.competition !== "cup") return plan;
  if (plan.finalHomeGoals !== plan.finalAwayGoals) {
    return {
      ...plan,
      knockoutWinnerClubId:
        plan.finalHomeGoals > plan.finalAwayGoals ? plan.homeClubId : plan.awayClubId,
      penaltyShootout: null,
    };
  }

  const tieId = plan.cupTieId ?? Math.abs(plan.fixtureId);
  const homeClub = state.clubs.find((c) => c.id === plan.homeClubId)!;
  const awayClub = state.clubs.find((c) => c.id === plan.awayClubId)!;
  const seed = state.season * 10000 + tieId + 50000 + getGameSeed(state);
  const homeLineupIds =
    plan.homeLineupIds.length > 0
      ? plan.homeLineupIds
      : getClubLineup(state, homeClub.id, humanLineupIds);
  const awayLineupIds =
    plan.awayLineupIds.length > 0
      ? plan.awayLineupIds
      : getClubLineup(state, awayClub.id, humanLineupIds);
  const homePlayers = getPlayersByClub(state.players, homeClub.id);
  const awayPlayers = getPlayersByClub(state.players, awayClub.id);
  const extra = simulateExtraTimeScore(
    tieId,
    homeClub,
    awayClub,
    homePlayers,
    awayPlayers,
    seed + 30000,
    homeLineupIds,
    awayLineupIds,
    0,
    0
  );
  const rng = createRng(seed + 35000);
  const extraEvents = buildGoalTimeline(
    extra.homeGoals,
    extra.awayGoals,
    lineupPlayers(state, homeClub.id, homeLineupIds),
    lineupPlayers(state, awayClub.id, awayLineupIds),
    rng,
    91,
    120
  );
  const afterExtraHome = plan.finalHomeGoals + extra.homeGoals;
  const afterExtraAway = plan.finalAwayGoals + extra.awayGoals;

  if (afterExtraHome !== afterExtraAway) {
    return {
      ...plan,
      events: [...plan.events, ...extraEvents].sort((a, b) => a.minute - b.minute),
      finalHomeGoals: afterExtraHome,
      finalAwayGoals: afterExtraAway,
      knockoutWinnerClubId: afterExtraHome > afterExtraAway ? plan.homeClubId : plan.awayClubId,
      penaltyShootout: null,
    };
  }

  const shootout = simulatePenaltyShootout(
    homePlayers,
    awayPlayers,
    homeLineupIds,
    awayLineupIds,
    seed + 40000
  );
  return {
    ...plan,
    events: [...plan.events, ...extraEvents].sort((a, b) => a.minute - b.minute),
    finalHomeGoals: afterExtraHome,
    finalAwayGoals: afterExtraAway,
    knockoutWinnerClubId: shootout.winnerTeam === "home" ? plan.homeClubId : plan.awayClubId,
    penaltyShootout: shootout,
  };
}

export function finalizeLiveCupRound(
  state: GameState,
  matchPlans: LiveMatchPlan[]
): GameState {
  const previousChampion = state.cup?.championClubId ?? null;
  let current: GameState = {
    ...state,
    clubs: state.clubs.map((c) => ({ ...c })),
    players: state.players.map((p) => ({
      ...p,
      matchHistory: [...(p.matchHistory ?? [])],
    })),
    messages: [...state.messages],
  };

  const cupPlans = matchPlans.filter(
    (p) => p.competition === "cup" && p.cupTieId
  );

  for (const plan of cupPlans) {
    const tie = current.cup?.ties.find((t) => t.id === plan.cupTieId);
    if (tie?.played) continue;
    assignGoalScorers(current.players, plan.events);
    current = completeHumanCupTie(
      current,
      plan.cupTieId!,
      plan.finalHomeGoals,
      plan.finalAwayGoals,
      {
        winnerClubId: plan.knockoutWinnerClubId ?? undefined,
        shootout: plan.penaltyShootout
          ? {
              homeGoals: plan.penaltyShootout.homeGoals,
              awayGoals: plan.penaltyShootout.awayGoals,
            }
          : null,
      }
    );
  }

  const humanPlan = cupPlans.find((p) => p.isHumanMatch);
  const disciplineMessages: string[] = [];
  const cupClubsPlayed = new Set<number>();
  const cupInjuryEvents = cupPlans.flatMap((p) => {
    cupClubsPlayed.add(p.homeClubId);
    cupClubsPlayed.add(p.awayClubId);
    return p.injuryEvents ?? [];
  });
  const cupDisciplineRecords = cupPlans.flatMap((plan) =>
    disciplineRecordsFromCardEvents(plan.cardEvents)
  );

  const cupDiscipline = applyDisciplineAfterMatch(
    current.players,
    cupDisciplineRecords
  );
  disciplineMessages.push(...cupDiscipline.messages);
  tickSuspensionsAfterRound(
    current.players,
    [...cupClubsPlayed],
    cupDiscipline.newlySuspended
  );

  const cupInjuries = applyInjuriesAfterMatch(current.players, cupInjuryEvents);
  disciplineMessages.push(...cupInjuries.messages);
  tickInjuriesAfterMatch(
    current.players,
    [...cupClubsPlayed],
    cupInjuries.newlyInjured
  );

  if (humanPlan) {
    registerCoachMatchResultForClub(
      current,
      humanPlan.homeClubId,
      humanPlan.finalHomeGoals,
      humanPlan.finalAwayGoals
    );
    registerCoachMatchResultForClub(
      current,
      humanPlan.awayClubId,
      humanPlan.finalAwayGoals,
      humanPlan.finalHomeGoals
    );
  }
  if (
    current.coach.currentClubId !== null &&
    previousChampion == null &&
    current.cup?.championClubId === current.humanClubId
  ) {
    registerCoachTitleForClub(current, current.humanClubId);
    disciplineMessages.push("Título conquistado na Copa Geral.");
  }

  const seasonDone = current.round >= current.totalRounds;
  const canEndSeason = seasonDone && !cupBlocksSeasonEnd(current);

  return resetLocalManagerTurn({
    ...current,
    lineupPlayerIds: [],
    benchPlayerIds: [],
    humanFormation: null,
    phase: canEndSeason ? "ended" : current.phase,
    messages: [...current.messages, ...disciplineMessages],
    nextFixtureId: canEndSeason
      ? null
      : getNextHumanFixture(current)?.id ?? null,
  });
}

export function finalizeLiveCupMatch(
  state: GameState,
  plan: LiveMatchPlan
): GameState {
  return finalizeLiveCupRound(state, [plan]);
}

export function computeHumanSecondHalf(
  state: GameState,
  humanMatch: LiveMatchPlan,
  _lineupIds: number[]
): LiveMatchPlan {
  const fixture = state.fixtures.find((f) => f.id === humanMatch.fixtureId)!;
  const homeClub = state.clubs.find((c) => c.id === fixture.homeClubId)!;
  const awayClub = state.clubs.find((c) => c.id === fixture.awayClubId)!;
  const seed = state.season * 10000 + fixture.id + getGameSeed(state);
  const rng = createRng(seed + 9999);

  const homeLineupIds = humanMatch.homeLineupIds;
  const awayLineupIds = humanMatch.awayLineupIds;
  const homeLineup = lineupPlayers(state, homeClub.id, homeLineupIds);
  const awayLineup = lineupPlayers(state, awayClub.id, awayLineupIds);

  const firstHalfHome = humanMatch.events.filter((e) => e.team === "home").length;
  const firstHalfAway = humanMatch.events.filter((e) => e.team === "away").length;

  const homeExp1 = countFirstHalfReds(humanMatch.cardEvents, "home");
  const awayExp1 = countFirstHalfReds(humanMatch.cardEvents, "away");

  const homePriorCards = humanMatch.cardEvents.filter((e) => e.team === "home");
  const awayPriorCards = humanMatch.cardEvents.filter((e) => e.team === "away");

  const homeCards2 = generateMatchCardEvents(
    homeLineup,
    "home",
    seed + 300,
    46,
    90,
    homePriorCards
  );
  const awayCards2 = generateMatchCardEvents(
    awayLineup,
    "away",
    seed + 400,
    46,
    90,
    awayPriorCards
  );
  const homeExp2 = homeCards2.events.filter((e) => e.type === "red").length;
  const awayExp2 = awayCards2.events.filter((e) => e.type === "red").length;

  const fullMatch = simulateHalfMatch(
    fixture.id,
    homeClub,
    awayClub,
    getPlayersByClub(state.players, homeClub.id),
    getPlayersByClub(state.players, awayClub.id),
    seed,
    "second",
    homeLineupIds,
    awayLineupIds,
    firstHalfHome,
    firstHalfAway,
    homeExp1 + homeExp2,
    awayExp1 + awayExp2
  );

  const secondHalfHome = fullMatch.homeGoals - firstHalfHome;
  const secondHalfAway = fullMatch.awayGoals - firstHalfAway;
  const secondEvents = buildGoalTimeline(
    secondHalfHome,
    secondHalfAway,
    homeLineup,
    awayLineup,
    rng,
    46,
    90
  );

  return appendMatchInjuries(
    state.players,
    {
      ...humanMatch,
      events: [...humanMatch.events, ...secondEvents],
      cardEvents: [
        ...humanMatch.cardEvents,
        ...homeCards2.events,
        ...awayCards2.events,
      ],
      finalHomeGoals: fullMatch.homeGoals,
      finalAwayGoals: fullMatch.awayGoals,
      secondHalfPending: false,
      homeLineupIds,
      awayLineupIds,
    },
    homeLineup,
    awayLineup,
    seed,
    46,
    90,
    getManualInjurySubsTeams(state, humanMatch)
  );
}

export function finalizeLiveRound(
  state: GameState,
  matchPlans: LiveMatchPlan[]
): GameState {
  let current: GameState = {
    ...state,
    clubs: state.clubs.map((c) => ({ ...c })),
    fixtures: state.fixtures.map((f) => ({ ...f })),
    standings: state.standings.map((s) => ({ ...s })),
    players: state.players.map((p) => ({
      ...p,
      matchHistory: [...(p.matchHistory ?? [])],
    })),
    messages: [...state.messages],
  };

  const disciplineRecords: MatchDisciplineRecord[] = [];
  const clubsWhoPlayed = new Set<number>();
  const disciplineMessages: string[] = [];
  const playedFixtures: Fixture[] = [];

  for (const plan of matchPlans.filter((m) => m.competition === "league")) {
    const fixture = current.fixtures.find((f) => f.id === plan.fixtureId)!;
    if (fixture.played) continue;

    const homeClub = current.clubs.find((c) => c.id === fixture.homeClubId)!;
    const awayClub = current.clubs.find((c) => c.id === fixture.awayClubId)!;

    fixture.played = true;
    fixture.homeGoals = plan.finalHomeGoals;
    fixture.awayGoals = plan.finalAwayGoals;
    playedFixtures.push(fixture);
    registerCoachMatchResultForClub(
      current,
      fixture.homeClubId,
      plan.finalHomeGoals,
      plan.finalAwayGoals
    );
    registerCoachMatchResultForClub(
      current,
      fixture.awayClubId,
      plan.finalAwayGoals,
      plan.finalHomeGoals
    );

    updateStanding(
      current.standings,
      homeClub.id,
      plan.finalHomeGoals,
      plan.finalAwayGoals
    );
    updateStanding(
      current.standings,
      awayClub.id,
      plan.finalAwayGoals,
      plan.finalHomeGoals
    );

    const homeStrength = calculateTeamStrength(
      homeClub,
      getPlayersByClub(current.players, homeClub.id),
      true,
      plan.homeLineupIds,
      true
    );
    const awayStrength = calculateTeamStrength(
      awayClub,
      getPlayersByClub(current.players, awayClub.id),
      false,
      plan.awayLineupIds,
      false
    );

    applyMatchMorale(
      homeClub,
      plan.finalHomeGoals,
      plan.finalAwayGoals,
      homeStrength,
      awayStrength,
      {
        competition: "league",
        ownDivision: homeClub.division,
        opponentDivision: awayClub.division,
      }
    );
    applyMatchMorale(
      awayClub,
      plan.finalAwayGoals,
      plan.finalHomeGoals,
      awayStrength,
      homeStrength,
      {
        competition: "league",
        ownDivision: awayClub.division,
        opponentDivision: homeClub.division,
      }
    );

    assignGoalScorers(current.players, plan.events);
    recordPlayersMatchHistory(
      current.players,
      plan,
      current,
      current.round
    );
    clubsWhoPlayed.add(homeClub.id);
    clubsWhoPlayed.add(awayClub.id);

    disciplineRecords.push(...disciplineRecordsFromCardEvents(plan.cardEvents));
  }

  const discipline = applyDisciplineAfterMatch(
    current.players,
    disciplineRecords
  );
  disciplineMessages.push(...discipline.messages);
  tickSuspensionsAfterRound(
    current.players,
    [...clubsWhoPlayed],
    discipline.newlySuspended
  );

  const injuryEvents = matchPlans
    .filter((m) => m.competition === "league")
    .flatMap((p) => p.injuryEvents ?? []);
  const injuries = applyInjuriesAfterMatch(current.players, injuryEvents);
  disciplineMessages.push(...injuries.messages);
  tickInjuriesAfterMatch(
    current.players,
    [...clubsWhoPlayed],
    injuries.newlyInjured
  );

  const leaguePlans = matchPlans.filter((m) => m.competition === "league");
  resetRoundSkillVariation(current.players);

  const humanClub = current.clubs.find((c) => c.id === current.humanClubId)!;
  const playedRound = current.round;
  const tactic = deriveTacticLabel(
    state.lineupPlayerIds,
    getPlayersByClub(state.players, state.humanClubId)
  );

  const divisionResults = leaguePlans
    .filter((m) => m.division === humanClub.division)
    .map((m) => ({
      homeClubId: m.homeClubId,
      awayClubId: m.awayClubId,
      homeName: m.homeName,
      awayName: m.awayName,
      homeGoals: m.finalHomeGoals,
      awayGoals: m.finalAwayGoals,
      isHumanMatch: m.isHumanMatch,
    }));

  const nextRound = current.round + 1;
  const seasonDone = nextRound > current.totalRounds;

  tickRegistrationAfterMatch(current.players, [...clubsWhoPlayed]);

  const homeClubIds = [...new Set(leaguePlans.map((m) => m.homeClubId))];
  const previousChampion = current.cup?.championClubId ?? null;
  current = applyPostRoundFinances(current, playedRound, homeClubIds);
  if (seasonDone && !current.leagueSeasonProcessed) {
    current = processLeagueSeasonClose(current);
  }
  current = processCupAfterLeagueRound(current, playedRound);
  applyTablePressureMorale(current.clubs, current.standings);
  if (
    current.coach.currentClubId !== null &&
    previousChampion == null &&
    current.cup?.championClubId === current.humanClubId
  ) {
    registerCoachTitleForClub(current, current.humanClubId);
    current.messages.push("Título conquistado na Copa Geral.");
  }
  current = processMidSeasonCoaches(current, playedFixtures);

  const summaryLines = divisionResults.map(
    (r) =>
      `${r.isHumanMatch ? "★ " : ""}${r.homeName} ${r.homeGoals} x ${r.awayGoals} ${r.awayName}`
  );

  const canEndSeason = seasonDone && !cupBlocksSeasonEnd(current);

  return resetLocalManagerTurn({
    ...current,
    lineupPlayerIds: [],
    benchPlayerIds: [],
    humanFormation: null,
    round: seasonDone ? current.round : nextRound,
    phase: canEndSeason ? "ended" : "regular",
    lastRoundResults: {
      round: playedRound,
      division: humanClub.division,
      matches: divisionResults,
    },
    messages: [
      ...current.messages,
      `Rodada ${playedRound} encerrada (${humanClub.division}ª divisão). Tática ${tactic}.`,
      ...summaryLines,
      ...disciplineMessages,
    ],
    nextFixtureId: canEndSeason
      ? null
      : getNextHumanFixture({ ...current, round: seasonDone ? current.round : nextRound })?.id ?? null,
  });
}

export function setLineup(
  state: GameState,
  lineupIds: number[],
  benchIds?: number[]
): GameState {
  const squad = getPlayersByClub(state.players, state.humanClubId);
  const sanitized = removeUnavailableFromSquad(
    lineupIds,
    benchIds ?? state.benchPlayerIds,
    squad
  );
  lineupIds = sanitized.lineupIds;
  benchIds = sanitized.benchIds;
  const matched = detectFormationMatch(lineupIds, squad);
  const localManagers = state.localManagers.map((m, idx) =>
    idx === state.activeManagerIndex
      ? {
          ...m,
          lineupPlayerIds: lineupIds,
          benchPlayerIds: benchIds,
          formation: matched ?? m.formation,
        }
      : m
  );
  return {
    ...state,
    localManagers,
    lineupPlayerIds: lineupIds,
    benchPlayerIds: benchIds,
    humanFormation: matched ?? state.humanFormation,
  };
}
