import type { CdbvsWebviewApi } from "../contract";

(function (global: Window) {
  const CDBVS = (global.CDBVS || {}) as CdbvsWebviewApi;
  global.CDBVS = CDBVS;
  CDBVS.vscode = global.acquireVsCodeApi();
  CDBVS.app = document.getElementById("app");
  CDBVS.TYPE_NAMES = [
    "id", "string", "bool", "int", "float", "enum", "ref", "image",
    "list", "custom", "flags", "color", "layer", "file", "tilepos",
    "tilelayer", "dynamic", "properties", "gradient", "curve", "guid"
  ];
  CDBVS.state = {
    text: "",
    data: null,
    issues: [],
    sheetIndex: 0,
    rawMode: false,
    filter: "",
    columnFilters: {},
    sorts: {},
    selectedRows: {},
    activeRows: {},
    rowSelectionAnchors: {},
    selectedCells: {},
    activeCells: {},
    selectedListRows: {},
    selectedListCells: {},
    listSelectionAnchors: {},
    rowClipboard: null,
    cellClipboard: null,
    cellErrors: {},
    collapsedSeparators: {},
    showHiddenSheets: false,
    expandedLists: new Set(),
    scrollLeft: 0,
    scrollTop: 0
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

  CDBVS.setStatus = function (message: string, error?: boolean) {
    const status = document.getElementById("status");
    if (!status) return;
    status.textContent = message || "";
    status.className = error ? "status error" : "status";
  };

  CDBVS.rememberViewport = function () {
    const tableWrap = document.querySelector(".table-wrap");
    if (!tableWrap) return;
    CDBVS.state.scrollLeft = tableWrap.scrollLeft;
    CDBVS.state.scrollTop = tableWrap.scrollTop;
  };

  CDBVS.restoreViewport = function () {
    const tableWrap = document.querySelector(".table-wrap");
    if (!tableWrap) return;
    tableWrap.scrollLeft = CDBVS.state.scrollLeft;
    tableWrap.scrollTop = CDBVS.state.scrollTop;
    const horizontalScroll = document.querySelector(".horizontal-scroll-dock");
    if (horizontalScroll) horizontalScroll.scrollLeft = tableWrap.scrollLeft;
  };
})(window);
