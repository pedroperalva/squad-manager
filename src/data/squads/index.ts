import type { ClubSquadTemplate } from "@/data/squads/types";
import { validateSquadTemplate } from "@/data/squads/validate";
import { BR_SQUADS } from "@/data/squads/teams/br";
import { ES_SQUADS } from "@/data/squads/teams/es";
import { IT_SQUADS } from "@/data/squads/teams/it";
import { EN_SQUADS } from "@/data/squads/teams/en";
import { PT_SQUADS } from "@/data/squads/teams/pt";
import { FR_SQUADS } from "@/data/squads/teams/fr";
import { DE_SQUADS } from "@/data/squads/teams/de";

const ALL_SQUADS: ClubSquadTemplate[] = [
  ...BR_SQUADS,
  ...ES_SQUADS,
  ...IT_SQUADS,
  ...EN_SQUADS,
  ...PT_SQUADS,
  ...FR_SQUADS,
  ...DE_SQUADS,
];

const SQUAD_BY_SLUG = new Map<string, ClubSquadTemplate>(
  ALL_SQUADS.map((s) => [s.slug, s])
);

const SLUG_ALIASES: Record<string, string> = {
  VASCO: "VSC_GAMA",
};

export function getClubSquadTemplate(slug: string): ClubSquadTemplate | undefined {
  const resolved = SLUG_ALIASES[slug] ?? slug;
  return SQUAD_BY_SLUG.get(resolved);
}

export function getAllClubSquadTemplates(): ClubSquadTemplate[] {
  return ALL_SQUADS;
}

/** Valida todos os elencos pré-configurados (útil em scripts de desenvolvimento). */
export function validateAllSquadTemplates(): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const template of ALL_SQUADS) {
    if (seen.has(template.slug)) {
      errors.push(`${template.slug}: slug duplicado no catálogo de elencos`);
    }
    seen.add(template.slug);
    errors.push(...validateSquadTemplate(template));
  }

  return errors;
}

export { ALL_SQUADS, SQUAD_BY_SLUG };
