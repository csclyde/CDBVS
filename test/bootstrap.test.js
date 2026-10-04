const assert = require("node:assert/strict");
const test = require("node:test");
const { FakeDocument, FakeOption } = require("./helpers/fakeDom");
const { loadScript } = require("./helpers/webviewHarness");

function makeProductionWebview() {
  const document = new FakeDocument();
  const app = document.createElement("div");
  app.setAttribute("id", "app");
  document.body.appendChild(app);
  const listeners = {};
  const posted = [];
  const timers = new Map();
  let timerId = 0;
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
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(type, listener) { (listeners[type] || (listeners[type] = [])).push(listener); },
    removeEventListener(type, listener) { listeners[type] = (listeners[type] || []).filter((item) => item !== listener); },
    acquireVsCodeApi() { return { postMessage: (message) => posted.push(message) }; }
  };
  context.window = context;
  loadScript(context, "../webview.js");
  return {
    context,
    document,
    app,
    posted,
    listeners,
    runTimers() {
      const pending = [...timers.entries()];
      pending.forEach(([id, timer]) => {
        if (!timers.has(id)) return;
        timers.delete(id);
        timer.callback();
      });
    }
  };
}

const validData = {
  customTypes: [],
  sheets: [{ name: "Players", columns: [{ name: "id", typeStr: "0" }], lines: [{ id: "p1" }] }]
};

test("external refresh recovers unfinished cell input and clears stale selection without writing it back", () => {
  const harness = makeProductionWebview();
  const CDBVS = harness.context.CDBVS;
  const data = { customTypes: [], sheets: [{ name: "People", columns: [{ name: "name", typeStr: "1" }], lines: [{ name: "Old" }] }] };
  const message = (data) => ({ type: "document", text: JSON.stringify(data), data, issues: [], rawMode: false, showHiddenSheets: false });
  harness.listeners.message[0]({ data: message(data) });
  harness.runTimers();
  const sheet = CDBVS.currentSheet();
  CDBVS.selectRenderedCell(sheet, 0, 0); CDBVS.activateRenderedCell(sheet, 0, 0);
  const input = CDBVS.findRenderedCell(0, 0).querySelector("input");
  input.value = "unfinished"; input.dispatchEvent({ type: "input" });
  const before = harness.posted.length;
  const replacement = structuredClone(data); replacement.sheets[0].lines[0].name = "External";
  harness.listeners.message[0]({ data: message(replacement) });
  harness.runTimers();
  assert.equal(CDBVS.currentSheet().lines[0].name, "External");
  assert.equal(CDBVS.selectedCell(CDBVS.currentSheet()), null);
  assert.equal(harness.app.querySelector(".recovered-draft textarea").value, "unfinished");
  assert.equal(harness.posted.length, before);
});

test("external refresh preserves list-modal drafts and disposes their listeners", () => {
  const harness = makeProductionWebview();
  const CDBVS = harness.context.CDBVS;
  const data = { customTypes: [], sheets: [
    { name: "People", columns: [{ name: "items", typeStr: "8" }], lines: [{ items: [{ value: "old" }] }] },
    { name: "People@items", columns: [{ name: "value", typeStr: "1" }], lines: [], props: { hide: true } }
  ] };
  const message = (data) => ({ type: "document", text: JSON.stringify(data), data, issues: [], rawMode: false, showHiddenSheets: false });
  harness.listeners.message[0]({ data: message(data) }); harness.runTimers();
  const listeners = harness.document.listeners.keydown.length;
  const sheet = CDBVS.currentSheet();
  CDBVS.selectRenderedCell(sheet, 0, 0); CDBVS.activateRenderedCell(sheet, 0, 0);
  const modal = harness.document.querySelector(".text-modal-overlay");
  const input = modal.querySelector("input");
  input.value = "modal draft"; input.dispatchEvent({ type: "change" });
  const replacement = structuredClone(data); replacement.sheets[0].lines[0].items = [{ value: "external" }];
  const before = harness.posted.length;
  harness.listeners.message[0]({ data: message(replacement) }); harness.runTimers();
  assert.equal(harness.document.querySelector(".text-modal-overlay"), null);
  assert.equal(harness.document.listeners.keydown.length, listeners);
  assert.equal(CDBVS.currentSheet().lines[0].items[0].value, "external");
  assert.match(harness.app.querySelector(".recovered-draft textarea").value, /modal draft/);
  assert.equal(harness.posted.length, before);
});

