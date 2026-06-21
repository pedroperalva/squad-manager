"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Formation, GoalEvent, CardEvent, Player } from "@/engine/types";

interface MiniFieldProps {
  homePlayers: Player[];
  awayPlayers: Player[];
  homeFormation: Formation;
  awayFormation: Formation;
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
  minute: number;
  events?: GoalEvent[];
  cardEvents?: CardEvent[];
  homeColor?: string;
  awayColor?: string;
}

const FIELD_W = 700;
const FIELD_H = 440;

interface SimPlayer {
  id: number;
  name: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  team: "home" | "away";
  number: number;
  position: string;
  hasBall: boolean;
}

interface SimBall {
  x: number;
  y: number;
  visible: boolean;
}

type SimAction =
  | { type: "pass"; fromX: number; fromY: number; toX: number; toY: number; team: "home" | "away" }
  | { type: "shot"; fromX: number; fromY: number; targetX: number; targetY: number; team: "home" | "away" }
  | { type: "save"; x: number; y: number }
  | { type: "goal" }
  | { type: "miss" }
  | { type: "dribble"; fromX: number; fromY: number; toX: number; toY: number; team: "home" | "away" }
  | { type: "longball"; fromX: number; fromY: number; toX: number; toY: number; team: "home" | "away" }
  | { type: "idle" };

const FORMATION_POSITIONS: Record<string, { x: number; y: number }[]> = {
  "4-4-2": [
    { x: 50, y: 92 },  // GK
    { x: 18, y: 72 }, { x: 35, y: 76 }, { x: 65, y: 76 }, { x: 82, y: 72 },  // DF
    { x: 12, y: 50 }, { x: 32, y: 48 }, { x: 68, y: 48 }, { x: 88, y: 50 },  // MF
    { x: 35, y: 28 }, { x: 65, y: 28 },  // FW
  ],
  "4-3-3": [
    { x: 50, y: 92 },
    { x: 18, y: 74 }, { x: 35, y: 78 }, { x: 65, y: 78 }, { x: 82, y: 74 },
    { x: 25, y: 52 }, { x: 50, y: 50 }, { x: 75, y: 52 },
    { x: 20, y: 28 }, { x: 50, y: 22 }, { x: 80, y: 28 },
  ],
  "4-2-4": [
    { x: 50, y: 92 },
    { x: 18, y: 72 }, { x: 35, y: 76 }, { x: 65, y: 76 }, { x: 82, y: 72 },
    { x: 30, y: 55 }, { x: 70, y: 55 },
    { x: 15, y: 28 }, { x: 38, y: 22 }, { x: 62, y: 22 }, { x: 85, y: 28 },
  ],
  "5-4-1": [
    { x: 50, y: 92 },
    { x: 10, y: 74 }, { x: 28, y: 78 }, { x: 50, y: 80 }, { x: 72, y: 78 }, { x: 90, y: 74 },
    { x: 20, y: 52 }, { x: 40, y: 50 }, { x: 60, y: 50 }, { x: 80, y: 52 },
    { x: 50, y: 26 },
  ],
  "5-3-2": [
    { x: 50, y: 92 },
    { x: 10, y: 74 }, { x: 28, y: 78 }, { x: 50, y: 80 }, { x: 72, y: 78 }, { x: 90, y: 74 },
    { x: 25, y: 52 }, { x: 50, y: 50 }, { x: 75, y: 52 },
    { x: 35, y: 28 }, { x: 65, y: 28 },
  ],
  "3-3-4": [
    { x: 50, y: 92 },
    { x: 20, y: 74 }, { x: 50, y: 78 }, { x: 80, y: 74 },
    { x: 18, y: 52 }, { x: 50, y: 50 }, { x: 82, y: 52 },
    { x: 12, y: 28 }, { x: 35, y: 22 }, { x: 65, y: 22 }, { x: 88, y: 28 },
  ],
  "3-4-3": [
    { x: 50, y: 92 },
    { x: 20, y: 76 }, { x: 50, y: 80 }, { x: 80, y: 76 },
    { x: 10, y: 54 }, { x: 35, y: 48 }, { x: 65, y: 48 }, { x: 90, y: 54 },
    { x: 25, y: 28 }, { x: 50, y: 22 }, { x: 75, y: 28 },
  ],
  "5-5-0": [
    { x: 50, y: 92 },
    { x: 10, y: 76 }, { x: 25, y: 80 }, { x: 50, y: 82 }, { x: 75, y: 80 }, { x: 90, y: 76 },
    { x: 15, y: 54 }, { x: 32, y: 48 }, { x: 50, y: 46 }, { x: 68, y: 48 }, { x: 85, y: 54 },
  ],
};

