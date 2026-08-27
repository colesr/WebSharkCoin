/* settings.js
   Central app settings: theme, animation intensity, simulation parameters,
   live-data behavior, and the local logging toggle. Persisted to
   localStorage and broadcast via a "mmt:settings-changed" custom event so
   other modules (main.js, livedata.js, chatbot.js) can react without a
   bundler or shared module system.
*/

const SETTINGS_STORAGE_KEY = "mmt_settings_v1";

const DEFAULT_SETTINGS = {
  theme: "dark",              // "dark" | "light"
  reduceMotion: false,
  defaultAsset: "btc",
  historyDays: 60,
  forecastDays: 180,
  numPaths: 300,
  autoRunOnChange: true,
  liveDataEnabled: false,
  localLoggingEnabled: false, // opt-in, off by default — see settings panel copy
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable (private browsing, quota) — settings just won't persist */
  }
}

(function () {
  const settings = loadSettings();

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", settings.theme);
  }
  function applyMotion() {
    document.documentElement.setAttribute("data-reduce-motion", settings.reduceMotion ? "true" : "false");
  }

  function broadcast(changedKey) {
    saveSettings(settings);
    document.dispatchEvent(new CustomEvent("mmt:settings-changed", { detail: { settings, changedKey } }));
  }

  function update(key, value) {
    settings[key] = value;
    if (key === "theme") applyTheme();
    if (key === "reduceMotion") applyMotion();
    broadcast(key);
  }

  applyTheme();
  applyMotion();

  window.MMTSettings = {
    get: () => settings,
    update,
  };

  /* ---------- Panel wiring ---------- */
  function initPanel() {
    const els = {
      openBtn: document.getElementById("settings-btn"),
      panel: document.getElementById("settings-panel"),
      overlay: document.getElementById("settings-overlay"),
      closeBtn: document.getElementById("settings-close-btn"),
      themeQuickBtn: document.getElementById("theme-quick-btn"),

      themeRadios: document.querySelectorAll('input[name="theme"]'),
      reduceMotionInput: document.getElementById("setting-reduce-motion"),
      defaultAssetSelect: document.getElementById("setting-default-asset"),
      historyDaysInput: document.getElementById("setting-history-days"),
      forecastDaysInput: document.getElementById("setting-forecast-days"),
      numPathsInput: document.getElementById("setting-num-paths"),
      autoRunInput: document.getElementById("setting-auto-run"),
      liveDataInput: document.getElementById("setting-live-data"),
      loggingInput: document.getElementById("setting-local-logging"),

      historyDaysVal: document.getElementById("setting-history-days-val"),
      forecastDaysVal: document.getElementById("setting-forecast-days-val"),
      numPathsVal: document.getElementById("setting-num-paths-val"),

      clearDataBtn: document.getElementById("clear-local-data-btn"),
      exportAllBtn: document.getElementById("export-all-data-btn"),
    };

    function reflectFormFromSettings() {
      els.themeRadios.forEach((r) => (r.checked = r.value === settings.theme));
      els.reduceMotionInput.checked = settings.reduceMotion;
      els.defaultAssetSelect.value = settings.defaultAsset;
      els.historyDaysInput.value = settings.historyDays;
      els.forecastDaysInput.value = settings.forecastDays;
      els.numPathsInput.value = settings.numPaths;
      els.autoRunInput.checked = settings.autoRunOnChange;
      els.liveDataInput.checked = settings.liveDataEnabled;
      els.loggingInput.checked = settings.localLoggingEnabled;
      els.historyDaysVal.textContent = settings.historyDays + "d";
      els.forecastDaysVal.textContent = settings.forecastDays + "d";
      els.numPathsVal.textContent = settings.numPaths;
    }

    function openPanel() {
      els.panel.classList.add("is-open");
      els.overlay.classList.add("is-visible");
      els.panel.setAttribute("aria-hidden", "false");
    }
    function closePanel() {
      els.panel.classList.remove("is-open");
      els.overlay.classList.remove("is-visible");
      els.panel.setAttribute("aria-hidden", "true");
    }

    els.openBtn.addEventListener("click", openPanel);
    els.closeBtn.addEventListener("click", closePanel);
    els.overlay.addEventListener("click", closePanel);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && els.panel.classList.contains("is-open")) closePanel();
    });

    els.themeQuickBtn.addEventListener("click", () => {
      update("theme", settings.theme === "dark" ? "light" : "dark");
      reflectFormFromSettings();
      showToast(settings.theme === "dark" ? "Dark mode enabled" : "Light mode enabled");
    });

    els.themeRadios.forEach((r) => {
      r.addEventListener("change", () => { if (r.checked) update("theme", r.value); });
    });
    els.reduceMotionInput.addEventListener("change", () => update("reduceMotion", els.reduceMotionInput.checked));
    els.defaultAssetSelect.addEventListener("change", () => update("defaultAsset", els.defaultAssetSelect.value));
    els.historyDaysInput.addEventListener("input", () => {
      els.historyDaysVal.textContent = els.historyDaysInput.value + "d";
      update("historyDays", Number(els.historyDaysInput.value));
    });
    els.forecastDaysInput.addEventListener("input", () => {
      els.forecastDaysVal.textContent = els.forecastDaysInput.value + "d";
      update("forecastDays", Number(els.forecastDaysInput.value));
    });
    els.numPathsInput.addEventListener("input", () => {
      els.numPathsVal.textContent = els.numPathsInput.value;
      update("numPaths", Number(els.numPathsInput.value));
    });
    els.autoRunInput.addEventListener("change", () => update("autoRunOnChange", els.autoRunInput.checked));
    els.liveDataInput.addEventListener("change", () => update("liveDataEnabled", els.liveDataInput.checked));
    els.loggingInput.addEventListener("change", () => {
      update("localLoggingEnabled", els.loggingInput.checked);
      showToast(els.loggingInput.checked
        ? "Local logging on — stored only in this browser"
        : "Local logging off");
    });

    els.clearDataBtn.addEventListener("click", () => {
      if (!confirm("Clear all locally stored data (settings, saved config, chat logs, feedback)? This can't be undone.")) return;
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith("mmt_"))
          .forEach((k) => localStorage.removeItem(k));
      } catch { /* ignore */ }
      if (window.indexedDB && window.indexedDB.databases) {
        indexedDB.databases().then((dbs) => dbs.forEach((db) => indexedDB.deleteDatabase(db.name)));
      }
      showToast("Local data cleared");
    });

    els.exportAllBtn.addEventListener("click", () => {
      const dump = {};
      Object.keys(localStorage)
        .filter((k) => k.startsWith("mmt_"))
        .forEach((k) => { try { dump[k] = JSON.parse(localStorage.getItem(k)); } catch { dump[k] = localStorage.getItem(k); } });
      downloadTextFile(`market-mechanics-data-${Date.now()}.json`, JSON.stringify(dump, null, 2), "application/json");
      showToast("Local data exported");
    });

    reflectFormFromSettings();
  }

  document.addEventListener("DOMContentLoaded", initPanel);
})();

/* ---------- Lightweight toast notifications (used across modules) ---------- */
function showToast(message, kind) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast" + (kind ? " toast-" + kind : "");
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}
