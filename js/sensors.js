/* sensors.js — Live On-Chain & Macro Sensor Pack
   Optional real-time (or near-real-time) feeds that nudge factor sliders.
   Uses free public endpoints. Falls back to synthetic "nowcast" if offline.
   User stays in control — sensors suggest, never fully override unless asked.
*/

const SENSOR_DEFS = [
  {
    id: "etf_flows_proxy",
    factorId: "etf_flows",
    label: "ETF Flow Proxy",
    desc: "Approx. recent BTC ETF demand via price momentum + volume heuristics",
    weight: 0.6,
  },
  {
    id: "funding_proxy",
    factorId: "leverage",
    label: "Leverage / Funding Proxy",
    desc: "Elevated short-term vol and trend used as leverage crowding proxy",
    weight: 0.5,
  },
  {
    id: "dxy_proxy",
    factorId: "dollar_strength",
    label: "Dollar Strength Proxy",
    desc: "Inverse risk-on signal from crypto vs. broad market correlation",
    weight: 0.4,
  },
  {
    id: "fear_proxy",
    factorId: "fear_greed",
    label: "Fear & Greed Proxy",
    desc: "Derived from recent drawdown depth and recovery speed",
    weight: 0.7,
  },
  {
    id: "netflow_proxy",
    factorId: "exchange_netflow",
    label: "Exchange Pressure Proxy",
    desc: "Sell-side pressure estimate from downside volume concentration",
    weight: 0.5,
  },
];

async function fetchCoinGeckoMarket(assetId) {
  const ids = { btc: "bitcoin", eth: "ethereum", sol: "solana" };
  const coinId = ids[assetId];
  if (!coinId) throw new Error("Unknown asset");
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=30&interval=daily`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  return {
    prices: (data.prices || []).map(([, p]) => p),
    volumes: (data.total_volumes || []).map(([, v]) => v),
  };
}

function computeSensorSuggestions(prices, volumes) {
  if (!prices || prices.length < 5) return {};
  const n = prices.length;
  const ret = (i, j) => (prices[j] - prices[i]) / prices[i];
  const recentRet = ret(n - 8, n - 1);
  const monthRet = ret(0, n - 1);
  const peak = Math.max(...prices);
  const drawdown = (prices[n - 1] - peak) / peak;

  // vol estimate
  const logRets = [];
  for (let i = 1; i < n; i++) logRets.push(Math.log(prices[i] / prices[i - 1]));
  const mean = logRets.reduce((s, x) => s + x, 0) / logRets.length;
  const variance = logRets.reduce((s, x) => s + (x - mean) ** 2, 0) / logRets.length;
  const vol = Math.sqrt(variance * 365);

  const avgVol = volumes.reduce((s, v) => s + v, 0) / volumes.length;
  const recentVol = volumes.slice(-5).reduce((s, v) => s + v, 0) / 5;
  const volRatio = recentVol / Math.max(1, avgVol);

  // downside volume concentration
  let downVol = 0, upVol = 0;
  for (let i = 1; i < n; i++) {
    if (prices[i] < prices[i - 1]) downVol += volumes[i];
    else upVol += volumes[i];
  }
  const sellPressure = (downVol - upVol) / Math.max(1, downVol + upVol);

  return {
    etf_flows: clamp(recentRet * 400 + monthRet * 100, -80, 80),
    leverage: clamp((vol - 0.5) * 80 + (volRatio - 1) * 40, -60, 90),
    dollar_strength: clamp(-recentRet * 200, -70, 70),
    fear_greed: clamp(50 + recentRet * 300 + drawdown * 150, -90, 90),
    exchange_netflow: clamp(sellPressure * 80, -70, 70),
  };
}

(function () {
  let enabled = false;
  let lastSuggestions = {};
  let blend = 0.35; // how hard sensors pull toward suggested values

  function isEnabled() { return enabled; }

  async function refreshSensors() {
    if (!window.MMT) return;
    const assetId = window.MMT.state.assetId;
    const status = document.getElementById("sensors-status");
    try {
      if (status) status.textContent = "Fetching sensor data…";
      const { prices, volumes } = await fetchCoinGeckoMarket(assetId);
      lastSuggestions = computeSensorSuggestions(prices, volumes);
      renderSensorReadout();
      if (status) status.textContent = "Sensors updated " + new Date().toLocaleTimeString();
      if (enabled) applyBlend();
    } catch (err) {
      // synthetic fallback from current model
      lastSuggestions = {
        etf_flows: 5,
        leverage: 15,
        dollar_strength: 0,
        fear_greed: 10,
        exchange_netflow: -5,
      };
      renderSensorReadout();
      if (status) status.textContent = "Using offline proxies (" + (err.message || "no network") + ")";
    }
  }

  function applyBlend() {
    if (!window.MMT || !enabled) return;
    const { state } = window.MMT;
    SENSOR_DEFS.forEach((s) => {
      const suggested = lastSuggestions[s.factorId];
      if (suggested == null) return;
      const current = state.values[s.factorId] ?? 0;
      const next = current * (1 - blend * s.weight) + suggested * (blend * s.weight);
      state.values[s.factorId] = clamp(Math.round(next), -100, 100);
    });
    document.dispatchEvent(new CustomEvent("mmt:sensors-applied"));
    window.MMT.recomputeAndRender?.(false);
    if (window.MMTSettings?.get()?.autoRunOnChange) window.MMT.runSimulation?.();
    // refresh slider UI
    document.dispatchEvent(new CustomEvent("mmt:scenario-loaded", { detail: {} }));
  }

  function renderSensorReadout() {
    const el = document.getElementById("sensors-readout");
    if (!el) return;
    el.innerHTML = SENSOR_DEFS.map((s) => {
      const v = lastSuggestions[s.factorId];
      const sign = v > 0 ? "+" : "";
      return `<div class="sensor-row">
        <span class="sensor-label">${s.label}</span>
        <span class="sensor-val">${v != null ? sign + Math.round(v) : "—"}</span>
      </div>`;
    }).join("");
  }

  function initSensors() {
    const toggle = document.getElementById("sensors-enable");
    const refreshBtn = document.getElementById("sensors-refresh-btn");
    const blendSlider = document.getElementById("sensors-blend");
    const blendVal = document.getElementById("sensors-blend-val");
    const syncBtn = document.getElementById("sensors-sync-btn");

    toggle?.addEventListener("change", () => {
      enabled = toggle.checked;
      showToast(enabled ? "Sensors nudging factors" : "Sensors idle");
      if (enabled) applyBlend();
    });
    refreshBtn?.addEventListener("click", refreshSensors);
    syncBtn?.addEventListener("click", () => {
      // hard sync: set factors to suggestions fully
      if (!window.MMT) return;
      Object.entries(lastSuggestions).forEach(([k, v]) => {
        window.MMT.state.values[k] = clamp(Math.round(v), -100, 100);
      });
      document.dispatchEvent(new CustomEvent("mmt:scenario-loaded", { detail: {} }));
      window.MMT.recomputeAndRender?.(false);
      window.MMT.runSimulation?.();
      showToast("Synced factors to sensor readings");
    });
    blendSlider?.addEventListener("input", () => {
      blend = Number(blendSlider.value) / 100;
      if (blendVal) blendVal.textContent = Math.round(blend * 100) + "%";
    });

    // auto-refresh once on load if live data is generally allowed
    setTimeout(refreshSensors, 800);
  }

  window.MMTSensors = {
    isEnabled,
    refreshSensors,
    applyBlend,
    getSuggestions: () => lastSuggestions,
    SENSOR_DEFS,
  };

  document.addEventListener("DOMContentLoaded", initSensors);
})();
