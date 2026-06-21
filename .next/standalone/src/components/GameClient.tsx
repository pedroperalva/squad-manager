"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Formation, GameState, MatchSpeed, PlayerSaleNotice, Position } from "@/engine/types";
import {
  DISTRITAL_DIVISION,
  FORMATION_PRESETS,
  NATIONAL_DIVISION_COUNT,
  formatDivisionLabel,
  formatCountriesLabel,
  sortNationalDivisionsForGrid,
  AGGRESSIVENESS_LABELS,
} from "@/engine/types";
import {
  getNextHumanFixture,
  getDivisionStandings,
  getPendingHumanCupTie,
  hasPendingHumanCupTies,
  getCupRoundLabel,
  getCoachRanking,
} from "@/engine/index";
import { getPlayersByClub } from "@/engine/player";
import { buildDefaultSquad, deriveTacticLabel, detectFormationMatch, isValidLineup } from "@/engine/squad";
import { getTopScorers } from "@/engine/player-history";
import {
  actionLoadGame,
  actionStartNextSeason,
  actionSetFormation,
  actionSetSquad,
  actionAcceptCoachOffer,
  actionRejectCoachOffer,
  actionBuyPlayer,
  actionRequestLoan,
  actionRepayLoan,
  actionExpandStadium,
  actionAcceptPlayerRaise,
  actionRejectPlayerRaise,
  actionUpdateAuctionMinBid,
  actionCancelAuctionListing,
  actionSellPlayerNow,
  actionConfirmManagerLineup,
  actionSimulateRound,
} from "@/app/actions";
import CoachOfferPage from "@/components/CoachOfferPage";
import SeasonSummaryPage from "@/components/SeasonSummaryPage";
import LiveRoundView from "@/components/LiveRoundView";
import SquadLineupTable from "@/components/SquadLineupTable";
import FinancesPanel from "@/components/FinancesPanel";
import AuctionView from "@/components/AuctionView";
import PlayerNameWithStar from "@/components/PlayerNameWithStar";
import PlayerDetailModal from "@/components/PlayerDetailModal";
import QuitGameButton from "@/components/QuitGameButton";
import { clubPanelThemeStyle, clubShellThemeStyle, clubKitBlockStyle } from "@/lib/club-theme";
import { canSellPlayer } from "@/engine/squad";
import { playerBlocksSale } from "@/engine/finances";
import { getPlayerBuyPrice } from "@/engine/transfer";
import { MATCH_SPEED_OPTIONS } from "@/engine/live-round";
import {
  DEFAULT_MATCH_SPEED,
  loadMatchSpeed,
  saveMatchSpeed,
} from "@/lib/match-settings";

function isCoachNewsMessage(message: string): boolean {
  return (
    message.includes("contratou") ||
    message.includes("demitiu") ||
    message.includes("repôs o cargo") ||
    message.includes("proposta") ||
    message.includes("demitido") ||
    message.includes("assumiu")
  );
}

function MoraleBar({ morale }: { morale: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(morale)));
  const color =
    pct <= 30
      ? "bg-red-500"
      : pct <= 69
        ? "bg-yellow-400"
        : "bg-green-500";

  return (
    <div
      className="relative h-5 w-32 overflow-hidden border border-[var(--ef-border)] bg-black/30"
      title={`Moral ${pct}%`}
    >
      <div
        className={`h-full ${color}`}
        style={{ width: `${pct}%` }}
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white drop-shadow">
        {pct}%
      </span>
    </div>
  );
}

function standingRankCellClass(rank: number): string {
  if (rank <= 2) return "ef-standings-rank-up";
  if (rank >= 7) return "ef-standings-rank-down";
  if (rank <= 6) return "ef-standings-rank-mid";
  return "";
}

function kitStyleForClub(
  club: { slug: string; primaryColor: string; secondaryColor: string } | undefined
) {
  return club ? clubKitBlockStyle(club) : undefined;
}

function findClubForMatchResult(
  clubs: GameState["clubs"],
  clubId: number | undefined,
  name: string
) {
  if (clubId != null) {
    return clubs.find((c) => c.id === clubId);
  }
  return clubs.find((c) => c.name === name);
}

