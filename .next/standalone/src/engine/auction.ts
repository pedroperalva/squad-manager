import type {
  AuctionHumanBid,
  AuctionLot,
  AuctionLotReason,
  AuctionLotResult,
  AuctionSession,
  Club,
  GameState,
  Player,
  PlayerAuctionQueueItem,
} from "@/engine/types";
import {
  calculateTicketRevenue,
  getClubPayroll,
  getSeasonHomeMatches,
  getSeasonPayrollEstimate,
} from "@/engine/finances";
import { getPlayersByClub } from "@/engine/player";
import { applyPlayerTransferFields } from "@/engine/transfer";
import { canSellPlayer } from "@/engine/squad";
import { COMFORTABLE_SQUAD_SIZE, DISTRITAL_DIVISION, MAX_SQUAD_SIZE, getGameSeed } from "@/engine/types";
import { createRng, randomInt } from "@/data/name-generator";
import {
  resetLocalManagerTurn,
  syncLocalManagerView,
} from "@/engine/local-play";

export const AUCTION_MIN_LOTS = 8;
export const AUCTION_MAX_LOTS = 15;
export const AUCTION_INTERVAL = 2;
/** Máximo de jogadores do mesmo clube vendedor por leilão. */
export const MAX_LOTS_PER_SELLER_CLUB = 2;
/** Máximo de jogadores distritais por leilão (sempre de clubes diferentes). */
export const MAX_DISTRITAL_LOTS_PER_AUCTION = 2;

function isDistritalSeller(state: GameState, sellerClubId: number): boolean {
  const club = state.clubs.find((c) => c.id === sellerClubId);
  return club?.division === DISTRITAL_DIVISION;
}

function countDistritalLots(
  state: GameState,
  sellerCounts: Map<number, number>
): number {
  let total = 0;
  for (const [clubId, count] of sellerCounts) {
    if (isDistritalSeller(state, clubId)) total += count;
  }
  return total;
}

function canAddSellerLot(
  state: GameState,
  sellerClubId: number,
  sellerCounts: Map<number, number>
): boolean {
  const current = sellerCounts.get(sellerClubId) ?? 0;
  const perClubCap = isDistritalSeller(state, sellerClubId)
    ? 1
    : MAX_LOTS_PER_SELLER_CLUB;
  if (current >= perClubCap) return false;
  if (
    isDistritalSeller(state, sellerClubId) &&
    countDistritalLots(state, sellerCounts) >= MAX_DISTRITAL_LOTS_PER_AUCTION
  ) {
    return false;
  }
  return true;
}

export function getMinBidBounds(marketValue: number): {
  min: number;
  max: number;
  default: number;
} {
  const min = Math.max(1, Math.round(marketValue * 0.5));
  const max = Math.max(min, Math.round(marketValue * 2));
  return { min, max, default: marketValue };
}

export function clampMinBid(marketValue: number, minBid: number): number {
  const { min, max } = getMinBidBounds(marketValue);
  return Math.max(min, Math.min(max, Math.round(minBid)));
}

function clubName(state: GameState, clubId: number): string {
  if (clubId <= 0) return "Sem clube";
  return state.clubs.find((c) => c.id === clubId)?.name ?? "?";
}

function divisionAmbitionFactor(division: number): number {
  switch (division) {
    case 1:
      return 1.2;
    case 2:
      return 1.1;
    case 3:
      return 1.0;
    case 4:
      return 0.9;
    case 5:
      return 0.75;
    default:
      return 1.0;
  }
}

export function computeClubAuctionBudget(
  state: GameState,
  club: Club
): number {
  const payroll = getClubPayroll(state.players, club.id);
  const seasonPayroll = getSeasonPayrollEstimate(
    state.players,
    club.id,
    state.totalRounds
  );
  const { revenue: projectedHomeRevenue } = calculateTicketRevenue(
    club,
    state.standings,
    state.clubs
  );
  const projectedIncome = projectedHomeRevenue * getSeasonHomeMatches(state.totalRounds);

  const reserve = payroll * 2 + Math.round(seasonPayroll * 0.1);
  const buffer = club.division <= 2 ? 120_000 : 80_000;

  return Math.max(
    0,
    Math.floor(club.finances - reserve - buffer + projectedIncome * 0.3)
  );
}

function squadNeedsPosition(club: Club, players: Player[], position: Player["position"]): boolean {
  const squad = getPlayersByClub(players, club.id);
  if (squad.length >= MAX_SQUAD_SIZE) return false;
  const count = squad.filter((p) => p.position === position).length;
  const limits: Record<Player["position"], number> = {
    GK: 3,
    DF: 8,
    MF: 8,
    FW: 5,
  };
  return count < limits[position];
}

