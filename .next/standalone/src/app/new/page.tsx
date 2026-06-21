"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ALL_COUNTRIES,
  countTeamsFromCountries,
  getNewGameValidation,
} from "@/data/teams-catalog";
import type { CountryCode } from "@/engine/types";
import {
  COUNTRY_LABELS,
  MIN_GAME_TEAMS,
  TEAMS_PER_DISTRITAL,
} from "@/engine/types";
import { actionCreateGame } from "@/app/actions";

export default function NewGamePage() {
  const router = useRouter();
  const [selectedCountries, setSelectedCountries] = useState<CountryCode[]>([]);
  const [playerCount, setPlayerCount] = useState(1);
  const [playerNames, setPlayerNames] = useState<string[]>(["Jogador 1"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const poolSize = useMemo(
    () => countTeamsFromCountries(selectedCountries),
    [selectedCountries]
  );
  const validation = useMemo(
    () => getNewGameValidation(selectedCountries),
    [selectedCountries]
  );
  const canStart = validation.canStart;

  function toggleCountry(code: CountryCode) {
    setError(null);
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  function updatePlayerCount(next: number) {
    const clamped = Math.max(1, Math.min(4, next));
    setPlayerCount(clamped);
    setPlayerNames((prev) => {
      const list = [...prev];
      while (list.length < clamped) list.push(`Jogador ${list.length + 1}`);
      return list.slice(0, clamped);
    });
  }

  async function handleStart() {
    if (!canStart) return;
    const names = playerNames
      .slice(0, playerCount)
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    if (names.length !== playerCount) {
      setError("Preencha o nome de todos os jogadores.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const state = await actionCreateGame(selectedCountries, names);
      router.push(`/game/${state.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar o jogo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="ef-landing">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="mb-6 inline-flex items-center gap-1 text-sm text-white/90 hover:text-white hover:underline">
          ← Voltar ao início
        </Link>

        <header className="mb-8 flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <Image
            src="/squad-manager-logo.png"
            alt="Squad Manager"
            width={120}
            height={150}
            className="h-auto w-24 shrink-0"
          />
          <div>
            <h1 className="ef-landing-title text-2xl !text-white sm:text-3xl">Novo jogo</h1>
            <p className="ef-landing-hero-muted mt-2 text-sm leading-relaxed">
              Configure jogadores locais e escolha os países do campeonato.
            </p>
          </div>
        </header>

        <div className="ef-landing-card space-y-6 p-6">
          <section>
            <h2 className="ef-landing-title mb-1 text-base">Jogadores</h2>
            <p className="ef-landing-muted mb-4 text-sm">
              No modo local, cada jogador recebe um clube sorteado da 4ª divisão.
            </p>

            <label className="mb-4 block text-sm">
              <span className="ef-landing-muted font-medium">
                Quantidade de jogadores locais
              </span>
              <select
                className="ef-landing-input mt-1.5"
                value={playerCount}
                onChange={(e) => updatePlayerCount(Number(e.target.value))}
              >
                <option value={1}>1 jogador</option>
                <option value={2}>2 jogadores</option>
                <option value={3}>3 jogadores</option>
                <option value={4}>4 jogadores</option>
              </select>
            </label>

            <fieldset className="space-y-3 text-sm">
              <legend className="ef-landing-muted mb-2 font-medium">
                Nomes dos jogadores
              </legend>
              {playerNames.slice(0, playerCount).map((name, idx) => (
                <label key={idx} className="block">
                  <span className="ef-landing-muted text-xs uppercase tracking-wide">
                    Jogador {idx + 1}
                  </span>
                  <input
                    className="ef-landing-input mt-1"
                    value={name}
                    onChange={(e) =>
                      setPlayerNames((prev) =>
                        prev.map((p, i) => (i === idx ? e.target.value : p))
                      )
                    }
                  />
                </label>
              ))}
            </fieldset>
          </section>

          <section className="border-t border-[color-mix(in_srgb,var(--ef-brand)_15%,#ffffff)] pt-6">
            <h2 className="ef-landing-title mb-1 text-base">Países</h2>
            <p className="ef-landing-muted mb-4 text-sm">
              Top 32 clubes formam a liga nacional; mais {TEAMS_PER_DISTRITAL}{" "}
              entram no distrital e na Copa ({MIN_GAME_TEAMS} clubes no total).
            </p>

            <fieldset>
              <legend className="sr-only">Países do campeonato</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {ALL_COUNTRIES.map((code) => {
                  const count = countTeamsFromCountries([code]);
                  const checked = selectedCountries.includes(code);
                  return (
                    <label
                      key={code}
                      className={`flex cursor-pointer items-center gap-3 rounded-[calc(var(--ef-radius)-2px)] border p-3 transition-colors ${
                        checked
                          ? "border-[var(--ef-brand)] bg-[color-mix(in_srgb,var(--ef-brand)_10%,#ffffff)]"
                          : "border-[color-mix(in_srgb,var(--ef-brand)_18%,#ffffff)] bg-[#fafcf9]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="accent-[var(--ef-brand)]"
                        checked={checked}
                        onChange={() => toggleCountry(code)}
                      />
                      <span className="text-sm font-medium text-[var(--ef-landing-text)]">
                        {COUNTRY_LABELS[code]}
                        <span className="ef-landing-muted ml-1 font-normal">
                          ({count} clubes)
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </section>

          <div className="rounded-[calc(var(--ef-radius)-2px)] border border-[color-mix(in_srgb,var(--ef-brand)_20%,#ffffff)] bg-[#f8faf6] px-4 py-3 text-sm">
            <span className="ef-landing-muted">Pool combinado: </span>
            <span
              className={
                canStart
                  ? "font-semibold text-[var(--ef-brand)]"
                  : "font-semibold text-amber-700"
              }
            >
              {poolSize} clubes
            </span>
          </div>

          {validation.message && (
            <p className="rounded-[calc(var(--ef-radius)-2px)] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {validation.message}
            </p>
          )}

          {error && (
            <p className="rounded-[calc(var(--ef-radius)-2px)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          )}

          <button
            className="ef-landing-btn-primary w-full"
            disabled={loading || !canStart}
            onClick={handleStart}
          >
            {loading ? "Criando save..." : "Iniciar jogo local"}
          </button>
        </div>
      </div>
    </main>
  );
}
