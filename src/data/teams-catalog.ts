import { resolveClubColors } from "@/data/club-colors";
import type { CountryCode, TeamCatalogEntry } from "@/engine/types";
import {
  COUNTRY_LABELS,
  CUP_NATIONAL_COUNT,
  MIN_GAME_TEAMS,
  NATIONAL_DIVISION_COUNT,
  TEAMS_PER_DISTRITAL,
  TEAMS_PER_DIVISION,
} from "@/engine/types";

/** Força configurável por clube (1–50). Sobrescreve o cálculo automático. */
export const CLUB_STRENGTH: Partial<Record<string, number>> = {
  // Brasil
  FLAMENGO: 48,
  PALMEIRA: 48,
  SAOPAULO: 42,
  CORINTHI: 45,
  VSC_GAMA: 38,
  SANTOS: 38,
  CRUZEIRO: 45,
  GREMIO: 38,
  INTERNAC: 38,
  ATLET_MG: 38,
  FLUMINEN: 42,
  BOTAFOGO: 39,
  // Espanha
  REAL_MAD: 50,
  BARCELON: 50,
  ATL_MADR: 46,
  SEVILLA: 40,
  VILLARRE: 35,
  VALENCIA: 38,
  BETIS: 36,
  BILBAO: 37,
  REAL_SOC: 36,
  // Portugal — força reduzida para não entrarem na 1ª divisão do campeonato misto
  BENFICA: 38,
  FC_PORTO: 40,
  SPORTING: 35,
  BRAGA: 30,
  // Itália
  JUVENTUS: 45,
  MILAN: 44,
  INTER: 45,
  NAPOLES: 42,
  ROMA: 43,
  LAZIO: 43,
  BOLOGNA: 35,
  UDINESE: 34,
  ATALANTA: 33,
  // Inglaterra
  MANCHEST: 44,
  LIVERPOO: 48,
  MANCITY: 48,
  ARSENAL: 48,
  CHELSEA: 46,
  // França
  PSG: 49,
  MONACO: 42,
  MARSELHA: 40,
  LYON: 38,
  LILLE: 36,
  RENNES: 35,
  LENS: 34,
  // Alemanha
  BAYERN: 49,
  DORTMUN: 45,
  LEIPZIG: 37,
  LEVERKU: 37,
};

function strengthFromReputation(reputation: number): number {
  return Math.max(1, Math.min(50, Math.round(reputation / 2)));
}

function resolveStrength(slug: string, reputation: number): number {
  const configured = CLUB_STRENGTH[slug];
  if (configured !== undefined) {
    return Math.max(1, Math.min(50, configured));
  }
  return strengthFromReputation(reputation);
}

function entry(
  slug: string,
  name: string,
  country: CountryCode,
  reputation: number,
  strength?: number
): TeamCatalogEntry {
  const resolved = strength ?? resolveStrength(slug, reputation);
  const colors = resolveClubColors(slug, country);
  return {
    slug,
    name,
    country,
    strength: resolved,
    reputation,
    primaryColor: colors.primaryColor,
    secondaryColor: colors.secondaryColor,
  };
}