function cpuInterestScore(
  club: Club,
  player: Player,
  lot: AuctionLot,
  state: GameState
): number {
  if (club.id === lot.sellerClubId) return 0;
  if (player.clubId === club.id) return 0;

  const squad = getPlayersByClub(state.players, club.id);
  if (squad.length >= MAX_SQUAD_SIZE) return 0;

  const divGap = Math.abs(club.division - (state.clubs.find((c) => c.id === lot.sellerClubId)?.division ?? club.division));
  if (divGap > 1 && player.skill > 35) return 0;

  let score = player.skill / 50;
  score *= divisionAmbitionFactor(club.division);

  if (squadNeedsPosition(club, state.players, player.position)) {
    score += 0.2;
  }

  const avgSkill =
    squad.reduce((s, p) => s + p.skill, 0) / Math.max(1, squad.length);
  if (player.skill > avgSkill + 3) score += 0.15;
  if (player.skill < avgSkill - 5) score -= 0.2;

  const valueRatio = lot.marketValue > 0 ? lot.minBid / lot.marketValue : 1;
  if (valueRatio > 1.1) score -= 0.25;
  if (valueRatio < 0.85) score += 0.1;

  // Penalidade suave (não bloqueio) para plantéis já grandes: o clube ainda
  // pode brigar por um reforço claramente melhor, mas evita encher o elenco.
  if (squad.length > COMFORTABLE_SQUAD_SIZE) {
    score -= (squad.length - COMFORTABLE_SQUAD_SIZE) * 0.09;
  }

  return Math.max(0, score);
}

function computeCpuBid(
  club: Club,
  player: Player,
  lot: AuctionLot,
  state: GameState,
  budget: number,
  rng: () => number
): number {
  const interest = cpuInterestScore(club, player, lot, state);
  if (interest < 0.26) return 0;

  const floorBudget = Math.floor(
    club.finances * (club.division <= 2 ? 0.22 : 0.16)
  );
  const effectiveBudget = Math.max(budget, floorBudget);
  const maxAfford = Math.min(
    effectiveBudget,
    Math.floor(club.finances * (club.division <= 2 ? 0.55 : 0.42))
  );
  if (maxAfford < lot.minBid) return 0;

  const fairValue = Math.round(
    lot.marketValue * (0.85 + interest * 0.35) * divisionAmbitionFactor(club.division)
  );
  let bid = Math.min(maxAfford, Math.max(lot.minBid, fairValue));

  if (rng() < 0.25) {
    bid = Math.min(maxAfford, bid + randomInt(rng, 1, Math.max(1, Math.round(bid * 0.08))));
  }

  return Math.max(lot.minBid, Math.min(maxAfford, Math.round(bid)));
}

function isCpuSellerClub(state: GameState, sellerClubId: number): boolean {
  const club = state.clubs.find((c) => c.id === sellerClubId);
  return club != null && !club.isHuman;
}

function filterCpuAuctionQueue(
  state: GameState,
  queue: PlayerAuctionQueueItem[]
): PlayerAuctionQueueItem[] {
  return queue.filter((item) => isCpuSellerClub(state, item.sellerClubId));
}

function isValidAuctionQueueItem(
  state: GameState,
  item: PlayerAuctionQueueItem
): boolean {
  const player = state.players.find((p) => p.id === item.playerId);
  if (!player) return false;
  if (!state.clubs.some((c) => c.id === item.sellerClubId)) return false;
  if (player.clubId === 0) return true;
  return player.clubId === item.sellerClubId;
}

function sanitizeAuctionQueue(state: GameState): PlayerAuctionQueueItem[] {
  return (state.auctionQueue ?? []).filter((item) =>
    isValidAuctionQueueItem(state, item)
  );
}

function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function isCpuBuyerClub(club: Club): boolean {
  return !club.isHuman;
}

function spreadLotsBySeller(lots: AuctionLot[], rng: () => number): AuctionLot[] {
  if (lots.length <= 1) return lots;

  const remaining = [...lots];
  const result: AuctionLot[] = [];

  while (remaining.length > 0) {
    const lastSeller =
      result.length > 0 ? result[result.length - 1]!.sellerClubId : null;
    const nonAdjacent = remaining.filter((l) => l.sellerClubId !== lastSeller);
    const pool = nonAdjacent.length > 0 ? nonAdjacent : remaining;
    const pick = pool[Math.floor(rng() * pool.length)]!;
    result.push(pick);
    remaining.splice(remaining.indexOf(pick), 1);
  }

  return result;
}

