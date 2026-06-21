import type {
  Club,
  Coach,
  CoachOffer,
  CoachRecord,
  Fixture,
  GameState,
  Standing,
} from "@/engine/types";
import { DISTRITAL_DIVISION, NATIONAL_DIVISION_COUNT, getGameSeed } from "@/engine/types";
import { getStandingPosition, sortStandings } from "@/engine/club";
import { createRng, generateCoachName } from "@/data/name-generator";
import { getPlayersByClub, effectiveSkill } from "@/engine/player";
import { buildDefaultSquad } from "@/engine/squad";

function getCoachById(state: GameState, coachId: number | null): CoachRecord | null {
  if (coachId == null) return null;
  return state.coaches.find((coach) => coach.id === coachId) ?? null;
}

function getCoachByClub(state: GameState, club: Club): CoachRecord | null {
  return getCoachById(state, club.coachId);
}

function applyCoachToClubDisplay(club: Club, coach: CoachRecord | null): void {
  if (!coach) {
    club.coachName = "Cargo vago";
    club.coachReputation = 0;
    club.coachId = null;
    return;
  }
  club.coachId = coach.id;
  club.coachName = coach.name;
  club.coachReputation = club.morale;
}

export function applyNewCoachToClub(club: Club, coach: CoachRecord): void {
  applyCoachToClubDisplay(club, coach);
  club.morale = 50;
  club.coachReputation = club.morale;
  club.coachRecentlyFired = false;
}

export function createCoach(name: string, coachId = 1): Coach {
  return {
    name,
    coachId,
    currentClubId: null,
    offers: [],
  };
}

export function createCoachRecord(
  id: number,
  name: string,
  currentClubId: number | null
): CoachRecord {
  return {
    id,
    name,
    currentClubId,
    lastClubId: null,
    matchesWon: 0,
    matchesDrawn: 0,
    matchesLost: 0,
    titles: 0,
    respectScore: 0,
    seasonsCoached: 0,
    lastSeasonActive: 1,
  };
}

export function initializeCoachRegistry(
  clubs: Club[],
  humanClubId: number,
  humanCoachName: string,
  season: number
): { coaches: CoachRecord[]; humanCoachId: number; nextCoachId: number } {
  const coaches: CoachRecord[] = [];
  let nextCoachId = 1;
  let humanCoachId = 1;

  for (const club of clubs) {
    const isHumanClub = club.id === humanClubId;
    const name = isHumanClub ? humanCoachName : club.coachName;
    const coach = createCoachRecord(
      nextCoachId++,
      name,
      club.id
    );
    coach.lastSeasonActive = season;
    coaches.push(coach);
    applyCoachToClubDisplay(club, coach);
    if (isHumanClub) {
      humanCoachId = coach.id;
    }
  }

  return { coaches, humanCoachId, nextCoachId };
}

export function getHumanCoachRecord(state: GameState): CoachRecord | null {
  return getCoachById(state, state.coach.coachId);
}

function syncHumanCoachNameFromRecord(state: GameState): void {
  const humanCoach = getHumanCoachRecord(state);
  if (!humanCoach || state.isLocalMultiplayer) return;
  const displayName = state.coach.name.trim();
  if (displayName && humanCoach.name !== displayName) {
    humanCoach.name = displayName;
  }
}

/** Nome do jogador humano definido ao criar o jogo (não o nome gerado do registro CPU). */
export function getHumanManagerDisplayName(state: GameState): string {
  if (state.isLocalMultiplayer && state.localManagers.length > 0) {
    const byClub = state.localManagers.find((m) => m.clubId === state.humanClubId);
    const active = state.localManagers[state.activeManagerIndex];
    return (byClub ?? active)?.name ?? state.coach.name;
  }
  const name = state.coach.name.trim();
  if (name) return name;
  return getHumanCoachRecord(state)?.name ?? "Jogador";
}

export function registerCoachMatchResult(
  coach: CoachRecord,
  goalsFor: number,
  goalsAgainst: number
): void {
  if (goalsFor > goalsAgainst) {
    coach.matchesWon += 1;
    return;
  }
  if (goalsFor < goalsAgainst) {
    coach.matchesLost += 1;
    return;
  }
  coach.matchesDrawn += 1;
}

export function registerCoachTitle(coach: CoachRecord): void {
  coach.titles += 1;
}

export function registerCoachMatchResultForClub(
  state: GameState,
  clubId: number,
  goalsFor: number,
  goalsAgainst: number
): void {
  const club = state.clubs.find((c) => c.id === clubId);
  if (!club) return;
  const coach = getCoachByClub(state, club);
  if (!coach) return;
  registerCoachMatchResult(coach, goalsFor, goalsAgainst);
  applyCoachToClubDisplay(club, coach);
  syncHumanCoachNameFromRecord(state);
}

export function registerCoachTitleForClub(
  state: GameState,
  clubId: number
): void {
  const club = state.clubs.find((c) => c.id === clubId);
  if (!club) return;
  const coach = getCoachByClub(state, club);
  if (!coach) return;
  registerCoachTitle(coach);
  applyCoachToClubDisplay(club, coach);
  syncHumanCoachNameFromRecord(state);
}

