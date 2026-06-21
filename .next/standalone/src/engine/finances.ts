import type { Club, ClubLoan, Fixture, GameState, Player, Standing } from "@/engine/types";
import { DISTRITAL_DIVISION, getGameSeed } from "@/engine/types";
import { getStandingPosition } from "@/engine/club";
import { applyDivisionSkillDrift, getPlayersByClub } from "@/engine/player";
import { canSellPlayer } from "@/engine/squad";
import { createRng } from "@/data/name-generator";
import {
  maybeStartAuctionAfterRound,
  queueForcedAuction,
  sellPlayerInstantly,
} from "@/engine/auction";
import { isStarEligiblePosition, STAR_SALARY_MULTIPLIER } from "@/engine/stars";

export const PAYROLL_INTERVAL = 1;
export const STADIUM_EXPANSION_STEP = 5000;
export const STADIUM_CAPACITY_MAX = 100_000;
export const STADIUM_EXPANSION_COST_PER_STEP = 500_000;
export const LOAN_BLOCK_AMOUNT = 500_000;
export const LOAN_INTEREST_PER_BLOCK_PER_ROUND = 25_000;
export const MIN_LOAN_REQUEST = LOAN_BLOCK_AMOUNT;
export const MAX_LOAN_REQUEST = 5_000_000;
export const FIXED_TICKET_PRICE = 18;

export const BASE_STADIUM_FILL: Record<number, number> = {
  1: 0.78,
  2: 0.7,
  3: 0.62,
  4: 0.52,
  5: 0.46,
};

const INITIAL_PAYROLL_COVERAGE: Record<number, { min: number; max: number }> = {
  1: { min: 25, max: 33 },
  2: { min: 23, max: 31 },
  3: { min: 21, max: 29 },
  4: { min: 20, max: 27 },
  5: { min: 18, max: 24 },
};

const EXPECTED_SALARY_PER_SKILL = 500;

export interface SalaryBand {
  skillMin: number;
  skillMax: number;
  salaryMin: number;
  salaryMax: number;
}

export function getSalaryBandForSkill(skill: number): SalaryBand {
  const safeSkill = Math.max(1, Math.min(50, Math.round(skill)));
  const expected = safeSkill * EXPECTED_SALARY_PER_SKILL;
  const salaryMin = Math.round(expected * 0.9);
  const salaryMax = Math.round(expected * 1.3);
  return {
    skillMin: safeSkill,
    skillMax: safeSkill,
    salaryMin,
    salaryMax,
  };
}

export function getDefaultTicketPrice(_division: number): number {
  void _division;
  return FIXED_TICKET_PRICE;
}

export function calculateSalaryForSkill(
  skill: number,
  rng?: () => number,
  isStar = false
): number {
  void rng;
  const base = Math.max(500, Math.round(skill) * EXPECTED_SALARY_PER_SKILL);
  return Math.round(base * (isStar ? STAR_SALARY_MULTIPLIER : 1));
}

export function isSalaryBelowAcceptableRange(player: Player): boolean {
  const expected = calculateSalaryForSkill(player.skill, undefined, player.isStar);
  return player.salary < Math.round(expected * 0.96);
}

/** Novo salário na renovação: sempre maior que o atual e alinhado à força atual. */
export function calculateRenewalSalary(player: Player): number {
  const expected = calculateSalaryForSkill(player.skill, undefined, player.isStar);
  const bumped = Math.max(
    player.salary + 500,
    Math.round(player.salary * 1.08),
    expected
  );
  return Math.min(Math.round(expected * 1.35), bumped);
}

export function getClubPayroll(players: Player[], clubId: number): number {
  return getPlayersByClub(players, clubId).reduce((sum, p) => sum + p.salary, 0);
}

export function getSeasonHomeMatches(totalRounds = 14): number {
  return Math.floor(totalRounds / 2);
}

