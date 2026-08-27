/* main.js — wires factor data + engine + simulator to the DOM */

(function () {
  const state = {
    assetId: "btc",
    activeCategory: FACTOR_CATEGORIES[0].id,
    values: {},
    catalysts: new Set(),
    seed: randomSeed(),
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
    assetBtns: Array.from(document.querySelectorAll(".asset-btn")),
  };

  const seismo = new Seismograph(els.seismographCanvas);

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
    factors.forEach((f) => {
      const item = document.createElement("div");
      item.className = "slider-item";

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
        recomputeAndRender(true);
      });

      item.appendChild(head);
      item.appendChild(desc);
      item.appendChild(input);
      item.appendChild(endLabels);
      els.slidersContainer.appendChild(item);
    });
  }

  function fmtSigned(v) {
    const n = Math.round(v);
    return (n > 0 ? "+" : "") + n;
  }

  /* ---------- Catalysts ---------- */
  function renderCatalysts() {
    els.catalystGrid.innerHTML = "";
    CATALYSTS.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "catalyst-btn" + (state.catalysts.has(c.id) ? " is-active" : "");
      btn.dataset.group = c.group;

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
        if (state.catalysts.has(c.id)) state.catalysts.delete(c.id);
        else state.catalysts.add(c.id);
        renderCatalysts();
      });

      els.catalystGrid.appendChild(btn);
    });
  }

  /* ---------- Breakdown ---------- */
  function renderBreakdown(contributions) {
    els.breakdownList.innerHTML = "";
    const top = contributions.slice(0, 7);
    const maxAbs = Math.max(0.001, ...top.map((c) => Math.abs(c.driftContrib)));
    top.forEach((c) => {
      const row = document.createElement("div");
      row.className = "breakdown-row";

      const label = document.createElement("span");
      label.className = "breakdown-label";
      label.textContent = c.label;

      const track = document.createElement("div");
      track.className = "breakdown-track";
      const fill = document.createElement("div");
      const pct = (Math.abs(c.driftContrib) / maxAbs) * 50; // half-track max
      fill.className = "breakdown-fill " + (c.driftContrib >= 0 ? "pos" : "neg");
      fill.style.width = pct + "%";
      track.appendChild(fill);

      const pctLabel = document.createElement("span");
      pctLabel.className = "breakdown-pct";
      pctLabel.textContent = (c.driftContrib >= 0 ? "+" : "") + (c.driftContrib * 100).toFixed(1) + "%";

      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(pctLabel);
      els.breakdownList.appendChild(row);
    });
  }

  /* ---------- Compute + live readouts ---------- */
  function recomputeAndRender(pulse) {
    const asset = currentAsset();
    const { annualDrift, annualVol, contributions } = computeComposite(state.values, asset.baseAnnualVol);

    els.driftValue.textContent = (annualDrift >= 0 ? "+" : "") + (annualDrift * 100).toFixed(1) + "%";
    els.volValue.textContent = (annualVol * 100).toFixed(1) + "%";

    const tone = driftLabel(annualDrift);
    els.toneValue.textContent = tone.text;
    els.toneValue.className = "metric-value tone-tag " + tone.cls;

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

    const history = synthesizeHistory({
      startPrice: asset.startPrice,
      annualVol,
      seed: state.seed,
    });

    const paths = simulatePaths({
      startPrice: asset.startPrice,
      annualDrift,
      annualVol,
      catalysts,
      seed: state.seed,
    });

    const bands = buildForecastBands(paths);

    drawForecastChart(els.forecastCanvas, {
      history,
      bands,
      historyDays: TRADING_DAYS_HISTORY,
      forecastDays: FORECAST_DAYS,
    });

    els.seedReadout.textContent = "seed: " + state.seed;
  }

  /* ---------- Asset selection ---------- */
  function selectAsset(id) {
    state.assetId = id;
    const asset = currentAsset();
    els.priceValue.textContent = fmtPrice(asset.startPrice);
    els.assetName.textContent = asset.name + " · illustrative";
    els.assetBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.asset === id));
    recomputeAndRender(false);
    runSimulation();
  }

  /* ---------- Reset ---------- */
  function resetAll() {
    FACTORS.forEach((f) => (state.values[f.id] = f.default));
    state.catalysts.clear();
    renderSliders();
    renderCatalysts();
    recomputeAndRender(false);
    runSimulation();
  }

  /* ---------- Event bindings ---------- */
  els.runBtn.addEventListener("click", runSimulation);
  els.reseedBtn.addEventListener("click", () => {
    state.seed = randomSeed();
    runSimulation();
  });
  els.resetBtn.addEventListener("click", resetAll);
  els.assetBtns.forEach((btn) => {
    btn.addEventListener("click", () => selectAsset(btn.dataset.asset));
  });
  window.addEventListener("resize", () => {
    seismo.draw();
    runSimulation();
  });

  /* ---------- Init ---------- */
  function init() {
    renderTabs();
    renderSliders();
    renderCatalysts();
    selectAsset("btc");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
