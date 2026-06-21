import type {
  Aggressiveness,
  CountryCode,
  Player,
  Position,
} from "@/engine/types";
import { DIVISION_SKILL_RANGES } from "@/engine/types";
import { calculateSalaryForSkill } from "@/engine/finances";
import {
  assignRandomStarsToSquad,
  isStarEligiblePosition,
  STAR_VALUE_MULTIPLIER,
} from "@/engine/stars";
import { getClubSquadTemplate } from "@/data/squads";
import { createRng, generatePlayerName, randomInt } from "@/data/name-generator";

const SQUAD_COMPOSITION: Record<Position, number> = {
  GK: 2,
  DF: 7,
  MF: 7,
  FW: 4,
};

const AGGRESSIVENESS_VALUE_MULTIPLIER: Record<Aggressiveness, number> = {
  fair_play: 1.12,
  cavalheiro: 1.06,
  neutro: 1.0,
  caneleiro: 0.93,
  sarrafeiro: 0.86,
};

const DIVISION_FORCE_CORES: Record<number, number> = {
  1: 44,
  2: 34,
  3: 24,
  4: 14,
  5: 5,
};

const CHAMPION_FORCE_BANDS: Record<number, { min: number; max: number }> = {
  1: { min: 45, max: 50 },
  2: { min: 34, max: 39 },
  3: { min: 24, max: 29 },
  4: { min: 14, max: 19 },
  5: { min: 7, max: 12 },
};

export interface DivisionChampionAward {
  clubId: number;
  division: 1 | 2 | 3 | 4;
}

export function effectiveSkill(player: Player): number {
  return player.skill + player.form + (player.morale - 50) / 10;
}

/** Pontos (força, valor base) para interpolação linear por faixas. */
const VALUE_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [1, 100_000],
  [5, 450_000],
  [6, 500_000],
  [14, 1_300_000],
  [25, 3_000_000],
  [36, 4_500_000],
  [40, 5_500_000],
  [42, 6_000_000],
  [46, 7_500_000],
  [50, 9_500_000],
];

function baseValueForSkill(skill: number): number {
  const safeSkill = Math.max(1, Math.round(skill));
  if (safeSkill <= VALUE_ANCHORS[0]![0]) return VALUE_ANCHORS[0]![1];
  if (safeSkill >= VALUE_ANCHORS[VALUE_ANCHORS.length - 1]![0]) {
    return VALUE_ANCHORS[VALUE_ANCHORS.length - 1]![1];
  }

  for (let i = 0; i < VALUE_ANCHORS.length - 1; i++) {
    const [skillLow, valueLow] = VALUE_ANCHORS[i]!;
    const [skillHigh, valueHigh] = VALUE_ANCHORS[i + 1]!;
    if (safeSkill >= skillLow && safeSkill <= skillHigh) {
      const t = (safeSkill - skillLow) / (skillHigh - skillLow);
      return valueLow + t * (valueHigh - valueLow);
    }
  }

  return VALUE_ANCHORS[VALUE_ANCHORS.length - 1]![1];
}

/**
 * Valor de mercado do jogador.
 *
 * Curva por faixas alinhada à economia do jogo (caixa ~2–3M na 4ª divisão).
 * Permite a "jogada Elifoot": vender elenco, bancar UM craque ~36 e completar
 * com distritais baratos. Exemplos (neutro, sem estrela):
 *   força 1 ≈ 60k · força 5 ≈ 300k · força 10 ≈ 675k · força 14 ≈ 1M
 *   força 25 ≈ 2M · força 36 ≈ 3,5M · força 40 ≈ 4,5M · força 50 ≈ 8M
 */
export function calculatePlayerValue(
  skill: number,
  aggressiveness: Aggressiveness = "neutro",
  isStar = false
): number {
  const base = baseValueForSkill(skill);
  const behaviorFactor =
    AGGRESSIVENESS_VALUE_MULTIPLIER[aggressiveness] ??
    AGGRESSIVENESS_VALUE_MULTIPLIER.neutro;
  const starFactor = isStar ? STAR_VALUE_MULTIPLIER : 1;
  return Math.max(50, Math.round(base * behaviorFactor * starFactor));
}

function randomAggressiveness(rng: () => number): Aggressiveness {
  const roll = rng();
  if (roll < 0.12) return "fair_play";
  if (roll < 0.28) return "cavalheiro";
  if (roll < 0.62) return "neutro";
  if (roll < 0.85) return "caneleiro";
  return "sarrafeiro";
}

