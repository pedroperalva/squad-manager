const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

for (const name of ["release", "release2"]) {
  const target = path.join(root, name);
  if (!fs.existsSync(target)) continue;
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`Removido ${name}/ antes do build`);
}
