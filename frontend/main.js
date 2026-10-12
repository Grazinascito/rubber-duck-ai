"use strict";

const { app, BrowserWindow, dialog, ipcMain, session } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.join(__dirname, "..");
const SERVER_URL = "http://127.0.0.1:8000";
const HEALTH_URL = `${SERVER_URL}/health`;

let pythonProcess = null;

function resolvePythonCommand() {
  if (process.platform === "win32") {
    const venvPython = path.join(REPO_ROOT, ".venv", "Scripts", "python.exe");
    return fs.existsSync(venvPython) ? venvPython : "python";
  }
  const venvPython = path.join(REPO_ROOT, ".venv", "bin", "python");
  return fs.existsSync(venvPython) ? venvPython : "python3";
}

function spawnPython() {
  const command = resolvePythonCommand();
  pythonProcess = spawn(command, ["main.py"], { cwd: REPO_ROOT });
  pythonProcess.stdout.on("data", (data) =>
    console.log(`[python] ${String(data).trimEnd()}`)
  );
  pythonProcess.stderr.on("data", (data) =>
    console.error(`[python] ${String(data).trimEnd()}`)
  );
  pythonProcess.on("exit", (code) => console.log(`[python] exited with code ${code}`));
}

async function waitForHealth(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(HEALTH_URL);
      if (response.ok) return;
      throw new Error(`/health returned ${response.status}`);
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 360,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.loadURL(SERVER_URL);
}

ipcMain.on("duck:summon", () => console.log("[duck] summon received"));
ipcMain.on("duck:dismiss", () => console.log("[duck] dismiss received"));

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(permission === "media");
    }
  );

  spawnPython();

  try {
    await waitForHealth();
  } catch {
    dialog.showErrorBox(
      "rubber-duck-ai",
      "Não foi possível iniciar o servidor local em 127.0.0.1:8000. " +
        "Verifique se a porta está livre e se o Python (.venv ou python3) está disponível."
    );
    app.quit();
    return;
  }

  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("will-quit", () => {
  if (pythonProcess !== null) {
    pythonProcess.kill();
    pythonProcess = null;
  }
});