function refreshPlayerEconomyByStarStatus(players: Player[]): void {
  for (const player of players) {
    player.value = calculatePlayerValue(
      player.skill,
      player.aggressiveness,
      player.isStar
    );
    player.salary = calculateSalaryForSkill(player.skill, undefined, player.isStar);
  }
}

export function createPlayerDefaults(
  partial: Partial<Player> & Pick<Player, "id" | "name" | "clubId" | "position">
): Player {
  const skill = partial.skill ?? 20;
  const aggressiveness = partial.aggressiveness ?? "neutro";
  const isStar =
    (partial.isStar ?? false) && isStarEligiblePosition(partial.position);
  const rng = createRng(partial.id * 991);
  return {
    isStar,
    skill,
    morale: 50,
    form: 0,
    value: partial.value ?? calculatePlayerValue(skill, aggressiveness, isStar),
    salary: calculateSalaryForSkill(skill, rng, isStar),
    contractRenewedThisSeason: true,
    saleBlockedThisSeason: false,
    raisePending: false,
    requestedSalary: null,
    isForeign: false,
    aggressiveness,
    seasonGoals: 0,
    seasonYellowCards: 0,
    seasonRedCards: 0,
    yellowAccumulation: 0,
    suspensionMatches: 0,
    registrationMatches: 0,
    skillDriftAllowedAfterRound: null,
    injuryDays: 0,
    matchHistory: [],
    ...partial,
  };
}

export function migratePlayer(player: Partial<Player> & { id: number }): Player {
  const rng = createRng(player.id * 997);
  const skill = player.skill ?? 20;
  const salaryRng = createRng(player.id * 991);
  const aggressiveness = player.aggressiveness ?? randomAggressiveness(rng);
  const position = player.position ?? "MF";
  const isStar = (player.isStar ?? false) && isStarEligiblePosition(position);
  return createPlayerDefaults({
    isStar,
    id: player.id,
    name: player.name ?? "Jogador",
    clubId: player.clubId ?? 0,
    position,
    skill,
    morale: player.morale ?? 50,
    form: player.form ?? 0,
    value: calculatePlayerValue(skill, aggressiveness, isStar),
    salary: player.salary ?? calculateSalaryForSkill(skill, salaryRng, isStar),
    contractRenewedThisSeason: player.contractRenewedThisSeason ?? true,
    saleBlockedThisSeason: player.saleBlockedThisSeason ?? false,
    raisePending: player.raisePending ?? false,
    requestedSalary: player.requestedSalary ?? null,
    isForeign: player.isForeign ?? false,
    aggressiveness,
    seasonGoals: player.seasonGoals ?? 0,
    seasonYellowCards: player.seasonYellowCards ?? 0,
    seasonRedCards: player.seasonRedCards ?? 0,
    yellowAccumulation: player.yellowAccumulation ?? 0,
    suspensionMatches: player.suspensionMatches ?? 0,
    registrationMatches: player.registrationMatches ?? 0,
    skillDriftAllowedAfterRound: player.skillDriftAllowedAfterRound ?? null,
    injuryDays: player.injuryDays ?? 0,
    matchHistory: player.matchHistory ?? [],
  });
}

export function resetPlayerSeasonStats(players: Player[]): void {
  for (const p of players) {
    p.seasonGoals = 0;
    p.seasonYellowCards = 0;
    p.seasonRedCards = 0;
    p.yellowAccumulation = 0;
    p.suspensionMatches = 0;
    p.registrationMatches = 0;
    p.injuryDays = 0;
  }
}

function generateRandomSquad(
  clubId: number,
  country: CountryCode,
  division: number,
  startId: number,
  seed: number
): Player[] {
  const rng = createRng((seed ^ clubId * 31) >>> 0);
  const range = DIVISION_SKILL_RANGES[division] ?? DIVISION_SKILL_RANGES[4];
  const players: Player[] = [];
  let id = startId;

  for (const [position, count] of Object.entries(SQUAD_COMPOSITION) as [
    Position,
    number,
  ][]) {
    for (let i = 0; i < count; i++) {
      const skill = randomInt(rng, range.min, range.max);
      const aggressiveness = randomAggressiveness(rng);
      players.push(
        createPlayerDefaults({
          id: id++,
          name: generatePlayerName(country, rng),
          skill,
          morale: randomInt(rng, 45, 65),
          form: 0,
          position,
          value: calculatePlayerValue(skill, aggressiveness),
          clubId,
          aggressiveness,
        })
      );
    }
  }

  assignRandomStarsToSquad(players, rng);
  refreshPlayerEconomyByStarStatus(players);
  return players;
}

