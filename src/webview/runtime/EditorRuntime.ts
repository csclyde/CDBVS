import type { CdbvsWebviewApi } from "../contract";
import type { HostToWebviewMessage } from "../../shared/protocol";
import { createEditorState, TYPE_NAMES } from "./EditorState";

(function (global: Window) {
  const CDBVS = (global.CDBVS || {}) as CdbvsWebviewApi;
  global.CDBVS = CDBVS;
  CDBVS.vscode = global.acquireVsCodeApi();
  CDBVS.app = document.getElementById("app");
  CDBVS.TYPE_NAMES = TYPE_NAMES;
  CDBVS.state = createEditorState();

  CDBVS.setDocument = function (message: Extract<HostToWebviewMessage, { type: "document" }>) {
    const state = CDBVS.state;
    state.text = message.text || "";
    state.data = message.data;
    state.issues = Array.isArray(message.issues) ? message.issues : [];
    if (typeof message.rawMode === "boolean") state.rawMode = message.rawMode;
    state.showHiddenSheets = message.showHiddenSheets === true;
  };

  CDBVS.documentIssues = function () {
    return Array.isArray(CDBVS.state.issues) ? CDBVS.state.issues : [];
  };

  CDBVS.documentText = function () {
    return typeof CDBVS.state.text === "string" ? CDBVS.state.text : "";
  };

  let scheduledUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  const clearScheduledUpdate = () => {
    if (scheduledUpdateTimer === null) return;
    clearTimeout(scheduledUpdateTimer);
    scheduledUpdateTimer = null;
  };

  CDBVS.sendUpdate = function () {
    clearScheduledUpdate();
    const state = CDBVS.state;
    if (!state.data) return;
    const text = `${JSON.stringify(state.data, null, "\t")}\n`;
    state.text = text;
    CDBVS.vscode.postMessage({ type: "update", text });
  };

  CDBVS.scheduleUpdate = function (delay = 120) {
    clearScheduledUpdate();
    scheduledUpdateTimer = setTimeout(() => {
      scheduledUpdateTimer = null;
      CDBVS.sendUpdate();
    }, delay);
  };

  CDBVS.flushUpdate = function () {
    CDBVS.sendUpdate();
  };

  CDBVS.requestSave = function () {
    CDBVS.vscode.postMessage({ type: "save" });
  };

  global.addEventListener("beforeunload", () => {
    CDBVS.flushUpdate();
  });

})(window);
