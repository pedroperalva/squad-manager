import type { CountryCode } from "@/engine/types";

export interface ClubColorPair {
  primaryColor: string;
  secondaryColor: string;
}

/** Cores predominantes reais (primária, secundária). */
export const CLUB_COLORS: Record<string, readonly [string, string]> = {
  // Brasil
  FLAMENGO: ["#C3281E", "#000000"],
  CORINTHI: ["#000000", "#FFFFFF"],
  PALMEIRA: ["#006437", "#FFFFFF"],
  SAOPAULO: ["#FFFFFF", "#FE0000"],
  SANTOS: ["#FFFFFF", "#000000"],
  CRUZEIRO: ["#003A7E", "#FFFFFF"],
  GREMIO: ["#008BD0", "#FFFFFF"],
  INTERNAC: ["#E5060F", "#FFFFFF"],
  ATLET_MG: ["#000000", "#FFFFFF"],
  FLUMINEN: ["#7A263A", "#006A42"],
  BOTAFOGO: ["#000000", "#FFFFFF"],
  VSC_GAMA: ["#000000", "#FFFFFF"],
  BAHIA: ["#005CA9", "#E30613"],
  SPORTREC: ["#DA0102", "#000000"],
  CEARA: ["#000000", "#FFFFFF"],
  GOIAS: ["#006633", "#FFFFFF"],
  CORITIBA: ["#006747", "#FFFFFF"],
  ATLET_PR: ["#CC0000", "#000000"],
  VITORIA: ["#E30613", "#000000"],
  GUARANI: ["#006633", "#FFFFFF"],
  PONTE_PR: ["#000000", "#FFFFFF"],
  CRICIUMA: ["#FFDD00", "#006633"],
  BRAGANTI: ["#DD0031", "#FFFFFF"],
  LONDRINA: ["#006633", "#FFFFFF"],
  DESPORTI: ["#006633", "#FFFFFF"],
  FERRO: ["#006633", "#FFDD00"],
  AMERI_SP: ["#006633", "#FFFFFF"],
  INTER_BR: ["#006633", "#FFFFFF"],
  ITUAN_BR: ["#006633", "#FFFFFF"],
  JUVEN_BR: ["#006633", "#FFFFFF"],
  LUSAS_BR: ["#006633", "#FFFFFF"],
  MATON_BR: ["#006633", "#FFFFFF"],
  MOGIM_BR: ["#006633", "#FFFFFF"],
  RIOBR_BR: ["#006633", "#FFFFFF"],
  SAOJO_BR: ["#006633", "#FFFFFF"],
  NAUTICO: ["#E30613", "#FFFFFF"],
  SANTA_CR: ["#E30613", "#000000"],
  REMO: ["#006633", "#FFFFFF"],
  FIGUEIR: ["#000000", "#FFFFFF"],
  CHAPECO: ["#006633", "#FFFFFF"],
  AMER_RJ: ["#006633", "#FF0000"],

  // Portugal
  BENFICA: ["#E30613", "#FFFFFF"],
  FC_PORTO: ["#003893", "#FFFFFF"],
  SPORTING: ["#006633", "#FFFFFF"],
  BRAGA: ["#CC0000", "#FFFFFF"],
  BOAVISTA: ["#000000", "#FFFFFF"],
  GUIMARAE: ["#FFFFFF", "#000000"],
  MARITIMO: ["#006633", "#FF0000"],
  BELENENS: ["#003893", "#FFFFFF"],
  ESTRELA: ["#006633", "#FFFFFF"],
  RIO_AVE: ["#006633", "#FFFFFF"],
  SETUBAL: ["#006633", "#FFFFFF"],
  MOREIREN: ["#006633", "#FFFFFF"],
  PACOSFER: ["#FFCC00", "#006633"],
  FARENSE: ["#000000", "#FFFFFF"],
  ACADEMIC: ["#000000", "#FFFFFF"],
  BEIRAMAR: ["#006633", "#FFFFFF"],
  ESTORIL: ["#006633", "#FFCC00"],
  AVES: ["#006633", "#FFFFFF"],
  CHAVES: ["#006633", "#FFFFFF"],
  FEIRENSE: ["#006633", "#FFFFFF"],
  COVILHA: ["#006633", "#FFFFFF"],
  LEIRIA: ["#006633", "#FFFFFF"],
  LECA: ["#006633", "#FFFFFF"],
  ALVERCA: ["#006633", "#FFFFFF"],
  AMORA: ["#006633", "#FFFFFF"],
  ANADIA: ["#006633", "#FFFFFF"],
  CAMPOMAI: ["#006633", "#FFFFFF"],
  CASTVIDE: ["#006633", "#FFFFFF"],
  COMPOSTE: ["#006633", "#FFFFFF"],
  DESPBEJA: ["#006633", "#FFFFFF"],
  ESPINHO: ["#006633", "#FFFFFF"],
  FELGUEIR: ["#006633", "#FFFFFF"],
  GIL_VICE: ["#006633", "#FFFFFF"],
  ADMIRA: ["#006633", "#FFFFFF"],
  MASSAMA: ["#006633", "#FFFFFF"],
  MONTIJO: ["#006633", "#FFFFFF"],
  PAREDES: ["#006633", "#FFFFFF"],
  PENAFIEL: ["#006633", "#FFFFFF"],
  PICARICA: ["#006633", "#FFFFFF"],
  PORTUGUE: ["#006633", "#FFFFFF"],
  QUIMIGAL: ["#006633", "#FFFFFF"],
  SALGUEIR: ["#006633", "#FFFFFF"],
  SAMORA: ["#006633", "#FFFFFF"],
  SEGESTA: ["#006633", "#FFFFFF"],
  SPCRISTA: ["#006633", "#FFFFFF"],
  TIRSENSE: ["#006633", "#FFFFFF"],
  UNSJOAO: ["#006633", "#FFFFFF"],
  UNLAMAS: ["#006633", "#FFFFFF"],
  UNMADEIR: ["#006633", "#FFFFFF"],
  VARZIM: ["#006633", "#FFFFFF"],
  VENDAS: ["#006633", "#FFFFFF"],
  VISEU: ["#006633", "#FFFFFF"],

  // Espanha
  REAL_MAD: ["#FEBE10", "#00529F"],
  BARCELON: ["#A50044", "#004D98"],
  ATL_MADR: ["#CB3524", "#FFFFFF"],
  VALENCIA: ["#FFFFFF", "#FF6600"],
  SEVILLA: ["#FFFFFF", "#D01012"],
  VILLARRE: ["#FFE667", "#005187"],
  BETIS: ["#00954C", "#FFFFFF"],
  BILBAO: ["#EE2523", "#FFFFFF"],
  CELTA: ["#8AC3EE", "#FFFFFF"],
  ESPANOL: ["#007FC8", "#FFFFFF"],
  REAL_SOC: ["#0057B8", "#FFFFFF"],
  LACORUNA: ["#0057B8", "#FFFFFF"],
  MALLORCA: ["#E20613", "#000000"],
  SANTANDE: ["#008835", "#FFFFFF"],
  GIJON: ["#E30613", "#FFFFFF"],
  OVIEDO: ["#0057B8", "#FFFFFF"],
  VALLADOL: ["#4A0E4E", "#FFFFFF"],
  SALAMANC: ["#E30613", "#FFFFFF"],
  SARAGOCA: ["#0057B8", "#FFFFFF"],
  TENERIFE: ["#0057B8", "#FFFFFF"],
  MERIDA: ["#0057B8", "#FFFFFF"],
  JUVENTUD: ["#FEBE10", "#00529F"],
  GETAFE: ["#005999", "#FFFFFF"],
  LEGANES: ["#005999", "#FFFFFF"],
  ALAVES: ["#0057B8", "#FFFFFF"],
  GRANADA: ["#E30613", "#FFFFFF"],
  CADIZ: ["#FFDD00", "#0057B8"],
  MALAGA: ["#0057B8", "#FFFFFF"],

  // Itália
  JUVENTUS: ["#000000", "#FFFFFF"],
  MILAN: ["#FB090B", "#000000"],
  INTER: ["#010E80", "#000000"],
  NAPOLES: ["#12A0D7", "#FFFFFF"],
  FIORENTI: ["#482E92", "#FFFFFF"],
  PARMA: ["#FCE000", "#002B87"],
  SAMPDORI: ["#0066B3", "#FFFFFF"],
  ROMA: ["#8E1F2F", "#F0BC42"],
  LAZIO: ["#87D8F7", "#FFFFFF"],
  TORINO: ["#8A1E03", "#FFFFFF"],
  BOLOGNA: ["#A6192E", "#003A7E"],
  UDINESE: ["#000000", "#FFFFFF"],
  ATALANTA: ["#1E71B8", "#000000"],
  VERONA: ["#FFD700", "#003A7E"],
  BRESCIA: ["#0057B8", "#FFFFFF"],
  CAGLIARI: ["#A6192E", "#003A7E"],
  PERUGIA: ["#E30613", "#FFFFFF"],
  BARI: ["#E30613", "#FFFFFF"],
  LECCE: ["#FFD700", "#E30613"],
  REGGINA: ["#8A1E03", "#FFFFFF"],
  VENEZIA: ["#FF6600", "#000000"],
  ANCONA: ["#E30613", "#FFFFFF"],
  PESCARA: ["#0057B8", "#FFFFFF"],
  MODENA: ["#FFD700", "#0057B8"],
  PIACENZA: ["#E30613", "#FFFFFF"],
  COMO: ["#0057B8", "#FFFFFF"],
  CREMONE: ["#808080", "#E30613"],

  // Inglaterra
  MANCHEST: ["#DA020E", "#FBE122"],
  MANCITY: ["#6CABDD", "#FFFFFF"],
  LIVERPOO: ["#C8102E", "#00B2A9"],
  ARSENAL: ["#EF0107", "#FFFFFF"],
  CHELSEA: ["#034694", "#FFFFFF"],
  TOTTENHA: ["#132257", "#FFFFFF"],
  NEWCASTL: ["#000000", "#FFFFFF"],
  EVERTON: ["#003399", "#FFFFFF"],
  LEEDS: ["#FFCD00", "#FFFFFF"],
  ASTONVIL: ["#670E36", "#95BFE5"],
  WESTHAM: ["#7A263A", "#1BB1E7"],
  SOUTHAMP: ["#D71920", "#FFFFFF"],
  LEICESTE: ["#003090", "#FFFFFF"],
  NOTTINGH: ["#DD0000", "#FFFFFF"],
  COVENTRY: ["#009FE3", "#FFFFFF"],
  IPSWICH: ["#003090", "#FFFFFF"],
  SUNDERLA: ["#EB172B", "#FFFFFF"],
  MIDDLESB: ["#DA020E", "#FFFFFF"],
  BLACKBUR: ["#0057B8", "#FFFFFF"],
  BIRMINGH: ["#0057B8", "#FFFFFF"],
  BRENTFOR: ["#E30613", "#FFFFFF"],
  CRYSTAL: ["#1B458F", "#C4122E"],
  QPR: ["#0057B8", "#FFFFFF"],
  SHEFFIEL: ["#EE2737", "#FFFFFF"],
  STOCKPOR: ["#0057B8", "#FFFFFF"],
  WIMBLEDO: ["#0057B8", "#FFFFFF"],

  // França
  PSG: ["#004170", "#DA020E"],
  MONACO: ["#E30613", "#FFFFFF"],
  MARSELHA: ["#2FAEE0", "#FFFFFF"],
  LYON: ["#0033A0", "#FFFFFF"],
  LILLE: ["#E30613", "#0033A0"],
  LENS: ["#FFD700", "#E30613"],
  RENNES: ["#E30613", "#000000"],

  // Alemanha
  BAYERN: ["#DC052D", "#0066B2"],
  DORTMUN: ["#FDE100", "#000000"],
  LEIPZIG: ["#FFFFFF", "#E30613"],
  LEVERKU: ["#E30613", "#000000"],
};

const COUNTRY_DEFAULTS: Record<CountryCode, readonly [string, string]> = {
  BR: ["#009739", "#FFDF00"],
  PT: ["#006600", "#FF0000"],
  ES: ["#C60B1E", "#FFC400"],
  IT: ["#0068A8", "#FFFFFF"],
  EN: ["#3D195B", "#FFFFFF"],
  FR: ["#0055A4", "#EF4135"],
  DE: ["#000000", "#DD0000"],
};

function hashHue(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (h * 31 + slug.charCodeAt(i)) % 360;
  }
  return h;
}

export function resolveClubColors(
  slug: string,
  country: CountryCode
): ClubColorPair {
  const configured = CLUB_COLORS[slug];
  if (configured) {
    return { primaryColor: configured[0], secondaryColor: configured[1] };
  }

  const hue = hashHue(slug);
  const [fallbackPrimary, fallbackSecondary] = COUNTRY_DEFAULTS[country];
  return {
    primaryColor: `hsl(${hue}, 55%, 42%)`,
    secondaryColor: fallbackSecondary || fallbackPrimary,
  };
}
