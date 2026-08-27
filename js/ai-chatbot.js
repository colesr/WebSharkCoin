// ai-chatbot.js — Coin.ai UI + minimal local-model setup helpers

(function () {
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
    messageEl.style.opacity = '0.8';
    // store feedback locally for now
    const feedback = JSON.parse(localStorage.getItem('wsc:chat:fb')||'[]');
    feedback.push({ text: messageEl.innerText, score, ts: Date.now() });
    localStorage.setItem('wsc:chat:fb', JSON.stringify(feedback));
  }

  function showWindow() {
    setup.hidden = true;
    windowEl.hidden = false;
  }

  function showSetup() {
    setup.hidden = false;
    windowEl.hidden = true;
  }

  async function doLocalModelDownload(modelId) {
    // This is a UI helper only — real model download + local runtime is outside the browser
    modelDownload.disabled = true;
    modelDownload.textContent = 'Downloading...';
    // simulate progress
    await new Promise((r)=>setTimeout(r, 1200));
    modelDownload.textContent = 'Installing (simulated)...';
    await new Promise((r)=>setTimeout(r, 900));
    localStorage.setItem('wsc:chat:model', modelId);
    modelDownload.textContent = 'Ready (local)';
    setTimeout(()=> { modelDownload.textContent = 'Downloaded & Use Locally'; modelDownload.disabled = false; }, 800);
    // reveal chat window
    showWindow();
  }

  function attachOpen(doc){
    // integrate with main app open
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
    const el = createMessage(text,'bot');
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  function appendUser(text){
    const el = createMessage(text,'user');
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  function sendMessage(text){
    appendUser(text);
    // very small local demo reply
    appendBot('Coin.ai (demo): received your question — see local model selection in setup to run locally.');
  }

  modelDownload.addEventListener('click', () => doLocalModelDownload(modelSelect.value));
  modelSkip.addEventListener('click', () => { localStorage.removeItem('wsc:chat:model'); showWindow(); });
  send.addEventListener('click', () => { const v = input.value.trim(); if (!v) return; sendMessage(v); input.value=''; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send.click(); });

  // expose global
  window.CoinAI = { open, close, sendMessage, attachOpen };
})();
