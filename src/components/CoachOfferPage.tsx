"use client";

import { useMemo, useState } from "react";
import type { GameState } from "@/engine/types";
import { formatDivisionLabel } from "@/engine/types";
import { getHumanManagerDisplayName } from "@/engine/coach";
import { getPlayersByClub } from "@/engine/player";
import { buildDefaultSquad } from "@/engine/squad";
import SquadLineupTable from "@/components/SquadLineupTable";
import { clubPanelThemeStyle } from "@/lib/club-theme";

function MoraleBar({ morale }: { morale: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(morale)));
  const color =
    pct <= 30 ? "bg-red-500" : pct <= 69 ? "bg-yellow-400" : "bg-green-500";

  return (
    <div
      className="relative h-5 w-32 overflow-hidden border border-[var(--ef-border)] bg-black/30"
      title={`Moral ${pct}%`}
    >
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white drop-shadow">
        {pct}%
      </span>
    </div>
  );
}

interface CoachOfferPageProps {
  state: GameState;
  busy: boolean;
  onAccept: (offerId: number) => void | Promise<void>;
  onReject: (offerId: number) => void | Promise<void>;
}

export default function CoachOfferPage({
  state,
  busy,
  onAccept,
  onReject,
}: CoachOfferPageProps) {
  const offers = state.coach.offers;
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(0, offers.length - 1));
  const offer = offers[safeIndex];

  const offerClub = offer
    ? state.clubs.find((c) => c.id === offer.clubId)
    : null;
  const offerSquad = offerClub
    ? getPlayersByClub(state.players, offerClub.id)
    : [];
  const defaultLineup = useMemo(
    () => (offerSquad.length > 0 ? buildDefaultSquad(offerSquad) : null),
    [offerSquad]
  );

  if (!offer || !offerClub) return null;

  const managerName = getHumanManagerDisplayName(state);

  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-black/92 p-4 py-8">
      <div className="ef-game-theme flex w-full max-w-3xl flex-col gap-4">
        <div className="ef-panel p-4 text-center">
          <h2 className="ef-title text-xl">Proposta de trabalho</h2>
          {offers.length > 1 && (
            <p className="mt-1 text-sm ef-muted-text">
              Proposta {safeIndex + 1} de {offers.length}
            </p>
          )}
          {state.coach.currentClubId === null && (
            <p className="mt-2 text-sm text-yellow-400">
              Escolha um clube para continuar a temporada.
            </p>
          )}
        </div>

        <div
          className="ef-game-theme overflow-hidden rounded border border-[var(--ef-border)]"
          style={clubPanelThemeStyle(offerClub)}
        >
          <div className="p-5">
            <div className="mb-4 text-center">
              <p className="text-2xl font-semibold">{offer.clubName}</p>
              <p className="mt-1 text-sm ef-muted-text">
                {formatDivisionLabel(offer.division)} divisão
                {offer.reason ? ` · ${offer.reason}` : ""}
              </p>
              <p className="mt-2 text-sm">
                Proposta para:{" "}
                <span className="ef-accent-text font-medium">{managerName}</span>
              </p>
            </div>

            <dl className="mx-auto mb-4 grid max-w-md grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="ef-muted-text">Moral do clube</dt>
              <dd>
                <MoraleBar morale={offerClub.morale} />
              </dd>
              <dt className="ef-muted-text">Finanças</dt>
              <dd>{offerClub.finances.toLocaleString()}</dd>
              <dt className="ef-muted-text">Estádio</dt>
              <dd>{offerClub.stadiumCapacity.toLocaleString()}</dd>
            </dl>

            <div className="flex flex-wrap justify-center gap-2 border-t border-[var(--ef-border)] pt-4">
              <button
                type="button"
                className="ef-btn ef-btn-active min-w-[8rem]"
                disabled={busy}
                onClick={() => void onAccept(offer.id)}
              >
                Aceitar
              </button>
              <button
                type="button"
                className="ef-btn min-w-[8rem]"
                disabled={busy}
                onClick={() => {
                  void onReject(offer.id);
                  if (safeIndex >= offers.length - 1) {
                    setIndex(Math.max(0, safeIndex - 1));
                  }
                }}
              >
                Recusar
              </button>
              {offers.length > 1 && (
                <>
                  <button
                    type="button"
                    className="ef-btn text-sm"
                    disabled={busy || safeIndex <= 0}
                    onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    className="ef-btn text-sm"
                    disabled={busy || safeIndex >= offers.length - 1}
                    onClick={() =>
                      setIndex((i) => Math.min(offers.length - 1, i + 1))
                    }
                  >
                    Próxima
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <section className="ef-panel p-4">
          <h3 className="ef-title mb-3 text-base">Elenco atual</h3>
          {defaultLineup ? (
            <SquadLineupTable
              squad={offerSquad}
              lineupIds={defaultLineup.lineupIds}
              benchIds={defaultLineup.benchIds}
              clubs={state.clubs}
              humanClubId={offerClub.id}
              humanFinances={offerClub.finances}
              readOnly
              compact
              seasonPhase={state.phase}
            />
          ) : (
            <p className="text-sm ef-muted-text">Sem jogadores no elenco.</p>
          )}
        </section>
      </div>
    </div>
  );
}
