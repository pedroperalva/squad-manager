import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "squads", "teams");

for (const f of ["en.ts", "pt.ts", "fr.ts"]) {
  const text = readFileSync(join(dir, f), "utf8");
  const squads = [...text.matchAll(/squad\("([^"]+)",\s*\[([\s\S]*?)\]\)/g)];
  for (const [, slug, body] of squads) {
    const players = [...body.matchAll(/name: "([^"]+)".*position: "(GK|DF|MF|FW)"/g)].map((m) => ({
      name: m[1], pos: m[2],
    }));
    const names = players.map((p) => p.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    const gk = players.filter((p) => p.pos === "GK").length;
    if (players.length < 18 || players.length > 22) console.log(`${f} ${slug}: ${players.length} players`);
    if (gk < 2) console.log(`${f} ${slug}: ${gk} GK`);
    if (dupes.length) console.log(`${f} ${slug}: dupes ${[...new Set(dupes)]}`);
  }
}
