import type { GameState } from "@/engine/types";
import {
  DISTRITAL_DIVISION,
  formatDivisionLabel,
  getGameSeed,
} from "@/engine/types";
import { applyRelegationMoralePenalty } from "@/engine/club";
import {
  applySeasonPrizes,
  processPromotionRelegation,
} from "@/engine/league";
import { evaluateEndOfSeasonCoach } from "@/engine/coach";
import { refreshPlayerValues } from "@/engine/transfer";
import { autoRenewAllContracts } from "@/engine/finances";
import { createRng } from "@/data/name-generator";

export function processLeagueSeasonClose(state: GameState): GameState {
  if (state.leagueSeasonProcessed) return state;

  const rng = createRng(state.season * 7777 + getGameSeed(state));

  let updated: GameState = { ...state, clubs: state.clubs.map((c) => ({ ...c })) };

  const promoResult = processPromotionRelegation(
    updated.clubs,
    updated.standings,
    rng
  );

  const wasPromoted = promoResult.promoted.some(
    (p) => p.clubId === state.humanClubId
  );
  const wasRelegated = promoResult.relegated.some(
    (p) => p.clubId === state.humanClubId
  );

  for (const relegate of promoResult.relegated) {
    if (relegate.to === DISTRITAL_DIVISION) continue;
    const club = updated.clubs.find((c) => c.id === relegate.clubId);
    if (club) applyRelegationMoralePenalty(club);
  }

  refreshPlayerValues(updated.players);

  updated = evaluateEndOfSeasonCoach(
    updated,
    wasPromoted,
    wasRelegated,
    state.season
  );

  updated = autoRenewAllContracts(updated);

  const divisionChangeMessage = (
    clubName: string,
    from: number,
    to: number,
    promoted: boolean
  ) => {
    if (promoted && from === 5 && to === 4) {
      return `${clubName} subiu do distrital para a 4ª divisão.`;
    }
    if (!promoted && to === 5) {
      return `${clubName} desceu para o distrital.`;
    }
    const verb = promoted ? "subiu" : "desceu";
    return `${clubName} ${verb} para a ${formatDivisionLabel(to)} divisão.`;
  };

  return {
    ...updated,
    transferOffers: [],
    leagueSeasonProcessed: true,
    messages: [
      ...updated.messages,
      ...promoResult.promoted.map((p) =>
        divisionChangeMessage(
          updated.clubs.find((c) => c.id === p.clubId)?.name ?? "?",
          p.from,
          p.to,
          true
        )
      ),
      ...promoResult.relegated.map((p) =>
        divisionChangeMessage(
          updated.clubs.find((c) => c.id === p.clubId)?.name ?? "?",
          p.from,
          p.to,
          false
        )
      ),
    ],
  };
}

export function finalizeSeasonAfterCup(state: GameState): GameState {
  const updated = applySeasonPrizes(state);
  return {
    ...updated,
    phase: "ended",
  };
}

export function processEndOfSeason(state: GameState): GameState {
  let updated = state;
  if (!updated.leagueSeasonProcessed) {
    updated = processLeagueSeasonClose(updated);
  }
  return finalizeSeasonAfterCup(updated);
}