export function checkDismissal(club: Club): boolean {
  if (club.division === DISTRITAL_DIVISION) return false;
  return club.morale <= 10;
}

function getDivisionStandingsLocal(
  state: GameState,
  division: number
): Standing[] {
  const divClubIds = new Set(
    state.clubs.filter((c) => c.division === division).map((c) => c.id)
  );
  return sortStandings(
    state.standings.filter((s) => divClubIds.has(s.clubId)),
    state.clubs
  );
}

function getClubPosition(state: GameState, club: Club): {
  position: number;
  totalTeams: number;
} {
  if (club.division === DISTRITAL_DIVISION) {
    return { position: 0, totalTeams: 0 };
  }
  const standings = getDivisionStandingsLocal(state, club.division);
  return {
    position: getStandingPosition(standings, state.clubs, club.id),
    totalTeams: standings.length,
  };
}

function didLoseInRound(clubId: number, fixtures: Fixture[]): boolean {
  return fixtures.some((fixture) => {
    if (!fixture.played || fixture.homeGoals == null || fixture.awayGoals == null) {
      return false;
    }
    if (fixture.homeClubId === clubId) return fixture.homeGoals < fixture.awayGoals;
    if (fixture.awayClubId === clubId) return fixture.awayGoals < fixture.homeGoals;
    return false;
  });
}

