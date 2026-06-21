import type { Position } from "@/engine/types";

/** Jogador pré-configurado de um clube (nome e posição fixos; força sorteada na divisão). */
export interface SquadPlayerTemplate {
  name: string;
  position: Position;
}

/** Elenco fixo de um clube identificado pelo slug do catálogo. */
export interface ClubSquadTemplate {
  slug: string;
  players: SquadPlayerTemplate[];
}

export const TARGET_SQUAD_SIZE = 20;
export const MIN_SQUAD_GK = 2;
