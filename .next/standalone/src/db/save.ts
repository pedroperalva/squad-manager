import type { Club, GameState } from "@/engine/types";
import { parseCountriesField } from "@/engine/types";
import { hashStringToSeed } from "@/data/name-generator";
import { getDb } from "@/db/client";
import { migratePlayer, getPlayersByClub } from "@/engine/player";
import { migrateClubFields } from "@/engine/club";
import { removeUnavailableFromSquad } from "@/engine/squad";
import {
  createCoach,
  initializeCoachRegistry,
} from "@/engine/coach";
import { migrateClubFinanceFields } from "@/engine/finances";
import { migrateCupState } from "@/engine/cup";
import { MATCH_HISTORY_LIMIT } from "@/engine/player-history";

export const GAME_MESSAGES_LIMIT = 300;

export function trimGameMessages(
  messages: string[],
  limit = GAME_MESSAGES_LIMIT
): string[] {
  if (messages.length <= limit) return messages;
  return messages.slice(-limit);
}

export function trimGameStateMessages(
  state: GameState,
  limit = GAME_MESSAGES_LIMIT
): GameState {
  if (state.messages.length <= limit) return state;
  return { ...state, messages: trimGameMessages(state.messages, limit) };
}

export function loadSaveOrThrow(id: string): GameState {
  const state = loadGame(id);
  if (!state) {
    throw new Error("Save não encontrado.");
  }
  return state;
}

function normalizeGameState(state: GameState): GameState {
  const players = state.players.map((p) => {
    const migrated = migratePlayer(p);
    if (migrated.matchHistory.length > MATCH_HISTORY_LIMIT) {
      migrated.matchHistory = migrated.matchHistory.slice(-MATCH_HISTORY_LIMIT);
    }
    return migrated;
  });

  const clubs = state.clubs.map((c) => {
    const migrated = migrateClubFields(c as Club & { managerExpectation?: string });
    return migrateClubFinanceFields(migrated);
  });

  const countries =
    state.countries?.length > 0
      ? state.countries
      : parseCountriesField(String(state.country ?? "PT"));

  const migrationSeed = initializeCoachRegistry(
    clubs,
    state.humanClubId,
    state.coach?.name ?? "Técnico",
    state.season ?? 1
  );
  const playerCoachName = (state.coach?.name ?? "").trim() || "Técnico";
  const humanCoachId =
    state.coach?.coachId ?? migrationSeed.humanCoachId;

  const coaches =
    state.coaches && state.coaches.length > 0
      ? state.coaches.map((coach) => ({
          id: coach.id,
          name: coach.id === humanCoachId ? playerCoachName : coach.name,
          currentClubId: coach.currentClubId ?? null,
          lastClubId: coach.lastClubId ?? null,
          matchesWon: coach.matchesWon ?? 0,
          matchesDrawn: coach.matchesDrawn ?? 0,
          matchesLost: coach.matchesLost ?? 0,
          titles: coach.titles ?? 0,
          respectScore: 0,
          seasonsCoached: coach.seasonsCoached ?? 0,
          lastSeasonActive: coach.lastSeasonActive ?? state.season ?? 1,
        }))
      : migrationSeed.coaches.map((coach) =>
          coach.id === migrationSeed.humanCoachId
            ? { ...coach, name: playerCoachName }
            : coach
        );

  for (const club of clubs) {
    if (club.coachId == null) {
      const fallback = coaches.find((coach) => coach.currentClubId === club.id);
      if (fallback) {
        club.coachId = fallback.id;
        club.coachName = fallback.name;
        club.coachReputation = club.morale;
      }
    }
  }

  const fallbackCoach = createCoach(
    state.coach?.name ?? "Técnico",
    clubs.find((club) => club.id === state.humanClubId)?.coachId ??
      migrationSeed.humanCoachId
  );
  fallbackCoach.currentClubId =
    state.coach?.currentClubId ?? state.humanClubId ?? null;
  fallbackCoach.offers = state.coach?.offers ?? [];

  return {
    ...state,
    runSeed: state.runSeed ?? hashStringToSeed(state.id),
    countries,
    country: countries[0] ?? state.country ?? "PT",
    players,
    clubs,
    cup: migrateCupState(state),
    auctionListings: state.auctionListings ?? [],
    auctionQueue: state.auctionQueue ?? [],
    auctionSession: state.auctionSession
      ? {
          ...state.auctionSession,
          actingManagerIndex: state.auctionSession.actingManagerIndex ?? 0,
          pendingHumanBids: state.auctionSession.pendingHumanBids ?? [],
          skipVotes: state.auctionSession.skipVotes ?? 0,
        }
      : null,
    nextAuctionId: state.nextAuctionId ?? 1,
    nextAuctionLotId: state.nextAuctionLotId ?? 1,
    lineupPlayerIds: [],
    benchPlayerIds: [],
    humanFormation: null,
    lastRoundResults: state.lastRoundResults ?? null,
    seasonSummary: state.seasonSummary ?? null,
    lastPlayerSale: null,
    messages: trimGameMessages(state.messages ?? []),
    coach: {
      ...fallbackCoach,
      ...state.coach,
      name: playerCoachName,
      coachId:
        state.coach?.coachId ??
        fallbackCoach.coachId ??
        migrationSeed.humanCoachId,
      offers: (state.coach?.offers ?? []).map((offer) => ({
        ...offer,
        managerName: playerCoachName,
      })),
    },
    coaches,
    nextCoachId:
      state.nextCoachId ??
      Math.max(
        migrationSeed.nextCoachId,
        ...coaches.map((coach) => coach.id + 1),
        1
      ),
    localManagers:
      state.localManagers && state.localManagers.length > 0
        ? state.localManagers.map((manager) => {
            const squad = getPlayersByClub(players, manager.clubId);
            const sanitized = removeUnavailableFromSquad(
              manager.lineupPlayerIds ?? [],
              manager.benchPlayerIds ?? [],
              squad
            );
            return {
              ...manager,
              lineupPlayerIds: sanitized.lineupIds,
              benchPlayerIds: sanitized.benchIds,
            };
          })
        : [
            {
              id: "P1",
              name: state.coach?.name ?? "Jogador 1",
              clubId: state.humanClubId,
              ready: false,
              lineupPlayerIds: state.lineupPlayerIds ?? [],
              benchPlayerIds: state.benchPlayerIds ?? [],
              formation: state.humanFormation ?? null,
            },
          ],
    activeManagerIndex: state.activeManagerIndex ?? 0,
    isLocalMultiplayer: state.isLocalMultiplayer ?? false,
    auctionBidderClubId: state.auctionBidderClubId ?? state.humanClubId,
  };
}

