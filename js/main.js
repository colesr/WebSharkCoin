/* main.js — wires factor data + engine + simulator to the DOM, plus UI features */

(function () {
  const state = {
    assetId: "btc",
    activeCategory: FACTOR_CATEGORIES[0].id,
    values: {},
    catalysts: new Set(),
    seed: randomSeed(),
    autoSync: false,
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
    exportCodeBtn: document.getElementById("export-code-btn"),
    exportConfigBtn: document.getElementById("export-config-btn"),
    importBtn: document.getElementById("import-btn"),
    importInput: document.getElementById("import-input"),
    settingsBtn: document.getElementById("settings-btn"),
    settingsPanel: document.getElementById("settings-panel"),
    settingsClose: document.getElementById("settings-close"),
    themeSelect: document.getElementById("theme-select"),
    animationsToggle: document.getElementById("animations-toggle"),
    autoSyncToggle: document.getElementById("auto-sync-toggle"),
    extraCatalystsToggle: document.getElementById("extra-catalysts-toggle"),
    openIdeBtn: document.getElementById("open-ide-btn"),
    idePanel: document.getElementById("ide-panel"),
    ideClose: document.getElementById("ide-close"),
    ideEditor: document.getElementById("ide-editor"),
    ideRun: document.getElementById("ide-run"),
    ideConsole: document.getElementById("ide-console"),
    coinAiBtn: document.getElementById("coinai-btn"),
    chatbotPanel: document.getElementById("chatbot-panel"),
    chatbotClose: document.getElementById("chatbot-close"),
    syncLiveBtn: document.getElementById("sync-live-btn"),
    liveBadge: document.getElementById("live-badge"),
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
    const catalysts = CATALYSTS.slice();
    if (!state.extraCatalystsEnabled) {
      // optionally filter some if extra disabled (backwards compatible)
    }
    catalysts.forEach((c) => {
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
    els.assetName.textContent = asset.name;
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

  /* ---------- Export / Import ---------- */
  function exportModelCode() {
    const asset = currentAsset();
    const bundle = buildModelCodeBundle({
      asset,
      seed: state.seed,
      values: state.values,
      activeCatalystIds: Array.from(state.catalysts),
    });
    downloadTextFile(
      `${asset.id}-model-${state.seed}.js`,
      bundle,
      "application/javascript"
    );
  }

  function exportConfig() {
    const snap = buildConfigSnapshot(state);
    downloadTextFile(
      `${state.assetId}-config-${state.seed}.json`,
      JSON.stringify(snap, null, 2),
      "application/json"
    );
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
        els.assetName.textContent = asset.name;
        els.assetBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.asset === state.assetId));

        recomputeAndRender(false);
        runSimulation();
      } catch (err) {
        alert("Couldn't load that config file: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  /* ---------- Live price sync ---------- */
  async function syncLivePrice() {
    try {
      const asset = currentAsset();
      const price = await fetchCurrentPrice(asset.id);
      if (price) {
        els.priceValue.textContent = fmtPrice(price);
        els.liveBadge.style.display = 'inline-block';
      }
    } catch (err) {
      console.warn('live price sync failed', err);
    }
  }

  /* ---------- Event bindings ---------- */
  els.runBtn.addEventListener("click", runSimulation);
  els.reseedBtn.addEventListener("click", () => {
    state.seed = randomSeed();
    runSimulation();
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

  // settings panel
  els.settingsBtn.addEventListener('click', () => openSettings());
  els.settingsClose.addEventListener('click', () => closeSettings());
  els.themeSelect.addEventListener('change', (e) => setTheme(e.target.value));
  els.animationsToggle.addEventListener('change', (e) => setAnimationsEnabled(e.target.checked));
  els.autoSyncToggle.addEventListener('change', (e) => { state.autoSync = e.target.checked; localStorage.setItem('wsc:autoSync', e.target.checked ? '1' : '0'); });
  els.extraCatalystsToggle.addEventListener('change', (e) => { state.extraCatalystsEnabled = e.target.checked; });
  els.openIdeBtn.addEventListener('click', openIDE);

  // IDE
  els.ideClose.addEventListener('click', closeIDE);
  els.ideRun.addEventListener('click', runIDE);

  // chatbot
  els.coinAiBtn.addEventListener('click', () => openChatbot());
  els.chatbotClose.addEventListener('click', () => closeChatbot());

  // live sync
  els.syncLiveBtn.addEventListener('click', syncLivePrice);

  /* ---------- Settings behavior ---------- */
  function openSettings() {
    els.settingsPanel.setAttribute('aria-hidden', 'false');
    els.settingsPanel.style.right = '18px';
  }
  function closeSettings() {
    els.settingsPanel.setAttribute('aria-hidden', 'true');
    els.settingsPanel.style.right = '-420px';
  }
  function setTheme(t) {
    if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('wsc:theme', t);
  }
  function setAnimationsEnabled(enabled) {
    localStorage.setItem('wsc:animations', enabled ? '1' : '0');
    document.body.classList.toggle('no-anim', !enabled);
  }

  /* ---------- IDE behavior ---------- */
  function openIDE() {
    els.idePanel.setAttribute('aria-hidden', 'false');
    els.idePanel.style.right = '18px';
    // load saved
    const saved = localStorage.getItem('wsc:ide:code');
    if (saved) els.ideEditor.value = saved;
  }
  function closeIDE() {
    els.idePanel.setAttribute('aria-hidden', 'true');
    els.idePanel.style.right = '-420px';
  }
  function runIDE() {
    const code = els.ideEditor.value;
    localStorage.setItem('wsc:ide:code', code);
    els.ideConsole.textContent = '';
    try {
      // sandboxed run: use Function to avoid access to outer scope
      const result = new Function('FACTORS, CATALYSTS, ASSETS, state', code)(FACTORS, CATALYSTS, ASSETS, state);
      els.ideConsole.textContent = 'Result: ' + JSON.stringify(result);
    } catch (err) {
      els.ideConsole.textContent = 'Error: ' + err.message;
    }
  }

  /* ---------- Chatbot integration (delegates to ai-chatbot.js) ---------- */
  function openChatbot() {
    // delegate to CoinAI module if available
    if (window.CoinAI && typeof window.CoinAI.open === 'function') {
      window.CoinAI.open();
      els.chatbotPanel.setAttribute('aria-hidden', 'false');
      els.chatbotPanel.style.right = '18px';
    } else {
      // fallback: reveal panel so user can see setup UI
      els.chatbotPanel.setAttribute('aria-hidden', 'false');
      els.chatbotPanel.style.right = '18px';
    }
  }
  function closeChatbot() {
    els.chatbotPanel.setAttribute('aria-hidden', 'true');
    els.chatbotPanel.style.right = '-420px';
  }

  /* ---------- Init ---------- */
  function init() {
    renderTabs();
    renderSliders();
    renderCatalysts();
    selectAsset('btc');

    // restore settings
    const theme = localStorage.getItem('wsc:theme') || 'dark';
    els.themeSelect.value = theme;
    setTheme(theme);
    const anim = localStorage.getItem('wsc:animations');
    els.animationsToggle.checked = anim !== '0';
    setAnimationsEnabled(anim !== '0');
    els.autoSyncToggle.checked = localStorage.getItem('wsc:autoSync') === '1';

    // register CoinAI if present
    if (window.CoinAI && window.CoinAI.attachOpen) window.CoinAI.attachOpen(document);

    // optionally auto-sync
    if (els.autoSyncToggle.checked) {
      syncLivePrice();
      setInterval(() => { if (els.autoSyncToggle.checked) syncLivePrice(); }, 60000);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
