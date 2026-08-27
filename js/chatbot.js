/* chatbot.js — "Coin.ai"
   A chat assistant that runs entirely client-side using WebLLM
   (https://github.com/mlc-ai/web-llm), which downloads a quantized open
   model straight into the browser (cached via the Cache API / IndexedDB)
   and runs inference on-device via WebGPU. No server, no API key, free
   after the one-time model download. Requires a WebGPU-capable browser
   (recent Chrome/Edge; support elsewhere varies).

   Local logging (Settings → Data & Privacy) is OFF by default. When a user
   turns it on, chat transcripts are written to this browser's localStorage
   only, for the user to export and use however they like — nothing is sent
   anywhere, and no continuous background model training happens (that's
   not something a browser-side inference model can actually do; WebLLM
   only runs inference, not training).
*/

const WEBLLM_CDN = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.84/+esm";
const PREFERRED_MODEL_SUBSTRINGS = ["1B", "0.5B", "1.5B", "Phi-3.5-mini", "Qwen2.5-0.5B", "Qwen2.5-1.5B", "SmolLM", "Llama-3.2-1B"];

(function () {
  let els = {};
  let webllm = null;
  let engine = null;
  let selectedModelId = null;
  let chatHistory = []; // { role, content }
  let busy = false;

  function el(id) { return document.getElementById(id); }

  function logIfEnabled(entry) {
    const settings = window.MMTSettings ? window.MMTSettings.get() : null;
    if (!settings || !settings.localLoggingEnabled) return;
    try {
      const key = "mmt_chat_log";
      const log = JSON.parse(localStorage.getItem(key) || "[]");
      log.push({ ts: Date.now(), ...entry });
      localStorage.setItem(key, JSON.stringify(log.slice(-500))); // cap growth
    } catch { /* storage full or unavailable — skip silently */ }
  }

  function recordFeedback(messageIndex, rating, question, answer) {
    try {
      const key = "mmt_chat_feedback";
      const log = JSON.parse(localStorage.getItem(key) || "[]");
      log.push({ ts: Date.now(), modelId: selectedModelId, rating, question, answer });
      localStorage.setItem(key, JSON.stringify(log.slice(-1000)));
    } catch { /* ignore */ }
  }

  /* ---------- UI: panel open/close ---------- */
  function openPanel() {
    els.panel.classList.add("is-open");
    if (!engine && !webllm) showModelSelect();
  }
  function closePanel() {
    els.panel.classList.remove("is-open");
  }

  /* ---------- Model select screen ---------- */
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

  /* ---------- Chat screen ---------- */
  function systemContext() {
    if (!window.MMT) return "You are Coin.ai, a helpful assistant embedded in a crypto market factor simulator.";
    const { state, currentAsset } = window.MMT;
    const asset = currentAsset();
    const { annualDrift, annualVol, contributions } = computeComposite(state.values, asset.baseAnnualVol);
    const top = contributions.slice(0, 5).map((c) => `${c.label}: ${(c.driftContrib * 100).toFixed(1)}%`).join(", ");
    return `You are Coin.ai, an assistant embedded in the Market Mechanics Terminal, a crypto market factor simulator that runs entirely in the user's browser. `
      + `Current session: asset=${asset.name} (${asset.id.toUpperCase()}), composite annualized drift=${(annualDrift * 100).toFixed(1)}%, `
      + `composite annualized volatility=${(annualVol * 100).toFixed(1)}%, top contributing factors: ${top}. `
      + `Help the user understand the simulator's mechanics, interpret the current settings, and reason about market factors. `
      + `Be clear that this tool's forecasts come from user-adjustable heuristic weights, not a fitted or trained financial model, and that nothing here is financial advice.`;
  }

  function startChat() {
    els.modelSelectView.classList.add("is-hidden");
    els.chatView.classList.remove("is-hidden");
    if (chatHistory.length === 0) {
      chatHistory.push({ role: "system", content: systemContext() });
      appendMessage("assistant", `Coin.ai is running locally on your device (model: ${selectedModelId}). Ask me anything about the current simulation, the factors, or how to read the forecast.`, false);
    }
  }

  function appendMessage(role, content, recordable = true) {
    const row = document.createElement("div");
    row.className = "chat-msg chat-msg-" + role;

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.textContent = content;
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
        bubble.textContent = full;
        els.messages.scrollTop = els.messages.scrollHeight;
      }
      bubble.classList.remove("is-streaming");
      chatHistory.push({ role: "assistant", content: full });
      logIfEnabled({ role: "assistant", content: full });
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
