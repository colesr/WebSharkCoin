/* chart.js — hand-rolled canvas rendering, no external chart library */


function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

function fmtPrice(v) {
  if (v >= 1000) return "$" + Math.round(v).toLocaleString("en-US");
  if (v >= 1) return "$" + v.toFixed(2);
  return "$" + v.toFixed(4);
}

class Seismograph {
  constructor(canvas, capacity = 140) {
    this.canvas = canvas;
    this.capacity = capacity;
    this.buffer = [];
    for (let i = 0; i < capacity; i++) this.buffer.push({ v: 0, pulse: 0 });
  }

  push(driftNormalized, pulse = 0) {
    this.buffer.push({ v: driftNormalized, pulse });
    if (this.buffer.length > this.capacity) this.buffer.shift();
  }

  draw() {
    const { ctx, w, h } = fitCanvas(this.canvas);
    ctx.clearRect(0, 0, w, h);
    const midY = h / 2;

    ctx.strokeStyle = "rgba(143,141,134,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    const n = this.buffer.length;
    const stepX = w / Math.max(1, n - 1);

    ctx.beginPath();
    ctx.strokeStyle = cssVar("--amber", "#ffb020");
    ctx.lineWidth = 1.6;
    ctx.shadowColor = cssVar("--amber", "#ffb020");
    ctx.shadowBlur = 6;
    for (let i = 0; i < n; i++) {
      const pt = this.buffer[i];
      const x = i * stepX;
      const y = midY - pt.v * (h * 0.42);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    for (let i = 0; i < n; i++) {
      const pt = this.buffer[i];
      if (pt.pulse > 0.05) {
        const x = i * stepX;
        const y = midY - pt.v * (h * 0.42);
        ctx.beginPath();
        ctx.fillStyle = cssVar("--cyan", "#5fd4d4");
        ctx.globalAlpha = pt.pulse;
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }
}

function drawForecastChart(canvas, { history, bands, historyDays, forecastDays, liveHistory, secondaryBands }) {
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);

  const padL = 66, padR = 16, padT = 18, padB = 26;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const allVals = [...history, ...bands.p10, ...bands.p90];
  if (liveHistory) allVals.push(...liveHistory);
  if (secondaryBands) {
    Object.values(secondaryBands).forEach((b) => {
      if (b?.p10) allVals.push(...b.p10, ...b.p90);
    });
  }
  let minV = Math.min(...allVals);
  let maxV = Math.max(...allVals);
  const pad = (maxV - minV) * 0.08 || maxV * 0.1;
  minV -= pad; maxV += pad;

  const totalDays = historyDays + forecastDays;
  const xForIndex = (i) => padL + (i / totalDays) * plotW;
  const yForVal = (v) => padT + (1 - (v - minV) / (maxV - minV)) * plotH;

  ctx.strokeStyle = "rgba(143,141,134,0.14)";
  ctx.fillStyle = "#8f8d86";
  ctx.font = "11px 'IBM Plex Mono', monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const v = minV + ((maxV - minV) * i) / gridLines;
    const y = yForVal(v);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.fillText(fmtPrice(v), padL - 8, y);
  }

  const todayX = xForIndex(historyDays);
  ctx.strokeStyle = "rgba(255,176,32,0.35)";
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(todayX, padT);
  ctx.lineTo(todayX, padT + plotH);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#ffb020";
  ctx.font = "10px 'IBM Plex Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText("NOW", todayX, padT - 6);

  const fx = (d) => xForIndex(historyDays + d);

  // 10-90 band
  ctx.beginPath();
  bands.p90.forEach((v, d) => {
    const x = fx(d), y = yForVal(v);
    d === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  for (let d = bands.p10.length - 1; d >= 0; d--) {
    ctx.lineTo(fx(d), yForVal(bands.p10[d]));
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(95,212,212,0.10)";
  ctx.fill();

  // 25-75 band
  ctx.beginPath();
  bands.p75.forEach((v, d) => {
    const x = fx(d), y = yForVal(v);
    d === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  for (let d = bands.p25.length - 1; d >= 0; d--) {
    ctx.lineTo(fx(d), yForVal(bands.p25[d]));
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(95,212,212,0.20)";
  ctx.fill();

  // secondary asset medians (contagion mode)
  if (secondaryBands) {
    const colors = { eth: "#8b7cf7", sol: "#3ecf8e", btc: "#ffb020" };
    Object.entries(secondaryBands).forEach(([id, b]) => {
      if (!b?.p50) return;
      ctx.beginPath();
      ctx.strokeStyle = colors[id] || "#8f8d86";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      b.p50.forEach((v, d) => {
        const x = fx(d), y = yForVal(v);
        d === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  // history
  ctx.beginPath();
  ctx.strokeStyle = "#e9e7e1";
  ctx.lineWidth = 1.6;
  history.forEach((v, i) => {
    const x = xForIndex(i), y = yForVal(v);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // live history overlay
  if (liveHistory && liveHistory.length > 1) {
    ctx.beginPath();
    ctx.strokeStyle = "#3ecf8e";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 2]);
    const len = Math.min(liveHistory.length, historyDays + 1);
    for (let i = 0; i < len; i++) {
      const x = xForIndex(i);
      const y = yForVal(liveHistory[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // median
  ctx.beginPath();
  ctx.strokeStyle = cssVar("--amber", "#ffb020");
  ctx.lineWidth = 2;
  bands.p50.forEach((v, d) => {
    const x = fx(d), y = yForVal(v);
    d === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  const lastX = fx(bands.p50.length - 1);
  const lastY = yForVal(bands.p50[bands.p50.length - 1]);
  ctx.beginPath();
  ctx.fillStyle = "#ffb020";
  ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
  ctx.fill();
}
