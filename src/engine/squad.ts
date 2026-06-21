import type { Formation, Player, Position, SeasonPhase } from "@/engine/types";
import {
  FORMATION_LINEUP,
  FORMATION_PRESETS,
  LINEUP_POSITION_LIMITS,
  MIN_SQUAD_GK,
  MIN_SQUAD_OUTFIELD,
  MIN_SQUAD_SIZE,
} from "@/engine/types";
import { effectiveSkill, isPlayerAvailable, isPlayerInjured, isPlayerPendingRegistration, isPlayerSuspended } from "@/engine/player";

export const MAX_BENCH = 7;
export const LINEUP_SIZE = 11;

const POSITION_ORDER: Record<Position, number> = {
  GK: 0,
  DF: 1,
  MF: 2,
  FW: 3,
};

export function sortPlayerIdsByPosition(
  ids: number[],
  players: Player[]
): number[] {
  return [...ids].sort((a, b) => {
    const pa = players.find((p) => p.id === a);
    const pb = players.find((p) => p.id === b);
    if (!pa || !pb) return 0;
    const posDiff = POSITION_ORDER[pa.position] - POSITION_ORDER[pb.position];
    if (posDiff !== 0) return posDiff;
    return effectiveSkill(pb) - effectiveSkill(pa);
  });
}

export type SquadStatus = "starter" | "bench" | "out";

export function getSquadStatus(
  playerId: number,
  lineupIds: number[],
  benchIds: number[]
): SquadStatus {
  if (lineupIds.includes(playerId)) return "starter";
  if (benchIds.includes(playerId)) return "bench";
  return "out";
}

export function countLineupPositions(
  lineupIds: number[],
  players: Player[]
): Record<Position, number> {
  const counts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
  for (const id of lineupIds) {
    const p = players.find((x) => x.id === id);
    if (p) counts[p.position]++;
  }
  return counts;
}

export function deriveTacticLabel(
  lineupIds: number[],
  players: Player[]
): string {
  const c = countLineupPositions(lineupIds, players);
  return `${c.DF}-${c.MF}-${c.FW}`;
}

export function detectFormationMatch(
  lineupIds: number[],
  players: Player[]
): Formation | null {
  if (lineupIds.length !== LINEUP_SIZE) return null;

  const counts = countLineupPositions(lineupIds, players);
  if (counts.GK !== 1) return null;

  for (const formation of FORMATION_PRESETS) {
    const preset = FORMATION_LINEUP[formation];
    if (
      counts.DF === preset.DF &&
      counts.MF === preset.MF &&
      counts.FW === preset.FW
    ) {
      return formation;
    }
  }

  return null;
}

export function buildSquadForFormation(
  players: Player[],
  formation: Formation
): { lineupIds: number[]; benchIds: number[] } {
  const positions = FORMATION_LINEUP[formation];
  const available = players.filter((p) => isPlayerAvailable(p));
  const byPos: Record<Position, Player[]> = { GK: [], DF: [], MF: [], FW: [] };

  for (const p of available) byPos[p.position].push(p);
  for (const pos of Object.keys(byPos) as Position[]) {
    byPos[pos].sort((a, b) => effectiveSkill(b) - effectiveSkill(a));
  }

  const lineupIds: number[] = [];
  for (const pos of ["GK", "DF", "MF", "FW"] as Position[]) {
    lineupIds.push(
      ...byPos[pos].slice(0, positions[pos]).map((p) => p.id)
    );
  }

  while (lineupIds.length < LINEUP_SIZE) {
    const remaining = available
      .filter((p) => !lineupIds.includes(p.id))
      .sort((a, b) => effectiveSkill(b) - effectiveSkill(a));
    const next = remaining.find((p) => {
      const trial = [...lineupIds, p.id];
      return trial.length <= LINEUP_SIZE && isValidLineup(trial, players);
    });
    if (!next) break;
    lineupIds.push(next.id);
  }

  const benchIds = pickBenchPlayers(players, lineupIds);
  return {
    lineupIds: sortPlayerIdsByPosition(lineupIds, players),
    benchIds: sortPlayerIdsByPosition(benchIds, players),
  };
}