function sortSellerIdsForPick(
  state: GameState,
  sellerIds: number[],
  rng: () => number
): number[] {
  return [...sellerIds].sort((a, b) => {
    const aDistrital = isDistritalSeller(state, a) ? 1 : 0;
    const bDistrital = isDistritalSeller(state, b) ? 1 : 0;
    if (aDistrital !== bDistrital) return aDistrital - bDistrital;
    return rng() - 0.5;
  });
}

function pickLotsRoundRobin<T>(
  state: GameState,
  buckets: Map<number, T[]>,
  targetCount: number,
  rng: () => number,
  startLotId: number,
  sellerCounts: Map<number, number>,
  usedPlayerIds: Set<number>,
  toLot: (item: T, lotId: number) => AuctionLot | null
): {
  lots: AuctionLot[];
  nextLotId: number;
  usedPlayerIds: Set<number>;
} {
  for (const bucket of buckets.values()) {
    shuffleInPlace(bucket, rng);
  }

  let sellerOrder = sortSellerIdsForPick(state, [...buckets.keys()], rng);
  const lots: AuctionLot[] = [];
  let lotId = startLotId;

  while (lots.length < targetCount && sellerOrder.length > 0) {
    let progress = false;
    const nextSellerOrder: number[] = [];

    for (const sellerId of sellerOrder) {
      if (lots.length >= targetCount) break;
      if (!canAddSellerLot(state, sellerId, sellerCounts)) continue;

      const pool = buckets.get(sellerId);
      if (!pool || pool.length === 0) continue;

      while (pool.length > 0) {
        const item = pool.shift()!;
        const lot = toLot(item, lotId);
        if (!lot) continue;
        if (usedPlayerIds.has(lot.playerId)) continue;
        lots.push(lot);
        lotId += 1;
        usedPlayerIds.add(lot.playerId);
        sellerCounts.set(sellerId, (sellerCounts.get(sellerId) ?? 0) + 1);
        progress = true;
        break;
      }

      if (pool.length > 0 && canAddSellerLot(state, sellerId, sellerCounts)) {
        nextSellerOrder.push(sellerId);
      }
    }

    if (!progress) break;
    sellerOrder = shuffleInPlace(nextSellerOrder, rng);
  }

  return { lots, nextLotId: lotId, usedPlayerIds };
}

function pickQueueLotsWithSellerCap(
  state: GameState,
  items: PlayerAuctionQueueItem[],
  targetCount: number,
  rng: () => number,
  startLotId: number,
  sellerCounts: Map<number, number>
): {
  lots: AuctionLot[];
  nextLotId: number;
  usedPlayerIds: Set<number>;
} {
  const buckets = new Map<number, PlayerAuctionQueueItem[]>();
  for (const item of items) {
    if (!isValidAuctionQueueItem(state, item)) continue;
    const bucket = buckets.get(item.sellerClubId) ?? [];
    bucket.push(item);
    buckets.set(item.sellerClubId, bucket);
  }

  return pickLotsRoundRobin(
    state,
    buckets,
    targetCount,
    rng,
    startLotId,
    sellerCounts,
    new Set<number>(),
    (item, lotId) => queueItemToLot(state, item, lotId)
  );
}

function appendFallbackLots(
  state: GameState,
  lots: AuctionLot[],
  usedPlayerIds: Set<number>,
  sellerCounts: Map<number, number>,
  targetCount: number,
  rng: () => number,
  startLotId: number
): number {
  if (lots.length >= targetCount) return startLotId;

  const buckets = new Map<number, Player[]>();
  const clubs = shuffleInPlace(
    state.clubs.filter((c) => !c.isHuman),
    rng
  );

  for (const club of clubs) {
    if (!canAddSellerLot(state, club.id, sellerCounts)) continue;

    const candidates = getPlayersByClub(state.players, club.id)
      .filter((p) => canSellPlayer(state.players, club.id, p.id))
      .filter((p) => !usedPlayerIds.has(p.id))
      .sort((a, b) => a.skill - b.skill);

    if (candidates.length === 0) continue;
    buckets.set(club.id, candidates);
  }

  const picked = pickLotsRoundRobin(
    state,
    buckets,
    targetCount - lots.length,
    rng,
    startLotId,
    sellerCounts,
    usedPlayerIds,
    (player, lotId) => {
      const club = state.clubs.find((c) => c.id === player.clubId);
      if (!club) return null;
      return {
        id: lotId,
        playerId: player.id,
        playerName: player.name,
        position: player.position,
        skill: player.skill,
        sellerClubId: club.id,
        sellerClubName: club.name,
        minBid: clampMinBid(player.value, Math.round(player.value * 0.9)),
        marketValue: player.value,
        reason: "ai_voluntary" as AuctionLotReason,
      };
    }
  );

  lots.push(...picked.lots);
  return picked.nextLotId;
}

