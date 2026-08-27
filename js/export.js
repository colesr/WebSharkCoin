/* export.js
   Turns the current slider/catalyst/seed state into downloadable artifacts:
     1. A standalone, self-contained .js file that reproduces the exact
        composite score and Monte Carlo forecast — runnable in Node or a
        browser <script> tag, with no dependency on this app.
     2. A small re-importable .json config snapshot for saving/loading
        settings inside the app itself.
*/

function downloadTextFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime || "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* Inlined copy of the engine + rng + simulate logic, as source text, so the
   exported file has zero dependency on this app or a bundler. Kept in sync
   by hand with js/engine.js, js/rng.js, js/simulate.js. */
const MODEL_RUNTIME_SRC = `
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

const MAX_DRIFT_SUM = FACTORS.reduce((s, f) => s + Math.abs(f.driftWeight), 0);
const MAX_VOL_SUM = FACTORS.reduce((s, f) => s + Math.abs(f.volWeight), 0);
const BASE_DRIFT_SCALE = 0.65;
const VOL_SWING_SCALE = 0.9;
const MIN_VOL = 0.12;
const MAX_VOL_CAP = 3.0;

function computeComposite(values, baseAnnualVol) {
  let driftRaw = 0, volRaw = 0;
  const contributions = [];
  for (const f of FACTORS) {
    const raw = values[f.id] ?? f.default ?? 0;
    const v = raw / 100;
    const driftContrib = v * f.driftWeight;
    const volContrib = f.volWeight >= 0 ? Math.abs(v) * f.volWeight : v * f.volWeight;
    driftRaw += driftContrib;
    volRaw += volContrib;
    contributions.push({ id: f.id, label: f.label, category: f.category, rawValue: raw, driftContrib });
  }
  contributions.sort((a, b) => Math.abs(b.driftContrib) - Math.abs(a.driftContrib));
  const annualDrift = clamp(driftRaw / MAX_DRIFT_SUM, -1, 1) * BASE_DRIFT_SCALE;
  const volAdjust = clamp(volRaw / MAX_VOL_SUM, -1, 1) * VOL_SWING_SCALE;
  const annualVol = clamp(baseAnnualVol + volAdjust, MIN_VOL, MAX_VOL_CAP);
  return { annualDrift, annualVol, contributions };
}

const TRADING_DAYS_HISTORY = 60;
const FORECAST_DAYS = 180;
const NUM_PATHS = 300;
const DT = 1 / 365;

function buildVolCurve(days, catalysts) {
  const curve = new Array(days).fill(1);
  for (const c of catalysts) {
    for (let d = 0; d < days; d++) {
      const decay = Math.exp(-d / Math.max(1, c.decayDays / 3));
      curve[d] += c.volSpike * decay;
    }
  }
  return curve;
}

function simulatePaths({ startPrice, annualDrift, annualVol, catalysts, seed }) {
  const rng = mulberry32(seed);
  const volCurve = buildVolCurve(FORECAST_DAYS, catalysts);
  const paths = [];
  for (let p = 0; p < NUM_PATHS; p++) {
    const path = new Array(FORECAST_DAYS + 1);
    let price = startPrice;
    path[0] = price;
    for (let d = 1; d <= FORECAST_DAYS; d++) {
      let dailyVol = annualVol * volCurve[d - 1];
      if (d === 1) {
        for (const c of catalysts) {
          const noise = 1 + gaussian(rng) * 0.15;
          price *= 1 + c.shock * noise;
        }
      }
      const z = gaussian(rng);
      const stepDrift = (annualDrift - 0.5 * dailyVol * dailyVol) * DT;
      const stepShock = dailyVol * Math.sqrt(DT) * z;
      price = Math.max(0.01, price * Math.exp(stepDrift + stepShock));
      path[d] = price;
    }
    paths.push(path);
  }
  return paths;
}

function synthesizeHistory({ startPrice, annualVol, seed }) {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const days = TRADING_DAYS_HISTORY;
  const forward = new Array(days + 1);
  forward[days] = startPrice;
  for (let d = days - 1; d >= 0; d--) {
    const z = gaussian(rng);
    const vol = annualVol * 0.8;
    const stepDrift = -0.02 * DT;
    const stepShock = vol * Math.sqrt(DT) * z;
    forward[d] = Math.max(0.01, forward[d + 1] / Math.exp(stepDrift + stepShock));
  }
  return forward;
}

function percentileAtDay(paths, day, pct) {
  const vals = paths.map((p) => p[day]).sort((a, b) => a - b);
  const idx = clamp(Math.round((pct / 100) * (vals.length - 1)), 0, vals.length - 1);
  return vals[idx];
}

function buildForecastBands(paths) {
  const bands = { p10: [], p25: [], p50: [], p75: [], p90: [] };
  for (let d = 0; d <= FORECAST_DAYS; d++) {
    bands.p10.push(percentileAtDay(paths, d, 10));
    bands.p25.push(percentileAtDay(paths, d, 25));
    bands.p50.push(percentileAtDay(paths, d, 50));
    bands.p75.push(percentileAtDay(paths, d, 75));
    bands.p90.push(percentileAtDay(paths, d, 90));
  }
  return bands;
}
`.trim();

