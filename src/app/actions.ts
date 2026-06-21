"use server";

import type { CountryCode, Formation, GameState, LiveMatchPlan } from "@/engine/types";
import {
  createNewGame,
  processEndOfSeason,
  finalizeSeasonAfterCup,
  simulateRound,
  startNextSeason,
  setFormation,
  setSquad,
  acceptCoachOffer,
  rejectCoachOffer,
  acceptTransfer,
  rejectTransfer,
  setLineup,
  finalizeLiveRound,
  finalizeLiveCupRound,
  buyPlayer,
  acceptPlayerRaise,
  rejectPlayerRaise,
  requestClubLoan,
  repayClubLoan,
  expandHumanStadium,
  listPlayerOnAuctionQueue,
  removeFromAuctionQueue,
  updateAuctionQueueMinBid,
  submitAuctionHumanBid,
  submitAuctionSkipVote,
  completeAuctionSession,
  sellPlayerInstantly,
  markActiveManagerReady,
  advanceLocalManagerTurn,
} from "@/engine/index";
import {
  saveGame,
  loadGame,
  listSaves,
  deleteSave,
  loadSaveOrThrow,
  trimGameStateMessages,
} from "@/db/save";

function persistGame(state: GameState): GameState {
  const trimmed = trimGameStateMessages(state);
  saveGame(trimmed);
  return trimmed;
}

function withSavedGame(
  saveId: string,
  mutate: (state: GameState) => GameState
): GameState {
  const state = loadSaveOrThrow(saveId);
  return persistGame(mutate(state));
}

export async function actionCreateGame(
  countries: CountryCode[],
  coachNameOrPlayers: string | string[],
  clubSlug?: string
): Promise<GameState> {
  const state = createNewGame(countries, coachNameOrPlayers, clubSlug);
  return persistGame(state);
}

export async function actionMarkManagerReady(saveId: string): Promise<GameState> {
  return withSavedGame(saveId, markActiveManagerReady);
}

export async function actionConfirmManagerLineup(
  saveId: string,
  lineupIds: number[],
  benchIds: number[]
): Promise<{ state: GameState; startRound: boolean }> {
  const state = loadSaveOrThrow(saveId);
  let updated = setSquad(state, lineupIds, benchIds);
  const result = advanceLocalManagerTurn(updated);
  updated = persistGame(result.state);
  return { state: updated, startRound: result.allConfigured };
}

export async function actionLoadGame(id: string): Promise<GameState | null> {
  return loadGame(id);
}

export async function actionListSaves() {
  return listSaves();
}

export async function actionDeleteSave(id: string): Promise<void> {
  deleteSave(id);
}

export async function actionCompleteLiveRound(
  saveId: string,
  matchPlans: LiveMatchPlan[],
  lineupIds: number[],
  benchIds: number[]
): Promise<GameState> {
  return withSavedGame(saveId, (state) => {
    let updated = setLineup(state, lineupIds, benchIds);
    updated = finalizeLiveRound(updated, matchPlans);
    if (updated.phase === "ended") {
      updated = finalizeSeasonAfterCup(updated);
    }
    return updated;
  });
}

export async function actionSetSquad(
  saveId: string,
  lineupIds: number[],
  benchIds: number[]
): Promise<GameState> {
  return withSavedGame(saveId, (state) => setSquad(state, lineupIds, benchIds));
}

export async function actionCompleteCupLiveRound(
  saveId: string,
  matchPlans: LiveMatchPlan[],
  lineupIds: number[],
  benchIds: number[]
): Promise<GameState> {
  return withSavedGame(saveId, (state) => {
    let updated = setLineup(state, lineupIds, benchIds);
    updated = finalizeLiveCupRound(updated, matchPlans);
    if (updated.phase === "ended") {
      updated = finalizeSeasonAfterCup(updated);
    }
    return updated;
  });
}

export async function actionSimulateRound(saveId: string): Promise<GameState> {
  return withSavedGame(saveId, (state) => {
    let updated = simulateRound(state);
    if (updated.phase === "ended") {
      updated = finalizeSeasonAfterCup(updated);
    }
    return updated;
  });
}

export async function actionEndSeason(saveId: string): Promise<GameState> {
  return withSavedGame(saveId, processEndOfSeason);
}

export async function actionStartNextSeason(saveId: string): Promise<GameState> {
  return withSavedGame(saveId, startNextSeason);
}

