const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");

const STANDALONE_PRUNE = [
  "release",
  "release2",
  "src",
  "scripts",
  "data",
  "electron",
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "eslint.config.mjs",
  "postcss.config.mjs",
  "tsconfig.json",
  "tsconfig.tsbuildinfo",
  "package-lock.json",
  "next.config.ts",
];

if (!fs.existsSync(standaloneDir)) {
  console.error("Build standalone não encontrado. Rode `next build` com output: 'standalone'.");
  process.exit(1);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.error(`Pasta ausente: ${src}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (process.platform === "win32") {
    const result = spawnSync(
      "robocopy",
      [src, dest, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/njs", "/np"],
      { stdio: "inherit", windowsHide: true }
    );

    if (result.status !== null && result.status >= 8) {
      console.error(`Falha ao copiar ${src} -> ${dest} (robocopy exit ${result.status})`);
      process.exit(1);
    }
    return;
  }

  fs.cpSync(src, dest, { recursive: true });
}

function pruneStandalone() {
  for (const name of STANDALONE_PRUNE) {
    const target = path.join(standaloneDir, name);
    if (!fs.existsSync(target)) continue;
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function patchStandalonePaths() {
  const serverJs = path.join(standaloneDir, "server.js");
  let serverContent = fs.readFileSync(serverJs, "utf8");
  serverContent = serverContent.replace(
    /"outputFileTracingRoot":"[^"]*"/,
    '"outputFileTracingRoot":dir'
  );
  serverContent = serverContent.replace(
    /"turbopack":\{"root":"[^"]*"\}/,
    '"turbopack":{"root":dir}'
  );
  fs.writeFileSync(serverJs, serverContent);

  const requiredFiles = path.join(
    standaloneDir,
    ".next",
    "required-server-files.json"
  );
  if (fs.existsSync(requiredFiles)) {
    const manifest = JSON.parse(fs.readFileSync(requiredFiles, "utf8"));
    manifest.appDir = ".";
    if (manifest.config?.turbopack) {
      manifest.config.turbopack.root = ".";
    }
    if (manifest.config) {
      manifest.config.outputFileTracingRoot = ".";
    }
    fs.writeFileSync(requiredFiles, JSON.stringify(manifest));
  }
}

copyDir(
  path.join(root, ".next", "static"),
  path.join(standaloneDir, ".next", "static")
);
copyDir(path.join(root, "public"), path.join(standaloneDir, "public"));
pruneStandalone();
patchStandalonePaths();

console.log("Desktop standalone preparado em .next/standalone");
