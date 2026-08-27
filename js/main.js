/* main.js — wires factor data + engine + simulator to the DOM */

(function () {
  const state = {
    assetId: "btc",
    activeCategory: FACTOR_CATEGORIES[0].id,
    values: {},
    catalysts: new Set(),
    seed: randomSeed(),
    liveHistory: null,
  };
  FACTORS.forEach((f) => (state.values[f.id] = f.default));

  const els = {
    priceValue: document.getElementById("price-value"),
    assetName: document.getElementById("asset-name"),
    driftValue: document.getElementById("drift-value"),
    volValue: document.getElementById("vol-value"),
    toneValue: document.getElementById("tone-value"),
    breakdownList: document.getElementById("breakdown-list"),
    tabs: document.getElementById("category-tabs"),
    slidersContainer: document.getElementById("sliders-container"),
    catalystGrid: document.getElementById("catalyst-grid"),
    seismographCanvas: document.getElementById("seismograph"),
    forecastCanvas: document.getElementById("forecast-canvas"),
    runBtn: document.getElementById("run-btn"),
    reseedBtn: document.getElementById("reseed-btn"),
    resetBtn: document.getElementById("reset-btn"),
    seedReadout: document.getElementById("seed-readout"),
    forecastSub: document.getElementById("forecast-sub"),
    assetBtns: Array.from(document.querySelectorAll(".asset-btn")),
    exportCodeBtn: document.getElementById("export-code-btn"),
    exportConfigBtn: document.getElementById("export-config-btn"),
    importBtn: document.getElementById("import-btn"),
    importInput: document.getElementById("import-input"),
  };

  const seismo = new Seismograph(els.seismographCanvas);
  let lastDriftVal = 0, lastVolVal = 0; // for count-up animation

  function settings() {
    return window.MMTSettings ? window.MMTSettings.get() : DEFAULT_SETTINGS;
  }

  function currentAsset() {
    return ASSETS.find((a) => a.id === state.assetId);
  }

  /* ---------- Tabs ---------- */
  function renderTabs() {
    els.tabs.innerHTML = "";
    FACTOR_CATEGORIES.forEach((cat) => {
      const btn = document.createElement("button");
      btn.className = "tab-btn" + (cat.id === state.activeCategory ? " is-active" : "");
      btn.textContent = cat.label;
      btn.setAttribute("role", "tab");
      btn.addEventListener("click", () => {
        state.activeCategory = cat.id;
        renderTabs();
        renderSliders();
      });
      els.tabs.appendChild(btn);
    });
  }

  /* ---------- Sliders ---------- */
  function renderSliders() {
    els.slidersContainer.innerHTML = "";
    const factors = FACTORS.filter((f) => f.category === state.activeCategory);
    factors.forEach((f, i) => {
      const item = document.createElement("div");
      item.className = "slider-item";
      item.style.animationDelay = (i * 30) + "ms";

      const head = document.createElement("div");
      head.className = "slider-head";
      const name = document.createElement("span");
      name.className = "slider-name";
      name.textContent = f.label;
      const val = document.createElement("span");
      val.className = "slider-val";
      val.textContent = fmtSigned(state.values[f.id]);
      head.appendChild(name);
      head.appendChild(val);

      const desc = document.createElement("p");
      desc.className = "slider-desc";
      desc.textContent = f.desc;

      const input = document.createElement("input");
      input.type = "range";
      input.min = "-100";
      input.max = "100";
      input.step = "1";
      input.value = state.values[f.id];
      input.setAttribute("aria-label", f.label);

      const endLabels = document.createElement("div");
      endLabels.className = "slider-endlabels";
      const lo = document.createElement("span");
      lo.textContent = f.lowLabel;
      const hi = document.createElement("span");
      hi.textContent = f.highLabel;
      endLabels.appendChild(lo);
      endLabels.appendChild(hi);

      input.addEventListener("input", () => {
        state.values[f.id] = Number(input.value);
        val.textContent = fmtSigned(state.values[f.id]);
        val.classList.remove("pulse-cyan");
        void val.offsetWidth; // restart animation
        val.classList.add("pulse-cyan");
        recomputeAndRender(true);
        if (settings().autoRunOnChange) scheduleAutoRun();
      });

      item.appendChild(head);
      item.appendChild(desc);
      item.appendChild(input);
      item.appendChild(endLabels);
      els.slidersContainer.appendChild(item);
    });
  }

  let autoRunTimer = null;
  function scheduleAutoRun() {
    clearTimeout(autoRunTimer);
    autoRunTimer = setTimeout(runSimulation, 450);
  }

  function fmtSigned(v) {
    const n = Math.round(v);
    return (n > 0 ? "+" : "") + n;
  }

  /* ---------- Catalysts ---------- */
  function renderCatalysts() {
    els.catalystGrid.innerHTML = "";
    CATALYSTS.forEach((c, i) => {
      const btn = document.createElement("button");
      btn.className = "catalyst-btn" + (state.catalysts.has(c.id) ? " is-active" : "");
      btn.dataset.group = c.group;
      btn.style.animationDelay = (i * 20) + "ms";

      const name = document.createElement("div");
      name.className = "catalyst-name";
      name.textContent = c.label;
      const desc = document.createElement("div");
      desc.className = "catalyst-desc";
      desc.textContent = c.desc;
      const shock = document.createElement("div");
      shock.className = "catalyst-shock";
      shock.textContent = (c.shock > 0 ? "+" : "") + Math.round(c.shock * 100) + "% shock · " +
        Math.round(c.volSpike * 100) + "% vol spike";

      btn.appendChild(name);
      btn.appendChild(desc);
      btn.appendChild(shock);

      btn.addEventListener("click", () => {
        if (state.catalysts.has(c.id)) {
          state.catalysts.delete(c.id);
        } else {
          state.catalysts.add(c.id);
          triggerImpactFlash();
          showToast((c.group === "bullish" ? "▲ " : c.group === "bearish" ? "▼ " : "◆ ") + c.label + " armed");
        }
        renderCatalysts();
        recomputeAndRender(true);
        if (settings().autoRunOnChange) scheduleAutoRun();
      });

      els.catalystGrid.appendChild(btn);
    });
  }

  function triggerImpactFlash() {
    const panel = document.querySelector(".ticker-panel");
    if (!panel) return;
    panel.classList.remove("panel-flash");
    void panel.offsetWidth;
    panel.classList.add("panel-flash");
  }

  /* ---------- Breakdown ---------- */
  function renderBreakdown(contributions) {
    els.breakdownList.innerHTML = "";
    const top = contributions.slice(0, 7);
    const maxAbs = Math.max(0.001, ...top.map((c) => Math.abs(c.driftContrib)));
    top.forEach((c, i) => {
      const row = document.createElement("div");
      row.className = "breakdown-row";
      row.style.animationDelay = (i * 25) + "ms";

      const label = document.createElement("span");
      label.className = "breakdown-label";
      label.textContent = c.label;

      const track = document.createElement("div");
      track.className = "breakdown-track";
      const fill = document.createElement("div");
      const pct = (Math.abs(c.driftContrib) / maxAbs) * 50; // half-track max
      fill.className = "breakdown-fill " + (c.driftContrib >= 0 ? "pos" : "neg");
      track.appendChild(fill);
      requestAnimationFrame(() => { fill.style.width = pct + "%"; });

      const pctLabel = document.createElement("span");
      pctLabel.className = "breakdown-pct";
      pctLabel.textContent = (c.driftContrib >= 0 ? "+" : "") + (c.driftContrib * 100).toFixed(1) + "%";

      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(pctLabel);
      els.breakdownList.appendChild(row);
    });
  }

  /* ---------- Number count-up animation ---------- */
  function animateNumber(el, from, to, fmt, duration = 350) {
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = from + (to - from) * eased;
      el.textContent = fmt(val);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- Compute + live readouts ---------- */
  function recomputeAndRender(pulse) {
    const asset = currentAsset();
    const { annualDrift, annualVol, contributions } = computeComposite(state.values, asset.baseAnnualVol);

    const reduceMotion = settings().reduceMotion;
    if (reduceMotion) {
      els.driftValue.textContent = (annualDrift >= 0 ? "+" : "") + (annualDrift * 100).toFixed(1) + "%";
      els.volValue.textContent = (annualVol * 100).toFixed(1) + "%";
    } else {
      animateNumber(els.driftValue, lastDriftVal * 100, annualDrift * 100, (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%");
      animateNumber(els.volValue, lastVolVal * 100, annualVol * 100, (v) => v.toFixed(1) + "%");
    }
    lastDriftVal = annualDrift;
    lastVolVal = annualVol;

    const tone = driftLabel(annualDrift);
    els.toneValue.textContent = tone.text;
    els.toneValue.classList.remove("tone-pop");
    void els.toneValue.offsetWidth;
    els.toneValue.className = "metric-value tone-tag tone-pop " + tone.cls;

    renderBreakdown(contributions);

    const normalizedDrift = clamp(annualDrift / BASE_DRIFT_SCALE, -1, 1);
    seismo.push(normalizedDrift, pulse ? 1 : 0);
    seismo.draw();

    return { annualDrift, annualVol };
  }

  /* ---------- Forecast simulation ---------- */
  function runSimulation() {
    const asset = currentAsset();
    const { annualDrift, annualVol } = recomputeAndRender(false);
    const catalysts = activeCatalysts(state.catalysts);
    const cfg = settings();

    const history = synthesizeHistory({
      startPrice: asset.startPrice,
      annualVol,
      seed: state.seed,
      historyDays: cfg.historyDays,
    });

    const paths = simulatePaths({
      startPrice: asset.startPrice,
      annualDrift,
      annualVol,
      catalysts,
      seed: state.seed,
      forecastDays: cfg.forecastDays,
      numPaths: cfg.numPaths,
    });

    const bands = buildForecastBands(paths, cfg.forecastDays);

    els.forecastCanvas.classList.remove("chart-refresh");
    void els.forecastCanvas.offsetWidth;
    els.forecastCanvas.classList.add("chart-refresh");

    drawForecastChart(els.forecastCanvas, {
      history,
      bands,
      historyDays: cfg.historyDays,
      forecastDays: cfg.forecastDays,
      liveHistory: state.liveHistory,
    });

    els.seedReadout.textContent = "seed: " + state.seed;
    els.forecastSub.textContent = `Monte Carlo · ${cfg.numPaths} paths · ${cfg.forecastDays}d`;
    document.dispatchEvent(new CustomEvent("mmt:simulation-run", { detail: { annualDrift, annualVol, bands } }));
  }

  /* ---------- Asset selection ---------- */
  function selectAsset(id) {
    const asset0 = currentAsset();
    state.assetId = id;
    state.liveHistory = null;
    const asset = currentAsset();

    animateNumber(els.priceValue, asset0.startPrice, asset.startPrice, (v) => fmtPrice(v), 400);
    els.assetName.textContent = asset.name + " · scenario model";
    els.assetBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.asset === id));
    recomputeAndRender(false);
    runSimulation();
    document.dispatchEvent(new CustomEvent("mmt:asset-changed", { detail: { assetId: id } }));
  }

  /* ---------- Reset ---------- */
  function resetAll() {
    FACTORS.forEach((f) => (state.values[f.id] = f.default));
    state.catalysts.clear();
    renderSliders();
    renderCatalysts();
    recomputeAndRender(false);
    runSimulation();
    showToast("Reset to defaults");
  }

  /* ---------- Export / Import ---------- */
  function exportModelCode() {
    const asset = currentAsset();
    const cfg = settings();
    const bundle = buildModelCodeBundle({
      asset,
      seed: state.seed,
      values: state.values,
      activeCatalystIds: Array.from(state.catalysts),
      historyDays: cfg.historyDays,
      forecastDays: cfg.forecastDays,
      numPaths: cfg.numPaths,
    });
    downloadTextFile(`${asset.id}-model-${state.seed}.js`, bundle, "application/javascript");
    showToast("Model code downloaded");
  }

  function exportConfig() {
    const snap = buildConfigSnapshot(state);
    downloadTextFile(`${state.assetId}-config-${state.seed}.json`, JSON.stringify(snap, null, 2), "application/json");
    showToast("Config downloaded");
  }

  function importConfig(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== "object") throw new Error("File doesn't look like a valid config.");

        if (data.assetId && ASSETS.some((a) => a.id === data.assetId)) {
          state.assetId = data.assetId;
        }
        if (data.values && typeof data.values === "object") {
          FACTORS.forEach((f) => {
            if (typeof data.values[f.id] === "number") {
              state.values[f.id] = clamp(data.values[f.id], -100, 100);
            }
          });
        }
        if (Array.isArray(data.catalysts)) {
          state.catalysts = new Set(data.catalysts.filter((id) => CATALYSTS.some((c) => c.id === id)));
        }
        if (typeof data.seed === "number") {
          state.seed = data.seed;
        }

        renderTabs();
        renderSliders();
        renderCatalysts();

        const asset = currentAsset();
        els.priceValue.textContent = fmtPrice(asset.startPrice);
        els.assetName.textContent = asset.name + " · scenario model";
        els.assetBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.asset === state.assetId));

        recomputeAndRender(false);
        runSimulation();
        showToast("Config loaded");
      } catch (err) {
        showToast("Couldn't load that file: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  /* ---------- Event bindings ---------- */
  els.runBtn.addEventListener("click", () => {
    els.runBtn.classList.add("is-firing");
    setTimeout(() => els.runBtn.classList.remove("is-firing"), 400);
    runSimulation();
  });
  els.reseedBtn.addEventListener("click", () => {
    state.seed = randomSeed();
    runSimulation();
    showToast("New random draw");
  });
  els.resetBtn.addEventListener("click", resetAll);
  els.exportCodeBtn.addEventListener("click", exportModelCode);
  els.exportConfigBtn.addEventListener("click", exportConfig);
  els.importBtn.addEventListener("click", () => els.importInput.click());
  els.importInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importConfig(file);
    e.target.value = "";
  });
  els.assetBtns.forEach((btn) => {
    btn.addEventListener("click", () => selectAsset(btn.dataset.asset));
  });
  window.addEventListener("resize", () => {
    seismo.draw();
    runSimulation();
  });
  document.addEventListener("mmt:settings-changed", (e) => {
    if (["historyDays", "forecastDays", "numPaths"].includes(e.detail.changedKey)) {
      runSimulation();
    }
  });

  /* ---------- Bridge for other modules (ide.js, livedata.js, chatbot.js) ---------- */
  window.MMT = {
    state,
    currentAsset,
    runSimulation,
    recomputeAndRender,
    setLiveHistory(arr) {
      state.liveHistory = arr;
      runSimulation();
    },
  };

  /* ---------- Init ---------- */
  function init() {
    const cfg = settings();
    if (cfg.defaultAsset && ASSETS.some((a) => a.id === cfg.defaultAsset)) {
      state.assetId = cfg.defaultAsset;
    }
    renderTabs();
    renderSliders();
    renderCatalysts();
    selectAsset(state.assetId);
    document.body.classList.add("app-ready");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