export function generateSquad(
  clubId: number,
  clubSlug: string,
  country: CountryCode,
  division: number,
  startId: number,
  seed: number
): Player[] {
  const template = getClubSquadTemplate(clubSlug);
  if (!template) {
    return generateRandomSquad(clubId, country, division, startId, seed);
  }

  const rng = createRng((seed ^ clubId * 31) >>> 0);
  const range = DIVISION_SKILL_RANGES[division] ?? DIVISION_SKILL_RANGES[4];
  const players: Player[] = [];
  let id = startId;

  for (const entry of template.players) {
    const skill = randomInt(rng, range.min, range.max);
    const aggressiveness = randomAggressiveness(rng);
    players.push(
      createPlayerDefaults({
        id: id++,
        name: entry.name,
        skill,
        morale: randomInt(rng, 45, 65),
        form: 0,
        position: entry.position,
        value: calculatePlayerValue(skill, aggressiveness),
        clubId,
        aggressiveness,
      })
    );
  }

  assignRandomStarsToSquad(players, rng);
  refreshPlayerEconomyByStarStatus(players);
  return players;
}

export function adjustSquadForDivisionChange(
  players: Player[],
  oldDivision: number,
  newDivision: number,
  rng: () => number
): void {
  if (oldDivision === newDivision) return;

  const newRange = DIVISION_SKILL_RANGES[newDivision] ?? DIVISION_SKILL_RANGES[4]!;
  const oldRange = DIVISION_SKILL_RANGES[oldDivision] ?? DIVISION_SKILL_RANGES[4]!;

  for (const player of players) {
    const span = Math.max(1, oldRange.max - oldRange.min);
    const t = (player.skill - oldRange.min) / span;
    const scaled = Math.round(
      newRange.min + t * (newRange.max - newRange.min)
    );
    const jitter = randomInt(rng, -2, 2);
    player.skill = Math.max(1, Math.min(50, scaled + jitter));
    player.value = calculatePlayerValue(
      player.skill,
      player.aggressiveness,
      player.isStar
    );
    player.form = 0;
  }
}

export function resetRoundSkillVariation(players: Player[]): void {
  for (const p of players) {
    p.form = 0;
  }
}

function playerPlayedInRound(
  player: Player,
  season: number,
  round: number
): boolean {
  return (player.matchHistory ?? []).some(
    (entry) => entry.season === season && entry.round === round
  );
}

/** Drift em direção ao núcleo: descanso recupera mais (abaixo) e cai mais devagar (acima). */
function rollCoreDriftDelta(
  coreGap: number,
  absGap: number,
  playedThisRound: boolean,
  rng: () => number
): number {
  if (absGap < 1) return 0;

  let chance: number;
  if (absGap >= 8) chance = 0.52;
  else if (absGap >= 4) chance = 0.38;
  else if (absGap >= 2) chance = 0.2;
  else chance = 0.1;

  const belowCore = coreGap > 0;
  const aboveCore = coreGap < 0;

  if (!playedThisRound) {
    if (belowCore) {
      chance *= 1.35;
      chance += 0.12;
    } else if (aboveCore) {
      chance *= 0.75;
    }
  } else if (belowCore) {
    chance *= 0.5;
  } else if (aboveCore) {
    chance *= 1.4;
  }

  if (rng() >= Math.min(0.75, chance)) return 0;

  const direction = Math.sign(coreGap);
  if (aboveCore && playedThisRound && absGap >= 10 && rng() < 0.22) {
    return direction * 2;
  }
  return direction;
}