function appendAuctionQueueItem(
  state: GameState,
  clubId: number,
  playerId: number,
  minBid: number,
  reason: PlayerAuctionQueueItem["reason"]
): GameState {
  const player = state.players.find((p) => p.id === playerId);
  const club = state.clubs.find((c) => c.id === clubId);
  if (!player || !club) return state;

  const queue = state.auctionQueue ?? [];
  if (queue.some((q) => q.playerId === playerId)) {
    return state;
  }

  const marketValue = player.value;
  const clampedMin = clampMinBid(marketValue, minBid);
  const item: PlayerAuctionQueueItem = {
    id: state.nextAuctionLotId ?? 1,
    playerId,
    sellerClubId: clubId,
    minBid: clampedMin,
    marketValue,
    reason,
    listedRound: state.round,
    season: state.season,
  };

  return {
    ...state,
    auctionQueue: [...queue, item],
    nextAuctionLotId: (state.nextAuctionLotId ?? 1) + 1,
  };
}

export function listPlayerOnAuctionQueue(
  state: GameState,
  clubId: number,
  playerId: number,
  minBid: number
): GameState {
  const player = state.players.find((p) => p.id === playerId);
  const club = state.clubs.find((c) => c.id === clubId);
  if (!player || !club || player.clubId !== clubId) return state;

  if (club.isHuman) {
    return {
      ...state,
      messages: [
        ...state.messages,
        `${player.name}: use a venda imediata no perfil do jogador.`,
      ],
    };
  }

  if (!canSellPlayer(state.players, clubId, playerId)) {
    return {
      ...state,
      messages: [
        ...state.messages,
        `Não é possível leiloar ${player.name} (plantel mínimo ou venda bloqueada).`,
      ],
    };
  }

  const marketValue = player.value;
  const clampedMin = clampMinBid(marketValue, minBid);
  const next = appendAuctionQueueItem(
    state,
    clubId,
    playerId,
    minBid,
    "ai_voluntary"
  );

  return {
    ...next,
    messages: [
      ...next.messages,
      `${player.name} na fila do leilão (mín. ${clampedMin.toLocaleString()} · valor ${marketValue.toLocaleString()}).`,
    ],
  };
}

export function sellPlayerInstantly(
  state: GameState,
  clubId: number,
  playerId: number,
  minBid: number
): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;

  let queued = state;
  let item = (queued.auctionQueue ?? []).find(
    (q) => q.playerId === playerId && q.sellerClubId === clubId
  );
  if (!item) {
    if (!canSellPlayer(state.players, clubId, playerId)) {
      return {
        ...state,
        messages: [
          ...state.messages,
          `Não é possível leiloar ${player.name} (plantel mínimo ou venda bloqueada).`,
        ],
      };
    }
    queued = appendAuctionQueueItem(state, clubId, playerId, minBid, "voluntary");
    item = (queued.auctionQueue ?? []).find(
      (q) => q.playerId === playerId && q.sellerClubId === clubId
    );
  }
  if (!item) return queued;

  const lot = queueItemToLot(queued, item, item.id);
  if (!lot) return queued;

  const session: AuctionSession = {
    round: queued.round,
    season: queued.season,
    lots: [lot],
    results: [],
    complete: false,
    actingManagerIndex: 0,
    pendingHumanBids: [],
    skipVotes: 0,
  };

  let next: GameState = {
    ...queued,
    auctionQueue: (queued.auctionQueue ?? []).filter((q) => q.id !== item.id),
    auctionSession: session,
    messages: [...queued.messages, `${lot.playerName} entrou em leilão imediato.`],
  };

  next = resolveAuctionLot(next, 0, null);

  const result = next.auctionSession?.results[0];
  if (result && result.sellerClubId === clubId) {
    next = {
      ...next,
      lastPlayerSale: {
        id: Date.now(),
        playerId: result.playerId,
        playerName: result.playerName,
        buyerClubId: result.winnerClubId,
        buyerClubName: result.winnerClubName,
        fee: result.winningBid,
        unsold: result.unsold,
      },
    };
  }

  return completeAuctionSession(next);
}

