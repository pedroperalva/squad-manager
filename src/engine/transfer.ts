import type { GameState, Player, TransferOffer } from "@/engine/types";
import { MAX_SQUAD_SIZE, getGameSeed } from "@/engine/types";
import { calculatePlayerValue, getPlayersByClub } from "@/engine/player";
import { canSellPlayer } from "@/engine/squad";
import { createRng, randomInt } from "@/data/name-generator";
import { shuffledCopy } from "@/engine/rng";

export function generateTransferOffers(
  state: GameState,
  seed: number
): TransferOffer[] {
  const rng = createRng(seed + state.season * 999 + getGameSeed(state));
  const offers: TransferOffer[] = [];
  let id = 1;
  const humanClub = state.clubs.find((c) => c.id === state.humanClubId)!;

  const buyers = shuffledCopy(
    state.clubs.filter(
      (c) =>
        c.id !== state.humanClubId &&
        c.division <= humanClub.division &&
        c.finances > 500_000
    ),
    rng
  ).slice(0, 5);

  const humanPlayers = state.players
    .filter((p) => p.clubId === state.humanClubId)
    .sort((a, b) => b.skill - a.skill);

  for (const buyer of buyers) {
    const target = humanPlayers[randomInt(rng, 0, Math.min(4, humanPlayers.length - 1))];
    if (!target) continue;
    if (!canSellPlayer(state.players, state.humanClubId, target.id)) continue;

    const fee = Math.round(target.value * randomInt(rng, 8, 15) / 10);
    if (fee > buyer.finances) continue;

    offers.push({
      id: id++,
      playerId: target.id,
      playerName: target.name,
      fromClubId: state.humanClubId,
      toClubId: buyer.id,
      toClubName: buyer.name,
      fee,
      accepted: null,
    });
  }

  return offers;
}

export function generateIncomingOffers(
  state: GameState,
  seed: number
): TransferOffer[] {
  const rng = createRng(seed + 777);
  const offers: TransferOffer[] = [];
  let id = 1000;
  const humanClub = state.clubs.find((c) => c.id === state.humanClubId)!;

  if (humanClub.finances < 200_000) return offers;

  const sellers = state.clubs
    .filter((c) => c.id !== state.humanClubId)
    .sort(() => rng() - 0.5)
    .slice(0, 8);

  for (const seller of sellers) {
    const squad = state.players.filter((p) => p.clubId === seller.id);
    const target = squad[randomInt(rng, 0, squad.length - 1)];
    if (!target) continue;

    const fee = Math.round(target.value * 1.1);
    if (fee > humanClub.finances * 0.4) continue;

    offers.push({
      id: id++,
      playerId: target.id,
      playerName: target.name,
      fromClubId: seller.id,
      toClubId: state.humanClubId,
      toClubName: humanClub.name,
      fee,
      accepted: null,
    });
  }

  return offers.slice(0, 5);
}

export function acceptTransfer(
  state: GameState,
  offerId: number
): GameState {
  const offer = state.transferOffers.find((o) => o.id === offerId);
  if (!offer || offer.accepted !== null) return state;

  const player = state.players.find((p) => p.id === offer.playerId);
  if (!player) return state;

  if (
    offer.fromClubId === state.humanClubId &&
    !canSellPlayer(state.players, state.humanClubId, offer.playerId)
  ) {
    return {
      ...state,
      messages: [
        ...state.messages,
        `Venda de ${player.name} bloqueada: plantel no limite minimo.`,
      ],
    };
  }

  const fromClub = state.clubs.find((c) => c.id === offer.fromClubId)!;
  const toClub = state.clubs.find((c) => c.id === offer.toClubId)!;

  if (toClub.finances < offer.fee) return state;

  player.clubId = toClub.id;
  player.contractRenewedThisSeason = true;
  player.saleBlockedThisSeason = true;
  player.raisePending = false;
  player.requestedSalary = null;
  player.registrationMatches = TRANSFER_REGISTRATION_MATCHES;
  player.skillDriftAllowedAfterRound = state.round;
  toClub.finances -= offer.fee;
  fromClub.finances += offer.fee;

  offer.accepted = true;

  const isHumanSale = offer.fromClubId === state.humanClubId;

  return {
    ...state,
    transferOffers: state.transferOffers.map((o) =>
      o.id === offerId ? { ...o, accepted: true } : o
    ),
    lineupPlayerIds: state.lineupPlayerIds.filter((id) => id !== player.id),
    benchPlayerIds: state.benchPlayerIds.filter((id) => id !== player.id),
    lastPlayerSale: isHumanSale
      ? {
          id: Date.now(),
          playerId: player.id,
          playerName: player.name,
          buyerClubId: toClub.id,
          buyerClubName: toClub.name,
          fee: offer.fee,
          unsold: false,
        }
      : state.lastPlayerSale ?? null,
    messages: [
      ...state.messages,
      `${player.name} transferido para ${toClub.name} por ${offer.fee.toLocaleString()}.`,
    ],
  };
}

