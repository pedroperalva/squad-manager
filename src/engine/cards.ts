import type {
  Aggressiveness,
  CardEvent,
  MatchDisciplineRecord,
  Player,
} from "@/engine/types";
import { createRng, randomInt } from "@/data/name-generator";

const AGGRESSION_CARD_WEIGHT: Record<Aggressiveness, number> = {
  fair_play: 0.25,
  cavalheiro: 0.45,
  neutro: 1.0,
  caneleiro: 1.7,
  sarrafeiro: 2.4,
};

export function isPlayerExpelledFromCards(
  playerId: number,
  cardEvents: CardEvent[],
  upToMinute = 120
): boolean {
  const cards = cardEvents.filter(
    (e) => e.playerId === playerId && e.minute <= upToMinute
  );
  const yellows = cards.filter((e) => e.type === "yellow").length;
  const reds = cards.filter((e) => e.type === "red").length;
  return reds > 0 || yellows >= 2;
}

export function buildCardRecordsFromEvents(
  cardEvents: CardEvent[],
  lineup: Player[]
): Map<number, MatchDisciplineRecord> {
  const records = new Map<number, MatchDisciplineRecord>();

  for (const player of lineup) {
    records.set(player.id, {
      playerId: player.id,
      yellowsInMatch: 0,
      redInMatch: false,
    });
  }

  for (const event of cardEvents) {
    if (!records.has(event.playerId)) {
      records.set(event.playerId, {
        playerId: event.playerId,
        yellowsInMatch: 0,
        redInMatch: false,
      });
    }
  }

  const sorted = [...cardEvents].sort((a, b) => a.minute - b.minute);
  for (const event of sorted) {
    const record = records.get(event.playerId);
    if (!record || record.redInMatch) continue;

    if (event.type === "red") {
      record.redInMatch = true;
      if (record.yellowsInMatch < 2 && record.yellowsInMatch > 0) {
        record.yellowsInMatch = 2;
      }
      continue;
    }

    record.yellowsInMatch++;
    if (record.yellowsInMatch >= 2) {
      record.redInMatch = true;
    }
  }

  return records;
}

export function normalizeMatchCardDisplay(
  yellowCards: number,
  redCards: number
): { yellowCards: number; redCards: number; expelled: boolean } {
  const expelled = redCards > 0 || yellowCards >= 2;
  let displayYellows = yellowCards;
  let displayReds = redCards;

  if (expelled) {
    if (displayReds > 0) {
      displayYellows = Math.min(displayYellows, 2);
    } else {
      displayYellows = 2;
      displayReds = 1;
    }
  }

  return {
    yellowCards: displayYellows,
    redCards: displayReds,
    expelled,
  };
}

export function generateMatchCardEvents(
  lineup: Player[],
  team: "home" | "away",
  seed: number,
  minuteMin: number,
  minuteMax: number,
  priorCardEvents: CardEvent[] = []
): { events: CardEvent[]; records: MatchDisciplineRecord[] } {
  const rng = createRng(seed + lineup.length * 17);
  const events: CardEvent[] = [];
  const eligibleLineup = lineup.filter(
    (p) => !isPlayerExpelledFromCards(p.id, priorCardEvents, minuteMax)
  );
  const records =
    priorCardEvents.length > 0
      ? buildCardRecordsFromEvents(priorCardEvents, eligibleLineup)
      : new Map<number, MatchDisciplineRecord>();

  for (const player of eligibleLineup) {
    if (!records.has(player.id)) {
      records.set(player.id, {
        playerId: player.id,
        yellowsInMatch: 0,
        redInMatch: false,
      });
    }
  }

  const span = Math.max(1, minuteMax - minuteMin + 1);
  const attemptMin = 0;
  const attemptMax = span <= 45 ? 2 : 4;
  const cardAttempts = randomInt(rng, attemptMin, attemptMax);
  for (let i = 0; i < cardAttempts; i++) {
    if (eligibleLineup.length === 0) break;

    const player =
      eligibleLineup[randomInt(rng, 0, eligibleLineup.length - 1)];
    if (!player) continue;

    const record = records.get(player.id)!;
    if (record.redInMatch) continue;

    const weight = AGGRESSION_CARD_WEIGHT[player.aggressiveness];
    if (rng() > weight * 0.38) continue;

    const minute = randomInt(rng, minuteMin, minuteMax);

    if (record.yellowsInMatch >= 1 && rng() < 0.35 + weight * 0.08) {
      record.redInMatch = true;
      record.yellowsInMatch = 2;
      events.push({
        minute,
        team,
        type: "red",
        playerId: player.id,
        playerName: player.name,
      });
      continue;
    }

    record.yellowsInMatch++;
    events.push({
      minute,
      team,
      type: "yellow",
      playerId: player.id,
      playerName: player.name,
    });

    if (record.yellowsInMatch >= 2) {
      record.redInMatch = true;
      events.push({
        minute,
        team,
        type: "red",
        playerId: player.id,
        playerName: player.name,
      });
    }
  }

  return {
    events: events.sort((a, b) => a.minute - b.minute),
    records: [...records.values()],
  };
}

