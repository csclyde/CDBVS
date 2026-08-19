import { isHostToWebviewMessage } from "../../shared/protocol";
import type { CdbvsWebviewApi } from "../contract";

(function (global: Window) {
  const CDBVS = global.CDBVS as CdbvsWebviewApi;
  const renderNow = CDBVS.renderNow || (() => {
    if (typeof CDBVS.render === "function") CDBVS.render();
  });

  global.addEventListener("message", (event) => {
    const message: unknown = event.data;
    if (!isHostToWebviewMessage(message)) return;
    if (message.type === "document") {
      CDBVS.setDocument(message);
      renderNow();
    } else if (message.type === "error") {
      CDBVS.setStatus(message.message, true);
    }
  });

  renderNow();
  CDBVS.vscode.postMessage({ type: "ready" });
})(window);
