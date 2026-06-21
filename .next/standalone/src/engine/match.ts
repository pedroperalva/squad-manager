import type {
  Club,
  GoalEvent,
  MatchResult,
  PenaltyKickOutcome,
  PenaltyShootoutSummary,
  Player,
  Position,
} from "@/engine/types";
import { effectiveSkill } from "@/engine/player";
import {
  formatPlayerNameWithStar,
  isStarEligiblePosition,
  shouldApplyStarEffects,
  STAR_GOAL_WEIGHT_MULTIPLIER,
} from "@/engine/stars";
import { countLineupPositions } from "@/engine/squad";
import { createRng, randomInt } from "@/data/name-generator";

const HOME_BONUS = 0.08;
const MAX_GOALS = 7;
const XG_BASE = 1.0;
const XG_ATTACK_DEFENSE_EXPONENT = 1.2;
const XG_ATTACK_DEFENSE_EXPONENT_MISMATCH = 1.22;
const XG_CAP_BALANCED = 2.8;
const XG_CAP_MISMATCH = 4.8;
const XG_MISMATCH_RATIO = 1.35;
const XG_MISMATCH_AVG_GAP = 8;
const HALF_MATCH_XG_FACTOR = 0.47;
const EXTRA_TIME_XG_FACTOR = 0.34;

interface TeamProfile {
  avg: number;
  gk: number;
  df: number;
  mf: number;
  fw: number;
  attack: number;
  defense: number;
  moraleMult: number;
  homeMult: number;
  formationAttack: number;
  formationDefense: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getTacticalModifiers(df: number, mf: number, fw: number) {
  return {
    attack: (fw - 2) * 0.04 + (mf - 4) * 0.01,
    defense: (df - 4) * 0.04 - (fw - 2) * 0.02,
  };
}

function averagePosition(
  lineup: Player[],
  position: Position,
  fallback: number
): number {
  const players = lineup.filter((p) => p.position === position);
  if (players.length === 0) return fallback;
  return (
    players.reduce((sum, p) => sum + effectiveSkill(p), 0) / players.length
  );
}

function buildTeamProfile(
  club: Club,
  players: Player[],
  isHome: boolean,
  lineupIds: number[],
  applyCrowd = true,
  expulsions = 0
): TeamProfile {
  const lineup = lineupIds
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => !!p);

  if (lineup.length === 0) {
    return {
      avg: 1,
      gk: 1,
      df: 1,
      mf: 1,
      fw: 1,
      attack: 1,
      defense: 1,
      moraleMult: 1,
      homeMult: 1,
      formationAttack: 1,
      formationDefense: 1,
    };
  }

  const avg = lineup.reduce((sum, p) => sum + effectiveSkill(p), 0) / lineup.length;
  const counts = countLineupPositions(lineupIds, players);
  const mods = getTacticalModifiers(counts.DF, counts.MF, counts.FW);
  const activeMult = Math.max(1, lineup.length - expulsions) / lineup.length;
  const moraleMult = clamp(1 + (club.morale - 50) / 180, 0.74, 1.3);
  const homeMult = isHome && applyCrowd ? 1 + HOME_BONUS : 1;
  const gk = averagePosition(lineup, "GK", avg);
  const df = averagePosition(lineup, "DF", avg);
  const mf = averagePosition(lineup, "MF", avg);
  const fw = averagePosition(lineup, "FW", avg);
  const formationAttack = clamp(1 + mods.attack, 0.82, 1.18);
  const formationDefense = clamp(1 + mods.defense, 0.82, 1.18);

  return {
    avg,
    gk,
    df,
    mf,
    fw,
    attack: (fw * 0.55 + mf * 0.3 + avg * 0.15) * formationAttack * activeMult,
    defense: (df * 0.5 + gk * 0.35 + mf * 0.15) * formationDefense * activeMult,
    moraleMult,
    homeMult,
    formationAttack,
    formationDefense,
  };
}

