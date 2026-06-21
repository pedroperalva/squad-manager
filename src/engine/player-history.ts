import type { CardEvent, GameState, LiveMatchPlan, Player } from "@/engine/types";
import { normalizeMatchCardDisplay } from "@/engine/cards";

export const MATCH_HISTORY_LIMIT = 5;

export function getPlayerLiveMatchStats(
  playerId: number,
  match: LiveMatchPlan,
  minute: number
): {
  goals: number;
  yellowCards: number;
  redCards: number;
  expelled: boolean;
} {
  const goals = match.events.filter(
    (e) => e.playerId === playerId && e.minute <= minute
  ).length;

  const cards = match.cardEvents.filter(
    (e) => e.playerId === playerId && e.minute <= minute
  );
  const rawYellows = cards.filter((e) => e.type === "yellow").length;
  const rawReds = cards.filter((e) => e.type === "red").length;
  const normalized = normalizeMatchCardDisplay(rawYellows, rawReds);

  return {
    goals,
    yellowCards: normalized.yellowCards,
    redCards: normalized.redCards,
    expelled: normalized.expelled,
  };
}

export function countTeamExpulsionsAtMinute(
  match: LiveMatchPlan,
  team: "home" | "away",
  minute: number
): number {
  const expelled = new Set<number>();
  const lineupIds =
    team === "home" ? match.homeLineupIds : match.awayLineupIds;
  for (const playerId of lineupIds) {
    const stats = getPlayerLiveMatchStats(playerId, match, minute);
    if (stats.expelled) expelled.add(playerId);
  }
  return expelled.size;
}

function countPlayerCardsInMatch(
  cardEvents: CardEvent[],
  playerId: number
): { yellowCards: number; redCards: number } {
  const cards = cardEvents.filter((e) => e.playerId === playerId);
  const rawYellows = cards.filter((e) => e.type === "yellow").length;
  const rawReds = cards.filter((e) => e.type === "red").length;
  const normalized = normalizeMatchCardDisplay(rawYellows, rawReds);
  return {
    yellowCards: normalized.yellowCards,
    redCards: normalized.redCards,
  };
}

export function recordPlayersMatchHistory(
  players: Player[],
  plan: LiveMatchPlan,
  state: GameState,
  round: number
): void {
  const recordLineup = (
    clubId: number,
    lineupIds: number[],
    opponentName: string
  ) => {
    for (const playerId of lineupIds) {
      const player = players.find((p) => p.id === playerId);
      if (!player) continue;

      const goals = plan.events.filter((e) => e.playerId === playerId).length;
      const { yellowCards, redCards } = countPlayerCardsInMatch(
        plan.cardEvents,
        playerId
      );

      if (!player.matchHistory) player.matchHistory = [];

      player.matchHistory.push({
        season: state.season,
        round,
        fixtureId: plan.fixtureId,
        clubId,
        opponentName,
        goals,
        yellowCards,
        redCards,
        wasStarter: true,
      });

      if (player.matchHistory.length > MATCH_HISTORY_LIMIT) {
        player.matchHistory = player.matchHistory.slice(-MATCH_HISTORY_LIMIT);
      }
    }
  };

  recordLineup(plan.homeClubId, plan.homeLineupIds, plan.awayName);
  recordLineup(plan.awayClubId, plan.awayLineupIds, plan.homeName);
}

export function getTopScorers(
  players: Player[],
  clubs: GameState["clubs"],
  limit = 50
) {
  return [...players]
    .filter((p) => p.seasonGoals > 0)
    .sort((a, b) => b.seasonGoals - a.seasonGoals || b.skill - a.skill)
    .slice(0, limit)
    .map((p) => {
      const club = clubs.find((c) => c.id === p.clubId)!;
      return {
        playerId: p.id,
        name: p.name,
        position: p.position,
        goals: p.seasonGoals,
        clubName: club.name,
        division: club.division,
        isHumanClub: club.isHuman,
      };
    });
}
