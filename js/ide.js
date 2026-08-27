// ide.js — basic in-browser IDE helpers (sandboxed run)
(function () {
  // Expose a small API to IDE if needed
  window.WSCIDE = {
    save(code) { localStorage.setItem('wsc:ide:code', code); },
    load() { return localStorage.getItem('wsc:ide:code') || ''; }
  };
})();