/** Clubes mapeados a partir dos arquivos .EFT do Elifoot 98 */
export const TEAMS_CATALOG: TeamCatalogEntry[] = [
  // Brasil
  entry("FLAMENGO", "Flamengo", "BR", 92),
  entry("CORINTHI", "Corinthians", "BR", 90),
  entry("PALMEIRA", "Palmeiras", "BR", 90),
  entry("SAOPAULO", "São Paulo", "BR", 88),
  entry("SANTOS", "Santos", "BR", 85),
  entry("CRUZEIRO", "Cruzeiro", "BR", 84),
  entry("GREMIO", "Grêmio", "BR", 84),
  entry("INTERNAC", "Internacional", "BR", 83),
  entry("ATLET_MG", "Atlético Mineiro", "BR", 82),
  entry("FLUMINEN", "Fluminense", "BR", 80),
  entry("BOTAFOGO", "Botafogo", "BR", 78),
  entry("VSC_GAMA", "Vasco da Gama", "BR", 77),
  entry("BAHIA", "Bahia", "BR", 72),
  entry("SPORTREC", "Sport Recife", "BR", 70),
  entry("CEARA", "Ceará", "BR", 68),
  entry("GOIAS", "Goiás", "BR", 66),
  entry("CORITIBA", "Coritiba", "BR", 65),
  entry("ATLET_PR", "Athletico Paranaense", "BR", 68),
  entry("VITORIA", "Vitória", "BR", 64),
  entry("GUARANI", "Guarani", "BR", 58),
  entry("PONTE_PR", "Ponte Preta", "BR", 55),
  entry("CRICIUMA", "Criciúma", "BR", 54),
  entry("BRAGANTI", "Red Bull Bragantino", "BR", 62),
  entry("LONDRINA", "Londrina", "BR", 50),
  entry("DESPORTI", "Desportivo", "BR", 45),
  entry("FERRO", "Ferroviário", "BR", 42),
  entry("AMERI_SP", "América-SP", "BR", 40),
  entry("INTER_BR", "Inter de Limeira", "BR", 38),
  entry("ITUAN_BR", "Ituano", "BR", 36),
  entry("JUVEN_BR", "Juventude", "BR", 52),
  entry("LUSAS_BR", "Lusitano", "BR", 30),
  entry("MATON_BR", "Matonense", "BR", 28),
  entry("MOGIM_BR", "Mogi Mirim", "BR", 32),
  entry("RIOBR_BR", "Rio Branco-SP", "BR", 26),
  entry("SAOJO_BR", "São José-SP", "BR", 24),
  entry("NAUTICO", "Náutico", "BR", 58),
  entry("SANTA_CR", "Santa Cruz", "BR", 52),
  entry("REMO", "Remo", "BR", 50),
  entry("FIGUEIR", "Figueirense", "BR", 48),
  entry("CHAPECO", "Chapecoense", "BR", 46),
  entry("AMER_RJ", "América-RJ", "BR", 44),

  // Portugal (apenas os 4 grandes)
  entry("BENFICA", "Benfica", "PT", 90),
  entry("FC_PORTO", "Porto", "PT", 90),
  entry("SPORTING", "Sporting CP", "PT", 88),
  entry("BRAGA", "SC Braga", "PT", 78),

  // Espanha
  entry("REAL_MAD", "Real Madrid", "ES", 95),
  entry("BARCELON", "Barcelona", "ES", 94),
  entry("ATL_MADR", "Atlético Madrid", "ES", 88),
  entry("VALENCIA", "Valencia", "ES", 80),
  entry("SEVILLA", "Sevilla", "ES", 82),
  entry("VILLARRE", "Villarreal", "ES", 75),
  entry("BETIS", "Real Betis", "ES", 76),
  entry("BILBAO", "Athletic Bilbao", "ES", 78),
  entry("CELTA", "Celta de Vigo", "ES", 70),
  entry("ESPANOL", "Espanyol", "ES", 68),
  entry("REAL_SOC", "Real Sociedad", "ES", 74),
  entry("LACORUNA", "Deportivo La Coruña", "ES", 65),
  entry("MALLORCA", "Mallorca", "ES", 62),
  entry("SANTANDE", "Racing Santander", "ES", 58),
  entry("GIJON", "Sporting Gijón", "ES", 56),
  entry("OVIEDO", "Real Oviedo", "ES", 52),
  entry("VALLADOL", "Valladolid", "ES", 54),
  entry("SALAMANC", "Salamanca", "ES", 45),
  entry("SARAGOCA", "Real Zaragoza", "ES", 60),
  entry("TENERIFE", "Tenerife", "ES", 50),
  entry("MERIDA", "Mérida", "ES", 40),
  entry("JUVENTUD", "Real Madrid Castilla", "ES", 42),
  entry("GETAFE", "Getafe", "ES", 58),
  entry("LEGANES", "Leganés", "ES", 48),
  entry("ALAVES", "Deportivo Alavés", "ES", 46),
  entry("GRANADA", "Granada", "ES", 44),
  entry("CADIZ", "Cádiz", "ES", 42),
  entry("MALAGA", "Málaga", "ES", 40),

  // Itália
  entry("JUVENTUS", "Juventus", "IT", 92),
  entry("MILAN", "AC Milan", "IT", 90),
  entry("INTER", "Inter de Milão", "IT", 90),
  entry("NAPOLES", "Napoli", "IT", 82),
  entry("FIORENTI", "Fiorentina", "IT", 72),
  entry("PARMA", "Parma", "IT", 68),
  entry("SAMPDORI", "Sampdoria", "IT", 65),
  entry("ROMA", "Roma", "IT", 86),
  entry("LAZIO", "Lazio", "IT", 84),
  entry("TORINO", "Torino", "IT", 70),
  entry("BOLOGNA", "Bologna", "IT", 68),
  entry("UDINESE", "Udinese", "IT", 66),
  entry("ATALANTA", "Atalanta", "IT", 64),
  entry("VERONA", "Hellas Verona", "IT", 58),
  entry("BRESCIA", "Brescia", "IT", 56),
  entry("CAGLIARI", "Cagliari", "IT", 60),
  entry("PERUGIA", "Perugia", "IT", 54),
  entry("BARI", "Bari", "IT", 52),
  entry("LECCE", "Lecce", "IT", 50),
  entry("REGGINA", "Reggina", "IT", 48),
  entry("VENEZIA", "Venezia", "IT", 46),
  entry("ANCONA", "Ancona", "IT", 44),
  entry("PESCARA", "Pescara", "IT", 42),
  entry("MODENA", "Modena", "IT", 40),
  entry("PIACENZA", "Piacenza", "IT", 38),
  entry("COMO", "Como", "IT", 36),
  entry("CREMONE", "Cremonese", "IT", 34),

  // Inglaterra
  entry("MANCHEST", "Manchester United", "EN", 92),
  entry("MANCITY", "Manchester City", "EN", 90),
  entry("LIVERPOO", "Liverpool", "EN", 91),
  entry("ARSENAL", "Arsenal", "EN", 88),
  entry("CHELSEA", "Chelsea", "EN", 87),
  entry("TOTTENHA", "Tottenham", "EN", 82),
  entry("NEWCASTL", "Newcastle", "EN", 78),
  entry("EVERTON", "Everton", "EN", 74),
  entry("LEEDS", "Leeds United", "EN", 70),
  entry("ASTONVIL", "Aston Villa", "EN", 72),
  entry("WESTHAM", "West Ham", "EN", 68),
  entry("SOUTHAMP", "Southampton", "EN", 64),
  entry("LEICESTE", "Leicester", "EN", 72),
  entry("NOTTINGH", "Nottingham Forest", "EN", 62),
  entry("COVENTRY", "Coventry", "EN", 58),
  entry("IPSWICH", "Ipswich", "EN", 56),
  entry("SUNDERLA", "Sunderland", "EN", 60),
  entry("MIDDLESB", "Middlesbrough", "EN", 58),
  entry("BLACKBUR", "Blackburn", "EN", 55),
  entry("BIRMINGH", "Birmingham", "EN", 54),
  entry("BRENTFOR", "Brentford", "EN", 62),
  entry("CRYSTAL", "Crystal Palace", "EN", 60),
  entry("QPR", "Queens Park Rangers", "EN", 52),
  entry("SHEFFIEL", "Sheffield United", "EN", 56),
  entry("STOCKPOR", "Stockport", "EN", 40),
  entry("WIMBLEDO", "Wimbledon", "EN", 42),

  // França
  entry("PSG", "Paris Saint-Germain", "FR", 90),
  entry("MONACO", "Monaco", "FR", 82),
  entry("MARSELHA", "Olympique Marseille", "FR", 82),
  entry("LYON", "Lyon", "FR", 78),
  entry("LILLE", "Lille", "FR", 76),
  entry("LENS", "RC Lens", "FR", 74),
  entry("RENNES", "Rennes", "FR", 72),

  // Alemanha
  entry("BAYERN", "Bayern Munich", "DE", 95),
  entry("DORTMUN", "Borussia Dortmund", "DE", 88),
  entry("LEIPZIG", "RB Leipzig", "DE", 82),
  entry("LEVERKU", "Bayer Leverkusen", "DE", 86),
];