export async function actionSetFormation(
  saveId: string,
  formation: Formation
): Promise<GameState> {
  return withSavedGame(saveId, (state) => setFormation(state, formation));
}

export async function actionAcceptCoachOffer(
  saveId: string,
  offerId: number
): Promise<GameState> {
  return withSavedGame(saveId, (state) => {
    const wasSeasonEnded = state.phase === "ended";
    const hadOffer = state.coach.offers.some((offer) => offer.id === offerId);
    let updated = acceptCoachOffer(state, offerId);
    const accepted =
      hadOffer &&
      updated.coach.currentClubId != null &&
      updated.coach.offers.every((offer) => offer.id !== offerId);
    if (wasSeasonEnded && accepted) {
      updated = startNextSeason(updated);
    }
    return updated;
  });
}

export async function actionRejectCoachOffer(
  saveId: string,
  offerId: number
): Promise<GameState> {
  return withSavedGame(saveId, (state) => rejectCoachOffer(state, offerId));
}

export async function actionAcceptTransfer(
  saveId: string,
  offerId: number
): Promise<GameState> {
  return withSavedGame(saveId, (state) => acceptTransfer(state, offerId));
}

export async function actionRejectTransfer(
  saveId: string,
  offerId: number
): Promise<GameState> {
  return withSavedGame(saveId, (state) => rejectTransfer(state, offerId));
}

export async function actionBuyPlayer(
  saveId: string,
  playerId: number
): Promise<GameState> {
  return withSavedGame(saveId, (state) => buyPlayer(state, playerId));
}

export async function actionRequestLoan(
  saveId: string,
  amount: number
): Promise<GameState> {
  return withSavedGame(saveId, (state) => requestClubLoan(state, amount));
}

export async function actionRepayLoan(
  saveId: string,
  amount: number
): Promise<GameState> {
  return withSavedGame(saveId, (state) => repayClubLoan(state, amount));
}

export async function actionExpandStadium(
  saveId: string,
  steps = 1
): Promise<GameState> {
  return withSavedGame(saveId, (state) => expandHumanStadium(state, steps));
}

export async function actionAcceptPlayerRaise(
  saveId: string,
  playerId: number
): Promise<GameState> {
  return withSavedGame(saveId, (state) => acceptPlayerRaise(state, playerId));
}

export async function actionRejectPlayerRaise(
  saveId: string,
  playerId: number
): Promise<GameState> {
  return withSavedGame(saveId, (state) => rejectPlayerRaise(state, playerId));
}

export async function actionListPlayerForAuction(
  saveId: string,
  playerId: number,
  minBid: number
): Promise<GameState> {
  return withSavedGame(saveId, (state) =>
    listPlayerOnAuctionQueue(state, state.humanClubId, playerId, minBid)
  );
}

export async function actionSellPlayerNow(
  saveId: string,
  playerId: number,
  minBid: number
): Promise<GameState> {
  return withSavedGame(saveId, (state) =>
    sellPlayerInstantly(state, state.humanClubId, playerId, minBid)
  );
}

export async function actionUpdateAuctionMinBid(
  saveId: string,
  playerId: number,
  minBid: number
): Promise<GameState> {
  return withSavedGame(saveId, (state) =>
    updateAuctionQueueMinBid(state, playerId, minBid)
  );
}

export async function actionCancelAuctionListing(
  saveId: string,
  playerId: number
): Promise<GameState> {
  return withSavedGame(saveId, (state) =>
    removeFromAuctionQueue(state, playerId, state.humanClubId)
  );
}

export async function actionResolveAuctionLot(
  saveId: string,
  lotIndex: number,
  humanBid: number | null,
  bidderClubId?: number
): Promise<GameState> {
  return withSavedGame(saveId, (state) =>
    submitAuctionHumanBid(state, lotIndex, humanBid, bidderClubId)
  );
}

export async function actionSkipRemainingAuctionLots(
  saveId: string
): Promise<GameState> {
  return withSavedGame(saveId, submitAuctionSkipVote);
}

export async function actionCompleteAuctionSession(
  saveId: string
): Promise<GameState> {
  return withSavedGame(saveId, completeAuctionSession);
}

export async function actionPersist(saveId: string): Promise<void> {
  const state = loadSaveOrThrow(saveId);
  saveGame(state);
}
