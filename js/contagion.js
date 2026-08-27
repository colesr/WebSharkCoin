/* contagion.js — Cross-Asset Contagion Engine
   Multi-asset Monte Carlo with a tunable correlation / lag matrix.
   Shocking one asset bleeds into the others with configurable strength and delay.
*/

const CONTAGION_MATRIX = {
  // row = source shock, col = target response strength (-1..1)
  // order: btc, eth, sol
  btc: { btc: 1.0, eth: 0.72, sol: 0.55 },
  eth: { btc: 0.65, eth: 1.0, sol: 0.68 },
  sol: { btc: 0.48, eth: 0.62, sol: 1.0 },
};

const CONTAGION_LAG = {
  // days of lag before contagion fully transmits
  btc: { eth: 1, sol: 2 },
  eth: { btc: 1, sol: 1 },
  sol: { btc: 2, eth: 1 },
};

function getCorrelation(sourceId, targetId) {
  return CONTAGION_MATRIX[sourceId]?.[targetId] ?? 0;
}

function getLag(sourceId, targetId) {
  return CONTAGION_LAG[sourceId]?.[targetId] ?? 0;
}

/**
 * Simulate multiple assets jointly.
 * Returns { [assetId]: paths[] } where each paths is array of price series.
 */
function simulateContagionPaths({
  assets,           // [{ id, startPrice, annualDrift, annualVol }]
  catalystsByAsset, // { assetId: catalyst[] }
  seed,
  forecastDays,
  numPaths,
  matrix = CONTAGION_MATRIX,
}) {
  const rng = mulberry32(seed);
  const n = assets.length;
  const result = {};
  assets.forEach((a) => { result[a.id] = []; });

  // Precompute vol curves per asset
  const volCurves = {};
  assets.forEach((a) => {
    const cats = catalystsByAsset[a.id] || [];
    volCurves[a.id] = buildVolCurve(forecastDays, cats);
  });

  for (let p = 0; p < numPaths; p++) {
    const prices = {};
    const series = {};
    assets.forEach((a) => {
      prices[a.id] = a.startPrice;
      series[a.id] = new Array(forecastDays + 1);
      series[a.id][0] = a.startPrice;
    });

    // residual shocks buffer for lagged contagion: residual[src][tgt][day]
    const residuals = {};
    assets.forEach((src) => {
      residuals[src.id] = {};
      assets.forEach((tgt) => {
        if (src.id !== tgt.id) residuals[src.id][tgt.id] = new Array(forecastDays + 1).fill(0);
      });
    });

    for (let d = 1; d <= forecastDays; d++) {
      // Independent Gaussian draws
      const z = {};
      assets.forEach((a) => { z[a.id] = gaussian(rng); });

      // Apply day-1 catalyst shocks
      if (d === 1) {
        assets.forEach((a) => {
          const cats = catalystsByAsset[a.id] || [];
          cats.forEach((c) => {
            const noise = 1 + gaussian(rng) * 0.15;
            const shock = c.shock * noise;
            prices[a.id] *= 1 + shock;
            // queue contagion residuals for other assets
            assets.forEach((tgt) => {
              if (tgt.id === a.id) return;
              const corr = matrix[a.id]?.[tgt.id] ?? 0;
              const lag = getLag(a.id, tgt.id);
              const targetDay = Math.min(forecastDays, d + lag);
              if (residuals[a.id][tgt.id]) {
                residuals[a.id][tgt.id][targetDay] += shock * corr * 0.85;
              }
            });
          });
        });
      }

      // Daily GBM step with contagion residual
      assets.forEach((a) => {
        let dailyVol = a.annualVol * (volCurves[a.id][d - 1] || 1);
        let extraShock = 0;
        // collect lagged residuals into this asset
        assets.forEach((src) => {
          if (src.id === a.id) return;
          extraShock += residuals[src.id]?.[a.id]?.[d] || 0;
        });

        const stepDrift = (a.annualDrift - 0.5 * dailyVol * dailyVol) * DT;
        const stepShock = dailyVol * Math.sqrt(DT) * z[a.id];
        prices[a.id] = Math.max(0.01, prices[a.id] * Math.exp(stepDrift + stepShock) * (1 + extraShock));
        series[a.id][d] = prices[a.id];

        // mild continuous correlation via shared residual (small)
        assets.forEach((tgt) => {
          if (tgt.id === a.id) return;
          const corr = matrix[a.id]?.[tgt.id] ?? 0;
          const lag = getLag(a.id, tgt.id);
          const targetDay = Math.min(forecastDays, d + lag);
          if (residuals[a.id][tgt.id] && Math.abs(corr) > 0.1) {
            residuals[a.id][tgt.id][targetDay] += stepShock * corr * 0.15;
          }
        });
      });
    }

    assets.forEach((a) => result[a.id].push(series[a.id]));
  }
  return result;
}

function buildMultiAssetBands(pathsByAsset, forecastDays) {
  const out = {};
  for (const [id, paths] of Object.entries(pathsByAsset)) {
    out[id] = buildForecastBands(paths, forecastDays);
  }
  return out;
}

/* ---------- UI: contagion matrix editor ---------- */
(function () {
  let enabled = false;
  let customMatrix = JSON.parse(JSON.stringify(CONTAGION_MATRIX));

  function isEnabled() { return enabled; }
  function getMatrix() { return customMatrix; }

  function setEnabled(v) {
    enabled = !!v;
    document.dispatchEvent(new CustomEvent("mmt:contagion-changed", { detail: { enabled, matrix: customMatrix } }));
  }

  function renderMatrix() {
    const grid = document.getElementById("contagion-matrix");
    if (!grid) return;
    const ids = ASSETS.map((a) => a.id);
    let html = `<table class="contagion-table"><thead><tr><th></th>${ids.map((i) => `<th>${i.toUpperCase()}</th>`).join("")}</tr></thead><tbody>`;
    ids.forEach((row) => {
      html += `<tr><th>${row.toUpperCase()}</th>`;
      ids.forEach((col) => {
        const val = customMatrix[row]?.[col] ?? 0;
        const disabled = row === col ? "disabled" : "";
        html += `<td><input type="number" class="corr-input" data-row="${row}" data-col="${col}" min="-1" max="1" step="0.05" value="${val.toFixed(2)}" ${disabled} /></td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody></table>`;
    grid.innerHTML = html;
    grid.querySelectorAll(".corr-input:not([disabled])").forEach((inp) => {
      inp.addEventListener("change", () => {
        const r = inp.dataset.row, c = inp.dataset.col;
        if (!customMatrix[r]) customMatrix[r] = {};
        customMatrix[r][c] = clamp(Number(inp.value), -1, 1);
        document.dispatchEvent(new CustomEvent("mmt:contagion-changed", { detail: { enabled, matrix: customMatrix } }));
      });
    });
  }

  function initContagion() {
    const toggle = document.getElementById("contagion-enable");
    if (toggle) {
      toggle.addEventListener("change", () => {
        setEnabled(toggle.checked);
        showToast(toggle.checked ? "Contagion engine ON" : "Contagion engine OFF");
        window.MMT?.runSimulation?.();
      });
    }
    renderMatrix();
  }

  window.MMTContagion = {
    isEnabled,
    getMatrix,
    setEnabled,
    simulateContagionPaths,
    buildMultiAssetBands,
    CONTAGION_MATRIX,
  };

  document.addEventListener("DOMContentLoaded", initContagion);
})();
