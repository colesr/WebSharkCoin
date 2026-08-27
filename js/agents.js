/* agents.js — Agent Swarm Mode
   Hundreds of simple agents with heterogeneous strategies trade in a
   continuous double-auction-ish market. Drift emerges from their behavior
   rather than being imposed top-down. Factor settings bias agent preferences.
*/

const AGENT_TYPES = [
  { id: "trend", label: "Trend Follower", weight: 0.22 },
  { id: "meanrev", label: "Mean Reverter", weight: 0.18 },
  { id: "degen", label: "Levered Degen", weight: 0.15 },
  { id: "holder", label: "Diamond Hands", weight: 0.20 },
  { id: "panic", label: "Panic Seller", weight: 0.12 },
  { id: "arb", label: "ETF Arb", weight: 0.13 },
];

function createAgentPopulation(numAgents, seed, factorBias) {
  const rng = mulberry32(seed);
  const agents = [];
  // factorBias influences type mix
  const leverageBias = (factorBias.leverage ?? 0) / 100; // -1..1
  const fearBias = (factorBias.fear_greed ?? 0) / 100;
  const liquidityBias = (factorBias.liquidity_depth ?? 0) / 100;

  for (let i = 0; i < numAgents; i++) {
    let typeRoll = rng();
    let type = AGENT_TYPES[0].id;
    let acc = 0;
    for (const t of AGENT_TYPES) {
      let w = t.weight;
      if (t.id === "degen") w *= 1 + leverageBias * 0.8;
      if (t.id === "panic") w *= 1 - fearBias * 0.6;
      if (t.id === "holder") w *= 1 + Math.max(0, -fearBias) * 0.4;
      acc += w;
    }
    // renormalize roughly
    typeRoll *= acc || 1;
    acc = 0;
    for (const t of AGENT_TYPES) {
      let w = t.weight;
      if (t.id === "degen") w *= 1 + leverageBias * 0.8;
      if (t.id === "panic") w *= 1 - fearBias * 0.6;
      if (t.id === "holder") w *= 1 + Math.max(0, -fearBias) * 0.4;
      acc += w;
      if (typeRoll <= acc) { type = t.id; break; }
    }

    const capital = 1000 + rng() * 9000;
    agents.push({
      id: i,
      type,
      capital,
      position: 0, // units of asset
      entryPrice: 0,
      leverage: type === "degen" ? 3 + rng() * 7 : type === "trend" ? 1 + rng() * 2 : 1,
      patience: type === "holder" ? 0.9 : type === "panic" ? 0.15 : 0.4 + rng() * 0.4,
      sensitivity: 0.5 + rng() * 0.5,
      pnl: 0,
    });
  }
  return agents;
}

/**
 * Run agent-based market for `forecastDays` steps.
 * Returns price path (single path — agent markets are path-dependent)
 * and agent summary stats.
 */
