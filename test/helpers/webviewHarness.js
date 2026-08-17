const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { FakeDocument, FakeOption } = require("./fakeDom");

const mediaRoot = path.resolve(__dirname, "..", "..", "media");

function loadScript(context, name) {
  const filename = path.join(mediaRoot, name);
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

  loadScript(context, "cdbEditorModel.js");
  loadScript(context, "cdbEditorActions.js");
  loadScript(context, "cdbEditorModals.js");
  return { context, document, state, CDBVS, updates, renders, statuses };
}

module.exports = { createWebviewHarness, loadScript };
