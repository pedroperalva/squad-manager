"use client";

import type { Club, GameState, PrizeAward } from "@/engine/types";
import { POSITION_LABELS } from "@/engine/types";
import { formatPlayerNameWithStar } from "@/engine/stars";
import { clubKitBlockStyle } from "@/lib/club-theme";

function clubInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

function formatPrize(amount: number): string {
  return `+${amount.toLocaleString("pt-BR")}`;
}

function DivisionChampionCard({
  club,
  award,
  featured,
}: {
  club: Club;
  award: PrizeAward;
  featured?: boolean;
}) {
  return (
    <article
      className={`relative overflow-hidden rounded-lg border border-[var(--ef-border)] bg-[color-mix(in_srgb,var(--ef-panel-bg)_88%,transparent)] shadow-lg ${
        featured ? "md:col-span-2" : ""
      }`}
    >
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background: `linear-gradient(135deg, ${club.primaryColor} 0%, transparent 55%, ${club.secondaryColor} 100%)`,
        }}
        aria-hidden
      />
      <div
        className={`relative flex items-stretch gap-0 ${featured ? "min-h-[7.5rem]" : "min-h-[6rem]"}`}
      >
        <div
          className={`shrink-0 ${featured ? "w-3" : "w-2"}`}
          style={{
            background: `linear-gradient(180deg, ${club.primaryColor}, ${club.secondaryColor})`,
          }}
          aria-hidden
        />
        <div className="flex flex-1 items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={`flex shrink-0 items-center justify-center rounded-sm font-bold leading-tight ${
                featured ? "h-14 w-14 text-xs" : "h-12 w-12 text-[10px]"
              }`}
              style={clubKitBlockStyle(club)}
            >
              {clubInitials(club.name)}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest ef-accent-text">
                {award.competition}
              </p>
              <p
                className={`truncate font-bold ${featured ? "text-xl" : "text-lg"}`}
              >
                {award.clubName}
              </p>
              {featured ? (
                <p className="mt-0.5 text-xs ef-muted-text">Campeão da Copa Geral</p>
              ) : null}
            </div>
          </div>
          <p className="shrink-0 text-right text-sm font-bold text-green-400">
            {formatPrize(award.amount)}
          </p>
        </div>
      </div>
    </article>
  );
}

function TopScorerCard({
  club,
  playerName,
  isStar,
  position,
  goals,
  amount,
}: {
  club: Club;
  playerName: string;
  isStar: boolean;
  position: keyof typeof POSITION_LABELS;
  goals: number;
  amount: number;
}) {
  return (
    <article className="relative overflow-hidden rounded-lg border border-[var(--ef-border)] bg-[color-mix(in_srgb,var(--ef-panel-bg)_88%,transparent)] shadow-lg">
      <div
        className="absolute inset-0 opacity-15"
        style={{
          background: `radial-gradient(circle at 20% 50%, ${club.primaryColor}, transparent 70%)`,
        }}
        aria-hidden
      />
      <div className="relative flex items-stretch">
        <div
          className="w-2 shrink-0"
          style={{
            background: `linear-gradient(180deg, ${club.primaryColor}, ${club.secondaryColor})`,
          }}
          aria-hidden
        />
        <div className="flex flex-1 flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex min-w-0 items-center gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-sm text-xs font-bold"
              style={clubKitBlockStyle(club)}
            >
              {clubInitials(club.name)}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest ef-accent-text">
                Artilheiro da temporada
              </p>
              <p className="text-xl font-bold ef-accent-text">
                {formatPlayerNameWithStar(playerName, isStar)}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm ef-muted-text">
                <span>{club.name}</span>
                <span
                  className="rounded border border-[var(--ef-border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{
                    borderColor: club.primaryColor,
                    color: club.secondaryColor,
                  }}
                >
                  {POSITION_LABELS[position]}
                </span>
                <span>
                  {goals} gol{goals === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest ef-muted-text">
              Prêmio ao clube
            </p>
            <p className="text-lg font-bold text-green-400">{formatPrize(amount)}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

interface SeasonSummaryPageProps {
  state: GameState;
  busy: boolean;
  canStartSeason: boolean;
  onStartNextSeason: () => void | Promise<void>;
}

export default function SeasonSummaryPage({
  state,
  busy,
  canStartSeason,
  onStartNextSeason,
}: SeasonSummaryPageProps) {
  const summary = state.seasonSummary;
  if (!summary) return null;

  const clubById = new Map(state.clubs.map((c) => [c.id, c]));
  const playerById = new Map(state.players.map((p) => [p.id, p]));

  const divisionAwards = summary.awards.filter((a) =>
    /^[1-4]ª divisão$/.test(a.competition)
  );
  const cupAward = summary.awards.find((a) => a.competition === "Copa Geral");
  const divisionOrder = ["1ª divisão", "2ª divisão", "3ª divisão", "4ª divisão"];
  const sortedDivisions = [...divisionAwards].sort(
    (a, b) =>
      divisionOrder.indexOf(a.competition) - divisionOrder.indexOf(b.competition)
  );

  return (
    <div
      className="ef-base-theme fixed inset-0 z-[70] overflow-y-auto"
      style={{ background: "var(--ef-bg-gradient)" }}
    >
      <div className="relative mx-auto max-w-3xl px-4 py-8 pb-12">
        <header className="mb-8 text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.35em] ef-accent-text">
            Parabéns aos campeões
          </p>
          <h1 className="ef-title text-3xl md:text-4xl">
            Resumo da Temporada {summary.season}
          </h1>
          <p className="mt-3 text-sm ef-muted-text">
            Campeões, artilheiro e premiações do encerramento da temporada.
          </p>
        </header>

        {sortedDivisions.length > 0 ? (
          <section className="mb-6">
            <h2 className="mb-3 text-center text-xs font-semibold uppercase tracking-widest ef-muted-text">
              Campeões nacionais
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {sortedDivisions.map((award) => {
                const club = clubById.get(award.clubId);
                if (!club) return null;
                return (
                  <DivisionChampionCard
                    key={award.competition}
                    club={club}
                    award={award}
                  />
                );
              })}
            </div>
          </section>
        ) : null}

        {cupAward ? (
          <section className="mb-6">
            <h2 className="mb-3 text-center text-xs font-semibold uppercase tracking-widest ef-muted-text">
              Copa Geral
            </h2>
            {(() => {
              const club = clubById.get(cupAward.clubId);
              if (!club) return null;
              return (
                <DivisionChampionCard club={club} award={cupAward} featured />
              );
            })()}
          </section>
        ) : null}

        {summary.topScorer ? (
          <section className="mb-8">
            <h2 className="mb-3 text-center text-xs font-semibold uppercase tracking-widest ef-muted-text">
              Chuteira de ouro
            </h2>
            {(() => {
              const scorer = summary.topScorer!;
              const club = clubById.get(scorer.clubId);
              const player = playerById.get(scorer.playerId);
              if (!club) return null;
              return (
                <TopScorerCard
                  club={club}
                  playerName={scorer.playerName}
                  isStar={player?.isStar ?? false}
                  position={scorer.position ?? player?.position ?? "FW"}
                  goals={scorer.goals}
                  amount={scorer.amount}
                />
              );
            })()}
          </section>
        ) : null}

        {sortedDivisions.length === 0 && !cupAward && !summary.topScorer ? (
          <p className="mb-8 rounded-lg border border-[var(--ef-border)] p-6 text-center text-sm ef-muted-text">
            Nenhuma premiação registrada nesta temporada.
          </p>
        ) : null}

        <footer className="flex flex-col items-center gap-3 pt-2">
          {!canStartSeason ? (
            <p className="text-center text-sm text-yellow-400">
              Escolha um clube nas propostas antes de iniciar a nova temporada.
            </p>
          ) : null}
          <button
            type="button"
            className="ef-btn ef-btn-active min-w-[16rem] px-8 py-3 text-base font-semibold"
            disabled={busy || !canStartSeason}
            onClick={() => void onStartNextSeason()}
          >
            {busy ? "Iniciando..." : "Começar nova temporada"}
          </button>
        </footer>
      </div>
    </div>
  );
}