function buildModelCodeBundle({ asset, seed, values, activeCatalystIds }) {
  const header = `/*
 * Market Mechanics Terminal — exported model snapshot
 * Asset:      ${asset.name} (${asset.id.toUpperCase()})
 * Generated:  ${new Date().toISOString()}
 * Seed:       ${seed}
 *
 * Self-contained. No dependency on the web app. Run it with:
 *   node ${asset.id}-model-${seed}.js
 * or drop it into a browser <script> tag.
 *
 * It reproduces the exact composite drift/volatility score and the
 * 300-path Monte Carlo forecast the app showed for these slider settings.
 * This is illustrative scenario modeling with a transparent, hand-picked
 * weighting model — not real market data, a fitted statistical model,
 * or financial advice.
 */
"use strict";
`;

  const dataBlock = `
/* ---------- Snapshot: your exact slider + catalyst settings ---------- */
const ASSET = ${JSON.stringify(asset, null, 2)};
const SEED = ${seed};
const FACTOR_VALUES = ${JSON.stringify(values, null, 2)};
const ACTIVE_CATALYST_IDS = ${JSON.stringify(activeCatalystIds)};

/* ---------- Model definition (every factor's weights, every catalyst) ---------- */
const FACTORS = ${JSON.stringify(FACTORS, null, 2)};
const CATALYSTS = ${JSON.stringify(CATALYSTS, null, 2)};
`;

  const runner = `
/* ---------- Run it ---------- */
const activeCatalysts = CATALYSTS.filter((c) => ACTIVE_CATALYST_IDS.includes(c.id));
const { annualDrift, annualVol, contributions } = computeComposite(FACTOR_VALUES, ASSET.baseAnnualVol);
const history = synthesizeHistory({ startPrice: ASSET.startPrice, annualVol, seed: SEED });
const paths = simulatePaths({ startPrice: ASSET.startPrice, annualDrift, annualVol, catalysts: activeCatalysts, seed: SEED });
const bands = buildForecastBands(paths);

if (typeof console !== "undefined") {
  console.log("=== " + ASSET.name + " (" + ASSET.id.toUpperCase() + ") model snapshot ===");
  console.log("Composite drift (annualized):    " + (annualDrift * 100).toFixed(2) + "%");
  console.log("Composite volatility (annualized): " + (annualVol * 100).toFixed(2) + "%");
  console.log("Active catalysts: " + (activeCatalysts.map((c) => c.label).join(", ") || "none"));
  console.log("");
  console.log("Top contributing factors:");
  contributions.slice(0, 6).forEach((c) => {
    const sign = c.driftContrib >= 0 ? "+" : "";
    console.log("  " + c.label + ": " + sign + (c.driftContrib * 100).toFixed(2) + "%");
  });
  console.log("");
  console.log("Forecast (" + FORECAST_DAYS + " days out):");
  console.log("  Median price:   $" + bands.p50[bands.p50.length - 1].toFixed(2));
  console.log("  10-90% range:   $" + bands.p10[bands.p10.length - 1].toFixed(2) + " to $" + bands.p90[bands.p90.length - 1].toFixed(2));
}

/* ---------- Reuse in another script / Node module ---------- */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ASSET, SEED, FACTOR_VALUES, ACTIVE_CATALYST_IDS, FACTORS, CATALYSTS,
    computeComposite, simulatePaths, buildForecastBands, synthesizeHistory,
  };
}
`;

  return header + dataBlock + "\n/* ---------- Runtime engine (composite scoring + Monte Carlo GBM) ---------- */\n" +
    MODEL_RUNTIME_SRC + "\n" + runner;
}

function buildConfigSnapshot(state) {
  return {
    schema: "market-mechanics-terminal-config-v1",
    generatedAt: new Date().toISOString(),
    assetId: state.assetId,
    seed: state.seed,
    values: state.values,
    catalysts: Array.from(state.catalysts),
  };
}
