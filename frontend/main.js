"use strict";

const {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  session,
  systemPreferences,
  Tray,
} = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.join(__dirname, "..");
const SERVER_URL = "http://127.0.0.1:8000";
const HEALTH_URL = `${SERVER_URL}/health`;

let pythonProcess = null;
let duckWindow = null;

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

const DUCK_WINDOW_SIZE = 160;
const DUCK_WINDOW_MARGIN = 16;

function duckWindowPosition() {
  const workArea = screen.getPrimaryDisplay().workArea;
  return {
    x: workArea.x + workArea.width - DUCK_WINDOW_SIZE - DUCK_WINDOW_MARGIN,
    y: workArea.y + workArea.height - DUCK_WINDOW_SIZE - DUCK_WINDOW_MARGIN,
  };
}

function createWindow() {
  const { x, y } = duckWindowPosition();
  duckWindow = new BrowserWindow({
    width: DUCK_WINDOW_SIZE,
    height: DUCK_WINDOW_SIZE,
    x,
    y,
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  duckWindow.loadURL(SERVER_URL);
}

const MOUSE_POLL_INTERVAL_MS = 50;
let mouseCaptured = null;

// Click-through hover detection lives in the main process on purpose:
// setIgnoreMouseEvents makes the OS skip the window entirely, so no renderer
// event (mouseenter/mousemove, even with forward: true) fires reliably.
// Polling the system cursor against the window bounds does not depend on
// page events.
function startMouseCapturePolling() {
  setInterval(() => {
    if (duckWindow === null || !duckWindow.isVisible()) {
      mouseCaptured = null;
      return;
    }
    const cursor = screen.getCursorScreenPoint();
    const bounds = duckWindow.getBounds();
    const inside =
      cursor.x >= bounds.x &&
      cursor.x <= bounds.x + bounds.width &&
      cursor.y >= bounds.y &&
      cursor.y <= bounds.y + bounds.height;
    if (inside !== mouseCaptured) {
      mouseCaptured = inside;
      duckWindow.setIgnoreMouseEvents(!inside);
    }
  }, MOUSE_POLL_INTERVAL_MS);
}

ipcMain.on("duck:summon", () => {
  if (duckWindow === null) return;
  duckWindow.show();
});

ipcMain.on("duck:dismiss", () => {
  if (duckWindow === null) return;
  duckWindow.hide();
});

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

  // T035: on macOS the renderer's getUserMedia fails without the system-level
  // microphone grant; Windows uses the Chromium prompt instead.
  if (
    process.platform === "darwin" &&
    systemPreferences.getMediaAccessStatus("microphone") !== "granted"
  ) {
    await systemPreferences.askForMediaAccess("microphone");
  }

  createWindow();

  globalShortcut.register("CommandOrControl+Shift+D", () => {
    if (duckWindow !== null) {
      duckWindow.webContents.send("shortcut:pressed");
    }
  });

  createTray();
  startMouseCapturePolling();
});

function createTray() {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, "images", "tray-template.png")
  );
  if (process.platform === "darwin") {
    icon.setTemplateImage(true);
  }
  const tray = new Tray(icon);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Convocar pato",
        click: () => {
          if (duckWindow !== null) {
            duckWindow.webContents.send("tray:summon");
          }
        },
      },
      { type: "separator" },
      { label: "Sair", click: () => app.quit() },
    ])
  );
  return tray;
}

app.on("window-all-closed", () => {
  app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (pythonProcess !== null) {
    pythonProcess.kill();
    pythonProcess = null;
  }
});
