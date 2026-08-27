/* themes.js — Theme profiles + customizer
   Seven named visual identities, plus user-created/edited profiles.
   All themes are pure CSS custom-property maps applied via data-theme + inline
   overrides for custom profiles. Persisted in localStorage.
*/

const THEME_STORAGE_KEY = "mmt_themes_v1";
const ACTIVE_THEME_KEY = "mmt_active_theme";

/** Built-in theme profiles — each is a full token map. */
const BUILTIN_THEMES = {
  "midnight-amber": {
    id: "midnight-amber",
    name: "Midnight Amber",
    tagline: "Classic terminal · warm amber on void",
    builtin: true,
    tokens: {
      void: "#0a0a0b",
      panel: "#131315",
      "panel-raised": "#1b1b1e",
      line: "#2a2a2e",
      amber: "#ffb020",
      "amber-dim": "#8a6420",
      cyan: "#5fd4d4",
      green: "#3ecf8e",
      red: "#ff5c5c",
      text: "#e9e7e1",
      "text-dim": "#8f8d86",
      "text-faint": "#55534d",
      shadow: "rgba(0,0,0,0.4)",
      scanlines: "1",
      radius: "3px",
      "font-mono": "'IBM Plex Mono', ui-monospace, monospace",
      "font-sans": "'IBM Plex Sans', -apple-system, sans-serif",
    },
  },
  "coffee-house": {
    id: "coffee-house",
    name: "Coffee House",
    tagline: "Espresso · cream · walnut grain",
    builtin: true,
    tokens: {
      void: "#1a1410",
      panel: "#241c16",
      "panel-raised": "#2e241c",
      line: "#3d3228",
      amber: "#d4a574",
      "amber-dim": "#8b6914",
      cyan: "#a8c5b0",
      green: "#7a9e7e",
      red: "#c4785a",
      text: "#f0e6d8",
      "text-dim": "#a89880",
      "text-faint": "#6b5e4e",
      shadow: "rgba(20,10,0,0.5)",
      scanlines: "0",
      radius: "8px",
      "font-mono": "'IBM Plex Mono', ui-monospace, monospace",
      "font-sans": "'IBM Plex Sans', Georgia, serif",
    },
  },
  "high-tech-cool": {
    id: "high-tech-cool",
    name: "High-Tech Cool",
    tagline: "Ice · cyan · precision glass",
    builtin: true,
    tokens: {
      void: "#060a0e",
      panel: "#0c1218",
      "panel-raised": "#121a22",
      line: "#1e2a36",
      amber: "#4fc3f7",
      "amber-dim": "#1565c0",
      cyan: "#00e5ff",
      green: "#69f0ae",
      red: "#ff5252",
      text: "#e3f2fd",
      "text-dim": "#78909c",
      "text-faint": "#455a64",
      shadow: "rgba(0,40,80,0.45)",
      scanlines: "0",
      radius: "2px",
      "font-mono": "'IBM Plex Mono', ui-monospace, monospace",
      "font-sans": "'IBM Plex Sans', -apple-system, sans-serif",
    },
  },
  "neon-noir": {
    id: "neon-noir",
    name: "Neon Noir",
    tagline: "Magenta bleed · pure black · cyber alley",
    builtin: true,
    tokens: {
      void: "#050508",
      panel: "#0e0e14",
      "panel-raised": "#16161f",
      line: "#2a2a3a",
      amber: "#ff2d95",
      "amber-dim": "#9c1a5c",
      cyan: "#00f0ff",
      green: "#39ff14",
      red: "#ff0040",
      text: "#f0eef8",
      "text-dim": "#9890b0",
      "text-faint": "#58506a",
      shadow: "rgba(80,0,60,0.4)",
      scanlines: "1",
      radius: "0px",
      "font-mono": "'IBM Plex Mono', ui-monospace, monospace",
      "font-sans": "'IBM Plex Sans', -apple-system, sans-serif",
    },
  },
  "paper-ledger": {
    id: "paper-ledger",
    name: "Paper Ledger",
    tagline: "Ink on cream · accountant's desk",
    builtin: true,
    tokens: {
      void: "#f4f0e6",
      panel: "#faf8f2",
      "panel-raised": "#efebe0",
      line: "#d4cfc0",
      amber: "#8b6914",
      "amber-dim": "#c4a35a",
      cyan: "#2a6b6b",
      green: "#2d6a4f",
      red: "#9b2226",
      text: "#1a1914",
      "text-dim": "#5c584c",
      "text-faint": "#9a9588",
      shadow: "rgba(80,70,40,0.12)",
      scanlines: "0",
      radius: "4px",
      "font-mono": "'IBM Plex Mono', ui-monospace, monospace",
      "font-sans": "'IBM Plex Sans', Georgia, serif",
    },
  },
  "ocean-depth": {
    id: "ocean-depth",
    name: "Ocean Depth",
    tagline: "Abyss navy · bioluminescent teal",
    builtin: true,
    tokens: {
      void: "#061018",
      panel: "#0a1824",
      "panel-raised": "#0f2230",
      line: "#1a3548",
      amber: "#20c9a6",
      "amber-dim": "#0d7377",
      cyan: "#7fdbda",
      green: "#3ddc97",
      red: "#e85d75",
      text: "#e0f4f4",
      "text-dim": "#7a9eab",
      "text-faint": "#3d5c6a",
      shadow: "rgba(0,30,50,0.5)",
      scanlines: "0",
      radius: "6px",
      "font-mono": "'IBM Plex Mono', ui-monospace, monospace",
      "font-sans": "'IBM Plex Sans', -apple-system, sans-serif",
    },
  },
  "sunset-terminal": {
    id: "sunset-terminal",
    name: "Sunset Terminal",
    tagline: "Dusk violet · copper glow · last light",
    builtin: true,
    tokens: {
      void: "#120e18",
      panel: "#1a1424",
      "panel-raised": "#241c30",
      line: "#3a2e4a",
      amber: "#ff8c42",
      "amber-dim": "#b85c2a",
      cyan: "#c9a0dc",
      green: "#a8d5a2",
      red: "#e85a71",
      text: "#f5ebe8",
      "text-dim": "#a890a0",
      "text-faint": "#6a5870",
      shadow: "rgba(40,10,40,0.45)",
      scanlines: "1",
      radius: "4px",
      "font-mono": "'IBM Plex Mono', ui-monospace, monospace",
      "font-sans": "'IBM Plex Sans', -apple-system, sans-serif",
    },
  },
};

