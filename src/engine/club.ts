import type {

  Club,

  CountryCode,

  Formation,

  Player,

  Standing,

} from "@/engine/types";

import {

  DISTRITAL_DIVISION,

  NATIONAL_DIVISION_COUNT,

  TEAMS_PER_DIVISION,

  getCountrySeed,

} from "@/engine/types";

import {
  getDistritalPoolTeams,
  getLeaguePoolTeams,
} from "@/data/teams-catalog";

import { getDefaultTicketPrice, initializeClubFinanceBudgets } from "@/engine/finances";

import { generateSquad } from "@/engine/player";

import { createRng, generateCoachName } from "@/data/name-generator";

import { resolveClubColors } from "@/data/club-colors";

import type { TeamCatalogEntry } from "@/engine/types";

const DIVISION_BASE_STADIUM_CAPACITY: Record<Club["division"], number> = {
  1: 42_000,
  2: 28_000,
  3: 18_000,
  4: 10_000,
  5: 6_000,
};

function divisionFromRank(rankIndex: number): 1 | 2 | 3 | 4 {
  return (Math.floor(rankIndex / TEAMS_PER_DIVISION) + 1) as 1 | 2 | 3 | 4;
}

/** Barreira de respeito que um clube exige do técnico (divisão + moral). */
export function getClubCoachExpectation(club: Club): number {
  const divisionBase = (6 - club.division) * 70;
  const moraleFactor = Math.round((club.morale - 50) * 2.5);
  return Math.max(100, Math.min(820, 140 + divisionBase + moraleFactor));
}

function createClubFromEntry(
  entry: TeamCatalogEntry,
  division: Club["division"],
  clubId: number,
  humanClubSlug: string | undefined
): Club {
  const div = division;
  const isHuman = humanClubSlug ? entry.slug === humanClubSlug : false;
  const coachNameRng = createRng(clubId * 791 + 17);
  return {
    id: clubId,
    name: entry.name,
    slug: entry.slug,
    country: entry.country,
    division: div,
    strengthIndex: entry.strength,
    reputation: entry.reputation,
    stadiumCapacity: DIVISION_BASE_STADIUM_CAPACITY[div],
    finances: 0,
    ticketPrice: getDefaultTicketPrice(div),
    loans: [],
    nextLoanId: 1,
    morale: 50,
    formation: "4-4-2",
    winStreak: 0,
    lossStreak: 0,
    isHuman,
    coachId: null,
    coachName: isHuman
      ? "Técnico"
      : generateCoachName(entry.country, coachNameRng),
    coachReputation: 0,
    coachRecentlyFired: false,
    primaryColor: entry.primaryColor,
    secondaryColor: entry.secondaryColor,
  };
}

export function distributeClubsFromCountries(
  countries: CountryCode[],
  humanClubSlug?: string,
  runSeed = 0
): { clubs: Club[]; players: Player[] } {
  const leaguePool = getLeaguePoolTeams(countries);
  const distritalPool = getDistritalPoolTeams(countries);

  const clubs: Club[] = [];
  const players: Player[] = [];
  let playerId = 1;
  let clubId = 1;
  const countryPart = getCountrySeed(countries);
  const baseSeed = (runSeed + countryPart * 997 + leaguePool.length * 31) >>> 0;

  leaguePool.forEach((entry, index) => {
    const division = divisionFromRank(index);
    const club = createClubFromEntry(entry, division, clubId++, humanClubSlug);
    clubs.push(club);
    const squadSeed = (baseSeed + club.id * 7919 + index * 313) >>> 0;
    const squad = generateSquad(
      club.id,
      club.slug,
      club.country,
      division,
      playerId,
      squadSeed
    );
    playerId += squad.length;
    players.push(...squad);
  });

  distritalPool.forEach((entry, index) => {
    const club = createClubFromEntry(
      entry,
      DISTRITAL_DIVISION,
      clubId++,
      humanClubSlug
    );
    clubs.push(club);
    const squadSeed =
      (baseSeed + club.id * 7919 + (leaguePool.length + index) * 313) >>> 0;
    const squad = generateSquad(
      club.id,
      club.slug,
      club.country,
      DISTRITAL_DIVISION,
      playerId,
      squadSeed
    );
    playerId += squad.length;
    players.push(...squad);
  });

  const budgetSeed =
    runSeed +
    countries.reduce(
      (sum, c, i) => sum + c.charCodeAt(1) * (i + 5) * 79,
      0
    );
  initializeClubFinanceBudgets(clubs, players, budgetSeed, 14);

  return { clubs, players };
}

