import { hashStringToSeed } from "@/data/name-generator";

export type CountryCode = "BR" | "PT" | "ES" | "IT" | "EN" | "FR" | "DE";
export type Position = "GK" | "DF" | "MF" | "FW";

export const POSITION_LABELS: Record<Position, string> = {
  GK: "Goleiro",
  DF: "Defensor",
  MF: "Meia",
  FW: "Atacante",
};
export type Formation =
  | "4-4-2"
  | "4-3-3"
  | "4-2-4"
  | "5-4-1"
  | "5-3-2"
  | "3-3-4"
  | "3-4-3"
  | "5-5-0"
  | "Melhores";

export const FORMATION_PRESETS: Formation[] = [
  "4-4-2",
  "4-3-3",
  "4-2-4",
  "5-4-1",
  "5-3-2",
  "3-3-4",
  "3-4-3",
  "5-5-0",
];
export type SeasonPhase = "regular" | "offseason" | "ended";

export type Aggressiveness =
  | "fair_play"
  | "cavalheiro"
  | "neutro"
  | "caneleiro"
  | "sarrafeiro";

export const AGGRESSIVENESS_LABELS: Record<Aggressiveness, string> = {
  fair_play: "Fair Play",
  cavalheiro: "Cavalheiro",
  neutro: "Neutro",
  caneleiro: "Caneleiro",
  sarrafeiro: "Sarrafeiro",
};

export interface PlayerMatchRecord {
  season: number;
  round: number;
  fixtureId: number;
  clubId: number;
  opponentName: string;
  goals: number;
  yellowCards: number;
  redCards: number;
  wasStarter: boolean;
}

export interface Player {
  id: number;
  name: string;
  /** Craque do elenco (apenas para MF/FW). */
  isStar: boolean;
  skill: number;
  morale: number;
  /** Variação de força na última rodada (+1, 0, -1). */
  form: number;
  position: Position;
  value: number;
  /** Salário pago por rodada. Fixo até renovação. */
  salary: number;
  /** Contrato válido nesta temporada (renovação automática, compra ou aceite). */
  contractRenewedThisSeason: boolean;
  /** Venda bloqueada até fim da temporada após compra ou renovação com aumento. */
  saleBlockedThisSeason: boolean;
  raisePending: boolean;
  requestedSalary: number | null;
  clubId: number;
  isForeign: boolean;
  aggressiveness: Aggressiveness;
  seasonGoals: number;
  seasonYellowCards: number;
  seasonRedCards: number;
  yellowAccumulation: number;
  suspensionMatches: number;
  /** Partidas restantes até poder estrear após transferência (CON). */
  registrationMatches: number;
  /** Sem drift de força enquanto playedRound <= este valor (rodada da compra). null = sem trava. */
  skillDriftAllowedAfterRound: number | null;
  /** Dias de lesão restantes (1 jogo liga ou copa = 1D). 0 = apto. */
  injuryDays: number;
  matchHistory: PlayerMatchRecord[];
}

export const LINEUP_POSITION_LIMITS = {
  GK: { min: 1, max: 1 },
  DF: { min: 3, max: 5 },
  MF: { min: 2, max: 6 },
  FW: { min: 0, max: 4 },
} as const;

export const MIN_SQUAD_GK = 1;
export const MIN_SQUAD_OUTFIELD = 10;
export const MIN_SQUAD_SIZE = MIN_SQUAD_GK + MIN_SQUAD_OUTFIELD;
/**
 * Tamanho "confortável" de plantel. Acima disso o interesse da IA por novos
 * jogadores cai progressivamente (mas não é bloqueado), deixando o mercado fluido.
 */
export const COMFORTABLE_SQUAD_SIZE = 24;
/**
 * Teto flexível de plantel. Os clubes começam com ~20 jogadores e podem crescer
 * até este limite; serve apenas para evitar acúmulo absurdo, não para travar o
 * mercado como o antigo limite rígido de 20.
 */
export const MAX_SQUAD_SIZE = 32;

export interface Club {
  id: number;
  name: string;
  slug: string;
  country: CountryCode;
  division: 1 | 2 | 3 | 4 | 5;
  /** Índice de força do clube (1–50) usado no sorteio inicial de divisões. */
  strengthIndex: number;
  reputation: number;
  stadiumCapacity: number;
  finances: number;
  /** Preço de ingresso fixo para cálculo de bilheteria (não ajustável na UI). */
  ticketPrice: number;
  loans: ClubLoan[];
  nextLoanId: number;
  morale: number;
  formation: Formation;
  winStreak: number;
  lossStreak: number;
  isHuman: boolean;
  coachId: number | null;
  coachName: string;
  /** @deprecated Legado de save; use a moral do clube como momento do técnico. */
  coachReputation: number;
  coachRecentlyFired: boolean;
  /** Cor predominante do uniforme. */
  primaryColor: string;
  /** Segunda cor predominante do uniforme. */
  secondaryColor: string;
}