const TOKEN_LABELS = {
  void: "Background void",
  panel: "Panel surface",
  "panel-raised": "Raised surface",
  line: "Borders / lines",
  amber: "Primary accent",
  "amber-dim": "Accent dim",
  cyan: "Secondary accent",
  green: "Positive / up",
  red: "Negative / down",
  text: "Primary text",
  "text-dim": "Secondary text",
  "text-faint": "Faint text",
  shadow: "Shadow color",
  scanlines: "Scanlines (0/1)",
  radius: "Corner radius",
  "font-mono": "Mono font stack",
  "font-sans": "Sans font stack",
};

const COLOR_TOKENS = [
  "void", "panel", "panel-raised", "line",
  "amber", "amber-dim", "cyan", "green", "red",
  "text", "text-dim", "text-faint",
];

function loadCustomThemes() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function saveCustomThemes(map) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(map));
  } catch { /* quota */ }
}

function getAllThemes() {
  return { ...BUILTIN_THEMES, ...loadCustomThemes() };
}

function getActiveThemeId() {
  try {
    return localStorage.getItem(ACTIVE_THEME_KEY) || "midnight-amber";
  } catch {
    return "midnight-amber";
  }
}

function setActiveThemeId(id) {
  try {
    localStorage.setItem(ACTIVE_THEME_KEY, id);
  } catch { /* ignore */ }
}

function applyThemeTokens(tokens) {
  const root = document.documentElement;
  if (!tokens) return;
  Object.entries(tokens).forEach(([key, val]) => {
    if (key === "scanlines") {
      root.style.setProperty("--scanlines-opacity", val === "1" || val === 1 ? "1" : "0");
      return;
    }
    if (key === "radius") {
      root.style.setProperty("--radius", val);
      return;
    }
    if (key === "font-mono") {
      root.style.setProperty("--font-mono", val);
      return;
    }
    if (key === "font-sans") {
      root.style.setProperty("--font-sans", val);
      return;
    }
    root.style.setProperty("--" + key, val);
  });
  // data-theme for any residual CSS that keys off light/dark heuristic
  const isLight = isLightTheme(tokens);
  root.setAttribute("data-theme", isLight ? "light" : "dark");
  root.setAttribute("data-theme-id", tokens._id || "");
}