export function queueForcedAuction(
  state: GameState,
  playerId: number,
  sellerClubId: number,
  reason: Extract<AuctionLotReason, "raise_rejected" | "bankruptcy">,
  minBid?: number
): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;

  const marketValue = player.value;
  const clampedMin = clampMinBid(
    marketValue,
    minBid ?? Math.round(marketValue * 0.65)
  );

  const players = state.players.map((p) =>
    p.id === playerId
      ? {
          ...p,
          clubId: 0,
          raisePending: false,
          requestedSalary: null,
          contractRenewedThisSeason: false,
          saleBlockedThisSeason: false,
        }
      : p
  );

  const queue = state.auctionQueue ?? [];
  if (queue.some((q) => q.playerId === playerId)) {
    return { ...state, players };
  }

  const item: PlayerAuctionQueueItem = {
    id: state.nextAuctionLotId ?? 1,
    playerId,
    sellerClubId,
    minBid: clampedMin,
    marketValue,
    reason,
    listedRound: state.round,
    season: state.season,
  };

  const reasonLabel =
    reason === "bankruptcy" ? "inadimplência" : "renovação recusada";

  return {
    ...state,
    players,
    auctionQueue: [...queue, item],
    nextAuctionLotId: (state.nextAuctionLotId ?? 1) + 1,
    messages: [
      ...state.messages,
      `${player.name} vai ao leilão (${reasonLabel}). Mínimo: ${clampedMin.toLocaleString()}.`,
    ],
  };
}

function generateAiQueueListings(state: GameState, rng: () => number): PlayerAuctionQueueItem[] {
  const items: PlayerAuctionQueueItem[] = [];
  let nextId = state.nextAuctionLotId ?? 1;
  const existing = new Set((state.auctionQueue ?? []).map((q) => q.playerId));

  for (const club of [...state.clubs.filter((c) => !c.isHuman)].sort(
    () => rng() - 0.5
  )) {
    if (club.division === DISTRITAL_DIVISION) continue;
    if (rng() > 0.55) continue;

    const payroll = getClubPayroll(state.players, club.id);
    const squad = getPlayersByClub(state.players, club.id);
    if (squad.length <= MIN_SELLABLE_SQUAD()) continue;

    const shouldSell =
      club.finances < payroll * 1.5 ||
      club.finances < 300_000 ||
      (squad.length >= COMFORTABLE_SQUAD_SIZE && rng() < 0.45);

    if (!shouldSell) continue;

    const candidates = squad
      .filter((p) => canSellPlayer(state.players, club.id, p.id))
      .sort((a, b) => a.skill - b.skill);

    const target = candidates[0];
    if (!target || existing.has(target.id)) continue;

    const minBid = clampMinBid(
      target.value,
      Math.round(target.value * (randomInt(rng, 85, 105) / 100))
    );

    items.push({
      id: nextId++,
      playerId: target.id,
      sellerClubId: club.id,
      minBid,
      marketValue: target.value,
      reason: "ai_voluntary",
      listedRound: state.round,
      season: state.season,
    });
    existing.add(target.id);
  }

  return items;
}

function MIN_SELLABLE_SQUAD(): number {
  return 14;
}

function queueItemToLot(
  state: GameState,
  item: PlayerAuctionQueueItem,
  lotId: number
): AuctionLot | null {
  const player = state.players.find((p) => p.id === item.playerId);
  if (!player) return null;
  if (player.clubId !== 0 && player.clubId !== item.sellerClubId) return null;

  return {
    id: lotId,
    playerId: player.id,
    playerName: player.name,
    position: player.position,
    skill: player.skill,
    sellerClubId: item.sellerClubId,
    sellerClubName: clubName(state, item.sellerClubId),
    minBid: item.minBid,
    marketValue: item.marketValue,
    reason: item.reason,
  };
}

