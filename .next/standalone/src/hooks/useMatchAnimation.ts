"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { LiveMatchPlan, Formation, Player } from "@/engine/types";

interface PlayerDot {
  id: number;
  x: number;
  y: number;
  number: number;
  name: string;
}

interface UseMatchAnimationProps {
  plan: LiveMatchPlan;
  homePlayers: Player[];
  awayPlayers: Player[];
  homeFormation: Formation;
  awayFormation: Formation;
  matchSpeed: number;
}

interface MatchAnimationState {
  homeDots: PlayerDot[];
  awayDots: PlayerDot[];
  ballX: number;
  ballY: number;
  currentMinute: number;
  ballHolderId: number | null;
  eventMessage: string | null;
  eventFlash: boolean;
  goals: { home: number; away: number };
}

const FORMATION_POSITIONS: Record<string, { x: number; y: number }[]> = {
  "4-4-2": [
    { x: 50, y: 92 }, { x: 18, y: 72 }, { x: 35, y: 76 }, { x: 65, y: 76 },
    { x: 82, y: 72 }, { x: 12, y: 50 }, { x: 32, y: 48 }, { x: 68, y: 48 },
    { x: 88, y: 50 }, { x: 35, y: 28 }, { x: 65, y: 28 },
  ],
  "4-3-3": [
    { x: 50, y: 92 }, { x: 18, y: 74 }, { x: 35, y: 78 }, { x: 65, y: 78 },
    { x: 82, y: 74 }, { x: 25, y: 52 }, { x: 50, y: 55 }, { x: 75, y: 52 },
    { x: 20, y: 30 }, { x: 50, y: 22 }, { x: 80, y: 30 },
  ],
  "4-2-4": [
    { x: 50, y: 92 }, { x: 18, y: 74 }, { x: 35, y: 78 }, { x: 65, y: 78 },
    { x: 82, y: 74 }, { x: 25, y: 55 }, { x: 75, y: 55 },
    { x: 10, y: 30 }, { x: 35, y: 20 }, { x: 65, y: 20 }, { x: 90, y: 30 },
  ],
  "5-4-1": [
    { x: 50, y: 92 }, { x: 10, y: 76 }, { x: 28, y: 80 }, { x: 50, y: 82 },
    { x: 72, y: 80 }, { x: 90, y: 76 },
    { x: 18, y: 52 }, { x: 35, y: 48 }, { x: 65, y: 48 }, { x: 82, y: 52 },
    { x: 50, y: 26 },
  ],
  "5-3-2": [
    { x: 50, y: 92 }, { x: 10, y: 76 }, { x: 28, y: 80 }, { x: 50, y: 82 },
    { x: 72, y: 80 }, { x: 90, y: 76 },
    { x: 25, y: 52 }, { x: 50, y: 55 }, { x: 75, y: 52 },
    { x: 35, y: 28 }, { x: 65, y: 28 },
  ],
  "3-3-4": [
    { x: 50, y: 92 }, { x: 22, y: 78 }, { x: 50, y: 82 }, { x: 78, y: 78 },
    { x: 18, y: 55 }, { x: 50, y: 50 }, { x: 82, y: 55 },
    { x: 10, y: 30 }, { x: 35, y: 20 }, { x: 65, y: 20 }, { x: 90, y: 30 },
  ],
  "3-4-3": [
    { x: 50, y: 92 }, { x: 22, y: 78 }, { x: 50, y: 82 }, { x: 78, y: 78 },
    { x: 12, y: 55 }, { x: 35, y: 52 }, { x: 65, y: 52 }, { x: 88, y: 55 },
    { x: 20, y: 30 }, { x: 50, y: 22 }, { x: 80, y: 30 },
  ],
  "5-5-0": [
    { x: 50, y: 92 }, { x: 10, y: 76 }, { x: 28, y: 80 }, { x: 50, y: 82 },
    { x: 72, y: 80 }, { x: 90, y: 76 },
    { x: 8, y: 52 }, { x: 25, y: 48 }, { x: 50, y: 45 }, { x: 75, y: 48 }, { x: 92, y: 52 },
  ],
};

function getPositions(formation: string): { x: number; y: number }[] {
  return FORMATION_POSITIONS[formation] ?? FORMATION_POSITIONS["4-4-2"]!;
}

function assignNumbers(players: Player[], formation: string, isHome: boolean): PlayerDot[] {
  const positions = getPositions(formation);
  const sorted = [...players].sort((a, b) => {
    const order = { GK: 0, DF: 1, MF: 2, FW: 3 };
    return (order[a.position] ?? 99) - (order[b.position] ?? 99);
  });
  return sorted.slice(0, 11).map((p, i) => {
    const pos = positions[i] ?? positions[positions.length - 1]!;
    return {
      id: p.id,
      x: isHome ? pos.x : 100 - pos.x,
      y: pos.y,
      number: (i + 1),
      name: p.name,
    };
  });
}

