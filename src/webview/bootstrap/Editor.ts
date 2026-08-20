import { isHostToWebviewMessage } from "../../shared/protocol";
import type { HostToWebviewMessage } from "../../shared/protocol";
import type { CdbvsWebviewApi } from "../contract";

(function (global: Window) {
  const CDBVS = global.CDBVS as CdbvsWebviewApi;
  const renderNow = CDBVS.renderNow || (() => {
    if (typeof CDBVS.render === "function") CDBVS.render();
  });
  const normalizedDocumentText = (text: string) => text.replace(/\r\n?/g, "\n");
  const isRedundantDocumentMessage = (message: Extract<HostToWebviewMessage, { type: "document" }>) => (
    typeof CDBVS.documentText === "function"
      && normalizedDocumentText(message.text) === normalizedDocumentText(CDBVS.documentText())
      && CDBVS.state.rawMode === message.rawMode
      && CDBVS.state.showHiddenSheets === message.showHiddenSheets
  );

  global.addEventListener("message", (event) => {
    const message: unknown = event.data;
    if (!isHostToWebviewMessage(message)) return;
    if (message.type === "document") {
      if (isRedundantDocumentMessage(message)) return;
      CDBVS.setDocument(message);
      renderNow();
    } else if (message.type === "error") {
      CDBVS.setStatus(message.message, true);
    }
  });

  renderNow();
  CDBVS.vscode.postMessage({ type: "ready" });
})(window);
