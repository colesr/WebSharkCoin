/* ide.js
   A lightweight in-browser IDE for refining the model. Loads the current
   slider configuration as a starting point (via buildModelCodeBundle from
   export.js), lets the user edit it freely, and runs it in a sandboxed
   <iframe sandbox="allow-scripts"> with no same-origin access to the parent
   page — edited code cannot touch app state, cookies, or local storage,
   it can only compute and print output back to the console panel.
*/

(function () {
  let els = {};
  let sandboxFrame = null;

  function createSandbox() {
    if (sandboxFrame) sandboxFrame.remove();
    sandboxFrame = document.createElement("iframe");
    sandboxFrame.sandbox = "allow-scripts";
    sandboxFrame.style.display = "none";
    document.body.appendChild(sandboxFrame);
  }

  function runCode(code) {
    createSandbox();
    els.consoleOutput.innerHTML = "";
    appendConsoleLine("Running…", "info");

    const listener = (e) => {
      if (!sandboxFrame || e.source !== sandboxFrame.contentWindow) return;
      const { type, args } = e.data || {};
      if (type === "log") appendConsoleLine(args.join(" "), "log");
      else if (type === "error") appendConsoleLine(args.join(" "), "error");
      else if (type === "done") window.removeEventListener("message", listener);
    };
    window.addEventListener("message", listener);

    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>
      const send = (type, args) => parent.postMessage({ type, args: args.map(a => {
        try { return typeof a === "object" ? JSON.stringify(a, null, 2) : String(a); }
        catch { return String(a); }
      }) }, "*");
      console.log = (...args) => send("log", args);
      console.error = (...args) => send("error", args);
      try {
        ${code}
      } catch (err) {
        send("error", [err.name + ": " + err.message]);
      }
      send("done", []);
    <\/script></body></html>`;

    sandboxFrame.srcdoc = doc;
  }

  function appendConsoleLine(text, cls) {
    const line = document.createElement("div");
    line.className = "ide-console-line" + (cls ? " ide-console-" + cls : "");
    line.textContent = text;
    els.consoleOutput.appendChild(line);
    els.consoleOutput.scrollTop = els.consoleOutput.scrollHeight;
  }

  function loadCurrentModel() {
    if (!window.MMT) return;
    const { state, currentAsset } = window.MMT;
    const bundle = buildModelCodeBundle({
      asset: currentAsset(),
      seed: state.seed,
      values: state.values,
      activeCatalystIds: Array.from(state.catalysts),
    });
    els.editor.value = bundle;
  }

  function initIDE() {
    els = {
      openBtn: document.getElementById("ide-btn"),
      modal: document.getElementById("ide-modal"),
      closeBtn: document.getElementById("ide-close-btn"),
      editor: document.getElementById("ide-editor"),
      runBtn: document.getElementById("ide-run-btn"),
      loadBtn: document.getElementById("ide-load-btn"),
      downloadBtn: document.getElementById("ide-download-btn"),
      copyBtn: document.getElementById("ide-copy-btn"),
      consoleOutput: document.getElementById("ide-console-output"),
    };
    if (!els.openBtn) return;

    els.openBtn.addEventListener("click", () => {
      els.modal.classList.add("is-open");
      if (!els.editor.value.trim()) loadCurrentModel();
    });
    els.closeBtn.addEventListener("click", () => els.modal.classList.remove("is-open"));
    els.modal.addEventListener("click", (e) => {
      if (e.target === els.modal) els.modal.classList.remove("is-open");
    });

    els.runBtn.addEventListener("click", () => runCode(els.editor.value));
    els.loadBtn.addEventListener("click", () => {
      loadCurrentModel();
      showToast("Loaded current model into editor");
    });
    els.downloadBtn.addEventListener("click", () => {
      const asset = window.MMT ? window.MMT.currentAsset() : { id: "model" };
      downloadTextFile(`${asset.id}-model-edited.js`, els.editor.value, "application/javascript");
      showToast("Downloaded edited model code");
    });
    els.copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(els.editor.value);
        showToast("Copied to clipboard");
      } catch {
        showToast("Copy failed — select and copy manually");
      }
    });

    // basic tab-key support inside the editor (insert 2 spaces instead of losing focus)
    els.editor.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const start = els.editor.selectionStart, end = els.editor.selectionEnd;
        els.editor.value = els.editor.value.slice(0, start) + "  " + els.editor.value.slice(end);
        els.editor.selectionStart = els.editor.selectionEnd = start + 2;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", initIDE);
})();
