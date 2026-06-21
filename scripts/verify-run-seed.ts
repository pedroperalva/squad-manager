import { createNewGame, simulateRound } from "../src/engine/index";
import { getCupTiesForLeagueRound } from "../src/engine/cup";
import { getPlayersByClub } from "../src/engine/player";
import type { CountryCode } from "../src/engine/types";

const countries: CountryCode[] = ["BR", "ES", "EN"];
const RUNS = 30;

const humanClubs = new Set<string>();
const cupOpponents = new Set<string>();
const starCounts = new Set<number>();
const bilbaoStarSets = new Set<string>();
const bilbaoAggSets = new Set<string>();

for (let run = 1; run <= RUNS; run++) {
  let state = createNewGame(countries, ["Teste"]);
  const human = state.clubs.find((c) => c.id === state.humanClubId)!;
  humanClubs.add(human.slug);

  const squad = getPlayersByClub(state.players, human.id);
  starCounts.add(squad.filter((p) => p.isStar).length);

  const bilbao = state.clubs.find((c) => c.slug === "BILBAO");
  if (bilbao) {
    const bilbaoSquad = getPlayersByClub(state.players, bilbao.id);
    bilbaoStarSets.add(
      bilbaoSquad
        .filter((p) => p.isStar)
        .map((p) => p.name)
        .sort()
        .join("|")
    );
    bilbaoAggSets.add(
      bilbaoSquad
        .map((p) => `${p.name}:${p.aggressiveness}`)
        .sort()
        .join("|")
    );
  }

  state = simulateRound(state);
  state = simulateRound(state);

  const ties = getCupTiesForLeagueRound(state.cup!, 2);
  const humanTie = ties.find(
    (t) => t.homeClubId === human.id || t.awayClubId === human.id
  );
  if (!humanTie) {
    console.error(`Run ${run}: no cup tie for human`);
    process.exit(1);
  }
  const oppId =
    humanTie.homeClubId === human.id
      ? humanTie.awayClubId
      : humanTie.homeClubId;
  const opp = state.clubs.find((c) => c.id === oppId)!;
  cupOpponents.add(opp.slug);
}

const failures: string[] = [];

if (humanClubs.size < 3) {
  failures.push(
    `Expected at least 3 distinct human clubs in div 4, got ${humanClubs.size}: ${[...humanClubs].join(", ")}`
  );
}

if (cupOpponents.size < 5) {
  failures.push(
    `Expected at least 5 distinct cup R1 opponents, got ${cupOpponents.size}: ${[...cupOpponents].join(", ")}`
  );
}

if (starCounts.size < 2) {
  failures.push(
    `Expected star counts to vary between saves, got only: ${[...starCounts].join(", ")}`
  );
}

if (bilbaoStarSets.size < 3) {
  failures.push(
    `Expected Bilbao star players to vary, got ${bilbaoStarSets.size} distinct sets`
  );
}

if (bilbaoAggSets.size < 5) {
  failures.push(
    `Expected Bilbao player traits to vary, got ${bilbaoAggSets.size} distinct sets`
  );
}

if (failures.length > 0) {
  console.error("verify-run-seed FAILED:");
  for (const msg of failures) console.error(" -", msg);
  process.exit(1);
}

console.log(`verify-run-seed OK (${RUNS} saves)`);
console.log(`  Human clubs: ${humanClubs.size} distinct`);
console.log(`  Cup R1 opponents: ${cupOpponents.size} distinct`);
console.log(`  Star count variants: ${starCounts.size} distinct`);
console.log(`  Bilbao star sets: ${bilbaoStarSets.size} distinct`);
console.log(`  Bilbao trait sets: ${bilbaoAggSets.size} distinct`);
