/* simulate.js
   Monte Carlo forecast: geometric-Brownian-motion paths driven by
   composite drift/volatility, optional one-off catalyst shocks with
   decaying vol spikes, time-varying drift/vol curves (temporal + reflexivity),
   and hooks for contagion / agent modes (orchestrated from main.js).
*/

const DT = 1 / 365;

function activeCatalysts(activeIds) {
  return CATALYSTS.filter((c) => activeIds.has(c.id));
}

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

function simulatePaths({
  startPrice,
  annualDrift,
  annualVol,
  catalysts,
  seed,
  forecastDays = 180,
  numPaths = 300,
  driftCurve = null,
  volCurve = null,
}) {
  const rng = mulberry32(seed);
  const catalystVol = buildVolCurve(forecastDays, catalysts || []);
  const paths = [];

  for (let p = 0; p < numPaths; p++) {
    const path = new Array(forecastDays + 1);
    let price = startPrice;
    path[0] = price;

    for (let d = 1; d <= forecastDays; d++) {
      let dailyDrift = driftCurve ? (driftCurve[d] ?? driftCurve[driftCurve.length - 1] ?? annualDrift) : annualDrift;
      let baseVol = volCurve ? (volCurve[d] ?? volCurve[volCurve.length - 1] ?? annualVol) : annualVol;
      let dailyVol = baseVol * (catalystVol[d - 1] || 1);

      if (d === 1 && catalysts) {
        for (const c of catalysts) {
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

function synthesizeHistory({ startPrice, annualVol, seed, historyDays = 60 }) {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const days = historyDays;
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

function buildForecastBands(paths, forecastDays) {
  const days = forecastDays != null ? forecastDays : (paths[0]?.length - 1 || 180);
  const bands = { p10: [], p25: [], p50: [], p75: [], p90: [] };
  for (let d = 0; d <= days; d++) {
    bands.p10.push(percentileAtDay(paths, d, 10));
    bands.p25.push(percentileAtDay(paths, d, 25));
    bands.p50.push(percentileAtDay(paths, d, 50));
    bands.p75.push(percentileAtDay(paths, d, 75));
    bands.p90.push(percentileAtDay(paths, d, 90));
  }
  return bands;
}
