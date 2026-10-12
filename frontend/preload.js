"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("duckApi", {
  summon: () => ipcRenderer.send("duck:summon"),
  dismiss: () => ipcRenderer.send("duck:dismiss"),
});
