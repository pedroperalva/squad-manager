import type { ClubSquadTemplate } from "@/data/squads/types";
import { MIN_SQUAD_GK, TARGET_SQUAD_SIZE } from "@/data/squads/types";

export function validateSquadTemplate(template: ClubSquadTemplate): string[] {
  const errors: string[] = [];
  const { slug, players } = template;

  if (players.length < TARGET_SQUAD_SIZE - 2 || players.length > TARGET_SQUAD_SIZE + 2) {
    errors.push(
      `${slug}: elenco com ${players.length} jogadores (esperado ~${TARGET_SQUAD_SIZE})`
    );
  }

  const gk = players.filter((p) => p.position === "GK").length;
  if (gk < MIN_SQUAD_GK) {
    errors.push(`${slug}: apenas ${gk} goleiro(s) (mínimo ${MIN_SQUAD_GK})`);
  }

  for (const p of players) {
    if (!p.name.trim()) {
      errors.push(`${slug}: jogador sem nome`);
    }
  }

  return errors;
}
