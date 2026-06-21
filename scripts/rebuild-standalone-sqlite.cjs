const path = require("path");
const { installElectronSqliteEverywhere } = require("./install-sqlite-electron.cjs");

const root = path.join(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");

installElectronSqliteEverywhere(standaloneDir, root);
console.log("better-sqlite3 (Electron) instalado no standalone");
