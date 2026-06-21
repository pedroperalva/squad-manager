const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");

const DEV_PORT = 3000;
const PROD_PORT = 38472;
let nextProcess = null;

function getAppRoot() {
  if (!app.isPackaged) {
    return path.join(__dirname, "..");
  }
  return app.getAppPath();
}

function getServerPort() {
  return app.isPackaged ? PROD_PORT : DEV_PORT;
}

function getServerUrl() {
  return `http://127.0.0.1:${getServerPort()}`;
}

function waitForPort(port, timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const tryConnect = () => {
      const socket = net.connect(port, "127.0.0.1", () => {
        socket.end();
        resolve();
      });

      socket.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Servidor não respondeu na porta ${port}.`));
          return;
        }
        setTimeout(tryConnect, 300);
      });
    };

    tryConnect();
  });
}

function startPackagedServer() {
  const appRoot = getAppRoot();
  const serverEntry = path.join(appRoot, "server.js");

  nextProcess = spawn(process.execPath, [serverEntry], {
    cwd: appRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PROD_PORT),
      HOSTNAME: "127.0.0.1",
      ELECTRON_RUN_AS_NODE: "1",
      SQUAD_MANAGER_DATA_DIR: path.join(app.getPath("userData"), "data"),
      NODE_PATH: path.join(appRoot, "node_modules"),
    },
    stdio: "inherit",
  });

  nextProcess.on("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(`Servidor encerrou com código ${code}.`);
    }
    if (signal) {
      console.error(`Servidor encerrou por sinal ${signal}.`);
    }
    nextProcess = null;
  });

  return waitForPort(PROD_PORT);
}

async function ensureServerReady() {
  if (app.isPackaged) {
    await startPackagedServer();
    return;
  }
  await waitForPort(DEV_PORT);
}

function stopServer() {
  if (!nextProcess) return;
  nextProcess.kill();
  nextProcess = null;
}

async function createWindow() {
  await ensureServerReady();

  const win = new BrowserWindow({
    fullscreen: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  await win.loadURL(getServerUrl());
}

ipcMain.handle("app:quit", () => {
  app.quit();
});

app.whenReady().then(createWindow);

app.on("before-quit", () => {
  stopServer();
});

app.on("window-all-closed", () => {
  app.quit();
});