export function applyDivisionSkillDrift(
  players: Player[],
  clubs: { id: number; division: number }[],
  season: number,
  playedRound: number,
  rng: () => number
): void {
  const clubMap = new Map(clubs.map((c) => [c.id, c.division]));
  for (const player of players) {
    if (player.clubId <= 0) continue;
    if (player.registrationMatches > 0) continue;
    if (
      player.skillDriftAllowedAfterRound != null &&
      playedRound <= player.skillDriftAllowedAfterRound
    ) {
      continue;
    }
    const division = clubMap.get(player.clubId);
    if (!division) continue;
    const core = DIVISION_FORCE_CORES[division] ?? DIVISION_FORCE_CORES[4];
    const coreGap = core - player.skill;
    const absGap = Math.abs(coreGap);
    const played = playerPlayedInRound(player, season, playedRound);
    const delta = rollCoreDriftDelta(coreGap, absGap, played, rng);

    if (delta !== 0) {
      player.skill = Math.max(1, Math.min(50, player.skill + delta));
      player.value = calculatePlayerValue(
        player.skill,
        player.aggressiveness,
        player.isStar
      );
    }
  }
}

export function applyChampionForceBoost(
  players: Player[],
  clubs: { id: number; division: number }[],
  divisionChampions: DivisionChampionAward[],
  cupChampionClubId: number | null,
  rng: () => number
): void {
  const clubDivisionMap = new Map(clubs.map((club) => [club.id, club.division]));
  const targetBandByClub = new Map<number, { min: number; max: number }>();

  for (const champion of divisionChampions) {
    targetBandByClub.set(champion.clubId, CHAMPION_FORCE_BANDS[champion.division]);
  }

  if (cupChampionClubId != null) {
    const cupDivision = clubDivisionMap.get(cupChampionClubId);
    if (cupDivision) {
      const cupBand = CHAMPION_FORCE_BANDS[cupDivision] ?? CHAMPION_FORCE_BANDS[4];
      const existingBand = targetBandByClub.get(cupChampionClubId);
      if (!existingBand || cupBand.max > existingBand.max) {
        targetBandByClub.set(cupChampionClubId, cupBand);
      }
    }
  }

  for (const player of players) {
    const targetBand = targetBandByClub.get(player.clubId);
    if (!targetBand) continue;
    if (player.skill >= targetBand.max) continue;

    const delta = randomInt(rng, 1, 3);
    const boosted = Math.min(50, targetBand.max, player.skill + delta);
    if (boosted <= player.skill) continue;

    player.skill = boosted;
    player.value = calculatePlayerValue(
      player.skill,
      player.aggressiveness,
      player.isStar
    );
  }
}

export function pickLineup(
  players: Player[],
  formationPositions: Record<Position, number>
): number[] {
  const available = players.filter((p) => isPlayerAvailable(p));
  const byPos: Record<Position, Player[]> = {
    GK: [],
    DF: [],
    MF: [],
    FW: [],
  };

  for (const p of available) {
    byPos[p.position].push(p);
  }

  for (const pos of Object.keys(byPos) as Position[]) {
    byPos[pos].sort((a, b) => effectiveSkill(b) - effectiveSkill(a));
  }

  const lineup: number[] = [];
  for (const [pos, count] of Object.entries(formationPositions) as [
    Position,
    number,
  ][]) {
    const selected = byPos[pos as Position].slice(0, count);
    lineup.push(...selected.map((p) => p.id));
  }

  return lineup;
}

export function getPlayersByClub(
  players: Player[],
  clubId: number
): Player[] {
  return players.filter((p) => p.clubId === clubId);
}

export function getPlayerMap(players: Player[]): Map<number, Player> {
  return new Map(players.map((p) => [p.id, p]));
}

export function isPlayerSuspended(player: Player): boolean {
  return player.suspensionMatches > 0;
}

export function isPlayerPendingRegistration(player: Player): boolean {
  return player.registrationMatches > 0;
}

export function isPlayerInjured(player: Player): boolean {
  return player.injuryDays > 0;
}

export function isPlayerAvailable(player: Player): boolean {
  return (
    !isPlayerSuspended(player) &&
    !isPlayerInjured(player) &&
    !isPlayerPendingRegistration(player)
  );
}

export function collectLineupPlayerIds(
  homeLineupIds: readonly number[],
  awayLineupIds: readonly number[]
): ReadonlySet<number> {
  return new Set([...homeLineupIds, ...awayLineupIds]);
}

export function tickRegistrationAfterMatch(
  players: Player[],
  clubIdsWhoPlayed: number[]
): void {
  for (const clubId of clubIdsWhoPlayed) {
    for (const player of players) {
      if (player.clubId !== clubId) continue;
      if (player.registrationMatches <= 0) continue;
      player.registrationMatches--;
    }
  }
}