export function estimateSeasonHomeRevenue(
  club: Club,
  totalRounds = 14
): number {
  const baseFill = BASE_STADIUM_FILL[club.division] ?? BASE_STADIUM_FILL[4];
  const moraleFactor = 0.82 + Math.max(0, Math.min(100, club.morale)) / 280;
  const attendance = Math.round(
    club.stadiumCapacity * Math.min(0.95, baseFill * moraleFactor)
  );
  const perHome = Math.round(attendance * getDefaultTicketPrice(club.division));
  return perHome * getSeasonHomeMatches(totalRounds);
}

export function initializeClubFinanceBudgets(
  clubs: Club[],
  players: Player[],
  seed: number,
  totalRounds = 14
): void {
  const rng = createRng(seed);
  for (const club of clubs) {
    const payrollPerRound = getClubPayroll(players, club.id);
    const homeRevenueSeason = estimateSeasonHomeRevenue(club, totalRounds);
    const coverage =
      INITIAL_PAYROLL_COVERAGE[club.division] ?? INITIAL_PAYROLL_COVERAGE[4];
    const coverageRoll = coverage.min + rng() * (coverage.max - coverage.min);
    const safetyReserve = Math.round(homeRevenueSeason * 0.18);
    const minBudget = Math.round(
      payrollPerRound * coverageRoll + safetyReserve
    );
    const maxBudget = Math.round(
      payrollPerRound * (coverageRoll + 5) + safetyReserve + homeRevenueSeason * 0.2
    );
    const budgetRoll = Math.round(minBudget + rng() * Math.max(0, maxBudget - minBudget));
    club.finances = Math.max(250_000, budgetRoll);
  }
}

export function getSeasonPayrollEstimate(
  players: Player[],
  clubId: number,
  totalRounds = 14
): number {
  const perRound = getClubPayroll(players, clubId);
  const payments = getPayrollPaymentsPerSeason(totalRounds);
  return perRound * payments;
}

export function getPayrollPaymentsPerSeason(totalRounds = 14): number {
  return Math.floor(totalRounds / PAYROLL_INTERVAL);
}

export function getNextPayrollRound(
  currentRound: number,
  totalRounds: number
): number | null {
  if (currentRound > totalRounds) return null;
  const next = Math.ceil(currentRound / PAYROLL_INTERVAL) * PAYROLL_INTERVAL;
  return next <= totalRounds ? next : null;
}

export function calculateAttendance(
  club: Club,
  standings: Standing[],
  clubs: Club[]
): number {
  const baseFill = BASE_STADIUM_FILL[club.division] ?? BASE_STADIUM_FILL[4];
  const moraleFactor = 0.82 + Math.max(0, Math.min(100, club.morale)) / 280;

  const divStandings = standings.filter((s) => {
    const c = clubs.find((x) => x.id === s.clubId);
    return c?.division === club.division;
  });
  const position = getStandingPosition(divStandings, clubs, club.id);
  const positionFactor =
    position > 0 ? 0.88 + (9 - Math.min(position, 8)) / 40 : 1;

  const fill = Math.min(0.95, baseFill * moraleFactor * positionFactor);
  return Math.min(club.stadiumCapacity, Math.round(club.stadiumCapacity * fill));
}

export function calculateTicketRevenue(
  club: Club,
  standings: Standing[],
  clubs: Club[]
): { attendance: number; revenue: number } {
  const attendance = calculateAttendance(club, standings, clubs);
  const revenue = Math.round(attendance * getDefaultTicketPrice(club.division));
  return { attendance, revenue };
}

export function projectNextHomeRevenue(state: GameState): {
  attendance: number;
  revenue: number;
} | null {
  const humanClub = state.clubs.find((c) => c.id === state.humanClubId);
  if (!humanClub || state.phase !== "regular") return null;

  const nextHome = state.fixtures.find(
    (f) =>
      !f.played &&
      f.round >= state.round &&
      f.homeClubId === state.humanClubId
  );
  if (!nextHome) return null;

  const { attendance, revenue } = calculateTicketRevenue(
    humanClub,
    state.standings,
    state.clubs
  );
  return { attendance, revenue };
}

