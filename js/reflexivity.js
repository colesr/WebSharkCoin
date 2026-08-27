/* reflexivity.js — Reflexivity & Narrative Feedback Loop
   Price paths feed back into sentiment factors (social_buzz, fear_greed).
   When the median path runs hot, greed and buzz rise; when it crashes, fear spikes.
   Strength is user-tunable.
*/

const REFLEXIVE_FACTORS = ["social_buzz", "fear_greed", "news_tone"];

function applyReflexivity(baseValues, pricePath, strength, forecastDays) {
  // strength 0..1. Looks at rolling return of the median (or a single path)
  // and nudges sentiment factors.
  if (strength <= 0 || !pricePath || pricePath.length < 2) {
    return { valuesSeries: null, adjustedDrift: null, adjustedVol: null };
  }

  const valuesSeries = [];
  let runningValues = { ...baseValues };

  for (let d = 0; d <= forecastDays; d++) {
    if (d > 0 && d % 5 === 0) {
      // every 5 days, look at recent return
      const lookback = Math.min(d, 15);
      const p0 = pricePath[d - lookback];
      const p1 = pricePath[d];
      const ret = (p1 - p0) / Math.max(0.01, p0); // cumulative return over lookback

      // map return to sentiment nudge
      // strong up → greed + buzz up; strong down → fear (fear_greed down) + news_tone down
      const greedNudge = clamp(ret * 200 * strength, -40, 40);
      const buzzNudge = clamp(ret * 150 * strength, -30, 30);
      const newsNudge = clamp(ret * 100 * strength, -25, 25);

      runningValues = {
        ...runningValues,
        fear_greed: clamp((runningValues.fear_greed ?? 0) + greedNudge * 0.3, -100, 100),
        social_buzz: clamp((runningValues.social_buzz ?? 0) + buzzNudge * 0.3, -100, 100),
        news_tone: clamp((runningValues.news_tone ?? 0) + newsNudge * 0.25, -100, 100),
      };
    }
    valuesSeries.push({ ...runningValues });
  }
  return { valuesSeries };
}

/**
 * Re-run composite scoring day-by-day with reflexive values,
 * producing time-varying drift/vol that incorporates feedback.
 */
function reflexiveDriftVolCurve(baseValues, medianPath, strength, baseAnnualVol, forecastDays) {
  const { valuesSeries } = applyReflexivity(baseValues, medianPath, strength, forecastDays);
  if (!valuesSeries) {
    // fallback static
    const { annualDrift, annualVol } = computeComposite(baseValues, baseAnnualVol);
    return {
      drift: new Array(forecastDays + 1).fill(annualDrift),
      vol: new Array(forecastDays + 1).fill(annualVol),
    };
  }
  const drift = [];
  const vol = [];
  for (let d = 0; d <= forecastDays; d++) {
    const { annualDrift, annualVol } = computeComposite(valuesSeries[d], baseAnnualVol);
    drift.push(annualDrift);
    vol.push(annualVol);
  }
  return { drift, vol };
}

/**
 * Two-pass simulation for reflexivity:
 * 1) Run with static factors → get median path
 * 2) Build reflexive drift/vol curve from that median
 * 3) Re-simulate with the time-varying curve
 */
function simulateWithReflexivity({
  startPrice,
  baseValues,
  baseAnnualVol,
  catalysts,
  seed,
  forecastDays,
  numPaths,
  strength,
}) {
  // Pass 1: static
  const { annualDrift, annualVol } = computeComposite(baseValues, baseAnnualVol);
  const pass1 = simulatePaths({
    startPrice,
    annualDrift,
    annualVol,
    catalysts,
    seed,
    forecastDays,
    numPaths: Math.min(80, numPaths), // cheaper first pass
  });
  const bands1 = buildForecastBands(pass1, forecastDays);
  const median = bands1.p50;

  // Build reflexive curve
  const curve = reflexiveDriftVolCurve(baseValues, median, strength, baseAnnualVol, forecastDays);

  // Pass 2: path-dependent drift/vol
  return simulatePathsTimeVarying({
    startPrice,
    driftCurve: curve.drift,
    volCurve: curve.vol,
    catalysts,
    seed: seed ^ 0x51f5e83, // different stream
    forecastDays,
    numPaths,
  });
}

function simulatePathsTimeVarying({
  startPrice,
  driftCurve,
  volCurve,
  catalysts,
  seed,
  forecastDays,
  numPaths,
}) {
  const rng = mulberry32(seed);
  const catalystVol = buildVolCurve(forecastDays, catalysts);
  const paths = [];

  for (let p = 0; p < numPaths; p++) {
    const path = new Array(forecastDays + 1);
    let price = startPrice;
    path[0] = price;

    for (let d = 1; d <= forecastDays; d++) {
      let dailyDrift = driftCurve[d] ?? driftCurve[driftCurve.length - 1] ?? 0;
      let dailyVol = (volCurve[d] ?? volCurve[volCurve.length - 1] ?? 0.5) * (catalystVol[d - 1] || 1);

      if (d === 1) {
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

(function () {
  let strength = 0; // 0 = off, 1 = full

  function getStrength() { return strength; }
  function setStrength(v) {
    strength = clamp(v, 0, 1);
    document.dispatchEvent(new CustomEvent("mmt:reflexivity-changed", { detail: { strength } }));
  }

  function initReflexivity() {
    const slider = document.getElementById("reflexivity-strength");
    const label = document.getElementById("reflexivity-strength-val");
    if (!slider) return;
    slider.addEventListener("input", () => {
      setStrength(Number(slider.value) / 100);
      if (label) label.textContent = Math.round(strength * 100) + "%";
      if (window.MMTSettings?.get()?.autoRunOnChange) window.MMT?.runSimulation?.();
    });
  }

  window.MMTReflexivity = {
    getStrength,
    setStrength,
    simulateWithReflexivity,
    simulatePathsTimeVarying,
    applyReflexivity,
  };

  document.addEventListener("DOMContentLoaded", initReflexivity);
})();
