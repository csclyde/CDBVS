const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const esbuild = require("esbuild");
const { FakeDocument, FakeOption } = require("./fakeDom");
// The harness loads individual source modules so tests can exercise the DOM
// without starting VS Code. Production uses the bundled media/editor.js.
const WEBVIEW_SCRIPTS = [
  ["EditorRuntime.js", "runtime"],
  ["EditorStateMaps.js", "runtime"],
  ["EditorDom.js", "runtime"],
  ["EditorUtils.js", "runtime"],
  ["EditorMutation.js", "runtime"],
  ["EditorStatus.js", "runtime"],
  ["EditorViewport.js", "runtime"],
  ["EditorModelDocument.js", "model"],
  ["EditorModelValues.js", "model"],
  ["EditorModelSchema.js", "model"],
  ["EditorModel.js", "model"],
  ["EditorModelErrors.js", "model"],
  ["EditorModelNested.js", "model"],
  ["EditorModelTypeConversion.js", "model"],
  ["EditorModelStructure.js", "model"],
  ["EditorModelColumns.js", "model"],
  ["EditorModelRows.js", "model"],
  ["EditorModelSheets.js", "model"],
  ["EditorSelection.js", "model"],
  ["EditorActionsClipboard.js", "actions"],
  ["EditorActions.js", "actions"],
  ["EditorModalShared.js", "modals"],
  ["EditorModalsConfirm.js", "modals"],
  ["EditorModalsRows.js", "modals"],
  ["EditorModalsColumns.js", "modals"],
  ["EditorModalsSheetCreate.js", "modals"],
  ["EditorModalsSheetDelete.js", "modals"],
  ["EditorModalsSheets.js", "modals"],
  ["EditorModalsTypes.js", "modals"],
  ["EditorModalsFilters.js", "modals"],
  ["EditorModals.js", "modals"],
  ["EditorCellRendering.js", "cells"],
  ["EditorCellsLists.js", "cells"],
  ["EditorCellsProperties.js", "cells"],
  ["EditorCells.js", "cells"],
  ["EditorViewControls.js", "view"],
  ["EditorViewContextMenus.js", "view"],
  ["EditorViewSelect.js", "view"],
  ["EditorViewSelection.js", "view"],
  ["EditorViewTableHeader.js", "view"],
  ["EditorViewTableCells.js", "view"],
  ["EditorViewTableRows.js", "view"],
  ["EditorViewTable.js", "view"],
  ["EditorView.js", "view"],
  ["EditorViewKeyboard.js", "view"],
  ["Editor.js", "bootstrap"]
];

const mediaRoot = path.resolve(__dirname, "..", "..", "src", "webview");
const scriptFolders = new Map(WEBVIEW_SCRIPTS);

function loadScript(context, name) {
  const sourceName = path.basename(name).replace(/\.js$/, ".ts");
  const filename = path.join(mediaRoot, scriptFolders.get(name) || path.dirname(name), sourceName);
  const source = fs.readFileSync(filename, "utf8");
  const transformed = esbuild.buildSync({
    stdin: { contents: source, sourcefile: filename, resolveDir: path.dirname(filename), loader: "ts" },
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "es2022",
    write: false,
    sourcemap: false
  });
  vm.runInNewContext(transformed.outputFiles[0].text, context, { filename });
}