export function buildAuctionSession(
  state: GameState,
  playedRound: number
): GameState {
  const sanitizedQueue = sanitizeAuctionQueue(state);
  const baseState =
    sanitizedQueue.length === (state.auctionQueue ?? []).length
      ? state
      : { ...state, auctionQueue: sanitizedQueue };

  const rng = createRng(baseState.season * 12001 + playedRound * 43 + getGameSeed(baseState));
  const persistedQueue = filterCpuAuctionQueue(baseState, [
    ...(baseState.auctionQueue ?? []),
  ]);
  const aiItems = generateAiQueueListings(baseState, rng);
  const queue = shuffleInPlace([...persistedQueue, ...aiItems], rng);

  const targetCount = randomInt(rng, AUCTION_MIN_LOTS, AUCTION_MAX_LOTS);
  const sellerCounts = new Map<number, number>();
  let lotId = baseState.nextAuctionLotId ?? 1;

  const picked = pickQueueLotsWithSellerCap(
    baseState,
    queue,
    targetCount,
    rng,
    lotId,
    sellerCounts
  );
  let lots = picked.lots;
  lotId = picked.nextLotId;

  if (lots.length < AUCTION_MIN_LOTS) {
    lotId = appendFallbackLots(
      baseState,
      lots,
      picked.usedPlayerIds,
      sellerCounts,
      Math.max(targetCount, AUCTION_MIN_LOTS),
      rng,
      lotId
    );
  }

  lots = spreadLotsBySeller(lots, rng);
  lots = lots.slice(0, AUCTION_MAX_LOTS);
  const usedPlayerIdsInLots = new Set(lots.map((l) => l.playerId));
  const remainingQueue = (baseState.auctionQueue ?? []).filter(
    (q) => !usedPlayerIdsInLots.has(q.playerId)
  );

  if (lots.length === 0) {
    return {
      ...baseState,
      auctionQueue: remainingQueue,
      nextAuctionLotId: lotId,
    };
  }

  const session: AuctionSession = {
    round: playedRound,
    season: baseState.season,
    lots,
    results: [],
    complete: false,
    actingManagerIndex: 0,
    pendingHumanBids: [],
    skipVotes: 0,
  };

  let next: GameState = {
    ...baseState,
    auctionQueue: remainingQueue,
    auctionSession: session,
    nextAuctionLotId: lotId,
    messages: [
      ...baseState.messages,
      `Leilão aberto (rod. ${playedRound}): ${lots.length} jogadores.`,
    ],
  };

  if (isLocalAuctionPlay(baseState)) {
    next = resetLocalManagerTurn(next);
    next = syncLocalManagerView(next, 0);
  }

  return next;
}

export function maybeStartAuctionAfterRound(
  state: GameState,
  playedRound: number
): GameState {
  if (state.phase !== "regular") return state;
  if (playedRound % AUCTION_INTERVAL !== 0) return state;
  if (state.auctionSession && !state.auctionSession.complete) return state;

  return buildAuctionSession(state, playedRound);
}

interface BidEntry {
  clubId: number;
  amount: number;
}

function isLocalAuctionPlay(state: GameState): boolean {
  return state.localManagers.length > 1;
}

export function submitAuctionHumanBid(
  state: GameState,
  lotIndex: number,
  humanBid: number | null,
  bidderClubId?: number
): GameState {
  const session = state.auctionSession;
  if (!session || session.complete) return state;
  if (lotIndex < 0 || lotIndex >= session.lots.length) return state;
  if (session.results.length !== lotIndex) return state;

  const isLocal = isLocalAuctionPlay(state);
  if (!isLocal) {
    return resolveAuctionLot(state, lotIndex, humanBid, bidderClubId);
  }

  const lot = session.lots[lotIndex]!;
  const sellerClubId = lot.sellerClubId;
  const actingIndex = session.actingManagerIndex;
  const actingClub = state.localManagers[actingIndex]?.clubId;
  const humanBidderId = bidderClubId ?? actingClub ?? state.humanClubId;
  if (actingClub != null && humanBidderId !== actingClub) return state;
  if (humanBidderId === sellerClubId && humanBid != null) return state;
  if (session.pendingHumanBids.some((b) => b.clubId === humanBidderId)) {
    return state;
  }

  const bidAmount = humanBidderId === sellerClubId ? null : humanBid;
  const pendingHumanBids: AuctionHumanBid[] = [
    ...session.pendingHumanBids,
    { clubId: humanBidderId, amount: bidAmount },
  ];

  const managerCount = state.localManagers.length;
  if (pendingHumanBids.length < managerCount) {
    const nextIndex = actingIndex + 1;
    return syncLocalManagerView(
      {
        ...state,
        auctionSession: {
          ...session,
          pendingHumanBids,
          actingManagerIndex: nextIndex,
          skipVotes: 0,
        },
      },
      nextIndex
    );
  }

  return resolveAuctionLot(state, lotIndex, null, undefined, {
    pendingHumanBids,
  });
}

export function submitAuctionSkipVote(state: GameState): GameState {
  return skipRemainingAuctionLots(state);
}

