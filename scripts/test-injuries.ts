import {
  injurySkillLoss,
  rollInjuryDays,
  tickInjuriesAfterMatch,
  applyInjuryToPlayer,
  INJURY_HALF_CHANCE,
} from "../src/engine/injuries";
import { isValidLineup } from "../src/engine/squad";
import type { Player } from "../src/engine/types";
import { createPlayerDefaults } from "../src/engine/player";
import { createRng } from "../src/data/name-generator";

function makePlayer(id: number, overrides: Partial<Player> = {}): Player {
  return createPlayerDefaults({
    id,
    name: `P${id}`,
    clubId: 1,
    position: "MF",
    skill: 25,
    value: 500,
    salary: 10,
    injuryDays: 0,
    ...overrides,
  });
}

for (const days of [1, 7]) {
  const loss = injurySkillLoss(days);
  if (loss < 3 || loss > 7) {
    throw new Error(`injurySkillLoss(${days}) = ${loss}, expected 3-7`);
  }
}
console.log("injurySkillLoss bounds ok");

const rng = createRng(42);
const counts = new Map<number, number>();
for (let i = 0; i < 10000; i++) {
  const d = rollInjuryDays(rng);
  counts.set(d, (counts.get(d) ?? 0) + 1);
}
const p1 = (counts.get(1) ?? 0) / 10000;
if (p1 < 0.28 || p1 > 0.42) {
  throw new Error(`1D weight off: ${(p1 * 100).toFixed(1)}%`);
}
console.log("rollInjuryDays distribution ok");

const player = makePlayer(1, { injuryDays: 4 });
const clubIds = [1];
tickInjuriesAfterMatch([player], clubIds);
tickInjuriesAfterMatch([player], clubIds);
tickInjuriesAfterMatch([player], clubIds);
tickInjuriesAfterMatch([player], clubIds);
if (player.injuryDays !== 0) throw new Error(`expected 0D, got ${player.injuryDays}`);
console.log("injury tick sequence ok");

const fresh = makePlayer(2);
applyInjuryToPlayer(fresh, 3);
tickInjuriesAfterMatch([fresh], clubIds, new Set([fresh.id]));
if (fresh.injuryDays !== 3) throw new Error("newly injured should not tick same match");
console.log("skip newly injured ok");

const gk = makePlayer(1, { position: "GK" });
const dfs = [2, 3, 4, 5].map((id) => makePlayer(id, { position: "DF" }));
const mfs = [6, 7, 8, 9].map((id) => makePlayer(id, { position: "MF" }));
const fws = [10, 11].map((id) => makePlayer(id, { position: "FW" }));
const injuredStarter = makePlayer(7, { position: "MF", injuryDays: 2 });
const squad = [gk, ...dfs, ...mfs, ...fws];
const lineup = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
if (isValidLineup(lineup, squad)) {
  squad.find((p) => p.id === 7)!.injuryDays = 2;
  if (isValidLineup(lineup, squad)) {
    throw new Error("injured player should invalidate lineup");
  }
}
console.log("isValidLineup blocks injured ok");
console.log(`INJURY_HALF_CHANCE=${INJURY_HALF_CHANCE}`);
console.log("all injury smoke tests passed");
