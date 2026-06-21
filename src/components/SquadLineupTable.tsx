"use client";

import { useState } from "react";
import type { Player, SeasonPhase } from "@/engine/types";
import { AGGRESSIVENESS_LABELS } from "@/engine/types";
import { effectiveSkill, isPlayerInjured, isPlayerPendingRegistration, isPlayerSuspended } from "@/engine/player";
import { getPlayerBuyPrice } from "@/engine/transfer";
import {
  cyclePlayerStatus,
  getLineupValidationMessage,
  getSquadStatus,
  type SquadStatus,
} from "@/engine/squad";
import PlayerDetailModal from "@/components/PlayerDetailModal";
import { YellowCardAccumulation } from "@/components/PlayerStatsIcons";
import { InjuryBadge } from "@/components/InjuryBadge";
import PlayerNameWithStar from "@/components/PlayerNameWithStar";
import type { Club, PlayerAuctionQueueItem } from "@/engine/types";

function StatusCheckbox({
  status,
  disabled,
  onClick,
}: {
  status: SquadStatus;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-5 w-5 shrink-0 items-center justify-center border text-xs ${
        disabled
          ? "cursor-not-allowed border-[var(--ef-border)] opacity-40"
          : "border-[var(--ef-team-secondary)] bg-[var(--ef-bg)] hover:bg-[color-mix(in_srgb,var(--ef-team-primary)_12%,var(--ef-panel-bg))]"
      }`}
      title={
        status === "starter"
          ? "Titular — clique para reserva"
          : status === "bench"
            ? "Reserva — clique para fora"
            : "Fora — clique para titular"
      }
    >
      {status === "starter" ? "■" : status === "bench" ? "—" : ""}
    </button>
  );
}

interface SquadLineupTableProps {
  squad: Player[];
  lineupIds: number[];
  benchIds: number[];
  clubs: Club[];
  humanClubId: number;
  humanClubIds?: number[];
  humanFinances: number;
  onChange?: (lineupIds: number[], benchIds: number[]) => void;
  onBuyPlayer?: (playerId: number) => boolean | Promise<boolean>;
  onAcceptRaise?: (playerId: number) => boolean | Promise<boolean>;
  onRejectRaise?: (playerId: number) => boolean | Promise<boolean>;
  onListForAuction?: (playerId: number, minBid: number) => boolean | Promise<boolean>;
  onUpdateAuctionMinBid?: (playerId: number, minBid: number) => boolean | Promise<boolean>;
  onCancelAuctionListing?: (playerId: number) => boolean | Promise<boolean>;
  auctionQueue?: PlayerAuctionQueueItem[];
  readOnly?: boolean;
  compact?: boolean;
  buyBusy?: boolean;
  raiseBusy?: boolean;
  sellBusy?: boolean;
  seasonPhase?: SeasonPhase;
}

export default function SquadLineupTable({
  squad,
  lineupIds,
  benchIds,
  clubs,
  humanClubId,
  humanClubIds = [humanClubId],
  humanFinances,
  onChange,
  onBuyPlayer,
  onAcceptRaise,
  onRejectRaise,
  onListForAuction,
  onUpdateAuctionMinBid,
  onCancelAuctionListing,
  auctionQueue = [],
  readOnly = false,
  compact = false,
  buyBusy = false,
  raiseBusy = false,
  sellBusy = false,
  seasonPhase = "regular",
}: SquadLineupTableProps) {
  const [detailPlayer, setDetailPlayer] = useState<Player | null>(null);

  function handleCheckboxClick(playerId: number) {
    if (readOnly || !onChange) return;
    const result = cyclePlayerStatus(
      playerId,
      lineupIds,
      benchIds,
      squad
    );
    if (result) {
      onChange(result.lineupIds, result.benchIds);
    }
  }

  function handleRowClick(player: Player) {
    setDetailPlayer(player);
  }

  const validation =
    !readOnly && onChange && lineupIds.length > 0
      ? getLineupValidationMessage(lineupIds, squad)
      : null;
  const sorted = [...squad].sort((a, b) => {
    const order = { GK: 0, DF: 1, MF: 2, FW: 3 };
    const posDiff = order[a.position] - order[b.position];
    if (posDiff !== 0) return posDiff;
    return effectiveSkill(b) - effectiveSkill(a);
  });
  const isOwnSquad =
    squad.length > 0 && squad.every((player) => player.clubId === humanClubId);

  return (
    <div>
      {validation && (
        <p className="mb-2 text-xs text-yellow-400">{validation}</p>
      )}

      <div className="overflow-x-auto">
        <table className="ef-table w-full text-sm">
          <thead>
            <tr>
              {!readOnly && <th className="w-8"></th>}
              <th>Jogador</th>
              <th>Força</th>
              <th>Gols</th>
              <th>Cart.</th>
              <th>Característica</th>
              {!compact && <th>{isOwnSquad ? "Salário" : "Valor"}</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const status = getSquadStatus(p.id, lineupIds, benchIds);
              const suspended = isPlayerSuspended(p);
              const pendingRegistration = isPlayerPendingRegistration(p);
              const injured = isPlayerInjured(p);
              const unavailable = suspended || injured || pendingRegistration;
              const displayStatus =
                unavailable && status === "bench" ? "out" : status;

              return (
                <tr
                  key={p.id}
                  className={`cursor-pointer ${
                    !readOnly && displayStatus === "starter"
                      ? "ef-highlight"
                      : !readOnly && displayStatus === "bench"
                        ? "bg-[color-mix(in_srgb,var(--ef-team-primary)_12%,var(--ef-panel-bg))]"
                        : ""
                  } ${unavailable ? "opacity-60" : ""}`}
                  onClick={() => handleRowClick(p)}
                >
                  {!readOnly && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <StatusCheckbox
                        status={displayStatus}
                        disabled={unavailable}
                        onClick={() => handleCheckboxClick(p.id)}
                      />
                    </td>
                  )}
                  <td>
                    {p.position} - <PlayerNameWithStar player={p} />
                    {p.raisePending && p.clubId === humanClubId && (
                      <span className="ml-1 text-xs text-yellow-400">$↑</span>
                    )}
                    {auctionQueue.some(
                      (q) =>
                        q.playerId === p.id && q.sellerClubId === humanClubId
                    ) && (
                      <span
                        className="ml-1 text-xs ef-accent-text"
                        title="No leilão"
                      >
                        🔨
                      </span>
                    )}
                    {suspended && (
                      <span className="ml-1 text-xs text-red-400">SUS</span>
                    )}
                    {pendingRegistration && (
                      <span
                        className="ml-1 text-xs text-sky-400"
                        title="Aguarda inscrição — estreia na próxima partida"
                      >
                        CON
                      </span>
                    )}
                    {injured && (
                      <span className="ml-1">
                        <InjuryBadge rounds={p.injuryDays} />
                      </span>
                    )}
                  </td>
                  <td>{p.skill}</td>
                  <td>{p.seasonGoals}</td>
                  <td>
                    <YellowCardAccumulation count={p.yellowAccumulation} />
                  </td>
                  <td className="whitespace-nowrap text-xs">
                    {AGGRESSIVENESS_LABELS[p.aggressiveness]}
                  </td>
                  {!compact && (
                    <td>
                      {isOwnSquad ? p.salary.toLocaleString() : p.value.toLocaleString()}
                      {isOwnSquad &&
                        p.saleBlockedThisSeason &&
                        p.clubId === humanClubId && (
                          <span
                            className="ml-1 text-yellow-400"
                            title="Venda bloqueada até fim da temporada"
                          >
                            ★
                          </span>
                        )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <p className="mt-2 text-xs ef-muted-text">
          Checkbox: ■ titular → — reserva → vazio. Clique no jogador para ver
          detalhes.
        </p>
      )}

      {detailPlayer && (() => {
        const queued = auctionQueue.find(
          (q) =>
            q.playerId === detailPlayer.id && q.sellerClubId === humanClubId
        );
        const isOtherLocalHumanClub =
          detailPlayer.clubId !== humanClubId &&
          humanClubIds.includes(detailPlayer.clubId);
        return (
        <PlayerDetailModal
          player={detailPlayer}
          clubs={clubs}
          humanClubId={humanClubId}
          humanFinances={humanFinances}
          buyPrice={getPlayerBuyPrice(detailPlayer)}
          seasonPhase={seasonPhase}
          buyBusy={buyBusy}
          raiseBusy={raiseBusy}
          sellBusy={sellBusy}
          auctionQueued={!!queued}
          auctionMinBid={queued?.minBid}
          onClose={() => setDetailPlayer(null)}
          onBuy={
            detailPlayer.clubId !== humanClubId &&
            !isOtherLocalHumanClub &&
            onBuyPlayer
              ? () => onBuyPlayer(detailPlayer.id)
              : undefined
          }
          onAcceptRaise={
            detailPlayer.clubId === humanClubId &&
            detailPlayer.raisePending &&
            onAcceptRaise
              ? () => onAcceptRaise(detailPlayer.id)
              : undefined
          }
          onRejectRaise={
            detailPlayer.clubId === humanClubId &&
            detailPlayer.raisePending &&
            onRejectRaise
              ? () => onRejectRaise(detailPlayer.id)
              : undefined
          }
          onListForAuction={
            detailPlayer.clubId === humanClubId && onListForAuction
              ? (minBid) => onListForAuction(detailPlayer.id, minBid)
              : undefined
          }
          onUpdateAuctionMinBid={
            queued && onUpdateAuctionMinBid
              ? (minBid) => onUpdateAuctionMinBid(detailPlayer.id, minBid)
              : undefined
          }
          onCancelAuctionListing={
            queued && onCancelAuctionListing
              ? () => onCancelAuctionListing(detailPlayer.id)
              : undefined
          }
        />
        );
      })()}
    </div>
  );
}
