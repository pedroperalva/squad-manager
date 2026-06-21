import { validateAllSquadTemplates, getAllClubSquadTemplates } from "@/data/squads";
import { TEAMS_CATALOG } from "@/data/teams-catalog";

const errors = validateAllSquadTemplates();
const slugs = new Set(getAllClubSquadTemplates().map((s) => s.slug));
const missing = TEAMS_CATALOG.filter((t) => !slugs.has(t.slug)).map((t) => t.slug);

console.log(`Elencos configurados: ${slugs.size}`);
console.log(`Clubes no catálogo: ${TEAMS_CATALOG.length}`);

if (missing.length > 0) {
  console.error("\nClubes SEM elenco pré-configurado:");
  for (const slug of missing) console.error(`  - ${slug}`);
}

if (errors.length > 0) {
  console.error("\nErros de validação:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

if (missing.length > 0) {
  process.exit(1);
}

console.log("\nTodos os elencos válidos.");
