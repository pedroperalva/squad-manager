"use client";

import { useEffect, useRef } from "react";
import type { Formation, GoalEvent, Player } from "@/engine/types";

interface FieldCanvasProps {
  homePlayers: Player[];
  awayPlayers: Player[];
  homeFormation: Formation;
  awayFormation: Formation;
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
  minute: number;
  homeColor: string;
  awayColor: string;
  events: GoalEvent[];
}

type Team = "home" | "away";

interface Dot {
  id: number;
  name: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  team: Team;
  number: number;
  position: string;
  hasBall: boolean;
}

interface BallState {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
  flying: boolean;
  team: Team | null;
}

const FIELD_W = 700;
const FIELD_H = 440;

// Rotaciona as posições do formation (original: vertical → horizontal)
// Original: y=0=top(away gol), y=100=bottom(home gol)
// Novo: x=0=left(home gol), x=100=right(away gol), y=0=top, y=100=bottom
// Rotação: newX = 100 - oldY, newY = oldX
function rotPos(p: { x: number; y: number }): { x: number; y: number } {
  return { x: 100 - p.y, y: p.x };
}

const FORMATIONS: Record<string, { x: number; y: number }[]> = {
  "4-4-2": [
    { x: 50, y: 92 }, { x: 18, y: 72 }, { x: 35, y: 76 }, { x: 65, y: 76 }, { x: 82, y: 72 },
    { x: 12, y: 50 }, { x: 32, y: 48 }, { x: 68, y: 48 }, { x: 88, y: 50 },
    { x: 35, y: 28 }, { x: 65, y: 28 },
  ],
  "4-3-3": [
    { x: 50, y: 92 }, { x: 18, y: 74 }, { x: 35, y: 78 }, { x: 65, y: 78 }, { x: 82, y: 74 },
    { x: 25, y: 52 }, { x: 50, y: 50 }, { x: 75, y: 52 },
    { x: 20, y: 28 }, { x: 50, y: 22 }, { x: 80, y: 28 },
  ],
  "4-2-4": [
    { x: 50, y: 92 }, { x: 18, y: 72 }, { x: 35, y: 76 }, { x: 65, y: 76 }, { x: 82, y: 72 },
    { x: 30, y: 55 }, { x: 70, y: 55 },
    { x: 15, y: 28 }, { x: 38, y: 22 }, { x: 62, y: 22 }, { x: 85, y: 28 },
  ],
  "5-4-1": [
    { x: 50, y: 92 }, { x: 10, y: 74 }, { x: 28, y: 78 }, { x: 50, y: 80 }, { x: 72, y: 78 }, { x: 90, y: 74 },
    { x: 20, y: 52 }, { x: 40, y: 50 }, { x: 60, y: 50 }, { x: 80, y: 52 },
    { x: 50, y: 26 },
  ],
  "5-3-2": [
    { x: 50, y: 92 }, { x: 10, y: 74 }, { x: 28, y: 78 }, { x: 50, y: 80 }, { x: 72, y: 78 }, { x: 90, y: 74 },
    { x: 25, y: 52 }, { x: 50, y: 50 }, { x: 75, y: 52 },
    { x: 35, y: 28 }, { x: 65, y: 28 },
  ],
  "3-3-4": [
    { x: 50, y: 92 }, { x: 20, y: 74 }, { x: 50, y: 78 }, { x: 80, y: 74 },
    { x: 18, y: 52 }, { x: 50, y: 50 }, { x: 82, y: 52 },
    { x: 12, y: 28 }, { x: 35, y: 22 }, { x: 65, y: 22 }, { x: 88, y: 28 },
  ],
  "3-4-3": [
    { x: 50, y: 92 }, { x: 20, y: 76 }, { x: 50, y: 80 }, { x: 80, y: 76 },
    { x: 10, y: 54 }, { x: 35, y: 48 }, { x: 65, y: 48 }, { x: 90, y: 54 },
    { x: 25, y: 28 }, { x: 50, y: 22 }, { x: 75, y: 28 },
  ],
};