export function resolveAuctionLot(
  state: GameState,
  lotIndex: number,
  humanBid: number | null,
  bidderClubId?: number,
  options: {
    allowDiscountOnNoBid?: boolean;
    pendingHumanBids?: AuctionHumanBid[];
  } = {}
): GameState {
  const session = state.auctionSession;
  if (!session || session.complete) return state;
  if (lotIndex < 0 || lotIndex >= session.lots.length) return state;
  if (session.results.length !== lotIndex) return state;

  const lot = session.lots[lotIndex]!;
  const player = state.players.find((p) => p.id === lot.playerId);
  if (!player) return advanceSession(state, lot, null, 0);
  const effectiveMinBid = lot.minBid;

  const rng = createRng(
    state.season * 7000 +
      session.round * 100 +
      lot.id * 17 +
      session.results.length +
      getGameSeed(state)
  );

  const bids: BidEntry[] = [];
  const humanClubIds = new Set(state.localManagers.map((m) => m.clubId));
  const pendingBids = options.pendingHumanBids ?? [];

  if (pendingBids.length > 0) {
    for (const entry of pendingBids) {
      const humanBidderId = entry.clubId;
      const humanClub = state.clubs.find((c) => c.id === humanBidderId);
      if (!humanClub) continue;
      if (
        entry.amount != null &&
        entry.amount >= effectiveMinBid &&
        entry.amount <= humanClub.finances &&
        lot.sellerClubId !== humanBidderId &&
        player.clubId !== humanBidderId &&
        getPlayersByClub(state.players, humanBidderId).length < MAX_SQUAD_SIZE &&
        !humanClubIds.has(player.clubId)
      ) {
        bids.push({ clubId: humanBidderId, amount: Math.round(entry.amount) });
      }
    }
  } else {
    const humanBidderId =
      bidderClubId ?? state.auctionBidderClubId ?? state.humanClubId;
    const humanClub = state.clubs.find((c) => c.id === humanBidderId)!;

    if (
      humanBid != null &&
      humanBid >= effectiveMinBid &&
      humanBid <= humanClub.finances &&
      lot.sellerClubId !== humanBidderId &&
      player.clubId !== humanBidderId &&
      getPlayersByClub(state.players, humanBidderId).length < MAX_SQUAD_SIZE &&
      !humanClubIds.has(player.clubId)
    ) {
      bids.push({ clubId: humanBidderId, amount: Math.round(humanBid) });
    }
  }

  for (const club of state.clubs) {
    if (club.id === lot.sellerClubId) continue;
    if (!isCpuBuyerClub(club)) continue;
    if (bids.some((b) => b.clubId === club.id)) continue;

    const budget = computeClubAuctionBudget(state, club);
    const bid = computeCpuBid(
      club,
      player,
      { ...lot, minBid: effectiveMinBid },
      state,
      budget,
      rng
    );
    if (bid >= effectiveMinBid) {
      bids.push({ clubId: club.id, amount: bid });
    }
  }

  if (bids.length === 0) {
    const fallbackCandidates = state.clubs
      .filter((club) => {
        if (!isCpuBuyerClub(club)) return false;
        if (club.id === lot.sellerClubId) return false;
        if (player.clubId === club.id) return false;
        if (getPlayersByClub(state.players, club.id).length >= MAX_SQUAD_SIZE)
          return false;
        return club.finances >= effectiveMinBid;
      })
      .sort((a, b) => {
        if (b.finances !== a.finances) return b.finances - a.finances;
        return a.id - b.id;
      });

    const fallback = fallbackCandidates[0];
    if (fallback && rng() < 0.72) {
      const extra = randomInt(
        rng,
        0,
        Math.max(1, Math.round(effectiveMinBid * 0.06))
      );
      return applyAuctionWinner(state, lot, fallback.id, effectiveMinBid + extra);
    }

    if (options.allowDiscountOnNoBid) {
      const discountedMinBid = Math.max(
        1,
        Math.round(
          Math.min(
            effectiveMinBid * 0.8,
            Math.max(lot.marketValue * 0.62, effectiveMinBid * 0.5)
          )
        )
      );
      const discountCandidates = state.clubs
        .filter((club) => {
          if (!isCpuBuyerClub(club)) return false;
          if (club.id === lot.sellerClubId) return false;
          if (player.clubId === club.id) return false;
          if (getPlayersByClub(state.players, club.id).length >= MAX_SQUAD_SIZE)
            return false;
          return club.finances >= discountedMinBid;
        })
        .sort((a, b) => b.finances - a.finances || a.id - b.id);
      const forcedBuyer = discountCandidates[0];
      if (forcedBuyer) {
        const extra = randomInt(
          rng,
          0,
          Math.max(1, Math.round(discountedMinBid * 0.05))
        );
        return applyAuctionWinner(
          state,
          lot,
          forcedBuyer.id,
          discountedMinBid + extra
        );
      }
    }

    return advanceSession(state, lot, null, 0);
  }

  bids.sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.clubId - b.clubId;
  });

  const winner = bids[0]!;
  return applyAuctionWinner(state, lot, winner.clubId, winner.amount);
}

