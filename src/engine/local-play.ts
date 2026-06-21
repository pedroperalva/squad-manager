import type { GameState } from "@/engine/types";

export function getHumanClubIds(state: GameState): number[] {
  if (state.isLocalMultiplayer && state.localManagers.length > 0) {
    return state.localManagers.map((m) => m.clubId);
  }
  return [state.humanClubId];
}

export function isHumanManagedClub(state: GameState, clubId: number): boolean {
  return getHumanClubIds(state).includes(clubId);
}

export function fixtureHasHumanClub(
  state: GameState,
  homeClubId: number,
  awayClubId: number
): boolean {
  const ids = new Set(getHumanClubIds(state));
  return ids.has(homeClubId) || ids.has(awayClubId);
}

export function advanceLocalManagerTurn(state: GameState): {
  state: GameState;
  allConfigured: boolean;
} {
  if (!state.isLocalMultiplayer || state.localManagers.length <= 1) {
    return { state, allConfigured: true };
  }

  const currentIndex = state.activeManagerIndex;
  if (currentIndex >= state.localManagers.length - 1) {
    return { state, allConfigured: true };
  }

  const nextIndex = currentIndex + 1;
  const next = state.localManagers[nextIndex]!;
  return {
    state: {
      ...state,
      activeManagerIndex: nextIndex,
      humanClubId: next.clubId,
      lineupPlayerIds: [],
      benchPlayerIds: [],
      humanFormation: null,
      auctionBidderClubId: next.clubId,
      coach: {
        ...state.coach,
        coachId:
          state.clubs.find((c) => c.id === next.clubId)?.coachId ??
          state.coach.coachId,
        name: next.name,
        currentClubId: next.clubId,
      },
      messages: [
        ...state.messages,
        `Vez de ${next.name} (${state.clubs.find((c) => c.id === next.clubId)?.name ?? "?"}).`,
      ],
    },
    allConfigured: false,
  };
}

export function syncLocalManagerView(
  state: GameState,
  managerIndex: number
): GameState {
  if (!state.isLocalMultiplayer || state.localManagers.length <= 1) {
    return state;
  }
  const manager = state.localManagers[managerIndex];
  if (!manager) return state;
  return {
    ...state,
    activeManagerIndex: managerIndex,
    humanClubId: manager.clubId,
    auctionBidderClubId: manager.clubId,
    coach: {
      ...state.coach,
      coachId:
        state.clubs.find((c) => c.id === manager.clubId)?.coachId ??
        state.coach.coachId,
      name: manager.name,
      currentClubId: manager.clubId,
    },
  };
}

export function resetLocalManagerTurn(state: GameState): GameState {
  const localManagers = state.localManagers.map((m) => ({
    ...m,
    lineupPlayerIds: [],
    benchPlayerIds: [],
    formation: null,
    ready: false,
  }));

  if (!state.isLocalMultiplayer || state.localManagers.length <= 1) {
    return { ...state, localManagers };
  }

  const first = localManagers[0]!;
  return {
    ...state,
    localManagers,
    activeManagerIndex: 0,
    humanClubId: first.clubId,
    lineupPlayerIds: [],
    benchPlayerIds: [],
    humanFormation: null,
    auctionBidderClubId: first.clubId,
    coach: {
      ...state.coach,
      coachId:
        state.clubs.find((c) => c.id === first.clubId)?.coachId ??
        state.coach.coachId,
      name: first.name,
      currentClubId: first.clubId,
    },
  };
}