export interface ClubLoan {
  id: number;
  principal: number;
  /** Juros fixos cobrados por rodada. */
  interestPerRound: number;
  /** @deprecated Compatibilidade com saves antigos. */
  interestRateBps?: number;
}

export type AuctionLotReason =
  | "voluntary"
  | "ai_voluntary"
  | "raise_rejected"
  | "bankruptcy";

export interface AuctionLot {
  id: number;
  playerId: number;
  playerName: string;
  position: Position;
  skill: number;
  sellerClubId: number;
  sellerClubName: string;
  minBid: number;
  marketValue: number;
  reason: AuctionLotReason;
}

export interface AuctionLotResult {
  lotId: number;
  playerId: number;
  playerName: string;
  sellerClubId: number;
  sellerClubName: string;
  winnerClubId: number | null;
  winnerClubName: string | null;
  winningBid: number;
  unsold: boolean;
}

export interface AuctionHumanBid {
  clubId: number;
  amount: number | null;
}

export interface AuctionSession {
  round: number;
  season: number;
  lots: AuctionLot[];
  results: AuctionLotResult[];
  complete: boolean;
  /** Multijogador local: jogador que deve agir no lote atual. */
  actingManagerIndex: number;
  /** Lances/passagens dos humanos no lote atual (antes de resolver). */
  pendingHumanBids: AuctionHumanBid[];
  /** Votos para pular o leilão inteiro (um por jogador local). */
  skipVotes: number;
}

export interface PlayerAuctionQueueItem {
  id: number;
  playerId: number;
  sellerClubId: number;
  minBid: number;
  marketValue: number;
  reason: AuctionLotReason;
  listedRound: number;
  season: number;
}

/** @deprecated Use auctionQueue + auctionSession */
export interface AuctionListing {
  id: number;
  playerId: number;
  playerName: string;
  fromClubId: number;
  reason: "raise_rejected" | "bankruptcy";
  minBid: number;
  round: number;
  season: number;
}

export interface CoachOffer {
  id: number;
  clubId: number;
  clubName: string;
  division: number;
  /** Nome do jogador/técnico humano a quem a proposta se destina. */
  managerName: string;
  reason?: string;
}

export interface Coach {
  name: string;
  coachId: number;
  currentClubId: number | null;
  offers: CoachOffer[];
}

export interface CoachRecord {
  id: number;
  name: string;
  currentClubId: number | null;
  /** Último clube antes de ficar desempregado (para regras de contratação). */
  lastClubId?: number | null;
  matchesWon: number;
  matchesDrawn: number;
  matchesLost: number;
  titles: number;
  /** @deprecated Legado de save; não usado na lógica do jogo. */
  respectScore: number;
  seasonsCoached: number;
  lastSeasonActive: number;
}

export interface LocalManager {
  id: string;
  name: string;
  clubId: number;
  ready: boolean;
  lineupPlayerIds: number[];
  benchPlayerIds: number[];
  formation: Formation | null;
}

