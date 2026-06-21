const path = require("path");
const { installElectronSqliteEverywhere } = require("./install-sqlite-electron.cjs");

module.exports = async function afterPack(context) {
  const root = path.join(__dirname, "..");
  const appDir = path.join(context.appOutDir, "resources", "app");

  installElectronSqliteEverywhere(appDir, root);
  console.log("afterPack: better-sqlite3 (Electron) instalado no app empacotado");
};
