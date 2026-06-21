const FIRST_NAMES: Record<string, string[]> = {
  BR: ["João", "Pedro", "Lucas", "Gabriel", "Rafael", "Bruno", "Felipe", "Marcos", "André", "Diego", "Carlos", "Renato", "Paulo", "Vitor", "Thiago"],
  PT: ["João", "Pedro", "Rui", "Hugo", "Diogo", "Bruno", "André", "Tiago", "Nuno", "Ricardo", "Miguel", "Filipe", "António", "José", "Manuel"],
  ES: ["Carlos", "José", "Antonio", "Manuel", "Francisco", "David", "Javier", "Sergio", "Pablo", "Álvaro", "Raúl", "Fernando", "Luis", "Diego", "Iker"],
  IT: ["Marco", "Luca", "Andrea", "Giuseppe", "Francesco", "Alessandro", "Matteo", "Lorenzo", "Davide", "Simone", "Antonio", "Roberto", "Paolo", "Stefano", "Fabio"],
  EN: ["James", "John", "Michael", "David", "Paul", "Mark", "Chris", "Andrew", "Daniel", "Thomas", "Robert", "William", "Richard", "George", "Harry"],
  FR: ["Jean", "Pierre", "Michel", "Philippe", "Alain", "Patrick", "Nicolas", "Laurent", "François", "Olivier", "Antoine", "Julien", "Thomas", "Alexandre", "Hugo"],
  DE: ["Lukas", "Jonas", "Leon", "Finn", "Max", "Tim", "Niklas", "Paul", "Julian", "Noah", "Felix", "Moritz", "Emil", "David", "Tobias"],
};

const LAST_NAMES: Record<string, string[]> = {
  BR: ["Silva", "Santos", "Oliveira", "Souza", "Lima", "Costa", "Pereira", "Alves", "Ribeiro", "Carvalho", "Gomes", "Martins", "Ferreira", "Rodrigues", "Barbosa"],
  PT: ["Silva", "Santos", "Ferreira", "Pereira", "Oliveira", "Costa", "Rodrigues", "Martins", "Sousa", "Fernandes", "Gonçalves", "Gomes", "Lopes", "Marques", "Ribeiro"],
  ES: ["García", "Rodríguez", "González", "Fernández", "López", "Martínez", "Sánchez", "Pérez", "Gómez", "Martín", "Jiménez", "Ruiz", "Hernández", "Díaz", "Moreno"],
  IT: ["Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo", "Conti", "De Luca", "Mancini"],
  EN: ["Smith", "Jones", "Taylor", "Brown", "Williams", "Wilson", "Johnson", "Davies", "Robinson", "Thompson", "Evans", "Walker", "White", "Roberts", "Green"],
  FR: ["Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre", "Michel", "Garcia"],
  DE: ["Muller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Hoffmann", "Koch", "Richter", "Klein", "Wolf", "Schroder", "Neumann"],
};

export function hashStringToSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

export function generateRunSeed(): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]!;
  }
  return (Math.random() * 0x100000000) >>> 0;
}

export function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function generatePersonName(country: string, rng: () => number): string {
  const first = FIRST_NAMES[country] ?? FIRST_NAMES.BR;
  const last = LAST_NAMES[country] ?? LAST_NAMES.BR;
  const f = first[Math.floor(rng() * first.length)]!;
  const l = last[Math.floor(rng() * last.length)]!;
  return `${f} ${l}`;
}

export function generatePlayerName(
  country: string,
  rng: () => number
): string {
  return generatePersonName(country, rng);
}

export function generateCoachName(
  country: string,
  rng: () => number
): string {
  return generatePersonName(country, rng);
}

export function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}
