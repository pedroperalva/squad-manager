import {
  createNewGame,
  processEndOfSeason,
  rejectPlayerRaise,
  requestClubLoan,
  repayClubLoan,
  expandHumanStadium,
  simulateRound,
  getSelectableHumanClubs,
} from "../src/engine/index";
import type { CountryCode, GameState } from "../src/engine/types";
import {
  LOAN_BLOCK_AMOUNT,
  estimateSeasonHomeRevenue,
  getClubPayroll,
  getSeasonPayrollEstimate,
  processPayroll,
} from "../src/engine/finances";

type Division = 1 | 2 | 3 | 4 | 5;

interface RunMetrics {
  season: number;
  clubsNegative: number;
  humanNegative: boolean;
  avgCoverage: number;
  maxCoverage: number;
  minCoverage: number;
  divisionNegative: Record<Division, number>;
  divisionAvgCash: Record<Division, number>;
}

function emptyDivisionRecord(): Record<Division, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function coverageForClub(state: GameState, clubId: number): number {
  const club = state.clubs.find((c) => c.id === clubId);
  if (!club) return 0;
  const payroll = getSeasonPayrollEstimate(state.players, clubId, state.totalRounds);
  if (payroll <= 0) return 0;
  return club.finances / payroll;
}

function simulateSeason(state: GameState): GameState {
  let current = state;
  let guard = 0;
  while (current.phase === "regular" && guard < 500) {
    current = simulateRound(current);
    guard += 1;
  }
  return processEndOfSeason(current);
}

function collectRunMetrics(state: GameState): RunMetrics {
  const divisionNegative = emptyDivisionRecord();
  const divisionCash: Record<Division, number[]> = {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
  };
  const coverages: number[] = [];

  for (const club of state.clubs) {
    if (club.finances < 0) divisionNegative[club.division] += 1;
    divisionCash[club.division].push(club.finances);
    coverages.push(coverageForClub(state, club.id));
  }

  const human = state.clubs.find((c) => c.id === state.humanClubId)!;
  return {
    season: state.season,
    clubsNegative: state.clubs.filter((c) => c.finances < 0).length,
    humanNegative: human.finances < 0,
    avgCoverage: average(coverages),
    maxCoverage: Math.max(...coverages),
    minCoverage: Math.min(...coverages),
    divisionNegative,
    divisionAvgCash: {
      1: average(divisionCash[1]),
      2: average(divisionCash[2]),
      3: average(divisionCash[3]),
      4: average(divisionCash[4]),
      5: average(divisionCash[5]),
    },
  };
}

function formatMoney(value: number): string {
  return Math.round(value).toLocaleString("pt-BR");
}

function runMonteCarlo(): void {
  const scenarios: CountryCode[][] = [
    ["BR", "PT", "ES", "IT"],
    ["BR", "PT", "ES", "EN"],
    ["BR", "PT", "ES", "FR"],
    ["BR", "PT", "ES", "IT", "EN"],
  ];

  const runsPerScenario = 8;
  const allMetrics: RunMetrics[] = [];

  console.log("=== Calibragem Financeira: Monte Carlo ===");
  for (const countries of scenarios) {
    const selectable = getSelectableHumanClubs(countries);
    if (selectable.length === 0) continue;

    console.log(`\nCenário ${countries.join(",")} (${runsPerScenario} execuções)`);
    for (let i = 0; i < runsPerScenario; i++) {
      const pick = selectable[(i * 3) % selectable.length]!;
      let base: GameState;
      try {
        base = createNewGame(countries, "Calibração", pick.slug);
      } catch (error) {
        console.log(
          `  Run ${String(i + 1).padStart(2, "0")} | cenário inválido para iniciar: ${
            error instanceof Error ? error.message : "erro desconhecido"
          }`
        );
        break;
      }
      const end = simulateSeason(base);
      const metrics = collectRunMetrics(end);
      allMetrics.push(metrics);

      console.log(
        `  Run ${String(i + 1).padStart(2, "0")} | negativos: ${metrics.clubsNegative}/${
          end.clubs.length
        } | humano negativo: ${metrics.humanNegative ? "sim" : "não"} | cobertura média: ${metrics.avgCoverage.toFixed(
          2
        )}`
      );
    }
  }

  const totalRuns = allMetrics.length;
  const avgNegative = average(allMetrics.map((m) => m.clubsNegative));
  const humanNegativeRate =
    (allMetrics.filter((m) => m.humanNegative).length / Math.max(1, totalRuns)) * 100;
  const avgCoverage = average(allMetrics.map((m) => m.avgCoverage));
  const avgMinCoverage = average(allMetrics.map((m) => m.minCoverage));
  const avgMaxCoverage = average(allMetrics.map((m) => m.maxCoverage));

  const divisionNegativeAvg = emptyDivisionRecord();
  const divisionCashAvg = emptyDivisionRecord();
  for (const d of [1, 2, 3, 4, 5] as const) {
    divisionNegativeAvg[d] = average(allMetrics.map((m) => m.divisionNegative[d]));
    divisionCashAvg[d] = average(allMetrics.map((m) => m.divisionAvgCash[d]));
  }

  console.log("\n--- Resumo agregado ---");
  console.log(`Execuções: ${totalRuns}`);
  console.log(`Clubes negativos (média): ${avgNegative.toFixed(2)} por temporada`);
  console.log(`Humano negativo: ${humanNegativeRate.toFixed(1)}% das execuções`);
  console.log(
    `Cobertura caixa/folha (média): ${avgCoverage.toFixed(2)} | min médio: ${avgMinCoverage.toFixed(
      2
    )} | max médio: ${avgMaxCoverage.toFixed(2)}`
  );
  console.log("Negativos médios por divisão:");
  for (const d of [1, 2, 3, 4, 5] as const) {
    console.log(`  Div ${d}: ${divisionNegativeAvg[d].toFixed(2)}`);
  }
  console.log("Caixa médio por divisão:");
  for (const d of [1, 2, 3, 4, 5] as const) {
    console.log(`  Div ${d}: ${formatMoney(divisionCashAvg[d])}`);
  }
}

