export function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

export function shuffledCopy<T>(arr: readonly T[], rng: () => number): T[] {
  const copy = [...arr];
  shuffleInPlace(copy, rng);
  return copy;
}
