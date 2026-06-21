import type { Player, Position } from "@/engine/types";

export const STAR_ICON = "⭐";
export const STAR_MIN_PER_SQUAD = 1;
export const STAR_MAX_PER_SQUAD = 4;
export const STAR_DISABLE_THRESHOLD = 5;
export const STAR_SALARY_MULTIPLIER = 1.12;
export const STAR_VALUE_MULTIPLIER = 1.15;
export const STAR_GOAL_WEIGHT_MULTIPLIER = 1.12;

const STAR_ELIGIBLE_POSITIONS: Position[] = ["MF", "FW"];

export function isStarEligiblePosition(position: Position): boolean {
  return STAR_ELIGIBLE_POSITIONS.includes(position);
}

export function countActiveStarsInLineup(lineup: Player[]): number {
  return lineup.filter((player) => player.isStar && isStarEligiblePosition(player.position))
    .length;
}

export function shouldApplyStarEffects(lineup: Player[]): boolean {
  return countActiveStarsInLineup(lineup) < STAR_DISABLE_THRESHOLD;
}

export function formatPlayerNameWithStar(name: string, isStar: boolean): string {
  return isStar ? `${name} ${STAR_ICON}` : name;
}

export function assignRandomStarsToSquad(players: Player[], rng: () => number): void {
  const eligible = players.filter((player) => isStarEligiblePosition(player.position));
  if (eligible.length === 0) {
    return;
  }
  const maxStars = Math.min(STAR_MAX_PER_SQUAD, eligible.length);
  const minStars = Math.min(STAR_MIN_PER_SQUAD, maxStars);
  const starsToAssign =
    minStars + Math.floor(rng() * (maxStars - minStars + 1));

  const shuffled = [...eligible];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }

  const selectedIds = new Set(shuffled.slice(0, starsToAssign).map((player) => player.id));
  for (const player of players) {
    player.isStar =
      selectedIds.has(player.id) && isStarEligiblePosition(player.position);
  }
}
