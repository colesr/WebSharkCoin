/* scenarios.js — Scenario Library + Branching "What If" Tree
   Save named configurations, fork them into branches, compare side-by-side.
*/

const SCENARIO_STORAGE_KEY = "mmt_scenarios_v1";

function loadScenarioLibrary() {
  try {
    const raw = localStorage.getItem(SCENARIO_STORAGE_KEY);
    if (!raw) return { root: null, nodes: {} };
    return JSON.parse(raw);
  } catch {
    return { root: null, nodes: {} };
  }
}

function saveScenarioLibrary(lib) {
  try {
    localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(lib));
  } catch { /* quota */ }
}

function makeScenarioId() {
  return "sc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

function captureCurrentScenario(name, parentId = null) {
  if (!window.MMT) return null;
  const { state } = window.MMT;
  const cfg = window.MMTSettings?.get() || {};
  return {
    id: makeScenarioId(),
    name: name || "Untitled scenario",
    parentId,
    createdAt: new Date().toISOString(),
    assetId: state.assetId,
    seed: state.seed,
    values: { ...state.values },
    catalysts: Array.from(state.catalysts),
    settings: {
      historyDays: cfg.historyDays,
      forecastDays: cfg.forecastDays,
      numPaths: cfg.numPaths,
    },
    // optional feature flags snapshot
    features: {
      reflexivity: window.MMTReflexivity?.getStrength?.() ?? 0,
      contagion: window.MMTContagion?.isEnabled?.() ?? false,
      agents: window.MMTAgents?.isEnabled?.() ?? false,
      temporal: window.MMTTemporal?.isAnyEnabled?.() ?? false,
    },
    note: "",
  };
}

function applyScenario(sc) {
  if (!window.MMT || !sc) return;
  const { state } = window.MMT;
  if (sc.assetId) state.assetId = sc.assetId;
  if (sc.seed != null) state.seed = sc.seed;
  if (sc.values) {
    Object.keys(sc.values).forEach((k) => {
      if (typeof sc.values[k] === "number") state.values[k] = clamp(sc.values[k], -100, 100);
    });
  }
  if (Array.isArray(sc.catalysts)) {
    state.catalysts = new Set(sc.catalysts);
  }
  // re-render via main
  document.dispatchEvent(new CustomEvent("mmt:scenario-loaded", { detail: { scenario: sc } }));
  window.MMT.runSimulation?.();
}

(function () {
  let lib = loadScenarioLibrary();
  let compareIds = []; // up to 3 for side-by-side
  let els = {};

  function persist() {
    saveScenarioLibrary(lib);
  }

  function saveNew(name) {
    const sc = captureCurrentScenario(name);
    if (!sc) return;
    lib.nodes[sc.id] = sc;
    if (!lib.root) lib.root = sc.id;
    persist();
    renderLibrary();
    showToast("Scenario saved: " + sc.name);
    return sc;
  }

  function fork(parentId, name) {
    const parent = lib.nodes[parentId];
    if (!parent) return;
    // first apply parent so we fork from its state, then capture with current (possibly edited) state
    const sc = captureCurrentScenario(name || parent.name + " (fork)", parentId);
    lib.nodes[sc.id] = sc;
    persist();
    renderLibrary();
    showToast("Forked: " + sc.name);
    return sc;
  }

  function remove(id) {
    // orphan children → promote to root-level (parentId null)
    Object.values(lib.nodes).forEach((n) => {
      if (n.parentId === id) n.parentId = lib.nodes[id]?.parentId ?? null;
    });
    delete lib.nodes[id];
    if (lib.root === id) {
      lib.root = Object.keys(lib.nodes)[0] || null;
    }
    compareIds = compareIds.filter((x) => x !== id);
    persist();
    renderLibrary();
  }

  function getChildren(parentId) {
    return Object.values(lib.nodes).filter((n) => n.parentId === parentId);
  }

  function renderTree(parentId, depth) {
    const nodes = parentId === null
      ? Object.values(lib.nodes).filter((n) => !n.parentId)
      : getChildren(parentId);
    let html = "";
    nodes.forEach((n) => {
      const kids = getChildren(n.id);
      html += `<div class="scenario-node" style="margin-left:${depth * 14}px" data-id="${n.id}">
        <div class="scenario-node-row">
          <button class="scenario-load-btn" data-id="${n.id}" title="Load">${n.name}</button>
          <span class="scenario-meta">${n.assetId?.toUpperCase() || ""} · ${new Date(n.createdAt).toLocaleDateString()}</span>
          <button class="ghost-btn scenario-fork-btn" data-id="${n.id}" title="Fork">⑂</button>
          <button class="ghost-btn scenario-compare-btn ${compareIds.includes(n.id) ? "is-active" : ""}" data-id="${n.id}" title="Compare">⇄</button>
          <button class="ghost-btn scenario-del-btn" data-id="${n.id}" title="Delete">✕</button>
        </div>
      </div>`;
      if (kids.length) html += renderTree(n.id, depth + 1);
    });
    return html;
  }

  function renderLibrary() {
    if (!els.list) return;
    const html = renderTree(null, 0);
    els.list.innerHTML = html || `<p class="settings-note">No saved scenarios yet. Dial in factors and click Save.</p>`;

    els.list.querySelectorAll(".scenario-load-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sc = lib.nodes[btn.dataset.id];
        applyScenario(sc);
        showToast("Loaded: " + sc.name);
      });
    });
    els.list.querySelectorAll(".scenario-fork-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = prompt("Name for forked scenario:", (lib.nodes[btn.dataset.id]?.name || "") + " — branch");
        if (name) fork(btn.dataset.id, name);
      });
    });
    els.list.querySelectorAll(".scenario-del-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (confirm("Delete this scenario?")) remove(btn.dataset.id);
      });
    });
    els.list.querySelectorAll(".scenario-compare-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        if (compareIds.includes(id)) {
          compareIds = compareIds.filter((x) => x !== id);
        } else if (compareIds.length < 3) {
          compareIds.push(id);
        } else {
          showToast("Max 3 scenarios for comparison");
          return;
        }
        renderLibrary();
        renderCompare();
      });
    });
  }

  function renderCompare() {
    const panel = document.getElementById("scenario-compare-panel");
    if (!panel) return;
    if (compareIds.length < 2) {
      panel.classList.add("is-hidden");
      panel.innerHTML = "";
      return;
    }
    panel.classList.remove("is-hidden");
    let html = `<h3 class="panel-title">Scenario Compare</h3><div class="compare-grid">`;
    compareIds.forEach((id) => {
      const sc = lib.nodes[id];
      if (!sc) return;
      const { annualDrift, annualVol } = computeComposite(sc.values, ASSETS.find((a) => a.id === sc.assetId)?.baseAnnualVol || 0.55);
      html += `<div class="compare-card">
        <div class="compare-name">${sc.name}</div>
        <div class="compare-asset">${sc.assetId?.toUpperCase()}</div>
        <div class="compare-metric">Drift <strong>${(annualDrift * 100).toFixed(1)}%</strong></div>
        <div class="compare-metric">Vol <strong>${(annualVol * 100).toFixed(1)}%</strong></div>
        <div class="compare-metric">Catalysts <strong>${sc.catalysts?.length || 0}</strong></div>
        <button class="ghost-btn compare-load" data-id="${id}">Load</button>
      </div>`;
    });
    html += `</div>`;
    panel.innerHTML = html;
    panel.querySelectorAll(".compare-load").forEach((btn) => {
      btn.addEventListener("click", () => applyScenario(lib.nodes[btn.dataset.id]));
    });
  }

  function exportTree() {
    const blob = {
      schema: "market-mechanics-scenario-tree-v1",
      exportedAt: new Date().toISOString(),
      library: lib,
    };
    downloadTextFile(`scenario-tree-${Date.now()}.json`, JSON.stringify(blob, null, 2), "application/json");
    showToast("Scenario tree exported");
  }

  function importTree(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.library?.nodes) {
          lib = data.library;
          persist();
          renderLibrary();
          showToast("Scenario tree imported");
        } else throw new Error("Invalid tree file");
      } catch (err) {
        showToast("Import failed: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  function initScenarios() {
    els = {
      list: document.getElementById("scenario-list"),
      saveBtn: document.getElementById("scenario-save-btn"),
      exportBtn: document.getElementById("scenario-export-btn"),
      importBtn: document.getElementById("scenario-import-btn"),
      importInput: document.getElementById("scenario-import-input"),
    };
    if (!els.list) return;

    els.saveBtn?.addEventListener("click", () => {
      const name = prompt("Scenario name:", "Base case");
      if (name) saveNew(name);
    });
    els.exportBtn?.addEventListener("click", exportTree);
    els.importBtn?.addEventListener("click", () => els.importInput?.click());
    els.importInput?.addEventListener("change", (e) => {
      const f = e.target.files[0];
      if (f) importTree(f);
      e.target.value = "";
    });

    renderLibrary();
  }

  window.MMTScenarios = {
    saveNew,
    fork,
    applyScenario,
    captureCurrentScenario,
    getLibrary: () => lib,
  };

  document.addEventListener("DOMContentLoaded", initScenarios);
})();
