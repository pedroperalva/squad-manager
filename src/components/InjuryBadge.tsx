export function InjuryBadge({
  rounds,
  className = "",
}: {
  rounds: number;
  className?: string;
}) {
  if (rounds <= 0) return null;

  return (
    <span
      className={`inline-flex items-center align-middle ${className}`}
      title={`Lesionado (${rounds} rodada${rounds > 1 ? "s" : ""})`}
    >
      <span
        className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm bg-white"
        aria-hidden
      >
        <svg
          viewBox="0 0 12 12"
          className="h-3 w-3 text-red-600"
          fill="none"
          aria-hidden
        >
          <path
            d="M6 2.25v7.5M2.25 6h7.5"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="ml-1 text-xs font-semibold text-red-400">{rounds}R</span>
    </span>
  );
}