export function applyHomeTicketRevenue(
  club: Club,
  standings: Standing[],
  clubs: Club[]
): { attendance: number; revenue: number } | null {
  const { attendance, revenue } = calculateTicketRevenue(
    club,
    standings,
    clubs
  );
  club.finances += revenue;
  return { attendance, revenue };
}

function pickRandom<T>(items: T[], rng: () => number): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(rng() * items.length)] ?? null;
}

function listPlayerForAuction(
  state: GameState,
  playerId: number,
  fromClubId: number,
  reason: "raise_rejected" | "bankruptcy"
): GameState {
  return queueForcedAuction(state, playerId, fromClubId, reason);
}

function resolveAiRaise(
  state: GameState,
  club: Club,
  player: Player,
  requestedSalary: number,
  rng: () => number
): GameState {
  const remainingPayments = Math.max(
    1,
    Math.ceil((state.totalRounds - state.round) / PAYROLL_INTERVAL)
  );
  const canAfford =
    club.finances >=
    (requestedSalary - player.salary) * remainingPayments + requestedSalary;

  if (canAfford && rng() < 0.82) {
    const players = state.players.map((p) =>
      p.id === player.id
        ? {
            ...p,
            salary: requestedSalary,
            raisePending: false,
            requestedSalary: null,
            contractRenewedThisSeason: true,
            saleBlockedThisSeason: true,
          }
        : p
    );
    return { ...state, players };
  }

  if (!canSellPlayer(state.players, club.id, player.id)) {
    const players = state.players.map((p) =>
      p.id === player.id
        ? {
            ...p,
            raisePending: false,
            requestedSalary: null,
          }
        : p
    );
    return { ...state, players };
  }

  return listPlayerForAuction(state, player.id, club.id, "raise_rejected");
}

function generateRaiseRequests(state: GameState): GameState {
  let current = state;

  for (const club of state.clubs) {
    if (club.division === DISTRITAL_DIVISION) continue;

    const squad = getPlayersByClub(current.players, club.id);
    for (const player of squad) {
      if (player.raisePending || player.saleBlockedThisSeason) continue;
      if (player.form <= 0) continue;
      if (!isSalaryBelowAcceptableRange(player)) continue;

      const requestedSalary = calculateRenewalSalary(player);
      if (requestedSalary <= player.salary) continue;

      current = {
        ...current,
        players: current.players.map((p) =>
          p.id === player.id
            ? {
                ...p,
                raisePending: true,
                requestedSalary,
              }
            : p
        ),
      };

      if (club.isHuman) {
        current = {
          ...current,
          messages: [
            ...current.messages,
            `${player.name} pediu renovação: ${player.salary.toLocaleString()} → ${requestedSalary.toLocaleString()} (força +${player.form}). Resolva no perfil do jogador.`,
          ],
        };
      } else {
        const clubRng = createRng(
          state.season * 5000 + state.round * 17 + player.id * 13 + getGameSeed(state)
        );
        current = resolveAiRaise(
          current,
          club,
          player,
          requestedSalary,
          clubRng
        );
      }
    }
  }

  return current;
}

function handleBankruptcy(
  state: GameState,
  clubId: number,
  rng: () => number
): GameState {
  const club = state.clubs.find((c) => c.id === clubId);
  if (!club || club.finances >= 0) return state;

  const squad = getPlayersByClub(state.players, clubId);
  const candidates = squad.filter(
    (p) => !p.contractRenewedThisSeason && !p.raisePending
  );
  const pool =
    candidates.length > 0
      ? candidates
      : squad.filter((p) => !p.raisePending && canSellPlayer(state.players, clubId, p.id));

  const victim = pickRandom(pool, rng);
  if (!victim) {
    return {
      ...state,
      messages: [
        ...state.messages,
        `${club.name}: sem caixa e sem jogador elegível para leilão por inadimplência.`,
      ],
    };
  }

  let next = listPlayerForAuction(state, victim.id, clubId, "bankruptcy");
  const minBid = Math.round(victim.value * 0.65);
  next = {
    ...next,
    messages: [
      ...next.messages,
      `${club.name}: caixa negativo (${club.finances.toLocaleString()}). ${victim.name} enviado ao leilão.`,
    ],
  };
  return sellPlayerInstantly(next, clubId, victim.id, minBid);
}