function isLightTheme(tokens) {
  const bg = tokens.void || "#000";
  // crude luminance from hex
  const hex = bg.replace("#", "");
  if (hex.length < 6) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55;
}

function applyThemeById(id) {
  const all = getAllThemes();
  const theme = all[id] || BUILTIN_THEMES["midnight-amber"];
  const tokens = { ...theme.tokens, _id: theme.id };
  applyThemeTokens(tokens);
  setActiveThemeId(theme.id);
  document.dispatchEvent(new CustomEvent("mmt:theme-changed", { detail: { themeId: theme.id, theme } }));
  return theme;
}

function duplicateTheme(sourceId, newName) {
  const all = getAllThemes();
  const src = all[sourceId];
  if (!src) return null;
  const id = "custom-" + Date.now().toString(36);
  const custom = loadCustomThemes();
  custom[id] = {
    id,
    name: newName || (src.name + " (copy)"),
    tagline: src.tagline || "Custom theme",
    builtin: false,
    basedOn: sourceId,
    tokens: { ...src.tokens },
  };
  saveCustomThemes(custom);
  return custom[id];
}

function saveThemeEdits(id, patch) {
  const custom = loadCustomThemes();
  const all = getAllThemes();
  let theme = custom[id];
  if (!theme) {
    // editing a builtin → fork it
    const src = all[id];
    if (!src) return null;
    const newId = "custom-" + Date.now().toString(36);
    theme = {
      id: newId,
      name: (patch.name || src.name) + " (edited)",
      tagline: patch.tagline || src.tagline,
      builtin: false,
      basedOn: id,
      tokens: { ...src.tokens, ...(patch.tokens || {}) },
    };
    custom[newId] = theme;
    saveCustomThemes(custom);
    return theme;
  }
  if (patch.name) theme.name = patch.name;
  if (patch.tagline) theme.tagline = patch.tagline;
  if (patch.tokens) theme.tokens = { ...theme.tokens, ...patch.tokens };
  custom[id] = theme;
  saveCustomThemes(custom);
  return theme;
}

function deleteCustomTheme(id) {
  const custom = loadCustomThemes();
  if (!custom[id]) return false;
  delete custom[id];
  saveCustomThemes(custom);
  if (getActiveThemeId() === id) applyThemeById("midnight-amber");
  return true;
}

function exportTheme(id) {
  const all = getAllThemes();
  const theme = all[id];
  if (!theme) return;
  const blob = {
    schema: "market-mechanics-theme-v1",
    exportedAt: new Date().toISOString(),
    theme: { ...theme, builtin: false },
  };
  downloadTextFile(`theme-${theme.id}.json`, JSON.stringify(blob, null, 2), "application/json");
}

function importTheme(file, cb) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const t = data.theme || data;
      if (!t.tokens || !t.name) throw new Error("Invalid theme file");
      const id = "custom-" + Date.now().toString(36);
      const custom = loadCustomThemes();
      custom[id] = {
        id,
        name: t.name,
        tagline: t.tagline || "Imported theme",
        builtin: false,
        tokens: { ...t.tokens },
      };
      saveCustomThemes(custom);
      if (cb) cb(custom[id]);
      showToast("Theme imported: " + t.name);
    } catch (err) {
      showToast("Import failed: " + err.message);
    }
  };
  reader.readAsText(file);
}

