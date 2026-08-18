(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const renderNow = CDBVS.renderNow || (() => {
    if (typeof CDBVS.render === "function") CDBVS.render();
  });

  global.addEventListener("message", (event) => {
    const message = event.data;
    if (!message) return;
    if (message.type === "document") {
      state.text = message.text || "";
      state.data = message.data;
      state.issues = Array.isArray(message.issues) ? message.issues : [];
      if (typeof message.rawMode === "boolean") state.rawMode = message.rawMode;
      state.showHiddenSheets = message.showHiddenSheets === true;
      renderNow();
    } else if (message.type === "error") {
      CDBVS.setStatus(message.message, true);
    }
  });

  renderNow();
  CDBVS.vscode.postMessage({ type: "ready" });
})(window);
