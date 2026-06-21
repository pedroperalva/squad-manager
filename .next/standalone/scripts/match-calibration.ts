import { createNewGame } from "../src/engine/index";
import {
  simulateHalfMatch,
  simulateMatch,
} from "../src/engine/match";
import { buildLivePenaltyChances } from "../src/engine/live-round";
import { effectiveSkill, getPlayersByClub } from "../src/engine/player";
import { buildDefaultSquad } from "../src/engine/squad";
import type { CountryCode } from "../src/engine/types";

const MATCHES = 4000;
const MISMATCH_AVG_GAP = 8;

function averageLineupSkill(playerIds: number[], players: ReturnType<typeof getPlayersByClub>): number {
  const lineup = playerIds
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);
  if (lineup.length === 0) return 0;
  return lineup.reduce((sum, p) => sum + effectiveSkill(p), 0) / lineup.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function pct(count: number, total: number): string {
  return `${((count / total) * 100).toFixed(1)}%`;
}

const state = createNewGame(["BR", "ES"] as CountryCode[], "Calibração", "FLAMENGO");
const leagueClubs = state.clubs.filter((club) => club.division <= 4);

console.log("\n=== Calibração de partidas ===\n");

const penaltyHist = [0, 0, 0, 0];
for (let i = 0; i < MATCHES; i++) {
  const count = buildLivePenaltyChances(i * 13 + 7, [], [], 90).length;
  penaltyHist[Math.min(3, count)]!++;
}

console.log(`Pênaltis (${MATCHES} jogos simulados):`);
for (let count = 0; count <= 3; count++) {
  console.log(`  ${count}: ${penaltyHist[count]} (${pct(penaltyHist[count]!, MATCHES)})`);
}
console.log(
  `  média: ${(
    penaltyHist.reduce((sum, n, count) => sum + n * count, 0) / MATCHES
  ).toFixed(3)} por jogo\n`
);

const cpuTotals: number[] = [];
const liveTotals: number[] = [];
const balancedTotals: number[] = [];
const mismatchTotals: number[] = [];
let cpuSixPlus = 0;
let liveSixPlus = 0;
let cpuSevenPlusOneSide = 0;
let liveSevenPlusOneSide = 0;
let mismatchSevenPlusOneSide = 0;

for (let i = 0; i < MATCHES; i++) {
  const home = leagueClubs[i % leagueClubs.length]!;
  let away = leagueClubs[(i * 19 + 7) % leagueClubs.length]!;
  if (away.id === home.id) {
    away = leagueClubs[(i * 19 + 8) % leagueClubs.length]!;
  }

  const homePlayers = getPlayersByClub(state.players, home.id);
  const awayPlayers = getPlayersByClub(state.players, away.id);
  const homeLineupIds = buildDefaultSquad(homePlayers).lineupIds;
  const awayLineupIds = buildDefaultSquad(awayPlayers).lineupIds;

  const homeAvg = averageLineupSkill(homeLineupIds, homePlayers);
  const awayAvg = averageLineupSkill(awayLineupIds, awayPlayers);
  const isMismatch = Math.abs(homeAvg - awayAvg) >= MISMATCH_AVG_GAP;

  const cpu = simulateMatch(
    i + 1,
    home,
    away,
    homePlayers,
    awayPlayers,
    i * 31 + 1000,
    homeLineupIds,
    awayLineupIds,
    true
  );
  const cpuTotal = cpu.homeGoals + cpu.awayGoals;
  cpuTotals.push(cpuTotal);
  if (cpuTotal >= 6) cpuSixPlus++;
  if (cpu.homeGoals >= 7 || cpu.awayGoals >= 7) cpuSevenPlusOneSide++;

  const firstHalf = simulateHalfMatch(
    i + 1,
    home,
    away,
    homePlayers,
    awayPlayers,
    i * 41 + 2000,
    "first",
    homeLineupIds,
    awayLineupIds
  );
  const live = simulateHalfMatch(
    i + 1,
    home,
    away,
    homePlayers,
    awayPlayers,
    i * 41 + 2000,
    "second",
    homeLineupIds,
    awayLineupIds,
    firstHalf.homeGoals,
    firstHalf.awayGoals
  );
  const liveTotal = live.homeGoals + live.awayGoals;
  liveTotals.push(liveTotal);
  if (liveTotal >= 6) liveSixPlus++;
  if (live.homeGoals >= 7 || live.awayGoals >= 7) liveSevenPlusOneSide++;

  if (isMismatch) {
    mismatchTotals.push(liveTotal);
    if (live.homeGoals >= 7 || live.awayGoals >= 7) mismatchSevenPlusOneSide++;
  } else {
    balancedTotals.push(liveTotal);
  }
}

const avg = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

console.log("Gols totais — simulateMatch (CPU):");
console.log(`  média: ${avg(cpuTotals).toFixed(2)} | mediana: ${median(cpuTotals)}`);
console.log(`  6+ gols: ${cpuSixPlus} (${pct(cpuSixPlus, MATCHES)})`);
console.log(`  7+ de um time: ${cpuSevenPlusOneSide} (${pct(cpuSevenPlusOneSide, MATCHES)})\n`);

console.log("Gols totais — ao vivo (2 tempos):");
console.log(`  média: ${avg(liveTotals).toFixed(2)} | mediana: ${median(liveTotals)}`);
console.log(`  6+ gols: ${liveSixPlus} (${pct(liveSixPlus, MATCHES)})`);
console.log(`  7+ de um time: ${liveSevenPlusOneSide} (${pct(liveSevenPlusOneSide, MATCHES)})\n`);

console.log(`Jogos equilibrados (gap médio < ${MISMATCH_AVG_GAP}, n=${balancedTotals.length}):`);
console.log(`  média: ${avg(balancedTotals).toFixed(2)} | mediana: ${median(balancedTotals)}\n`);

console.log(`Jogos com mismatch (gap médio ≥ ${MISMATCH_AVG_GAP}, n=${mismatchTotals.length}):`);
console.log(`  média: ${avg(mismatchTotals).toFixed(2)} | mediana: ${median(mismatchTotals)}`);
console.log(
  `  7+ de um time: ${mismatchSevenPlusOneSide} (${pct(
    mismatchSevenPlusOneSide,
    Math.max(1, mismatchTotals.length)
  )})`
);

console.log("\n");
