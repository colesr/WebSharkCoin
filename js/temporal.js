/* temporal.js — Temporal Factor Paths ("Movie Mode")
   Each factor can become a timeline of keyframes instead of a static value.
   The Monte Carlo then runs against a time-varying drift/vol surface.
*/

const TEMPORAL_KEY_PREFIX = "mmt_temporal_";

function createDefaultTimeline(factorId, staticValue) {
  return {
    factorId,
    enabled: false,
    keyframes: [
      { day: 0, value: staticValue },
      { day: 180, value: staticValue },
    ],
  };
}

function interpolateTimeline(keyframes, day) {
  if (!keyframes || keyframes.length === 0) return 0;
  const sorted = [...keyframes].sort((a, b) => a.day - b.day);
  if (day <= sorted[0].day) return sorted[0].value;
  if (day >= sorted[sorted.length - 1].day) return sorted[sorted.length - 1].value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (day >= a.day && day <= b.day) {
      const t = (day - a.day) / Math.max(1, b.day - a.day);
      // smoothstep for nicer curves
      const s = t * t * (3 - 2 * t);
      return a.value + (b.value - a.value) * s;
    }
  }
  return sorted[sorted.length - 1].value;
}

function valuesAtDay(timelines, staticValues, day) {
  const out = { ...staticValues };
  for (const tid of Object.keys(timelines)) {
    const tl = timelines[tid];
    if (tl && tl.enabled && tl.keyframes && tl.keyframes.length) {
      out[tid] = interpolateTimeline(tl.keyframes, day);
    }
  }
  return out;
}

function computeDriftVolCurve(timelines, staticValues, baseAnnualVol, forecastDays) {
  const drift = new Array(forecastDays + 1);
  const vol = new Array(forecastDays + 1);
  for (let d = 0; d <= forecastDays; d++) {
    const vals = valuesAtDay(timelines, staticValues, d);
    const { annualDrift, annualVol } = computeComposite(vals, baseAnnualVol);
    drift[d] = annualDrift;
    vol[d] = annualVol;
  }
  return { drift, vol };
}