export default function GamePage({ saveId }: { saveId: string }) {
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<
    | "panel"
    | "finances"
    | "results"
    | "table"
    | "scorers"
    | "transfers"
    | "coach"
    | "settings"
  >("panel");
  const [busy, setBusy] = useState(false);
  const [liveRound, setLiveRound] = useState(false);
  const [cupLive, setCupLive] = useState(false);
  const [localLineup, setLocalLineup] = useState<number[]>([]);
  const [localBench, setLocalBench] = useState<number[]>([]);
  const [viewClubId, setViewClubId] = useState<number | null>(null);
  const [buyBusy, setBuyBusy] = useState(false);
  const [raiseBusy, setRaiseBusy] = useState(false);
  const [sellBusy, setSellBusy] = useState(false);
  const [auctionActive, setAuctionActive] = useState(false);
  const [marketPosition, setMarketPosition] = useState<Position | "ALL">("ALL");
  const [marketMinSkill, setMarketMinSkill] = useState(1);
  const [marketMaxSkill, setMarketMaxSkill] = useState(50);
  const [marketMaxValue, setMarketMaxValue] = useState(10_000_000);
  const [marketDetailPlayerId, setMarketDetailPlayerId] = useState<number | null>(
    null
  );
  const [raiseModalPlayerId, setRaiseModalPlayerId] = useState<number | null>(null);
  const [saleNotice, setSaleNotice] = useState<PlayerSaleNotice | null>(null);
  const shownSaleIdRef = useRef<number | null>(null);
  const actionQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [matchSpeed, setMatchSpeed] = useState<MatchSpeed>(DEFAULT_MATCH_SPEED);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await actionLoadGame(saveId);
    setState(data);
    if (data) {
      setLocalLineup(data.lineupPlayerIds);
      setLocalBench(data.benchPlayerIds);
    }
    setLoading(false);
  }, [saveId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setMatchSpeed(loadMatchSpeed());
  }, []);

  useEffect(() => {
    if (state) {
      setLocalLineup(state.lineupPlayerIds);
      setLocalBench(state.benchPlayerIds);
    }
  }, [state?.lineupPlayerIds, state?.benchPlayerIds]);

  useEffect(() => {
    if (
      state?.auctionSession &&
      !state.auctionSession.complete &&
      state.phase === "regular"
    ) {
      setAuctionActive(true);
      return;
    }
    if (!state?.auctionSession || state.auctionSession.complete) {
      setAuctionActive(false);
    }
  }, [state?.auctionSession, state?.phase]);

  useEffect(() => {
    const sale = state?.lastPlayerSale;
    if (!sale || shownSaleIdRef.current === sale.id) return;
    shownSaleIdRef.current = sale.id;
    setSaleNotice(sale);
    const timer = setTimeout(() => {
      setSaleNotice(null);
      setState((prev) =>
        prev && prev.lastPlayerSale?.id === sale.id
          ? { ...prev, lastPlayerSale: null }
          : prev
      );
    }, 2000);
    return () => clearTimeout(timer);
  }, [state?.lastPlayerSale]);

  useEffect(() => {
    if (!state) return;

    document.body.style.background = "";
    document.body.style.color = "";

    return () => {
      document.body.style.background = "";
      document.body.style.color = "";
    };
  }, [state?.id]);

  function runAction(fn: () => Promise<GameState>) {
    actionQueueRef.current = actionQueueRef.current.then(async () => {
      setBusy(true);
      try {
        const updated = await fn();
        setState(updated);
      } finally {
        setBusy(false);
      }
    });
    return actionQueueRef.current;
  }

  const coachClubId = state?.coach.currentClubId ?? null;
  const coachOfferCount = state?.coach.offers.length ?? 0;
  const seasonPhase = state?.phase;

  useEffect(() => {
    if (!state) return;
    if (coachClubId !== null) return;
    if (coachOfferCount > 0 || busy) return;
    if (seasonPhase !== "regular") return;

    const timer = window.setTimeout(() => {
      void runAction(() => actionSimulateRound(saveId));
    }, 15000);

    return () => window.clearTimeout(timer);
  }, [state, saveId, coachClubId, coachOfferCount, seasonPhase, busy]);

  useEffect(() => {
    if (!state || liveRound || cupLive) return;
    const pending = state.players.find(
      (p) => p.clubId === state.humanClubId && p.raisePending
    );
    if (!pending) {
      setRaiseModalPlayerId(null);
      return;
    }
    setRaiseModalPlayerId((prev) => prev ?? pending.id);
  }, [state?.players, state?.humanClubId, liveRound, cupLive]);

  async function handleSquadChange(lineupIds: number[], benchIds: number[]) {
    if (!state) return;
    setLocalLineup(lineupIds);
    setLocalBench(benchIds);
    setBusy(true);
    try {
      const updated = await actionSetSquad(state.id, lineupIds, benchIds);
      setState(updated);
    } finally {
      setBusy(false);
    }
  }

  if (loading || !state) {
    return <p className="text-center">Carregando...</p>;
  }

  const humanClub = state.clubs.find((c) => c.id === state.humanClubId)!;
  const coachClub =
    state.coach.currentClubId != null
      ? state.clubs.find((c) => c.id === state.coach.currentClubId) ?? humanClub
      : null;
  const displayClub = coachClub ?? humanClub;
  const humanCoachRecord =
    state.coaches.find((coach) => coach.id === state.coach.coachId) ?? null;
  const activeManager = state.localManagers[state.activeManagerIndex] ?? null;
  const isLastLocalManager =
    !state.isLocalMultiplayer ||
    state.activeManagerIndex >= state.localManagers.length - 1;
  const isDistrital = displayClub.division === DISTRITAL_DIVISION;
  const squad = getPlayersByClub(state.players, state.humanClubId);
  const nextFixture = getNextHumanFixture(state);
  const pendingCupTie = getPendingHumanCupTie(state, state.humanClubId);
  const cupPrepActive =
    hasPendingHumanCupTies(state) && state.phase === "regular";
  const cupTurnPassOnly = cupPrepActive && !pendingCupTie;
  const divStandings = isDistrital
    ? []
    : getDivisionStandings(state, displayClub.division);
  const position = isDistrital
    ? 0
    : divStandings.findIndex((s) => s.clubId === displayClub.id) + 1;

  const opponent = nextFixture
    ? state.clubs.find(
        (c) =>
          c.id ===
          (nextFixture.homeClubId === state.humanClubId
            ? nextFixture.awayClubId
            : nextFixture.homeClubId)
      )
    : null;

  const isHome = nextFixture?.homeClubId === state.humanClubId;
  const nationalDivisions = sortNationalDivisionsForGrid(
    [...new Set(state.clubs.map((c) => c.division))].filter(
      (d) => d <= NATIONAL_DIVISION_COUNT
    )
  );
  const currentTactic =
    localLineup.length > 0 ? deriveTacticLabel(localLineup, squad) : "—";
  const matchedFormation = detectFormationMatch(localLineup, squad);
  const lineupReady = isValidLineup(localLineup, squad);
  const topScorers = getTopScorers(state.players, state.clubs);
  const humanClubIds = new Set(state.localManagers.map((m) => m.clubId));
  const recentCoachNews = state.messages
    .filter(isCoachNewsMessage)
    .slice(-8);
  const playerById = new Map(state.players.map((player) => [player.id, player]));
  const viewClub = viewClubId
    ? state.clubs.find((c) => c.id === viewClubId)
    : null;
  const viewClubSquad = viewClubId
    ? getPlayersByClub(state.players, viewClubId)
    : [];
  const viewClubDefaultSquad =
    viewClub && viewClub.id !== state.humanClubId
      ? buildDefaultSquad(viewClubSquad)
      : null;
  const themeClub = tab === "table" && viewClub ? viewClub : humanClub;
  const pendingRaisePlayer =
    raiseModalPlayerId != null
      ? state.players.find((p) => p.id === raiseModalPlayerId) ?? null
      : null;
  const marketPlayers = state.players
    .filter((p) => !state.localManagers.some((m) => m.clubId === p.clubId))
    .filter((p) => p.clubId > 0 && p.clubId !== state.humanClubId)
    .filter((p) => marketPosition === "ALL" || p.position === marketPosition)
    .filter((p) => p.skill >= marketMinSkill && p.skill <= marketMaxSkill)
    .filter((p) => p.value <= marketMaxValue)
    .filter((p) => !playerBlocksSale(p, state.phase))
    .filter((p) => canSellPlayer(state.players, p.clubId, p.id, state.phase))
    .sort((a, b) => b.skill - a.skill || a.value - b.value)
    .slice(0, 80);
  const marketDetailPlayer =
    marketDetailPlayerId != null
      ? state.players.find((p) => p.id === marketDetailPlayerId) ?? null
      : null;
  const seasonEnded = state.phase === "ended" && state.seasonSummary != null;
  const canStartNextSeason =
    state.coach.currentClubId !== null || state.coach.offers.length === 0;
  const totalCoachMatches = humanCoachRecord
    ? humanCoachRecord.matchesWon +
      humanCoachRecord.matchesDrawn +
      humanCoachRecord.matchesLost
    : 0;
  const coachRanking = getCoachRanking(state).slice(0, 30);
  const bidderClubId =
    (state.auctionSession && state.localManagers.length > 1
      ? state.localManagers[state.auctionSession.actingManagerIndex ?? 0]
          ?.clubId
      : null) ??
    state.auctionBidderClubId ??
    activeManager?.clubId ??
    state.humanClubId;

  async function handlePlayRound(
    startLive: () => void,
    options?: { skipLineup?: boolean }
  ) {
    if (!state) return;
    if (!options?.skipLineup && !lineupReady) return;
    setBusy(true);
    try {
      const manager = state.localManagers[state.activeManagerIndex];
      const lineupIds = options?.skipLineup
        ? (manager?.lineupPlayerIds ?? localLineup)
        : localLineup;
      const benchIds = options?.skipLineup
        ? (manager?.benchPlayerIds ?? localBench)
        : localBench;
      const { state: updated, startRound } = await actionConfirmManagerLineup(
        state.id,
        lineupIds,
        benchIds
      );
      setState(updated);
      setLocalLineup(updated.lineupPlayerIds);
      setLocalBench(updated.benchPlayerIds);
      if (startRound) {
        startLive();
      }
    } finally {
      setBusy(false);
    }
  }

  const coachWinRate =
    totalCoachMatches === 0
      ? 0
      : Math.round(
          ((humanCoachRecord?.matchesWon ?? 0) / totalCoachMatches) * 100
        );

  async function handleBuyPlayer(playerId: number): Promise<boolean> {
    if (!state) return false;
    setBuyBusy(true);
    try {
      const updated = await actionBuyPlayer(state.id, playerId);
      const transferred =
        updated.players.find((p) => p.id === playerId)?.clubId ===
        updated.humanClubId;
      setState(updated);
      return transferred;
    } finally {
      setBuyBusy(false);
    }
  }

  async function handleAcceptRaise(playerId: number): Promise<boolean> {
    if (!state) return false;
    setRaiseBusy(true);
    try {
      const updated = await actionAcceptPlayerRaise(state.id, playerId);
      const player = updated.players.find((p) => p.id === playerId);
      const ok = !!player && !player.raisePending;
      setState(updated);
      return ok;
    } finally {
      setRaiseBusy(false);
    }
  }

  async function handleRejectRaise(playerId: number): Promise<boolean> {
    if (!state) return false;
    setRaiseBusy(true);
    try {
      const updated = await actionRejectPlayerRaise(state.id, playerId);
      const player = updated.players.find((p) => p.id === playerId);
      const ok = !!player && !player.raisePending;
      setState(updated);
      return ok;
    } finally {
      setRaiseBusy(false);
    }
  }

  async function handleRequestLoan(amount: number): Promise<void> {
    if (!state) return;
    setBusy(true);
    try {
      const updated = await actionRequestLoan(state.id, amount);
      setState(updated);
    } finally {
      setBusy(false);
    }
  }

  async function handleRepayLoan(amount: number): Promise<void> {
    if (!state) return;
    setBusy(true);
    try {
      const updated = await actionRepayLoan(state.id, amount);
      setState(updated);
    } finally {
      setBusy(false);
    }
  }

  async function handleExpandStadium(steps: number): Promise<void> {
    if (!state) return;
    setBusy(true);
    try {
      const updated = await actionExpandStadium(state.id, steps);
      setState(updated);
    } finally {
      setBusy(false);
    }
  }

  async function handleListForAuction(
    playerId: number,
    minBid: number
  ): Promise<boolean> {
    if (!state) return false;
    setSellBusy(true);
    try {
      const updated = await actionSellPlayerNow(state.id, playerId, minBid);
      setState(updated);
      return true;
    } finally {
      setSellBusy(false);
    }
  }

  async function handleUpdateAuctionMinBid(
    playerId: number,
    minBid: number
  ): Promise<boolean> {
    if (!state) return false;
    setSellBusy(true);
    try {
      const updated = await actionUpdateAuctionMinBid(state.id, playerId, minBid);
      setState(updated);
      return true;
    } finally {
      setSellBusy(false);
    }
  }

  async function handleCancelAuctionListing(playerId: number): Promise<boolean> {
    if (!state) return false;
    setSellBusy(true);
    try {
      const updated = await actionCancelAuctionListing(state.id, playerId);
      setState(updated);
      return !(updated.auctionQueue ?? []).some((q) => q.playerId === playerId);
    } finally {
      setSellBusy(false);
    }
  }

  const auctionHandlers = {
    onListForAuction: handleListForAuction,
    onUpdateAuctionMinBid: handleUpdateAuctionMinBid,
    onCancelAuctionListing: handleCancelAuctionListing,
    auctionQueue: state.auctionQueue ?? [],
    sellBusy,
  };

  async function handleFormationClick(formation: Formation) {
    if (!state) return;
    setBusy(true);
    try {
      const updated = await actionSetFormation(state.id, formation);
      setState(updated);
      setLocalLineup(updated.lineupPlayerIds);
      setLocalBench(updated.benchPlayerIds);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="ef-game-theme ef-base-theme min-h-screen">
      {saleNotice && (() => {
        const buyerClub =
          saleNotice.buyerClubId != null
            ? state.clubs.find((c) => c.id === saleNotice.buyerClubId)
            : null;
        const soldPlayer = playerById.get(saleNotice.playerId);
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4">
            <div
              className={`ef-game-theme w-full max-w-sm ${!buyerClub ? "ef-base-theme" : ""}`}
              style={buyerClub ? clubPanelThemeStyle(buyerClub) : undefined}
            >
              <div className="ef-panel p-6 text-center">
                <p className="mb-2 text-sm ef-muted-text">
                  {saleNotice.unsold ? "Jogador não vendido" : "Jogador vendido"}
                </p>
                <p className="mb-4 text-xl font-semibold">
                  {soldPlayer ? (
                    <PlayerNameWithStar player={soldPlayer} />
                  ) : (
                    saleNotice.playerName
                  )}
                </p>
                {saleNotice.unsold ? (
                  <p className="text-yellow-400">Sem lances válidos no leilão.</p>
                ) : (
                  <>
                    <p className="ef-muted-text text-sm">Comprado por</p>
                    <p className="ef-accent-text mb-3 text-lg font-medium">
                      {saleNotice.buyerClubName}
                    </p>
                    <p className="text-2xl font-bold text-green-400">
                      +{saleNotice.fee.toLocaleString()}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {auctionActive && state.auctionSession && (
        <AuctionView
          state={state}
          bidderClubId={bidderClubId}
          humanClubIds={state.localManagers.map((m) => m.clubId)}
          onBidderClubChange={(clubId) =>
            setState((prev) =>
              prev
                ? {
                    ...prev,
                    auctionBidderClubId: clubId,
                  }
                : prev
            )
          }
          onComplete={(updated) => {
            setState(updated);
            if (!updated.auctionSession) {
              setAuctionActive(false);
            }
          }}
        />
      )}

      {cupLive && (
        <LiveRoundView
          mode="cup"
          matchSpeed={matchSpeed}
          state={{
            ...state,
            lineupPlayerIds: localLineup,
            benchPlayerIds: localBench,
          }}
          onComplete={(updated) => {
            setState(updated);
            setLocalLineup([]);
            setLocalBench([]);
            setCupLive(false);
            if (
              updated.auctionSession &&
              !updated.auctionSession.complete &&
              updated.phase === "regular"
            ) {
              setAuctionActive(true);
            }
          }}
          onCancel={() => setCupLive(false)}
        />
      )}

      {liveRound && (
        <LiveRoundView
          matchSpeed={matchSpeed}
          state={{
            ...state,
            lineupPlayerIds: localLineup,
            benchPlayerIds: localBench,
          }}
          onComplete={(updated) => {
            setState(updated);
            setLocalLineup([]);
            setLocalBench([]);
            setLiveRound(false);
            if (
              updated.auctionSession &&
              !updated.auctionSession.complete &&
              updated.phase === "regular"
            ) {
              setAuctionActive(true);
            }
          }}
          onCancel={() => setLiveRound(false)}
        />
      )}

      {seasonEnded && (
        <SeasonSummaryPage
          state={state}
          busy={busy}
          canStartSeason={canStartNextSeason}
          onStartNextSeason={() =>
            runAction(() => actionStartNextSeason(state.id))
          }
        />
      )}

      {state.coach.offers.length > 0 &&
        state.phase === "ended" &&
        !state.isLocalMultiplayer && (
        <CoachOfferPage
          state={state}
          busy={busy}
          onAccept={(offerId) =>
            runAction(() => actionAcceptCoachOffer(state.id, offerId))
          }
          onReject={(offerId) =>
            runAction(() => actionRejectCoachOffer(state.id, offerId))
          }
        />
      )}

      {pendingRaisePlayer && pendingRaisePlayer.raisePending && (
        <div className="fixed inset-0 z-[66] flex items-center justify-center bg-black/80 p-4">
          <section className="ef-game-theme ef-panel w-full max-w-md p-5">
            <h2 className="ef-title mb-2">Pedido de aumento</h2>
            <p className="text-sm mb-2">
              <span className="ef-accent-text">
                <PlayerNameWithStar player={pendingRaisePlayer} />
              </span>{" "}
              pediu
              ajuste salarial imediato.
            </p>
            <p className="text-sm ef-muted-text mb-4">
              Atual: {pendingRaisePlayer.salary.toLocaleString()} · Pedido:{" "}
              {pendingRaisePlayer.requestedSalary?.toLocaleString() ?? "—"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="ef-btn ef-btn-active flex-1"
                disabled={raiseBusy}
                onClick={async () => {
                  const ok = await handleAcceptRaise(pendingRaisePlayer.id);
                  if (ok) setRaiseModalPlayerId(null);
                }}
              >
                Aceitar
              </button>
              <button
                type="button"
                className="ef-btn flex-1"
                disabled={raiseBusy}
                onClick={async () => {
                  const ok = await handleRejectRaise(pendingRaisePlayer.id);
                  if (ok) setRaiseModalPlayerId(null);
                }}
              >
                Recusar (leilão)
              </button>
            </div>
          </section>
        </div>
      )}

      <div
        className={`ef-game-theme ef-base-theme -mx-4 px-4 py-2 ${liveRound || cupLive || seasonEnded ? "hidden" : undefined}`}
        style={clubShellThemeStyle(themeClub)}
      >
        <div className="mb-4 flex justify-end">
          <span className="ef-muted-text text-xs">
            {formatCountriesLabel(state.countries ?? [state.country])} · T{state.season} ·{" "}
            {pendingCupTie
              ? getCupRoundLabel(pendingCupTie.leagueRoundGate)
              : `Rodada ${state.round}/${state.totalRounds}`}
          </span>
        </div>

        <header className="ef-panel ef-club-header mb-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="ef-title text-xl">
                {state.coach.currentClubId === null ? "Sem clube" : displayClub.name}
              </h1>
              <p className="ef-muted-text text-sm">
                {state.isLocalMultiplayer
                  ? `Vez de: ${activeManager?.name ?? "Jogador"} · ${formatDivisionLabel(displayClub.division)} divisão${
                      !isDistrital ? ` · ${position}º lugar` : ""
                    }`
                  : `Técnico: ${state.coach.name} · ${
                      state.coach.currentClubId === null
                        ? "aguardando proposta"
                        : `${formatDivisionLabel(displayClub.division)} divisão${
                            !isDistrital ? ` · ${position}º lugar` : ""
                          }`
                    } · Moral: ${Math.round(displayClub.morale)}%`}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 text-right text-sm">
              {state.coach.currentClubId !== null && (
                <>
                  <div className="flex items-center gap-2">
                    <span>Moral</span>
                    <MoraleBar morale={displayClub.morale} />
                  </div>
                  <div>Finanças: {displayClub.finances.toLocaleString()}</div>
                  <div>Estádio: {displayClub.stadiumCapacity.toLocaleString()}</div>
                </>
              )}
            </div>
          </div>
        </header>

        {state.coach.currentClubId === null &&
          state.coach.offers.length === 0 &&
          state.phase === "regular" && (
            <section className="ef-panel mb-4 border-yellow-700 p-4">
              <h2 className="ef-title mb-2">Aguardando proposta</h2>
              <p className="text-sm ef-muted-text">
                As rodadas avançam automaticamente a cada 15 segundos. Você
                receberá proposta de clubes da 3ª ou 4ª divisão quando algum
                demitir o técnico durante a temporada ou se for demitido no
                fechamento com moral crítica.
              </p>
              <p className="mt-2 text-sm">
                {busy ? "Avançando rodada..." : `Próxima rodada: ${state.round}`}
              </p>
              <button
                type="button"
                className="ef-btn mt-3"
                disabled={busy}
                onClick={() => runAction(() => actionSimulateRound(state.id))}
              >
                Avançar rodada agora
              </button>
            </section>
          )}

        <nav className="mb-4 flex flex-wrap gap-2">
          {(
            [
              ["panel", "Painel"],
              ["finances", "Finanças"],
              ["results", "Resultados"],
              ["table", "Classificação"],
              ["scorers", "Artilharia"],
              ["coach", "Treinador"],
              ["transfers", "Mercado"],
              ["settings", "Configurações"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`ef-btn ${
                tab === id
                  ? "ef-btn-active"
                  : ""
              }`}
              onClick={() => {
                if (id !== "table") {
                  setViewClubId(null);
                } else if (tab === "table") {
                  setViewClubId(null);
                }
                setTab(id);
              }}
            >
              {label}
            </button>
          ))}
          <Link href="/" className="ef-btn">
            Voltar ao Menu
          </Link>
        </nav>

        {tab === "panel" && state.coach.currentClubId === null && (
          <div className="space-y-4">
            <section className="ef-panel p-4">
              <h2 className="ef-title mb-2">Sem clube</h2>
              <p className="text-sm ef-muted-text">
                Aguarde proposta de um clube da 3ª ou 4ª divisão. Enquanto isso,
                acompanhe classificação e resultados na aba Treinador.
              </p>
            </section>
          </div>
        )}

        {tab === "panel" && state.coach.currentClubId !== null && (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <section className="ef-panel p-4 lg:col-span-2">
                <h2 className="ef-title mb-3">Formação</h2>
                <p className="ef-muted-text mb-3 text-sm">
                  Tática em campo:{" "}
                  <span className="ef-accent-text">{currentTactic}</span>
                </p>
                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`ef-btn text-sm ${
                      state.humanFormation === "Melhores" ? "ef-btn-active" : ""
                    }`}
                    disabled={busy || state.phase !== "regular"}
                    onClick={() => void handleFormationClick("Melhores")}
                  >
                    Melhores
                  </button>
                  {FORMATION_PRESETS.map((f) => {
                    const active = matchedFormation === f;
                    return (
                      <button
                        key={f}
                        type="button"
                        className={`ef-btn text-sm ${
                          active ? "ef-btn-active" : ""
                        }`}
                        disabled={busy || state.phase !== "regular"}
                        onClick={() => handleFormationClick(f)}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="ef-panel flex flex-col p-4 lg:col-span-1">
                <h2 className="ef-title mb-3">Próximo Jogo</h2>
                {cupPrepActive ? (
                  <div className="flex flex-1 flex-col justify-between gap-4">
                    <div className="text-sm">
                      {pendingCupTie ? (
                        <>
                          <p className="mb-1 ef-muted-text">
                            {getCupRoundLabel(pendingCupTie.leagueRoundGate)}
                          </p>
                          <p className="font-medium">
                            {state.clubs.find((c) => c.id === pendingCupTie.homeClubId)?.name}{" "}
                            x{" "}
                            {state.clubs.find((c) => c.id === pendingCupTie.awayClubId)?.name}
                          </p>
                        </>
                      ) : (
                        <p className="ef-muted-text">
                          Você não está mais na copa nesta fase — passe o turno
                          para continuar.
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="ef-btn w-full"
                      disabled={busy || (!cupTurnPassOnly && !lineupReady)}
                      onClick={() =>
                        void handlePlayRound(() => setCupLive(true), {
                          skipLineup: cupTurnPassOnly,
                        })
                      }
                    >
                      {cupTurnPassOnly
                        ? isLastLocalManager
                          ? "Jogar Copa"
                          : "Passar turno"
                        : isLastLocalManager
                          ? "Jogar Copa"
                          : "Confirmar e passar turno"}
                    </button>
                  </div>
                ) : nextFixture && opponent && state.phase === "regular" ? (
                  <div className="flex flex-1 flex-col justify-between gap-4">
                    <div className="text-sm">
                      <p className="mb-1 ef-muted-text">
                        Rodada {state.round} — Campeonato
                      </p>
                      <p className="font-medium">
                        {isHome
                          ? `${humanClub.name} x ${opponent.name}`
                          : `${opponent.name} x ${humanClub.name}`}
                      </p>
                      <p className="mt-1 text-xs ef-muted-text">
                        {isHome ? "Casa" : "Fora"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ef-btn w-full"
                      disabled={busy || !lineupReady}
                      title={
                        !lineupReady
                          ? "Escalone 11 titulares antes de jogar"
                          : undefined
                      }
                      onClick={() => void handlePlayRound(() => setLiveRound(true))}
                    >
                      {isLastLocalManager ? "Jogar Rodada" : "Confirmar e passar turno"}
                    </button>
                  </div>
                ) : isDistrital && state.phase === "regular" ? (
                  <div className="flex flex-1 flex-col justify-between gap-4">
                    <p className="text-sm ef-muted-text">
                      Sem campeonato distrital. Acompanhe as divisões nacionais e
                      avance a temporada rodada a rodada.
                    </p>
                    <button
                      type="button"
                      className="ef-btn w-full"
                      disabled={busy || !isLastLocalManager}
                      onClick={() =>
                        runAction(() => actionSimulateRound(state.id))
                      }
                    >
                      Simular rodada
                    </button>
                  </div>
                ) : (
                  <p className="text-sm ef-muted-text">
                    {state.phase === "ended"
                      ? "Temporada encerrada."
                      : "Aguardando jogos."}
                  </p>
                )}
              </section>
            </div>

            <section className="ef-panel p-4">
              <h2 className="ef-title mb-3">Elenco</h2>
              <SquadLineupTable
                squad={squad}
                lineupIds={localLineup}
                benchIds={localBench}
                clubs={state.clubs}
                humanClubId={state.humanClubId}
                humanClubIds={state.localManagers.map((m) => m.clubId)}
                humanFinances={humanClub.finances}
                seasonPhase={state.phase}
                onChange={handleSquadChange}
                onBuyPlayer={handleBuyPlayer}
                onAcceptRaise={handleAcceptRaise}
                onRejectRaise={handleRejectRaise}
                buyBusy={buyBusy}
                raiseBusy={raiseBusy}
                {...auctionHandlers}
              />
            </section>
          </div>
        )}

        {tab === "finances" && state.coach.currentClubId !== null && (
          <FinancesPanel
            state={state}
            humanClub={humanClub}
            disabled={busy}
            onRequestLoan={handleRequestLoan}
            onRepayLoan={handleRepayLoan}
            onExpandStadium={handleExpandStadium}
          />
        )}

        {tab === "results" && (
          <div className="ef-base-theme">
            <section className="ef-panel p-4">
              <h2 className="ef-title mb-3">
                Resultados da rodada
                {state.lastRoundResults
                  ? ` ${state.lastRoundResults.round} (${state.lastRoundResults.division}ª divisão)`
                  : ""}
              </h2>
              {!state.lastRoundResults ||
              state.lastRoundResults.matches.length === 0 ? (
                <p className="text-sm ef-muted-text">
                  Nenhuma rodada jogada ainda. Use &quot;Jogar Rodada&quot; no
                  painel.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {state.lastRoundResults.matches.map((m, i) => {
                    const homeClub = findClubForMatchResult(
                      state.clubs,
                      m.homeClubId,
                      m.homeName
                    );
                    const awayClub = findClubForMatchResult(
                      state.clubs,
                      m.awayClubId,
                      m.awayName
                    );
                    const isPlayerHome =
                      m.homeClubId != null
                        ? humanClubIds.has(m.homeClubId)
                        : m.isHumanMatch && m.homeName === humanClub.name;
                    const isPlayerAway =
                      m.awayClubId != null
                        ? humanClubIds.has(m.awayClubId)
                        : m.isHumanMatch && m.awayName === humanClub.name;

                    return (
                      <li
                        key={i}
                        className="flex items-stretch overflow-hidden border border-[var(--ef-border)]"
                      >
                        <div
                          className="flex flex-1 items-center px-2 py-2"
                          style={kitStyleForClub(homeClub)}
                        >
                          {m.homeName}
                          {isPlayerHome ? " ★" : ""}
                        </div>
                        <div className="flex items-center bg-[color-mix(in_srgb,var(--ef-panel-bg)_88%,transparent)] px-3 py-2 font-bold">
                          <span className="ef-accent-text">
                            {m.homeGoals} x {m.awayGoals}
                          </span>
                        </div>
                        <div
                          className="flex flex-1 items-center justify-end px-2 py-2"
                          style={kitStyleForClub(awayClub)}
                        >
                          {isPlayerAway ? "★ " : ""}
                          {m.awayName}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}

        {tab === "table" && viewClub && (
          <section
            className="ef-game-theme ef-panel ef-club-header p-4"
            style={clubPanelThemeStyle(viewClub)}
          >
            <button
              type="button"
              className="ef-btn mb-4 text-sm"
              onClick={() => setViewClubId(null)}
            >
              ← Voltar à classificação
            </button>
            <h2 className="ef-title mb-1 text-xl">{viewClub.name}</h2>
            <p className="ef-muted-text mb-4 text-sm">
              {formatDivisionLabel(viewClub.division)} divisão · Técnico:{" "}
              {viewClub.coachName} · Finanças:{" "}
              {viewClub.finances.toLocaleString()}
            </p>
            <div className="mb-4 flex items-center gap-2 text-sm">
              <span>Moral</span>
              <MoraleBar morale={viewClub.morale} />
            </div>
            <SquadLineupTable
              squad={viewClubSquad}
              lineupIds={
                viewClub.id === state.humanClubId
                  ? localLineup
                  : viewClubDefaultSquad?.lineupIds ?? []
              }
              benchIds={
                viewClub.id === state.humanClubId
                  ? localBench
                  : viewClubDefaultSquad?.benchIds ?? []
              }
              clubs={state.clubs}
              humanClubId={state.humanClubId}
              humanClubIds={state.localManagers.map((m) => m.clubId)}
              humanFinances={humanClub.finances}
              seasonPhase={state.phase}
              readOnly={viewClub.id !== state.humanClubId}
              onChange={
                viewClub.id === state.humanClubId
                  ? handleSquadChange
                  : undefined
              }
              onBuyPlayer={handleBuyPlayer}
              onAcceptRaise={handleAcceptRaise}
              onRejectRaise={handleRejectRaise}
              buyBusy={buyBusy}
              raiseBusy={raiseBusy}
              {...(viewClub.id === state.humanClubId ? auctionHandlers : {})}
            />
          </section>
        )}

        {tab === "table" && !viewClub && (
          <div className="ef-base-theme grid gap-4 md:grid-cols-2">
            {nationalDivisions.map((div) => {
              const standings = getDivisionStandings(state, div);
              return (
                <section key={div} className="ef-panel overflow-x-auto p-4">
                  <h2 className="ef-title mb-3">
                    {formatDivisionLabel(div)} Divisão
                    {div === humanClub.division && " ★"}
                  </h2>
                  <table className="ef-table w-full text-sm">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Clube</th>
                        <th>P</th>
                        <th>J</th>
                        <th>V</th>
                        <th>E</th>
                        <th>D</th>
                        <th>SG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((s, i) => {
                        const club = state.clubs.find((c) => c.id === s.clubId)!;
                        const rank = i + 1;
                        const kitStyle = clubKitBlockStyle(club);
                        const isPlayerClub = humanClubIds.has(s.clubId);
                        return (
                          <tr key={s.clubId}>
                            <td className={standingRankCellClass(rank)}>{rank}</td>
                            <td style={kitStyle}>
                              <button
                                type="button"
                                className="w-full cursor-pointer border-0 bg-transparent p-0 text-left hover:opacity-85"
                                style={{ color: "inherit" }}
                                onClick={() => setViewClubId(s.clubId)}
                              >
                                {club.name}
                                {isPlayerClub ? " ★" : ""}
                              </button>
                            </td>
                            <td style={kitStyle}>{s.points}</td>
                            <td style={kitStyle}>{s.played}</td>
                            <td style={kitStyle}>{s.won}</td>
                            <td style={kitStyle}>{s.drawn}</td>
                            <td style={kitStyle}>{s.lost}</td>
                            <td style={kitStyle}>
                              {s.goalsFor - s.goalsAgainst}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              );
            })}
          </div>
        )}

        {tab === "scorers" && (
          <div className="ef-base-theme">
            <section className="ef-panel overflow-x-auto p-4">
              <h2 className="ef-title mb-3">
                Artilharia — Temporada {state.season}
              </h2>
              {topScorers.length === 0 ? (
                <p className="text-sm ef-muted-text">
                  Nenhum gol marcado ainda nesta temporada.
                </p>
              ) : (
                <table className="ef-table w-full text-sm">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Jogador</th>
                      <th>Clube</th>
                      <th>Div</th>
                      <th>Pos</th>
                      <th>Gols</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topScorers.map((s, i) => {
                      const player = playerById.get(s.playerId);
                      const club = player
                        ? state.clubs.find((c) => c.id === player.clubId)
                        : undefined;
                      const kitStyle = kitStyleForClub(club);
                      const isPlayerClub =
                        club != null && humanClubIds.has(club.id);
                      return (
                        <tr key={s.playerId}>
                          <td style={kitStyle}>{i + 1}</td>
                          <td style={kitStyle}>
                            {player ? (
                              <PlayerNameWithStar player={player} />
                            ) : (
                              s.name
                            )}
                          </td>
                          <td style={kitStyle}>
                            {s.clubName}
                            {isPlayerClub ? " ★" : ""}
                          </td>
                          <td style={kitStyle}>
                            {s.division === DISTRITAL_DIVISION
                              ? "Dist."
                              : `${s.division}ª`}
                          </td>
                          <td style={kitStyle}>{s.position}</td>
                          <td style={kitStyle} className="font-medium">
                            {s.goals}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        )}

        {tab === "coach" && (
          <div className="ef-base-theme space-y-4">
          <section className="ef-panel p-4">
            <h2 className="ef-title mb-3">Treinador</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="border border-[var(--ef-border)] p-3">
                <p className="ef-muted-text text-xs">Nome</p>
                <p className="mt-1 text-sm font-medium">{state.coach.name}</p>
              </div>
              <div className="border border-[var(--ef-border)] p-3">
                <p className="ef-muted-text text-xs">Clube atual</p>
                <p className="mt-1 text-sm font-medium">
                  {coachClub
                    ? `${coachClub.name} (${formatDivisionLabel(coachClub.division)})`
                    : "Sem clube · aguardando proposta"}
                </p>
              </div>
              <div className="border border-[var(--ef-border)] p-3">
                <p className="ef-muted-text text-xs">Moral (momento)</p>
                <div className="mt-2">
                  {coachClub ? (
                    <MoraleBar morale={coachClub.morale} />
                  ) : (
                    <p className="text-sm font-medium">—</p>
                  )}
                </div>
              </div>
              <div className="border border-[var(--ef-border)] p-3">
                <p className="ef-muted-text text-xs">Títulos</p>
                <p className="mt-1 text-sm font-medium">
                  {humanCoachRecord?.titles ?? 0}
                </p>
              </div>
              <div className="border border-[var(--ef-border)] p-3">
                <p className="ef-muted-text text-xs">Vitórias</p>
                <p className="mt-1 text-sm font-medium">
                  {humanCoachRecord?.matchesWon ?? 0}
                </p>
              </div>
              <div className="border border-[var(--ef-border)] p-3">
                <p className="ef-muted-text text-xs">Empates</p>
                <p className="mt-1 text-sm font-medium">
                  {humanCoachRecord?.matchesDrawn ?? 0}
                </p>
              </div>
              <div className="border border-[var(--ef-border)] p-3">
                <p className="ef-muted-text text-xs">Derrotas</p>
                <p className="mt-1 text-sm font-medium">
                  {humanCoachRecord?.matchesLost ?? 0}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm ef-muted-text">
              O momento do técnico acompanha a moral do clube. Jogos no comando:{" "}
              {totalCoachMatches} · Aproveitamento: {coachWinRate}%
            </p>
            {recentCoachNews.length > 0 && (
              <div className="mt-6">
                <h3 className="ef-title mb-3 text-base">Mercado de técnicos</h3>
                <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
                  {recentCoachNews.map((message, index) => (
                    <li
                      key={`${index}-${message}`}
                      className="border-b border-[var(--ef-border)]/50 pb-2 ef-muted-text last:border-b-0 last:pb-0"
                    >
                      {message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <h3 className="ef-title mt-6 mb-2 text-base">Ranking histórico de técnicos</h3>
            <p className="mb-3 text-xs ef-muted-text">
              Ordem: títulos, vitórias, empates e moral apenas como desempate. Propostas
              de clubes usam a moral como fator principal.
            </p>
            <div className="overflow-x-auto">
              <table className="ef-table w-full text-sm">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Técnico</th>
                    <th>Clube</th>
                    <th>Div</th>
                    <th>Títulos</th>
                    <th>V</th>
                    <th>E</th>
                    <th>D</th>
                    <th>Moral</th>
                  </tr>
                </thead>
                <tbody>
                  {coachRanking.map((entry, idx) => {
                    const club =
                      entry.clubId != null
                        ? state.clubs.find((c) => c.id === entry.clubId)
                        : undefined;
                    const kitStyle = kitStyleForClub(club);
                    const isPlayerCoach = entry.coachId === state.coach.coachId;
                    return (
                    <tr key={entry.coachId}>
                      <td style={kitStyle}>{idx + 1}</td>
                      <td style={kitStyle}>
                        {entry.name}
                        {isPlayerCoach ? " ★" : ""}
                      </td>
                      <td style={kitStyle}>{entry.clubName}</td>
                      <td style={kitStyle}>
                        {entry.division == null
                          ? "—"
                          : entry.division === DISTRITAL_DIVISION
                            ? "Dist."
                            : `${entry.division}ª`}
                      </td>
                      <td style={kitStyle} className="font-semibold">
                        {entry.titles}
                      </td>
                      <td style={kitStyle}>{entry.matchesWon}</td>
                      <td style={kitStyle}>{entry.matchesDrawn}</td>
                      <td style={kitStyle}>{entry.matchesLost}</td>
                      <td style={kitStyle}>
                        {entry.morale > 0 ? `${Math.round(entry.morale)}%` : "—"}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          </div>
        )}

        {tab === "transfers" && (
          <div className="ef-base-theme space-y-4">
            <section className="ef-panel p-4">
              <h2 className="ef-title mb-2">Mercado</h2>
              <p className="mb-3 text-sm ef-muted-text">
                Pesquise jogadores disponíveis para compra por posição, força e valor.
              </p>
              <div className="mb-3 grid gap-2 md:grid-cols-4 text-sm">
                <label className="flex flex-col gap-1">
                  <span className="ef-muted-text text-xs">Posição</span>
                  <select
                    className="border border-[var(--ef-border)] bg-[var(--ef-panel-bg)] p-2"
                    value={marketPosition}
                    onChange={(e) =>
                      setMarketPosition(e.target.value as Position | "ALL")
                    }
                  >
                    <option value="ALL">Todas</option>
                    <option value="GK">GK</option>
                    <option value="DF">DF</option>
                    <option value="MF">MF</option>
                    <option value="FW">FW</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="ef-muted-text text-xs">Força mínima</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    className="border border-[var(--ef-border)] bg-[var(--ef-panel-bg)] p-2"
                    value={marketMinSkill}
                    onChange={(e) => setMarketMinSkill(Number(e.target.value))}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="ef-muted-text text-xs">Força máxima</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    className="border border-[var(--ef-border)] bg-[var(--ef-panel-bg)] p-2"
                    value={marketMaxSkill}
                    onChange={(e) => setMarketMaxSkill(Number(e.target.value))}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="ef-muted-text text-xs">Valor máximo</span>
                  <input
                    type="number"
                    min={1}
                    className="border border-[var(--ef-border)] bg-[var(--ef-panel-bg)] p-2"
                    value={marketMaxValue}
                    onChange={(e) => setMarketMaxValue(Number(e.target.value))}
                  />
                </label>
              </div>
              {marketPlayers.length === 0 ? (
                <p className="text-sm ef-muted-text">
                  Nenhum jogador encontrado com os filtros atuais.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="ef-table w-full text-sm">
                    <thead>
                      <tr>
                        <th>Jogador</th>
                        <th>Clube</th>
                        <th>Pos</th>
                        <th>Força</th>
                        <th>Característica</th>
                        <th>Valor</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketPlayers.map((p) => {
                        const club = state.clubs.find((c) => c.id === p.clubId);
                        const kitStyle = kitStyleForClub(club);
                        const buyPrice = getPlayerBuyPrice(p);
                        const isPlayerClub =
                          club != null && humanClubIds.has(club.id);
                        return (
                          <tr key={p.id}>
                            <td style={kitStyle}>
                              <button
                                type="button"
                                className="cursor-pointer border-0 bg-transparent p-0 text-left hover:opacity-85"
                                style={{ color: "inherit" }}
                                onClick={() => setMarketDetailPlayerId(p.id)}
                              >
                                <PlayerNameWithStar player={p} />
                              </button>
                            </td>
                            <td style={kitStyle}>
                              {club?.name ?? "?"}
                              {isPlayerClub ? " ★" : ""}
                            </td>
                            <td style={kitStyle}>{p.position}</td>
                            <td style={kitStyle}>{p.skill}</td>
                            <td style={kitStyle}>
                              {AGGRESSIVENESS_LABELS[p.aggressiveness]}
                            </td>
                            <td style={kitStyle}>{buyPrice.toLocaleString()}</td>
                            <td style={kitStyle}>
                              <button
                                type="button"
                                className="cursor-pointer rounded border border-current/30 bg-black/10 px-2 py-1 text-xs hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
                                style={{ color: "inherit" }}
                                disabled={buyBusy || humanClub.finances < buyPrice}
                                onClick={() => void handleBuyPlayer(p.id)}
                              >
                                Comprar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="ef-panel p-4">
              <h2 className="ef-title mb-2">Leilão</h2>
              <p className="mb-3 text-sm ef-muted-text">
                A cada 2 rodadas abre um leilão com 8–15 jogadores da CPU.
                Venda imediata pelo perfil do jogador. Compras e vendas da CPU
                seguem finanças e bilheteria.
              </p>
              {state.auctionSession && !state.auctionSession.complete ? (
                <button
                  type="button"
                  className="ef-btn"
                  onClick={() => setAuctionActive(true)}
                >
                  Continuar leilão ({state.auctionSession.results.length}/
                  {state.auctionSession.lots.length})
                </button>
              ) : (
                <p className="text-sm ef-muted-text">
                  Próximo leilão na rodada par (2, 4, 6…).
                </p>
              )}
            </section>

            {marketDetailPlayer && (
              <PlayerDetailModal
                player={marketDetailPlayer}
                clubs={state.clubs}
                humanClubId={state.humanClubId}
                humanFinances={humanClub.finances}
                buyPrice={getPlayerBuyPrice(marketDetailPlayer)}
                seasonPhase={state.phase}
                buyBusy={buyBusy}
                onClose={() => setMarketDetailPlayerId(null)}
                onBuy={async () => {
                  const transferred = await handleBuyPlayer(marketDetailPlayer.id);
                  if (transferred) {
                    setMarketDetailPlayerId(null);
                  }
                  return transferred;
                }}
              />
            )}
          </div>
        )}

        {tab === "settings" && (
          <div className="ef-base-theme">
          <section className="ef-panel p-4">
            <h2 className="ef-title mb-2">Configurações</h2>
            <p className="mb-4 text-sm ef-muted-text">
              Ajustes gerais do jogo. A velocidade vale para liga e copa ao
              clicar em jogar.
            </p>
            <label className="flex max-w-md flex-col gap-2 text-sm">
              <span className="ef-muted-text text-xs">Velocidade da partida</span>
              <select
                className="border border-[var(--ef-border)] bg-[var(--ef-panel-bg)] p-2"
                value={matchSpeed}
                onChange={(e) => {
                  const next = Number(e.target.value) as MatchSpeed;
                  setMatchSpeed(next);
                  saveMatchSpeed(next);
                }}
              >
                {MATCH_SPEED_OPTIONS.map((o) => (
                  <option key={o.seconds} value={o.seconds}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="text-xs ef-muted-text">
                Padrão: Normal (30s) — tempo para o relógio ir de 0&apos; a
                90&apos; em cada tempo.
              </span>
            </label>
            <div className="mt-6 border-t border-[var(--ef-border)] pt-4">
              <p className="mb-3 text-sm ef-muted-text">
                Encerra o aplicativo desktop.
              </p>
              <QuitGameButton />
            </div>
          </section>
          </div>
        )}
      </div>
    </main>
  );
}