function getPositions(formation: Formation, isHome: boolean): { x: number; y: number }[] {
  const base = FORMATION_POSITIONS[formation] ?? FORMATION_POSITIONS["4-4-2"]!;
  return base.map((p) => ({
    x: isHome ? p.x : 100 - p.x,
    y: isHome ? p.y : 100 - p.y,
  }));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export default function MiniField({
  homePlayers,
  awayPlayers,
  homeFormation,
  awayFormation,
  homeName,
  awayName,
  homeGoals,
  awayGoals,
  minute,
  events = [],
  cardEvents = [],
  homeColor = "#4ade80",
  awayColor = "#f87171",
}: MiniFieldProps) {
  const [simPlayers, setSimPlayers] = useState<SimPlayer[]>([]);
  const [ball, setBall] = useState<SimBall>({ x: 50, y: 50, visible: true });
  const [action, setAction] = useState<SimAction>({ type: "idle" });
  const [goalFlash, setGoalFlash] = useState(false);
  const [scorerName, setScorerName] = useState("");
  const [possession, setPossession] = useState<"home" | "away">("home");
  const [message, setMessage] = useState("");
  const [currentMinute, setCurrentMinute] = useState(0);
  const [eventIndex, setEventIndex] = useState(0);
  const phaseRef = useRef(0);
  const lastScore = useRef({ home: 0, away: 0 });

  const homePositions = useMemo(() => getPositions(homeFormation, true), [homeFormation]);
  const awayPositions = useMemo(() => getPositions(awayFormation, false), [awayFormation]);

  // Inicializa jogadores
  useEffect(() => {
    const homeDots: SimPlayer[] = homePlayers.slice(0, 11).map((p, i) => ({
      id: p.id,
      name: p.name,
      x: homePositions[i]?.x ?? 50,
      y: homePositions[i]?.y ?? 50,
      tx: homePositions[i]?.x ?? 50,
      ty: homePositions[i]?.y ?? 50,
      team: "home" as const,
      number: i + 1,
      position: p.position,
      hasBall: false,
    }));
    const awayDots: SimPlayer[] = awayPlayers.slice(0, 11).map((p, i) => ({
      id: p.id,
      name: p.name,
      x: awayPositions[i]?.x ?? 50,
      y: awayPositions[i]?.y ?? 50,
      tx: awayPositions[i]?.x ?? 50,
      ty: awayPositions[i]?.y ?? 50,
      team: "away" as const,
      number: i + 1,
      position: p.position,
      hasBall: false,
    }));
    setSimPlayers([...homeDots, ...awayDots]);
    setBall({ x: 50, y: 50, visible: true });
    setPossession(Math.random() < 0.5 ? "home" : "away");
    setCurrentMinute(1);
    setEventIndex(0);
    lastScore.current = { home: 0, away: 0 };
  }, [homePlayers, awayPlayers, homePositions, awayPositions]);

  // Sincroniza minuto atual com o minuto da engine
  useEffect(() => {
    if (minute > 0 && minute !== currentMinute) {
      setCurrentMinute(Math.min(currentMinute + 1, minute));
    }
  }, [minute, currentMinute]);

  // Verifica eventos de gol
  useEffect(() => {
    const homeScore = events.filter((e) => e.team === "home" && e.minute <= currentMinute).length;
    const awayScore = events.filter((e) => e.team === "away" && e.minute <= currentMinute).length;

    if (homeScore > lastScore.current.home) {
      const goalEvent = events.find((e) => e.team === "home" && e.minute === currentMinute);
      setScorerName(goalEvent?.playerName ?? homeName);
      triggerGoal();
      lastScore.current.home = homeScore;
    }
    if (awayScore > lastScore.current.away) {
      const goalEvent = events.find((e) => e.team === "away" && e.minute === currentMinute);
      setScorerName(goalEvent?.playerName ?? awayName);
      triggerGoal();
      lastScore.current.away = awayScore;
    }
  }, [currentMinute, events, homeName, awayName]);

  function triggerGoal() {
    setGoalFlash(true);
    setTimeout(() => setGoalFlash(false), 2000);
  }

  // Encontra jogador do time adversário mais próximo da bola
  function findNearestOpponent(
    players: SimPlayer[],
    bx: number,
    by: number,
    team: "home" | "away"
  ): SimPlayer | null {
    let nearest: SimPlayer | null = null;
    let minDist = Infinity;
    for (const p of players) {
      if (p.team !== team && p.position !== "GK") {
        const d = dist(p.x, p.y, bx, by);
        if (d < minDist) {
          minDist = d;
          nearest = p;
        }
      }
    }
    return nearest;
  }

  // Encontra melhor companheiro para passe
  function findBestPassTarget(
    players: SimPlayer[],
    bx: number,
    by: number,
    team: "home" | "away",
    forward: boolean
  ): SimPlayer | null {
    let best: SimPlayer | null = null;
    let bestScore = -Infinity;
    for (const p of players) {
      if (p.team !== team || p.position === "GK") continue;
      if (p.hasBall) continue;
      const d = dist(p.x, p.y, bx, by);
      const forwardness = forward
        ? team === "home"
          ? (100 - p.y)
          : p.y
        : 0;
      const score = forwardness - d * 0.5 + Math.random() * 15;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  // Encontra goleiro do time
  function findGoalkeeper(players: SimPlayer[], team: "home" | "away"): SimPlayer | null {
    return players.find((p) => p.team === team && p.position === "GK") ?? null;
  }

  // Simula um disparo a gol
  function simulateShot(shooter: SimPlayer, players: SimPlayer[], _team: "home" | "away") {
    const gk = findGoalkeeper(players, shooter.team === "home" ? "away" : "home");
    const goalX = shooter.team === "home" ? 50 : 50;
    const goalY = shooter.team === "home" ? 0 : 100;
    const onTarget = Math.random() < 0.55;

    setAction({
      type: "shot",
      fromX: shooter.x,
      fromY: shooter.y,
      targetX: goalX + (Math.random() - 0.5) * 20,
      targetY: goalY + (Math.random() - 0.5) * 4,
      team: shooter.team,
    });

    if (onTarget && gk) {
      const saveChance = Math.random() < 0.35;
      if (!saveChance) {
        // GOL
        setMessage(`${shooter.name} marcou! ⚽`);
        setTimeout(() => setMessage(""), 2000);
        // A engine já conta os gols, aqui só mostra o flash
      } else {
        // Defesa
        setAction({ type: "save", x: gk.x, y: gk.y });
        setMessage(`${shooter.name} chutou! Defesa do goleiro 🧤`);
        setTimeout(() => setMessage(""), 2000);
        changePossession(players, shooter.team === "home" ? "away" : "home");
      }
    } else {
      setMessage(`${shooter.name} chutou para fora!`);
      setTimeout(() => setMessage(""), 2000);
      changePossession(players, shooter.team === "home" ? "away" : "home");
    }
  }

  // Troca a posse de bola
  function changePossession(players: SimPlayer[], newTeam: "home" | "away") {
    setPossession(newTeam);
    const teamPlayers = players.filter((p) => p.team === newTeam && p.position !== "GK");
    if (teamPlayers.length > 0) {
      const receiver = teamPlayers[Math.floor(Math.random() * teamPlayers.length)]!;
      setBall({ x: receiver.x, y: receiver.y, visible: true });
      setSimPlayers((prev) =>
        prev.map((p) => ({ ...p, hasBall: p.id === receiver.id }))
      );
    }
  }

  // Ciclo principal de animação
  useEffect(() => {
    if (simPlayers.length === 0 || currentMinute > 45 || currentMinute > minute) return;

    const interval = setInterval(() => {
      setSimPlayers((prev) => {
        const updated = prev.map((p) => ({ ...p }));
        let ballX = ball.x;
        let ballY = ball.y;

        const attackingTeam = possession;
        const defendingTeam = attackingTeam === "home" ? "away" : "home";

        // Jogadores sem bola se movem suavemente para posições avançadas/recuadas
        for (const p of updated) {
          if (p.hasBall) continue;

          const basePos = p.team === "home"
            ? homePositions[p.number - 1] ?? { x: 50, y: 50 }
            : awayPositions[p.number - 1] ?? { x: 50, y: 50 };

          // Avança ou recua baseado na posse
          let offsetX = 0;
          let offsetY = 0;
          if (p.team === attackingTeam && p.position !== "GK") {
            offsetX = (Math.random() - 0.5) * 12;
            offsetY = p.team === "home" ? -8 - Math.random() * 10 : 8 + Math.random() * 10;
          } else if (p.team === defendingTeam && p.position !== "GK") {
            offsetX = (Math.random() - 0.5) * 8;
            offsetY = p.team === "home" ? 5 + Math.random() * 5 : -5 - Math.random() * 5;
          }

          p.tx = Math.max(2, Math.min(98, basePos.x + offsetX));
          p.ty = Math.max(2, Math.min(98, basePos.y + offsetY));
          p.x = lerp(p.x, p.tx, 0.12);
          p.y = lerp(p.y, p.ty, 0.12);
        }

        // Jogador com a bola
        const ballCarrier = updated.find((p) => p.hasBall);
        if (ballCarrier) {
          const opponent = findNearestOpponent(updated, ballCarrier.x, ballCarrier.y, ballCarrier.team);

          // Verifica se está perto do gol para chutar
          const distToGoal = ballCarrier.team === "home" ? ballCarrier.y : 100 - ballCarrier.y;
          const xDistToCenter = Math.abs(ballCarrier.x - 50);

          if (distToGoal < 20 && xDistToCenter < 25 && Math.random() < 0.3) {
            simulateShot(ballCarrier, updated, ballCarrier.team);
            ballX = ballCarrier.x;
            ballY = ballCarrier.y;
          } else if (opponent && dist(ballCarrier.x, ballCarrier.y, opponent.x, opponent.y) < 8 && Math.random() < 0.4) {
            // Perde a bola - desarme
            setMessage(`${opponent.name} desarmou!`);
            setTimeout(() => setMessage(""), 1500);
            const newTeam = ballCarrier.team === "home" ? "away" : "home";
            setPossession(newTeam);
            ballCarrier.hasBall = false;
            const newHolder = updated.find((p) => p.id === opponent.id);
            if (newHolder) {
              newHolder.hasBall = true;
              ballX = opponent.x;
              ballY = opponent.y;
            }
          } else if (Math.random() < 0.15) {
            // Tenta passe
            const target = findBestPassTarget(
              updated,
              ballCarrier.x,
              ballCarrier.y,
              ballCarrier.team,
              true
            );
            if (target) {
              const passDist = dist(ballCarrier.x, ballCarrier.y, target.x, target.y);
              if (passDist > 15) {
                setAction({
                  type: "longball",
                  fromX: ballCarrier.x,
                  fromY: ballCarrier.y,
                  toX: target.x,
                  toY: target.y,
                  team: ballCarrier.team,
                });
                setMessage(`Lançamento longo! 🚀`);
              } else {
                setAction({
                  type: "pass",
                  fromX: ballCarrier.x,
                  fromY: ballCarrier.y,
                  toX: target.x,
                  toY: target.y,
                  team: ballCarrier.team,
                });
              }
              setTimeout(() => setMessage(""), 1200);
              ballCarrier.hasBall = false;
              target.hasBall = true;
              ballX = target.x;
              ballY = target.y;
            }
          } else {
            // Avança com a bola
            const dir = ballCarrier.team === "home" ? -1 : 1;
            const advanceX = (Math.random() - 0.5) * 4;
            const advanceY = dir * (2 + Math.random() * 3);
            ballCarrier.x = Math.max(5, Math.min(95, ballCarrier.x + advanceX));
            ballCarrier.y = Math.max(5, Math.min(95, ballCarrier.y + advanceY));
            ballX = ballCarrier.x;
            ballY = ballCarrier.y;

            if (Math.random() < 0.08) {
              setAction({
                type: "dribble",
                fromX: ballCarrier.x,
                fromY: ballCarrier.y,
                toX: ballCarrier.x + advanceX * 2,
                toY: ballCarrier.y + advanceY * 2,
                team: ballCarrier.team,
              });
            }
          }
        } else {
          // Ninguém com a bola — atribui a alguém
          const teamPlayers = updated.filter((p) => p.team === possession && p.position !== "GK");
          if (teamPlayers.length > 0) {
            const holder = teamPlayers[Math.floor(Math.random() * teamPlayers.length)]!;
            holder.hasBall = true;
            ballX = holder.x;
            ballY = holder.y;
          }
        }

        setBall((prev) => ({ ...prev, x: ballX, y: ballY }));
        return updated;
      });

      phaseRef.current += 1;
    }, 180);

    return () => clearInterval(interval);
  }, [simPlayers.length, possession, currentMinute, minute, homePositions, awayPositions, ball.x, ball.y]);

  // Avança o minuto automaticamente
  useEffect(() => {
    if (currentMinute >= minute || currentMinute >= 45) return;
    const timer = setInterval(() => {
      setCurrentMinute((prev) => Math.min(prev + 1, minute, 45));
    }, 6000);
    return () => clearInterval(timer);
  }, [currentMinute, minute]);

  const holder = simPlayers.find((p) => p.hasBall);
  const holderData = holder
    ? {
        name: holder.name,
        team: holder.team as "home" | "away",
        number: holder.number,
      }
    : null;

  // Animação da bola durante ações
  const ballDisplay = useMemo(() => {
    if (action.type === "pass" || action.type === "longball") {
      const progress = Math.min(1, (phaseRef.current % 20) / 20);
      const bx = lerp(action.fromX, action.toX, progress);
      const by = lerp(action.fromY, action.toY, progress);
      return { x: bx, y: by, visible: true };
    }
    if (action.type === "shot") {
      const progress = Math.min(1, (phaseRef.current % 15) / 15);
      const bx = lerp(action.fromX, action.targetX, progress);
      const by = lerp(action.fromY, action.targetY, progress);
      return { x: bx, y: by, visible: true };
    }
    return ball;
  }, [action, ball]);

  function getEventMsg(): string {
    const card = cardEvents.find((c) => c.minute === currentMinute);
    if (card) return `${card.playerName} ${card.type === "red" ? "🟥" : "🟨"} Cartão ${card.type === "red" ? "Vermelho" : "Amarelo"}`;
    return "";
  }

  const eventMsg = getEventMsg();

  return (
    <div className="relative inline-block">
      {/* Placar */}
      <div className="mb-2 flex items-center justify-between rounded-t-lg bg-black/70 px-5 py-2.5 text-white">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">{homeName}</span>
          <span className="text-2xl font-black tabular-nums">{homeGoals}</span>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold tabular-nums">{currentMinute}&apos;</div>
          <div className="text-[10px] uppercase tracking-wider opacity-60">
            {currentMinute <= 45 ? "1º TEMPO" : "2º TEMPO"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black tabular-nums">{awayGoals}</span>
          <span className="text-sm font-bold">{awayName}</span>
        </div>
      </div>

      {/* Campo SVG */}
      <svg
        width={FIELD_W}
        height={FIELD_H}
        viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
        className="block rounded-b-lg"
        style={{ background: "linear-gradient(180deg, #2d7a2d 0%, #3a9a3a 50%, #2d7a2d 100%)" }}
      >
        {/* Linhas do campo */}
        <rect x={4} y={4} width={FIELD_W - 8} height={FIELD_H - 8} rx={2} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
        <line x1={FIELD_W / 2} y1={4} x2={FIELD_W / 2} y2={FIELD_H - 4} stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
        <circle cx={FIELD_W / 2} cy={FIELD_H / 2} r={30} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />

        {/* Área home (baixo) */}
        <rect x={FIELD_W / 2 - 60} y={FIELD_H - 55} width={120} height={51} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
        <rect x={FIELD_W / 2 - 25} y={FIELD_H - 20} width={50} height={16} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />

        {/* Área away (cima) */}
        <rect x={FIELD_W / 2 - 60} y={4} width={120} height={51} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
        <rect x={FIELD_W / 2 - 25} y={4} width={50} height={16} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />

        {/* Jogadores */}
        {simPlayers.map((p) => {
          const px = (p.x / 100) * FIELD_W;
          const py = (p.y / 100) * FIELD_H;
          const isHolder = p.hasBall;
          const isHome = p.team === "home";
          const dotColor = isHome ? homeColor : awayColor;
          const borderColor = isHome
            ? homeColor
            : awayColor;

          return (
            <g key={p.id}>
              {/* Sombra */}
              <circle cx={px + 1} cy={py + 1} r={isHolder ? 18 : 14} fill="rgba(0,0,0,0.25)" />
              {/* Círculo do jogador */}
              <circle
                cx={px}
                cy={py}
                r={isHolder ? 18 : 14}
                fill={dotColor}
                stroke={isHolder ? "#fff" : borderColor}
                strokeWidth={isHolder ? 3 : 2}
                className={isHolder ? "drop-shadow-lg" : ""}
              />
              <text
                x={px}
                y={py + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fill={isHome ? "#ffffff" : "#ffffff"}
                fontSize={isHolder ? 13 : 11}
                fontWeight={700}
                fontFamily="monospace"
              >
                {p.number}
              </text>
              {isHolder && (
                <text
                  x={px + (isHome ? 16 : -16)}
                  y={py - 4}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={18}
                  style={{ pointerEvents: "none", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }}
                >
                  ⚽
                </text>
              )}
            </g>
          );
        })}

        {/* Bola solta (quando ninguém tem) */}
        {!holder && ballDisplay.visible && (
          <text
            x={(ballDisplay.x / 100) * FIELD_W}
            y={(ballDisplay.y / 100) * FIELD_H}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={16}
            style={{ pointerEvents: "none", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.6))" }}
          >
            ⚽
          </text>
        )}

        {/* Ações: passe/chute (linha de trajetória) */}
        {(action.type === "pass" || action.type === "longball") && (
          <line
            x1={(action.fromX / 100) * FIELD_W}
            y1={(action.fromY / 100) * FIELD_H}
            x2={(action.toX / 100) * FIELD_W}
            y2={(action.toY / 100) * FIELD_H}
            stroke={action.team === "home" ? "rgba(74,222,128,0.6)" : "rgba(248,113,113,0.6)"}
            strokeWidth={2}
            strokeDasharray={action.type === "longball" ? "6,4" : "4,3"}
            opacity={0.7}
          />
        )}
        {action.type === "shot" && (
          <line
            x1={(action.fromX / 100) * FIELD_W}
            y1={(action.fromY / 100) * FIELD_H}
            x2={(action.targetX / 100) * FIELD_W}
            y2={(action.targetY / 100) * FIELD_H}
            stroke={action.team === "home" ? "rgba(74,222,128,0.6)" : "rgba(248,113,113,0.6)"}
            strokeWidth={3}
            strokeDasharray="4,3"
            opacity={0.8}
          />
        )}

        {/* Flash de gol */}
        {goalFlash && (
          <g>
            <rect x={0} y={0} width={FIELD_W} height={FIELD_H} fill="rgba(255,255,0,0.15)" />
            <text
              x={FIELD_W / 2}
              y={FIELD_H / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={48}
              fontWeight={900}
              fill="#fff"
              stroke="#000"
              strokeWidth={2}
              style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.5))" }}
            >
              ⚽⚽⚽
            </text>
            <text
              x={FIELD_W / 2}
              y={FIELD_H / 2 + 50}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={16}
              fill="#fff"
              stroke="#000"
              strokeWidth={1}
              fontWeight={600}
            >
              {scorerName}
            </text>
          </g>
        )}
      </svg>

      {/* Barra de informações inferior */}
      <div className="mt-1 flex items-center justify-between rounded-b-lg bg-black/60 px-4 py-2 text-white">
        <div className="flex items-center gap-2">
          {possession === "home" ? (
            <span className="text-xs text-green-400">⚽ {homeName}</span>
          ) : (
            <span className="text-xs text-red-400">⚽ {awayName}</span>
          )}
          {holderData && (
            <span className="text-xs opacity-75">
              #{holderData.number} {holderData.name}
            </span>
          )}
        </div>
        <div className="text-xs opacity-60">
          {eventMsg || message || (possession === "home" ? `${homeName} ataca` : `${awayName} ataca`)}
        </div>
      </div>
    </div>
  );
}