export function calculateTeamStrength(
  club: Club,
  players: Player[],
  isHome: boolean,
  lineupIds: number[],
  applyCrowd = true,
  expulsions = 0
): number {
  const profile = buildTeamProfile(
    club,
    players,
    isHome,
    lineupIds,
    applyCrowd,
    expulsions
  );
  return (
    (profile.attack * 0.52 + profile.defense * 0.48) *
    profile.moraleMult *
    profile.homeMult
  );
}

export function calculateWinProbabilities(
  strengthA: number,
  strengthB: number
): { homeWin: number; draw: number; awayWin: number } {
  const total = strengthA + strengthB;
  if (total === 0) return { homeWin: 0.33, draw: 0.34, awayWin: 0.33 };

  const diff = strengthA - strengthB;
  const homeWin = 0.33 + (diff / total) * 0.45;
  const awayWin = 0.33 - (diff / total) * 0.45;
  const draw = Math.max(0.1, 1 - homeWin - awayWin);

  const sum = homeWin + draw + awayWin;
  return {
    homeWin: homeWin / sum,
    draw: draw / sum,
    awayWin: awayWin / sum,
  };
}

function expectedGoalsFor(profile: TeamProfile, opponent: TeamProfile): number {
  const attackVsDefense = profile.attack / Math.max(1, opponent.defense);
  const strengthGap = profile.avg - opponent.avg;
  const isMismatch =
    attackVsDefense >= XG_MISMATCH_RATIO || strengthGap >= XG_MISMATCH_AVG_GAP;
  const exponent = isMismatch
    ? XG_ATTACK_DEFENSE_EXPONENT_MISMATCH
    : XG_ATTACK_DEFENSE_EXPONENT;
  const midfieldEdge = (profile.mf - opponent.mf) / 80;
  const keeperWall = clamp((opponent.gk - profile.fw) / 120, -0.18, 0.22);
  const raw =
    XG_BASE *
    attackVsDefense ** exponent *
    (1 + midfieldEdge) *
    (1 - keeperWall) *
    profile.moraleMult *
    profile.homeMult;

  const cap = isMismatch ? XG_CAP_MISMATCH : XG_CAP_BALANCED;
  return clamp(raw, 0.18, cap);
}

function samplePoisson(rng: () => number, lambda: number): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;

  do {
    k++;
    p *= rng();
  } while (p > limit && k < MAX_GOALS + 1);

  return Math.min(MAX_GOALS, k - 1);
}

function poissonProbability(lambda: number, goals: number): number {
  let factorial = 1;
  for (let i = 2; i <= goals; i++) factorial *= i;
  return (Math.exp(-lambda) * lambda ** goals) / factorial;
}

function probabilitiesFromExpectedGoals(
  homeExpected: number,
  awayExpected: number
): { homeWin: number; draw: number; awayWin: number } {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const probability =
        poissonProbability(homeExpected, h) *
        poissonProbability(awayExpected, a);
      if (h > a) homeWin += probability;
      else if (h === a) draw += probability;
      else awayWin += probability;
    }
  }

  const sum = homeWin + draw + awayWin;
  return {
    homeWin: homeWin / sum,
    draw: draw / sum,
    awayWin: awayWin / sum,
  };
}

function generateScoreFromExpectedGoals(
  rng: () => number,
  homeExpected: number,
  awayExpected: number
): { home: number; away: number } {
  return {
    home: samplePoisson(rng, homeExpected),
    away: samplePoisson(rng, awayExpected),
  };
}