test("production webview bootstrap creates state, renders, and announces readiness", () => {
  const harness = makeProductionWebview();
  assert.ok(harness.context.CDBVS);
  assert.equal(harness.context.CDBVS.state.data, null);
  assert.equal(Array.from(harness.context.CDBVS.state.issues).length, 0);
  assert.equal(harness.context.CDBVS.TYPE_NAMES[20], "guid");
  assert.equal(harness.posted.length, 1);
  assert.equal(harness.posted[0].type, "ready");
  assert.ok(harness.app.querySelector(".toolbar"));
  assert.ok(harness.app.querySelector(".status"));
});

test("production webview accepts document and error messages through the real bootstrap listener", () => {
  const harness = makeProductionWebview();
  harness.context.dispatchMessage = (data) => {
    harness.listeners.message[0]({ data });
  };
  const documentMessage = {
    type: "document",
    text: "document\ntext",
    data: validData,
    issues: ["warning"],
    rawMode: false,
    showHiddenSheets: true
  };
  harness.context.dispatchMessage(documentMessage);
  assert.equal(harness.context.CDBVS.documentText(), "document\ntext");
  assert.strictEqual(harness.context.CDBVS.documentModel.get(), validData);
  assert.deepEqual(Array.from(harness.context.CDBVS.documentIssues()), ["warning"]);
  assert.equal(harness.context.CDBVS.state.showHiddenSheets, true);
  assert.equal(harness.app.querySelector(".status").textContent, "warning");

  let renderCount = 0;
  const render = harness.context.CDBVS.render;
  harness.context.CDBVS.render = () => { renderCount += 1; render(); };
  harness.context.dispatchMessage(Object.assign({}, documentMessage, { text: "document\r\ntext" }));
  assert.equal(renderCount, 0);

  harness.context.dispatchMessage({ type: "error", message: "Could not save" });
  const status = harness.app.querySelector(".status");
  assert.equal(status.textContent, "Could not save");
  assert.equal(status.className, "status error");

  const before = harness.posted.length;
  harness.context.dispatchMessage({ type: "unknown" });
  assert.equal(harness.posted.length, before);
});

test("webview update scheduling is debounced, serializes the document, and flushes on unload", () => {
  const harness = makeProductionWebview();
  harness.context.CDBVS.setDocument({
    type: "document",
    text: "",
    data: validData,
    issues: [],
    rawMode: false,
    showHiddenSheets: false
  });
  harness.posted.length = 0;
  harness.context.CDBVS.scheduleUpdate(100);
  harness.context.CDBVS.scheduleUpdate(10);
  assert.deepEqual(harness.posted, []);
  harness.runTimers();
  assert.equal(harness.posted.length, 1);
  assert.equal(harness.posted[0].type, "update");
  assert.equal(harness.posted[0].baseText, "");
  assert.deepEqual(JSON.parse(harness.posted[0].text), validData);
  assert.equal(harness.context.CDBVS.documentText(), harness.posted[0].text);

  harness.posted.length = 0;
  harness.listeners.beforeunload[0]({});
  assert.equal(harness.posted.length, 1);
  assert.equal(harness.posted[0].type, "update");

  harness.context.CDBVS.state.data = null;
  harness.posted.length = 0;
  harness.context.CDBVS.sendUpdate();
  assert.deepEqual(harness.posted, []);
});

test("webview save requests and document replacement use the host protocol", () => {
  const harness = makeProductionWebview();
  harness.posted.length = 0;
  harness.context.CDBVS.requestSave();
  assert.equal(harness.posted.length, 1);
  assert.equal(harness.posted[0].type, "save");
  assert.equal(harness.posted[0].expectedText, harness.context.CDBVS.documentText());

  harness.context.CDBVS.setDocument({
    type: "document",
    text: "raw",
    data: null,
    issues: ["Invalid JSON"],
    rawMode: true,
    showHiddenSheets: false
  });
  assert.equal(harness.context.CDBVS.documentModel.get(), null);
  assert.equal(harness.context.CDBVS.state.rawMode, true);
  assert.deepEqual(Array.from(harness.context.CDBVS.documentIssues()), ["Invalid JSON"]);
});