export interface Standing {
  clubId: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface Fixture {
  id: number;
  round: number;
  division: number;
  homeClubId: number;
  awayClubId: number;
  played: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
}

export interface CupTie {
  id: number;
  /** Rodada da liga após a qual este jogo da copa ocorre. */
  leagueRoundGate: number;
  homeClubId: number;
  awayClubId: number;
  played: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
  winnerClubId: number | null;
}

export interface CupState {
  season: number;
  /** Participantes iniciais (divisões 1–4). */
  participantIds: number[];
  remainingClubIds: number[];
  ties: CupTie[];
  championClubId: number | null;
  /** Finalistas aguardando a decisão após a rodada 14. */
  finalistsClubIds: number[] | null;
  nextTieId: number;
  /** Jogo da copa do humano pendente (ao vivo). */
  pendingHumanTieId: number | null;
  /** Rodadas pares em que já houve sorteio/jogos. */
  processedGates: number[];
}

export interface MatchResult {
  fixtureId: number;
  homeGoals: number;
  awayGoals: number;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
}

export type MatchSpeed = 60 | 45 | 30 | 15;

export interface GoalEvent {
  minute: number;
  team: "home" | "away";
  playerId?: number;
  playerName?: string;
  isPenalty?: boolean;
}

export type PenaltyKickOutcome = "goal" | "saved" | "off_target" | "post";

export interface PenaltyChanceEvent {
  id: string;
  minute: number;
  team: "home" | "away";
  sufferedPlayerId?: number;
  sufferedPlayerName?: string;
}

export interface PenaltyShootoutKick {
  round: number;
  suddenDeath: boolean;
  team: "home" | "away";
  kickerId?: number;
  kickerName: string;
  outcome: PenaltyKickOutcome;
}

export interface PenaltyShootoutSummary {
  homeGoals: number;
  awayGoals: number;
  winnerTeam: "home" | "away";
  kicks: PenaltyShootoutKick[];
}

export interface CardEvent {
  minute: number;
  team: "home" | "away";
  type: "yellow" | "red";
  playerId: number;
  playerName: string;
}

export interface InjuryEvent {
  minute: number;
  team: "home" | "away";
  playerId: number;
  playerName: string;
  days: number;
}

export interface MatchDisciplineRecord {
  playerId: number;
  yellowsInMatch: number;
  redInMatch: boolean;
}

export interface LiveMatchPlan {
  fixtureId: number;
  division: number;
  homeClubId: number;
  awayClubId: number;
  homeName: string;
  awayName: string;
  isHumanMatch: boolean;
  competition: "league" | "cup";
  cupTieId?: number;
  cupPhaseLabel?: string;
  events: GoalEvent[];
  cardEvents: CardEvent[];
  injuryEvents?: InjuryEvent[];
  finalHomeGoals: number;
  finalAwayGoals: number;
  penaltyChances?: PenaltyChanceEvent[];
  knockoutWinnerClubId?: number | null;
  penaltyShootout?: PenaltyShootoutSummary | null;
  secondHalfPending: boolean;
  homeLineupIds: number[];
  awayLineupIds: number[];
}

export interface TransferOffer {
  id: number;
  playerId: number;
  playerName: string;
  fromClubId: number;
  toClubId: number;
  toClubName: string;
  fee: number;
  accepted: boolean | null;
}

export interface RoundMatchResult {
  homeClubId?: number;
  awayClubId?: number;
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
  isHumanMatch: boolean;
}

export interface LastRoundResults {
  round: number;
  division: number;
  matches: RoundMatchResult[];
}

export interface GameState {
  id: string;
  /** Semente única por save — varia sorteios, elencos e simulações entre partidas novas. */
  runSeed: number;
  /** Países selecionados no início (liga mista). */
  countries: CountryCode[];
  /** @deprecated Use countries. Mantido para saves antigos. */
  country: CountryCode;
  season: number;
  round: number;
  totalRounds: number;
  phase: SeasonPhase;
  clubs: Club[];
  players: Player[];
  standings: Standing[];
  fixtures: Fixture[];
  cup: CupState | null;
  coach: Coach;
  coaches: CoachRecord[];
  nextCoachId: number;
  localManagers: LocalManager[];
  activeManagerIndex: number;
  isLocalMultiplayer: boolean;
  auctionBidderClubId: number | null;
  humanClubId: number;
  humanFormation: Formation | null;
  lineupPlayerIds: number[];
  benchPlayerIds: number[];
  transferOffers: TransferOffer[];
  /** @deprecated */
  auctionListings: AuctionListing[];
  auctionQueue: PlayerAuctionQueueItem[];
  auctionSession: AuctionSession | null;
  nextAuctionId: number;
  nextAuctionLotId: number;
  messages: string[];
  nextFixtureId: number | null;
  lastRoundResults: LastRoundResults | null;
  seasonSummary: SeasonSummary | null;
  /** Promoção/rebaixamento e demissões já aplicados após a última rodada da liga. */
  leagueSeasonProcessed?: boolean;
  /** Aviso transitório (UI) da última venda de um jogador do técnico humano. */
  lastPlayerSale?: PlayerSaleNotice | null;
}

export interface PlayerSaleNotice {
  /** Identificador único para a UI saber quando há um novo aviso. */
  id: number;
  playerId: number;
  playerName: string;
  buyerClubId: number | null;
  buyerClubName: string | null;
  fee: number;
  unsold: boolean;
}

export interface PrizeAward {
  competition: string;
  clubId: number;
  clubName: string;
  amount: number;
}

export interface TopScorerSummary {
  playerId: number;
  playerName: string;
  position?: Position;
  goals: number;
  clubId: number;
  clubName: string;
  amount: number;
}

export interface SeasonSummary {
  season: number;
  awards: PrizeAward[];
  topScorer: TopScorerSummary | null;
}

export interface TeamCatalogEntry {
  slug: string;
  name: string;
  country: CountryCode;
  /** Índice de força configurável (1–50) para montagem das divisões. */
  strength: number;
  reputation: number;
  primaryColor: string;
  secondaryColor: string;
}

export const NATIONAL_DIVISION_COUNT = 4;
export const DISTRITAL_DIVISION = 5;
export const TEAMS_PER_DIVISION = 8;
export const TEAMS_PER_DISTRITAL = 32;
export const PROMOTION_SPOTS = 2;
export const RELEGATION_SPOTS = 2;
/** Mínimo de clubes no pool combinado (32 liga + 32 distrital). */
export const MIN_GAME_TEAMS = 64;

/** Rodadas da liga com fase da Copa Geral (64 clubes, mata-mata). */
export const CUP_LEAGUE_GATES = [2, 4, 6, 8, 10, 12, 14] as const;
export const CUP_FINAL_LEAGUE_ROUND = 14;
export const CUP_NATIONAL_COUNT = TEAMS_PER_DIVISION * NATIONAL_DIVISION_COUNT;
export const CUP_TEAM_COUNT = CUP_NATIONAL_COUNT + TEAMS_PER_DISTRITAL;

export const CUP_PHASE_NAMES: Record<number, string> = {
  2: "1ª fase",
  4: "2ª fase",
  6: "Oitavas de final",
  8: "Quartas de final",
  10: "Semifinal",
  12: "Sorteio da final",
  14: "Final",
};

export const PRIZE_CUP_CHAMPION = 10_000_000;

export const DIVISION_SKILL_RANGES: Record<number, { min: number; max: number }> = {
  1: { min: 40, max: 47 },
  2: { min: 30, max: 37 },
  3: { min: 20, max: 27 },
  4: { min: 8, max: 14 },
  5: { min: 1, max: 5 },
};

export function formatDivisionLabel(division: number): string {
  if (division === DISTRITAL_DIVISION) return "Distrital";
  return `${division}ª`;
}

/** Grid 2×2: 1ª sup-esq, 3ª sup-dir, 2ª inf-esq, 4ª inf-dir. */
const NATIONAL_DIVISION_GRID_ORDER = [1, 3, 2, 4] as const;

export function sortNationalDivisionsForGrid(divisions: number[]): number[] {
  return [...divisions].sort((a, b) => {
    const ia = NATIONAL_DIVISION_GRID_ORDER.indexOf(
      a as (typeof NATIONAL_DIVISION_GRID_ORDER)[number]
    );
    const ib = NATIONAL_DIVISION_GRID_ORDER.indexOf(
      b as (typeof NATIONAL_DIVISION_GRID_ORDER)[number]
    );
    if (ia === -1 && ib === -1) return a - b;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export const COUNTRY_LABELS: Record<CountryCode, string> = {
  BR: "Brasil",
  PT: "Portugal",
  ES: "Espanha",
  IT: "Itália",
  EN: "Inglaterra",
  FR: "França",
  DE: "Alemanha",
};

export function formatCountriesLabel(countries: CountryCode[]): string {
  return countries.map((c) => COUNTRY_LABELS[c]).join(" · ");
}

export function getCountrySeed(countries: CountryCode[]): number {
  return countries.reduce(
    (acc, c, i) => acc + c.charCodeAt(0) * (i + 3) * 997,
    0
  );
}

export function getGameSeed(state: {
  countries: CountryCode[];
  runSeed?: number;
  id?: string;
}): number {
  const countryPart = getCountrySeed(state.countries);
  const runPart =
    state.runSeed ??
    (state.id ? hashStringToSeed(state.id) : countryPart);
  return ((countryPart * 1_000_003) ^ runPart) >>> 0;
}

export function parseCountriesField(value: string): CountryCode[] {
  const valid: CountryCode[] = ["BR", "PT", "ES", "IT", "EN", "FR", "DE"];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((c): c is CountryCode => valid.includes(c as CountryCode));
}

export const FORMATION_MODIFIERS: Record<
  Formation,
  { attack: number; defense: number }
> = {
  "4-4-2": { attack: 0, defense: 0 },
  "4-3-3": { attack: 0.08, defense: -0.08 },
  "4-2-4": { attack: 0.12, defense: -0.12 },
  "5-4-1": { attack: -0.06, defense: 0.06 },
  "5-3-2": { attack: -0.08, defense: 0.08 },
  "3-3-4": { attack: 0.1, defense: -0.1 },
  "3-4-3": { attack: 0.09, defense: -0.07 },
  "5-5-0": { attack: -0.15, defense: 0.1 },
  Melhores: { attack: 0, defense: 0 },
};

export const FORMATION_LINEUP: Record<Formation, Record<Position, number>> = {
  "4-4-2": { GK: 1, DF: 4, MF: 4, FW: 2 },
  "4-3-3": { GK: 1, DF: 4, MF: 3, FW: 3 },
  "4-2-4": { GK: 1, DF: 4, MF: 2, FW: 4 },
  "5-4-1": { GK: 1, DF: 5, MF: 4, FW: 1 },
  "5-3-2": { GK: 1, DF: 5, MF: 3, FW: 2 },
  "3-3-4": { GK: 1, DF: 3, MF: 3, FW: 4 },
  "3-4-3": { GK: 1, DF: 3, MF: 4, FW: 3 },
  "5-5-0": { GK: 1, DF: 5, MF: 5, FW: 0 },
  Melhores: { GK: 1, DF: 4, MF: 4, FW: 2 },
};
