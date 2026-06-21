const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function findSqlitePackageDirs(rootDir) {
  const matches = [];

  function walk(currentDir, depth) {
    if (depth > 6) return;

    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const fullPath = path.join(currentDir, entry.name);
      const isSqlitePackage =
        entry.name === "better-sqlite3" || entry.name.startsWith("better-sqlite3-");

      if (isSqlitePackage && fs.existsSync(path.join(fullPath, "package.json"))) {
        matches.push(fullPath);
        continue;
      }

      if (
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        (depth === 0 && entry.name !== "release" && entry.name !== "release2")
      ) {
        walk(fullPath, depth + 1);
      }
    }
  }

  walk(rootDir, 0);
  return [...new Set(matches)];
}

function installElectronSqlite(sqliteDir, rootDir) {
  const electronVersion = require(path.join(
    rootDir,
    "node_modules",
    "electron",
    "package.json"
  )).version;

  const env = { ...process.env };
  delete env.npm_config_build_from_source;

  const result = spawnSync(
    "npx",
    [
      "prebuild-install",
      "--runtime",
      "electron",
      "--target",
      electronVersion,
      "--arch",
      "x64",
    ],
    { cwd: sqliteDir, stdio: "inherit", shell: true, env }
  );

  if (result.status !== 0) {
    throw new Error(`prebuild-install falhou em ${sqliteDir}`);
  }
}

function installElectronSqliteEverywhere(targetRoot, projectRoot) {
  const sqliteDirs = findSqlitePackageDirs(targetRoot);

  if (sqliteDirs.length === 0) {
    throw new Error(`Nenhuma pasta better-sqlite3 encontrada em ${targetRoot}`);
  }

  for (const sqliteDir of sqliteDirs) {
    console.log(`Instalando better-sqlite3 (Electron) em ${sqliteDir}`);
    installElectronSqlite(sqliteDir, projectRoot);
  }
}

module.exports = {
  findSqlitePackageDirs,
  installElectronSqlite,
  installElectronSqliteEverywhere,
};