function pickScorer(lineup: Player[], rng: () => number): Player | undefined {
  const starEffectsActive = shouldApplyStarEffects(lineup);
  const lineupAvgSkill =
    lineup.reduce((sum, p) => sum + effectiveSkill(p), 0) / Math.max(1, lineup.length);
  const weights = lineup.map((p) => {
    const baseWeight =
      p.position === "FW" ? 4 : p.position === "MF" ? 2 : p.position === "DF" ? 0.5 : 0.1;
    const skillFactor = clamp(
      0.82 + (effectiveSkill(p) - lineupAvgSkill) / 30,
      0.7,
      1.65
    );
    if (!starEffectsActive || !p.isStar || !isStarEligiblePosition(p.position)) {
      return baseWeight * skillFactor;
    }
    return baseWeight * skillFactor * STAR_GOAL_WEIGHT_MULTIPLIER;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < lineup.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return lineup[i];
  }
  return lineup[lineup.length - 1];
}

export function buildGoalTimeline(
  homeGoals: number,
  awayGoals: number,
  homeLineup: Player[],
  awayLineup: Player[],
  rng: () => number,
  minuteMin = 1,
  minuteMax = 90
): GoalEvent[] {
  const events: GoalEvent[] = [];
  for (let i = 0; i < homeGoals; i++) {
    const scorer = pickScorer(homeLineup, rng);
    events.push({
      minute: randomInt(rng, minuteMin, minuteMax),
      team: "home",
      playerId: scorer?.id,
      playerName: scorer
        ? formatPlayerNameWithStar(scorer.name, scorer.isStar)
        : undefined,
    });
  }
  for (let i = 0; i < awayGoals; i++) {
    const scorer = pickScorer(awayLineup, rng);
    events.push({
      minute: randomInt(rng, minuteMin, minuteMax),
      team: "away",
      playerId: scorer?.id,
      playerName: scorer
        ? formatPlayerNameWithStar(scorer.name, scorer.isStar)
        : undefined,
    });
  }
  return events.sort((a, b) => a.minute - b.minute || (a.team === "home" ? -1 : 1));
}

export function reassignGoalScorersAfterMinute(
  events: GoalEvent[],
  team: "home" | "away",
  minute: number,
  lineup: Player[],
  seed: number
): GoalEvent[] {
  if (lineup.length === 0) return events;
  const rng = createRng(seed);
  return events.map((event) => {
    if (event.team !== team || event.minute <= minute || event.isPenalty) {
      return event;
    }
    const scorer = pickScorer(lineup, rng);
    if (!scorer) return event;
    return {
      ...event,
      playerId: scorer.id,
      playerName: formatPlayerNameWithStar(scorer.name, scorer.isStar),
    };
  });
}

export function simulateHalfMatch(
  fixtureId: number,
  homeClub: Club,
  awayClub: Club,
  homePlayers: Player[],
  awayPlayers: Player[],
  seed: number,
  half: "first" | "second",
  homeLineupIds: number[],
  awayLineupIds: number[],
  firstHalfHome = 0,
  firstHalfAway = 0,
  homeExpulsions = 0,
  awayExpulsions = 0
): MatchResult {
  const rng = createRng(seed + fixtureId + (half === "second" ? 5000 : 0));
  const homeProfile = buildTeamProfile(
    homeClub,
    homePlayers,
    half === "first",
    homeLineupIds,
    false,
    homeExpulsions
  );
  const awayProfile = buildTeamProfile(
    awayClub,
    awayPlayers,
    false,
    awayLineupIds,
    false,
    awayExpulsions
  );

  const homeExpected = expectedGoalsFor(homeProfile, awayProfile) * HALF_MATCH_XG_FACTOR;
  const awayExpected = expectedGoalsFor(awayProfile, homeProfile) * HALF_MATCH_XG_FACTOR;
  const probs = probabilitiesFromExpectedGoals(homeExpected, awayExpected);

  const score = generateScoreFromExpectedGoals(
    rng,
    homeExpected,
    awayExpected
  );

  if (half === "second") {
    return {
      fixtureId,
      homeGoals: firstHalfHome + score.home,
      awayGoals: firstHalfAway + score.away,
      homeWinProb: probs.homeWin,
      drawProb: probs.draw,
      awayWinProb: probs.awayWin,
    };
  }

  return {
    fixtureId,
    homeGoals: score.home,
    awayGoals: score.away,
    homeWinProb: probs.homeWin,
    drawProb: probs.draw,
    awayWinProb: probs.awayWin,
  };
}

export function simulateMatch(
  fixtureId: number,
  homeClub: Club,
  awayClub: Club,
  homePlayers: Player[],
  awayPlayers: Player[],
  seed: number,
  homeLineupIds: number[],
  awayLineupIds: number[],
  applyCrowd = true,
  homeExpulsions = 0,
  awayExpulsions = 0
): MatchResult {
  const rng = createRng(seed + fixtureId);
  const homeProfile = buildTeamProfile(
    homeClub,
    homePlayers,
    true,
    homeLineupIds,
    applyCrowd,
    homeExpulsions
  );
  const awayProfile = buildTeamProfile(
    awayClub,
    awayPlayers,
    false,
    awayLineupIds,
    false,
    awayExpulsions
  );

  const homeExpected = expectedGoalsFor(homeProfile, awayProfile);
  const awayExpected = expectedGoalsFor(awayProfile, homeProfile);
  const probs = probabilitiesFromExpectedGoals(homeExpected, awayExpected);
  const score = generateScoreFromExpectedGoals(rng, homeExpected, awayExpected);

  return {
    fixtureId,
    homeGoals: score.home,
    awayGoals: score.away,
    homeWinProb: probs.homeWin,
    drawProb: probs.draw,
    awayWinProb: probs.awayWin,
  };
}

function resolvePenaltyKickOutcome(
  kickerSkill: number,
  goalkeeperSkill: number,
  rng: () => number
): PenaltyKickOutcome {
  const offTargetProb = 0.08;
  const postProb = 0.07;
  const savedProb = clamp(
    0.19 + (goalkeeperSkill - kickerSkill) / 120,
    0.1,
    0.28
  );
  const goalProb = 1 - offTargetProb - postProb - savedProb;
  const roll = rng();

  if (roll < goalProb) return "goal";
  if (roll < goalProb + savedProb) return "saved";
  if (roll < goalProb + savedProb + offTargetProb) return "off_target";
  return "post";
}

function getPenaltyTakers(players: Player[], lineupIds: number[]): Player[] {
  const lineup = lineupIds
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => !!p);
  const outfield = lineup.filter((p) => p.position !== "GK");
  const pool = outfield.length > 0 ? outfield : lineup;
  return [...pool].sort((a, b) => effectiveSkill(b) - effectiveSkill(a));
}

