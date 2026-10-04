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
      const drafts = typeof CDBVS.captureCellDrafts === "function" ? CDBVS.captureCellDrafts() : [];
      if (drafts.length) CDBVS.state.recoveredDrafts = [...(CDBVS.state.recoveredDrafts || []), ...drafts];
      CDBVS.state.rawDraft = null;
      // External edits/undo own the document. Preserve unfinished input for
      // recovery, then discard stale controls before accepting that snapshot.
      if (typeof CDBVS.closeSelectMenu === "function") CDBVS.closeSelectMenu();
      if (typeof CDBVS.closeAllModals === "function") CDBVS.closeAllModals();
      if (CDBVS.sheetState) {
        for (const key of ["activeCells", "selectedCells", "selectedRows", "activeRows", "rowSelectionAnchors"]) CDBVS.sheetState.clearMap(key);
      }
      CDBVS.setDocument(message);
      renderNow();
    } else if (message.type === "error") {
      CDBVS.state.lastDocumentError = message.message;
      if (typeof message.rejectedText === "string") {
        const drafts = CDBVS.state.recoveredDrafts || [];
        if (!drafts.some((draft: { label: string; text: string }) => draft.label === "Unapplied document update" && draft.text === message.rejectedText)) {
          CDBVS.state.recoveredDrafts = [...drafts, { label: "Unapplied document update", text: message.rejectedText }];
          if (typeof CDBVS.refreshDraftRecovery === "function") CDBVS.refreshDraftRecovery();
        }
      }
      CDBVS.setStatus(message.message, true);
    }
  });

  renderNow();
  CDBVS.vscode.postMessage({ type: "ready" });
})(window);
