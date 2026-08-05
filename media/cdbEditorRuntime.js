(function (global) {
  const CDBVS = global.CDBVS = global.CDBVS || {};
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
    selectedListRows: {},
    showHiddenSheets: false,
    expandedLists: new Set(),
    scrollLeft: 0,
    scrollTop: 0
  };

  CDBVS.sendUpdate = function () {
    const state = CDBVS.state;
    if (!state.data) return;
    const text = `${JSON.stringify(state.data, null, "\t")}\n`;
    state.text = text;
    CDBVS.vscode.postMessage({ type: "update", text });
  };

  CDBVS.setStatus = function (message, error) {
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
  };
})(window);
