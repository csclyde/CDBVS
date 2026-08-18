const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { FakeDocument, FakeOption } = require("./fakeDom");

const mediaRoot = path.resolve(__dirname, "..", "..", "media");
const scriptFolders = new Map([
  ["cdbEditorRuntime.js", "runtime"], ["cdbEditorDom.js", "runtime"],
  ["cdbEditorModelSchema.js", "model"], ["cdbEditorModel.js", "model"], ["cdbEditorModelErrors.js", "model"], ["cdbEditorModelStructure.js", "model"], ["cdbEditorSelection.js", "model"],
  ["cdbEditorActionsClipboard.js", "actions"], ["cdbEditorActions.js", "actions"],
  ["cdbEditorModalShared.js", "modals"], ["cdbEditorModalsConfirm.js", "modals"], ["cdbEditorModalsRows.js", "modals"], ["cdbEditorModalsColumns.js", "modals"],
  ["cdbEditorModalsSheetCreate.js", "modals"], ["cdbEditorModalsSheetDelete.js", "modals"], ["cdbEditorModalsSheets.js", "modals"], ["cdbEditorModalsTypes.js", "modals"], ["cdbEditorModalsFilters.js", "modals"], ["cdbEditorModals.js", "modals"],
  ["cdbEditorCellsLists.js", "cells"], ["cdbEditorCellsProperties.js", "cells"], ["cdbEditorCells.js", "cells"],
  ["cdbEditorViewControls.js", "view"], ["cdbEditorViewContextMenus.js", "view"], ["cdbEditorViewSelection.js", "view"], ["cdbEditorViewTableHeader.js", "view"], ["cdbEditorViewTableCells.js", "view"], ["cdbEditorViewTableRows.js", "view"], ["cdbEditorViewTable.js", "view"], ["cdbEditorViewKeyboard.js", "view"], ["cdbEditorView.js", "view"],
  ["cdbEditor.js", "bootstrap"]
]);

function loadScript(context, name) {
  const filename = path.join(mediaRoot, scriptFolders.get(name) || path.dirname(name), path.basename(name));
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { filename });
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

  loadScript(context, "cdbEditorModelSchema.js");
  loadScript(context, "cdbEditorModel.js");
  loadScript(context, "cdbEditorModelErrors.js");
  loadScript(context, "cdbEditorModelStructure.js");
  loadScript(context, "cdbEditorSelection.js");
  loadScript(context, "cdbEditorCellsLists.js");
  loadScript(context, "cdbEditorCellsProperties.js");
  loadScript(context, "cdbEditorActionsClipboard.js");
  loadScript(context, "cdbEditorActions.js");
  loadScript(context, "cdbEditorModalShared.js");
  loadScript(context, "cdbEditorModalsConfirm.js");
  loadScript(context, "cdbEditorModalsRows.js");
  loadScript(context, "cdbEditorModalsColumns.js");
  loadScript(context, "cdbEditorModalsSheetCreate.js");
  loadScript(context, "cdbEditorModalsSheetDelete.js");
  loadScript(context, "cdbEditorModalsSheets.js");
  loadScript(context, "cdbEditorModalsTypes.js");
  loadScript(context, "cdbEditorModalsFilters.js");
  loadScript(context, "cdbEditorModals.js");
  loadScript(context, "cdbEditorViewControls.js");
  loadScript(context, "cdbEditorViewContextMenus.js");
  loadScript(context, "cdbEditorViewSelection.js");
  loadScript(context, "cdbEditorViewTableHeader.js");
  loadScript(context, "cdbEditorViewTableCells.js");
  loadScript(context, "cdbEditorViewTableRows.js");
  loadScript(context, "cdbEditorViewTable.js");
  loadScript(context, "cdbEditorViewKeyboard.js");
  return { context, document, state, CDBVS, updates, renders, statuses };
}

module.exports = { createWebviewHarness, loadScript };