function getPenaltyGoalkeeper(players: Player[], lineupIds: number[]): Player {
  const lineup = lineupIds
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => !!p);
  const keeper =
    [...lineup]
      .filter((p) => p.position === "GK")
      .sort((a, b) => effectiveSkill(b) - effectiveSkill(a))[0] ??
    [...players].sort((a, b) => effectiveSkill(b) - effectiveSkill(a))[0];
  return keeper ?? players[0]!;
}

export function resolvePenaltyKick(
  kicker: Player,
  goalkeeper: Player,
  rng: () => number
): PenaltyKickOutcome {
  return resolvePenaltyKickOutcome(effectiveSkill(kicker), effectiveSkill(goalkeeper), rng);
}

export function simulateExtraTimeScore(
  fixtureId: number,
  homeClub: Club,
  awayClub: Club,
  homePlayers: Player[],
  awayPlayers: Player[],
  seed: number,
  homeLineupIds: number[],
  awayLineupIds: number[],
  homeExpulsions = 0,
  awayExpulsions = 0
): { homeGoals: number; awayGoals: number } {
  const rng = createRng(seed + fixtureId + 8000);
  const homeProfile = buildTeamProfile(
    homeClub,
    homePlayers,
    false,
    homeLineupIds,
    false,
    homeExpulsions
  );
  const awayProfile = buildTeamProfile(
    awayClub,
    awayPlayers,
    false,
    awayLineupIds,
    false,
    awayExpulsions
  );
  const homeExpected = expectedGoalsFor(homeProfile, awayProfile) * EXTRA_TIME_XG_FACTOR;
  const awayExpected = expectedGoalsFor(awayProfile, homeProfile) * EXTRA_TIME_XG_FACTOR;
  const sampled = generateScoreFromExpectedGoals(rng, homeExpected, awayExpected);
  return { homeGoals: sampled.home, awayGoals: sampled.away };
}