function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export function useMatchAnimation({
  plan,
  homePlayers,
  awayPlayers,
  homeFormation,
  awayFormation,
  matchSpeed,
}: UseMatchAnimationProps): MatchAnimationState {
  const [state, setState] = useState<MatchAnimationState>(() => ({
    homeDots: assignNumbers(homePlayers, homeFormation, true),
    awayDots: assignNumbers(awayPlayers, awayFormation, false),
    ballX: 50,
    ballY: 50,
    currentMinute: 0,
    ballHolderId: null,
    eventMessage: null,
    eventFlash: false,
    goals: { home: 0, away: 0 },
  }));

  const animRef = useRef<number | null>(null);
  const frameRef = useRef(0);
  const eventIndexRef = useRef(0);
  const goalsRef = useRef({ home: 0, away: 0 });
  const minuteRef = useRef(0);
  const maxMinute = plan.events.length > 0
    ? Math.max(...plan.events.map((e) => e.minute), 90)
    : 90;

  // Seeded RNG
  const seedRef = useRef(plan.fixtureId * 2654435761 + plan.homeClubId);

  const rng = useCallback(() => {
    seedRef.current = (seedRef.current * 1664525 + 1013904223) & 0xffffffff;
    return (seedRef.current >>> 0) / 0xffffffff;
  }, []);

  useEffect(() => {
    const baseInterval = matchSpeed;
    const intervalMs = Math.max(10, 200 - baseInterval * 3);

    function tick() {
      frameRef.current++;
      minuteRef.current = Math.min(
        Math.floor((frameRef.current * 90) / (90 * (1000 / intervalMs))) + 1,
        maxMinute
      );
      const minute = minuteRef.current;

      // Process events at this minute
      const events = plan.events.filter((e) => e.minute === minute);
      const cardEvents = (plan.cardEvents ?? []).filter((e) => e.minute === minute);
      const injuryEvents = (plan.injuryEvents ?? []).filter((e) => e.minute === minute);

      let newBallHolder: number | null = null;
      let eventMsg: string | null = null;
      let flash = false;

      if (events.length > 0) {
        for (const ev of events) {
          const playerId = ev.playerId ?? 0;
          const playerName = ev.playerName ?? "Jogador";
          newBallHolder = playerId;
          eventMsg = `${minute}' ⚽ ${playerName} GOL!`;
          flash = true;
          if (ev.team === "home") goalsRef.current.home++;
          else goalsRef.current.away++;
        }
      } else if (cardEvents.length > 0) {
        for (const ce of cardEvents) {
          newBallHolder = ce.playerId;
          eventMsg = `${minute}' ${ce.type === "red" ? "🟥" : "🟨"} ${ce.playerName}`;
        }
      } else if (injuryEvents.length > 0) {
        for (const ie of injuryEvents) {
          newBallHolder = ie.playerId;
          eventMsg = `${minute}' 🩹 ${ie.playerName} lesionado`;
        }
      } else {
        // Random ball movement between players
        const allDots =
          rng() < 0.5
            ? [...state.homeDots, ...state.awayDots]
            : [...state.awayDots, ...state.homeDots];
        const holder = allDots[Math.floor(rng() * allDots.length)];
        if (holder) {
          newBallHolder = holder.id;
        }
      }

      setState((prev) => {
        // Animate dots slightly (players move around)
        const animateDots = (dots: PlayerDot[], isHome: boolean): PlayerDot[] => {
          const basePositions = assignNumbers(
            isHome ? homePlayers : awayPlayers,
            isHome ? homeFormation : awayFormation,
            isHome
          );
          return dots.map((dot, i) => {
            const base = basePositions[i];
            if (!base) return dot;
            const driftX = (rng() - 0.5) * 6;
            const driftY = (rng() - 0.5) * 4;
            // Holder moves toward ball
            if (dot.id === newBallHolder) {
              return {
                ...dot,
                x: base.x + driftX * 0.5,
                y: base.y + driftY * 0.5 - 2,
              };
            }
            return {
              ...dot,
              x: base.x + driftX * 0.3,
              y: base.y + driftY * 0.3,
            };
          });
        };

        const newHome = animateDots(prev.homeDots, true);
        const newAway = animateDots(prev.awayDots, false);

        // Ball position follows holder
        const allDots = [...newHome, ...newAway];
        const holder = allDots.find((d) => d.id === newBallHolder) ?? allDots.find((d) => d.id === prev.ballHolderId);
        let bx = prev.ballX;
        let by = prev.ballY;
        if (holder) {
          bx = holder.x;
          by = holder.y;
        }

        return {
          homeDots: newHome,
          awayDots: newAway,
          ballX: bx,
          ballY: by,
          currentMinute: minute,
          ballHolderId: holder?.id ?? prev.ballHolderId,
          eventMessage: eventMsg ?? (prev.currentMinute !== minute ? null : prev.eventMessage),
          eventFlash: flash || (eventMsg ? true : prev.currentMinute !== minute ? false : prev.eventFlash),
          goals: { ...goalsRef.current },
        };
      });

      if (minute >= maxMinute) {
        if (animRef.current) cancelAnimationFrame(animRef.current);
        return;
      }

      animRef.current = setTimeout(tick, intervalMs) as unknown as number;
    }

    animRef.current = setTimeout(tick, 500) as unknown as number;
    return () => {
      if (animRef.current) clearTimeout(animRef.current as unknown as number);
    };
  }, [plan, homePlayers, awayPlayers, homeFormation, awayFormation, matchSpeed, maxMinute, rng, state.homeDots, state.awayDots]);

  return state;
}