/** @deprecated Use distributeClubsFromCountries */
export function distributeClubsIntoDivisions(
  country: CountryCode,
  humanClubSlug?: string
): { clubs: Club[]; players: Player[] } {
  return distributeClubsFromCountries([country], humanClubSlug);
}



export function createStandings(clubs: Club[]): Standing[] {

  return clubs

    .filter((c) => c.division <= NATIONAL_DIVISION_COUNT)

    .map((c) => ({

      clubId: c.id,

      played: 0,

      won: 0,

      drawn: 0,

      lost: 0,

      goalsFor: 0,

      goalsAgainst: 0,

      points: 0,

    }));

}



export function getClubById(clubs: Club[], id: number): Club | undefined {

  return clubs.find((c) => c.id === id);

}



export function getClubsByDivision(

  clubs: Club[],

  division: number

): Club[] {

  return clubs.filter((c) => c.division === division);

}



export function getNationalClubs(clubs: Club[]): Club[] {

  return clubs.filter((c) => c.division <= NATIONAL_DIVISION_COUNT);

}

interface MatchMoraleContext {
  competition?: "league" | "cup";
  ownDivision?: Club["division"];
  opponentDivision?: Club["division"];
}



export function applyMatchMorale(

  club: Club,

  goalsFor: number,

  goalsAgainst: number,

  ownStrength?: number,

  opponentStrength?: number,
  context: MatchMoraleContext = {}

): string[] {

  const messages: string[] = [];
  const competition = context.competition ?? "league";

  let delta = 0;
  const goalDiff = goalsFor - goalsAgainst;
  const strengthDiff =
    ownStrength != null && opponentStrength != null
      ? ownStrength - opponentStrength
      : 0;
  const upsetBonus = Math.max(0, -strengthDiff / 14);
  const expectedPenalty = Math.max(0, strengthDiff / 16);
  const ownDivision = context.ownDivision;
  const opponentDivision = context.opponentDivision;
  const divisionGap =
    ownDivision != null && opponentDivision != null
      ? opponentDivision - ownDivision
      : 0;



  if (goalsFor > goalsAgainst) {

    delta = 6 + Math.min(5, goalDiff - 1) + Math.round(upsetBonus * 1.2);

    club.winStreak++;

    club.lossStreak = 0;

    if (
      competition === "league" &&
      club.winStreak >= 4 &&
      club.winStreak % 2 === 0
    ) {

      delta += 10;

      messages.push(`${club.name}: embalo de vitórias (+10 moral)`);

    }

  } else if (goalsFor < goalsAgainst) {

    delta =
      -5 -
      Math.min(3, Math.abs(goalDiff) - 1) -
      Math.round(expectedPenalty * 0.8);

    club.lossStreak++;

    club.winStreak = 0;

    if (
      competition === "league" &&
      club.lossStreak >= 5 &&
      (club.lossStreak - 5) % 3 === 0
    ) {

      delta -= 6;

      messages.push(`${club.name}: crise técnica por derrotas seguidas (-6 moral)`);

    }

  } else {

    club.winStreak = 0;

    club.lossStreak = 0;

    if (strengthDiff < -8) {
      delta = 3;
    } else if (strengthDiff > 18) {
      delta = -4;
    } else if (strengthDiff > 10) {
      delta = -3;
    } else {
      delta = -2;
    }

  }

  if (competition === "cup") {
    if (delta > 0) {
      let multiplier = 1;
      if (divisionGap >= 2) multiplier = 0.2;
      else if (divisionGap === 1) multiplier = 0.35;
      else if (divisionGap === 0) multiplier = 0.7;
      else if (divisionGap <= -2) multiplier = 1.1;
      delta = Math.round(delta * multiplier);
    } else if (delta < 0 && divisionGap >= 2) {
      delta -= 1;
    } else if (delta < 0 && divisionGap <= -2) {
      delta = Math.round(delta * 0.9);
    }
  }



  club.morale = Math.max(0, Math.min(100, club.morale + delta));

  return messages;

}