export function simulatePenaltyShootout(
  homePlayers: Player[],
  awayPlayers: Player[],
  homeLineupIds: number[],
  awayLineupIds: number[],
  seed: number
): PenaltyShootoutSummary {
  const rng = createRng(seed + 12000);
  const homeTakers = getPenaltyTakers(homePlayers, homeLineupIds);
  const awayTakers = getPenaltyTakers(awayPlayers, awayLineupIds);
  const homeKeeper = getPenaltyGoalkeeper(homePlayers, homeLineupIds);
  const awayKeeper = getPenaltyGoalkeeper(awayPlayers, awayLineupIds);
  const kicks: PenaltyShootoutSummary["kicks"] = [];

  let homeGoals = 0;
  let awayGoals = 0;
  let homeTaken = 0;
  let awayTaken = 0;
  let homeIdx = 0;
  let awayIdx = 0;

  const takeKick = (team: "home" | "away", round: number, suddenDeath: boolean) => {
    if (team === "home") {
      const kicker = homeTakers[homeIdx % homeTakers.length] ?? homePlayers[0]!;
      homeIdx++;
      homeTaken++;
      const outcome = resolvePenaltyKick(kicker, awayKeeper, rng);
      if (outcome === "goal") homeGoals++;
      kicks.push({
        round,
        suddenDeath,
        team,
        kickerId: kicker.id,
        kickerName: kicker.name,
        outcome,
      });
      return;
    }
    const kicker = awayTakers[awayIdx % awayTakers.length] ?? awayPlayers[0]!;
    awayIdx++;
    awayTaken++;
    const outcome = resolvePenaltyKick(kicker, homeKeeper, rng);
    if (outcome === "goal") awayGoals++;
    kicks.push({
      round,
      suddenDeath,
      team,
      kickerId: kicker.id,
      kickerName: kicker.name,
      outcome,
    });
  };

  const winnerByRegularSeries = (): "home" | "away" | null => {
    const homeRemaining = 5 - homeTaken;
    const awayRemaining = 5 - awayTaken;
    if (homeGoals > awayGoals + awayRemaining) return "home";
    if (awayGoals > homeGoals + homeRemaining) return "away";
    return null;
  };

  for (let round = 1; round <= 5; round++) {
    takeKick("home", round, false);
    const earlyAfterHome = winnerByRegularSeries();
    if (earlyAfterHome) {
      return { homeGoals, awayGoals, winnerTeam: earlyAfterHome, kicks };
    }
    takeKick("away", round, false);
    const earlyAfterAway = winnerByRegularSeries();
    if (earlyAfterAway) {
      return { homeGoals, awayGoals, winnerTeam: earlyAfterAway, kicks };
    }
  }

  let suddenRound = 6;
  while (true) {
    takeKick("home", suddenRound, true);
    takeKick("away", suddenRound, true);
    if (homeGoals !== awayGoals) {
      return {
        homeGoals,
        awayGoals,
        winnerTeam: homeGoals > awayGoals ? "home" : "away",
        kicks,
      };
    }
    suddenRound++;
  }
}

export function assignGoalScorers(
  players: Player[],
  goalEvents: GoalEvent[]
): void {
  for (const event of goalEvents) {
    if (event.playerId) {
      const scorer = players.find((p) => p.id === event.playerId);
      if (scorer) scorer.seasonGoals++;
    }
  }
}