function canCompleteValidLineup(
  partialIds: number[],
  allAvailable: Player[],
  targetSize = LINEUP_SIZE
): boolean {
  if (partialIds.length > targetSize) return false;
  if (partialIds.length === targetSize) {
    return isValidLineup(partialIds, allAvailable);
  }

  const remaining = allAvailable.filter((p) => !partialIds.includes(p.id));
  const slotsLeft = targetSize - partialIds.length;
  if (remaining.length < slotsLeft) return false;

  const counts = countLineupPositions(partialIds, allAvailable);

  for (const pos of ["GK", "DF", "MF", "FW"] as Position[]) {
    const { min, max } = LINEUP_POSITION_LIMITS[pos];
    if (counts[pos] > max) return false;
    const needMin = min - counts[pos];
    const pool = remaining.filter((p) => p.position === pos).length;
    if (needMin > pool) return false;
  }

  let minForced = 0;
  for (const pos of ["GK", "DF", "MF", "FW"] as Position[]) {
    minForced += Math.max(0, LINEUP_POSITION_LIMITS[pos].min - counts[pos]);
  }
  if (minForced > slotsLeft) return false;

  let maxFill = 0;
  for (const pos of ["GK", "DF", "MF", "FW"] as Position[]) {
    maxFill += Math.max(0, LINEUP_POSITION_LIMITS[pos].max - counts[pos]);
  }
  if (slotsLeft > maxFill) return false;

  return true;
}

/** Goleiro mais forte + 10 melhores de campo que formem escalação válida. */
export function buildBestSkillSquad(
  players: Player[]
): { lineupIds: number[]; benchIds: number[] } {
  const available = players.filter((p) => isPlayerAvailable(p));
  const bySkill = [...available].sort(
    (a, b) => effectiveSkill(b) - effectiveSkill(a)
  );

  const lineupIds: number[] = [];
  const bestGk = bySkill.find((p) => p.position === "GK");
  if (bestGk) lineupIds.push(bestGk.id);

  for (const player of bySkill) {
    if (lineupIds.includes(player.id)) continue;
    if (lineupIds.length >= LINEUP_SIZE) break;
    const trial = [...lineupIds, player.id];
    if (canCompleteValidLineup(trial, available)) {
      lineupIds.push(player.id);
    }
  }

  if (lineupIds.length < LINEUP_SIZE) {
    for (const pos of ["GK", "DF", "MF", "FW"] as Position[]) {
      const counts = countLineupPositions(lineupIds, available);
      const need = LINEUP_POSITION_LIMITS[pos].min - counts[pos];
      if (need <= 0) continue;
      const candidates = available
        .filter((p) => p.position === pos && !lineupIds.includes(p.id))
        .sort((a, b) => effectiveSkill(b) - effectiveSkill(a));
      for (const player of candidates.slice(0, need)) {
        if (lineupIds.length >= LINEUP_SIZE) break;
        const trial = [...lineupIds, player.id];
        if (canCompleteValidLineup(trial, available)) {
          lineupIds.push(player.id);
        }
      }
    }
  }

  for (const player of bySkill) {
    if (lineupIds.includes(player.id)) continue;
    if (lineupIds.length >= LINEUP_SIZE) break;
    const trial = [...lineupIds, player.id];
    if (isValidLineup(trial, available)) {
      lineupIds.push(player.id);
    }
  }

  const benchIds = pickBenchPlayers(players, lineupIds);
  return {
    lineupIds: sortPlayerIdsByPosition(lineupIds, players),
    benchIds: sortPlayerIdsByPosition(benchIds, players),
  };
}

export function buildLineupForFormation(
  players: Player[],
  formation: Formation
): { lineupIds: number[]; benchIds: number[] } {
  if (formation === "Melhores") {
    return buildBestSkillSquad(players);
  }
  return buildSquadForFormation(players, formation);
}