export function rejectTransfer(state: GameState, offerId: number): GameState {
  return {
    ...state,
    transferOffers: state.transferOffers.map((o) =>
      o.id === offerId ? { ...o, accepted: false } : o
    ),
  };
}

export function runAiTransfers(state: GameState, seed: number): GameState {
  const rng = createRng(seed + getGameSeed(state));
  const messages: string[] = [];

  const aiClubs = state.clubs.filter((c) => !c.isHuman && c.finances > 1_000_000);
  for (const club of aiClubs.slice(0, 3)) {
    const squad = state.players.filter((p) => p.clubId === club.id);
    if (squad.length >= MAX_SQUAD_SIZE) continue;

    const freeAgents = state.players.filter(
      (p) =>
        p.clubId !== club.id &&
        p.clubId !== state.humanClubId &&
        p.skill <= 35
    );
    if (freeAgents.length === 0) continue;

    const target = freeAgents[randomInt(rng, 0, freeAgents.length - 1)];
    const fee = Math.round(target.value * 0.9);
    if (club.finances < fee) continue;

    const oldClub = state.clubs.find((c) => c.id === target.clubId)!;
    target.clubId = club.id;
    target.contractRenewedThisSeason = true;
    target.saleBlockedThisSeason = true;
    target.raisePending = false;
    target.requestedSalary = null;
    target.registrationMatches = TRANSFER_REGISTRATION_MATCHES;
    target.skillDriftAllowedAfterRound = state.round;
    club.finances -= fee;
    oldClub.finances += fee;
    messages.push(`${club.name} contratou ${target.name}.`);
  }

  return { ...state, messages: [...state.messages, ...messages] };
}

export function getPlayerBuyPrice(player: Player): number {
  return Math.round(player.value * 1.1);
}

export const TRANSFER_REGISTRATION_MATCHES = 1;

export function applyPlayerTransferFields(
  player: Player,
  newClubId: number,
  purchaseRound: number
): Player {
  return {
    ...player,
    clubId: newClubId,
    contractRenewedThisSeason: true,
    saleBlockedThisSeason: true,
    raisePending: false,
    requestedSalary: null,
    registrationMatches: TRANSFER_REGISTRATION_MATCHES,
    skillDriftAllowedAfterRound: purchaseRound,
  };
}

export function buyPlayer(state: GameState, playerId: number): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.clubId === state.humanClubId || player.clubId <= 0) return state;

  const humanClubId = state.humanClubId;
  const sellerClubId = player.clubId;
  const humanClub = state.clubs.find((c) => c.id === humanClubId)!;
  const sellerClub = state.clubs.find((c) => c.id === sellerClubId)!;
  const humanClubIds = new Set(state.localManagers.map((m) => m.clubId));
  const fee = getPlayerBuyPrice(player);

  if (humanClubIds.has(sellerClubId)) {
    return {
      ...state,
      messages: [
        ...state.messages,
        `Compra direta bloqueada: ${player.name} pertence a outro jogador local.`,
      ],
    };
  }

  if (humanClub.finances < fee) {
    return {
      ...state,
      messages: [
        ...state.messages,
        `Saldo insuficiente para contratar ${player.name} (${fee.toLocaleString()}).`,
      ],
    };
  }

  if (getPlayersByClub(state.players, humanClubId).length >= MAX_SQUAD_SIZE) {
    return {
      ...state,
      messages: [
        ...state.messages,
        `Plantel cheio (máx. ${MAX_SQUAD_SIZE}). Venda ou libere um jogador antes de contratar ${player.name}.`,
      ],
    };
  }

  if (!canSellPlayer(state.players, sellerClubId, playerId)) {
    return {
      ...state,
      messages: [
        ...state.messages,
        `${sellerClub.name} não pode vender ${player.name} (plantel mínimo).`,
      ],
    };
  }

  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId
        ? applyPlayerTransferFields(p, humanClubId, state.round)
        : p
    ),
    clubs: state.clubs.map((c) => {
      if (c.id === humanClubId) {
        return { ...c, finances: c.finances - fee };
      }
      if (c.id === sellerClubId) {
        return { ...c, finances: c.finances + fee };
      }
      return c;
    }),
    lineupPlayerIds: state.lineupPlayerIds.filter((id) => id !== playerId),
    benchPlayerIds: state.benchPlayerIds.filter((id) => id !== playerId),
    messages: [
      ...state.messages,
      `${player.name} contratado por ${fee.toLocaleString()}. Aguarda inscrição (CON) — estreia após a próxima partida do clube.`,
    ],
  };
}

export function refreshPlayerValues(players: Player[]): void {
  for (const p of players) {
    p.value = calculatePlayerValue(p.skill, p.aggressiveness, p.isStar);
  }
}