export function disciplineRecordsFromCardEvents(
  cardEvents: CardEvent[]
): MatchDisciplineRecord[] {
  const records = buildCardRecordsFromEvents(cardEvents, []);
  return [...records.values()];
}

export function applyDisciplineAfterMatch(
  players: Player[],
  records: MatchDisciplineRecord[]
): { messages: string[]; newlySuspended: Set<number> } {
  const messages: string[] = [];
  const newlySuspended = new Set<number>();

  for (const record of records) {
    const player = players.find((p) => p.id === record.playerId);
    if (!player) continue;

    if (record.redInMatch) {
      player.seasonRedCards++;
      if (record.yellowsInMatch > 0) {
        player.seasonYellowCards += record.yellowsInMatch;
      }
      player.yellowAccumulation = 0;
      player.suspensionMatches = 1;
      newlySuspended.add(player.id);
      messages.push(
        record.yellowsInMatch >= 2
          ? `${player.name} suspenso (2o cartao amarelo).`
          : `${player.name} suspenso (cartao vermelho).`
      );
      continue;
    }

    if (record.yellowsInMatch > 0) {
      player.seasonYellowCards += record.yellowsInMatch;
      player.yellowAccumulation += record.yellowsInMatch;

      if (player.yellowAccumulation >= 3) {
        player.yellowAccumulation = 0;
        player.suspensionMatches = 1;
        newlySuspended.add(player.id);
        messages.push(
          `${player.name} suspenso (3 cartoes amarelos acumulados).`
        );
      }
    }
  }

  return { messages, newlySuspended };
}

export function tickSuspensionsAfterRound(
  players: Player[],
  clubIdsWhoPlayed: number[],
  skipPlayerIds: Set<number> = new Set()
): void {
  for (const clubId of clubIdsWhoPlayed) {
    const squad = players.filter((p) => p.clubId === clubId);
    for (const p of squad) {
      if (p.suspensionMatches > 0 && !skipPlayerIds.has(p.id)) {
        p.suspensionMatches--;
      }
    }
  }
}

export function countExpulsionsAtMinute(
  cardEvents: CardEvent[],
  team: "home" | "away",
  minute: number
): number {
  const redCards = new Set<number>();
  for (const e of cardEvents) {
    if (e.team !== team || e.minute > minute) continue;
    if (e.type === "red") redCards.add(e.playerId);
  }
  return redCards.size;
}

export function getAggressivenessLabel(a: Aggressiveness): string {
  const labels = {
    fair_play: "Fair Play",
    cavalheiro: "Cavalheiro",
    neutro: "Neutro",
    caneleiro: "Caneleiro",
    sarrafeiro: "Sarrafeiro",
  };
  return labels[a];
}