function applyAuctionWinner(
  state: GameState,
  lot: AuctionLot,
  winnerClubId: number,
  winningBid: number
): GameState {
  const player = state.players.find((p) => p.id === lot.playerId);
  if (!player) return state;

  const winner = state.clubs.find((c) => c.id === winnerClubId);
  if (!winner || winningBid < lot.minBid) {
    return advanceSession(state, lot, null, 0);
  }
  if (winner.finances < winningBid) {
    return advanceSession(state, lot, null, 0);
  }

  const players = state.players.map((p) =>
    p.id === lot.playerId
      ? applyPlayerTransferFields(p, winnerClubId, state.round)
      : p
  );

  const clubs = state.clubs.map((c) => {
    if (c.id === winnerClubId) {
      return { ...c, finances: c.finances - winningBid };
    }
    if (c.id === lot.sellerClubId) {
      return { ...c, finances: c.finances + winningBid };
    }
    return c;
  });

  const next: GameState = {
    ...state,
    players,
    clubs,
    lineupPlayerIds: state.lineupPlayerIds.filter((id) => id !== lot.playerId),
    benchPlayerIds: state.benchPlayerIds.filter((id) => id !== lot.playerId),
  };

  return advanceSession(next, lot, winnerClubId, winningBid);
}

function advanceSession(
  state: GameState,
  lot: AuctionLot,
  winnerClubId: number | null,
  winningBid: number
): GameState {
  const session = state.auctionSession!;
  const unsold = winnerClubId == null;
  const result: AuctionLotResult = {
    lotId: lot.id,
    playerId: lot.playerId,
    playerName: lot.playerName,
    sellerClubId: lot.sellerClubId,
    sellerClubName: lot.sellerClubName,
    winnerClubId,
    winnerClubName: winnerClubId ? clubName(state, winnerClubId) : null,
    winningBid,
    unsold,
  };

  const results = [...session.results, result];
  const complete = results.length >= session.lots.length;

  const msg = unsold
    ? `${lot.playerName}: sem lances válidos (mín. ${lot.minBid.toLocaleString()}).`
    : `${lot.playerName} → ${result.winnerClubName} por ${winningBid.toLocaleString()}.`;

  let next: GameState = {
    ...state,
    auctionSession: {
      ...session,
      results,
      complete,
      pendingHumanBids: [],
      actingManagerIndex: 0,
      skipVotes: 0,
    },
    messages: [...state.messages, msg],
  };

  if (isLocalAuctionPlay(state)) {
    next = syncLocalManagerView(next, 0);
  }

  return next;
}

export function skipRemainingAuctionLots(state: GameState): GameState {
  let current = state;
  while (current.auctionSession && !current.auctionSession.complete) {
    const idx = current.auctionSession.results.length;
    current = resolveAuctionLot(current, idx, null);
  }
  return current;
}

export function completeAuctionSession(state: GameState): GameState {
  if (!state.auctionSession) return state;

  return {
    ...state,
    auctionSession: null,
    messages: [
      ...state.messages,
      `Leilão da rodada ${state.auctionSession.round} encerrado.`,
    ],
  };
}

export function updateAuctionQueueMinBid(
  state: GameState,
  playerId: number,
  minBid: number
): GameState {
  const queue = state.auctionQueue ?? [];
  const item = queue.find(
    (q) => q.playerId === playerId && q.sellerClubId === state.humanClubId
  );
  if (!item) return state;

  return {
    ...state,
    auctionQueue: queue.map((q) =>
      q.id === item.id
        ? { ...q, minBid: clampMinBid(q.marketValue, minBid) }
        : q
    ),
  };
}

export function removeFromAuctionQueue(
  state: GameState,
  playerId: number,
  clubId: number
): GameState {
  return {
    ...state,
    auctionQueue: (state.auctionQueue ?? []).filter(
      (q) => !(q.playerId === playerId && q.sellerClubId === clubId)
    ),
  };
}

export function getHumanQueuedListing(
  state: GameState,
  playerId: number
): PlayerAuctionQueueItem | undefined {
  return (state.auctionQueue ?? []).find(
    (q) => q.playerId === playerId && q.sellerClubId === state.humanClubId
  );
}