export const ALL_COUNTRIES: CountryCode[] = ["BR", "PT", "ES", "IT", "EN", "FR", "DE"];

export function getTeamsByCountry(country: CountryCode): TeamCatalogEntry[] {
  const seen = new Set<string>();
  return TEAMS_CATALOG.filter((t) => {
    if (t.country !== country) return false;
    if (seen.has(t.slug)) return false;
    seen.add(t.slug);
    return true;
  }).sort(
    (a, b) => b.strength - a.strength || b.reputation - a.reputation
  );
}

/** Pool de clubes dos países selecionados, ordenado por força. */
export function getTeamsFromCountries(
  countries: CountryCode[]
): TeamCatalogEntry[] {
  if (countries.length === 0) return [];
  const seenSlugs = new Set<string>();
  const seenNames = new Set<string>();
  const teams: TeamCatalogEntry[] = [];
  for (const t of TEAMS_CATALOG) {
    if (!countries.includes(t.country)) continue;
    if (seenSlugs.has(t.slug)) continue;
    const nameKey = `${t.country}:${t.name.toLowerCase()}`;
    if (seenNames.has(nameKey)) continue;
    seenSlugs.add(t.slug);
    seenNames.add(nameKey);
    teams.push(t);
  }
  return teams.sort(
    (a, b) => b.strength - a.strength || b.reputation - a.reputation
  );
}