export function processPayroll(state: GameState, playedRound: number): GameState {
  let current: GameState = {
    ...state,
    clubs: state.clubs.map((c) => ({ ...c })),
    messages: [...state.messages],
  };

  const rng = createRng(state.season * 9001 + playedRound * 31 + getGameSeed(state));

  for (const club of current.clubs) {
    const clubRef = current.clubs.find((c) => c.id === club.id)!;
    if (clubRef.loans.length > 0) {
      const totalInterest = clubRef.loans.reduce(
        (sum, loan) =>
          sum +
          (loan.interestPerRound ??
            Math.round(
              (loan.principal * (loan.interestRateBps ?? 0)) / 10_000
            )),
        0
      );
      if (totalInterest > 0) {
        clubRef.finances -= totalInterest;
        if (club.isHuman) {
          current.messages.push(
            `Juros de empréstimo (rod. ${playedRound}): -${totalInterest.toLocaleString()} · Saldo: ${clubRef.finances.toLocaleString()}.`
          );
        }
      }
    }

    const payroll = getClubPayroll(current.players, club.id);
    if (payroll <= 0) continue;

    clubRef.finances -= payroll;

    if (club.isHuman) {
      current.messages.push(
        `Folha salarial (rod. ${playedRound}): -${payroll.toLocaleString()} · Saldo: ${clubRef.finances.toLocaleString()}.`
      );
    }
  }

  current = generateRaiseRequests(current);

  const humanClub = current.clubs.find((c) => c.id === current.humanClubId);
  if (humanClub && humanClub.isHuman) {
    current = handleBankruptcy(current, humanClub.id, rng);
  }

  return current;
}

export function applyPostRoundFinances(
  state: GameState,
  playedRound: number,
  homeClubIds: number[]
): GameState {
  let current: GameState = {
    ...state,
    clubs: state.clubs.map((c) => ({ ...c })),
    messages: [...state.messages],
  };

  for (const clubId of homeClubIds) {
    const club = current.clubs.find((c) => c.id === clubId);
    if (!club) continue;

    const result = applyHomeTicketRevenue(
      club,
      current.standings,
      current.clubs
    );
    if (!result) continue;

    if (club.isHuman) {
      current.messages.push(
        `Bilheteria (casa): ${result.attendance.toLocaleString()} pagantes · +${result.revenue.toLocaleString()} (ingresso fixo ${getDefaultTicketPrice(club.division).toLocaleString()}).`
      );
    }
  }

  if (playedRound % PAYROLL_INTERVAL === 0) {
    current = processPayroll(current, playedRound);
    current = maybeStartAuctionAfterRound(current, playedRound);
  }
  const driftRng = createRng(state.season * 13000 + playedRound * 71 + getGameSeed(state));
  applyDivisionSkillDrift(
    current.players,
    current.clubs,
    state.season,
    playedRound,
    driftRng
  );

  return current;
}

export function acceptPlayerRaise(state: GameState, playerId: number): GameState {
  const humanClub = state.clubs.find((c) => c.id === state.humanClubId);
  const player = state.players.find((p) => p.id === playerId);
  if (!humanClub || !player || player.clubId !== state.humanClubId) return state;
  if (!player.raisePending || player.requestedSalary == null) return state;

  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId
        ? {
            ...p,
            salary: player.requestedSalary!,
            raisePending: false,
            requestedSalary: null,
            contractRenewedThisSeason: true,
            saleBlockedThisSeason: true,
          }
        : p
    ),
    messages: [
      ...state.messages,
      `Renovação aceita: ${player.name} passa a receber ${player.requestedSalary!.toLocaleString()} por rodada. Venda bloqueada até o fim da temporada.`,
    ],
  };
}

