// settings.js — small glue layer in case future settings need more logic
(function () {
  window.WSCSettings = {
    toggleExtraCatalysts(enabled) {
      // noop here, main.js reads the DOM toggle directly
      console.log('extra catalysts toggled', enabled);
    }
  };
})();