/* ---------- UI ---------- */
(function () {
  let els = {};
  let editingId = null;
  let draftTokens = {};

  function renderThemeGrid() {
    const grid = els.grid;
    if (!grid) return;
    const all = getAllThemes();
    const active = getActiveThemeId();
    grid.innerHTML = "";
    Object.values(all).forEach((t) => {
      const card = document.createElement("button");
      card.className = "theme-card" + (t.id === active ? " is-active" : "");
      card.type = "button";
      card.dataset.id = t.id;

      const swatches = ["void", "panel", "amber", "cyan", "green", "red"]
        .map((k) => `<i class="theme-swatch" style="background:${t.tokens[k]}"></i>`)
        .join("");

      card.innerHTML = `
        <div class="theme-card-swatches">${swatches}</div>
        <div class="theme-card-name">${t.name}</div>
        <div class="theme-card-tag">${t.tagline || ""}</div>
        ${t.builtin ? "" : '<span class="theme-card-custom">custom</span>'}
      `;
      card.addEventListener("click", () => {
        applyThemeById(t.id);
        // keep settings.theme in sync for legacy quick-toggle
        if (window.MMTSettings) {
          const isLight = isLightTheme(t.tokens);
          window.MMTSettings.update("theme", isLight ? "light" : "dark");
        }
        renderThemeGrid();
        showToast(t.name);
      });
      grid.appendChild(card);
    });
  }

  function openCustomizer(id) {
    const all = getAllThemes();
    const theme = all[id] || all[getActiveThemeId()];
    if (!theme) return;
    editingId = theme.id;
    draftTokens = { ...theme.tokens };
    els.customizer.classList.add("is-open");
    els.customizerOverlay.classList.add("is-visible");
    els.customName.value = theme.name;
    els.customTagline.value = theme.tagline || "";
    renderTokenEditors();
    previewDraft();
  }

  function closeCustomizer() {
    els.customizer.classList.remove("is-open");
    els.customizerOverlay.classList.remove("is-visible");
    // restore active theme (discard unsaved preview)
    applyThemeById(getActiveThemeId());
    editingId = null;
  }

  function renderTokenEditors() {
    const box = els.tokenEditors;
    if (!box) return;
    box.innerHTML = "";
    COLOR_TOKENS.forEach((key) => {
      const row = document.createElement("div");
      row.className = "token-edit-row";
      const val = draftTokens[key] || "#000000";
      row.innerHTML = `
        <label class="token-label">${TOKEN_LABELS[key] || key}</label>
        <input type="color" class="token-color" data-key="${key}" value="${normalizeHex(val)}" />
        <input type="text" class="token-hex" data-key="${key}" value="${val}" maxlength="25" />
      `;
      box.appendChild(row);
    });
    // radius + scanlines
    const extra = document.createElement("div");
    extra.className = "token-edit-row";
    extra.innerHTML = `
      <label class="token-label">Corner radius</label>
      <input type="text" class="token-hex" data-key="radius" value="${draftTokens.radius || "3px"}" />
    `;
    box.appendChild(extra);
    const scan = document.createElement("div");
    scan.className = "token-edit-row";
    scan.innerHTML = `
      <label class="token-label">Scanlines</label>
      <select data-key="scanlines" class="token-select">
        <option value="1" ${draftTokens.scanlines === "1" || draftTokens.scanlines === 1 ? "selected" : ""}>On</option>
        <option value="0" ${draftTokens.scanlines === "0" || draftTokens.scanlines === 0 ? "selected" : ""}>Off</option>
      </select>
    `;
    box.appendChild(scan);

    box.querySelectorAll(".token-color").forEach((inp) => {
      inp.addEventListener("input", () => {
        draftTokens[inp.dataset.key] = inp.value;
        const hex = box.querySelector(`.token-hex[data-key="${inp.dataset.key}"]`);
        if (hex) hex.value = inp.value;
        previewDraft();
      });
    });
    box.querySelectorAll(".token-hex").forEach((inp) => {
      inp.addEventListener("change", () => {
        draftTokens[inp.dataset.key] = inp.value;
        if (COLOR_TOKENS.includes(inp.dataset.key)) {
          const col = box.querySelector(`.token-color[data-key="${inp.dataset.key}"]`);
          if (col) col.value = normalizeHex(inp.value);
        }
        previewDraft();
      });
    });
    box.querySelectorAll(".token-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        draftTokens[sel.dataset.key] = sel.value;
        previewDraft();
      });
    });
  }

  function normalizeHex(v) {
    if (!v) return "#000000";
    if (v.startsWith("#") && (v.length === 7 || v.length === 4)) return v.length === 4
      ? "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]
      : v;
    return "#888888";
  }

  function previewDraft() {
    applyThemeTokens({ ...draftTokens, _id: editingId });
  }

  function saveCustomizer() {
    const patch = {
      name: els.customName.value.trim() || "Custom theme",
      tagline: els.customTagline.value.trim(),
      tokens: { ...draftTokens },
    };
    const saved = saveThemeEdits(editingId, patch);
    if (saved) {
      applyThemeById(saved.id);
      renderThemeGrid();
      showToast("Theme saved: " + saved.name);
      els.customizer.classList.remove("is-open");
      els.customizerOverlay.classList.remove("is-visible");
      editingId = null;
    }
  }

  function initThemes() {
    els = {
      grid: document.getElementById("theme-grid"),
      editBtn: document.getElementById("theme-edit-btn"),
      duplicateBtn: document.getElementById("theme-duplicate-btn"),
      deleteBtn: document.getElementById("theme-delete-btn"),
      exportBtn: document.getElementById("theme-export-btn"),
      importBtn: document.getElementById("theme-import-btn"),
      importInput: document.getElementById("theme-import-input"),
      newBtn: document.getElementById("theme-new-btn"),
      customizer: document.getElementById("theme-customizer"),
      customizerOverlay: document.getElementById("theme-customizer-overlay"),
      customClose: document.getElementById("theme-customizer-close"),
      customName: document.getElementById("theme-custom-name"),
      customTagline: document.getElementById("theme-custom-tagline"),
      tokenEditors: document.getElementById("theme-token-editors"),
      customSave: document.getElementById("theme-custom-save"),
      customCancel: document.getElementById("theme-custom-cancel"),
    };

    // apply saved theme immediately
    applyThemeById(getActiveThemeId());
    renderThemeGrid();

    els.editBtn?.addEventListener("click", () => openCustomizer(getActiveThemeId()));
    els.duplicateBtn?.addEventListener("click", () => {
      const name = prompt("Name for duplicated theme:", (getAllThemes()[getActiveThemeId()]?.name || "Theme") + " copy");
      if (!name) return;
      const t = duplicateTheme(getActiveThemeId(), name);
      if (t) {
        applyThemeById(t.id);
        renderThemeGrid();
        showToast("Duplicated: " + t.name);
      }
    });
    els.newBtn?.addEventListener("click", () => {
      const t = duplicateTheme("midnight-amber", "New theme");
      if (t) {
        applyThemeById(t.id);
        renderThemeGrid();
        openCustomizer(t.id);
      }
    });
    els.deleteBtn?.addEventListener("click", () => {
      const id = getActiveThemeId();
      const all = getAllThemes();
      if (all[id]?.builtin) {
        showToast("Built-in themes can't be deleted — duplicate first");
        return;
      }
      if (confirm("Delete custom theme \"" + (all[id]?.name || id) + "\"?")) {
        deleteCustomTheme(id);
        renderThemeGrid();
        showToast("Theme deleted");
      }
    });
    els.exportBtn?.addEventListener("click", () => exportTheme(getActiveThemeId()));
    els.importBtn?.addEventListener("click", () => els.importInput?.click());
    els.importInput?.addEventListener("change", (e) => {
      const f = e.target.files[0];
      if (f) importTheme(f, (t) => { applyThemeById(t.id); renderThemeGrid(); });
      e.target.value = "";
    });
    els.customClose?.addEventListener("click", closeCustomizer);
    els.customizerOverlay?.addEventListener("click", closeCustomizer);
    els.customCancel?.addEventListener("click", closeCustomizer);
    els.customSave?.addEventListener("click", saveCustomizer);
  }

  document.addEventListener("mmt:theme-changed", () => {
    // re-highlight active card when cycled from topbar
    const grid = document.getElementById("theme-grid");
    if (!grid) return;
    const active = getActiveThemeId();
    grid.querySelectorAll(".theme-card").forEach((c) => {
      c.classList.toggle("is-active", c.dataset.id === active);
    });
  });

  window.MMTThemes = {
    BUILTIN_THEMES,
    getAllThemes,
    getActiveThemeId,
    applyThemeById,
    duplicateTheme,
    saveThemeEdits,
    deleteCustomTheme,
    exportTheme,
    importTheme,
    applyThemeTokens,
  };

  // run early so first paint isn't wrong-theme flash — also on DOMContentLoaded for UI
  try { applyThemeById(getActiveThemeId()); } catch { /* */ }
  document.addEventListener("DOMContentLoaded", initThemes);
})();
