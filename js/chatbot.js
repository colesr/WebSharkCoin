/* chatbot.js — "Coin.ai" Co-Pilot
   Client-side WebLLM assistant with rich scenario context and simple
   action commands (e.g. "make this more fearful", "arm exchange collapse").
*/

const WEBLLM_CDN = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.84/+esm";
const PREFERRED_MODEL_SUBSTRINGS = ["1B", "0.5B", "1.5B", "Phi-3.5-mini", "Qwen2.5-0.5B", "Qwen2.5-1.5B", "SmolLM", "Llama-3.2-1B"];

(function () {
  let els = {};
  let webllm = null;
  let engine = null;
  let selectedModelId = null;
  let chatHistory = [];
  let busy = false;

  function el(id) { return document.getElementById(id); }

  function logIfEnabled(entry) {
    const settings = window.MMTSettings ? window.MMTSettings.get() : null;
    if (!settings || !settings.localLoggingEnabled) return;
    try {
      const key = "mmt_chat_log";
      const log = JSON.parse(localStorage.getItem(key) || "[]");
      log.push({ ts: Date.now(), ...entry });
      localStorage.setItem(key, JSON.stringify(log.slice(-500)));
    } catch { /* skip */ }
  }

  function recordFeedback(messageIndex, rating, question, answer) {
    try {
      const key = "mmt_chat_feedback";
      const log = JSON.parse(localStorage.getItem(key) || "[]");
      log.push({ ts: Date.now(), modelId: selectedModelId, rating, question, answer });
      localStorage.setItem(key, JSON.stringify(log.slice(-1000)));
    } catch { /* ignore */ }
  }

  function openPanel() {
    els.panel.classList.add("is-open");
    if (!engine && !webllm) showModelSelect();
  }
  function closePanel() {
    els.panel.classList.remove("is-open");
  }

  async function showModelSelect() {
    els.modelSelectView.classList.remove("is-hidden");
    els.chatView.classList.add("is-hidden");
    els.modelList.innerHTML = `<div class="ide-console-line">Loading available models…</div>`;

    try {
      const mod = await import(/* webpackIgnore: true */ WEBLLM_CDN);
      webllm = mod;
      const all = webllm.prebuiltAppConfig.model_list;
      const preferred = all.filter((m) => PREFERRED_MODEL_SUBSTRINGS.some((s) => m.model_id.includes(s)));
      const list = (preferred.length ? preferred : all.slice(0, 8));

      els.modelList.innerHTML = "";
      list.forEach((m) => {
        const sizeMB = m.vram_required_MB ? Math.round(m.vram_required_MB) + " MB VRAM" : "size varies";
        const row = document.createElement("label");
        row.className = "model-option";
        row.innerHTML = `
          <input type="radio" name="webllm-model" value="${m.model_id}" />
          <span class="model-option-name">${m.model_id}</span>
          <span class="model-option-size">${sizeMB}</span>
        `;
        els.modelList.appendChild(row);
      });
      const first = els.modelList.querySelector('input[type="radio"]');
      if (first) first.checked = true;
    } catch (err) {
      els.modelList.innerHTML = `<div class="ide-console-line ide-console-error">Couldn't load the model catalog (needs internet + a WebGPU-capable browser). ${err.message || ""}</div>`;
    }
  }

  async function downloadAndRun() {
    const picked = els.modelList.querySelector('input[type="radio"]:checked');
    if (!picked) { showToast("Pick a model first"); return; }
    selectedModelId = picked.value;

    els.downloadProgress.classList.remove("is-hidden");
    els.downloadBtn.disabled = true;
    els.downloadStatus.textContent = "Starting download…";
    els.progressBar.style.width = "0%";

    try {
      engine = await webllm.CreateMLCEngine(selectedModelId, {
        initProgressCallback: (report) => {
          const pct = Math.round((report.progress || 0) * 100);
          els.progressBar.style.width = pct + "%";
          els.downloadStatus.textContent = report.text || (pct + "%");
        },
      });
      showToast("Coin.ai ready — running locally in your browser");
      startChat();
    } catch (err) {
      els.downloadStatus.textContent = "Failed to load model: " + (err.message || err);
      els.downloadBtn.disabled = false;
    }
  }

  function systemContext() {
    if (!window.MMT) return "You are Coin.ai, a helpful assistant embedded in a crypto market factor simulator.";
    const { state, currentAsset } = window.MMT;
    const asset = currentAsset();
    const { annualDrift, annualVol, contributions } = computeComposite(state.values, asset.baseAnnualVol);
    const top = contributions.slice(0, 5).map((c) => `${c.label}: ${(c.driftContrib * 100).toFixed(1)}%`).join(", ");
    const cats = Array.from(state.catalysts).map((id) => {
      const c = CATALYSTS.find((x) => x.id === id);
      return c ? c.label : id;
    }).join(", ") || "none";
    const engines = [];
    if (window.MMTTemporal?.isAnyEnabled?.()) engines.push("temporal paths");
    if (window.MMTReflexivity?.getStrength?.() > 0) engines.push("reflexivity " + Math.round(window.MMTReflexivity.getStrength() * 100) + "%");
    if (window.MMTContagion?.isEnabled?.()) engines.push("contagion");
    if (window.MMTAgents?.isEnabled?.()) engines.push("agent swarm");
    if (window.MMTSensors?.isEnabled?.()) engines.push("live sensors");

    return `You are Coin.ai, the co-pilot for Market Mechanics Terminal — a transparent crypto scenario simulator that runs entirely in the browser.
Current session:
- Asset: ${asset.name} (${asset.id.toUpperCase()}) at ~$${asset.startPrice.toLocaleString()}
- Composite annualized drift: ${(annualDrift * 100).toFixed(1)}%
- Composite annualized volatility: ${(annualVol * 100).toFixed(1)}%
- Top factors: ${top}
- Active catalysts: ${cats}
- Active engines: ${engines.join(", ") || "standard Monte Carlo only"}

You can explain mechanics, interpret the forecast, and suggest factor/catalyst changes.
When the user asks to change the scenario (e.g. "make it more fearful", "arm exchange collapse", "turn on reflexivity"), respond with a short explanation AND a machine-readable action block on its own line in this exact format:
ACTION: set_factor factor_id value
ACTION: arm_catalyst catalyst_id
ACTION: disarm_catalyst catalyst_id
ACTION: set_reflexivity 0-100
ACTION: enable_contagion
ACTION: enable_agents
Valid factor ids include: ${FACTORS.map((f) => f.id).join(", ")}.
Valid catalyst ids include: ${CATALYSTS.map((c) => c.id).join(", ")}.
Be clear that forecasts come from heuristic weights + simulation, not a fitted model, and nothing is financial advice.
Keep replies concise and practical.`;
  }

  function tryExecuteActions(text) {
    if (!window.MMT) return [];
    const lines = text.split("\n");
    const done = [];
    lines.forEach((line) => {
      const m = line.match(/^ACTION:\s*(\w+)(?:\s+(.+))?$/i);
      if (!m) return;
      const cmd = m[1].toLowerCase();
      const args = (m[2] || "").trim().split(/\s+/);
      try {
        if (cmd === "set_factor" && args.length >= 2) {
          const fid = args[0];
          const val = clamp(Number(args[1]), -100, 100);
          if (FACTORS.some((f) => f.id === fid) && !isNaN(val)) {
            window.MMT.state.values[fid] = val;
            done.push(`set ${fid}=${val}`);
          }
        } else if (cmd === "arm_catalyst" && args[0]) {
          if (CATALYSTS.some((c) => c.id === args[0])) {
            window.MMT.state.catalysts.add(args[0]);
            done.push(`armed ${args[0]}`);
          }
        } else if (cmd === "disarm_catalyst" && args[0]) {
          window.MMT.state.catalysts.delete(args[0]);
          done.push(`disarmed ${args[0]}`);
        } else if (cmd === "set_reflexivity" && args[0] != null) {
          const v = clamp(Number(args[0]) / 100, 0, 1);
          window.MMTReflexivity?.setStrength?.(v);
          const slider = document.getElementById("reflexivity-strength");
          if (slider) { slider.value = Math.round(v * 100); }
          const lab = document.getElementById("reflexivity-strength-val");
          if (lab) lab.textContent = Math.round(v * 100) + "%";
          done.push(`reflexivity ${Math.round(v * 100)}%`);
        } else if (cmd === "enable_contagion") {
          window.MMTContagion?.setEnabled?.(true);
          const t = document.getElementById("contagion-enable");
          if (t) t.checked = true;
          done.push("contagion on");
        } else if (cmd === "enable_agents") {
          window.MMTAgents?.setEnabled?.(true);
          const t = document.getElementById("agents-enable");
          if (t) t.checked = true;
          done.push("agents on");
        }
      } catch { /* ignore bad actions */ }
    });
    if (done.length) {
      document.dispatchEvent(new CustomEvent("mmt:scenario-loaded", { detail: {} }));
      window.MMT.recomputeAndRender?.(false);
      window.MMT.runSimulation?.();
      showToast("Coin.ai applied: " + done.join(", "));
    }
    return done;
  }

  function startChat() {
    els.modelSelectView.classList.add("is-hidden");
    els.chatView.classList.remove("is-hidden");
    if (chatHistory.length === 0) {
      chatHistory.push({ role: "system", content: systemContext() });
      appendMessage("assistant", `Coin.ai is running locally (${selectedModelId}). I can explain the current scenario, suggest changes, or apply them via ACTION commands. Try: "make this look risk-off" or "what happens if an exchange collapses?"`, false);
    }
  }

  function appendMessage(role, content, recordable = true) {
    const row = document.createElement("div");
    row.className = "chat-msg chat-msg-" + role;

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    // strip ACTION lines from visible text for cleaner UX
    const visible = content.split("\n").filter((l) => !/^ACTION:/i.test(l.trim())).join("\n").trim() || content;
    bubble.textContent = visible;
    row.appendChild(bubble);

    if (role === "assistant" && recordable) {
      const fb = document.createElement("div");
      fb.className = "chat-feedback";
      const up = document.createElement("button");
      up.className = "feedback-btn";
      up.setAttribute("aria-label", "Good response");
      up.textContent = "▲";
      const down = document.createElement("button");
      down.className = "feedback-btn";
      down.setAttribute("aria-label", "Bad response");
      down.textContent = "▼";

      const lastUser = [...chatHistory].reverse().find((m) => m.role === "user");
      up.addEventListener("click", () => {
        up.classList.add("is-selected"); down.classList.remove("is-selected");
        recordFeedback(chatHistory.length, "up", lastUser?.content, content);
        showToast("Thanks for the feedback");
      });
      down.addEventListener("click", () => {
        down.classList.add("is-selected"); up.classList.remove("is-selected");
        recordFeedback(chatHistory.length, "down", lastUser?.content, content);
        showToast("Thanks for the feedback");
      });
      fb.appendChild(up);
      fb.appendChild(down);
      row.appendChild(fb);
    }

    els.messages.appendChild(row);
    els.messages.scrollTop = els.messages.scrollHeight;
    return bubble;
  }

  async function sendMessage() {
    const text = els.input.value.trim();
    if (!text || busy || !engine) return;
    els.input.value = "";
    appendMessage("user", text, false);
    // refresh system context each turn so it sees current state
    chatHistory = chatHistory.filter((m) => m.role !== "system");
    chatHistory.unshift({ role: "system", content: systemContext() });
    chatHistory.push({ role: "user", content: text });
    logIfEnabled({ role: "user", content: text });

    busy = true;
    els.sendBtn.disabled = true;
    const bubble = appendMessage("assistant", "", true);
    bubble.classList.add("is-streaming");

    try {
      const stream = await engine.chat.completions.create({
        messages: chatHistory,
        stream: true,
        temperature: 0.7,
      });
      let full = "";
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content || "";
        full += delta;
        const visible = full.split("\n").filter((l) => !/^ACTION:/i.test(l.trim())).join("\n");
        bubble.textContent = visible;
        els.messages.scrollTop = els.messages.scrollHeight;
      }
      bubble.classList.remove("is-streaming");
      chatHistory.push({ role: "assistant", content: full });
      logIfEnabled({ role: "assistant", content: full });
      tryExecuteActions(full);
    } catch (err) {
      bubble.classList.remove("is-streaming");
      bubble.textContent = "Something went wrong generating a reply: " + (err.message || err);
    } finally {
      busy = false;
      els.sendBtn.disabled = false;
      els.input.focus();
    }
  }

  function initChatbot() {
    els = {
      fab: el("coinai-fab"),
      panel: el("coinai-panel"),
      closeBtn: el("coinai-close-btn"),
      modelSelectView: el("coinai-model-select"),
      chatView: el("coinai-chat-view"),
      modelList: el("coinai-model-list"),
      downloadBtn: el("coinai-download-btn"),
      downloadProgress: el("coinai-download-progress"),
      downloadStatus: el("coinai-download-status"),
      progressBar: el("coinai-progress-bar"),
      messages: el("coinai-messages"),
      input: el("coinai-input"),
      sendBtn: el("coinai-send-btn"),
      changeModelBtn: el("coinai-change-model-btn"),
    };
    if (!els.fab) return;

    els.fab.addEventListener("click", openPanel);
    els.closeBtn.addEventListener("click", closePanel);
    els.downloadBtn.addEventListener("click", downloadAndRun);
    els.sendBtn.addEventListener("click", sendMessage);
    els.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    els.changeModelBtn.addEventListener("click", () => {
      engine = null;
      chatHistory = [];
      els.messages.innerHTML = "";
      els.downloadProgress.classList.add("is-hidden");
      els.downloadBtn.disabled = false;
      showModelSelect();
    });
  }

  document.addEventListener("DOMContentLoaded", initChatbot);
})();
