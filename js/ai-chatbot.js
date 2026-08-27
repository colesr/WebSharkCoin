// ai-chatbot.js — Coin.ai UI + minimal local-model setup helpers
// Updated to be idempotent and avoid attaching duplicate event listeners when reloaded.

(function () {
  if (window.CoinAI && window.CoinAI._initDone) return; // already initialized

  function $(sel) { return document.querySelector(sel); }
  const panel = $('#chatbot-panel');
  const setup = $('#chatbot-setup');
  const windowEl = $('#chatbot-window');
  const messages = $('#chat-messages');
  const input = $('#chat-input');
  const send = $('#chat-send');
  const modelSelect = $('#model-select');
  const modelDownload = $('#model-download');
  const modelSkip = $('#model-skip');
  const trainToggle = $('#train-on-logs-toggle');

  // If DOM isn't present, expose a lightweight stub and exit gracefully
  if (!panel) {
    window.CoinAI = window.CoinAI || {};
    window.CoinAI._initDone = true;
    window.CoinAI.open = function () { console.warn('CoinAI panel not found in DOM'); };
    window.CoinAI.close = function () {};
    window.CoinAI.sendMessage = function (msg) { console.warn('CoinAI not ready'); };
    window.CoinAI.attachOpen = function () {};
    return;
  }

  function createMessage(text, who='bot'){
    const el = document.createElement('div');
    el.className = 'chat-message ' + (who==='user' ? 'user' : 'bot');
    el.innerHTML = `<div>${escapeHtml(text)}</div>`;
    // feedback row
    const vr = document.createElement('div'); vr.className = 'vote-row';
    const up = document.createElement('button'); up.className = 'vote-btn up'; up.textContent = '▲';
    const down = document.createElement('button'); down.className = 'vote-btn down'; down.textContent = '▼';
    up.addEventListener('click', () => voteFeedback(el, 1));
    down.addEventListener('click', () => voteFeedback(el, -1));
    vr.appendChild(up); vr.appendChild(down);
    el.appendChild(vr);
    return el;
  }

  function escapeHtml(s){ return (s+'').replace(/[&<>"]/g, (c)=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function voteFeedback(messageEl, score){
    try {
      messageEl.style.opacity = '0.8';
      // store feedback locally for now
      const feedback = JSON.parse(localStorage.getItem('wsc:chat:fb')||'[]');
      feedback.push({ text: messageEl.innerText, score, ts: Date.now() });
      localStorage.setItem('wsc:chat:fb', JSON.stringify(feedback));
    } catch (e) { console.warn('voteFeedback failed', e); }
  }

  function showWindow() {
    if (setup) setup.hidden = true;
    if (windowEl) windowEl.hidden = false;
  }

  function showSetup() {
    if (setup) setup.hidden = false;
    if (windowEl) windowEl.hidden = true;
  }

  async function doLocalModelDownload(modelId) {
    if (!modelDownload) return;
    // This is a UI helper only — real model download + local runtime is outside the browser
    try {
      modelDownload.disabled = true;
      const orig = modelDownload.textContent;
      modelDownload.textContent = 'Downloading...';
      // simulate progress
      await new Promise((r)=>setTimeout(r, 1200));
      modelDownload.textContent = 'Installing (simulated)...';
      await new Promise((r)=>setTimeout(r, 900));
      localStorage.setItem('wsc:chat:model', modelId);
      modelDownload.textContent = 'Ready (local)';
      setTimeout(()=> { if (modelDownload) modelDownload.textContent = orig; modelDownload.disabled = false; }, 800);
      // reveal chat window
      showWindow();
    } catch (e) {
      console.warn('doLocalModelDownload error', e);
      if (modelDownload) { modelDownload.disabled = false; modelDownload.textContent = 'Download & Use Locally'; }
    }
  }

  function attachOpen(doc){
    // integrate with main app open if needed in the future
  }

  function open(){
    panel.setAttribute('aria-hidden','false');
    panel.style.right = '18px';
  }

  function close(){
    panel.setAttribute('aria-hidden','true');
    panel.style.right = '-420px';
  }

  function appendBot(text){
    try {
      const el = createMessage(text,'bot');
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
    } catch (e) { console.warn('appendBot failed', e); }
  }

  function appendUser(text){
    try {
      const el = createMessage(text,'user');
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
    } catch (e) { console.warn('appendUser failed', e); }
  }

  function sendMessage(text){
    appendUser(text);
    // very small local demo reply
    appendBot('Coin.ai (demo): received your question — see local model selection in setup to run locally.');
  }

  // Add event listeners once (idempotent)
  function safeAddListeners() {
    if (panel._coinAIListenersAdded) return;
    panel._coinAIListenersAdded = true;

    if (modelDownload) modelDownload.addEventListener('click', () => doLocalModelDownload(modelSelect ? modelSelect.value : 'local'));
    if (modelSkip) modelSkip.addEventListener('click', () => { localStorage.removeItem('wsc:chat:model'); showWindow(); });
    if (send) send.addEventListener('click', () => { const v = input.value.trim(); if (!v) return; sendMessage(v); input.value=''; });
    if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (send) send.click(); } });
  }

  // Initialize view based on saved model
  (function initView(){
    try {
      const savedModel = localStorage.getItem('wsc:chat:model');
      if (savedModel) showWindow(); else showSetup();
    } catch (e) { console.warn('CoinAI initView failed', e); }
  })();

  safeAddListeners();

  // expose global
  window.CoinAI = { open, close, sendMessage, attachOpen };
  window.CoinAI._initDone = true;
})();
