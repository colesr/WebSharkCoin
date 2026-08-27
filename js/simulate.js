/* simulate.js
   Monte Carlo forecast: many geometric-Brownian-motion price paths driven by
   the composite drift/volatility, plus optional one-off catalyst shocks with
   a decaying volatility spike. We also synthesize a short "recent history"
   lead-in using the same engine so the chart has context, clearly separated
   from the forecast region.

   This produces an internally consistent, adjustable simulation of how the
   selected factors could play out — it is illustrative scenario modeling,
   not a real prediction of actual future prices.
*/

const TRADING_DAYS_HISTORY = 60;
const FORECAST_DAYS = 180;
const NUM_PATHS = 300;
const DT = 1 / 365;

function activeCatalysts(activeIds) {
  return CATALYSTS.filter((c) => activeIds.has(c.id));
}

/* Builds a per-day volatility multiplier curve from active catalysts,
   each contributing an exponential-decay bump starting at day 0 of the
   forecast window. */
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
      let dailyDrift = annualDrift;
      let dailyVol = annualVol * volCurve[d - 1];

      // Apply catalyst jump shocks once, right at day 1 of the forecast.
      if (d === 1) {
        for (const c of catalysts) {
          // small per-path randomness around the nominal shock size
          const noise = 1 + gaussian(rng) * 0.15;
          price *= 1 + c.shock * noise;
        }
      }

      const z = gaussian(rng);
      const stepDrift = (dailyDrift - 0.5 * dailyVol * dailyVol) * DT;
      const stepShock = dailyVol * Math.sqrt(DT) * z;
      price = Math.max(0.01, price * Math.exp(stepDrift + stepShock));
      path[d] = price;
    }
    paths.push(path);
  }
  return paths;
}

/* Synthesize a plausible recent-history lead-in using a gentler version of
   the same engine so the forecast doesn't start from a perfectly flat line.
   Uses a separate, fixed seed offset so it doesn't consume the forecast RNG. */
function synthesizeHistory({ startPrice, annualVol, seed }) {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const days = TRADING_DAYS_HISTORY;
  const prices = new Array(days + 1);
  let price = startPrice;
  // walk backwards from "today" so the series ends exactly at startPrice
  const forward = new Array(days + 1);
  forward[days] = startPrice;
  for (let d = days - 1; d >= 0; d--) {
    const z = gaussian(rng);
    const vol = annualVol * 0.8;
    const stepDrift = -0.02 * DT; // mild neutral historical drift
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