export function rejectPlayerRaise(state: GameState, playerId: number): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.clubId !== state.humanClubId) return state;
  if (!player.raisePending) return state;

  const forced = queueForcedAuction(
    state,
    playerId,
    state.humanClubId,
    "raise_rejected",
    Math.round(player.value * 0.85)
  );
  return sellPlayerInstantly(
    forced,
    state.humanClubId,
    playerId,
    Math.round(player.value * 0.85)
  );
}

export function setHumanTicketPrice(
  state: GameState,
  _ticketPrice: number
): GameState {
  void _ticketPrice;
  return state;
}

export function estimateLoanInterestPerRound(amount: number): number {
  const normalizedAmount = Math.max(0, Math.round(amount / LOAN_BLOCK_AMOUNT)) * LOAN_BLOCK_AMOUNT;
  const blocks = Math.floor(normalizedAmount / LOAN_BLOCK_AMOUNT);
  return blocks * LOAN_INTEREST_PER_BLOCK_PER_ROUND;
}

/** @deprecated Compatibilidade com chamadas antigas. */
export function estimateLoanInterestRateBps(amount: number): number {
  const normalizedAmount = Math.max(1, Math.round(amount));
  const perRound = estimateLoanInterestPerRound(normalizedAmount);
  return Math.round((perRound / normalizedAmount) * 10_000);
}

export function requestClubLoan(
  state: GameState,
  requestedAmount: number
): GameState {
  const humanClub = state.clubs.find((c) => c.id === state.humanClubId);
  if (!humanClub) return state;
  const roundedToBlock =
    Math.round(requestedAmount / LOAN_BLOCK_AMOUNT) * LOAN_BLOCK_AMOUNT;
  const amount = Math.max(
    MIN_LOAN_REQUEST,
    Math.min(MAX_LOAN_REQUEST, roundedToBlock)
  );
  const interestPerRound = estimateLoanInterestPerRound(amount);
  const loan: ClubLoan = {
    id: humanClub.nextLoanId,
    principal: amount,
    interestPerRound,
  };
  return {
    ...state,
    clubs: state.clubs.map((c) =>
      c.id === humanClub.id
        ? {
            ...c,
            finances: c.finances + amount,
            loans: [...c.loans, loan],
            nextLoanId: c.nextLoanId + 1,
          }
        : c
    ),
    messages: [
      ...state.messages,
      `Empréstimo aprovado: +${amount.toLocaleString()} · juros ${interestPerRound.toLocaleString()} por rodada.`,
    ],
  };
}

export function repayClubLoan(state: GameState, paymentAmount: number): GameState {
  const humanClub = state.clubs.find((c) => c.id === state.humanClubId);
  if (!humanClub || humanClub.loans.length === 0) return state;
  const amount = Math.max(1, Math.round(paymentAmount));
  const payable = Math.min(amount, humanClub.finances);
  if (payable <= 0) return state;

  let remaining = payable;
  const nextLoans: ClubLoan[] = [];
  for (const loan of humanClub.loans) {
    if (remaining <= 0) {
      nextLoans.push(loan);
      continue;
    }
    const paid = Math.min(loan.principal, remaining);
    const nextPrincipal = loan.principal - paid;
    remaining -= paid;
    if (nextPrincipal > 0) {
      nextLoans.push({ ...loan, principal: nextPrincipal });
    }
  }
  const actuallyPaid = payable - remaining;
  if (actuallyPaid <= 0) return state;

  return {
    ...state,
    clubs: state.clubs.map((c) =>
      c.id === humanClub.id
        ? { ...c, finances: c.finances - actuallyPaid, loans: nextLoans }
        : c
    ),
    messages: [
      ...state.messages,
      `Amortização de empréstimo: -${actuallyPaid.toLocaleString()} · Saldo: ${(
        humanClub.finances - actuallyPaid
      ).toLocaleString()}.`,
    ],
  };
}