export function applyTablePressureMorale(
  clubs: Club[],
  standings: Standing[]
): void {
  for (let division = 1; division <= NATIONAL_DIVISION_COUNT; division++) {
    const divisionStandings = sortStandings(
      standings.filter((s) => {
        const club = clubs.find((c) => c.id === s.clubId);
        return club?.division === division;
      }),
      clubs
    );
    if (divisionStandings.length < 2) continue;

    const lastClubId = divisionStandings[divisionStandings.length - 1]!.clubId;
    const penultimateClubId =
      divisionStandings[divisionStandings.length - 2]!.clubId;

    const lastClub = clubs.find((c) => c.id === lastClubId);
    const penultimateClub = clubs.find((c) => c.id === penultimateClubId);
    if (lastClub) {
      lastClub.morale = Math.max(0, Math.min(100, lastClub.morale - 2));
    }
    if (penultimateClub) {
      penultimateClub.morale = Math.max(0, Math.min(100, penultimateClub.morale - 1));
    }
  }
}

/** Penalidade de moral ao rebaixar entre divisões nacionais (não distrital). */
export function applyRelegationMoralePenalty(club: Club): void {
  club.morale = Math.max(0, Math.min(100, club.morale - 8));
}

export function applyHomeCrowdMorale(club: Club): number {

  const bonus =

    club.stadiumCapacity >= 60000

      ? 5

      : club.stadiumCapacity >= 40000

        ? 4

        : club.stadiumCapacity >= 25000

          ? 3

          : club.stadiumCapacity >= 15000

            ? 2

            : 1;

  return bonus;

}



export function updateStanding(

  standings: Standing[],

  clubId: number,

  goalsFor: number,

  goalsAgainst: number

): void {

  const s = standings.find((x) => x.clubId === clubId);

  if (!s) return;



  s.played++;

  s.goalsFor += goalsFor;

  s.goalsAgainst += goalsAgainst;



  if (goalsFor > goalsAgainst) {

    s.won++;

    s.points += 3;

  } else if (goalsFor === goalsAgainst) {

    s.drawn++;

    s.points += 1;

  } else {

    s.lost++;

  }

}



export function sortStandings(

  standings: Standing[],

  clubs: Club[]

): Standing[] {

  const clubMap = new Map(clubs.map((c) => [c.id, c]));

  return [...standings].sort((a, b) => {

    if (b.points !== a.points) return b.points - a.points;

    const gdA = a.goalsFor - a.goalsAgainst;

    const gdB = b.goalsFor - b.goalsAgainst;

    if (gdB !== gdA) return gdB - gdA;

    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;

    return (clubMap.get(b.clubId)?.strengthIndex ?? 0) - (clubMap.get(a.clubId)?.strengthIndex ?? 0);

  });

}



export function getStandingPosition(

  standings: Standing[],

  clubs: Club[],

  clubId: number

): number {

  const sorted = sortStandings(standings, clubs);

  return sorted.findIndex((s) => s.clubId === clubId) + 1;

}



export function setClubFormation(club: Club, formation: Formation): void {

  club.formation = formation;

}



export function migrateClubFields(club: Club & { managerExpectation?: string }): Club {

  const { managerExpectation: _removed, ...rest } = club;

  const slug = rest.slug === "VASCO" ? "VSC_GAMA" : rest.slug;
  const name =
    rest.name === "Vasco" || slug === "VSC_GAMA" ? "Vasco da Gama" : rest.name;
  const colors = resolveClubColors(slug, rest.country);

  return {
    ...rest,
    slug,
    name,
    ...colors,
    strengthIndex: rest.strengthIndex ?? Math.max(1, Math.min(50, Math.round((rest.reputation ?? 40) / 2))),
    division: (rest.division ?? 4) as Club["division"],
    morale: rest.morale ?? 50,
    ticketPrice: rest.ticketPrice ?? getDefaultTicketPrice(rest.division ?? 4),
    loans: rest.loans ?? [],
    nextLoanId: rest.nextLoanId ?? 1,
    coachId: rest.coachId ?? null,
    coachName:
      rest.coachName ??
      (rest.isHuman
        ? "Técnico"
        : generateCoachName(
            rest.country,
            createRng((rest.id ?? 1) * 791 + slug.length * 17)
          )),
    coachReputation:
      rest.coachReputation ??
      getClubCoachExpectation({
        ...rest,
        division: (rest.division ?? 4) as Club["division"],
        morale: rest.morale ?? 50,
      } as Club),
    coachRecentlyFired: rest.coachRecentlyFired ?? false,
  };

}


