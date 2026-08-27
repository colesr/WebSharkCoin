/* engine.js
   Converts the current slider state into:
     - an annualized expected drift (signed)
     - an annualized volatility
     - a ranked list of factor contributions (for the "signal breakdown" panel)

   This is a deliberately transparent, illustrative weighting model, not a
   fitted statistical or financial model. Weights live in factors.js so the
   whole "theory" of the simulator is inspectable in one place.
*/

const MAX_DRIFT_SUM = FACTORS.reduce((s, f) => s + Math.abs(f.driftWeight), 0);
const MAX_VOL_SUM = FACTORS.reduce((s, f) => s + Math.abs(f.volWeight), 0);

const BASE_DRIFT_SCALE = 0.65;  // max magnitude of annualized drift the panel alone can produce
const VOL_SWING_SCALE = 0.9;    // how much the panel alone can add/remove from base volatility
const MIN_VOL = 0.12;
const MAX_VOL = 3.0;

function computeComposite(values, baseAnnualVol) {
  let driftRaw = 0;
  let volRaw = 0;
  const contributions = [];

  for (const f of FACTORS) {
    const raw = values[f.id] ?? f.default ?? 0;
    const v = raw / 100; // -1..1

    const driftContrib = v * f.driftWeight;
    // volWeight > 0: moving away from neutral in EITHER direction excites the market.
    // volWeight < 0: moving toward the labeled bullish/orderly end calms it.
    const volContrib = f.volWeight >= 0
      ? Math.abs(v) * f.volWeight
      : v * f.volWeight; // negative weight * v: only the "orderly" direction reduces vol

    driftRaw += driftContrib;
    volRaw += volContrib;

    contributions.push({
      id: f.id,
      label: f.label,
      category: f.category,
      rawValue: raw,
      driftContrib,
    });
  }

  contributions.sort((a, b) => Math.abs(b.driftContrib) - Math.abs(a.driftContrib));

  const annualDrift = clamp(driftRaw / MAX_DRIFT_SUM, -1, 1) * BASE_DRIFT_SCALE;
  const volAdjust = clamp(volRaw / MAX_VOL_SUM, -1, 1) * VOL_SWING_SCALE;
  const annualVol = clamp(baseAnnualVol + volAdjust, MIN_VOL, MAX_VOL);

  return { annualDrift, annualVol, contributions };
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function driftLabel(annualDrift) {
  const pct = annualDrift * 100;
  if (pct >= 35) return { text: "STRONGLY BULLISH", cls: "tone-strong-up" };
  if (pct >= 10) return { text: "BULLISH", cls: "tone-up" };
  if (pct > -10) return { text: "NEUTRAL", cls: "tone-neutral" };
  if (pct > -35) return { text: "BEARISH", cls: "tone-down" };
  return { text: "STRONGLY BEARISH", cls: "tone-strong-down" };
}
