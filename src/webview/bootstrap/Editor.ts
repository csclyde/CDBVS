import { isHostToWebviewMessage } from "../../shared/protocol";
import type { CdbvsWebviewApi } from "../contract";

(function (global: Window) {
  const CDBVS = global.CDBVS as CdbvsWebviewApi;
  const state = CDBVS.state;
  const renderNow = CDBVS.renderNow || (() => {
    if (typeof CDBVS.render === "function") CDBVS.render();
  });

  global.addEventListener("message", (event) => {
    const message: unknown = event.data;
    if (!isHostToWebviewMessage(message)) return;
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
