import type { MatchSpeed } from "@/engine/types";

const STORAGE_KEY = "squad-manager-match-speed";

export const DEFAULT_MATCH_SPEED: MatchSpeed = 30;

export function loadMatchSpeed(): MatchSpeed {
  if (typeof window === "undefined") return DEFAULT_MATCH_SPEED;
  const raw = localStorage.getItem(STORAGE_KEY);
  const value = Number(raw);
  if (value === 60 || value === 45 || value === 30 || value === 15) {
    return value;
  }
  return DEFAULT_MATCH_SPEED;
}

export function saveMatchSpeed(speed: MatchSpeed): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, String(speed));
}