function runMechanicSmokeTests(): void {
  console.log("\n=== Testes mecânicos (empréstimo / estádio / reajuste) ===");
  let state = createNewGame(["BR", "PT", "ES", "IT"], "Calibração", "FLAMENGO");
  const human = state.clubs.find((c) => c.id === state.humanClubId)!;
  const payroll = getClubPayroll(state.players, human.id);
  const projectedHome = estimateSeasonHomeRevenue(human, state.totalRounds);
  console.log(
    `Base | caixa=${formatMoney(human.finances)} | folha/rodada=${formatMoney(
      payroll
    )} | bilheteria est. temporada=${formatMoney(projectedHome)}`
  );

  const loanBefore = human.finances;
  state = requestClubLoan(state, LOAN_BLOCK_AMOUNT);
  const loanAfter = state.clubs.find((c) => c.id === state.humanClubId)!;
  console.log(
    `Empréstimo 500k | caixa ${formatMoney(loanBefore)} -> ${formatMoney(
      loanAfter.finances
    )} | contratos=${loanAfter.loans.length}`
  );

  const payrollRoundState = processPayroll(state, 1);
  const payrollHuman = payrollRoundState.clubs.find((c) => c.id === state.humanClubId)!;
  console.log(
    `Cobrança rodada 1 | caixa pós-folha+juros=${formatMoney(
      payrollHuman.finances
    )}`
  );

  const beforeRepay = payrollHuman.finances;
  const repaid = repayClubLoan(payrollRoundState, LOAN_BLOCK_AMOUNT);
  const afterRepay = repaid.clubs.find((c) => c.id === state.humanClubId)!;
  const debtAfter = afterRepay.loans.reduce((sum, l) => sum + l.principal, 0);
  console.log(
    `Amortização 500k | caixa ${formatMoney(beforeRepay)} -> ${formatMoney(
      afterRepay.finances
    )} | dívida restante=${formatMoney(debtAfter)}`
  );

  const beforeCapacity = afterRepay.stadiumCapacity;
  const invested = expandHumanStadium(repaid, 1);
  const afterInvest = invested.clubs.find((c) => c.id === state.humanClubId)!;
  console.log(
    `Estádio +5k | capacidade ${beforeCapacity.toLocaleString("pt-BR")} -> ${afterInvest.stadiumCapacity.toLocaleString(
      "pt-BR"
    )} | caixa=${formatMoney(afterInvest.finances)}`
  );

  const raisePlayer = invested.players.find((p) => p.clubId === invested.humanClubId);
  if (raisePlayer) {
    raisePlayer.raisePending = true;
    raisePlayer.requestedSalary = raisePlayer.salary + 20;
    const rejected = rejectPlayerRaise(invested, raisePlayer.id);
    const updated = rejected.players.find((p) => p.id === raisePlayer.id)!;
    const immediateMsg = rejected.messages
      .slice(-6)
      .some((m) => m.toLowerCase().includes("leilão imediato"));
    console.log(
      `Reajuste recusado | raisePending=${updated.raisePending} | mensagem leilão imediato=${
        immediateMsg ? "sim" : "não"
      }`
    );
  }
}

runMonteCarlo();
runMechanicSmokeTests();
