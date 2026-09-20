/* ============================================================================
 * storage.js — Pluggable Storage & Sync Service for Renovation Dashboard
 * ----------------------------------------------------------------------------
 * Designed for local-first operation with zero backend dependencies, while
 * providing a ready-to-plug API for remote backends (Raspberry Pi, VPS, cloud).
 *
 * To connect a remote backend in the future, set:
 *   window.CONFIG = { apiUrl: "https://your-house-api.local" };
 *
 * All data reads and writes flow through here:
 *   - load(): loads from remote API or localStorage, falling back to data.js
 *   - save(data): saves to localStorage and remote API
 *   - logEvent(type, payload): audit trail for tasks, budgets, and breaker trips
 * ============================================================================ */

(function () {
  "use strict";

  const STORAGE_KEY = "HOUSE_DATA_v1";
  const LOGS_KEY    = "HOUSE_LOGS_v1";

  const StorageService = {
    getApiUrl() {
      return (window.CONFIG && window.CONFIG.apiUrl) || null;
    },

    /**
     * Load initial state.
     * Tries remote API first (if configured), then localStorage, then window.HOUSE.
     */
    async load() {
      const apiUrl = this.getApiUrl();
      if (apiUrl) {
        try {
          const res = await fetch(`${apiUrl}/api/house`, { method: "GET" });
          if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.rooms)) {
              console.log("[StorageService] Hydrated from remote backend:", apiUrl);
              return data;
            }
          }
        } catch (err) {
          console.warn("[StorageService] Remote backend unavailable, falling back to local:", err);
        }
      }

      // Check localStorage
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && Array.isArray(parsed.rooms)) {
            console.log("[StorageService] Hydrated from localStorage");
            return parsed;
          }
        }
      } catch (err) {
        console.warn("[StorageService] Failed to read localStorage:", err);
      }

      console.log("[StorageService] Using default window.HOUSE");
      return window.HOUSE;
    },

    /**
     * Persist state.
     * Writes to localStorage and asynchronously syncs to remote API if configured.
     */
    async save(data) {
      if (!data) return;

      // 1. Local-first persist
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (err) {
        console.error("[StorageService] Failed to save to localStorage:", err);
      }

      // 2. Remote backend sync (if configured)
      const apiUrl = this.getApiUrl();
      if (apiUrl) {
        try {
          await fetch(`${apiUrl}/api/house`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
        } catch (err) {
          console.warn("[StorageService] Remote sync failed:", err);
        }
      }
    },

    /**
     * Log an event (task checked, budget changed, breaker toggled).
     * Maintains an in-browser log history and syncs to backend.
     */
    async logEvent(eventType, payload) {
      const entry = {
        timestamp: new Date().toISOString(),
        event: eventType,
        payload,
      };

      try {
        const logs = JSON.parse(localStorage.getItem(LOGS_KEY) || "[]");
        logs.push(entry);
        if (logs.length > 200) logs.shift(); // keep last 200 entries
        localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
      } catch (e) {}

      const apiUrl = this.getApiUrl();
      if (apiUrl) {
        try {
          await fetch(`${apiUrl}/api/logs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entry),
          });
        } catch (e) {}
      }
    },

    /**
     * Clear local edits and revert to default.
     */
    reset() {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LOGS_KEY);
      } catch (e) {}
    },

    /**
     * Format current state as standalone data.js JavaScript.
     */
    toJsCode(data) {
      return `/* ============================================================================
 * HOUSE DATA  —  single source of truth for the dashboard
 * Generated: ${new Date().toLocaleString()}
 * ============================================================================ */

window.HOUSE = ${JSON.stringify(data, null, 2)};
`;
    }
  };

  window.StorageService = StorageService;
})();
