/* livedata.js
   Pulls free, public market data from CoinGecko's API (no key required for
   these endpoints) so the modeled forecast can be visually compared against
   what the real market actually did / is doing. Runs entirely client-side —
   no server, no API key, no cost. Requires the browser to have internet
   access (this app itself can still run fully offline; only this feature
   needs a connection).
*/

const COINGECKO_IDS = { btc: "bitcoin", eth: "ethereum", sol: "solana" };
const LIVE_CACHE_MS = 60 * 1000;
const liveCache = new Map(); // assetId -> { fetchedAt, currentPrice, history }

async function fetchLivePriceData(assetId, historyDays) {
  const cacheKey = assetId + ":" + historyDays;
  const cached = liveCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < LIVE_CACHE_MS) return cached;

  const coinId = COINGECKO_IDS[assetId];
  if (!coinId) throw new Error("No live data mapping for asset " + assetId);

  const chartUrl = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${historyDays}&interval=daily`;
  const res = await fetch(chartUrl);
  if (!res.ok) {
    if (res.status === 429) throw new Error("Rate limited by CoinGecko — try again in a minute.");
    throw new Error("Live data request failed (HTTP " + res.status + ")");
  }
  const data = await res.json();
  const prices = (data.prices || []).map(([, price]) => price);
  if (prices.length < 2) throw new Error("Live data response was empty.");

  const result = {
    fetchedAt: Date.now(),
    currentPrice: prices[prices.length - 1],
    history: prices,
  };
  liveCache.set(cacheKey, result);
  return result;
}

(function () {
  let els = {};

  function setStatus(text, cls) {
    els.status.textContent = text;
    els.status.className = "live-status" + (cls ? " live-status-" + cls : "");
  }

  async function refresh() {
    if (!window.MMT) return;
    const { state, currentAsset } = window.MMT;
    const asset = currentAsset();
    if (!COINGECKO_IDS[asset.id]) {
      setStatus("No live feed mapped for " + asset.label, "error");
      window.MMT.setLiveHistory(null);
      return;
    }

    setStatus("Fetching live data…", "loading");
    els.toggleBtn.classList.add("is-loading");
    try {
      const settings = window.MMTSettings.get();
      const data = await fetchLivePriceData(asset.id, settings.historyDays);
      // Align to exactly historyDays+1 points by resampling/truncating.
      const target = settings.historyDays + 1;
      const aligned = resampleToLength(data.history, target);
      window.MMT.setLiveHistory(aligned);
      setStatus(
        `Live ${asset.label}: ${fmtPrice(data.currentPrice)} · updated ${new Date(data.fetchedAt).toLocaleTimeString()}`,
        "ok"
      );
      document.getElementById("legend-live").classList.remove("is-hidden");
    } catch (err) {
      setStatus(err.message || "Couldn't fetch live data", "error");
      window.MMT.setLiveHistory(null);
    } finally {
      els.toggleBtn.classList.remove("is-loading");
    }
  }

  function resampleToLength(arr, targetLen) {
    if (arr.length === targetLen) return arr;
    const out = new Array(targetLen);
    for (let i = 0; i < targetLen; i++) {
      const srcIdx = Math.min(arr.length - 1, Math.round((i / (targetLen - 1)) * (arr.length - 1)));
      out[i] = arr[srcIdx];
    }
    return out;
  }

  function stop() {
    if (window.MMT) window.MMT.setLiveHistory(null);
    document.getElementById("legend-live").classList.add("is-hidden");
    setStatus("Live comparison off", "");
    els.toggleBtn.classList.remove("is-active");
  }

  function initLiveData() {
    els = {
      toggleBtn: document.getElementById("live-compare-btn"),
      status: document.getElementById("live-status"),
    };
    if (!els.toggleBtn) return;

    let active = false;
    els.toggleBtn.addEventListener("click", () => {
      active = !active;
      els.toggleBtn.classList.toggle("is-active", active);
      if (active) refresh();
      else stop();
    });

    document.addEventListener("mmt:settings-changed", (e) => {
      if (active && (e.detail.changedKey === "historyDays")) refresh();
    });
    document.addEventListener("mmt:asset-changed", () => { if (active) refresh(); });
    document.addEventListener("mmt:simulation-run", () => { /* no-op: live overlay persists across re-runs */ });
  }

  document.addEventListener("DOMContentLoaded", initLiveData);
})();
