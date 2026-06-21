"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Club,
  GameState,
  LiveMatchPlan,
  MatchSpeed,
  PenaltyChanceEvent,
  PenaltyKickOutcome,
  PenaltyShootoutSummary,
  Player,
} from "@/engine/types";
import { sortNationalDivisionsForGrid } from "@/engine/types";
import {
  computeHumanSecondHalf,
  computeHumanCupSecondHalf,
  prepareLiveRound,
  prepareLiveCupRoundAll,
  resolveCupLiveKnockout,
  resolveLiveMatchPenalty,
} from "@/engine/live-round";
import { reassignGoalScorersAfterMinute } from "@/engine/match";
import { DEFAULT_MATCH_SPEED } from "@/lib/match-settings";
import { getPlayersByClub, isPlayerAvailable } from "@/engine/player";
import {
  buildDefaultSquad,
  swapSquadPlayers,
  isValidLineup,
  sortPlayerIdsByPosition,
  deriveTacticLabel,
  MAX_BENCH,
  pickBenchPlayers,
} from "@/engine/squad";
import {
  countTeamExpulsionsAtMinute,
  getPlayerLiveMatchStats,
} from "@/engine/player-history";
import { MatchStatIcons } from "@/components/PlayerStatsIcons";
import { InjuryBadge } from "@/components/InjuryBadge";
import { getHumanClubIds } from "@/engine/local-play";
import { clubKitBlockStyle, clubPanelThemeStyle } from "@/lib/club-theme";
import { actionCompleteLiveRound, actionCompleteCupLiveRound } from "@/app/actions";
import PlayerNameWithStar from "@/components/PlayerNameWithStar";
import MiniField from "@/components/MiniField";

interface LiveRoundViewProps {
  state: GameState;
  mode?: "league" | "cup";
  matchSpeed?: MatchSpeed;
  onComplete: (state: GameState) => void;
  onCancel: () => void;
}

function getScoreAtMinute(plan: LiveMatchPlan, minute: number) {
  const visible = plan.events.filter((e) => e.minute <= minute);
  return {
    home: visible.filter((e) => e.team === "home").length,
    away: visible.filter((e) => e.team === "away").length,
  };
}

function getLatestEvent(
  plan: LiveMatchPlan,
  minute: number
): { text: string; kind: "goal" | "yellow" | "red" | "injury" } | null {
  if (minute <= 0) return null;

  type Timed = {
    minute: number;
    text: string;
    priority: number;
    kind: "goal" | "yellow" | "red" | "injury";
  };

  const items: Timed[] = [
    ...plan.events
      .filter((e) => e.minute <= minute)
      .map((e) => ({
        minute: e.minute,
        kind: "goal" as const,
        priority: 3,
        text: `${e.minute}' ⚽ ${
          e.playerName ?? (e.team === "home" ? plan.homeName : plan.awayName)
        }${e.isPenalty ? " (P)" : ""}`,
      })),
    ...(plan.cardEvents ?? [])
      .filter((e) => e.minute <= minute)
      .map((e) => {
        const hadYellow = (plan.cardEvents ?? []).some(
          (c) =>
            c.playerId === e.playerId &&
            c.type === "yellow" &&
            c.minute <= e.minute
        );
        const isSecondYellow = e.type === "red" && hadYellow;
        return {
          minute: e.minute,
          kind: e.type,
          priority: e.type === "red" ? 5 : 2,
          text:
            e.type === "yellow"
              ? `${e.minute}' 🟨 ${e.playerName}`
              : isSecondYellow
                ? `${e.minute}' 🟥 ${e.playerName} (2º amarelo)`
                : `${e.minute}' 🟥 ${e.playerName}`,
        };
      }),
    ...(plan.injuryEvents ?? [])
      .filter((e) => e.minute <= minute)
      .map((e) => ({
        minute: e.minute,
        kind: "injury" as const,
        priority: 4,
        text: `${e.minute}' 🏥 ${e.playerName} (${e.days}R)`,
      })),
  ];

  if (items.length === 0) return null;
  items.sort((a, b) => b.minute - a.minute || b.priority - a.priority);
  const latest = items[0]!;
  return { text: latest.text, kind: latest.kind };
}

type HalftimeSubsTarget = { planKey: number; clubId: number };

function buildHalftimeQueue(
  matchPlans: LiveMatchPlan[],
  humanClubIds: number[],
  getPlanKey: (plan: LiveMatchPlan) => number
): HalftimeSubsTarget[] {
  const entries: HalftimeSubsTarget[] = [];
  for (const plan of matchPlans) {
    if (!plan.isHumanMatch || !plan.secondHalfPending) continue;
    for (const clubId of humanClubIds) {
      if (clubId === plan.homeClubId || clubId === plan.awayClubId) {
        entries.push({ planKey: getPlanKey(plan), clubId });
      }
    }
  }
  return entries;
}

function getLineupForClubInPlan(plan: LiveMatchPlan, clubId: number): number[] {
  return clubId === plan.homeClubId ? plan.homeLineupIds : plan.awayLineupIds;
}

function getBenchForClub(
  state: GameState,
  clubId: number,
  lineupIds: number[],
  liveBenchByClub: Record<number, number[]>
): number[] {
  const squad = getPlayersByClub(state.players, clubId);
  const lineupSet = new Set(lineupIds);
  const manager = state.localManagers.find((m) => m.clubId === clubId);
  const preferredOrder =
    liveBenchByClub[clubId]?.length
      ? liveBenchByClub[clubId]
      : manager?.benchPlayerIds.length
        ? manager.benchPlayerIds
        : [];

  const onBench = preferredOrder.filter((id) => {
    const player = squad.find((p) => p.id === id);
    return (
      !!player &&
      isPlayerAvailable(player) &&
      !lineupSet.has(id)
    );
  });
  const extras = squad
    .filter(
      (p) =>
        isPlayerAvailable(p) &&
        !lineupSet.has(p.id) &&
        !onBench.includes(p.id)
    )
    .sort((a, b) => b.skill - a.skill)
    .map((p) => p.id);

  return sortPlayerIdsByPosition(
    [...onBench, ...extras].slice(0, MAX_BENCH),
    squad
  );
}

function updatePlanLineup(
  plan: LiveMatchPlan,
  clubId: number,
  lineupIds: number[]
): LiveMatchPlan {
  if (clubId === plan.homeClubId) {
    return { ...plan, homeLineupIds: lineupIds };
  }
  return { ...plan, awayLineupIds: lineupIds };
}

function applySecondHalvesToHumanMatches(
  state: GameState,
  plans: LiveMatchPlan[],
  mode: "league" | "cup"
): LiveMatchPlan[] {
  return plans.map((plan) => {
    if (!plan.isHumanMatch || !plan.secondHalfPending) return plan;
    return mode === "cup"
      ? computeHumanCupSecondHalf(state, plan, plan.homeLineupIds)
      : computeHumanSecondHalf(state, plan, plan.homeLineupIds);
  });
}

function LiveTeamBlock({
  club,
  side,
  name,
  humanClubIds,
  canInspect,
  onInspectClub,
}: {
  club: Club;
  side: "home" | "away";
  name: string;
  humanClubIds: number[];
  canInspect: boolean;
  onInspectClub: (clubId: number) => void;
}) {
  const className = side === "home" ? "ef-live-match-home" : "ef-live-match-away";
  const style = clubKitBlockStyle(club);
  const inspectable = canInspect;

  if (!inspectable) {
    return (
      <div className={className} style={style}>
        {name}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`${className} cursor-pointer transition-opacity hover:opacity-85`}
      style={style}
      title={humanClubIds.includes(club.id) ? "Abrir substituições" : `Ver elenco — ${club.name}`}
      onClick={() => onInspectClub(club.id)}
    >
      {name}
    </button>
  );
}