export interface SaveSummary {
  id: string;
  name: string;
  country: string;
  coachName: string;
  season: number;
  clubName: string;
  updatedAt: string;
}

export function saveGame(state: GameState, name?: string): void {
  const db = getDb();
  const persisted = trimGameStateMessages(state);
  const humanClub = persisted.clubs.find((c) => c.id === persisted.humanClubId);
  const saveName = name ?? `${humanClub?.name ?? "Save"} - T${persisted.season}`;

  const stmt = db.prepare(`
    INSERT INTO saves (id, name, country, coach_name, state_json, updated_at)
    VALUES (@id, @name, @country, @coachName, @stateJson, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = @name,
      state_json = @stateJson,
      updated_at = datetime('now')
  `);

  stmt.run({
    id: persisted.id,
    name: saveName,
    country: (persisted.countries ?? [persisted.country]).join(","),
    coachName: persisted.coach.name,
    stateJson: JSON.stringify(persisted),
  });
}

export function loadGame(id: string): GameState | null {
  const db = getDb();
  const row = db
    .prepare("SELECT state_json FROM saves WHERE id = ?")
    .get(id) as { state_json: string } | undefined;

  if (!row) return null;
  return normalizeGameState(JSON.parse(row.state_json) as GameState);
}

export function listSaves(): SaveSummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, name, country, coach_name, state_json, updated_at FROM saves ORDER BY updated_at DESC"
    )
    .all() as {
    id: string;
    name: string;
    country: string;
    coach_name: string;
    state_json: string;
    updated_at: string;
  }[];

  return rows.map((row) => {
    const state = JSON.parse(row.state_json) as GameState;
    const club = state.clubs.find((c) => c.id === state.humanClubId);
    return {
      id: row.id,
      name: row.name,
      country: row.country.includes(",")
        ? row.country
        : row.country,
      coachName: row.coach_name,
      season: state.season,
      clubName: club?.name ?? "?",
      updatedAt: row.updated_at,
    };
  });
}

export function deleteSave(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM saves WHERE id = ?").run(id);
}
