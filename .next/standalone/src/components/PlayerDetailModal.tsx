"use client";

import { useEffect, useState } from "react";
import type { Club, Player, SeasonPhase } from "@/engine/types";
import { AGGRESSIVENESS_LABELS } from "@/engine/types";
import { isPlayerInjured, isPlayerPendingRegistration, isPlayerSuspended } from "@/engine/player";
import { playerBlocksSale } from "@/engine/finances";
import { getMinBidBounds } from "@/engine/auction";
import { MATCH_HISTORY_LIMIT } from "@/engine/player-history";
import { YellowCardAccumulation } from "@/components/PlayerStatsIcons";
import { InjuryBadge } from "@/components/InjuryBadge";
import PlayerNameWithStar from "@/components/PlayerNameWithStar";
import { formatPlayerNameWithStar } from "@/engine/stars";

interface PlayerDetailModalProps {
  player: Player;
  clubs: Club[];
  humanClubId: number;
  humanFinances: number;
  buyPrice: number;
  seasonPhase?: SeasonPhase;
  onClose: () => void;
  onBuy?: () => boolean | Promise<boolean>;
  onAcceptRaise?: () => boolean | Promise<boolean>;
  onRejectRaise?: () => boolean | Promise<boolean>;
  onListForAuction?: (minBid: number) => boolean | Promise<boolean>;
  onUpdateAuctionMinBid?: (minBid: number) => boolean | Promise<boolean>;
  onCancelAuctionListing?: () => boolean | Promise<boolean>;
  auctionQueued?: boolean;
  auctionMinBid?: number;
  buyBusy?: boolean;
  raiseBusy?: boolean;
  sellBusy?: boolean;
}