function LiveMatchRow({
  plan,
  minute,
  homeClub,
  awayClub,
  humanClubIds,
  canInspect,
  onInspectClub,
  compact = false,
}: {
  plan: LiveMatchPlan;
  minute: number;
  homeClub: Club;
  awayClub: Club;
  humanClubIds: number[];
  canInspect: boolean;
  onInspectClub: (clubId: number) => void;
  compact?: boolean;
}) {
  const score = getScoreAtMinute(plan, minute);
  const latestEvent = getLatestEvent(plan, minute);
  const eventClass =
    latestEvent?.kind === "red"
      ? "ef-live-event ef-live-event-red"
      : latestEvent?.kind === "yellow"
        ? "ef-live-event ef-live-event-yellow"
        : "ef-live-event";

  if (compact) {
    return (
      <li className="rounded border border-[var(--ef-border)] bg-[color-mix(in_srgb,var(--ef-panel-bg)_90%,transparent)] p-0.5">
        <div className="flex items-center gap-1">
          <LiveTeamBlock
            club={homeClub}
            side="home"
            name={plan.homeName}
            humanClubIds={humanClubIds}
            canInspect={canInspect}
            onInspectClub={onInspectClub}
          />
          <div className="shrink-0 px-2 text-xs font-bold ef-match-score">
            {score.home} - {score.away}
          </div>
          <LiveTeamBlock
            club={awayClub}
            side="away"
            name={plan.awayName}
            humanClubIds={humanClubIds}
            canInspect={canInspect}
            onInspectClub={onInspectClub}
          />
        </div>
        <div
          className={`px-1 pt-0.5 leading-snug truncate ${eventClass}`}
        >
          {latestEvent?.text ?? "—"}
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-1 rounded border border-[var(--ef-border)] bg-[color-mix(in_srgb,var(--ef-panel-bg)_90%,transparent)] p-1">
      <LiveTeamBlock
        club={homeClub}
        side="home"
        name={plan.homeName}
        humanClubIds={humanClubIds}
        canInspect={canInspect}
        onInspectClub={onInspectClub}
      />
      <div className="shrink-0 px-2 text-sm font-bold ef-match-score">
        {score.home} - {score.away}
      </div>
      <LiveTeamBlock
        club={awayClub}
        side="away"
        name={plan.awayName}
        humanClubIds={humanClubIds}
        canInspect={canInspect}
        onInspectClub={onInspectClub}
      />
      <div className={eventClass}>{latestEvent?.text ?? ""}</div>
    </li>
  );
}

function LivePlayerStatRow({
  player,
  stats,
}: {
  player: Player;
  stats: ReturnType<typeof getPlayerLiveMatchStats>;
}) {
  return (
    <li
      className={`flex items-center gap-2 border px-2 py-1 text-sm text-[var(--ef-text)] ${
        stats.expelled
          ? "border-[#1a2030] bg-[#0a0e18] text-[#4a5568] line-through opacity-70"
          : "border-[var(--ef-border)] bg-[color-mix(in_srgb,var(--ef-panel-bg)_60%,transparent)]"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">
        {player.position} - <PlayerNameWithStar player={player} /> ({player.skill})
      </span>
      <MatchStatIcons
        goals={stats.goals}
        yellowCards={stats.yellowCards}
        redCards={stats.redCards}
      />
    </li>
  );
}

function LiveSquadInspectPanel({
  state,
  plan,
  clubId,
  minute,
  onClose,
}: {
  state: GameState;
  plan: LiveMatchPlan;
  clubId: number;
  minute: number;
  onClose: () => void;
}) {
  const club = state.clubs.find((c) => c.id === clubId)!;
  const squad = getPlayersByClub(state.players, clubId);
  const lineupIds =
    clubId === plan.homeClubId ? plan.homeLineupIds : plan.awayLineupIds;
  const benchIds = squad
    .filter((p) => !lineupIds.includes(p.id))
    .map((p) => p.id);
  const starters = sortPlayerIdsByPosition(lineupIds, squad)
    .map((id) => squad.find((p) => p.id === id))
    .filter((p): p is Player => !!p);
  const bench = sortPlayerIdsByPosition(benchIds, squad)
    .map((id) => squad.find((p) => p.id === id))
    .filter((p): p is Player => !!p);
  const tactic =
    lineupIds.length > 0 ? deriveTacticLabel(lineupIds, squad) : "—";

  function getStats(playerId: number) {
    return getPlayerLiveMatchStats(playerId, plan, minute);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div
        className="ef-game-theme flex max-h-[90vh] w-full max-w-2xl flex-col"
        style={clubPanelThemeStyle(club)}
      >
        <div className="ef-panel min-h-0 flex-1 overflow-y-auto p-4">
          <h2 className="ef-title mb-1 text-lg">{club.name}</h2>
          <p className="mb-4 text-sm ef-muted-text">
            Técnico: {club.coachName} · Tática {tactic} · {minute}&apos; · Apenas consulta
          </p>

          <div className="mb-4 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm ef-accent-text">Titulares</h3>
              <ul className="space-y-1">
                {starters.map((p) => (
                  <LivePlayerStatRow
                    key={p.id}
                    player={p}
                    stats={getStats(p.id)}
                  />
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm ef-accent-text">Reservas</h3>
              <ul className="space-y-1">
                {bench.map((p) => (
                  <LivePlayerStatRow
                    key={p.id}
                    player={p}
                    stats={getStats(p.id)}
                  />
                ))}
              </ul>
            </div>
          </div>

          <button type="button" className="ef-btn" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function SubPlayerRow({
  player,
  stats,
  selected,
  disabled,
  injured,
  injuryDays,
  onClick,
}: {
  player: Player;
  stats: ReturnType<typeof getPlayerLiveMatchStats>;
  selected: boolean;
  disabled: boolean;
  injured?: boolean;
  injuryDays?: number;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        className={`flex w-full items-center gap-2 border px-2 py-1 text-left text-sm text-[var(--ef-text)] ${
          stats.expelled
            ? "cursor-not-allowed border-[#1a2030] bg-[#0a0e18] text-[#4a5568] line-through opacity-70"
            : injured
              ? "border-red-500 bg-red-900/20"
              : disabled
              ? "cursor-not-allowed opacity-50"
              : selected
                ? "border-yellow-500 bg-yellow-900/30"
                : "border-[var(--ef-border)] hover:bg-[color-mix(in_srgb,var(--ef-team-primary)_15%,var(--ef-panel-bg))]"
        }`}
        onClick={onClick}
      >
        <span className="min-w-0 flex-1 truncate">
          {player.position} - <PlayerNameWithStar player={player} /> ({player.skill})
          {injured && injuryDays != null && (
            <span className="ml-1">
              <InjuryBadge rounds={injuryDays} />
            </span>
          )}
        </span>
        <MatchStatIcons
          goals={stats.goals}
          yellowCards={stats.yellowCards}
          redCards={stats.redCards}
        />
      </button>
    </li>
  );
}

function getPenaltyAttackingClub(
  plan: LiveMatchPlan,
  team: "home" | "away",
  state: GameState
): { club: Club; teamName: string } {
  const clubId = team === "home" ? plan.homeClubId : plan.awayClubId;
  const teamName = team === "home" ? plan.homeName : plan.awayName;
  const club = state.clubs.find((c) => c.id === clubId)!;
  return { club, teamName };
}

function penaltyOutcomeMeta(outcome: PenaltyKickOutcome | null): {
  label: string;
  icon: string;
  ring: string;
  panel: string;
} {
  switch (outcome) {
    case "goal":
      return {
        label: "GOL!",
        icon: "⚽",
        ring: "border-green-400/70 shadow-green-500/20",
        panel: "bg-green-500/8",
      };
    case "saved":
      return {
        label: "DEFENDEU!",
        icon: "🧤",
        ring: "border-amber-400/70 shadow-amber-500/20",
        panel: "bg-amber-500/8",
      };
    case "off_target":
      return {
        label: "PARA FORA",
        icon: "✕",
        ring: "border-red-400/70 shadow-red-500/20",
        panel: "bg-red-500/8",
      };
    case "post":
      return {
        label: "NA TRAVE",
        icon: "🥅",
        ring: "border-yellow-400/70 shadow-yellow-500/20",
        panel: "bg-yellow-500/8",
      };
    default:
      return {
        label: "PREPARANDO...",
        icon: "⚽",
        ring: "border-[var(--ef-team-secondary)]/50 shadow-black/20",
        panel: "bg-black/15",
      };
  }
}

function outcomeColor(outcome: PenaltyKickOutcome | null): string {
  if (!outcome) return "ef-accent-text";
  return outcome === "goal" ? "text-green-400" : "text-red-400";
}

type PenaltyKicker = Pick<Player, "name" | "isStar">;

function PenaltyShootoutOverlay({
  homeName,
  awayName,
  homeMarks,
  awayMarks,
  kicker,
  outcome,
  phaseLabel,
}: {
  homeName: string;
  awayName: string;
  homeMarks: string[];
  awayMarks: string[];
  kicker: PenaltyKicker;
  outcome: PenaltyKickOutcome | null;
  phaseLabel: string;
}) {
  const meta = penaltyOutcomeMeta(outcome);

  return (
    <div className="fixed inset-0 z-[62] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
      <div className="ef-game-theme ef-panel w-full max-w-2xl overflow-hidden">
        <div className="border-b border-[var(--ef-border)] bg-[color-mix(in_srgb,var(--ef-team-primary)_14%,var(--ef-panel-bg))] px-6 py-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] ef-muted-text">
            {phaseLabel}
          </p>
        </div>

        <div className={`px-6 py-8 text-center ${meta.panel}`}>
          <div
            className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border-4 bg-black/30 text-3xl shadow-lg ${meta.ring}`}
          >
            {meta.icon}
          </div>
          <h2 className="ef-title mb-2 text-2xl">
            <PlayerNameWithStar player={kicker} />
          </h2>
          <p className={`text-4xl font-black tracking-wide ${outcomeColor(outcome)}`}>
            {meta.label}
          </p>
        </div>

        <div className="grid gap-3 border-t border-[var(--ef-border)] p-4 sm:grid-cols-2">
          {[
            { name: homeName, marks: homeMarks },
            { name: awayName, marks: awayMarks },
          ].map(({ name, marks }) => (
            <div
              key={name}
              className="rounded border border-[var(--ef-border)] bg-black/20 p-3"
            >
              <p className="mb-3 text-sm font-semibold">{name}</p>
              <div className="flex min-h-9 flex-wrap gap-2">
                {marks.map((m, i) => (
                  <span
                    key={`${m}-${i}`}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold ${
                      m === "X"
                        ? "border-red-500/50 bg-red-500/15 text-red-400"
                        : "border-green-500/50 bg-green-500/15 text-green-400"
                    }`}
                  >
                    {m === "X" ? "✕" : "⚽"}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PenaltyMomentOverlay({
  kicker,
  outcome,
  teamName,
  club,
  minute,
}: {
  kicker: PenaltyKicker;
  outcome: PenaltyKickOutcome | null;
  teamName: string;
  club: Club;
  minute?: number;
}) {
  const meta = penaltyOutcomeMeta(outcome);

  return (
    <div className="fixed inset-0 z-[62] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
      <div
        className="ef-game-theme w-full max-w-lg"
        style={clubPanelThemeStyle(club)}
      >
        <div className={`ef-panel overflow-hidden ${meta.panel}`}>
          <div className="border-b border-[var(--ef-border)] bg-[color-mix(in_srgb,var(--ef-team-primary)_16%,var(--ef-panel-bg))] px-6 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] ef-muted-text">
              {minute != null ? `${minute}' · Lance de pênalti` : "Lance de pênalti"}
            </p>
            <p className="ef-title mt-1 text-xl">{teamName}</p>
          </div>

          <div className="px-6 py-8 text-center">
            <div
              className={`mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full border-4 bg-black/30 text-4xl shadow-lg ${meta.ring}`}
            >
              {meta.icon}
            </div>
            <h2 className="mb-3 text-2xl font-bold">
              <PlayerNameWithStar player={kicker} />
            </h2>
            <p className={`text-5xl font-black tracking-wider ${outcomeColor(outcome)}`}>
              {meta.label}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PenaltyPickerPanel({
  minute,
  teamName,
  club,
  sufferedPlayerName,
  takers,
  selectedId,
  onSelect,
  disabled,
}: {
  minute: number;
  teamName: string;
  club: Club;
  sufferedPlayerName?: string;
  takers: Player[];
  selectedId: number | null;
  onSelect: (playerId: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[61] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
      <div
        className="ef-game-theme w-full max-w-3xl"
        style={clubPanelThemeStyle(club)}
      >
        <div className="ef-panel overflow-hidden">
          <div className="border-b border-[var(--ef-border)] bg-[color-mix(in_srgb,var(--ef-team-primary)_18%,var(--ef-panel-bg))] px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] ef-muted-text">
                  Cobrança de pênalti
                </p>
                <h2 className="ef-title text-2xl">{teamName}</h2>
              </div>
              <span className="rounded-full border border-[var(--ef-border)] bg-black/25 px-3 py-1 text-sm font-bold ef-accent-text">
                {minute}&apos;
              </span>
            </div>
            {sufferedPlayerName && (
              <p className="mt-2 text-sm ef-muted-text">
                Pênalti sofrido por{" "}
                <span className="font-medium text-[var(--ef-text)]">
                  {sufferedPlayerName}
                </span>
              </p>
            )}
          </div>

          <div className="p-5">
            <p className="mb-4 text-center text-sm ef-muted-text">
              Escolha o cobrador
            </p>
            <div className="grid max-h-[50vh] gap-2 overflow-y-auto sm:grid-cols-2">
              {takers.map((p) => {
                const active = selectedId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelect(p.id)}
                    className={`flex items-center gap-3 rounded border px-4 py-3 text-left transition ${
                      active
                        ? "border-[var(--ef-team-secondary)] bg-[color-mix(in_srgb,var(--ef-team-primary)_22%,var(--ef-panel-bg))] ring-1 ring-[var(--ef-team-secondary)]"
                        : "border-[var(--ef-border)] bg-black/15 hover:border-[var(--ef-team-secondary)]/60 hover:bg-[color-mix(in_srgb,var(--ef-team-primary)_10%,var(--ef-panel-bg))]"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-black/30 text-xs font-bold ef-accent-text">
                      {p.position}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        <PlayerNameWithStar player={p} />
                      </span>
                      <span className="text-xs ef-muted-text">Força {p.skill}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SubstitutionPanel({
  squad,
  lineupIds,
  benchIds,
  humanMatch,
  minute,
  humanClub,
  title,
  injuredPlayerId,
  injuryDays,
  disabledPlayerIds,
  onConfirm,
}: {
  squad: Player[];
  lineupIds: number[];
  benchIds: number[];
  humanMatch: LiveMatchPlan;
  minute: number;
  humanClub: Club;
  title: string;
  injuredPlayerId?: number | null;
  injuryDays?: number | null;
  disabledPlayerIds?: number[];
  onConfirm: (lineup: number[], bench: number[]) => void;
}) {
  const disabledSet = useMemo(
    () => new Set(disabledPlayerIds ?? []),
    [disabledPlayerIds]
  );
  const [locallySubbedOut, setLocallySubbedOut] = useState<Set<number>>(
    () => new Set()
  );
  const unavailableIds = useMemo(
    () => new Set([...disabledSet, ...locallySubbedOut]),
    [disabledSet, locallySubbedOut]
  );

  const starterIds = useMemo(() => {
    if (injuredPlayerId && !lineupIds.includes(injuredPlayerId)) {
      return sortPlayerIdsByPosition([...lineupIds, injuredPlayerId], squad);
    }
    return sortPlayerIdsByPosition(lineupIds, squad);
  }, [injuredPlayerId, lineupIds, squad]);

  const [draftLineup, setDraftLineup] = useState(() => starterIds);
  const [draftBench, setDraftBench] = useState(() =>
    sortPlayerIdsByPosition(benchIds, squad)
  );
  const [selectedStarterId, setSelectedStarterId] = useState<number | null>(
    () => injuredPlayerId ?? null
  );
  const [selectedBenchId, setSelectedBenchId] = useState<number | null>(null);

  useEffect(() => {
    setDraftLineup(starterIds);
    setDraftBench(sortPlayerIdsByPosition(benchIds, squad));
    setSelectedStarterId(injuredPlayerId ?? null);
    setSelectedBenchId(null);
    setLocallySubbedOut(new Set());
  }, [starterIds, benchIds, squad, injuredPlayerId]);

  const starters = draftLineup
    .map((id) => squad.find((p) => p.id === id))
    .filter((p): p is Player => !!p);
  const bench = draftBench
    .map((id) => squad.find((p) => p.id === id))
    .filter((p): p is Player => !!p);

  function getStats(playerId: number) {
    return getPlayerLiveMatchStats(playerId, humanMatch, minute);
  }

  function isExpelled(playerId: number) {
    return getStats(playerId).expelled;
  }

  function isUnavailable(playerId: number) {
    return isExpelled(playerId) || unavailableIds.has(playerId);
  }

  function handlePickStarter(playerId: number) {
    if (isUnavailable(playerId)) return;
    setSelectedStarterId((prev) => (prev === playerId ? null : playerId));
  }

  function handlePickBench(playerId: number) {
    if (isUnavailable(playerId)) return;
    setSelectedBenchId((prev) => (prev === playerId ? null : playerId));
  }

  const canConfirmSwap =
    selectedStarterId != null &&
    selectedBenchId != null &&
    draftLineup.includes(selectedStarterId) &&
    draftBench.includes(selectedBenchId) &&
    !isUnavailable(selectedStarterId) &&
    !isUnavailable(selectedBenchId);

  function handleConfirmSwap() {
    if (!canConfirmSwap || selectedStarterId == null || selectedBenchId == null) {
      return;
    }
    const result = swapSquadPlayers(
      squad,
      draftLineup,
      draftBench,
      selectedStarterId,
      selectedBenchId
    );
    if (result) {
      setLocallySubbedOut(
        (prev) => new Set([...prev, selectedStarterId])
      );
      setDraftLineup(result.lineupIds);
      setDraftBench(result.benchIds);
    }
    setSelectedStarterId(null);
    setSelectedBenchId(null);
  }

  const valid =
    isValidLineup(draftLineup, squad) &&
    (!injuredPlayerId || !draftLineup.includes(injuredPlayerId));

  const humanTeam =
    humanMatch.homeClubId === humanClub.id ? "home" : "away";
  const expulsions = countTeamExpulsionsAtMinute(
    humanMatch,
    humanTeam,
    minute
  );
  const currentScore = getScoreAtMinute(humanMatch, minute);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div
        className="ef-game-theme flex max-h-[90vh] w-full max-w-2xl flex-col"
        style={clubPanelThemeStyle(humanClub)}
      >
        <div className="ef-panel min-h-0 flex-1 overflow-y-auto p-4">
        <h2 className="ef-title mb-2 text-lg">{title}</h2>
        <p className="mb-2 text-sm">
          {humanMatch.homeName}{" "}
          <span className="ef-accent-text">
            {currentScore.home} x {currentScore.away}
          </span>{" "}
          {humanMatch.awayName}
        </p>
        <p className="mb-3 text-xs ef-muted-text">
          Selecione um titular e uma reserva, depois confirme a troca.
          {injuredPlayerId && (
            <span className="text-red-400">
              {" "}
              Substitua o jogador lesionado antes de fechar
              {injuryDays != null ? ` (${injuryDays}R).` : "."}
            </span>
          )}
          {expulsions > 0 && (
            <span className="text-red-400">
              {" "}
              Expulsos não podem sair — time com -{expulsions} em campo.
            </span>
          )}
          {unavailableIds.size > 0 && (
            <span className="text-[var(--ef-muted-text)]">
              {" "}
              Reservas já substituídos não podem voltar.
            </span>
          )}
        </p>

        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm ef-accent-text">Titulares</h3>
            <ul className="space-y-1">
              {starters.map((p) => (
                <SubPlayerRow
                  key={p.id}
                  player={p}
                  stats={getStats(p.id)}
                  selected={selectedStarterId === p.id}
                  disabled={isExpelled(p.id)}
                  injured={p.id === injuredPlayerId}
                  injuryDays={p.id === injuredPlayerId ? injuryDays ?? undefined : undefined}
                  onClick={() => handlePickStarter(p.id)}
                />
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm ef-accent-text">Reservas</h3>
            <ul className="space-y-1">
              {bench.map((p) => (
                <SubPlayerRow
                  key={p.id}
                  player={p}
                  stats={getStats(p.id)}
                  selected={selectedBenchId === p.id}
                  disabled={unavailableIds.has(p.id)}
                  onClick={() => handlePickBench(p.id)}
                />
              ))}
            </ul>
          </div>
        </div>

        {canConfirmSwap && (
          <div className="mb-3">
            <button
              type="button"
              className="ef-btn ef-btn-active w-full"
              onClick={handleConfirmSwap}
            >
              Confirmar
            </button>
          </div>
        )}

        <button
          type="button"
          className="ef-btn w-full"
          disabled={!valid}
          onClick={() => onConfirm(draftLineup, draftBench)}
        >
          Fechar
        </button>
        </div>
      </div>
    </div>
  );
}

export default function LiveRoundView({
  state,
  mode = "league",
  matchSpeed = DEFAULT_MATCH_SPEED,
  onComplete,
  onCancel,
}: LiveRoundViewProps) {
  const [matchPlans, setMatchPlans] = useState<LiveMatchPlan[]>(() => {
    if (mode === "cup") {
      return prepareLiveCupRoundAll(state);
    }
    return prepareLiveRound(state);
  });
  const [lineupIds, setLineupIds] = useState(state.lineupPlayerIds);
  const [benchIds, setBenchIds] = useState(state.benchPlayerIds);
  const [minute, setMinute] = useState(0);
  const [paused, setPaused] = useState(true);
  const [subsOpen, setSubsOpen] = useState(false);
  const [subsMode, setSubsMode] = useState<
    "halftime" | "manual" | "extra_time" | "red_card" | "injury"
  >("manual");
  const [secondHalfReady, setSecondHalfReady] = useState(false);
  const [extraTimeReady, setExtraTimeReady] = useState(false);
  const [pendingExtraTimeSubs, setPendingExtraTimeSubs] = useState(false);
  const [overtimePlanKeys, setOvertimePlanKeys] = useState<number[] | null>(null);
  const [maxMinute, setMaxMinute] = useState(90);
  const [finishing, setFinishing] = useState(false);
  const [started, setStarted] = useState(false);
  const [animatedView, setAnimatedView] = useState(false);
  const [processedPenaltyIds, setProcessedPenaltyIds] = useState<string[]>([]);
  const [activePenalty, setActivePenalty] = useState<{
    planKey: number;
    chance: PenaltyChanceEvent;
  } | null>(null);
  const [penaltyChoice, setPenaltyChoice] = useState<number | null>(null);
  const [penaltyOverlay, setPenaltyOverlay] = useState<{
    kicker: PenaltyKicker;
    outcome: PenaltyKickOutcome | null;
    teamName: string;
    attackingClubId: number;
    minute?: number;
  } | null>(null);
  const [shootoutPlayback, setShootoutPlayback] = useState<{
    summary: PenaltyShootoutSummary;
    index: number;
    homeMarks: string[];
    awayMarks: string[];
    done: boolean;
  } | null>(null);
  const [shootoutCompleted, setShootoutCompleted] = useState(false);
  const [inspectTarget, setInspectTarget] = useState<{
    clubId: number;
    plan: LiveMatchPlan;
  } | null>(null);
  const [halftimeQueue, setHalftimeQueue] = useState<HalftimeSubsTarget[]>([]);
  const [activeSubsTarget, setActiveSubsTarget] =
    useState<HalftimeSubsTarget | null>(null);
  const handleFinishRef = useRef<() => Promise<void>>(async () => {});
  const matchPlansRef = useRef<LiveMatchPlan[]>(matchPlans);
  const prevMinuteRef = useRef(0);
  const processingPenaltyIdRef = useRef<string | null>(null);
  const goalAudioCtxRef = useRef<AudioContext | null>(null);
  const handledRedCardsRef = useRef<Set<string>>(new Set());
  const handledInjuriesRef = useRef<Set<string>>(new Set());
  const [activeInjuryPlayerId, setActiveInjuryPlayerId] = useState<number | null>(
    null
  );
  const [activeInjuryDays, setActiveInjuryDays] = useState<number | null>(null);
  const [liveBenchByClub, setLiveBenchByClub] = useState<Record<number, number[]>>(
    () => {
      const initial: Record<number, number[]> = {};
      for (const manager of state.localManagers) {
        if (manager.benchPlayerIds.length > 0) {
          initial[manager.clubId] = [...manager.benchPlayerIds];
        }
      }
      if (state.benchPlayerIds.length > 0) {
        initial[state.humanClubId] = [...state.benchPlayerIds];
      }
      return initial;
    }
  );
  const [substitutedOutByClub, setSubstitutedOutByClub] = useState<
    Record<number, number[]>
  >({});

  const humanClubIds = useMemo(() => getHumanClubIds(state), [state]);
  const humanMatches = useMemo(
    () => matchPlans.filter((m) => m.isHumanMatch),
    [matchPlans]
  );
  const humanMatch = useMemo(() => {
    const forActive = humanMatches.find(
      (m) =>
        m.homeClubId === state.humanClubId || m.awayClubId === state.humanClubId
    );
    return forActive ?? humanMatches[0];
  }, [humanMatches, state.humanClubId]);
  const humanClub = state.clubs.find((c) => c.id === state.humanClubId)!;
  const squad = getPlayersByClub(state.players, state.humanClubId);
  const divisions = useMemo(
    () =>
      sortNationalDivisionsForGrid([
        ...new Set(matchPlans.map((m) => m.division)),
      ]),
    [matchPlans]
  );

  const getPlanKey = (plan: LiveMatchPlan) => plan.cupTieId ?? plan.fixtureId;

  const currentTactic =
    lineupIds.length > 0 ? deriveTacticLabel(lineupIds, squad) : "—";
  const fallbackHumanLineupIds = useMemo(() => {
    if (!humanMatch) return [];
    return humanMatch.homeClubId === state.humanClubId
      ? humanMatch.homeLineupIds
      : humanMatch.awayLineupIds;
  }, [humanMatch, state.humanClubId]);
  const defaultLineupIds = useMemo(
    () => buildDefaultSquad(squad).lineupIds,
    [squad]
  );
  const effectiveLineupIds =
    lineupIds.length > 0
      ? lineupIds
      : fallbackHumanLineupIds.length > 0
        ? fallbackHumanLineupIds
        : defaultLineupIds;
  const effectiveBenchIds =
    benchIds.length > 0
      ? benchIds.filter((id) => {
          const player = squad.find((p) => p.id === id);
          return !!player && isPlayerAvailable(player);
        })
      : pickBenchPlayers(squad, effectiveLineupIds);

  const subsPlan = useMemo(() => {
    if (activeSubsTarget) {
      return (
        matchPlans.find((p) => getPlanKey(p) === activeSubsTarget.planKey) ??
        humanMatch
      );
    }
    return humanMatch;
  }, [activeSubsTarget, matchPlans, humanMatch]);

  const subsClubId = activeSubsTarget?.clubId ?? state.humanClubId;
  const subsClub = state.clubs.find((c) => c.id === subsClubId)!;
  const subsSquad = getPlayersByClub(state.players, subsClubId);
  const subsLineupIds = subsPlan
    ? getLineupForClubInPlan(subsPlan, subsClubId)
    : effectiveLineupIds;
  const subsBenchIds = getBenchForClub(
    state,
    subsClubId,
    subsLineupIds,
    liveBenchByClub
  );
  const subsDisabledPlayerIds = substitutedOutByClub[subsClubId] ?? [];

  const tickMs = (matchSpeed * 1000) / 90;

  function ensureGoalAudioContext(): AudioContext | null {
    const Ctx =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return null;
    if (!goalAudioCtxRef.current) {
      goalAudioCtxRef.current = new Ctx();
    }
    return goalAudioCtxRef.current;
  }

  useEffect(() => {
    matchPlansRef.current = matchPlans;
  }, [matchPlans]);

  function playGoalBeepNow(ctx: AudioContext) {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "triangle";
    osc2.type = "sine";
    osc1.frequency.value = 820;
    osc2.frequency.value = 1120;

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start(ctx.currentTime + 0.03);
    osc1.stop(ctx.currentTime + 0.24);
    osc2.stop(ctx.currentTime + 0.3);
  }

  function playGoalBeep() {
    try {
      const ctx = goalAudioCtxRef.current ?? ensureGoalAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") {
        void ctx.resume().then(() => {
          try {
            playGoalBeepNow(ctx);
          } catch {
            // ignore
          }
        });
        return;
      }
      playGoalBeepNow(ctx);
    } catch {
      // Falha de áudio não deve interromper o jogo.
    }
  }

  useEffect(() => {
    if (
      !started ||
      paused ||
      subsOpen ||
      !!activePenalty ||
      !!penaltyOverlay ||
      !!shootoutPlayback ||
      minute >= maxMinute
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setMinute((m) => {
        const next = m + 1;

        if (next >= 45 && !secondHalfReady) {
          const hasPendingHalftime = matchPlans.some(
            (m) => m.isHumanMatch && m.secondHalfPending
          );
          if (hasPendingHalftime) {
            const queue = buildHalftimeQueue(
              matchPlans,
              humanClubIds,
              getPlanKey
            );
            if (queue.length > 0) {
              const [first, ...rest] = queue;
              setHalftimeQueue(rest);
              setActiveSubsTarget(first);
              setPaused(true);
              setSubsOpen(true);
              setSubsMode("halftime");
              return 45;
            }
          }
        }

        const pendingPenalty = matchPlans
          .flatMap((plan) =>
            (plan.penaltyChances ?? []).map((chance) => ({
              planKey: getPlanKey(plan),
              chance,
            }))
          )
          .find(
            (item) =>
              item.chance.minute === next &&
              !processedPenaltyIds.includes(item.chance.id)
          );

        if (pendingPenalty) {
          setPaused(true);
          setActivePenalty(pendingPenalty);
          return next;
        }

        if (next >= maxMinute) {
          setPaused(true);
          return maxMinute;
        }

        return next;
      });
    }, tickMs);

    return () => window.clearInterval(timer);
  }, [
    started,
    paused,
    subsOpen,
    activePenalty,
    penaltyOverlay,
    shootoutPlayback,
    minute,
    tickMs,
    secondHalfReady,
    humanClubIds,
    maxMinute,
    matchPlans,
    processedPenaltyIds,
  ]);

  const handleStart = () => {
    const ctx = ensureGoalAudioContext();
    if (ctx && ctx.state === "suspended") {
      void ctx.resume();
    }
    prevMinuteRef.current = 0;
    setProcessedPenaltyIds([]);
    setActivePenalty(null);
    setPenaltyChoice(null);
    setPenaltyOverlay(null);
    setExtraTimeReady(false);
    setPendingExtraTimeSubs(false);
    setOvertimePlanKeys(null);
    setShootoutPlayback(null);
    setShootoutCompleted(false);
    setHalftimeQueue([]);
    setActiveSubsTarget(null);
    setMaxMinute(90);
    setStarted(true);
    setPaused(false);
    setMinute(1);
  };

  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    handleStart();
  }, []);

  useEffect(() => {
    return () => {
      if (goalAudioCtxRef.current) {
        void goalAudioCtxRef.current.close();
        goalAudioCtxRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!started || minute <= 0) return;
    const previousMinute = prevMinuteRef.current;
    const shouldBeep = matchPlans
      .filter((m) => m.isHumanMatch)
      .some((plan) =>
        plan.events.some(
          (e) =>
            e.minute > previousMinute &&
            e.minute <= minute &&
            !e.isPenalty
        )
      );
    if (shouldBeep) {
      playGoalBeep();
    }
    prevMinuteRef.current = minute;
  }, [started, minute, matchPlans]);

  useEffect(() => {
    if (!started || minute <= 0) return;
    if (subsOpen || activePenalty || penaltyOverlay || shootoutPlayback) return;
    if (minute >= maxMinute) return;

    for (const plan of matchPlans.filter((m) => m.isHumanMatch)) {
      for (const clubId of humanClubIds) {
        if (clubId !== plan.homeClubId && clubId !== plan.awayClubId) continue;
        const humanTeam = clubId === plan.homeClubId ? "home" : "away";
        const newRed = (plan.cardEvents ?? []).find(
          (e) =>
            e.team === humanTeam &&
            e.type === "red" &&
            e.minute <= minute &&
            !handledRedCardsRef.current.has(`${e.playerId}-${e.minute}`)
        );
        if (!newRed) continue;

        handledRedCardsRef.current.add(`${newRed.playerId}-${newRed.minute}`);
        setActiveSubsTarget({ planKey: getPlanKey(plan), clubId });
        setPaused(true);
        setSubsMode("red_card");
        setSubsOpen(true);
        return;
      }
    }
  }, [
    started,
    minute,
    matchPlans,
    humanClubIds,
    subsOpen,
    activePenalty,
    penaltyOverlay,
    shootoutPlayback,
    maxMinute,
  ]);

  useEffect(() => {
    if (!started || minute <= 0) return;
    if (subsOpen || activePenalty || penaltyOverlay || shootoutPlayback) return;
    if (minute >= maxMinute) return;

    for (const plan of matchPlans.filter((m) => m.isHumanMatch)) {
      for (const clubId of humanClubIds) {
        if (clubId !== plan.homeClubId && clubId !== plan.awayClubId) continue;
        const humanTeam = clubId === plan.homeClubId ? "home" : "away";
        const newInjury = (plan.injuryEvents ?? []).find(
          (e) =>
            e.team === humanTeam &&
            e.minute <= minute &&
            !handledInjuriesRef.current.has(`${e.playerId}-${e.minute}`)
        );
        if (!newInjury) continue;

        handledInjuriesRef.current.add(`${newInjury.playerId}-${newInjury.minute}`);
        setActiveInjuryPlayerId(newInjury.playerId);
        setActiveInjuryDays(newInjury.days);
        setActiveSubsTarget({ planKey: getPlanKey(plan), clubId });
        setPaused(true);
        setSubsMode("injury");
        setSubsOpen(true);
        return;
      }
    }
  }, [
    started,
    minute,
    matchPlans,
    humanClubIds,
    subsOpen,
    activePenalty,
    penaltyOverlay,
    shootoutPlayback,
    maxMinute,
  ]);

  const handleSubsConfirm = useCallback(
    (newLineup: number[], newBench: number[]) => {
      const targetClubId = activeSubsTarget?.clubId ?? state.humanClubId;
      const targetSquad = getPlayersByClub(state.players, targetClubId);
      const sortedLineup = sortPlayerIdsByPosition(newLineup, targetSquad);
      const sortedBench = sortPlayerIdsByPosition(newBench, targetSquad);

      const targetPlanKey = activeSubsTarget?.planKey;
      const targetPlan = targetPlanKey
        ? matchPlans.find((p) => getPlanKey(p) === targetPlanKey)
        : subsPlan ?? humanMatch;

      if (targetPlan) {
        const prevLineup = getLineupForClubInPlan(targetPlan, targetClubId);
        const removedIds = prevLineup.filter((id) => !sortedLineup.includes(id));
        if (removedIds.length > 0) {
          setSubstitutedOutByClub((prev) => {
            const existing = new Set(prev[targetClubId] ?? []);
            for (const id of removedIds) existing.add(id);
            return { ...prev, [targetClubId]: [...existing] };
          });
        }
      }

      setLiveBenchByClub((prev) => ({
        ...prev,
        [targetClubId]: sortedBench,
      }));

      if (targetClubId === state.humanClubId) {
        setLineupIds(sortedLineup);
        setBenchIds(sortedBench);
      }

      let updatedPlans = matchPlans;
      if (targetPlan) {
        const updatedPlanWithLineup = updatePlanLineup(
          targetPlan,
          targetClubId,
          sortedLineup
        );
        const targetTeam = targetClubId === targetPlan.homeClubId ? "home" : "away";
        const updatedLineupPlayers = sortedLineup
          .map((id) => targetSquad.find((player) => player.id === id))
          .filter((player): player is Player => !!player);
        const updatedPlan = {
          ...updatedPlanWithLineup,
          events: reassignGoalScorersAfterMinute(
            updatedPlanWithLineup.events,
            targetTeam,
            minute,
            updatedLineupPlayers,
            getPlanKey(updatedPlanWithLineup) * 97 + targetClubId * 13 + minute * 17
          ),
        };
        updatedPlans = matchPlans.map((p) =>
          getPlanKey(p) === getPlanKey(updatedPlan) ? updatedPlan : p
        );
        setMatchPlans(updatedPlans);
      }

      if (subsMode === "halftime" && activeSubsTarget) {
        if (halftimeQueue.length > 0) {
          const [next, ...rest] = halftimeQueue;
          setHalftimeQueue(rest);
          setActiveSubsTarget(next);
          return;
        }

        setMatchPlans(
          applySecondHalvesToHumanMatches(state, updatedPlans, mode)
        );
        setActiveSubsTarget(null);
        setHalftimeQueue([]);
        setSecondHalfReady(true);
        setSubsOpen(false);
        setPaused(false);
        setMinute(45);
        return;
      }

      if (subsMode === "extra_time" && mode === "cup") {
        if (halftimeQueue.length > 0) {
          const [next, ...rest] = halftimeQueue;
          setHalftimeQueue(rest);
          setActiveSubsTarget(next);
          return;
        }

        const overtimeKeys = new Set(overtimePlanKeys ?? []);
        setMatchPlans((plans) =>
          plans.map((plan) => {
            const key = getPlanKey(plan);
            return overtimeKeys.has(key)
              ? resolveCupLiveKnockout(state, plan, sortedLineup)
              : plan;
          })
        );
        setExtraTimeReady(true);
        setPendingExtraTimeSubs(false);
        setMaxMinute(120);
        setSubsOpen(false);
        setPaused(false);
        setMinute(90);
        return;
      }

      setActiveSubsTarget(null);
      setActiveInjuryPlayerId(null);
      setActiveInjuryDays(null);
      setSubsOpen(false);
      setPaused(false);
    },
    [
      subsMode,
      activeSubsTarget,
      halftimeQueue,
      humanMatch,
      subsPlan,
      state,
      mode,
      matchPlans,
      overtimePlanKeys,
      minute,
    ]
  );

  useEffect(() => {
    if (!activePenalty) return;
    if (processingPenaltyIdRef.current === activePenalty.chance.id) return;
    const targetPlan = matchPlansRef.current.find(
      (p) => getPlanKey(p) === activePenalty.planKey
    );
    if (!targetPlan) return;

    const attackingClubId =
      activePenalty.chance.team === "home" ? targetPlan.homeClubId : targetPlan.awayClubId;
    const isHumanPenalty = humanClubIds.includes(attackingClubId);
    if (isHumanPenalty) return;
    processingPenaltyIdRef.current = activePenalty.chance.id;
    setProcessedPenaltyIds((prev) =>
      prev.includes(activePenalty.chance.id) ? prev : [...prev, activePenalty.chance.id]
    );

    const attackingLineup = getLineupForClubInPlan(targetPlan, attackingClubId);
    const { club: attackingClub, teamName } = getPenaltyAttackingClub(
      targetPlan,
      activePenalty.chance.team,
      state
    );
    const resolved = resolveLiveMatchPenalty(
      state,
      targetPlan,
      activePenalty.chance.team,
      null,
      activePenalty.chance.minute,
      attackingLineup
    );
    setMatchPlans((prev) =>
      prev.map((p) => (getPlanKey(p) === activePenalty.planKey ? resolved.plan : p))
    );
    const overlayBase = {
      kicker: resolved.kicker,
      teamName,
      attackingClubId: attackingClub.id,
      minute: activePenalty.chance.minute,
    };
    setPenaltyOverlay({ ...overlayBase, outcome: null });

    const reveal = window.setTimeout(() => {
      setPenaltyOverlay({ ...overlayBase, outcome: resolved.outcome });
    }, 2000);
    const close = window.setTimeout(() => {
      setPenaltyOverlay(null);
      setActivePenalty(null);
      processingPenaltyIdRef.current = null;
      setPaused(false);
    }, 4000);

    return () => {
      window.clearTimeout(reveal);
      window.clearTimeout(close);
    };
  }, [activePenalty, state, humanClubIds]);

  useEffect(() => {
    if (!activePenalty || penaltyChoice == null) return;
    if (processingPenaltyIdRef.current === activePenalty.chance.id) return;
    const targetPlan = matchPlansRef.current.find(
      (p) => getPlanKey(p) === activePenalty.planKey
    );
    if (!targetPlan) return;
    const attackingClubId =
      activePenalty.chance.team === "home" ? targetPlan.homeClubId : targetPlan.awayClubId;
    const isHumanPenalty = humanClubIds.includes(attackingClubId);
    if (!isHumanPenalty) return;
    processingPenaltyIdRef.current = activePenalty.chance.id;
    setProcessedPenaltyIds((prev) =>
      prev.includes(activePenalty.chance.id) ? prev : [...prev, activePenalty.chance.id]
    );

    const attackingLineup = getLineupForClubInPlan(targetPlan, attackingClubId);
    const { club: attackingClub, teamName } = getPenaltyAttackingClub(
      targetPlan,
      activePenalty.chance.team,
      state
    );
    const resolved = resolveLiveMatchPenalty(
      state,
      targetPlan,
      activePenalty.chance.team,
      penaltyChoice,
      activePenalty.chance.minute,
      attackingLineup
    );
    setMatchPlans((prev) =>
      prev.map((p) => (getPlanKey(p) === activePenalty.planKey ? resolved.plan : p))
    );
    const overlayBase = {
      kicker: resolved.kicker,
      teamName,
      attackingClubId: attackingClub.id,
      minute: activePenalty.chance.minute,
    };
    setPenaltyOverlay({ ...overlayBase, outcome: null });

    const reveal = window.setTimeout(() => {
      setPenaltyOverlay({ ...overlayBase, outcome: resolved.outcome });
    }, 2000);
    const close = window.setTimeout(() => {
      setPenaltyOverlay(null);
      setPenaltyChoice(null);
      setActivePenalty(null);
      processingPenaltyIdRef.current = null;
      setPaused(false);
    }, 4000);

    return () => {
      window.clearTimeout(reveal);
      window.clearTimeout(close);
    };
  }, [activePenalty, penaltyChoice, state, humanClubIds]);

  const cupLabel = humanMatch?.cupPhaseLabel;
  const roundTitle =
    mode === "cup" && cupLabel
      ? `${cupLabel} — Ao vivo`
      : `Rodada ${state.round} — Ao vivo`;

  const handleFinish = useCallback(async () => {
    setFinishing(true);
    try {
      if (mode === "cup") {
        const final = await actionCompleteCupLiveRound(
          state.id,
          matchPlans,
          lineupIds,
          benchIds
        );
        onComplete(final);
        return;
      }
      const final = await actionCompleteLiveRound(
        state.id,
        matchPlans,
        lineupIds,
        benchIds
      );
      onComplete(final);
    } finally {
      setFinishing(false);
    }
  }, [mode, state, matchPlans, lineupIds, benchIds, onComplete]);

  useEffect(() => {
    handleFinishRef.current = handleFinish;
  }, [handleFinish]);

  useEffect(() => {
    if (!started || mode !== "cup" || minute < 90 || extraTimeReady) return;
    if (pendingExtraTimeSubs) return;
    const tiedPlans = matchPlans.filter((p) => p.finalHomeGoals === p.finalAwayGoals);
    if (tiedPlans.length === 0) return;
    const overtimeKeys = tiedPlans.map((p) => getPlanKey(p));
    setOvertimePlanKeys(overtimeKeys);

    const humanNeedsExtra = tiedPlans.some((p) => p.isHumanMatch);
    if (humanNeedsExtra) {
      const queue: HalftimeSubsTarget[] = [];
      for (const plan of tiedPlans) {
        if (!plan.isHumanMatch) continue;
        for (const clubId of humanClubIds) {
          if (clubId === plan.homeClubId || clubId === plan.awayClubId) {
            queue.push({ planKey: getPlanKey(plan), clubId });
          }
        }
      }
      if (queue.length > 0) {
        const [first, ...rest] = queue;
        setHalftimeQueue(rest);
        setActiveSubsTarget(first);
      }
      setPaused(true);
      setSubsMode("extra_time");
      setSubsOpen(true);
      setPendingExtraTimeSubs(true);
      return;
    }

    const overtimeSet = new Set(overtimeKeys);
    const resolved = matchPlans.map((plan) =>
      overtimeSet.has(getPlanKey(plan))
        ? resolveCupLiveKnockout(state, plan, lineupIds)
        : plan
    );
    setMatchPlans(resolved);
    setExtraTimeReady(true);
    setMaxMinute(120);
    setPaused(false);
  }, [started, mode, minute, extraTimeReady, pendingExtraTimeSubs, matchPlans, state, lineupIds, humanClubIds]);

  useEffect(() => {
    if (mode !== "cup" || minute < 120 || !started || shootoutPlayback) return;
    const shootout = humanMatch?.penaltyShootout;
    if (!shootout) return;
    setPaused(true);
    setShootoutPlayback({
      summary: shootout,
      index: 0,
      homeMarks: [],
      awayMarks: [],
      done: false,
    });
  }, [mode, minute, started, shootoutPlayback, humanMatch?.penaltyShootout]);

  useEffect(() => {
    if (!shootoutPlayback || shootoutPlayback.done) return;
    if (shootoutPlayback.index >= shootoutPlayback.summary.kicks.length) {
      setShootoutPlayback((prev) => (prev ? { ...prev, done: true } : prev));
      return;
    }

    const kick = shootoutPlayback.summary.kicks[shootoutPlayback.index]!;
    const shootoutPlan = humanMatch;
    const timer = window.setTimeout(() => {
      if (shootoutPlan) {
        const { teamName, club } = getPenaltyAttackingClub(
          shootoutPlan,
          kick.team,
          state
        );
        setPenaltyOverlay({
          kicker: {
            name: kick.kickerName,
            isStar:
              state.players.find((p) => p.id === kick.kickerId)?.isStar ?? false,
          },
          outcome: kick.outcome,
          teamName,
          attackingClubId: club.id,
        });
      }
      setShootoutPlayback((prev) => {
        if (!prev) return prev;
        const mark = kick.outcome === "goal" ? "G" : "X";
        return {
          ...prev,
          index: prev.index + 1,
          homeMarks:
            kick.team === "home" ? [...prev.homeMarks, mark] : prev.homeMarks,
          awayMarks:
            kick.team === "away" ? [...prev.awayMarks, mark] : prev.awayMarks,
        };
      });
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [shootoutPlayback]);

  useEffect(() => {
    if (!shootoutPlayback?.done) return;
    const close = window.setTimeout(() => {
      setPenaltyOverlay(null);
      setShootoutPlayback(null);
      setShootoutCompleted(true);
      setPaused(false);
    }, 1200);
    return () => window.clearTimeout(close);
  }, [shootoutPlayback?.done]);

  useEffect(() => {
    if (minute < maxMinute || !started || finishing) return;
    if (mode === "cup" && humanMatch?.penaltyShootout && !shootoutCompleted) return;
    if (mode === "cup" && !extraTimeReady) {
      const hasDrawAtNinety = matchPlans.some(
        (p) => p.finalHomeGoals === p.finalAwayGoals
      );
      if (hasDrawAtNinety) return;
    }
    if (pendingExtraTimeSubs || subsOpen) return;

    const timer = window.setTimeout(() => {
      void handleFinishRef.current();
    }, 150);

    return () => window.clearTimeout(timer);
  }, [
    minute,
    maxMinute,
    started,
    finishing,
    mode,
    humanMatch?.penaltyShootout,
    shootoutCompleted,
    extraTimeReady,
    matchPlans,
    pendingExtraTimeSubs,
    subsOpen,
  ]);

  const handleInspectClub = useCallback(
    (clubId: number, plan: LiveMatchPlan) => {
      if (humanClubIds.includes(clubId)) {
        setActiveSubsTarget({ planKey: getPlanKey(plan), clubId });
        setPaused(true);
        setSubsMode("manual");
        setSubsOpen(true);
        return;
      }
      setPaused(true);
      setInspectTarget({ clubId, plan });
    },
    [humanClubIds]
  );

  const handleCloseInspect = useCallback(() => {
    setInspectTarget(null);
    if (minute < maxMinute && !subsOpen) {
      setPaused(false);
    }
  }, [minute, subsOpen, maxMinute]);

  const humanExpulsions = useMemo(() => {
    if (minute <= 0) return 0;
    let total = 0;
    for (const plan of humanMatches) {
      for (const clubId of humanClubIds) {
        if (clubId !== plan.homeClubId && clubId !== plan.awayClubId) continue;
        const team = clubId === plan.homeClubId ? "home" : "away";
        total += countTeamExpulsionsAtMinute(plan, team, minute);
      }
    }
    return total;
  }, [humanMatches, humanClubIds, minute]);

  const displayClubLabel =
    humanClubIds.length > 1
      ? humanClubIds
          .map((id) => state.clubs.find((c) => c.id === id)?.name ?? "?")
          .join(" · ")
      : humanClub.name;

  const displayedCupPlans =
    mode === "cup" && overtimePlanKeys && overtimePlanKeys.length > 0
      ? matchPlans.filter((p) => overtimePlanKeys.includes(getPlanKey(p)))
      : matchPlans;

  return (
    <div className="ef-live-theme fixed inset-0 z-40 overflow-y-auto p-4">
      <div className={mode === "league" ? "mx-auto w-full max-w-none" : "mx-auto max-w-3xl"}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="ef-title text-xl">{roundTitle}</h2>
            <p className="text-sm ef-muted-text">
              {displayClubLabel} · Tática {currentTactic}
              {humanExpulsions > 0 && (
                <span className="ml-2 text-red-400">
                  ({humanExpulsions} expulso{humanExpulsions > 1 ? "s" : ""})
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="ef-panel px-4 py-2 text-center">
              <div className="text-2xl font-bold ef-accent-text">
                {minute}&apos;
              </div>
              <div className="text-xs ef-muted-text">
                {subsOpen && subsMode === "halftime"
                  ? "INTERVALO"
                  : paused
                    ? "PAUSADO"
                    : minute <= 45
                      ? "1º tempo"
                      : minute <= 90
                        ? "2º tempo"
                        : "PRORROGAÇÃO"}
              </div>
            </div>

            <button
              type="button"
              className="ef-btn"
              disabled={!started || subsOpen || minute >= maxMinute}
              onClick={() => {
                if (humanMatch) {
                  setActiveSubsTarget({
                    planKey: getPlanKey(humanMatch),
                    clubId: state.humanClubId,
                  });
                }
                setPaused(true);
                setSubsMode("manual");
                setSubsOpen(true);
              }}
            >
              Substituições
            </button>

            {humanMatch && (
              <button
                type="button"
                className={`ef-btn text-xs ${animatedView ? 'ef-btn-active' : ''}`}
                onClick={() => setAnimatedView(!animatedView)}
                title="Alternar visualização do campo"
              >
                {animatedView ? '📺 Clássica' : '⚽ Campo'}
              </button>
            )}

            <button type="button" className="ef-btn text-sm" onClick={onCancel}>
              Cancelar
            </button>
          </div>
        </div>

        {animatedView && humanMatch ? (
          <div className="flex justify-center">
            <MiniField
              homePlayers={state.players.filter(p => humanMatch.homeLineupIds.includes(p.id))}
              awayPlayers={state.players.filter(p => humanMatch.awayLineupIds.includes(p.id))}
              homeFormation={(() => {
                const homeClub = state.clubs.find(c => c.id === humanMatch.homeClubId);
                return homeClub?.formation ?? "4-4-2";
              })()}
              awayFormation={(() => {
                const awayClub = state.clubs.find(c => c.id === humanMatch.awayClubId);
                return awayClub?.formation ?? "4-4-2";
              })()}
              homeName={humanMatch.homeName}
              awayName={humanMatch.awayName}
              homeGoals={humanMatch.events.filter(e => e.team === "home" && e.minute <= minute).length}
              awayGoals={humanMatch.events.filter(e => e.team === "away" && e.minute <= minute).length}
              minute={minute}
              homeColor={state.clubs.find(c => c.id === humanMatch.homeClubId)?.primaryColor ?? "#4ade80"}
              awayColor={state.clubs.find(c => c.id === humanMatch.awayClubId)?.primaryColor ?? "#f87171"}
            />
          </div>
        ) : mode === "cup" ? (
          <section className="ef-panel p-3">
            <ul className="space-y-2">
              {displayedCupPlans.map((m) => {
                const homeClub = state.clubs.find((c) => c.id === m.homeClubId)!;
                const awayClub = state.clubs.find((c) => c.id === m.awayClubId)!;
                return (
                  <LiveMatchRow
                    key={m.cupTieId ?? m.fixtureId}
                    plan={m}
                    minute={minute}
                    homeClub={homeClub}
                    awayClub={awayClub}
                    humanClubIds={humanClubIds}
                    canInspect={started && minute < maxMinute}
                    onInspectClub={(clubId) => handleInspectClub(clubId, m)}
                  />
                );
              })}
            </ul>
          </section>
        ) : (
          <div
            className={`grid gap-2 ${
              divisions.length >= 4
                ? "grid-cols-2 grid-rows-2 h-[calc(100vh-180px)]"
                : "grid-cols-1 lg:grid-cols-2"
            }`}
          >
            {divisions.map((div) => {
              const divMatches = matchPlans.filter((m) => m.division === div);
              return (
                <section key={div} className="ef-panel flex min-h-0 flex-col p-2">
                  <h3 className="ef-title mb-1 text-xs">{div}ª Divisão</h3>
                  <ul className="space-y-1 overflow-y-auto pr-1">
                    {divMatches.map((m) => {
                      const homeClub = state.clubs.find(
                        (c) => c.id === m.homeClubId
                      )!;
                      const awayClub = state.clubs.find(
                        (c) => c.id === m.awayClubId
                      )!;
                      return (
                        <LiveMatchRow
                          key={m.fixtureId}
                          plan={m}
                          minute={minute}
                          homeClub={homeClub}
                          awayClub={awayClub}
                          humanClubIds={humanClubIds}
                          canInspect={started && minute < maxMinute}
                          onInspectClub={(clubId) => handleInspectClub(clubId, m)}
                          compact
                        />
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

      </div>

      {activePenalty && !penaltyOverlay && (() => {
        const plan = matchPlans.find((p) => getPlanKey(p) === activePenalty.planKey);
        if (!plan) return null;
        const attackingClubId =
          activePenalty.chance.team === "home" ? plan.homeClubId : plan.awayClubId;
        const attackingClub = state.clubs.find((c) => c.id === attackingClubId)!;
        const isHumanPenalty = humanClubIds.includes(attackingClubId);
        const labelTeam =
          activePenalty.chance.team === "home" ? plan.homeName : plan.awayName;
        const penaltyLineup = getLineupForClubInPlan(plan, attackingClubId);
        const penaltySquad = getPlayersByClub(state.players, attackingClubId);
        const penaltyTakers = penaltyLineup
          .map((id) => penaltySquad.find((p) => p.id === id))
          .filter((p): p is Player => !!p)
          .filter((p) => p.position !== "GK")
          .sort((a, b) => b.skill - a.skill);
        const takers =
          penaltyTakers.length > 0
            ? penaltyTakers
            : penaltyLineup
                .map((id) => penaltySquad.find((p) => p.id === id))
                .filter((p): p is Player => !!p)
                .sort((a, b) => b.skill - a.skill);

        if (!isHumanPenalty) {
          return (
            <PenaltyMomentOverlay
              kicker={{ name: "Batedor", isStar: false }}
              outcome={null}
              teamName={labelTeam}
              club={attackingClub}
              minute={activePenalty.chance.minute}
            />
          );
        }

        return (
          <PenaltyPickerPanel
            minute={activePenalty.chance.minute}
            teamName={labelTeam}
            club={attackingClub}
            sufferedPlayerName={activePenalty.chance.sufferedPlayerName}
            takers={takers}
            selectedId={penaltyChoice}
            onSelect={setPenaltyChoice}
            disabled={penaltyChoice != null}
          />
        );
      })()}

      {penaltyOverlay && !shootoutPlayback && (() => {
        const club = state.clubs.find((c) => c.id === penaltyOverlay.attackingClubId);
        if (!club) return null;
        return (
          <PenaltyMomentOverlay
            kicker={penaltyOverlay.kicker}
            outcome={penaltyOverlay.outcome}
            teamName={penaltyOverlay.teamName}
            club={club}
            minute={penaltyOverlay.minute}
          />
        );
      })()}

      {shootoutPlayback && humanMatch && (
        <PenaltyShootoutOverlay
          homeName={humanMatch.homeName}
          awayName={humanMatch.awayName}
          homeMarks={shootoutPlayback.homeMarks}
          awayMarks={shootoutPlayback.awayMarks}
          kicker={
            penaltyOverlay?.kicker ?? { name: "Disputa de pênaltis", isStar: false }
          }
          outcome={penaltyOverlay?.outcome ?? null}
          phaseLabel="Disputa de pênaltis"
        />
      )}

      {inspectTarget && (
        <LiveSquadInspectPanel
          state={state}
          plan={inspectTarget.plan}
          clubId={inspectTarget.clubId}
          minute={minute}
          onClose={handleCloseInspect}
        />
      )}

      {subsOpen && subsPlan && (
        <SubstitutionPanel
          key={`${subsClubId}-${subsMode}-${activeInjuryPlayerId ?? "none"}`}
          squad={subsSquad}
          lineupIds={subsLineupIds}
          benchIds={subsBenchIds}
          humanMatch={subsPlan}
          minute={minute}
          humanClub={subsClub}
          disabledPlayerIds={subsDisabledPlayerIds}
          title={
            subsMode === "halftime"
              ? `Intervalo — ${subsClub.name}${
                  halftimeQueue.length > 0
                    ? ` (${halftimeQueue.length + 1} equipe(s) na fila)`
                    : ""
                }`
              : subsMode === "extra_time"
                ? `Prorrogação — ${subsClub.name}`
                : subsMode === "red_card"
                  ? `Expulsão — ${subsClub.name}`
                  : subsMode === "injury"
                    ? `Lesão — ${subsClub.name}`
                    : `Substituições — ${subsClub.name}`
          }
          injuredPlayerId={subsMode === "injury" ? activeInjuryPlayerId : null}
          injuryDays={subsMode === "injury" ? activeInjuryDays : null}
          onConfirm={handleSubsConfirm}
        />
      )}
    </div>
  );
}
