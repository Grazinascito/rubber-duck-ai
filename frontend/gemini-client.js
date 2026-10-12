"use strict";

(function (globalScope, factory) {
  const exported = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  } else {
    globalScope.GeminiClientModule = exported;
  }
})(globalThis, function () {
  const RECONNECT_BASE_DELAY_MS = 1000;
  const RECONNECT_MAX_DELAY_MS = 30000;

  function validateMessage(raw) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return { valid: false, error: "message must be an object" };
    }
    if (typeof raw.type !== "string" || raw.type.length === 0) {
      return { valid: false, error: "message.type must be a non-empty string" };
    }
    return { valid: true, message: raw };
  }

  class GeminiClient {
    constructor(url = "ws://127.0.0.1:8000/ws") {
      this.url = url;
      this.socket = null;
      this.reconnectAttempts = 0;
      this.reconnectTimer = null;
      this.manualClose = false;
      this.onStatusChange = null;
      this.onMessage = null;
    }

    connect() {
      this.manualClose = false;
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        this.reconnectAttempts = 0;
        this._emitStatus("conectado");
      };

      this.socket.onmessage = (event) => {
        let parsed;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }
        const result = validateMessage(parsed);
        if (result.valid && typeof this.onMessage === "function") {
          this.onMessage(result.message);
        }
      };

      this.socket.onclose = () => {
        this._emitStatus("desconectado");
        if (!this.manualClose) {
          this._scheduleReconnect();
        }
      };
    }

    disconnect() {
      this.manualClose = true;
      if (this.reconnectTimer !== null) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (this.socket !== null) {
        this.socket.close();
      }
    }

    send(message) {
      const result = validateMessage(message);
      if (!result.valid) {
        return false;
      }
      if (this.socket === null || this.socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      this.socket.send(JSON.stringify(result.message));
      return true;
    }

    // Raw binary frames: 16 kHz Int16 PCM audio for the Live session.
    sendBinary(data) {
      if (this.socket === null || this.socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      this.socket.send(data);
      return true;
    }

    _emitStatus(status) {
      if (typeof this.onStatusChange === "function") {
        this.onStatusChange(status);
      }
    }

    _scheduleReconnect() {
      const delay = Math.min(
        RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts,
        RECONNECT_MAX_DELAY_MS
      );
      this.reconnectAttempts += 1;
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    }
  }

  // Connection lifecycle belongs to duck-states.js (open on summon, close on
  // sleep); this module only auto-runs when loaded under node tests.

  return { validateMessage, GeminiClient };
});
