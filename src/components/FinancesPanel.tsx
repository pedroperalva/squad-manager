"use client";

import { useState } from "react";
import type { Club, GameState } from "@/engine/types";
import {
  getClubPayroll,
  getStadiumExpansionCost,
  estimateLoanInterestPerRound,
  estimateSeasonHomeRevenue,
  getNextPayrollRound,
  getPayrollPaymentsPerSeason,
  getSeasonPayrollEstimate,
  LOAN_BLOCK_AMOUNT,
  LOAN_INTEREST_PER_BLOCK_PER_ROUND,
  MAX_LOAN_REQUEST,
  MIN_LOAN_REQUEST,
  PAYROLL_INTERVAL,
  projectNextHomeRevenue,
  STADIUM_CAPACITY_MAX,
  STADIUM_EXPANSION_STEP,
} from "@/engine/finances";
import { getPlayersByClub } from "@/engine/player";
import PlayerNameWithStar from "@/components/PlayerNameWithStar";

interface FinancesPanelProps {
  state: GameState;
  humanClub: Club;
  disabled?: boolean;
  onRequestLoan: (amount: number) => Promise<void>;
  onRepayLoan: (amount: number) => Promise<void>;
  onExpandStadium: (steps: number) => Promise<void>;
}

export default function FinancesPanel({
  state,
  humanClub,
  disabled,
  onRequestLoan,
  onRepayLoan,
  onExpandStadium,
}: FinancesPanelProps) {
  const [loanAmount, setLoanAmount] = useState(LOAN_BLOCK_AMOUNT);
  const [repayAmount, setRepayAmount] = useState(LOAN_BLOCK_AMOUNT);
  const [investSteps, setInvestSteps] = useState(1);
  const [loanBusy, setLoanBusy] = useState(false);
  const [repayBusy, setRepayBusy] = useState(false);
  const [investBusy, setInvestBusy] = useState(false);

  const squad = getPlayersByClub(state.players, state.humanClubId);
  const payroll = getClubPayroll(state.players, state.humanClubId);
  const seasonPayroll = getSeasonPayrollEstimate(
    state.players,
    state.humanClubId,
    state.totalRounds
  );
  const paymentsPerSeason = getPayrollPaymentsPerSeason(state.totalRounds);
  const nextPayrollRound = getNextPayrollRound(state.round, state.totalRounds);
  const pendingRaises = squad.filter((p) => p.raisePending);
  const homeProjection = projectNextHomeRevenue(state);
  const seasonHomeRevenueEstimate = estimateSeasonHomeRevenue(
    humanClub,
    state.totalRounds
  );
  const totalLoanPrincipal = humanClub.loans.reduce((sum, l) => sum + l.principal, 0);
  const weightedLoanCharge =
    totalLoanPrincipal <= 0
      ? 0
      : Math.round(
          humanClub.loans.reduce(
            (sum, l) => sum + l.principal * l.interestPerRound,
            0
          ) / totalLoanPrincipal
        );
  const nextInterestCharge = humanClub.loans.reduce(
    (sum, l) => sum + l.interestPerRound,
    0
  );
  const availableExpansionSteps = Math.max(
    0,
    Math.floor((STADIUM_CAPACITY_MAX - humanClub.stadiumCapacity) / STADIUM_EXPANSION_STEP)
  );
  const appliedInvestSteps = Math.max(1, Math.min(investSteps, availableExpansionSteps || 1));
  const investCost = getStadiumExpansionCost(appliedInvestSteps);
  const loanRatePreview = estimateLoanInterestPerRound(loanAmount);
  const recentFinanceMessages = state.messages
    .filter(
      (m) =>
        m.includes("Bilheteria") ||
        m.includes("Folha salarial") ||
        m.includes("renovação") ||
        m.includes("Renovação") ||
        m.includes("Contratos") ||
        m.includes("leilão") ||
        m.includes("caixa negativo") ||
        m.includes("inadimplência")
    )
    .slice(-8)
    .reverse();

  async function handleRequestLoan() {
    setLoanBusy(true);
    try {
      await onRequestLoan(loanAmount);
    } finally {
      setLoanBusy(false);
    }
  }

  async function handleRepayLoan() {
    setRepayBusy(true);
    try {
      await onRepayLoan(repayAmount);
    } finally {
      setRepayBusy(false);
    }
  }

  async function handleExpandStadium() {
    setInvestBusy(true);
    try {
      await onExpandStadium(appliedInvestSteps);
    } finally {
      setInvestBusy(false);
    }
  }

  return (
    <section className="ef-panel p-4">
      <h2 className="ef-title mb-3">Finanças</h2>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div className="border border-[var(--ef-border)] p-3">
          <p className="text-xs ef-muted-text">Caixa</p>
          <p
            className={`text-lg font-medium ${
              humanClub.finances < 0 ? "text-red-400" : "ef-accent-text"
            }`}
          >
            {humanClub.finances.toLocaleString()}
          </p>
        </div>
        <div className="border border-[var(--ef-border)] p-3">
          <p className="text-xs ef-muted-text">
            Folha (a cada {PAYROLL_INTERVAL} rodadas)
          </p>
          <p className="text-lg font-medium">{payroll.toLocaleString()}</p>
          {nextPayrollRound && state.phase === "regular" && (
            <p className="mt-1 text-xs ef-muted-text">
              Próximo pagamento: rodada {nextPayrollRound}
            </p>
          )}
        </div>
        <div className="border border-[var(--ef-border)] p-3">
          <p className="text-xs ef-muted-text">
            Folha estimada ({paymentsPerSeason} pagamentos)
          </p>
          <p className="text-lg font-medium">{seasonPayroll.toLocaleString()}</p>
          <p className="mt-1 text-xs ef-muted-text">
            Bilheteria temporada (estimada):{" "}
            <span className="ef-accent-text">
              +{seasonHomeRevenueEstimate.toLocaleString()}
            </span>
          </p>
        </div>
        <div className="border border-[var(--ef-border)] p-3">
          <p className="text-xs ef-muted-text">Capacidade</p>
          <p className="text-lg font-medium">
            {humanClub.stadiumCapacity.toLocaleString()}
          </p>
        </div>
      </div>

      {homeProjection && (
        <div className="mb-4 rounded border border-[var(--ef-border)] p-3">
          <p className="text-sm font-medium">Bilheteria (ingresso fixo)</p>
          <p className="text-xs ef-muted-text">
            O preço não é ajustável. A receita cresce com capacidade do estádio e moral.
          </p>
          <p className="mt-2 text-xs ef-muted-text">
            Próximo jogo em casa: ~{homeProjection.attendance.toLocaleString()} pagantes
            · receita estimada{" "}
            <span className="ef-accent-text">+{homeProjection.revenue.toLocaleString()}</span>
          </p>
        </div>
      )}

      {pendingRaises.length > 0 && (
        <div className="mb-4 rounded border border-yellow-700 bg-yellow-900/20 p-3 text-sm">
          <p className="mb-1 font-medium text-yellow-400">
            {pendingRaises.length} pedido(s) de renovação pendente(s)
          </p>
          <ul className="mb-2 space-y-1 text-xs">
            {pendingRaises.map((p) => (
              <li key={p.id}>
                <PlayerNameWithStar player={p} />: {p.salary.toLocaleString()} →{" "}
                {p.requestedSalary?.toLocaleString()}
              </li>
            ))}
          </ul>
          <p className="text-xs ef-muted-text">
            Abra o perfil do jogador no elenco para aceitar ou recusar. Venda
            bloqueada enquanto houver pedido ou após aceitar renovação (★ no
            salário). Recusar envia ao leilão.
          </p>
        </div>
      )}

      {humanClub.finances < payroll && state.phase === "regular" && (
        <p className="mb-4 text-xs text-red-400">
          Atenção: caixa abaixo da próxima folha. Sem saldo após o pagamento, um
          jogador sem contrato renovado pode ir ao leilão.
        </p>
      )}

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded border border-[var(--ef-border)] p-3">
          <h3 className="ef-title mb-2 text-sm">Empréstimos</h3>
          <p className="text-xs ef-muted-text mb-2">
            Em blocos de {LOAN_BLOCK_AMOUNT.toLocaleString()} com juros fixos de{" "}
            {LOAN_INTEREST_PER_BLOCK_PER_ROUND.toLocaleString()} por rodada por bloco.
          </p>
          <p className="text-sm">
            Saldo devedor: <span className="ef-accent-text">{totalLoanPrincipal.toLocaleString()}</span>
          </p>
          <p className="text-xs ef-muted-text mb-3">
            Juros médios por 1 real emprestado: {weightedLoanCharge.toFixed(4)} · Próxima cobrança estimada:{" "}
            {nextInterestCharge.toLocaleString()}
          </p>
          <div className="mb-2 flex gap-2">
            <input
              type="number"
              className="w-full border border-[var(--ef-border)] bg-[var(--ef-panel-bg)] p-2 text-sm"
              min={MIN_LOAN_REQUEST}
              max={MAX_LOAN_REQUEST}
              step={LOAN_BLOCK_AMOUNT}
              value={loanAmount}
              onChange={(e) => setLoanAmount(Number(e.target.value))}
              disabled={disabled || loanBusy || state.phase !== "regular"}
            />
            <button
              type="button"
              className="ef-btn text-xs"
              onClick={handleRequestLoan}
              disabled={disabled || loanBusy || state.phase !== "regular"}
            >
              {loanBusy ? "..." : "Pedir"}
            </button>
          </div>
          <p className="text-xs ef-muted-text mb-3">
            Juros estimados deste novo empréstimo: {loanRatePreview.toLocaleString()} por rodada.
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              className="w-full border border-[var(--ef-border)] bg-[var(--ef-panel-bg)] p-2 text-sm"
              min={LOAN_BLOCK_AMOUNT}
              step={LOAN_BLOCK_AMOUNT}
              value={repayAmount}
              onChange={(e) => setRepayAmount(Number(e.target.value))}
              disabled={disabled || repayBusy || totalLoanPrincipal <= 0}
            />
            <button
              type="button"
              className="ef-btn text-xs"
              onClick={handleRepayLoan}
              disabled={
                disabled ||
                repayBusy ||
                totalLoanPrincipal <= 0 ||
                humanClub.finances <= 0
              }
            >
              {repayBusy ? "..." : "Quitar"}
            </button>
          </div>
        </section>

        <section className="rounded border border-[var(--ef-border)] p-3">
          <h3 className="ef-title mb-2 text-sm">Investimento no estádio</h3>
          <p className="text-xs ef-muted-text mb-2">
            Custo fixo por 5.000 lugares: {getStadiumExpansionCost(1).toLocaleString()} · limite máximo{" "}
            {STADIUM_CAPACITY_MAX.toLocaleString()}.
          </p>
          <div className="mb-2 flex gap-2">
            <input
              type="number"
              className="w-full border border-[var(--ef-border)] bg-[var(--ef-panel-bg)] p-2 text-sm"
              min={1}
              max={Math.max(1, availableExpansionSteps)}
              step={1}
              value={investSteps}
              onChange={(e) => setInvestSteps(Number(e.target.value))}
              disabled={disabled || investBusy || availableExpansionSteps <= 0}
            />
            <button
              type="button"
              className="ef-btn text-xs"
              onClick={handleExpandStadium}
              disabled={
                disabled ||
                investBusy ||
                availableExpansionSteps <= 0 ||
                humanClub.finances < investCost
              }
            >
              {investBusy ? "..." : "Expandir"}
            </button>
          </div>
          <p className="text-xs ef-muted-text">
            +{(appliedInvestSteps * STADIUM_EXPANSION_STEP).toLocaleString()} lugares · custo{" "}
            {investCost.toLocaleString()}.
          </p>
        </section>
      </div>

      {recentFinanceMessages.length > 0 && (
        <div>
          <h3 className="ef-title mb-2 text-sm">Movimentações recentes</h3>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs ef-muted-text">
            {recentFinanceMessages.map((msg, i) => (
              <li key={i} className="border-b border-[var(--ef-border)]/50 pb-1">
                {msg}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