export function countTeamsFromCountries(countries: CountryCode[]): number {
  return getTeamsFromCountries(countries).length;
}

export function canStartGameWithCountries(countries: CountryCode[]): boolean {
  return getNewGameValidation(countries).canStart;
}

export function getNewGameValidation(countries: CountryCode[]): {
  canStart: boolean;
  message: string | null;
} {
  if (countries.length === 0) {
    return {
      canStart: false,
      message: "Selecione pelo menos um país para o campeonato.",
    };
  }

  const poolSize = countTeamsFromCountries(countries);

  if (countries.length === 1 && poolSize < MIN_GAME_TEAMS) {
    const country = countries[0]!;
    return {
      canStart: false,
      message: `${COUNTRY_LABELS[country]} tem apenas ${poolSize} clubes. Um país sozinho não forma o campeonato — selecione mais países até completar ${MIN_GAME_TEAMS} clubes.`,
    };
  }

  if (poolSize < MIN_GAME_TEAMS) {
    return {
      canStart: false,
      message: `Pool combinado: ${poolSize} clubes. Faltam ${MIN_GAME_TEAMS - poolSize} para iniciar (mínimo ${MIN_GAME_TEAMS}).`,
    };
  }

  return { canStart: true, message: null };
}

/** Top 32 por força — divisões nacionais (1ª a 4ª). */
export function getLeaguePoolTeams(
  countries: CountryCode[]
): TeamCatalogEntry[] {
  return getTeamsFromCountries(countries).slice(0, CUP_NATIONAL_COUNT);
}

/** Posições 33–64 por força — distrital + copa. */
export function getDistritalPoolTeams(
  countries: CountryCode[]
): TeamCatalogEntry[] {
  return getTeamsFromCountries(countries).slice(
    CUP_NATIONAL_COUNT,
    CUP_NATIONAL_COUNT + TEAMS_PER_DISTRITAL
  );
}

/** Clubes que o jogador pode escolher (top 32 do pool). */
export function getSelectableHumanClubs(
  countries: CountryCode[]
): TeamCatalogEntry[] {
  return getLeaguePoolTeams(countries);
}

/** @deprecated Use getLeaguePoolTeams */
export function getNationalTeamsByCountry(country: CountryCode): TeamCatalogEntry[] {
  return getLeaguePoolTeams([country]);
}

/** @deprecated Use getDistritalPoolTeams */
export function getDistritalTeamsByCountry(country: CountryCode): TeamCatalogEntry[] {
  return getDistritalPoolTeams([country]);
}

/** @deprecated Use getSelectableHumanClubs */
export function getPlayableTeamsByCountry(country: CountryCode): TeamCatalogEntry[] {
  return getSelectableHumanClubs([country]);
}
