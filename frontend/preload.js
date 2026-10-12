"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("duckApi", {
  summon: () => ipcRenderer.send("duck:summon"),
  dismiss: () => ipcRenderer.send("duck:dismiss"),
  onShortcutPressed: (callback) =>
    ipcRenderer.on("shortcut:pressed", () => callback()),
  onTraySummon: (callback) => ipcRenderer.on("tray:summon", () => callback()),
  onDuckMoved: (callback) => ipcRenderer.on("duck:moved", () => callback()),
});
