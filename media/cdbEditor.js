(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;

  global.addEventListener("message", (event) => {
    const message = event.data;
    if (!message) return;
    if (message.type === "document") {
      state.text = message.text || "";
      state.data = message.data;
      state.issues = Array.isArray(message.issues) ? message.issues : [];
      state.showHiddenSheets = message.showHiddenSheets === true;
      CDBVS.render();
    } else if (message.type === "error") {
      CDBVS.setStatus(message.message, true);
    }
  });

  CDBVS.render();
  CDBVS.vscode.postMessage({ type: "ready" });
})(window);

