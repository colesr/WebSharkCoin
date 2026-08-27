/* settings.js
   Central app settings: motion, simulation parameters, live-data behavior,
   local logging. Theme selection is owned by themes.js; this module keeps a
   coarse theme light/dark flag for legacy consumers and wires the settings UI.
*/

const SETTINGS_STORAGE_KEY = "mmt_settings_v1";

const DEFAULT_SETTINGS = {
  theme: "dark",              // coarse "dark" | "light" (derived from active profile)
  reduceMotion: false,
  defaultAsset: "btc",
  historyDays: 60,
  forecastDays: 180,
  numPaths: 300,
  autoRunOnChange: true,
  liveDataEnabled: false,
  localLoggingEnabled: false,
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
  } catch { /* storage unavailable */ }
}

(function () {
  const settings = loadSettings();

  function applyMotion() {
    document.documentElement.setAttribute("data-reduce-motion", settings.reduceMotion ? "true" : "false");
  }

  function broadcast(changedKey) {
    saveSettings(settings);
    document.dispatchEvent(new CustomEvent("mmt:settings-changed", { detail: { settings, changedKey } }));
  }

  function update(key, value) {
    settings[key] = value;
    if (key === "reduceMotion") applyMotion();
    broadcast(key);
  }

  applyMotion();

  window.MMTSettings = {
    get: () => settings,
    update,
  };

  function cycleTheme() {
    if (!window.MMTThemes) return;
    const all = window.MMTThemes.getAllThemes();
    const ids = Object.keys(all);
    const cur = window.MMTThemes.getActiveThemeId();
    const idx = Math.max(0, ids.indexOf(cur));
    const next = ids[(idx + 1) % ids.length];
    window.MMTThemes.applyThemeById(next);
    const theme = all[next];
    // sync coarse flag
    const tokens = theme?.tokens || {};
    const bg = tokens.void || "#000";
    const hex = (bg || "").replace("#", "");
    let light = false;
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
      light = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;
    }
    update("theme", light ? "light" : "dark");
    // re-render theme grid if open
    document.getElementById("theme-grid") && document.dispatchEvent(new CustomEvent("mmt:theme-changed", { detail: { themeId: next } }));
    showToast(theme?.name || next);
  }

  function initPanel() {
    const els = {
      openBtn: document.getElementById("settings-btn"),
      panel: document.getElementById("settings-panel"),
      overlay: document.getElementById("settings-overlay"),
      closeBtn: document.getElementById("settings-close-btn"),
      themeQuickBtn: document.getElementById("theme-quick-btn"),

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
      if (els.reduceMotionInput) els.reduceMotionInput.checked = settings.reduceMotion;
      if (els.defaultAssetSelect) els.defaultAssetSelect.value = settings.defaultAsset;
      if (els.historyDaysInput) els.historyDaysInput.value = settings.historyDays;
      if (els.forecastDaysInput) els.forecastDaysInput.value = settings.forecastDays;
      if (els.numPathsInput) els.numPathsInput.value = settings.numPaths;
      if (els.autoRunInput) els.autoRunInput.checked = settings.autoRunOnChange;
      if (els.liveDataInput) els.liveDataInput.checked = settings.liveDataEnabled;
      if (els.loggingInput) els.loggingInput.checked = settings.localLoggingEnabled;
      if (els.historyDaysVal) els.historyDaysVal.textContent = settings.historyDays + "d";
      if (els.forecastDaysVal) els.forecastDaysVal.textContent = settings.forecastDays + "d";
      if (els.numPathsVal) els.numPathsVal.textContent = settings.numPaths;
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

    els.openBtn?.addEventListener("click", openPanel);
    els.closeBtn?.addEventListener("click", closePanel);
    els.overlay?.addEventListener("click", closePanel);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && els.panel.classList.contains("is-open")) closePanel();
    });

    els.themeQuickBtn?.addEventListener("click", cycleTheme);

    els.reduceMotionInput?.addEventListener("change", () => update("reduceMotion", els.reduceMotionInput.checked));
    els.defaultAssetSelect?.addEventListener("change", () => update("defaultAsset", els.defaultAssetSelect.value));
    els.historyDaysInput?.addEventListener("input", () => {
      els.historyDaysVal.textContent = els.historyDaysInput.value + "d";
      update("historyDays", Number(els.historyDaysInput.value));
    });
    els.forecastDaysInput?.addEventListener("input", () => {
      els.forecastDaysVal.textContent = els.forecastDaysInput.value + "d";
      update("forecastDays", Number(els.forecastDaysInput.value));
    });
    els.numPathsInput?.addEventListener("input", () => {
      els.numPathsVal.textContent = els.numPathsInput.value;
      update("numPaths", Number(els.numPathsInput.value));
    });
    els.autoRunInput?.addEventListener("change", () => update("autoRunOnChange", els.autoRunInput.checked));
    els.liveDataInput?.addEventListener("change", () => update("liveDataEnabled", els.liveDataInput.checked));
    els.loggingInput?.addEventListener("change", () => {
      update("localLoggingEnabled", els.loggingInput.checked);
      showToast(els.loggingInput.checked
        ? "Local logging on — stored only in this browser"
        : "Local logging off");
    });

    els.clearDataBtn?.addEventListener("click", () => {
      if (!confirm("Clear all locally stored data (settings, themes, scenarios, chat logs)? This can't be undone.")) return;
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith("mmt_"))
          .forEach((k) => localStorage.removeItem(k));
      } catch { /* ignore */ }
      if (window.indexedDB && window.indexedDB.databases) {
        indexedDB.databases().then((dbs) => dbs.forEach((db) => indexedDB.deleteDatabase(db.name)));
      }
      showToast("Local data cleared — reload to reset themes");
    });

    els.exportAllBtn?.addEventListener("click", () => {
      const dump = {};
      Object.keys(localStorage)
        .filter((k) => k.startsWith("mmt_"))
        .forEach((k) => { try { dump[k] = JSON.parse(localStorage.getItem(k)); } catch { dump[k] = localStorage.getItem(k); } });
      downloadTextFile(`market-mechanics-data-${Date.now()}.json`, JSON.stringify(dump, null, 2), "application/json");
      showToast("Local data exported");
    });

    // Nav rail smooth scroll
    document.querySelectorAll(".nav-rail-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.target;
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: settings.reduceMotion ? "auto" : "smooth", block: "start" });
        document.querySelectorAll(".nav-rail-btn").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
      });
    });

    // Highlight nav on scroll
    const sections = ["section-observe", "section-factors", "section-engines", "section-sensors", "section-catalysts"];
    const onScroll = () => {
      let current = sections[0];
      for (const id of sections) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 100) current = id;
      }
      document.querySelectorAll(".nav-rail-btn").forEach((b) => {
        b.classList.toggle("is-active", b.dataset.target === current);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    reflectFormFromSettings();
  }

  document.addEventListener("DOMContentLoaded", initPanel);
})();

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