export function getStadiumExpansionCost(steps = 1): number {
  return Math.max(1, steps) * STADIUM_EXPANSION_COST_PER_STEP;
}

export function expandHumanStadium(
  state: GameState,
  steps = 1
): GameState {
  const humanClub = state.clubs.find((c) => c.id === state.humanClubId);
  if (!humanClub) return state;
  const safeSteps = Math.max(1, Math.round(steps));
  const availableSteps = Math.floor(
    (STADIUM_CAPACITY_MAX - humanClub.stadiumCapacity) / STADIUM_EXPANSION_STEP
  );
  if (availableSteps <= 0) return state;
  const appliedSteps = Math.min(safeSteps, availableSteps);
  const cost = getStadiumExpansionCost(appliedSteps);
  if (humanClub.finances < cost) return state;
  const addedCapacity = appliedSteps * STADIUM_EXPANSION_STEP;

  return {
    ...state,
    clubs: state.clubs.map((c) =>
      c.id === humanClub.id
        ? {
            ...c,
            finances: c.finances - cost,
            stadiumCapacity: c.stadiumCapacity + addedCapacity,
          }
        : c
    ),
    messages: [
      ...state.messages,
      `Investimento no estádio: +${addedCapacity.toLocaleString()} lugares por ${cost.toLocaleString()}.`,
    ],
  };
}

export function autoRenewAllContracts(state: GameState): GameState {
  const renewedCount = state.players.filter((p) => p.clubId > 0).length;

  return {
    ...state,
    players: state.players.map((p) =>
      p.clubId > 0
        ? {
            ...p,
            contractRenewedThisSeason: true,
            saleBlockedThisSeason: false,
            raisePending: false,
            requestedSalary: null,
          }
        : p
    ),
    messages: [
      ...state.messages,
      `Fim de temporada: ${renewedCount} contratos renovados automaticamente (sem custo).`,
    ],
  };
}

export function resetContractsForNewSeason(players: Player[]): Player[] {
  return players.map((p) => ({
    ...p,
    contractRenewedThisSeason: p.clubId > 0,
    saleBlockedThisSeason: false,
    raisePending: false,
    requestedSalary: null,
  }));
}

export function migrateClubFinanceFields(club: Club): Club {
  return {
    ...club,
    ticketPrice: getDefaultTicketPrice(club.division),
    loans: (club.loans ?? []).map((loan) => ({
      ...loan,
      interestPerRound:
        loan.interestPerRound ??
        estimateLoanInterestPerRound(loan.principal),
    })),
    nextLoanId: club.nextLoanId ?? 1,
  };
}

export function migratePlayerFinanceFields(
  player: Partial<Player> & { id: number; skill?: number }
): Pick<
  Player,
  | "salary"
  | "contractRenewedThisSeason"
  | "saleBlockedThisSeason"
  | "raisePending"
  | "requestedSalary"
> {
  const rng = createRng(player.id * 991);
  const skill = player.skill ?? 20;
  const isStar =
    (player.isStar ?? false) &&
    (player.position ? isStarEligiblePosition(player.position) : true);
  return {
    salary: player.salary ?? calculateSalaryForSkill(skill, rng, isStar),
    contractRenewedThisSeason: player.contractRenewedThisSeason ?? true,
    saleBlockedThisSeason: player.saleBlockedThisSeason ?? false,
    raisePending: player.raisePending ?? false,
    requestedSalary: player.requestedSalary ?? null,
  };
}

export function playerBlocksSale(player: Player, phase: string): boolean {
  if (phase !== "regular") return false;
  return player.raisePending || player.saleBlockedThisSeason;
}

export function getHomeClubIdsFromFixtures(
  fixtures: Fixture[],
  round: number
): number[] {
  return fixtures
    .filter((f) => f.round === round && f.played)
    .map((f) => f.homeClubId);
}
