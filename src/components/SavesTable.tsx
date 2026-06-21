"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { actionDeleteSave } from "@/app/actions";
import { COUNTRY_LABELS, parseCountriesField } from "@/engine/types";
import type { CountryCode } from "@/engine/types";

type SaveRow = {
  id: string;
  name: string;
  country: string;
  coachName: string;
  season: number;
  clubName: string;
};

function formatSaveCountries(raw: string): string {
  const codes = parseCountriesField(raw);
  if (codes.length === 0) return raw;
  return codes.map((c) => COUNTRY_LABELS[c as CountryCode] ?? c).join(" · ");
}

export default function SavesTable({
  saves,
  variant = "game",
}: {
  saves: SaveRow[];
  variant?: "game" | "landing";
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<SaveRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const isLanding = variant === "landing";

  function handleDelete(saveId: string) {
    setPendingId(saveId);
    startTransition(async () => {
      try {
        await actionDeleteSave(saveId);
        router.refresh();
      } finally {
        setPendingId(null);
        setConfirmTarget(null);
      }
    });
  }

  const wrapperClass = isLanding ? "ef-landing-card p-5" : "ef-panel p-4";
  const titleClass = isLanding
    ? "ef-landing-title mb-4 text-lg"
    : "ef-title mb-3 text-lg";

  return (
    <section className={wrapperClass}>
      <h2 className={titleClass}>Continuar carreira</h2>
      <div className="overflow-x-auto">
        <table
          className={`w-full text-sm ${
            isLanding ? "ef-landing-saves-table" : "ef-table"
          }`}
        >
          <thead>
            <tr>
              <th>Save</th>
              <th>País</th>
              <th>Técnico</th>
              <th>Clube</th>
              <th>Temp.</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {saves.map((s) => {
              const deleting = isPending && pendingId === s.id;
              return (
                <tr key={s.id}>
                  <td className="font-medium">{s.name}</td>
                  <td>{formatSaveCountries(s.country)}</td>
                  <td>{s.coachName}</td>
                  <td>{s.clubName}</td>
                  <td>T{s.season}</td>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/game/${s.id}`}
                        className={
                          isLanding
                            ? "ef-landing-btn-primary px-3 py-1.5 text-xs"
                            : "ef-btn ef-btn-active px-3 py-1 text-xs"
                        }
                      >
                        Jogar
                      </Link>
                      <button
                        type="button"
                        className={
                          isLanding
                            ? "ef-landing-btn-secondary border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
                            : "ef-btn border-red-600 px-3 py-1 text-xs text-red-300 hover:bg-red-900/30"
                        }
                        disabled={deleting}
                        onClick={() => setConfirmTarget(s)}
                      >
                        {deleting ? "Excluindo..." : "Excluir"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div
            className={
              isLanding
                ? "ef-landing-card w-full max-w-md p-6"
                : "ef-panel w-full max-w-md p-5"
            }
          >
            <h3
              className={
                isLanding
                  ? "ef-landing-title mb-2 text-lg"
                  : "ef-title mb-2 text-lg"
              }
            >
              Confirmar exclusão
            </h3>
            <p
              className={`mb-2 text-sm ${isLanding ? "text-[var(--ef-landing-text)]" : ""}`}
            >
              Você quer mesmo excluir o save{" "}
              <span
                className={
                  isLanding
                    ? "font-semibold text-[var(--ef-brand)]"
                    : "ef-accent-text"
                }
              >
                {confirmTarget.name}
              </span>
              ?
            </p>
            <p
              className={`mb-4 text-xs ${isLanding ? "text-red-700" : "text-red-300"}`}
            >
              Esta ação é sensível e não pode ser desfeita.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={
                  isLanding
                    ? "ef-landing-btn-secondary flex-1"
                    : "ef-btn flex-1"
                }
                disabled={isPending}
                onClick={() => setConfirmTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={
                  isLanding
                    ? "ef-landing-btn-secondary flex-1 border-red-300 text-red-700 hover:bg-red-50"
                    : "ef-btn flex-1 border-red-600 text-red-300 hover:bg-red-900/30"
                }
                disabled={isPending}
                onClick={() => handleDelete(confirmTarget.id)}
              >
                {isPending && pendingId === confirmTarget.id
                  ? "Excluindo..."
                  : "Sim, excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