export function isValidLineup(
  lineupIds: number[],
  players: Player[]
): boolean {
  if (lineupIds.length !== LINEUP_SIZE) return false;

  const counts = countLineupPositions(lineupIds, players);

  for (const pos of Object.keys(LINEUP_POSITION_LIMITS) as Position[]) {
    const { min, max } = LINEUP_POSITION_LIMITS[pos];
    if (counts[pos] < min || counts[pos] > max) return false;
  }

  for (const id of lineupIds) {
    const p = players.find((x) => x.id === id);
    if (!p || !isPlayerAvailable(p)) return false;
  }

  return true;
}

export function canCycleToStarter(
  playerId: number,
  lineupIds: number[],
  benchIds: number[],
  players: Player[]
): boolean {
  const player = players.find((p) => p.id === playerId);
  if (!player || !isPlayerAvailable(player)) return false;

  const nextLineup = [...lineupIds.filter((id) => id !== playerId), playerId];
  if (nextLineup.length > LINEUP_SIZE) return false;

  const counts = countLineupPositions(nextLineup, players);
  const limits = LINEUP_POSITION_LIMITS[player.position];
  if (counts[player.position] > limits.max) return false;

  return true;
}

export function canCycleToBench(
  benchIds: number[],
  playerId: number,
  players: Player[]
): boolean {
  const player = players.find((p) => p.id === playerId);
  if (!player || !isPlayerAvailable(player)) return false;
  if (benchIds.includes(playerId)) return true;
  return benchIds.length < MAX_BENCH;
}

export function cyclePlayerStatus(
  playerId: number,
  lineupIds: number[],
  benchIds: number[],
  players: Player[]
): { lineupIds: number[]; benchIds: number[] } | null {
  const status = getSquadStatus(playerId, lineupIds, benchIds);
  let nextLineup = lineupIds.filter((id) => id !== playerId);
  let nextBench = benchIds.filter((id) => id !== playerId);

  if (status === "out") {
    const canStarter =
      nextLineup.length < LINEUP_SIZE &&
      canCycleToStarter(playerId, nextLineup, nextBench, players);

    if (canStarter) {
      nextLineup = [...nextLineup, playerId];
    } else if (canCycleToBench(nextBench, playerId, players)) {
      nextBench = [...nextBench, playerId];
    } else {
      return null;
    }
  } else if (status === "starter") {
    if (!canCycleToBench(nextBench, playerId, players)) return null;
    nextBench = [...nextBench, playerId];
  } else {
    return { lineupIds: nextLineup, benchIds: nextBench };
  }

  return { lineupIds: nextLineup, benchIds: nextBench };
}

export function pickBenchPlayers(
  players: Player[],
  lineupIds: number[],
  maxBench = MAX_BENCH
): number[] {
  return players
    .filter((p) => !lineupIds.includes(p.id) && isPlayerAvailable(p))
    .sort((a, b) => effectiveSkill(b) - effectiveSkill(a))
    .slice(0, maxBench)
    .map((p) => p.id);
}

export function buildDefaultSquad(players: Player[]): {
  lineupIds: number[];
  benchIds: number[];
} {
  return buildSquadForFormation(players, "4-4-2");
}

export function swapSquadPlayers(
  players: Player[],
  lineupIds: number[],
  benchIds: number[],
  playerA: number,
  playerB: number
): { lineupIds: number[]; benchIds: number[] } | null {
  const statusA = getSquadStatus(playerA, lineupIds, benchIds);
  const statusB = getSquadStatus(playerB, lineupIds, benchIds);
  if (statusA === statusB) return null;

  let nextLineup = lineupIds.filter((id) => id !== playerA && id !== playerB);
  let nextBench = benchIds.filter((id) => id !== playerA && id !== playerB);

  const apply = (id: number, status: SquadStatus) => {
    if (status === "starter") nextLineup.push(id);
    if (status === "bench") nextBench.push(id);
  };

  apply(playerA, statusB);
  apply(playerB, statusA);

  if (nextBench.length > MAX_BENCH) return null;
  if (!isValidLineup(nextLineup, players)) return null;

  return {
    lineupIds: sortPlayerIdsByPosition(nextLineup, players),
    benchIds: sortPlayerIdsByPosition(nextBench, players),
  };
}