function getClubGeneralSquadStrength(state: GameState, clubId: number): number {
  const squad = getPlayersByClub(state.players, clubId);
  if (squad.length === 0) return 0;
  const lineupIds = buildDefaultSquad(squad).lineupIds;
  const lineup = lineupIds
    .map((id) => squad.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const basis = lineup.length > 0 ? lineup : squad;
  const total = basis.reduce((sum, player) => sum + effectiveSkill(player), 0);
  return total / basis.length;
}

function getDivisionGapPenalty(fromDivision: number, toDivision: number): number {
  if (toDivision >= fromDivision) return 0;
  const jump = fromDivision - toDivision;
  if (jump <= 1) return 0.08;
  if (jump === 2) return 0.22;
  return 0.4;
}

function getUnemployedSeasons(state: GameState, coach: CoachRecord): number {
  if (coach.currentClubId != null) return 0;
  return Math.max(0, state.season - coach.lastSeasonActive);
}

function vacancyIsStrongerThanCoachClub(
  state: GameState,
  vacancy: Club,
  coachClub: Club
): boolean {
  return (
    getClubGeneralSquadStrength(state, vacancy.id) >
    getClubGeneralSquadStrength(state, coachClub.id)
  );
}

const MAX_CROSS_DIVISION_GAP = 2;

function passesSameDivisionStrengthRule(
  state: GameState,
  vacancy: Club,
  coachClub: Club
): boolean {
  return vacancyIsStrongerThanCoachClub(state, vacancy, coachClub);
}

const MIN_TABLE_RANKS_IMPROVEMENT = 3;

function passesSameDivisionTableUpgradeRule(
  state: GameState,
  vacancy: Club,
  coachClub: Club
): boolean {
  const vacancyPos = getClubPosition(state, vacancy);
  const coachPos = getClubPosition(state, coachClub);
  if (vacancyPos.totalTeams <= 0 || coachPos.totalTeams <= 0) return false;
  if (vacancyPos.position <= 0 || coachPos.position <= 0) return false;
  return vacancyPos.position + MIN_TABLE_RANKS_IMPROVEMENT <= coachPos.position;
}

function releaseCoachFromClub(
  coach: CoachRecord,
  fromClubId: number,
  season: number
): void {
  coach.currentClubId = null;
  coach.lastClubId = fromClubId;
  coach.lastSeasonActive = season;
}

function getCoachOriginClub(
  state: GameState,
  coach: CoachRecord
): Club | null {
  if (coach.currentClubId != null) {
    return state.clubs.find((club) => club.id === coach.currentClubId) ?? null;
  }
  if (coach.lastClubId == null) return null;
  return state.clubs.find((club) => club.id === coach.lastClubId) ?? null;
}

function isTableLeadersClub(state: GameState, club: Club): boolean {
  const pos = getClubPosition(state, club);
  if (pos.totalTeams <= 0 || pos.position <= 0) return false;
  const protectedTop = Math.max(4, Math.ceil(pos.totalTeams * 0.25));
  return pos.position <= protectedTop;
}

function passesLeadershipProtection(
  state: GameState,
  vacancy: Club,
  originClub: Club
): boolean {
  if (originClub.division !== vacancy.division) return true;

  const originPos = getClubPosition(state, originClub);
  const vacancyPos = getClubPosition(state, vacancy);
  if (originPos.totalTeams <= 0 || originPos.position <= 0) return true;
  if (vacancyPos.position <= 0) return false;

  if (!isTableLeadersClub(state, originClub)) return true;

  return vacancyPos.position < originPos.position;
}

function passesSameDivisionPoachRule(
  state: GameState,
  vacancy: Club,
  coachClub: Club
): boolean {
  return (
    passesLeadershipProtection(state, vacancy, coachClub) &&
    passesSameDivisionStrengthRule(state, vacancy, coachClub) &&
    passesSameDivisionTableUpgradeRule(state, vacancy, coachClub)
  );
}

const MIN_CLUB_MORALE_TO_RELEASE_COACH = 55;
const MIN_DISTRITAL_MORALE_FOR_FOURTH = 45;

function passesCoachHiringFromOrigin(
  state: GameState,
  vacancy: Club,
  coach: CoachRecord
): boolean {
  if (coach.currentClubId == null) {
    if (getUnemployedSeasons(state, coach) >= 2) return true;
    const originClub = getCoachOriginClub(state, coach);
    if (!originClub) return passesUnemployedVacancyDivision(vacancy);
    if (originClub.isHuman) return false;
    if (
      originClub.division >= 3 &&
      originClub.division <= NATIONAL_DIVISION_COUNT
    ) {
      return passesUnemployedVacancyDivision(vacancy);
    }
    return passesCpuPoachDivisionRule(state, originClub, vacancy);
  }

  const originClub = getCoachOriginClub(state, coach);
  if (!originClub) return true;

  if (originClub.isHuman) return false;

  if (originClub.morale < MIN_CLUB_MORALE_TO_RELEASE_COACH) {
    return false;
  }

  return passesCpuPoachDivisionRule(state, originClub, vacancy);
}

function passesUnemployedVacancyDivision(vacancy: Club): boolean {
  return vacancy.division >= 3 && vacancy.division <= NATIONAL_DIVISION_COUNT;
}

function passesCoachVacancyDivisionRule(
  state: GameState,
  vacancy: Club,
  candidateClub: Club | null
): boolean {
  if (!candidateClub) {
    return passesUnemployedVacancyDivision(vacancy);
  }

  if (vacancy.division === candidateClub.division) {
    return passesSameDivisionPoachRule(state, vacancy, candidateClub);
  }

  const gap = Math.abs(vacancy.division - candidateClub.division);
  if (gap > MAX_CROSS_DIVISION_GAP) return false;

  return vacancyIsStrongerThanCoachClub(state, vacancy, candidateClub);
}

function isDistritalPromotionToFourth(vacancy: Club, sourceClub: Club): boolean {
  return (
    vacancy.division === NATIONAL_DIVISION_COUNT &&
    sourceClub.division === DISTRITAL_DIVISION
  );
}

function passesCpuPoachDivisionRule(
  state: GameState,
  sourceClub: Club,
  vacancy: Club
): boolean {
  if (isDistritalPromotionToFourth(vacancy, sourceClub)) return true;

  if (sourceClub.division === vacancy.division) {
    return passesSameDivisionPoachRule(state, vacancy, sourceClub);
  }

  if (vacancy.division > sourceClub.division && isTableLeadersClub(state, sourceClub)) {
    return false;
  }

  const gap = Math.abs(sourceClub.division - vacancy.division);
  if (gap > MAX_CROSS_DIVISION_GAP) return false;

  return vacancyIsStrongerThanCoachClub(state, vacancy, sourceClub);
}

function shouldDismissMidSeason(
  _state: GameState,
  club: Club,
  lostInRound: boolean,
  _rng: () => number
): boolean {
  if (club.division === DISTRITAL_DIVISION || club.coachRecentlyFired) {
    return false;
  }
  if (!lostInRound || club.morale > 10) return false;
  return true;
}

function getOfferManagerName(state: GameState): string {
  return getHumanManagerDisplayName(state);
}

function makeCoachOffer(
  state: GameState,
  club: Club,
  id: number,
  reason: string
): CoachOffer {
  return {
    id,
    clubId: club.id,
    clubName: club.name,
    division: club.division,
    managerName: getOfferManagerName(state),
    reason,
  };
}

function ensureGeneratedCoachForClub(state: GameState, club: Club): CoachRecord {
  const nameRng = createRng(
    club.id * 791 + state.season * 13 + state.nextCoachId + getGameSeed(state)
  );
  const generated = createCoachRecord(
    state.nextCoachId++,
    generateCoachName(club.country, nameRng),
    club.id
  );
  generated.lastSeasonActive = state.season;
  state.coaches.push(generated);
  applyNewCoachToClub(club, generated);
  return generated;
}

function getCoachAvailabilityMoraleScore(
  state: GameState,
  coach: CoachRecord
): number {
  if (coach.currentClubId == null) {
    return 48 + Math.min(22, getUnemployedSeasons(state, coach) * 5);
  }

  const sourceClub =
    state.clubs.find((club) => club.id === coach.currentClubId) ?? null;
  if (!sourceClub || sourceClub.morale < MIN_CLUB_MORALE_TO_RELEASE_COACH) {
    return -1;
  }

  const positionInfo = getClubPosition(state, sourceClub);
  const tableBoost =
    positionInfo.totalTeams > 0 && positionInfo.position > 0
      ? (positionInfo.totalTeams - positionInfo.position + 1) * 6
      : 0;

  return sourceClub.morale * 2.5 + tableBoost;
}

function getHumanOfferMoraleScore(state: GameState, coach: Coach): number {
  const humanCoach = getHumanCoachRecord(state);
  if (!humanCoach) return -1;

  const humanClub =
    coach.currentClubId == null
      ? null
      : state.clubs.find((club) => club.id === state.humanClubId) ?? null;

  if (!humanClub) {
    return 38 + Math.min(12, getUnemployedSeasons(state, humanCoach) * 4);
  }

  const positionInfo = getClubPosition(state, humanClub);
  const tableBoost =
    positionInfo.totalTeams > 0 && positionInfo.position > 0
      ? (positionInfo.totalTeams - positionInfo.position + 1) * 6
      : 0;

  return humanClub.morale * 2.5 + tableBoost;
}

function passesMidSeasonOfferRules(
  state: GameState,
  coach: Coach,
  vacancy: Club
): boolean {
  const humanClub =
    coach.currentClubId == null
      ? null
      : state.clubs.find((club) => club.id === state.humanClubId) ?? null;

  if (!humanClub) {
    return passesCoachVacancyDivisionRule(state, vacancy, null);
  }
  if (humanClub.id === vacancy.id) return false;
  if (!passesCoachVacancyDivisionRule(state, vacancy, humanClub)) return false;

  if (vacancy.division < humanClub.division) {
    const jump = humanClub.division - vacancy.division;
    if (jump >= 2 && humanClub.morale < 62) return false;
    if (jump >= 3 && humanClub.morale < 75) return false;
  }

  return true;
}

function isClubVacant(club: Club): boolean {
  return club.coachId == null || club.coachName === "Cargo vago";
}

function assignCoachWithSwap(
  state: GameState,
  vacancy: Club,
  incoming: CoachRecord,
  outgoing: CoachRecord | null
): string[] {
  const sourceClub =
    incoming.currentClubId == null
      ? null
      : state.clubs.find((entry) => entry.id === incoming.currentClubId) ?? null;
  const incomingName = incoming.name;
  const fromDistrital =
    sourceClub != null && sourceClub.division === DISTRITAL_DIVISION;

  if (sourceClub && incoming.currentClubId === sourceClub.id) {
    sourceClub.coachId = null;
    sourceClub.coachName = "Cargo vago";
    sourceClub.coachReputation = 0;
  }

  incoming.currentClubId = vacancy.id;
  incoming.lastClubId = null;
  incoming.lastSeasonActive = state.season;
  applyNewCoachToClub(vacancy, incoming);

  const messages =
    fromDistrital && sourceClub
      ? [
          `${vacancy.name} contratou ${incomingName} (promovido do distrital, ${sourceClub.name}).`,
        ]
      : [`${vacancy.name} contratou ${incomingName}.`];

  if (fromDistrital && sourceClub) {
    const generated = ensureGeneratedCoachForClub(state, sourceClub);
    messages.push(`${sourceClub.name} repôs o cargo com ${generated.name}.`);
    return messages;
  }

  if (
    sourceClub &&
    outgoing &&
    outgoing.id !== incoming.id &&
    sourceClub.division !== DISTRITAL_DIVISION &&
    outgoing.currentClubId == null
  ) {
    outgoing.currentClubId = sourceClub.id;
    outgoing.lastClubId = null;
    outgoing.lastSeasonActive = state.season;
    applyNewCoachToClub(sourceClub, outgoing);
    messages.push(
      `${sourceClub.name} contratou ${outgoing.name} (troca com ${vacancy.name}).`
    );
    return messages;
  }

  if (sourceClub && sourceClub.division !== DISTRITAL_DIVISION) {
    const generated = ensureGeneratedCoachForClub(state, sourceClub);
    messages.push(`${sourceClub.name} repôs o cargo com ${generated.name}.`);
  }

  return messages;
}

function findAllCpuCoachCandidates(
  state: GameState,
  vacancy: Club,
  excludeCoachIds: Set<number> = new Set()
): CoachRecord[] {
  const distrital =
    vacancy.division === NATIONAL_DIVISION_COUNT
      ? state.coaches.filter((coach) => {
          if (coach.id === state.coach.coachId) return false;
          if (excludeCoachIds.has(coach.id)) return false;
          if (coach.currentClubId === vacancy.id) return false;
          const sourceClub =
            coach.currentClubId == null
              ? null
              : state.clubs.find((club) => club.id === coach.currentClubId) ?? null;
          if (!sourceClub || sourceClub.division !== DISTRITAL_DIVISION) return false;
          if (sourceClub.isHuman) return false;
          if (sourceClub.morale < MIN_DISTRITAL_MORALE_FOR_FOURTH) return false;
          return passesCpuPoachDivisionRule(state, sourceClub, vacancy);
        })
      : [];

  const general = state.coaches.filter((coach) => {
    if (coach.id === state.coach.coachId) return false;
    if (excludeCoachIds.has(coach.id)) return false;
    if (coach.currentClubId === vacancy.id) return false;

    const currentClub =
      coach.currentClubId == null
        ? null
        : state.clubs.find((club) => club.id === coach.currentClubId) ?? null;
    if (currentClub?.isHuman) return false;

    if (!passesCoachHiringFromOrigin(state, vacancy, coach)) return false;

    return getCoachAvailabilityMoraleScore(state, coach) >= 0;
  });

  const sortCandidates = (a: CoachRecord, b: CoachRecord) => {
    const aUnemployed = a.currentClubId == null ? 1 : 0;
    const bUnemployed = b.currentClubId == null ? 1 : 0;
    if (bUnemployed !== aUnemployed) return bUnemployed - aUnemployed;
    const scoreDiff =
      getCoachAvailabilityMoraleScore(state, b) -
      getCoachAvailabilityMoraleScore(state, a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.id - b.id;
  };

  const distritalSorted = [...distrital].sort((a, b) => {
    const clubA =
      state.clubs.find((club) => club.id === a.currentClubId) ?? null;
    const clubB =
      state.clubs.find((club) => club.id === b.currentClubId) ?? null;
    return (
      (clubB?.morale ?? 0) - (clubA?.morale ?? 0) ||
      getClubGeneralSquadStrength(state, clubB?.id ?? 0) -
        getClubGeneralSquadStrength(state, clubA?.id ?? 0) ||
      a.id - b.id
    );
  });

  const generalSorted = [...general].sort(sortCandidates);
  const seen = new Set<number>();
  const merged: CoachRecord[] = [];
  for (const coach of [...distritalSorted, ...generalSorted]) {
    if (seen.has(coach.id)) continue;
    seen.add(coach.id);
    merged.push(coach);
  }
  return merged;
}

function findBestCpuCoachCandidate(
  state: GameState,
  vacancy: Club,
  excludeCoachIds: Set<number> = new Set()
): CoachRecord | null {
  return findAllCpuCoachCandidates(state, vacancy, excludeCoachIds)[0] ?? null;
}

export function fillClubVacancyUntilFilled(
  state: GameState,
  club: Club,
  options?: { excludeCoachIds?: number[]; firedCoach?: CoachRecord | null }
): string[] {
  if (!isClubVacant(club)) return [];

  const tried = new Set(options?.excludeCoachIds ?? []);
  const firedCoach = options?.firedCoach ?? null;
  const messages: string[] = [];

  while (isClubVacant(club)) {
    const candidate = findBestCpuCoachCandidate(state, club, tried);
    if (!candidate) break;
    tried.add(candidate.id);
    messages.push(...assignCoachWithSwap(state, club, candidate, firedCoach));
  }

  if (isClubVacant(club)) {
    const generated = ensureGeneratedCoachForClub(state, club);
    messages.push(`${club.name} contratou ${generated.name}.`);
  }

  return messages;
}

function fillClubVacancy(
  state: GameState,
  club: Club,
  options?: { excludeCoachIds?: number[]; firedCoach?: CoachRecord | null }
): string[] {
  return fillClubVacancyUntilFilled(state, club, options);
}

function assignCpuCoachToVacantClub(
  state: GameState,
  club: Club,
  options?: { excludeCoachIds?: number[] }
): string[] {
  return fillClubVacancy(state, club, options);
}

function shouldOfferHumanMidSeason(
  state: GameState,
  coach: Coach,
  vacancy: Club,
  excludeCoachIds?: Set<number>
): boolean {
  if (!passesMidSeasonOfferRules(state, coach, vacancy)) return false;

  if (state.coach.currentClubId === null) {
    return passesUnemployedVacancyDivision(vacancy);
  }

  const humanScore = getHumanOfferMoraleScore(state, coach);
  const cpuCandidate = findBestCpuCoachCandidate(state, vacancy, excludeCoachIds);
  const cpuScore = cpuCandidate
    ? getCoachAvailabilityMoraleScore(state, cpuCandidate) ||
      getDistritalCoachMoraleScore(state, cpuCandidate)
    : 0;

  return humanScore > cpuScore;
}

function restoreFormerHumanClubMorale(state: GameState): string[] {
  if (state.coach.currentClubId != null) return [];

  const formerClub = state.clubs.find((club) => club.id === state.humanClubId);
  if (!formerClub || formerClub.isHuman) return [];

  const clubCoach = getCoachByClub(state, formerClub);
  if (clubCoach) {
    applyNewCoachToClub(formerClub, clubCoach);
    return [];
  }
  if (formerClub.coachName === "Cargo vago") {
    return fillClubVacancy(state, formerClub);
  }
  return [];
}

function dismissHumanFromClub(
  state: GameState,
  club: Club,
  humanCoach: CoachRecord | null
): string[] {
  if (humanCoach) {
    releaseCoachFromClub(humanCoach, club.id, state.season);
  }
  club.isHuman = false;
  club.coachId = null;
  club.coachName = "Cargo vago";
  club.coachRecentlyFired = true;
  club.coachReputation = 0;
  return fillClubVacancyUntilFilled(state, club, {
    excludeCoachIds: humanCoach ? [humanCoach.id] : [],
  });
}

function getDistritalCoachMoraleScore(
  state: GameState,
  coach: CoachRecord
): number {
  const sourceClub =
    coach.currentClubId == null
      ? null
      : state.clubs.find((club) => club.id === coach.currentClubId) ?? null;
  if (!sourceClub || sourceClub.division !== DISTRITAL_DIVISION) return 0;
  return sourceClub.morale * 2.5;
}

export function rejectCoachOffer(state: GameState, offerId: number): GameState {
  const offer = state.coach.offers.find((o) => o.id === offerId);
  const rejectedClub = offer
    ? state.clubs.find((club) => club.id === offer.clubId)
    : null;
  const messages = [...state.messages];
  const coaches = state.coaches.map((entry) => ({ ...entry }));
  const localState: GameState = { ...state, coaches };

  if (rejectedClub) {
    if (rejectedClub.coachName === "Cargo vago") {
      const vacancyMessages = fillClubVacancy(localState, rejectedClub);
      messages.push(`Você recusou a proposta do ${rejectedClub.name}.`);
      messages.push(...vacancyMessages);
    } else {
      messages.push(`Você recusou a proposta do ${rejectedClub.name}.`);
    }
  }

  messages.push(...restoreFormerHumanClubMorale(localState));

  return {
    ...localState,
    nextCoachId: localState.nextCoachId,
    coach: {
      ...state.coach,
      offers: state.coach.offers.filter((o) => o.id !== offerId),
    },
    messages,
  };
}

export function processMidSeasonCoaches(
  state: GameState,
  fixtures: Fixture[]
): GameState {
  if (state.phase !== "regular") return state;
  if (state.isLocalMultiplayer) return state;

  const rng = createRng(state.season * 9001 + state.round * 313 + getGameSeed(state));
  const messages = [...state.messages];
  let coach = { ...state.coach, offers: [...state.coach.offers] };
  const coaches = state.coaches.map((entry) => ({ ...entry }));
  const localState: GameState = { ...state, coaches };
  let humanDismissed = false;
  const firedCoachByClub = new Map<number, CoachRecord>();

  const vacancies: Club[] = [];
  for (const club of state.clubs) {
    const lost = didLoseInRound(club.id, fixtures);
    if (!shouldDismissMidSeason(state, club, lost, rng)) continue;

    const wasHuman = club.id === state.humanClubId && coach.currentClubId === club.id;
    const firedCoach = getCoachByClub(localState, club);
    const firedName = wasHuman ? coach.name : firedCoach?.name ?? club.coachName;
    if (firedCoach) {
      releaseCoachFromClub(firedCoach, club.id, localState.season);
      firedCoachByClub.set(club.id, firedCoach);
    }
    club.coachId = null;
    club.coachName = "Cargo vago";
    club.coachRecentlyFired = true;
    club.coachReputation = 0;
    messages.push(`${club.name} demitiu ${firedName} após a sequência ruim.`);

    if (wasHuman) {
      club.isHuman = false;
      coach = { ...coach, currentClubId: null, offers: [] };
      humanDismissed = true;
      messages.push(
        ...assignCpuCoachToVacantClub(localState, club, {
          excludeCoachIds: firedCoach ? [firedCoach.id] : [],
        })
      );
      messages.push("Você foi demitido. As rodadas avançarão até surgir uma proposta.");
    } else {
      vacancies.push(club);
    }
  }

  let nextOfferId = Math.max(0, ...coach.offers.map((o) => o.id)) + 1;
  for (const vacancy of vacancies) {
    const firedCoach = firedCoachByClub.get(vacancy.id);
    const excludeCoachIds =
      firedCoach != null ? new Set([firedCoach.id]) : undefined;

    if (shouldOfferHumanMidSeason({ ...localState, coach }, coach, vacancy, excludeCoachIds)) {
      if (!coach.offers.some((offer) => offer.clubId === vacancy.id)) {
        coach.offers.push(
          makeCoachOffer(
            localState,
            vacancy,
            nextOfferId++,
            humanDismissed
              ? "Clube procura novo técnico após demissão."
              : "Seu bom trabalho chamou atenção."
          )
        );
      }
      continue;
    }

    messages.push(
      ...fillClubVacancy(localState, vacancy, {
        excludeCoachIds: firedCoach != null ? [firedCoach.id] : [],
        firedCoach: firedCoach ?? null,
      })
    );
  }

  return {
    ...state,
    coaches,
    nextCoachId: localState.nextCoachId,
    coach,
    messages,
  };
}

export function generateCoachOffers(
  state: GameState,
  excludeClubId: number,
  seed: number
): CoachOffer[] {
  const humanCoach = getHumanCoachRecord(state);
  const humanClub =
    state.coach.currentClubId == null
      ? null
      : state.clubs.find((c) => c.id === state.humanClubId) ?? null;
  const humanMorale = humanClub?.morale ?? 45;
  const rng = createRng(seed + humanMorale * 17);
  const offers: CoachOffer[] = [];
  let offerId = 1;

  const candidates = state.clubs
    .filter((club) => {
      if (club.id === excludeClubId) return false;
      if (club.division > NATIONAL_DIVISION_COUNT) return false;
      if (club.isHuman) return false;
      if (!passesCoachVacancyDivisionRule(state, club, humanClub)) {
        return false;
      }
      return true;
    })
    .map((club) => {
      const fromDivision = humanClub?.division ?? 4;
      const divisionPenalty = getDivisionGapPenalty(fromDivision, club.division) * 80;
      const moraleBoost = humanClub ? (humanClub.morale - 50) * 2.2 : 0;
      const positionInfo = humanClub ? getClubPosition(state, humanClub) : null;
      const employedComfort =
        humanClub &&
        state.coach.currentClubId === humanClub.id &&
        humanClub.morale >= 45 &&
        positionInfo &&
        positionInfo.totalTeams > 0 &&
        positionInfo.position > 0 &&
        positionInfo.position <= Math.ceil(positionInfo.totalTeams * 0.5)
          ? -120
          : 0;
      const squadStrength = getClubGeneralSquadStrength(state, club.id);
      const strengthBoost = squadStrength * 2.2;
      const financeBoost = Math.log10(Math.max(10_000, club.finances + 10_000)) * 40;
      const sameDivisionCrisisBoost =
        humanClub &&
        humanClub.division === club.division &&
        humanClub.morale >= 72 &&
        club.morale <= 44
          ? 90
          : 0;
      const unemployedBonus =
        humanCoach && humanCoach.currentClubId == null
          ? Math.min(60, getUnemployedSeasons(state, humanCoach) * 12)
          : 0;
      const noisy = rng() * 40 - 20;
      const score =
        humanMorale * 2.2 -
        divisionPenalty +
        moraleBoost +
        strengthBoost +
        financeBoost +
        sameDivisionCrisisBoost +
        unemployedBonus +
        employedComfort +
        noisy;
      return { club, score };
    })
    .filter((entry) => entry.score > -90)
    .sort((a, b) => b.score - a.score);

  const managerName = getOfferManagerName(state);
  const count = Math.min(3, candidates.length);

  for (let i = 0; i < count; i++) {
    const club = candidates[i]!.club;
    offers.push({
      id: offerId++,
      clubId: club.id,
      clubName: club.name,
      division: club.division,
      managerName,
    });
  }

  return offers;
}

export function acceptCoachOffer(
  state: GameState,
  offerId: number
): GameState {
  const offer = state.coach.offers.find((o) => o.id === offerId);
  if (!offer) return state;

  const coaches = state.coaches.map((entry) => ({ ...entry }));
  const localState: GameState = { ...state, coaches };
  const oldClub = localState.clubs.find((c) => c.id === state.humanClubId);
  let humanCoach = getHumanCoachRecord(localState);
  const newClub = localState.clubs.find((c) => c.id === offer.clubId)!;
  const displacedCoach = getCoachByClub(localState, newClub);
  const wasUnemployed = state.coach.currentClubId === null;
  const switchingEmployedClub =
    !wasUnemployed && oldClub != null && oldClub.id !== offer.clubId;
  const messages = [...state.messages];
  const coachName = getHumanManagerDisplayName(state);

  if (!humanCoach) {
    humanCoach = createCoachRecord(
      state.coach.coachId,
      state.coach.name,
      null
    );
    localState.coaches.push(humanCoach);
  }

  if (switchingEmployedClub && oldClub) {
    releaseCoachFromClub(humanCoach, oldClub.id, localState.season);
    oldClub.isHuman = false;
    oldClub.coachId = null;
    oldClub.coachName = "Cargo vago";
    oldClub.coachReputation = 0;

    if (displacedCoach && displacedCoach.id !== humanCoach.id) {
      releaseCoachFromClub(displacedCoach, newClub.id, localState.season);
      displacedCoach.currentClubId = oldClub.id;
      displacedCoach.lastClubId = null;
      displacedCoach.lastSeasonActive = localState.season;
      applyNewCoachToClub(oldClub, displacedCoach);
      messages.push(
        `${oldClub.name} contratou ${displacedCoach.name} (troca com ${newClub.name}).`
      );
    } else {
      messages.push(
        ...fillClubVacancyUntilFilled(localState, oldClub, {
          excludeCoachIds: [humanCoach.id],
        })
      );
    }
  } else if (
    displacedCoach &&
    displacedCoach.id !== humanCoach.id &&
    !isClubVacant(newClub)
  ) {
    releaseCoachFromClub(displacedCoach, newClub.id, localState.season);
    newClub.coachId = null;
    newClub.coachName = "Cargo vago";
    newClub.coachReputation = 0;
  }

  newClub.isHuman = true;
  humanCoach.currentClubId = offer.clubId;
  humanCoach.lastClubId = null;
  humanCoach.lastSeasonActive = localState.season;
  applyNewCoachToClub(newClub, humanCoach);

  const updatedLocalManagers = state.isLocalMultiplayer
    ? state.localManagers
    : state.localManagers.map((manager, index) =>
        index === 0
          ? {
              ...manager,
              clubId: offer.clubId,
              ready: false,
              lineupPlayerIds: [],
              benchPlayerIds: [],
              formation: null,
            }
          : manager
      );

  return {
    ...localState,
    humanClubId: offer.clubId,
    nextCoachId: localState.nextCoachId,
    localManagers: updatedLocalManagers,
    lineupPlayerIds: [],
    benchPlayerIds: [],
    humanFormation: null,
    auctionBidderClubId: offer.clubId,
    coach: {
      ...state.coach,
      currentClubId: offer.clubId,
      offers: [],
    },
    phase: state.phase,
    messages: [
      ...messages,
      `${offer.clubName} contratou ${coachName}.`,
      `Você assumiu o ${offer.clubName} (${offer.division}ª divisão). Moral do clube: 50%.`,
    ],
  };
}

export function evaluateEndOfSeasonCoach(
  state: GameState,
  wasPromoted: boolean,
  wasRelegated: boolean,
  seed: number
): GameState {
  void wasPromoted;

  const humanCoach = getHumanCoachRecord(state);
  if (humanCoach) {
    humanCoach.seasonsCoached += 1;
    humanCoach.lastSeasonActive = state.season;
  }

  if (state.coach.currentClubId === null) {
    return {
      ...state,
      messages: [
        ...state.messages,
        "Fim da temporada: você segue aguardando proposta de clubes.",
      ],
    };
  }

  const humanClub = state.clubs.find((c) => c.id === state.humanClubId)!;

  if (humanClub.division === DISTRITAL_DIVISION) {
    if (wasRelegated) {
      const coaches = state.coaches.map((entry) => ({ ...entry }));
      const localState: GameState = { ...state, coaches };
      const club = localState.clubs.find((c) => c.id === state.humanClubId)!;
      const fillMessages = dismissHumanFromClub(localState, club, humanCoach);

      const offers = generateCoachOffers(localState, state.humanClubId, seed);
      return {
        ...localState,
        nextCoachId: localState.nextCoachId,
        coach: { ...state.coach, offers, currentClubId: null },
        messages: [
          ...state.messages,
          ...fillMessages,
          `${club.name} foi rebaixado para o distrital. Demissão imediata — escolha um novo clube nas propostas.`,
        ],
      };
    }

    if (humanCoach) {
      applyCoachToClubDisplay(humanClub, humanCoach);
    }

    return {
      ...state,
      messages: [
        ...state.messages,
        `Fim de temporada no distrital. Moral do clube: ${Math.round(humanClub.morale)}%.`,
      ],
    };
  }

  const divStandings = getDivisionStandingsLocal(state, humanClub.division);
  const position = getStandingPosition(divStandings, state.clubs, state.humanClubId);
  const wonTitle = position === 1;
  if (wonTitle && humanCoach) registerCoachTitle(humanCoach);

  if (humanCoach) {
    applyCoachToClubDisplay(humanClub, humanCoach);
  }

  const messages = [
    ...state.messages,
    `Fim de temporada: ${position}º lugar. Moral do clube: ${Math.round(humanClub.morale)}%.`,
  ];

  if (checkDismissal(humanClub)) {
    const coaches = state.coaches.map((entry) => ({ ...entry }));
    const localState: GameState = { ...state, coaches };
    const fillMessages = dismissHumanFromClub(localState, humanClub, humanCoach);

    const offers = generateCoachOffers(localState, state.humanClubId, seed);
    return {
      ...localState,
      nextCoachId: localState.nextCoachId,
      coach: { ...state.coach, offers, currentClubId: null },
      messages: [
        ...messages,
        ...fillMessages,
        "Você foi demitido! Escolha uma nova equipe nas ofertas.",
      ],
    };
  }

  return {
    ...state,
    messages,
  };
}

export function getCoachRanking(state: GameState): Array<{
  coachId: number;
  name: string;
  clubId: number | null;
  clubName: string;
  division: number | null;
  matchesWon: number;
  matchesDrawn: number;
  matchesLost: number;
  titles: number;
  morale: number;
}> {
  return [...state.coaches]
    .map((coach) => {
      const club = state.clubs.find((entry) => entry.id === coach.currentClubId) ?? null;
      return {
        coachId: coach.id,
        name: coach.name,
        clubId: coach.currentClubId,
        clubName: club?.name ?? "Desempregado",
        division: club?.division ?? null,
        matchesWon: coach.matchesWon,
        matchesDrawn: coach.matchesDrawn,
        matchesLost: coach.matchesLost,
        titles: coach.titles,
        morale: club?.morale ?? 0,
      };
    })
    .sort((a, b) => {
      if (b.titles !== a.titles) return b.titles - a.titles;
      if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
      if (b.matchesDrawn !== a.matchesDrawn) return b.matchesDrawn - a.matchesDrawn;
      return b.morale - a.morale;
    });
}
