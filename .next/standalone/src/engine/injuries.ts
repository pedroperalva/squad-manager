import type { InjuryEvent, LiveMatchPlan, Player } from "@/engine/types";
import { calculatePlayerValue, isPlayerAvailable } from "@/engine/player";
import {
  isValidLineup,
  pickBenchPlayers,
  sortPlayerIdsByPosition,
} from "@/engine/squad";
import { createRng, randomInt } from "@/data/name-generator";

/** Chance base em jogo completo (90 min). Metade do jogo usa metade disso. */
export const INJURY_HALF_CHANCE = 0.075;

export function getInjuryChanceForMinuteSpan(
  minuteMin: number,
  minuteMax: number
): number {
  const span = Math.max(1, minuteMax - minuteMin + 1);
  return span <= 45 ? INJURY_HALF_CHANCE * 0.5 : INJURY_HALF_CHANCE;
}

const INJURY_DAY_WEIGHTS: { days: number; weight: number }[] = [
  { days: 1, weight: 35 },
  { days: 2, weight: 25 },
  { days: 3, weight: 17 },
  { days: 4, weight: 12 },
  { days: 5, weight: 6 },
  { days: 6, weight: 3 },
  { days: 7, weight: 2 },
];

export function injurySkillLoss(days: number): number {
  const clamped = Math.max(1, Math.min(7, days));
  return 3 + Math.round(((clamped - 1) * 4) / 6);
}

export function rollInjuryDays(rng: () => number): number {
  const total = INJURY_DAY_WEIGHTS.reduce((sum, e) => sum + e.weight, 0);
  let roll = rng() * total;
  for (const entry of INJURY_DAY_WEIGHTS) {
    roll -= entry.weight;
    if (roll <= 0) return entry.days;
  }
  return 1;
}

export function generateMatchInjuryEvents(
  lineup: Player[],
  team: "home" | "away",
  seed: number,
  minuteMin: number,
  minuteMax: number,
  excludePlayerIds: ReadonlySet<number> = new Set()
): InjuryEvent[] {
  const eligible = lineup.filter(
    (p) => isPlayerAvailable(p) && !excludePlayerIds.has(p.id)
  );
  if (eligible.length === 0) return [];

  const rng = createRng(seed + lineup.length * 23);
  if (rng() > getInjuryChanceForMinuteSpan(minuteMin, minuteMax)) return [];

  const player = eligible[randomInt(rng, 0, eligible.length - 1)];
  if (!player) return [];

  const days = rollInjuryDays(rng);
  const minute = randomInt(rng, minuteMin, minuteMax);

  return [
    {
      minute,
      team,
      playerId: player.id,
      playerName: player.name,
      days,
    },
  ];
}

export function applyInjuryToPlayer(
  player: Player,
  days: number
): string | null {
  const loss = injurySkillLoss(days);
  player.injuryDays = Math.max(player.injuryDays, days);
  const before = player.skill;
  player.skill = Math.max(1, player.skill - loss);
  player.value = calculatePlayerValue(player.skill, player.aggressiveness, player.isStar);
  player.form = player.skill - before;
  return `${player.name} lesionado por ${days} jogo${days > 1 ? "s" : ""} (-${loss} forca).`;
}

export function applyInjuriesAfterMatch(
  players: Player[],
  events: InjuryEvent[]
): { messages: string[]; newlyInjured: Set<number> } {
  const messages: string[] = [];
  const newlyInjured = new Set<number>();
  const seen = new Set<number>();

  for (const event of events) {
    if (seen.has(event.playerId)) continue;
    seen.add(event.playerId);

    const player = players.find((p) => p.id === event.playerId);
    if (!player) continue;

    const msg = applyInjuryToPlayer(player, event.days);
    if (msg) {
      messages.push(msg);
      newlyInjured.add(player.id);
    }
  }

  return { messages, newlyInjured };
}

export function tickInjuriesAfterMatch(
  players: Player[],
  clubIdsWhoPlayed: number[],
  skipPlayerIds: Set<number> = new Set()
): void {
  for (const clubId of clubIdsWhoPlayed) {
    const squad = players.filter((p) => p.clubId === clubId);
    for (const p of squad) {
      if (p.injuryDays > 0 && !skipPlayerIds.has(p.id)) {
        p.injuryDays--;
      }
    }
  }
}