/* ---------- UI helpers for temporal editor ---------- */
(function () {
  let timelines = {}; // factorId -> timeline
  let editingFactor = null;
  let els = {};

  function getTimelines() {
    return timelines;
  }

  function setTimeline(factorId, tl) {
    timelines[factorId] = tl;
  }

  function isAnyEnabled() {
    return Object.values(timelines).some((t) => t && t.enabled);
  }

  function openTemporalEditor(factorId) {
    editingFactor = factorId;
    if (!timelines[factorId]) {
      const staticVal = (window.MMT && window.MMT.state.values[factorId]) ?? 0;
      timelines[factorId] = createDefaultTimeline(factorId, staticVal);
    }
    renderTemporalPanel();
    els.panel.classList.add("is-open");
    els.overlay.classList.add("is-visible");
  }

  function closeTemporalEditor() {
    els.panel.classList.remove("is-open");
    els.overlay.classList.remove("is-visible");
    editingFactor = null;
  }

  function renderTemporalPanel() {
    if (!editingFactor) return;
    const f = FACTORS.find((x) => x.id === editingFactor);
    const tl = timelines[editingFactor];
    els.title.textContent = "Timeline · " + (f ? f.label : editingFactor);
    els.enableToggle.checked = tl.enabled;

    els.keyframesList.innerHTML = "";
    const sorted = [...tl.keyframes].sort((a, b) => a.day - b.day);
    sorted.forEach((kf, idx) => {
      const row = document.createElement("div");
      row.className = "temporal-kf-row";
      row.innerHTML = `
        <label>Day <input type="number" class="kf-day" min="0" max="365" value="${kf.day}" data-idx="${idx}" /></label>
        <label>Value <input type="range" class="kf-val" min="-100" max="100" value="${kf.value}" data-idx="${idx}" />
          <span class="kf-val-label">${kf.value > 0 ? "+" : ""}${kf.value}</span></label>
        <button class="ghost-btn kf-remove" data-idx="${idx}" title="Remove keyframe">✕</button>
      `;
      els.keyframesList.appendChild(row);
    });

    // bind inputs
    els.keyframesList.querySelectorAll(".kf-day").forEach((inp) => {
      inp.addEventListener("change", () => {
        const i = Number(inp.dataset.idx);
        tl.keyframes[i].day = clamp(Number(inp.value), 0, 365);
        renderTemporalPanel();
        notify();
      });
    });
    els.keyframesList.querySelectorAll(".kf-val").forEach((inp) => {
      inp.addEventListener("input", () => {
        const i = Number(inp.dataset.idx);
        tl.keyframes[i].value = Number(inp.value);
        const label = inp.parentElement.querySelector(".kf-val-label");
        if (label) label.textContent = (Number(inp.value) > 0 ? "+" : "") + inp.value;
        notify();
      });
    });
    els.keyframesList.querySelectorAll(".kf-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (tl.keyframes.length <= 1) return;
        tl.keyframes.splice(Number(btn.dataset.idx), 1);
        renderTemporalPanel();
        notify();
      });
    });

    drawTimelinePreview(tl);
  }

  function drawTimelinePreview(tl) {
    const canvas = els.previewCanvas;
    if (!canvas) return;
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const pad = 8;
    const days = 180;
    ctx.strokeStyle = "rgba(143,141,134,0.25)";
    ctx.beginPath();
    ctx.moveTo(pad, h / 2);
    ctx.lineTo(w - pad, h / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = "#5fd4d4";
    ctx.lineWidth = 1.8;
    for (let d = 0; d <= days; d++) {
      const v = interpolateTimeline(tl.keyframes, d) / 100;
      const x = pad + (d / days) * (w - 2 * pad);
      const y = h / 2 - v * (h / 2 - pad);
      d === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // keyframe dots
    tl.keyframes.forEach((kf) => {
      const x = pad + (kf.day / days) * (w - 2 * pad);
      const y = h / 2 - (kf.value / 100) * (h / 2 - pad);
      ctx.beginPath();
      ctx.fillStyle = "#ffb020";
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function notify() {
    document.dispatchEvent(new CustomEvent("mmt:temporal-changed", { detail: { timelines } }));
    if (window.MMT && window.MMTSettings?.get()?.autoRunOnChange) {
      window.MMT.runSimulation?.();
    }
  }

  function initTemporal() {
    els = {
      overlay: document.getElementById("temporal-overlay"),
      panel: document.getElementById("temporal-panel"),
      closeBtn: document.getElementById("temporal-close-btn"),
      title: document.getElementById("temporal-title"),
      enableToggle: document.getElementById("temporal-enable"),
      keyframesList: document.getElementById("temporal-keyframes"),
      addKfBtn: document.getElementById("temporal-add-kf"),
      previewCanvas: document.getElementById("temporal-preview"),
      applyBtn: document.getElementById("temporal-apply-btn"),
    };
    if (!els.panel) return;

    els.closeBtn?.addEventListener("click", closeTemporalEditor);
    els.overlay?.addEventListener("click", closeTemporalEditor);
    els.enableToggle?.addEventListener("change", () => {
      if (!editingFactor) return;
      timelines[editingFactor].enabled = els.enableToggle.checked;
      notify();
    });
    els.addKfBtn?.addEventListener("click", () => {
      if (!editingFactor) return;
      const tl = timelines[editingFactor];
      const last = tl.keyframes[tl.keyframes.length - 1];
      tl.keyframes.push({ day: Math.min(365, (last?.day || 0) + 30), value: last?.value || 0 });
      renderTemporalPanel();
      notify();
    });
    els.applyBtn?.addEventListener("click", () => {
      closeTemporalEditor();
      showToast("Timeline applied");
      window.MMT?.runSimulation?.();
    });
  }

  window.MMTTemporal = {
    getTimelines,
    setTimeline,
    isAnyEnabled,
    openEditor: openTemporalEditor,
    valuesAtDay,
    computeDriftVolCurve,
    interpolateTimeline,
  };

  document.addEventListener("DOMContentLoaded", initTemporal);
})();