export function canSellPlayer(
  players: Player[],
  clubId: number,
  playerId: number,
  phase: SeasonPhase = "regular"
): boolean {
  const squad = players.filter((p) => p.clubId === clubId);
  const target = squad.find((p) => p.id === playerId);
  if (!target) return false;

  if (target.raisePending && phase === "regular") return false;
  if (target.saleBlockedThisSeason && phase === "regular") return false;

  const remaining = squad.filter((p) => p.id !== playerId);
  if (remaining.length < MIN_SQUAD_SIZE) return false;

  const gk = remaining.filter((p) => p.position === "GK").length;
  const outfield = remaining.length - gk;

  if (target.position === "GK" && gk < MIN_SQUAD_GK) return false;
  if (outfield < MIN_SQUAD_OUTFIELD) return false;

  const counts = countLineupPositions(
    remaining.map((p) => p.id),
    remaining
  );
  if (counts.GK < LINEUP_POSITION_LIMITS.GK.min) return false;
  if (counts.DF < LINEUP_POSITION_LIMITS.DF.min) return false;
  if (counts.MF < LINEUP_POSITION_LIMITS.MF.min) return false;

  return true;
}

/** Remove suspenso, lesionado e CON de titulares e reservas. */
export function removeUnavailableFromSquad(
  lineupIds: number[],
  benchIds: number[],
  players: Player[]
): { lineupIds: number[]; benchIds: number[] } {
  const unavailable = new Set(
    players.filter((p) => !isPlayerAvailable(p)).map((p) => p.id)
  );
  return {
    lineupIds: lineupIds.filter((id) => !unavailable.has(id)),
    benchIds: benchIds.filter((id) => !unavailable.has(id)),
  };
}

/** @deprecated Use removeUnavailableFromSquad */
export function removeSuspendedFromLineup(
  lineupIds: number[],
  benchIds: number[],
  players: Player[]
): { lineupIds: number[]; benchIds: number[] } {
  return removeUnavailableFromSquad(lineupIds, benchIds, players);
}

export function getLineupValidationMessage(
  lineupIds: number[],
  players: Player[]
): string | null {
  if (lineupIds.length === 0) return null;
  if (lineupIds.length !== LINEUP_SIZE) {
    return `Escalacao precisa de ${LINEUP_SIZE} titulares (atual: ${lineupIds.length}).`;
  }
  const counts = countLineupPositions(lineupIds, players);
  if (counts.GK < LINEUP_POSITION_LIMITS.GK.min) return "Precisa de 1 goleiro.";
  if (counts.DF < LINEUP_POSITION_LIMITS.DF.min)
    return `Minimo ${LINEUP_POSITION_LIMITS.DF.min} defensores.`;
  if (counts.MF < LINEUP_POSITION_LIMITS.MF.min)
    return `Minimo ${LINEUP_POSITION_LIMITS.MF.min} meio-campistas.`;
  if (counts.DF > LINEUP_POSITION_LIMITS.DF.max)
    return `Maximo ${LINEUP_POSITION_LIMITS.DF.max} defensores.`;
  if (counts.MF > LINEUP_POSITION_LIMITS.MF.max)
    return `Maximo ${LINEUP_POSITION_LIMITS.MF.max} meio-campistas.`;
  if (counts.FW > LINEUP_POSITION_LIMITS.FW.max)
    return `Maximo ${LINEUP_POSITION_LIMITS.FW.max} atacantes.`;
  for (const id of lineupIds) {
    const p = players.find((x) => x.id === id);
    if (p && isPlayerSuspended(p)) return `${p.name} esta suspenso.`;
    if (p && isPlayerPendingRegistration(p))
      return `${p.name} aguarda inscricao (CON).`;
    if (p && p.injuryDays > 0) return `${p.name} esta lesionado (${p.injuryDays}R).`;
  }
  return null;
}