function runAgentMarket({
  startPrice,
  factorValues,
  catalysts,
  seed,
  forecastDays,
  numAgents = 200,
  baseVol = 0.55,
}) {
  const rng = mulberry32(seed);
  const agents = createAgentPopulation(numAgents, seed ^ 0x2a, factorValues);
  const path = new Array(forecastDays + 1);
  path[0] = startPrice;
  let price = startPrice;
  let momentum = 0; // short-term return signal

  // Catalyst day-1 shock applied as external flow
  let pendingShock = 0;
  if (catalysts && catalysts.length) {
    catalysts.forEach((c) => {
      pendingShock += c.shock * (0.85 + rng() * 0.3);
    });
  }

  const { annualDrift, annualVol } = computeComposite(factorValues, baseVol);

  for (let d = 1; d <= forecastDays; d++) {
    if (d === 1 && pendingShock !== 0) {
      price *= 1 + pendingShock;
      pendingShock = 0;
    }

    // Aggregate desired order flow from agents
    let netDemand = 0; // positive = buy pressure
    const lookback = Math.min(d, 10);
    const recentRet = lookback > 0 ? (price - path[d - lookback]) / path[d - lookback] : 0;
    momentum = momentum * 0.7 + recentRet * 0.3;

    agents.forEach((ag) => {
      let desire = 0; // -1..1 sell..buy
      const inv = ag.position * price;
      const wealth = ag.capital + inv;

      switch (ag.type) {
        case "trend":
          desire = clamp(momentum * 8 * ag.sensitivity, -1, 1);
          break;
        case "meanrev":
          desire = clamp(-momentum * 6 * ag.sensitivity, -1, 1);
          break;
        case "degen":
          desire = clamp(momentum * 12 * ag.sensitivity + (rng() - 0.5) * 0.4, -1, 1);
          // liquidate if underwater hard
          if (ag.position > 0 && price < ag.entryPrice * 0.85) desire = -1;
          if (ag.position < 0 && price > ag.entryPrice * 1.15) desire = 1;
          break;
        case "holder":
          // slow accumulation, rarely sell
          desire = rng() < 0.08 ? 0.3 * ag.sensitivity : (ag.position < 0 ? 0.2 : 0);
          if (recentRet < -0.15 && rng() > ag.patience) desire = -0.5;
          break;
        case "panic":
          if (recentRet < -0.05) desire = -0.8 * ag.sensitivity;
          else if (recentRet > 0.08) desire = 0.3;
          else desire = (rng() - 0.55) * 0.3;
          break;
        case "arb":
          // mild mean-reversion + drift following
          desire = clamp(annualDrift * 2 - momentum * 3, -0.6, 0.6);
          break;
      }

      // Factor bias: high exchange inflow → more sell desire, etc.
      const netflow = (factorValues.exchange_netflow ?? 0) / 100;
      desire -= netflow * 0.15;

      const tradeNotional = desire * wealth * 0.05 * ag.leverage;
      netDemand += tradeNotional;
    });

    // Price impact: tanh for diminishing impact, scaled by liquidity factor
    const liq = 1 + (factorValues.liquidity_depth ?? 0) / 200; // 0.5..1.5
    const impact = Math.tanh(netDemand / (startPrice * numAgents * 0.8 * liq)) * 0.04;
    // fundamental drift noise
    const z = gaussian(rng);
    const dailyVol = annualVol * (1 + Math.abs(momentum) * 0.5);
    const stepDrift = (annualDrift * 0.3 - 0.5 * dailyVol * dailyVol) * DT; // agents carry most of the drift
    const stepShock = dailyVol * Math.sqrt(DT) * z * 0.6;

    price = Math.max(0.01, price * Math.exp(stepDrift + stepShock) * (1 + impact));
    path[d] = price;

    // Settle agent positions roughly
    agents.forEach((ag) => {
      // simplified: mark-to-market
      if (ag.position !== 0) {
        ag.pnl = ag.position * (price - ag.entryPrice);
      }
    });
  }

  // Summary
  const byType = {};
  AGENT_TYPES.forEach((t) => { byType[t.id] = { count: 0, totalPnl: 0 }; });
  agents.forEach((ag) => {
    byType[ag.type].count++;
    byType[ag.type].totalPnl += ag.pnl;
  });

  return {
    path,
    agents,
    byType,
    finalPrice: price,
  };
}

/**
 * For fan-chart compatibility: run multiple agent markets with different seeds
 * to approximate a distribution.
 */
function simulateAgentPaths({
  startPrice,
  factorValues,
  catalysts,
  seed,
  forecastDays,
  numPaths = 40,
  numAgents = 150,
  baseVol = 0.55,
}) {
  const paths = [];
  for (let p = 0; p < numPaths; p++) {
    const { path } = runAgentMarket({
      startPrice,
      factorValues,
      catalysts,
      seed: (seed + p * 9973) >>> 0,
      forecastDays,
      numAgents,
      baseVol,
    });
    paths.push(path);
  }
  return paths;
}

(function () {
  let enabled = false;
  let numAgents = 200;

  function isEnabled() { return enabled; }
  function setEnabled(v) {
    enabled = !!v;
    document.dispatchEvent(new CustomEvent("mmt:agents-changed", { detail: { enabled, numAgents } }));
  }

  function initAgents() {
    const toggle = document.getElementById("agents-enable");
    const countSlider = document.getElementById("agents-count");
    const countVal = document.getElementById("agents-count-val");
    if (toggle) {
      toggle.addEventListener("change", () => {
        setEnabled(toggle.checked);
        showToast(toggle.checked ? "Agent swarm ON — drift emerges from agents" : "Agent swarm OFF");
        window.MMT?.runSimulation?.();
      });
    }
    if (countSlider) {
      countSlider.addEventListener("input", () => {
        numAgents = Number(countSlider.value);
        if (countVal) countVal.textContent = numAgents;
      });
    }
  }

  window.MMTAgents = {
    isEnabled,
    setEnabled,
    getNumAgents: () => numAgents,
    runAgentMarket,
    simulateAgentPaths,
    AGENT_TYPES,
  };

  document.addEventListener("DOMContentLoaded", initAgents);
})();