function clamp(v: number, min = 2, max = 98): number {
  return Math.max(min, Math.min(max, v));
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

let dots: Dot[] = [];
let ball: BallState = { x: 50, y: 50, fromX: 50, fromY: 50, toX: 50, toY: 50, progress: 0, flying: false, team: null };
let possession: Team = "home";
let goalFlash = 0;
let goalText = "";
let message = "";
let messageTimer = 0;
let animFrame = 0;

export default function FieldCanvas({
  homePlayers, awayPlayers, homeFormation, awayFormation,
  homeName, awayName, homeGoals, awayGoals, minute,
  homeColor, awayColor, events,
}: FieldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ homeGoals, awayGoals, minute, events, homeName, awayName, homeColor, awayColor });

  // Sincroniza props com a ref
  useEffect(() => {
    propsRef.current = { homeGoals, awayGoals, minute, events, homeName, awayName, homeColor, awayColor };
  }, [homeGoals, awayGoals, minute, events, homeName, awayName, homeColor, awayColor]);

  // Inicializa jogadores quando os dados mudam
  useEffect(() => {
    const homePos = FORMATIONS[homeFormation] ?? FORMATIONS["4-4-2"]!;
    const awayPos = FORMATIONS[awayFormation] ?? FORMATIONS["4-4-2"]!;

    dots = [];
    const maxHome = Math.min(homePlayers.length, 11);
    const maxAway = Math.min(awayPlayers.length, 11);

    for (let i = 0; i < maxHome; i++) {
      const p = homePlayers[i]!;
      const pos = homePos[i] ?? { x: 50, y: 50 };
      dots.push({ id: p.id, name: p.name, x: pos.x, y: pos.y, tx: pos.x, ty: pos.y, team: "home", number: i + 1, position: p.position, hasBall: false });
    }
    for (let i = 0; i < maxAway; i++) {
      const p = awayPlayers[i]!;
      const pos = awayPos[i] ?? { x: 50, y: 50 };
      dots.push({ id: p.id, name: p.name, x: 100 - pos.x, y: 100 - pos.y, tx: 100 - pos.x, ty: 100 - pos.y, team: "away", number: i + 1, position: p.position, hasBall: false });
    }

    possession = "home";
    ball = { x: 50, y: 50, fromX: 50, fromY: 50, toX: 50, toY: 50, progress: 0, flying: false, team: null };
    goalFlash = 0;
    goalText = "";
    message = "";
    animFrame = 0;

    // Atribui bola inicial
    const homeField = dots.filter(d => d.team === "home" && d.position !== "GK");
    if (homeField.length > 0) {
      const holder = homeField[Math.floor(Math.random() * homeField.length)]!;
      holder.hasBall = true;
      ball.x = holder.x;
      ball.y = holder.y;
    }
  }, [homePlayers, awayPlayers, homeFormation, awayFormation]);

  // Loop principal de animação
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;

    function findNearestOpponent(dot: Dot): Dot | null {
      let best: Dot | null = null;
      let bestD = Infinity;
      for (const d of dots) {
        if (d.team === dot.team || d.position === "GK") continue;
        const dd = dist(d.x, d.y, dot.x, dot.y);
        if (dd < bestD) { bestD = dd; best = d; }
      }
      return best;
    }

    function findPassTarget(dot: Dot): Dot | null {
      let best: Dot | null = null;
      let bestScore = -Infinity;
      for (const d of dots) {
        if (d.team !== dot.team || d.position === "GK" || d.hasBall) continue;
        const ddist = dist(d.x, d.y, dot.x, dot.y);
        const forward = dot.team === "home" ? (100 - d.y) : d.y;
        const score = forward + Math.random() * 30 - ddist * 0.3;
        if (score > bestScore) { bestScore = score; best = d; }
      }
      return best;
    }

    function doPass(from: Dot, to: Dot) {
      ball.fromX = from.x;
      ball.fromY = from.y;
      ball.toX = to.x;
      ball.toY = to.y;
      ball.progress = 0;
      ball.flying = true;
      ball.team = from.team;
      from.hasBall = false;
      setTimeout(() => {
        to.hasBall = true;
        ball.flying = false;
        ball.x = to.x;
        ball.y = to.y;
      }, 350);
    }

    function doShot(shooter: Dot) {
      const goalX = 50;
      const goalY = shooter.team === "home" ? 0 : 100;
      ball.fromX = shooter.x;
      ball.fromY = shooter.y;
      ball.toX = goalX + (Math.random() - 0.5) * 20;
      ball.toY = goalY;
      ball.progress = 0;
      ball.flying = true;
      ball.team = shooter.team;
      shooter.hasBall = false;

      const onTarget = Math.random() < 0.5;
      if (onTarget) {
        // Verifica se tem evento de gol neste minuto
        const p = propsRef.current;
        const homeGoalNow = p.events.filter(e => e.team === "home" && e.minute === p.minute).length;
        const awayGoalNow = p.events.filter(e => e.team === "away" && e.minute === p.minute).length;
        const isGoal = (shooter.team === "home" && homeGoalNow > 0) || (shooter.team === "away" && awayGoalNow > 0);

        if (isGoal || Math.random() < 0.3) {
          // GOL!
          setTimeout(() => {
            goalFlash = 60;
            goalText = `⚽ ${shooter.name}`;
            ball.flying = false;
          }, 300);
          setTimeout(() => {
            const newTeam = shooter.team === "home" ? "away" : "home";
            possession = newTeam;
            const receivers = dots.filter(d => d.team === newTeam && d.position !== "GK");
            if (receivers.length > 0) {
              const r = receivers[Math.floor(Math.random() * receivers.length)]!;
              r.hasBall = true;
              ball.x = r.x;
              ball.y = r.y;
            }
          }, 2500);
        } else {
          // Defesa do goleiro
          setTimeout(() => {
            message = `Defesa do goleiro! 🧤`;
            messageTimer = 60;
            const newTeam = shooter.team === "home" ? "away" : "home";
            possession = newTeam;
            const receivers = dots.filter(d => d.team === newTeam && d.position !== "GK");
            if (receivers.length > 0) {
              const r = receivers[Math.floor(Math.random() * receivers.length)]!;
              r.hasBall = true;
              ball.x = r.x;
              ball.y = r.y;
            }
            ball.flying = false;
          }, 600);
        }
      } else {
        // Fora
        setTimeout(() => {
          message = `Chutou para fora!`;
          messageTimer = 40;
          const newTeam = shooter.team === "home" ? "away" : "home";
          possession = newTeam;
          const receivers = dots.filter(d => d.team === newTeam && d.position !== "GK");
          if (receivers.length > 0) {
            const r = receivers[Math.floor(Math.random() * receivers.length)]!;
            r.hasBall = true;
            ball.x = r.x;
            ball.y = r.y;
          }
          ball.flying = false;
        }, 500);
      }
    }

    function doDribble(dot: Dot) {
      const dir = dot.team === "home" ? -1 : 1;
      dot.x += (Math.random() - 0.5) * 2.5;
      dot.y += dir * (1 + Math.random() * 1.5);
      dot.x = clamp(dot.x);
      dot.y = clamp(dot.y);
      ball.x = dot.x;
      ball.y = dot.y;
    }

    function simulateTick() {
      // Verifica gol vindo dos eventos reais da engine
      const p = propsRef.current;
      if (goalFlash > 0) {
        goalFlash--;
        if (goalFlash === 0) goalText = "";
      }
      if (messageTimer > 0) {
        messageTimer--;
        if (messageTimer === 0) message = "";
      }

      // Move jogadores sem bola para posições
      const attacking = possession;
      const defending = attacking === "home" ? "away" : "home";
      const homePos = FORMATIONS[homeFormation] ?? FORMATIONS["4-4-2"]!;
      const awayPos = FORMATIONS[awayFormation] ?? FORMATIONS["4-4-2"]!;

      for (const d of dots) {
        if (d.hasBall || d.position === "GK") continue;

        const posArr = d.team === "home" ? homePos : awayPos;
        const base = posArr[d.number - 1] ?? { x: 50, y: 50 };
        const bx = d.team === "home" ? base.x : 100 - base.x;
        const by = d.team === "home" ? base.y : 100 - base.y;
        let ox = 0, oy = 0;

        if (d.team === attacking) {
          ox = (Math.random() - 0.5) * 14;
          oy = d.team === "home" ? -6 - Math.random() * 10 : 6 + Math.random() * 10;
        } else {
          ox = (Math.random() - 0.5) * 10;
          oy = d.team === "home" ? 4 + Math.random() * 6 : -4 - Math.random() * 6;
        }
        d.tx = clamp(bx + ox);
        d.ty = clamp(by + oy);
        d.x += (d.tx - d.x) * 0.07;
        d.y += (d.ty - d.y) * 0.07;
      }

      // Jogador com a bola
      const holder = dots.find(d => d.hasBall);
      if (holder) {
        const opponent = findNearestOpponent(holder);
        const distToGoal = holder.team === "home" ? holder.y : 100 - holder.y;

        if (distToGoal < 18 && Math.abs(holder.x - 50) < 22 && Math.random() < 0.25) {
          doShot(holder);
          return;
        }

        if (opponent && dist(holder.x, holder.y, opponent.x, opponent.y) < 7 && Math.random() < 0.3) {
          // Perde a bola
          message = `${opponent.name} desarmou!`;
          messageTimer = 40;
          possession = opponent.team;
          holder.hasBall = false;
          opponent.hasBall = true;
          ball.x = opponent.x;
          ball.y = opponent.y;
          return;
        }

        if (Math.random() < 0.12) {
          const target = findPassTarget(holder);
          if (target) {
            doPass(holder, target);
            return;
          }
        }

        doDribble(holder);
      } else {
        // Ninguém com bola — atribui
        const candidates = dots.filter(d => d.team === possession && d.position !== "GK");
        if (candidates.length > 0) {
          const h = candidates[Math.floor(Math.random() * candidates.length)]!;
          h.hasBall = true;
          ball.x = h.x;
          ball.y = h.y;
        }
      }

      // Avança bola se estiver voando
      if (ball.flying) {
        ball.progress += 0.03;
        if (ball.progress >= 1) {
          ball.progress = 1;
          ball.flying = false;
        }
        ball.x = ball.fromX + (ball.toX - ball.fromX) * ball.progress;
        ball.y = ball.fromY + (ball.toY - ball.fromY) * ball.progress;
      }
    }

    function drawField() {
      if (!ctx || !canvas) return;
      const W = FIELD_W;
      const H = FIELD_H;
      const scale = canvas.width / W;

      // Rotaciona coordenadas internas (vertical) para desenho (horizontal)
      const rx = (v: number) => (v / 100) * H;  // y interno → x desenho
      const ry = (v: number) => (v / 100) * W;  // x interno → y desenho

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Gramado (gradiente horizontal)
      const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
      grad.addColorStop(0, "#2d7a2d");
      grad.addColorStop(0.5, "#3a9a3a");
      grad.addColorStop(1, "#2d7a2d");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1.5 * scale;

      // Linhas (rotacionadas: campo deitado)
      ctx.strokeRect(4 * scale, 4 * scale, H - 8 * scale, W - 8 * scale);
      ctx.beginPath();
      ctx.moveTo(H / 2, 4 * scale);
      ctx.lineTo(H / 2, W - 4 * scale);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(H / 2, W / 2, 30 * scale, 0, Math.PI * 2);
      ctx.stroke();

      // Áreas (gol visitante = esquerda, gol casa = direita)
      ctx.strokeRect(4 * scale, W / 2 - 60 * scale, 51 * scale, 120 * scale);
      ctx.strokeRect(20 * scale, W / 2 - 25 * scale, 16 * scale, 50 * scale);
      ctx.strokeRect(H - 55 * scale, W / 2 - 60 * scale, 51 * scale, 120 * scale);
      ctx.strokeRect(H - 36 * scale, W / 2 - 25 * scale, 16 * scale, 50 * scale);

      // Jogadores (com coordenadas rotacionadas)
      for (const d of dots) {
        const px = rx(d.y);  // depth vira horizontal
        const py = ry(d.x);  // spread vira vertical
        const isHome = d.team === "home";
        const isHolder = d.hasBall;
        const r = isHolder ? 18 * scale : 14 * scale;
        const color = isHome ? homeColor : awayColor;

        // Sombra
        ctx.beginPath();
        ctx.arc(px + 2 * scale, py + 2 * scale, r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.fill();

        // Círculo
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = isHolder ? "#fff" : "rgba(255,255,255,0.4)";
        ctx.lineWidth = isHolder ? 3 * scale : 1.5 * scale;
        ctx.stroke();

        // Número
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${isHolder ? 12 * scale : 10 * scale}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(d.number), px, py + 1 * scale);
      }

      // Bola (quando não está com jogador)
      const holder = dots.find(d => d.hasBall);
      let bx = ball.x;
      let by = ball.y;
      if (ball.flying) {
        bx = ball.fromX + (ball.toX - ball.fromX) * ball.progress;
        by = ball.fromY + (ball.toY - ball.fromY) * ball.progress;
      } else if (holder) {
        bx = holder.x;
        by = holder.y;
      }

      if (!holder || ball.flying) {
        ctx.font = `${18 * scale}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("⚽", rx(by), ry(bx));
      }

      // Linha de trajetória (passe/chute)
      if (ball.flying) {
        const fx = rx(ball.fromY);
        const fy = ry(ball.fromX);
        const tx = rx(ball.toY);
        const ty = ry(ball.toX);
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = ball.team === "home"
          ? `rgba(255,255,255,${0.5 - ball.progress * 0.3})`
          : `rgba(255,200,200,${0.5 - ball.progress * 0.3})`;
        ctx.lineWidth = 2 * scale;
        ctx.setLineDash([6 * scale, 4 * scale]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Flash de gol
      if (goalFlash > 0) {
        ctx.fillStyle = `rgba(255,215,0,${goalFlash / 60 * 0.2})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = `bold ${40 * scale}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 3 * scale;
        ctx.strokeText("⚽⚽⚽", H / 2, W / 2 - 20 * scale);
        ctx.fillText("⚽⚽⚽", H / 2, W / 2 - 20 * scale);
        if (goalText) {
          ctx.font = `bold ${14 * scale}px sans-serif`;
          ctx.strokeText(goalText, H / 2, W / 2 + 30 * scale);
          ctx.fillText(goalText, H / 2, W / 2 + 30 * scale);
        }
      }

      // Mensagem
      if (message) {
        ctx.font = `bold ${13 * scale}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        const msgW = ctx.measureText(message).width;
        ctx.fillRect(H / 2 - msgW / 2 - 10 * scale, W - 30 * scale, msgW + 20 * scale, 24 * scale);
        ctx.fillStyle = "#fff";
        ctx.fillText(message, H / 2, W - 10 * scale);
      }
    }

    let frameCount = 0;

    function gameLoop() {
      if (!running) return;
      // Só executa simulateTick a cada 16 frames (~3.75 fps de simulação)
      frameCount++;
      if (frameCount % 16 === 0) {
        simulateTick();
      } else if (frameCount % 8 === 0) {
        // A cada 8 frames: suaviza posição dos jogadores sem bola
        for (const d of dots) {
          if (d.hasBall || d.position === "GK") continue;
          d.x += (d.tx - d.x) * 0.03;
          d.y += (d.ty - d.y) * 0.03;
        }
      }
      drawField();
      requestAnimationFrame(gameLoop);
    }

    requestAnimationFrame(gameLoop);

    return () => { running = false; };
  }, [homeFormation, awayFormation, homeColor, awayColor, homePlayers, awayPlayers]);

  return (
    <div className="relative inline-block">
      {/* Placar */}
      <div className="mb-0 flex items-center justify-between rounded-t-lg bg-black/70 px-5 py-2.5 text-white">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">{homeName}</span>
          <span className="text-2xl font-black tabular-nums">{homeGoals}</span>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold tabular-nums">{minute}&apos;</div>
          <div className="text-[10px] uppercase tracking-wider opacity-60">
            {minute <= 45 ? "1º TEMPO" : "2º TEMPO"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black tabular-nums">{awayGoals}</span>
          <span className="text-sm font-bold">{awayName}</span>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={FIELD_W}
        height={FIELD_H}
        className="block"
        style={{ width: FIELD_W, height: FIELD_H, maxWidth: "100%" }}
      />
      {/* Holder info */}
      {(() => {
        const holder = dots.find(d => d.hasBall);
        if (!holder) return null;
        return (
          <div className="flex items-center justify-between rounded-b-lg bg-black/60 px-4 py-1.5 text-white text-xs">
            <span className="opacity-80">
              {holder.team === "home" ? homeName : awayName}
            </span>
            <span>
              #{holder.number} {holder.name} ⚽
            </span>
          </div>
        );
      })()}
    </div>
  );
}
