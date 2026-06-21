import { createNewGame, simulateRound, processEndOfSeason, startNextSeason } from "../src/engine/index";
import { closeDb } from "../src/db/client";
import type { CountryCode } from "../src/engine/types";

const countriesArg = process.argv[2] ?? "BR,ES";
const countries = countriesArg.split(",").map((c) => c.trim()) as CountryCode[];
const clubSlug = process.argv[3] ?? "FLAMENGO";

console.log(`\n=== Simulação Squad Manager ===`);
console.log(`Países: ${countries.join(", ")} | Clube: ${clubSlug}\n`);

let state = createNewGame(countries, "Técnico Teste", clubSlug);
const humanClub = state.clubs.find((c) => c.id === state.humanClubId)!;

console.log(`Técnico no ${humanClub.name} (${humanClub.division}ª divisão)`);
console.log(`Rodadas: ${state.totalRounds} | Times: ${state.clubs.length}\n`);

let safety = 0;
while (state.phase === "regular" && safety < 500) {
  state = simulateRound(state);
  if (state.round % 5 === 0 || state.phase === "offseason") {
    console.log(`Rodada ${state.round - 1}/${state.totalRounds} concluída`);
  }
  if (state.phase === "offseason") break;
  safety++;
}

console.log(`\n--- Fim da temporada ${state.season} ---`);
state = processEndOfSeason(state);

const divStandings = state.standings
  .filter((s) => {
    const c = state.clubs.find((x) => x.id === s.clubId)!;
    return c.division === humanClub.division;
  })
  .sort((a, b) => b.points - a.points);

const pos =
  divStandings.findIndex((s) => s.clubId === state.humanClubId) + 1;
const humanCoach = state.coaches.find((coach) => coach.id === state.coach.coachId);

console.log(`Posição final: ${pos}º`);
console.log(`Respeito do técnico: ${humanCoach?.respectScore ?? 0}`);
console.log(`Moral do clube: ${state.clubs.find((c) => c.id === state.humanClubId)?.morale}`);
console.log(`Ofertas de transferência: ${state.transferOffers.length}`);
console.log(`Ofertas de emprego: ${state.coach.offers.length}`);

console.log(`\nÚltimas mensagens:`);
state.messages.slice(-5).forEach((m) => console.log(`  - ${m}`));

state = startNextSeason(state);
console.log(`\nTemporada ${state.season} pronta para iniciar.`);

closeDb();
console.log("\nSimulação concluída com sucesso.\n");