function BuyConfirmModal({
  playerName,
  buyPrice,
  humanFinances,
  buyBusy,
  onConfirm,
  onCancel,
}: {
  playerName: string;
  buyPrice: number;
  humanFinances: number;
  buyBusy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
      onClick={onCancel}
    >
      <div
        className="ef-panel w-full max-w-sm p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="ef-title mb-3 text-lg">Confirmar compra</h3>
        <p className="mb-2 text-sm ef-muted-text">
          Saldo atual:{" "}
          <span className="font-medium ef-accent-text">
            {humanFinances.toLocaleString()}
          </span>
        </p>
        <p className="mb-4 text-sm">
          Tem certeza que deseja comprar o jogador{" "}
          <span className="font-medium text-white">{playerName}</span> por{" "}
          {buyPrice.toLocaleString()}?
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="ef-btn ef-btn-active flex-1"
            disabled={buyBusy}
            onClick={onConfirm}
          >
            {buyBusy ? "Comprando..." : "Sim"}
          </button>
          <button
            type="button"
            className="ef-btn flex-1"
            disabled={buyBusy}
            onClick={onCancel}
          >
            Não
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlayerDetailModal({
  player,
  clubs,
  humanClubId,
  humanFinances,
  buyPrice,
  seasonPhase = "regular",
  onClose,
  onBuy,
  onAcceptRaise,
  onRejectRaise,
  onListForAuction,
  onUpdateAuctionMinBid,
  onCancelAuctionListing,
  auctionQueued = false,
  auctionMinBid,
  buyBusy = false,
  raiseBusy = false,
  sellBusy = false,
}: PlayerDetailModalProps) {
  const [showBuyConfirm, setShowBuyConfirm] = useState(false);
  const bidBounds = getMinBidBounds(player.value);
  const [localMinBid, setLocalMinBid] = useState(
    auctionMinBid ?? bidBounds.default
  );
  const suspended = isPlayerSuspended(player);
  const pendingRegistration = isPlayerPendingRegistration(player);
  const injured = isPlayerInjured(player);
  const history = [...(player.matchHistory ?? [])]
    .reverse()
    .slice(0, MATCH_HISTORY_LIMIT);
  const club = clubs.find((c) => c.id === player.clubId);
  const isOwnPlayer = player.clubId === humanClubId;
  const canAfford = humanFinances >= buyPrice;
  const saleBlocked = playerBlocksSale(player, seasonPhase);
  const canListForSale =
    isOwnPlayer &&
    seasonPhase === "regular" &&
    !saleBlocked &&
    !player.raisePending;

  useEffect(() => {
    setLocalMinBid(auctionMinBid ?? bidBounds.default);
  }, [auctionMinBid, bidBounds.default, player.id]);

  async function handleConfirmBuy() {
    if (!onBuy) return;
    const ok = await onBuy();
    if (ok) {
      setShowBuyConfirm(false);
      onClose();
    } else {
      setShowBuyConfirm(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        onClick={onClose}
      >
        <div
          className="ef-panel max-h-[90vh] w-full max-w-lg overflow-y-auto p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <h2 className="ef-title text-lg">
                {player.position} - <PlayerNameWithStar player={player} />
              </h2>
              <p className="text-sm ef-muted-text">
                {player.clubId === 0 ? "Leilão" : (club?.name ?? "—")}
              </p>
            </div>
            <button type="button" className="ef-btn text-xs" onClick={onClose}>
              Fechar
            </button>
          </div>

          {player.raisePending && isOwnPlayer && (
            <div className="mb-4 rounded border border-yellow-700 bg-yellow-900/20 p-3 text-sm">
              <p className="mb-2 font-medium text-yellow-400">
                Pedido de renovação salarial
              </p>
              <p>
                Atual: {player.salary.toLocaleString()} → Pedido:{" "}
                <span className="ef-accent-text">
                  {player.requestedSalary?.toLocaleString()}
                </span>
              </p>
              <p className="mt-1 text-xs ef-muted-text">
                Salário abaixo da faixa após aumento de força na última rodada.
                Aceitar bloqueia a venda até o fim da temporada. Recusar envia
                ao leilão.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="ef-btn ef-btn-active text-xs"
                  disabled={raiseBusy || !onAcceptRaise}
                  onClick={async () => {
                    if (!onAcceptRaise) return;
                    const ok = await onAcceptRaise();
                    if (ok) onClose();
                  }}
                >
                  Aceitar renovação
                </button>
                <button
                  type="button"
                  className="ef-btn text-xs"
                  disabled={raiseBusy || !onRejectRaise}
                  onClick={async () => {
                    if (!onRejectRaise) return;
                    const ok = await onRejectRaise();
                    if (ok) onClose();
                  }}
                >
                  Recusar (leilão)
                </button>
              </div>
            </div>
          )}

          <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="ef-muted-text">Força</dt>
            <dd>{player.skill}</dd>
            <dt className="ef-muted-text">Salário (rodada)</dt>
            <dd>
              {player.salary.toLocaleString()}
              {player.saleBlockedThisSeason && isOwnPlayer && (
                <span
                  className="ml-1 text-yellow-400"
                  title="Venda bloqueada até fim da temporada"
                >
                  ★
                </span>
              )}
            </dd>
            <dt className="ef-muted-text">Gols (temporada)</dt>
            <dd>{player.seasonGoals}</dd>
            <dt className="ef-muted-text">Acumulado amarelo</dt>
            <dd>
              <YellowCardAccumulation count={player.yellowAccumulation} />
            </dd>
            <dt className="ef-muted-text">Valor</dt>
            <dd>{player.value.toLocaleString()}</dd>
            <dt className="ef-muted-text">Característica</dt>
            <dd>{AGGRESSIVENESS_LABELS[player.aggressiveness]}</dd>
            {pendingRegistration && (
              <>
                <dt className="ef-muted-text">Status</dt>
                <dd className="text-sky-400">
                  Aguarda inscrição (CON) — estreia na próxima partida
                </dd>
              </>
            )}
            {suspended && (
              <>
                <dt className="ef-muted-text">Status</dt>
                <dd className="text-red-400">
                  Suspenso ({player.suspensionMatches} jogo
                  {player.suspensionMatches > 1 ? "s" : ""})
                </dd>
              </>
            )}
            {injured && (
              <>
                <dt className="ef-muted-text">Lesão</dt>
                <dd className="flex items-center gap-2 text-red-400">
                  <InjuryBadge rounds={player.injuryDays} />
                  <span>
                    Indisponível por {player.injuryDays} rodada
                    {player.injuryDays > 1 ? "s" : ""}
                  </span>
                </dd>
              </>
            )}
            {player.raisePending && isOwnPlayer && seasonPhase === "regular" && (
              <>
                <dt className="ef-muted-text">Contrato</dt>
                <dd className="text-yellow-400">Renovação pendente</dd>
              </>
            )}
          </dl>

          <div className="mb-4">
            {isOwnPlayer && seasonPhase === "regular" && (
              <div className="mb-3 rounded border border-[var(--ef-border)] p-3 text-sm">
                <p className="mb-2 font-medium">Vender no leilão (imediato)</p>
                <p className="mb-2 text-xs ef-muted-text">
                  Valor de mercado:{" "}
                  <span className="ef-accent-text">
                    {player.value.toLocaleString()}
                  </span>
                  {auctionQueued && (
                    <span className="ml-2 text-yellow-400">
                      · Na fila (próx. leilão par)
                    </span>
                  )}
                </p>
                {!canListForSale ? (
                  <p className="text-xs text-red-400">
                    Venda indisponível (plantel mínimo, renovação pendente ou
                    bloqueio ★).
                  </p>
                ) : (
                  <>
                    <div className="mb-2 flex justify-between text-xs ef-muted-text">
                      <span>Lance mínimo</span>
                      <span className="ef-accent-text">
                        {localMinBid.toLocaleString()}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={bidBounds.min}
                      max={bidBounds.max}
                      step={1}
                      value={localMinBid}
                      disabled={sellBusy}
                      onChange={(e) => setLocalMinBid(Number(e.target.value))}
                      className="mb-2 w-full accent-[var(--ef-team-primary)]"
                    />
                    <div className="flex flex-wrap gap-2">
                      {auctionQueued ? (
                        <>
                          <button
                            type="button"
                            className="ef-btn ef-btn-active text-xs"
                            disabled={sellBusy || !onUpdateAuctionMinBid}
                            onClick={async () => {
                              if (!onUpdateAuctionMinBid) return;
                              await onUpdateAuctionMinBid(localMinBid);
                            }}
                          >
                            Atualizar mínimo
                          </button>
                          <button
                            type="button"
                            className="ef-btn text-xs"
                            disabled={sellBusy || !onCancelAuctionListing}
                            onClick={async () => {
                              if (!onCancelAuctionListing) return;
                              const ok = await onCancelAuctionListing();
                              if (ok) onClose();
                            }}
                          >
                            Retirar da fila
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="ef-btn ef-btn-active text-xs"
                          disabled={sellBusy || !onListForAuction}
                          onClick={async () => {
                            if (!onListForAuction) return;
                            const ok = await onListForAuction(localMinBid);
                            if (ok) onClose();
                          }}
                        >
                          Vender agora
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
            {isOwnPlayer ? null : player.clubId > 0 ? (
              <button
                type="button"
                className="ef-btn text-sm"
                disabled={!canAfford || buyBusy || !onBuy}
                onClick={() => setShowBuyConfirm(true)}
              >
                Comprar ({buyPrice.toLocaleString()})
              </button>
            ) : null}
            {isOwnPlayer && saleBlocked && (
              <span className="self-center text-xs text-yellow-400">
                Venda bloqueada nesta temporada
              </span>
            )}
            {!isOwnPlayer && player.clubId > 0 && !canAfford && (
              <span className="self-center text-xs text-red-400">
                Saldo insuficiente
              </span>
            )}
            </div>
          </div>

          <h3 className="ef-title mb-2 text-sm">
            Histórico de jogos (últimos {MATCH_HISTORY_LIMIT})
          </h3>
          {history.length === 0 ? (
            <p className="text-sm ef-muted-text">
              Nenhum jogo registrado ainda.
            </p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
              {history.map((entry, i) => (
                <li
                  key={`${entry.fixtureId}-${entry.season}-${i}`}
                  className="border border-[var(--ef-border)] p-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      T{entry.season} R{entry.round} · vs {entry.opponentName}
                    </span>
                    <span className="flex items-center gap-2 text-xs">
                      {entry.goals > 0 && <span>{entry.goals}⚽</span>}
                      {entry.yellowCards > 0 && (
                        <span className="text-yellow-400">
                          {entry.yellowCards}🟨
                        </span>
                      )}
                      {entry.redCards > 0 && (
                        <span className="text-red-400">{entry.redCards}🟥</span>
                      )}
                      {entry.goals === 0 &&
                        entry.yellowCards === 0 &&
                        entry.redCards === 0 &&
                        "—"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showBuyConfirm && (
        <BuyConfirmModal
          playerName={formatPlayerNameWithStar(player.name, player.isStar)}
          buyPrice={buyPrice}
          humanFinances={humanFinances}
          buyBusy={buyBusy}
          onConfirm={handleConfirmBuy}
          onCancel={() => setShowBuyConfirm(false)}
        />
      )}
    </>
  );
}