export function findBestInjuryReplacement(
  players: Player[],
  lineupIds: number[],
  injuredPlayerId: number
): number | null {
  const injured = players.find((p) => p.id === injuredPlayerId);
  if (!injured) return null;

  const benchPool = pickBenchPlayers(players, lineupIds);
  const candidates = benchPool
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => !!p && isPlayerAvailable(p));

  const samePos = candidates.filter((p) => p.position === injured.position);
  const pool = samePos.length > 0 ? samePos : candidates;

  for (const candidate of pool) {
    const trialLineup = lineupIds.map((id) =>
      id === injuredPlayerId ? candidate.id : id
    );
    if (isValidLineup(trialLineup, players)) {
      return candidate.id;
    }
  }

  for (const candidate of candidates) {
    const trialLineup = lineupIds.map((id) =>
      id === injuredPlayerId ? candidate.id : id
    );
    if (isValidLineup(trialLineup, players)) {
      return candidate.id;
    }
  }

  return null;
}

export function applyInjurySubstitutionToLineup(
  players: Player[],
  lineupIds: number[],
  injuredPlayerId: number
): number[] | null {
  const replacementId = findBestInjuryReplacement(
    players,
    lineupIds,
    injuredPlayerId
  );
  if (replacementId == null) return null;

  const nextLineup = lineupIds.map((id) =>
    id === injuredPlayerId ? replacementId : id
  );
  if (!isValidLineup(nextLineup, players)) return null;
  return sortPlayerIdsByPosition(nextLineup, players);
}

export function applyCpuInjurySubstitutions(
  players: Player[],
  plan: LiveMatchPlan,
  manualSubsTeams: Set<"home" | "away"> = new Set()
): LiveMatchPlan {
  let homeLineupIds = [...plan.homeLineupIds];
  let awayLineupIds = [...plan.awayLineupIds];
  const events = plan.injuryEvents ?? [];

  for (const event of events) {
    if (manualSubsTeams.has(event.team)) continue;

    const lineupIds =
      event.team === "home" ? homeLineupIds : awayLineupIds;
    const clubId =
      event.team === "home" ? plan.homeClubId : plan.awayClubId;
    const squad = players.filter((p) => p.clubId === clubId);
    const updated = applyInjurySubstitutionToLineup(
      squad,
      lineupIds,
      event.playerId
    );
    if (!updated) continue;
    if (event.team === "home") homeLineupIds = updated;
    else awayLineupIds = updated;
  }

  return { ...plan, homeLineupIds, awayLineupIds };
}

export function appendMatchInjuries(
  players: Player[],
  plan: LiveMatchPlan,
  homeLineup: Player[],
  awayLineup: Player[],
  seed: number,
  minuteMin: number,
  minuteMax: number,
  manualSubsTeams: Set<"home" | "away"> = new Set()
): LiveMatchPlan {
  const homeSquad = players.filter((p) => p.clubId === plan.homeClubId);
  const awaySquad = players.filter((p) => p.clubId === plan.awayClubId);
  const homeFromPlan = plan.homeLineupIds
    .map((id) => homeSquad.find((p) => p.id === id))
    .filter((p): p is Player => !!p);
  const awayFromPlan = plan.awayLineupIds
    .map((id) => awaySquad.find((p) => p.id === id))
    .filter((p): p is Player => !!p);
  const homeResolved = homeFromPlan.length > 0 ? homeFromPlan : homeLineup;
  const awayResolved = awayFromPlan.length > 0 ? awayFromPlan : awayLineup;

  const homeExcluded = new Set(
    (plan.injuryEvents ?? [])
      .filter((e) => e.team === "home")
      .map((e) => e.playerId)
  );
  const awayExcluded = new Set(
    (plan.injuryEvents ?? [])
      .filter((e) => e.team === "away")
      .map((e) => e.playerId)
  );

  const homeNew = generateMatchInjuryEvents(
    homeResolved,
    "home",
    seed + 500,
    minuteMin,
    minuteMax,
    homeExcluded
  );
  const awayNew = generateMatchInjuryEvents(
    awayResolved,
    "away",
    seed + 600,
    minuteMin,
    minuteMax,
    awayExcluded
  );
  const injuryEvents = mergeInjuryEvents(plan.injuryEvents, [
    ...homeNew,
    ...awayNew,
  ]);
  const withEvents = { ...plan, injuryEvents };
  return applyCpuInjurySubstitutions(players, withEvents, manualSubsTeams);
}

export function mergeInjuryEvents(
  existing: InjuryEvent[] | undefined,
  added: InjuryEvent[]
): InjuryEvent[] {
  const merged = [...(existing ?? []), ...added];
  const byTeam = new Map<"home" | "away", InjuryEvent>();
  for (const event of merged.sort((a, b) => a.minute - b.minute)) {
    if (!byTeam.has(event.team)) {
      byTeam.set(event.team, event);
    }
  }
  return [...byTeam.values()].sort((a, b) => a.minute - b.minute);
}
