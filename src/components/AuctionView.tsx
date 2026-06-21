"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuctionLotResult, GameState, Player } from "@/engine/types";
import {
  actionCompleteAuctionSession,
  actionResolveAuctionLot,
  actionSkipRemainingAuctionLots,
} from "@/app/actions";
import { clubPanelThemeStyle } from "@/lib/club-theme";
import PlayerNameWithStar from "@/components/PlayerNameWithStar";

const RESULT_MS = 2000;

function formatAuctionPlayerLabel(
  playerId: number,
  playerName: string,
  playerById: Map<number, Player>
) {
  const player = playerById.get(playerId);
  if (!player) return playerName;
  return (
    <>
      {player.position} - <PlayerNameWithStar player={player} />
    </>
  );
}

interface AuctionViewProps {
  state: GameState;
  bidderClubId: number;
  humanClubIds: number[];
  onBidderClubChange: (clubId: number) => void;
  onComplete: (updated: GameState) => void;
}

export default function AuctionView({
  state,
  bidderClubId,
  humanClubIds,
  onBidderClubChange,
  onComplete,
}: AuctionViewProps) {
  const playerById = new Map(state.players.map((player) => [player.id, player]));
  const session = state.auctionSession!;
  const isLocalAuction = state.localManagers.length > 1;
  const actingManager = isLocalAuction
    ? state.localManagers[session.actingManagerIndex]
    : null;
  const bidderClub =
    state.clubs.find((c) => c.id === bidderClubId) ??
    state.clubs.find((c) => c.id === state.humanClubId)!;
  const lotIndex = session.results.length;
  const currentLot =
    lotIndex < session.lots.length ? session.lots[lotIndex] : null;

  const [showingResult, setShowingResult] = useState(false);
  const [lastResult, setLastResult] = useState<AuctionLotResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [bidAmount, setBidAmount] = useState(currentLot?.minBid ?? 0);

  useEffect(() => {
    if (currentLot) {
      setBidAmount(currentLot.minBid);
    }
  }, [currentLot?.id, currentLot?.minBid]);

  const finishSession = useCallback(async () => {
    setBusy(true);
    try {
      const updated = await actionCompleteAuctionSession(state.id);
      onComplete(updated);
    } finally {
      setBusy(false);
    }
  }, [state, onComplete]);

  const resolveLot = useCallback(
    async (bid: number | null) => {
      if (busy || !currentLot) return;
      setBusy(true);
      try {
        const updated = await actionResolveAuctionLot(
          state.id,
          lotIndex,
          bid,
          bidderClub.id
        );
        const sameLot =
          updated.auctionSession != null &&
          updated.auctionSession.results.length === lotIndex;

        if (sameLot) {
          onComplete(updated);
          return;
        }

        const result = updated.auctionSession?.results[lotIndex] ?? null;
        setLastResult(result);
        setShowingResult(true);

        setTimeout(() => {
          setShowingResult(false);
          setLastResult(null);
          if (updated.auctionSession?.complete) {
            void finishSession();
          } else {
            onComplete(updated);
          }
        }, RESULT_MS);
      } finally {
        setBusy(false);
      }
    },
    [busy, currentLot, state, lotIndex, onComplete, bidderClub.id, finishSession]
  );

  const skipAll = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await actionSkipRemainingAuctionLots(state.id);
      await finishSession();
    } finally {
      setBusy(false);
    }
  }, [busy, state.id, finishSession]);

  const isOwnSale = currentLot?.sellerClubId === bidderClub.id;
  const alreadyOwn =
    currentLot != null &&
    state.players.find((p) => p.id === currentLot.playerId)?.clubId ===
      bidderClub.id &&
    !isOwnSale;

  useEffect(() => {
    if (
      isLocalAuction ||
      showingResult ||
      !currentLot ||
      !isOwnSale ||
      busy ||
      session.results.length !== lotIndex
    ) {
      return;
    }
    void resolveLot(null);
  }, [
    isLocalAuction,
    showingResult,
    currentLot,
    isOwnSale,
    busy,
    lotIndex,
    session.results.length,
    resolveLot,
  ]);

  if (!currentLot && !showingResult) {
    return null;
  }

  if (showingResult && lastResult) {
    const buyerClub =
      lastResult.winnerClubId != null
        ? state.clubs.find((c) => c.id === lastResult.winnerClubId)
        : null;

    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4">
        <div
          className={`ef-game-theme w-full max-w-md ${!buyerClub ? "ef-base-theme" : ""}`}
          style={buyerClub ? clubPanelThemeStyle(buyerClub) : undefined}
        >
          <div className="ef-panel p-4 py-6 text-center">
            <p className="mb-2 text-sm ef-muted-text">Resultado</p>
            <p className="mb-1 text-lg font-medium">
              {formatAuctionPlayerLabel(
                lastResult.playerId,
                lastResult.playerName,
                playerById
              )}
            </p>
            {lastResult.unsold ? (
              <p className="text-yellow-400">Sem lances válidos</p>
            ) : (
              <p>
                <span className="ef-accent-text">{lastResult.winnerClubName}</span>
                {" · "}
                {lastResult.winningBid.toLocaleString()}
              </p>
            )}
            <p className="mt-4 text-xs ef-muted-text">
              Próximo jogador em instantes...
            </p>
          </div>
        </div>
      </div>
    );
  }

  const maxBid = bidderClub.finances;
  const canBid =
    !isOwnSale &&
    !alreadyOwn &&
    maxBid >= (currentLot?.minBid ?? 0) &&
    !showingResult;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4">
      <div className="ef-panel w-full max-w-md p-4">
        <div className="mb-3 flex items-center justify-between text-xs ef-muted-text">
          <span>
            Leilão · Rodada {session.round} · {lotIndex + 1}/
            {session.lots.length}
          </span>
          <span>Caixa: {bidderClub.finances.toLocaleString()}</span>
        </div>

        {isLocalAuction && actingManager && (
          <p className="mb-2 text-sm ef-accent-text">
            Vez de {actingManager.name} ({bidderClub.name})
            {session.pendingHumanBids.length > 0 && (
              <span className="ef-muted-text">
                {" "}
                · {session.pendingHumanBids.length}/
                {state.localManagers.length} responderam
              </span>
            )}
          </p>
        )}

        {currentLot ? (
          <>
            <h2 className="ef-title mb-1 text-lg">
              {currentLot.position} -{" "}
              {playerById.get(currentLot.playerId) ? (
                <PlayerNameWithStar player={playerById.get(currentLot.playerId)!} />
              ) : (
                currentLot.playerName
              )}
            </h2>
            <p className="mb-4 text-sm ef-muted-text">
              Força {currentLot.skill} · Vendedor: {currentLot.sellerClubName}
            </p>

            <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
              <dt className="ef-muted-text">Valor de mercado</dt>
              <dd>{currentLot.marketValue.toLocaleString()}</dd>
              <dt className="ef-muted-text">Lance mínimo</dt>
              <dd className="ef-accent-text">
                {currentLot.minBid.toLocaleString()}
              </dd>
            </dl>

            {isOwnSale ? (
              <>
                <p className="text-center text-sm text-yellow-400">
                  Seu jogador à venda — aguardando lances...
                </p>
                {isLocalAuction && (
                  <button
                    type="button"
                    className="ef-btn mt-3 w-full"
                    disabled={busy}
                    onClick={() => resolveLot(null)}
                  >
                    Passar
                  </button>
                )}
              </>
            ) : alreadyOwn ? (
              <p className="text-center text-sm ef-muted-text">
                Jogador já está no elenco deste clube.
              </p>
            ) : maxBid < currentLot.minBid ? (
              <p className="text-center text-sm text-red-400">
                Saldo insuficiente para o lance mínimo.
              </p>
            ) : (
              <>
                <div className="mb-3">
                  {!isLocalAuction && humanClubIds.length > 1 && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {humanClubIds.map((clubId) => {
                        const club = state.clubs.find((c) => c.id === clubId);
                        if (!club) return null;
                        const active = club.id === bidderClub.id;
                        return (
                          <button
                            key={club.id}
                            type="button"
                            className={`ef-btn text-xs ${active ? "ef-btn-active" : ""}`}
                            disabled={busy || showingResult}
                            onClick={() => onBidderClubChange(club.id)}
                          >
                            {club.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="mb-1 flex justify-between text-xs ef-muted-text">
                    <span>Lance de {bidderClub.name}</span>
                    <span className="ef-accent-text">
                      {bidAmount.toLocaleString()}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={currentLot.minBid}
                    max={maxBid}
                    step={1}
                    value={Math.min(bidAmount, maxBid)}
                    disabled={busy || !canBid}
                    onChange={(e) => setBidAmount(Number(e.target.value))}
                    className="w-full accent-[var(--ef-team-primary)]"
                  />
                  <div className="mt-1 flex justify-between text-xs ef-muted-text">
                    <span>{currentLot.minBid.toLocaleString()}</span>
                    <span>{maxBid.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="ef-btn ef-btn-active flex-1"
                    disabled={busy || !canBid}
                    onClick={() => resolveLot(bidAmount)}
                  >
                    {busy ? "..." : "Dar lance"}
                  </button>
                  <button
                    type="button"
                    className="ef-btn flex-1"
                    disabled={busy}
                    onClick={() => resolveLot(null)}
                  >
                    Passar
                  </button>
                </div>
              </>
            )}

            {!isOwnSale && (alreadyOwn || maxBid < currentLot.minBid) && (
              <button
                type="button"
                className="ef-btn mt-3 w-full"
                disabled={busy}
                onClick={() => resolveLot(null)}
              >
                Passar
              </button>
            )}

            <button
              type="button"
              className="ef-btn mt-3 w-full text-sm"
              disabled={busy}
              onClick={() => void skipAll()}
            >
              Pular leilão
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