function createWebviewHarness(data) {
  const document = new FakeDocument();
  const state = {
    text: "",
    data,
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
  const updates = [];
  const renders = [];
  const statuses = [];
  const CDBVS = {
    state,
    setDocument(message) {
      state.text = message.text || "";
      state.data = message.data;
      state.issues = Array.isArray(message.issues) ? message.issues : [];
      if (typeof message.rawMode === "boolean") state.rawMode = message.rawMode;
      state.showHiddenSheets = message.showHiddenSheets === true;
    },
    documentIssues() { return state.issues; },
    documentText() { return state.text; },
    TYPE_NAMES: [
      "id", "string", "bool", "int", "float", "enum", "ref", "image",
      "list", "custom", "flags", "color", "layer", "file", "tilepos",
      "tilelayer", "dynamic", "properties", "gradient", "curve", "guid"
    ],
    makeElement(tag, text, className) {
      const element = document.createElement(tag);
      if (text !== undefined && text !== null) element.textContent = text;
      if (className) element.className = className;
      return element;
    },
    makeButton(label, handler, className) {
      const button = CDBVS.makeElement("button", label, className || "button");
      button.type = "button";
      button.addEventListener("click", handler);
      return button;
    },
    sendUpdate() {
      updates.push(JSON.stringify(state.data));
    },
    scheduleUpdate() {
      updates.push(JSON.stringify(state.data));
    },
    flushUpdate() {
      updates.push(JSON.stringify(state.data));
    },
    requestSave() {},
    setStatus(message, error) {
      statuses.push({ message, error });
    },
    render() {
      renders.push(true);
    }
  };
  const context = {
    window: null,
    document,
    console,
    JSON,
    Math,
    Number,
    String,
    Object,
    Array,
    Set,
    Map,
    Date,
    RegExp,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Option: FakeOption,
    requestAnimationFrame(callback) { callback(); },
    setTimeout(callback) { callback(); return 0; },
    clearTimeout() {}
  };
  context.window = context;
  context.CDBVS = CDBVS;
  context.prompt = () => { throw new Error("Native prompt must not be called."); };
  context.confirm = () => { throw new Error("Native confirm must not be called."); };

  loadScript(context, "EditorStateMaps.js");
  loadScript(context, "EditorUtils.js");
  loadScript(context, "EditorMutation.js");
  loadScript(context, "EditorStatus.js");
  loadScript(context, "EditorViewport.js");
  loadScript(context, "EditorModelDocument.js");
  loadScript(context, "EditorModelValues.js");
  loadScript(context, "EditorModelSchema.js");
  loadScript(context, "EditorModel.js");
  loadScript(context, "EditorModelErrors.js");
  loadScript(context, "EditorModelNested.js");
  loadScript(context, "EditorModelTypeConversion.js");
  loadScript(context, "EditorModelStructure.js");
  loadScript(context, "EditorModelColumns.js");
  loadScript(context, "EditorModelRows.js");
  loadScript(context, "EditorModelSheets.js");
  loadScript(context, "EditorSelection.js");
  loadScript(context, "EditorCellRendering.js");
  loadScript(context, "EditorCellsLists.js");
  loadScript(context, "EditorCellsProperties.js");
  loadScript(context, "EditorActionsClipboard.js");
  loadScript(context, "EditorActions.js");
  loadScript(context, "EditorModalShared.js");
  loadScript(context, "EditorModalsConfirm.js");
  loadScript(context, "EditorModalsRows.js");
  loadScript(context, "EditorModalsColumns.js");
  loadScript(context, "EditorModalsSheetCreate.js");
  loadScript(context, "EditorModalsSheetDelete.js");
  loadScript(context, "EditorModalsSheets.js");
  loadScript(context, "EditorModalsTypes.js");
  loadScript(context, "EditorModalsFilters.js");
  loadScript(context, "EditorModals.js");
  loadScript(context, "EditorViewControls.js");
  loadScript(context, "EditorViewContextMenus.js");
  loadScript(context, "EditorViewSelect.js");
  loadScript(context, "EditorViewSelection.js");
  loadScript(context, "EditorViewTableHeader.js");
  loadScript(context, "EditorViewTableCells.js");
  loadScript(context, "EditorViewTableRows.js");
  loadScript(context, "EditorViewTable.js");
  loadScript(context, "EditorViewKeyboard.js");
  return { context, document, state, CDBVS, updates, renders, statuses };
}

module.exports = { createWebviewHarness, loadScript };
