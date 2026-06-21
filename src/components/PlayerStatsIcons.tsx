export function YellowCardAccumulation({
  count,
  className = "",
}: {
  count: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex gap-0.5 ${className}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`inline-block h-3 w-2 border ${
            i < count
              ? "border-yellow-500 bg-yellow-400"
              : "border-[var(--ef-border)] bg-transparent"
          }`}
        />
      ))}
    </span>
  );
}

export function MatchStatIcons({
  goals,
  yellowCards,
  redCards,
}: {
  goals: number;
  yellowCards: number;
  redCards: number;
}) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1">
      {Array.from({ length: goals }).map((_, i) => (
        <span key={`g-${i}`} className="text-xs" title="Gol">
          ⚽
        </span>
      ))}
      {Array.from({ length: yellowCards }).map((_, i) => (
        <span
          key={`y-${i}`}
          className="inline-block h-3 w-2 border border-yellow-500 bg-yellow-400"
          title="Cartão amarelo"
        />
      ))}
      {Array.from({ length: redCards }).map((_, i) => (
        <span
          key={`r-${i}`}
          className="inline-block h-3 w-2 border border-red-600 bg-red-500"
          title="Cartão vermelho"
        />
      ))}
    </span>
  );
}
