const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createWebviewHarness, loadScript } = require("./helpers/webviewHarness");
const { FakeDocument } = require("./helpers/fakeDom");

function sheet(name = "Players") {
  return { name, columns: [], lines: [], separators: [], props: {} };
}

function click(element) {
  assert.ok(element, "expected a button");
  element.dispatchEvent({ type: "click" });
}

function dispatchBubbling(element, type, options = {}) {
  const event = Object.assign({
    type,
    target: element,
    preventDefault() {},
    stopPropagation() { this.cancelBubble = true; }
  }, options);
  let current = element;
  while (current && !event.cancelBubble) {
    current.dispatchEvent(event);
    current = current.parentNode;
  }
  return event;
}

function buttonByText(root, text) {
  return root.querySelectorAll("button").find((button) => button.textContent === text);
}

test("document, sheet-state, and view-state models keep their boundaries", () => {
  const target = sheet();
  target.columns = [{ name: "name", typeStr: "1" }];
  target.lines = [{ name: "Alice" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });

  assert.strictEqual(harness.CDBVS.documentModel.get(), harness.state.data);
  assert.strictEqual(harness.CDBVS.documentModel.sheets()[0], target);
  assert.equal(harness.CDBVS.sheetState.getActiveIndex(), 0);
  assert.strictEqual(harness.CDBVS.sheetViewModel.currentSheet(), target);

  harness.CDBVS.sheetState.setFilters(target.name, { name: { value: "Alice" } });
  harness.CDBVS.viewState.setFilter("Alice");
  assert.equal(harness.CDBVS.sheetViewModel.rowsForView(target).length, 1);
  assert.equal(harness.CDBVS.documentModel.get().sheets[0].lines[0].name, "Alice");
  assert.equal(harness.CDBVS.viewState.isRawMode(), false);
});

test("internal composition uses explicit services and capabilities", () => {
  const target = sheet("Players");
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });

  assert.strictEqual(harness.CDBVS.services.document, harness.CDBVS.documentModel);
  assert.strictEqual(harness.CDBVS.services.sheetView, harness.CDBVS.sheetViewModel);
  assert.strictEqual(typeof harness.CDBVS.services.document.operations.sheets.create, "function");
  assert.strictEqual(typeof harness.CDBVS.services.document.operations.columns.applyEdit, "function");
  assert.strictEqual(typeof harness.CDBVS.services.document.operations.rows.insert, "function");
  assert.strictEqual(harness.CDBVS.services.sheetState.view, harness.CDBVS.sheetState.view);
  assert.strictEqual(harness.CDBVS.services.sheetState.selection, harness.CDBVS.sheetState.selection);
  assert.strictEqual(harness.CDBVS.services.sheetState.lists, harness.CDBVS.sheetState.lists);
  assert.equal(typeof harness.CDBVS.services.application.sheetActions.moveSheet, "function");
  assert.equal(typeof harness.CDBVS.services.application.columnActions.applyColumnEdit, "function");
  assert.equal(typeof harness.CDBVS.services.application.rowActions.insertRow, "function");
  assert.equal(typeof harness.CDBVS.services.application.documentActions.moveSelectedCell, "function");
  assert.equal(typeof harness.CDBVS.services.application.clipboardActions.copySelectedRow, "function");
  assert.strictEqual(harness.CDBVS.capabilities.cells.renderListCell, harness.CDBVS.renderListCell);
  assert.strictEqual(harness.CDBVS.capabilities.table.renderCell, harness.CDBVS.renderTableCell);
  assert.strictEqual(harness.CDBVS.capabilities.views.renderTable, harness.CDBVS.renderTable);
});

test("new sheet modal creates a sheet only after Save", () => {
  const harness = createWebviewHarness({ customTypes: [], sheets: [sheet()] });
  harness.CDBVS.openNewSheetEditor();
  const overlay = harness.document.querySelector(".text-modal-overlay");
  const input = overlay.querySelector(".sheet-modal input");
  input.value = "  Items ";
  click(buttonByText(overlay, "Create sheet"));

  assert.deepEqual(harness.state.data.sheets.map((item) => item.name), ["Players", "Items"]);
  assert.equal(harness.state.sheetIndex, 1);
  assert.equal(harness.updates.length, 1);
  assert.equal(harness.document.querySelector(".text-modal-overlay"), null);
});

test("new sheet modal rejects duplicate names without mutating the document", () => {
  const harness = createWebviewHarness({ customTypes: [], sheets: [sheet()] });
  harness.CDBVS.openNewSheetEditor();
  const overlay = harness.document.querySelector(".text-modal-overlay");
  overlay.querySelector(".sheet-modal input").value = "Players";
  click(buttonByText(overlay, "Create sheet"));

  assert.equal(harness.state.data.sheets.length, 1);
  assert.match(overlay.querySelector(".column-form-error").textContent, /already exists/);
  assert.equal(harness.updates.length, 0);
});

test("add column delegates to the in-editor column editor and never calls prompt", () => {
  const harness = createWebviewHarness({ customTypes: [], sheets: [sheet()] });
  const calls = [];
  harness.CDBVS.openNewColumnEditor = (target, index) => calls.push({ target, index });
  const target = harness.state.data.sheets[0];

  assert.equal(harness.CDBVS.addColumn(target), true);
  assert.deepEqual(calls, [{ target, index: 0 }]);
  assert.deepEqual(target.columns, []);
});

test("new column editor saves schema and row-safe defaults through its modal", () => {
  const harness = createWebviewHarness({ customTypes: [], sheets: [sheet()] });
  const target = harness.state.data.sheets[0];
  harness.CDBVS.openNewColumnEditor(target, 0);
  const overlay = harness.document.querySelector(".text-modal-overlay");
  const inputs = overlay.querySelectorAll(".column-modal input");
  inputs[0].value = "title";
  click(buttonByText(overlay, "Save"));

  assert.deepEqual(target.columns.map((column) => ({ name: column.name, typeStr: column.typeStr, opt: column.opt })), [{ name: "title", typeStr: "1", opt: true }]);
  assert.equal(harness.updates.length, 1);
});

test("column editor stays compact and preserves advanced metadata", () => {
  const target = sheet();
  const column = {
    name: "title",
    typeStr: "1",
    opt: false,
    kind: "script",
    scope: 2,
    documentation: "Shown in the game UI",
    customFlag: true,
  };
  target.columns = [column];
  target.lines = [{ title: "Hello" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });

  harness.CDBVS.openColumnEditor(target, column, 0, false);
  const overlay = harness.document.querySelector(".text-modal-overlay");

  assert.ok(overlay.querySelector("select"));
  assert.equal(overlay.querySelector(".column-extra-input"), null);
  assert.equal(overlay.querySelector("textarea"), null);
  assert.equal(overlay.textContent.includes("Advanced properties"), false);
  assert.equal(overlay.textContent.includes("Documentation"), false);

  click(buttonByText(overlay, "Save"));

  assert.equal(column.kind, "script");
  assert.equal(column.scope, 2);
  assert.equal(column.documentation, "Shown in the game UI");
  assert.equal(column.customFlag, true);
});

test("row deletion uses the in-editor confirmation dialog", () => {
  const target = sheet();
  target.lines = [{ title: "keep" }, { title: "remove" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  assert.equal(harness.CDBVS.deleteRow(target, 1), true);
  const overlay = harness.document.querySelector(".confirm-modal");
  assert.match(overlay.textContent, /Delete row 2/);
  assert.equal(target.lines.length, 2);
  click(buttonByText(overlay, "Delete row"));

  assert.deepEqual(target.lines, [{ title: "keep" }]);
  assert.equal(harness.updates.length, 1);
});

test("shared confirmation modal cancels without invoking its action", () => {
  const harness = createWebviewHarness({ customTypes: [], sheets: [sheet()] });
  let confirmed = false;
  harness.CDBVS.openConfirmDialog({ title: "Danger", message: "Proceed?", onConfirm: () => { confirmed = true; } });
  const overlay = harness.document.querySelector(".confirm-modal");
  click(buttonByText(overlay, "Cancel"));
  assert.equal(confirmed, false);
  assert.equal(harness.document.querySelector(".confirm-modal"), null);
});

test("focused text edits synchronize before save without waiting for blur", () => {
  const target = sheet("Players");
  target.columns = [{ name: "title", typeStr: "1" }];
  target.lines = [{ title: "initial" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  loadScript(harness.context, "EditorCells.js");
  const cell = harness.document.createElement("td");
  harness.CDBVS.makeCellEditor(cell, target.lines[0], target.columns[0], { sheet: target, rowIndex: 0, path: "Players/0" });
  const input = cell.querySelector("input");

  input.value = "saved while focused";
  input.dispatchEvent({ type: "input" });

  assert.equal(target.lines[0].title, "saved while focused");
  assert.equal(harness.updates.length, 1);
});

test("blank editors and cell clearing serialize null instead of omission or defaults", () => {
  const target = sheet("Players");
  const refs = sheet("Targets");
  refs.columns = [{ name: "id", typeStr: "0" }];
  refs.lines = [{ id: "target-1" }];
  target.columns = [
    { name: "title", typeStr: "1", opt: true },
    { name: "target", typeStr: "6:Targets" },
    { name: "score", typeStr: "3" }
  ];
  target.lines = [{ title: "text", target: "target-1", score: 10 }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target, refs] });
  loadScript(harness.context, "EditorCells.js");

  const row = target.lines[0];
  const titleCell = harness.document.createElement("td");
  harness.CDBVS.makeCellEditor(titleCell, row, target.columns[0], { sheet: target, rowIndex: 0, path: "Players/0" });
  const titleInput = titleCell.querySelector("input");
  titleInput.value = "";
  titleInput.dispatchEvent({ type: "input" });

  const referenceCell = harness.document.createElement("td");
  harness.CDBVS.makeCellEditor(referenceCell, row, target.columns[1], { sheet: target, rowIndex: 0, path: "Players/0" });
  const referenceInput = referenceCell.querySelector("select");
  referenceInput.value = "";
  referenceInput.dispatchEvent({ type: "change" });

  const numberCell = harness.document.createElement("td");
  harness.CDBVS.makeCellEditor(numberCell, row, target.columns[2], { sheet: target, rowIndex: 0, path: "Players/0" });
  const numberInput = numberCell.querySelector("input");
  numberInput.value = "";
  numberInput.dispatchEvent({ type: "change" });

  assert.deepEqual(row, { title: null, target: null, score: null });

  harness.CDBVS.selectCell(target, 0, 0);
  harness.CDBVS.deleteSelectedCell(target);
  assert.equal(row.title, null);

  row.title = "cut me";
  harness.CDBVS.copySelectedRow(target, true);
  assert.equal(row.title, null);
});

test("numeric editors reject malformed values instead of coercing them to zero", () => {
  const target = sheet("Players");
  target.columns = [{ name: "score", typeStr: "3" }, { name: "ratio", typeStr: "4" }];
  target.lines = [{ score: 7, ratio: 1.5 }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  loadScript(harness.context, "EditorCells.js");

  const integerCell = harness.document.createElement("td");
  harness.CDBVS.makeCellEditor(integerCell, target.lines[0], target.columns[0], { sheet: target, rowIndex: 0, path: "Players/0" });
  const integerInput = integerCell.querySelector("input");
  integerInput.value = "12oops";
  integerInput.dispatchEvent({ type: "change" });

  const floatCell = harness.document.createElement("td");
  harness.CDBVS.makeCellEditor(floatCell, target.lines[0], target.columns[1], { sheet: target, rowIndex: 0, path: "Players/0" });
  const floatInput = floatCell.querySelector("input");
  floatInput.value = "not-a-number";
  floatInput.dispatchEvent({ type: "change" });

  assert.deepEqual(target.lines[0], { score: 7, ratio: 1.5 });
  assert.equal(harness.statuses.at(-1).error, true);
});

test("boolean cells toggle on second click and Enter without entering edit mode", () => {
  const target = sheet("Players");
  target.columns = [{ name: "label", typeStr: "1" }, { name: "enabled", typeStr: "2" }];
  target.lines = [{ label: "Ada", enabled: false }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.context.innerWidth = 1200;
  harness.context.innerHeight = 800;
  harness.CDBVS.app = harness.document.createElement("div");
  harness.CDBVS.rememberViewport = () => {};
  harness.CDBVS.restoreViewport = () => {};
  loadScript(harness.context, "EditorCells.js");
  loadScript(harness.context, "EditorView.js");
  harness.CDBVS.render();

  const cells = harness.CDBVS.app.querySelectorAll("td");
  const labelCell = cells.find((cell) => cell.dataset.columnIndex === "0");
  const boolCell = cells.find((cell) => cell.dataset.columnIndex === "1");
  labelCell.dispatchEvent({ type: "mousedown", target: labelCell, button: 0, preventDefault() {} });
  labelCell.dispatchEvent({ type: "click", target: labelCell });
  harness.document.dispatchEvent({ type: "keydown", key: "ArrowRight", target: labelCell, preventDefault() {} });
  assert.equal(harness.CDBVS.selectedCell(target).columnIndex, 1);
  assert.equal(target.lines[0].enabled, false);

  harness.document.dispatchEvent({ type: "keydown", key: "Enter", target: boolCell, preventDefault() {} });
  assert.equal(target.lines[0].enabled, true);
  assert.equal(harness.CDBVS.activeCell(target), null);

  boolCell.dispatchEvent({ type: "mousedown", target: boolCell, button: 0, preventDefault() {} });
  boolCell.dispatchEvent({ type: "click", target: boolCell });
  assert.equal(target.lines[0].enabled, false);
  assert.equal(harness.CDBVS.activeCell(target), null);
});

test("Ctrl/Cmd+S commits a focused cell and requests a document save", () => {
  const target = sheet("Players");
  target.columns = [{ name: "title", typeStr: "1" }];
  target.lines = [{ title: "initial" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.context.innerWidth = 1200;
  harness.context.innerHeight = 800;
  harness.context.Event = class { constructor(type) { this.type = type; } };
  harness.context.Event = class {
    constructor(type) { this.type = type; }
  };
  harness.CDBVS.app = harness.document.createElement("div");
  harness.CDBVS.rememberViewport = () => {};
  harness.CDBVS.restoreViewport = () => {};
  loadScript(harness.context, "EditorCells.js");
  loadScript(harness.context, "EditorView.js");
  let saveRequests = 0;
  harness.CDBVS.requestSave = () => { saveRequests += 1; };
  harness.CDBVS.render();
  const input = harness.CDBVS.app.querySelector("td input");
  input.value = "saved";
  let prevented = false;
  harness.document.dispatchEvent({
    type: "keydown",
    key: "s",
    ctrlKey: true,
    target: input,
    preventDefault() { prevented = true; }
  });

  assert.equal(prevented, true);
  assert.equal(saveRequests, 1);
  assert.equal(target.lines[0].title, "saved");
  assert.ok(harness.updates.length >= 1);
});

test("arrow navigation updates selection in place without rebuilding the sheet", () => {
  const target = sheet("Players");
  target.columns = [{ name: "a", typeStr: "1" }, { name: "b", typeStr: "1" }];
  target.lines = [{ a: "A", b: "B" }, { a: "C", b: "D" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.context.innerWidth = 1200;
  harness.context.innerHeight = 800;
  harness.context.Event = class { constructor(type) { this.type = type; } };
  harness.CDBVS.app = harness.document.createElement("div");
  harness.CDBVS.rememberViewport = () => {};
  harness.CDBVS.restoreViewport = () => {};
  loadScript(harness.context, "EditorCells.js");
  loadScript(harness.context, "EditorView.js");
  let renderCount = 0;
  const render = harness.CDBVS.render;
  harness.CDBVS.render = () => { renderCount += 1; render(); };
  render();
  renderCount = 0;

  const firstCell = harness.CDBVS.app.querySelectorAll("td").find((cell) => cell.dataset.columnIndex === "0");
  firstCell.dispatchEvent({ type: "click" });
  assert.equal(harness.document.activeElement, firstCell);
  const firstInput = firstCell.querySelector("input");
  const keydown = (key) => {
    let prevented = false;
    harness.document.dispatchEvent({
      type: "keydown",
      key,
      target: firstInput,
      preventDefault() { prevented = true; }
    });
    assert.equal(prevented, true);
  };

  keydown("ArrowRight");
  assert.equal(harness.CDBVS.selectedCell(target).rowIndex, 0);
  assert.equal(harness.CDBVS.selectedCell(target).columnIndex, 1);
  assert.equal(renderCount, 0);
  assert.equal(harness.CDBVS.app.querySelectorAll("td").filter((cell) => cell.classList.contains("cell-selected")).length, 1);
  assert.equal(harness.updates.length, 0);

  keydown("ArrowDown");
  keydown("ArrowLeft");
  keydown("ArrowUp");
  assert.equal(harness.CDBVS.selectedCell(target).rowIndex, 0);
  assert.equal(harness.CDBVS.selectedCell(target).columnIndex, 0);
  assert.equal(renderCount, 0);
  assert.equal(harness.updates.length, 0);
});

test("arrow navigation commits a dirty cell without rebuilding the sheet", () => {
  const target = sheet("Players");
  target.columns = [{ name: "a", typeStr: "1" }, { name: "b", typeStr: "1" }];
  target.lines = [{ a: "A", b: "B" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.context.innerWidth = 1200;
  harness.context.innerHeight = 800;
  harness.context.Event = class { constructor(type) { this.type = type; } };
  harness.CDBVS.app = harness.document.createElement("div");
  harness.CDBVS.rememberViewport = () => {};
  harness.CDBVS.restoreViewport = () => {};
  loadScript(harness.context, "EditorCells.js");
  loadScript(harness.context, "EditorView.js");
  let renderCount = 0;
  const render = harness.CDBVS.render;
  harness.CDBVS.render = () => { renderCount += 1; render(); };
  render();
  renderCount = 0;

  const firstCell = harness.CDBVS.app.querySelectorAll("td").find((cell) => cell.dataset.columnIndex === "0");
  firstCell.dispatchEvent({ type: "click" });
  const input = firstCell.querySelector("input");
  input.value = "edited";
  input.dispatchEvent({ type: "input" });
  harness.document.dispatchEvent({ type: "keydown", key: "ArrowRight", target: input, preventDefault() {} });

  assert.equal(target.lines[0].a, "edited");
  assert.equal(harness.CDBVS.selectedCell(target).columnIndex, 1);
  assert.equal(renderCount, 0);
});

test("cells select first and activate on the second click or Enter", () => {
  const target = sheet("Players");
  target.columns = [{ name: "title", typeStr: "1" }, { name: "kind", typeStr: "5:Basic,Advanced,Expert" }];
  target.lines = [{ title: "A", kind: 0 }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.context.innerWidth = 1200;
  harness.context.innerHeight = 800;
  harness.context.Event = class { constructor(type) { this.type = type; } };
  harness.CDBVS.app = harness.document.createElement("div");
  harness.CDBVS.rememberViewport = () => {};
  harness.CDBVS.restoreViewport = () => {};
  loadScript(harness.context, "EditorCells.js");
  loadScript(harness.context, "EditorView.js");
  harness.CDBVS.render();

  const titleCell = harness.CDBVS.app.querySelectorAll("td").find((cell) => cell.dataset.columnIndex === "0");
  const titleInput = titleCell.querySelector("input");
  titleCell.dispatchEvent({ type: "mousedown", button: 0, target: titleInput, preventDefault() {} });
  titleCell.dispatchEvent({ type: "click", target: titleInput, preventDefault() {}, stopPropagation() {} });
  assert.equal(harness.CDBVS.activeCell(target), null);
  assert.equal(harness.document.activeElement, titleCell);

  titleCell.dispatchEvent({ type: "click" });
  assert.equal(harness.CDBVS.activeCell(target).columnIndex, 0);
  assert.equal(harness.document.activeElement, titleCell.querySelector("input"));

  const kindCell = harness.CDBVS.app.querySelectorAll("td").find((cell) => cell.dataset.columnIndex === "1");
  const pendingUpdates = harness.updates.length;
  titleInput.value = "edited";
  titleInput.dispatchEvent({ type: "input" });
  assert.equal(harness.updates.length, pendingUpdates);
  assert.equal(harness.CDBVS.activeCell(target).columnIndex, 0);
  kindCell.dispatchEvent({ type: "click" });
  assert.equal(target.lines[0].title, "edited");
  assert.equal(harness.CDBVS.activeCell(target), null);
  assert.equal(harness.CDBVS.selectedCell(target).columnIndex, 1);

  titleCell.dispatchEvent({ type: "click" });
  harness.document.dispatchEvent({ type: "keydown", key: "Enter", target: harness.document, preventDefault() {} });
  assert.equal(harness.CDBVS.activeCell(target).columnIndex, 0);
  harness.document.dispatchEvent({ type: "keydown", key: "Enter", target: titleInput, preventDefault() {} });
  assert.equal(harness.CDBVS.activeCell(target), null);
  assert.equal(harness.document.activeElement, titleCell);

  harness.document.dispatchEvent({ type: "keydown", key: "Enter", target: harness.document, preventDefault() {} });
  assert.equal(harness.CDBVS.activeCell(target).columnIndex, 0);

  let prevented = false;
  harness.document.dispatchEvent({
    type: "keydown",
    key: "ArrowRight",
    target: titleCell.querySelector("input"),
    preventDefault() { prevented = true; }
  });
  assert.equal(prevented, false);
  assert.equal(harness.CDBVS.selectedCell(target).columnIndex, 0);
  assert.equal(harness.CDBVS.activeCell(target).columnIndex, 0);

  titleCell.dispatchEvent({ type: "click" });
  harness.document.dispatchEvent({ type: "keydown", key: "Enter", target: harness.document, preventDefault() {} });
  harness.document.dispatchEvent({ type: "keydown", key: "Escape", target: titleCell.querySelector("input"), preventDefault() {} });
  assert.equal(harness.CDBVS.activeCell(target), null);

  kindCell.dispatchEvent({ type: "click" });
  const select = kindCell.querySelector("select");
  harness.document.dispatchEvent({ type: "keydown", key: "Enter", target: harness.document, preventDefault() {} });
  const menu = harness.document.querySelector(".cell-select-menu");
  assert.ok(menu);
  const filter = menu.querySelector(".cell-select-filter");
  assert.ok(filter);
  assert.equal(harness.document.activeElement, filter);
  filter.value = "advanced";
  filter.dispatchEvent({ type: "input" });
  const options = menu.querySelectorAll(".cell-select-option");
  assert.equal(options[0].style.display, "none");
  assert.equal(options[1].style.display, "");
  options[1].dispatchEvent({ type: "click", preventDefault() {} });
  assert.equal(harness.document.querySelector(".cell-select-menu"), null);
  assert.equal(select.value, "1");
  assert.equal(harness.CDBVS.activeCell(target), null);

  harness.document.dispatchEvent({ type: "keydown", key: "Enter", target: select, preventDefault() {} });
  const currentMenu = harness.document.querySelector(".cell-select-menu");
  assert.ok(currentMenu);
  assert.equal(currentMenu.querySelectorAll(".cell-select-option").length, 3);
  assert.equal(harness.CDBVS.activeCell(target).columnIndex, 1);
  select.getBoundingClientRect = () => ({ left: 240, bottom: 176, width: 205 });
  harness.document.dispatchEvent({ type: "scroll", target: harness.document });
  assert.equal(currentMenu.style.left, "240px");
  assert.equal(currentMenu.style.top, "176px");
  assert.equal(currentMenu.style.minWidth, "205px");
  const menuOptions = currentMenu.querySelectorAll(".cell-select-option");
  let scrollCalls = 0;
  menuOptions[2].scrollIntoView = () => { scrollCalls += 1; };

  let arrowPrevented = false;
  harness.document.dispatchEvent({
    type: "keydown",
    key: "ArrowDown",
    target: select,
    preventDefault() { arrowPrevented = true; }
  });
  assert.equal(arrowPrevented, true);
  assert.equal(select.value, "2");
  assert.equal(scrollCalls, 1);
  assert.equal(harness.CDBVS.selectedCell(target).columnIndex, 1);
  assert.equal(harness.CDBVS.activeCell(target).columnIndex, 1);

  let secondArrowPrevented = false;
  harness.document.dispatchEvent({
    type: "keydown",
    key: "ArrowUp",
    target: harness.document,
    preventDefault() { secondArrowPrevented = true; }
  });
  assert.equal(secondArrowPrevented, true);
  assert.equal(select.value, "1");
  assert.equal(harness.CDBVS.selectedCell(target).columnIndex, 1);
  assert.equal(harness.CDBVS.activeCell(target).columnIndex, 1);

  harness.document.dispatchEvent({ type: "keydown", key: "Enter", target: select, preventDefault() {} });
  assert.equal(harness.document.querySelector(".cell-select-menu"), null);
  assert.equal(harness.CDBVS.activeCell(target), null);
  assert.equal(target.lines[0].kind, 1);

  kindCell.dispatchEvent({ type: "click", target: kindCell });
  assert.ok(harness.document.querySelector(".cell-select-menu"));
  kindCell.dispatchEvent({ type: "mousedown", button: 0, target: kindCell, preventDefault() {} });
  assert.equal(harness.document.querySelector(".cell-select-menu"), null);
  assert.equal(harness.CDBVS.activeCell(target), null);
});

test("Tab exits the current editor and activates the next cell", () => {
  const target = sheet("Players");
  target.columns = [{ name: "first", typeStr: "1" }, { name: "second", typeStr: "1" }];
  target.lines = [{ first: "A", second: "B" }, { first: "C", second: "D" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.context.innerWidth = 1200;
  harness.context.innerHeight = 800;
  harness.context.Event = class { constructor(type) { this.type = type; } };
  harness.CDBVS.app = harness.document.createElement("div");
  harness.CDBVS.rememberViewport = () => {};
  harness.CDBVS.restoreViewport = () => {};
  loadScript(harness.context, "EditorCells.js");
  loadScript(harness.context, "EditorView.js");
  harness.CDBVS.render();

  const firstRowCells = harness.CDBVS.app.querySelectorAll("tr")[1].children;
  const currentCell = firstRowCells[1];
  const nextCell = firstRowCells[2];
  currentCell.dispatchEvent({ type: "click" });
  currentCell.dispatchEvent({ type: "click" });
  const currentInput = currentCell.querySelector("input");
  assert.equal(harness.CDBVS.activeCell(target).columnIndex, 0);

  let prevented = false;
  harness.document.dispatchEvent({
    type: "keydown",
    key: "Tab",
    target: currentInput,
    preventDefault() { prevented = true; }
  });

  assert.equal(prevented, true);
  assert.equal(harness.CDBVS.selectedCell(target).columnIndex, 1);
  assert.equal(harness.CDBVS.activeCell(target).columnIndex, 1);
  assert.equal(harness.document.activeElement, nextCell.querySelector("input"));
  assert.equal(currentCell.querySelector("input"), currentInput);

  harness.document.dispatchEvent({
    type: "keydown",
    key: "Tab",
    target: nextCell.querySelector("input"),
    preventDefault() {}
  });
  assert.equal(harness.CDBVS.activeCell(target).rowIndex, 1);
  assert.equal(harness.CDBVS.activeCell(target).columnIndex, 0);

  const previousCell = harness.CDBVS.app.querySelectorAll("tr")[1].children[2];
  harness.document.dispatchEvent({
    type: "keydown",
    key: "Tab",
    shiftKey: true,
    target: harness.document.activeElement,
    preventDefault() {}
  });
  assert.equal(harness.CDBVS.activeCell(target).rowIndex, 0);
  assert.equal(harness.CDBVS.activeCell(target).columnIndex, 1);
  assert.equal(harness.document.activeElement, previousCell.querySelector("input"));
});

test("focused numeric drafts survive rapid input when active state is stale", () => {
  const target = sheet("Players");
  target.columns = [{ name: "count", typeStr: "3" }];
  target.lines = [{ count: 0 }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.context.innerWidth = 1200;
  harness.context.innerHeight = 800;
  harness.context.Event = class { constructor(type) { this.type = type; } };
  harness.CDBVS.app = harness.document.createElement("div");
  harness.CDBVS.rememberViewport = () => {};
  harness.CDBVS.restoreViewport = () => {};
  loadScript(harness.context, "EditorCells.js");
  loadScript(harness.context, "EditorView.js");
  harness.CDBVS.render();

  const cell = harness.CDBVS.app.querySelectorAll("td").find((item) => item.dataset.columnIndex === "0");
  cell.dispatchEvent({ type: "click" });
  cell.dispatchEvent({ type: "click" });
  const input = cell.querySelector("input");
  harness.state.activeCells = {};
  const scheduledBefore = harness.updates.length;
  ["1", "12", "123", "1234"].forEach((value) => {
    input.value = value;
    input.dispatchEvent({ type: "input", target: input });
  });
  assert.equal(target.lines[0].count, 1234);
  assert.equal(harness.updates.length, scheduledBefore);

  harness.document.dispatchEvent({ type: "keydown", key: "Enter", target: input, preventDefault() {} });
  assert.equal(harness.CDBVS.activeCell(target), null);
  assert.equal(target.lines[0].count, 1234);
});

test("arrow keys select an initial cell before any cell has been selected", () => {
  const target = sheet("Players");
  target.columns = [{ name: "a", typeStr: "1" }, { name: "b", typeStr: "1" }];
  target.lines = [{ a: "A", b: "B" }, { a: "C", b: "D" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.CDBVS.app = harness.document.createElement("div");
  harness.CDBVS.rememberViewport = () => {};
  harness.CDBVS.restoreViewport = () => {};
  loadScript(harness.context, "EditorCells.js");
  loadScript(harness.context, "EditorView.js");
  harness.CDBVS.render();

  let prevented = false;
  harness.document.dispatchEvent({
    type: "keydown",
    key: "ArrowRight",
    target: harness.document,
    preventDefault() { prevented = true; }
  });

  assert.equal(prevented, true);
  assert.equal(harness.CDBVS.selectedCell(target).rowIndex, 0);
  assert.equal(harness.CDBVS.selectedCell(target).columnIndex, 0);
  assert.equal(harness.CDBVS.activeCell(target), null);
});

test("sheet rendering paints a loading state before progressive rows", () => {
  const target = sheet("Players");
  target.columns = [{ name: "id", typeStr: "0" }, { name: "name", typeStr: "1" }];
  target.lines = Array.from({ length: 20 }, (_, index) => ({ id: `id-${index}`, name: `Name ${index}` }));
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.CDBVS.app = harness.document.createElement("div");
  harness.CDBVS.rememberViewport = () => {};
  harness.CDBVS.restoreViewport = () => {};
  const timers = [];
  const frames = [];
  harness.context.setTimeout = (callback) => { timers.push(callback); return timers.length - 1; };
  harness.context.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length - 1; };
  loadScript(harness.context, "EditorCells.js");
  loadScript(harness.context, "EditorView.js");

  harness.CDBVS.render();
  assert.ok(harness.CDBVS.app.querySelector(".sheet-loading"));
  assert.equal(harness.CDBVS.app.querySelectorAll("tr").filter((row) => row.dataset.rowIndex !== undefined).length, 0);
  assert.equal(timers.length, 1);

  timers.shift()();
  while (frames.length) frames.shift()();
  assert.equal(harness.CDBVS.app.querySelector(".sheet-loading"), null);
  assert.equal(harness.CDBVS.app.querySelectorAll("tr").filter((row) => row.dataset.rowIndex !== undefined).length, 20);
});

test("table choice editors defer large option and flag control construction", () => {
  const target = sheet("Players");
  const refs = sheet("Targets");
  target.columns = [
    { name: "target", typeStr: "6:Targets" },
    { name: "kind", typeStr: "5:Basic,Advanced" },
    { name: "flags", typeStr: "10:Visible,Locked" }
  ];
  target.lines = [{ target: "target-1", kind: 1, flags: 3 }];
  refs.columns = [{ name: "id", typeStr: "0" }];
  refs.lines = Array.from({ length: 100 }, (_, index) => ({ id: `target-${index}` }));
  const harness = createWebviewHarness({ customTypes: [], sheets: [target, refs] });
  harness.CDBVS.app = harness.document.createElement("div");
  harness.CDBVS.rememberViewport = () => {};
  harness.CDBVS.restoreViewport = () => {};
  loadScript(harness.context, "EditorCells.js");
  loadScript(harness.context, "EditorView.js");
  harness.CDBVS.render();

  const cells = harness.CDBVS.app.querySelectorAll("td").filter((cell) => cell.dataset.columnIndex !== undefined);
  assert.equal(cells[0].querySelectorAll("option").length, 2);
  assert.equal(cells[1].querySelectorAll("option").length, 1);
  assert.equal(cells[2].querySelectorAll("input").length, 0);
  assert.ok(cells[2].querySelector(".flags-preview"));

  harness.CDBVS.selectCell(target, 0, 0);
  harness.CDBVS.activateRenderedCell(target, 0, 0, { target: cells[0] });
  assert.equal(cells[0].querySelectorAll("option").length, 101);
  harness.CDBVS.selectCell(target, 0, 2);
  harness.CDBVS.activateRenderedCell(target, 0, 2, { target: cells[2] });
  assert.equal(cells[2].querySelectorAll("input").length, 2);
});

// Superseded by test/list-modal.test.js: list items no longer render inline.
test.skip("list-cell edits refresh locally instead of rerendering the whole sheet", () => {
  const parent = sheet("Groups");
  const listColumn = { name: "members", typeStr: "8" };
  parent.columns = [listColumn];
  parent.lines = [{ members: [{ name: "Ada" }] }];
  const child = { name: "Groups@members", columns: [{ name: "name", typeStr: "1" }], lines: [], props: {} };
  const harness = createWebviewHarness({ customTypes: [], sheets: [parent, child] });
  loadScript(harness.context, "EditorCells.js");
  const context = { sheet: parent, rowIndex: 0, path: "Groups/0" };
  const key = harness.CDBVS.listKey(context, listColumn);
  harness.state.expandedLists.add(key);
  const cell = harness.document.createElement("td");
  harness.CDBVS.renderListCell(cell, parent.lines[0], listColumn, context, child);
  const input = cell.querySelector(".nested-list-item input");
  input.value = "Grace";
  input.dispatchEvent({ type: "change" });

  assert.equal(parent.lines[0].members[0].name, "Grace");
  assert.equal(harness.renders.length, 0);
  assert.equal(harness.updates.length, 1);
});

test.skip("nested list items show selection and delete immediately", () => {
  const parent = sheet("Groups");
  const listColumn = { name: "members", typeStr: "8" };
  parent.columns = [listColumn];
  parent.lines = [{ members: [{ name: "Ada" }, { name: "Grace" }] }];
  const child = { name: "Groups@members", columns: [{ name: "name", typeStr: "1" }], lines: [], props: {} };
  const harness = createWebviewHarness({ customTypes: [], sheets: [parent, child] });
  loadScript(harness.context, "EditorCells.js");
  const context = { sheet: parent, rowIndex: 0, path: "Groups/0" };
  const key = harness.CDBVS.listKey(context, listColumn);
  harness.state.expandedLists.add(key);
  harness.state.selectedListRows[key] = 0;
  const cell = harness.document.createElement("td");
  harness.CDBVS.renderListCell(cell, parent.lines[0], listColumn, context, child);

  const rows = cell.querySelectorAll(".nested-table tbody tr");
  assert.equal(rows[0].classList.contains("list-item-selected"), true);
  click(rows[1].querySelector(".row-select"));
  assert.equal(harness.state.selectedListRows[key], 1);
  assert.equal(rows[1].classList.contains("list-item-selected"), true);
  assert.equal(rows[0].classList.contains("list-item-selected"), false);
  assert.equal(cell.querySelector(".nested-delete-item").disabled, false);

  click(cell.querySelector(".nested-delete-item"));

  assert.equal(harness.document.querySelector(".confirm-modal"), null);
  assert.deepEqual(parent.lines[0].members, [{ name: "Ada" }]);
  assert.equal(harness.updates.length, 1);
});

test.skip("Delete key removes the selected nested list item", () => {
  const parent = sheet("Groups");
  const listColumn = { name: "members", typeStr: "8" };
  parent.columns = [listColumn];
  parent.lines = [{ members: [{ name: "Ada" }, { name: "Grace" }] }];
  const child = { name: "Groups@members", columns: [{ name: "name", typeStr: "1" }], lines: [], props: {} };
  const harness = createWebviewHarness({ customTypes: [], sheets: [parent, child] });
  loadScript(harness.context, "EditorCells.js");
  const context = { sheet: parent, rowIndex: 0, path: "Groups/0" };
  const key = harness.CDBVS.listKey(context, listColumn);
  harness.state.expandedLists.add(key);
  harness.state.selectedListRows[key] = 0;
  const cell = harness.document.createElement("td");
  harness.CDBVS.renderListCell(cell, parent.lines[0], listColumn, context, child);
  const selectedRow = cell.querySelector(".nested-list-item");

  selectedRow.dispatchEvent({ type: "keydown", key: "Delete", preventDefault() {}, stopPropagation() {} });

  assert.deepEqual(parent.lines[0].members, [{ name: "Grace" }]);
  assert.equal(harness.updates.length, 1);
});

test.skip("nested list items support multi-select and insert after the active item", () => {
  const parent = sheet("Groups");
  const listColumn = { name: "members", typeStr: "8" };
  parent.columns = [listColumn];
  parent.lines = [{ members: [{ name: "Ada" }, { name: "Grace" }, { name: "Lee" }] }];
  const child = { name: "Groups@members", columns: [{ name: "name", typeStr: "1" }], lines: [], props: {} };
  const harness = createWebviewHarness({ customTypes: [], sheets: [parent, child] });
  loadScript(harness.context, "EditorCells.js");
  const context = { sheet: parent, rowIndex: 0, path: "Groups/0" };
  const key = harness.CDBVS.listKey(context, listColumn);
  harness.state.expandedLists.add(key);
  harness.state.selectedListRows[key] = 0;
  const cell = harness.document.createElement("td");
  harness.CDBVS.renderListCell(cell, parent.lines[0], listColumn, context, child);

  const rows = cell.querySelectorAll(".nested-list-item");
  rows[1].querySelector(".row-select").dispatchEvent({ type: "click", ctrlKey: true, stopPropagation() {} });
  assert.deepEqual(Array.from(harness.state.selectedListRows[key]), [0, 1]);
  assert.equal(rows[0].classList.contains("list-item-selected"), true);
  assert.equal(rows[1].classList.contains("list-item-selected"), true);

  click(buttonByText(cell, "Insert Item"));

  assert.equal(parent.lines[0].members.length, 4);
  assert.equal(parent.lines[0].members[2].name, "");
  assert.equal(harness.state.selectedListRows[key], 2);
});

test.skip("deleting multiple selected nested list items removes them together", () => {
  const parent = sheet("Groups");
  const listColumn = { name: "members", typeStr: "8" };
  parent.columns = [listColumn];
  parent.lines = [{ members: [{ name: "Ada" }, { name: "Grace" }, { name: "Lee" }] }];
  const child = { name: "Groups@members", columns: [{ name: "name", typeStr: "1" }], lines: [], props: {} };
  const harness = createWebviewHarness({ customTypes: [], sheets: [parent, child] });
  loadScript(harness.context, "EditorCells.js");
  const context = { sheet: parent, rowIndex: 0, path: "Groups/0" };
  const key = harness.CDBVS.listKey(context, listColumn);
  harness.state.expandedLists.add(key);
  harness.state.selectedListRows[key] = 0;
  const cell = harness.document.createElement("td");
  harness.CDBVS.renderListCell(cell, parent.lines[0], listColumn, context, child);
  const rows = cell.querySelectorAll(".nested-list-item");
  rows[1].querySelector(".row-select").dispatchEvent({ type: "click", ctrlKey: true, stopPropagation() {} });

  click(cell.querySelector(".nested-delete-item"));

  assert.deepEqual(parent.lines[0].members, [{ name: "Lee" }]);
  assert.equal(harness.updates.length, 1);
});

test("webview source contains no native prompt, confirm, or alert calls", () => {
  const mediaRoot = path.join(__dirname, "..", "src", "webview");
  const sources = [];
  const collectSources = (directory) => {
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) collectSources(filename);
      else if (entry.name.endsWith(".ts")) sources.push(fs.readFileSync(filename, "utf8"));
    });
  };
  collectSources(mediaRoot);
  assert.doesNotMatch(sources.join("\n"), /window\.(prompt|confirm|alert)\s*\(/);
});

test("document messages can leave raw recovery mode after a valid update", () => {
  const document = new FakeDocument();
  let messageHandler;
  const context = {
    window: null,
    document,
    console,
    Set,
    Map,
    JSON,
    Date,
    acquireVsCodeApi: () => ({ postMessage() {} }),
    addEventListener(type, handler) { if (type === "message") messageHandler = handler; }
  };
  context.window = context;
  loadScript(context, "EditorRuntime.js");
  context.CDBVS.render = () => {};
  loadScript(context, "Editor.js");

  messageHandler({ data: { type: "document", text: "bad", data: {}, issues: ["invalid"], rawMode: true, showHiddenSheets: false } });
  assert.equal(context.CDBVS.state.rawMode, true);
  messageHandler({ data: { type: "document", text: "good", data: { customTypes: [], sheets: [] }, issues: [], rawMode: false, showHiddenSheets: false } });
  assert.equal(context.CDBVS.state.rawMode, false);
});

test("row mutations clamp indexes and keep separator state aligned", () => {
  const target = sheet();
  target.lines = [{ id: "a" }, { id: "b" }, { id: "c" }];
  target.separators = [{ index: 1, title: "Group" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.state.collapsedSeparators[target.name] = { "1": true };

  harness.CDBVS.insertRow(target, 1, { id: "x" }, false);
  assert.deepEqual(target.lines.map((row) => row.id), ["a", "x", "b", "c"]);
  assert.deepEqual(JSON.parse(JSON.stringify(target.separators)), [{ index: 2, title: "Group" }]);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.state.collapsedSeparators[target.name])), { "2": true });
  assert.equal(harness.CDBVS.deleteRowAt(target, 0), true);
  assert.deepEqual(target.lines.map((row) => row.id), ["x", "b", "c"]);
  assert.deepEqual(JSON.parse(JSON.stringify(target.separators)), [{ index: 1, title: "Group" }]);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.state.collapsedSeparators[target.name])), { "1": true });
  assert.equal(harness.CDBVS.deleteRowAt(target, -1), false);
  assert.equal(target.lines.length, 3);
});

test("deleting a separator row keeps separator titles aligned", () => {
  const target = sheet();
  target.lines = [{ id: "a" }, { id: "b" }, { id: "c" }];
  target.separators = [0, 2];
  target.props.separatorTitles = ["First", "Second"];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });

  assert.equal(harness.CDBVS.deleteRowAt(target, 0), true);
  assert.deepEqual(target.separators, [1]);
  assert.deepEqual(target.props.separatorTitles, ["Second"]);
});

test("nested schema structure is created and removed with list columns", () => {
  const target = sheet("Main");
  target.columns = [{ name: "items", typeStr: "8" }];
  target.lines = [{ items: [{ value: "keep" }] }];
  const other = sheet("Other");
  other.columns = [{ name: "nested", typeStr: "6:Main@items" }];
  other.lines = [{ nested: "value" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target, other] });

  const child = harness.CDBVS.ensureNestedSheet(target, target.columns[0]);
  assert.equal(child.name, "Main@items");
  assert.deepEqual(harness.state.data.sheets.map((item) => item.name), ["Main", "Main@items", "Other"]);
  assert.equal(child.props.hide, true);

  assert.equal(harness.CDBVS.deleteColumnAt(target, 0), true);
  assert.deepEqual(harness.state.data.sheets.map((item) => item.name), ["Main", "Other"]);
  assert.equal(other.columns[0].typeStr, "1");
});

test("rendering malformed nested list items does not rewrite document data", () => {
  const target = sheet("Main");
  const column = { name: "items", typeStr: "8" };
  target.columns = [column];
  target.lines = [{ items: [["malformed"]] }];
  const child = sheet("Main@items");
  child.columns = [{ name: "value", typeStr: "1" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target, child] });
  loadScript(harness.context, "EditorCells.js");
  harness.state.expandedLists.add("Main/0/items");
  const cell = harness.document.createElement("td");
  harness.CDBVS.makeCellEditor(cell, target.lines[0], column, { sheet: target, rowIndex: 0, path: "Main/0" });

  assert.deepEqual(target.lines[0].items, [["malformed"]]);
});

test.skip("vertical arrows enter and traverse expanded list items", () => {
  const target = sheet("Groups");
  const listColumn = { name: "members", typeStr: "8" };
  target.columns = [listColumn];
  target.lines = [{ members: [{ name: "Ada", score: 1 }, { name: "Grace", score: 2 }, { name: "Lee", score: 3 }] }];
  const child = sheet("Groups@members");
  child.columns = [{ name: "name", typeStr: "1" }, { name: "score", typeStr: "3" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target, child] });
  harness.context.innerWidth = 1200;
  harness.context.innerHeight = 800;
  harness.CDBVS.app = harness.document.createElement("div");
  harness.CDBVS.rememberViewport = () => {};
  harness.CDBVS.restoreViewport = () => {};
  harness.state.expandedLists.add("Groups/0/members");
  loadScript(harness.context, "EditorCells.js");
  loadScript(harness.context, "EditorView.js");
  harness.CDBVS.render();

  const listCell = harness.CDBVS.app.querySelectorAll("td").find((cell) => cell.dataset.columnIndex === "0");
  listCell.dispatchEvent({ type: "click" });
  const nestedRows = listCell.querySelectorAll(".nested-list-item");
  const keydown = (key) => {
    let prevented = false;
    harness.document.dispatchEvent({
      type: "keydown",
      key,
      target: harness.document.activeElement || listCell,
      preventDefault() { prevented = true; }
    });
    assert.equal(prevented, true);
  };

  keydown("ArrowDown");
  assert.equal(harness.state.selectedListRows["Groups/0/members"], 0);
  assert.equal(harness.state.selectedListCells["Groups/0/members"].itemIndex, 0);
  assert.equal(harness.state.selectedListCells["Groups/0/members"].columnIndex, 0);
  assert.equal(nestedRows[0].classList.contains("list-item-selected"), true);
  assert.equal(nestedRows[0].children[1].classList.contains("cell-selected"), true);
  assert.equal(harness.document.activeElement, nestedRows[0].children[1]);

  keydown("ArrowDown");
  assert.equal(harness.state.selectedListRows["Groups/0/members"], 1);
  assert.equal(harness.state.selectedListCells["Groups/0/members"].itemIndex, 1);
  assert.equal(harness.state.selectedListCells["Groups/0/members"].columnIndex, 0);
  keydown("ArrowDown");
  assert.equal(harness.state.selectedListRows["Groups/0/members"], 2);
  keydown("ArrowUp");
  assert.equal(harness.state.selectedListCells["Groups/0/members"].itemIndex, 1);
  assert.equal(harness.state.selectedListCells["Groups/0/members"].columnIndex, 0);
  keydown("ArrowRight");
  assert.equal(harness.state.selectedListCells["Groups/0/members"].itemIndex, 1);
  assert.equal(harness.state.selectedListCells["Groups/0/members"].columnIndex, 1);
  keydown("ArrowLeft");
  assert.equal(harness.state.selectedListCells["Groups/0/members"].itemIndex, 1);
  assert.equal(harness.state.selectedListCells["Groups/0/members"].columnIndex, 0);
  keydown("ArrowUp");
  assert.equal(harness.state.selectedListRows["Groups/0/members"], 0);
  assert.equal(harness.state.selectedListCells["Groups/0/members"].itemIndex, 0);
  assert.equal(harness.state.selectedListCells["Groups/0/members"].columnIndex, 0);
  keydown("ArrowUp");
  assert.equal(harness.state.selectedListRows["Groups/0/members"], undefined);
  assert.equal(harness.state.selectedListCells["Groups/0/members"], undefined);
  assert.equal(harness.document.activeElement, listCell);
  assert.equal(harness.CDBVS.selectedCell(target).columnIndex, 0);
});

test.skip("Ctrl/Cmd+Up and Down reorder selected list items without moving the parent row", () => {
  const target = sheet("Groups");
  target.columns = [{ name: "id", typeStr: "0" }, { name: "members", typeStr: "8" }];
  target.lines = [
    { id: "group-a", members: [{ name: "Ada" }, { name: "Grace" }] },
    { id: "group-b", members: [{ name: "Lee" }] }
  ];
  const child = sheet("Groups@members");
  child.columns = [{ name: "name", typeStr: "1" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target, child] });
  harness.context.innerWidth = 1200;
  harness.context.innerHeight = 800;
  harness.context.Event = class { constructor(type) { this.type = type; } };
  harness.CDBVS.app = harness.document.createElement("div");
  harness.CDBVS.rememberViewport = () => {};
  harness.CDBVS.restoreViewport = () => {};
  harness.state.expandedLists.add("Groups/0/members");
  loadScript(harness.context, "EditorCells.js");
  loadScript(harness.context, "EditorView.js");
  harness.CDBVS.render();

  const listCell = harness.CDBVS.app.querySelectorAll("td").find((cell) => cell.classList.contains("list-cell"));
  listCell.dispatchEvent({ type: "click", target: listCell });
  harness.document.dispatchEvent({ type: "keydown", key: "ArrowDown", target: listCell, preventDefault() {} });
  assert.equal(harness.state.selectedListCells["Groups/0/members"].itemIndex, 0);

  harness.document.dispatchEvent({ type: "keydown", key: "ArrowDown", ctrlKey: true, target: harness.document.activeElement, preventDefault() {} });
  assert.deepEqual(target.lines[0].members.map((item) => item.name), ["Grace", "Ada"]);
  assert.deepEqual(target.lines.map((row) => row.id), ["group-a", "group-b"]);
  assert.equal(harness.state.selectedListCells["Groups/0/members"].itemIndex, 1);

  harness.document.dispatchEvent({ type: "keydown", key: "ArrowUp", metaKey: true, target: harness.document.activeElement, preventDefault() {} });
  assert.deepEqual(target.lines[0].members.map((item) => item.name), ["Ada", "Grace"]);
  assert.deepEqual(target.lines.map((row) => row.id), ["group-a", "group-b"]);
  assert.equal(harness.state.selectedListCells["Groups/0/members"].itemIndex, 0);
});

test.skip("vertical arrows cross list-cell boundaries without skipping open lists", () => {
  const target = sheet("Groups");
  const listColumn = { name: "members", typeStr: "8" };
  target.columns = [listColumn];
  target.lines = [
    { members: [{ name: "Ada" }, { name: "Grace" }] },
    { members: [{ name: "Lee" }, { name: "Max" }] }
  ];
  const child = sheet("Groups@members");
  child.columns = [{ name: "name", typeStr: "1" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target, child] });
  harness.context.innerWidth = 1200;
  harness.context.innerHeight = 800;
  harness.CDBVS.app = harness.document.createElement("div");
  harness.CDBVS.rememberViewport = () => {};
  harness.CDBVS.restoreViewport = () => {};
  harness.state.expandedLists.add("Groups/0/members");
  harness.state.expandedLists.add("Groups/1/members");
  loadScript(harness.context, "EditorCells.js");
  loadScript(harness.context, "EditorView.js");
  harness.CDBVS.render();

  const listCells = harness.CDBVS.app.querySelectorAll("td").filter((cell) => cell.dataset.columnIndex === "0");
  const keydown = (key) => harness.document.dispatchEvent({
    type: "keydown", key, target: harness.document.activeElement || listCells[0], preventDefault() {}
  });
  listCells[0].dispatchEvent({ type: "click", target: listCells[0] });
  keydown("ArrowDown");
  keydown("ArrowDown");
  assert.equal(harness.state.selectedListCells["Groups/0/members"].itemIndex, 1);

  keydown("ArrowDown");
  assert.equal(harness.CDBVS.selectedCell(target).rowIndex, 1);
  assert.equal(harness.state.selectedListCells["Groups/0/members"].itemIndex, 1);

  keydown("ArrowDown");
  assert.equal(harness.state.selectedListCells["Groups/1/members"].itemIndex, 0);
  assert.equal(harness.CDBVS.selectedCell(target).rowIndex, 1);

  keydown("ArrowUp");
  assert.equal(harness.CDBVS.selectedCell(target).rowIndex, 1);
  assert.equal(harness.state.selectedListCells["Groups/1/members"], undefined);
  keydown("ArrowUp");
  assert.equal(harness.CDBVS.selectedCell(target).rowIndex, 0);
  assert.equal(harness.state.selectedListCells["Groups/0/members"].itemIndex, 1);
});

test.skip("list-cell click and Enter consistently toggle edit mode with expansion", () => {
  const target = sheet("Groups");
  target.columns = [{ name: "members", typeStr: "8" }];
  target.lines = [{ members: [{ name: "Ada" }] }];
  const child = sheet("Groups@members");
  child.columns = [{ name: "name", typeStr: "1" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target, child] });
  harness.context.innerWidth = 1200;
  harness.context.innerHeight = 800;
  harness.context.Event = class { constructor(type) { this.type = type; } };
  harness.CDBVS.app = harness.document.createElement("div");
  harness.CDBVS.rememberViewport = () => {};
  harness.CDBVS.restoreViewport = () => {};
  loadScript(harness.context, "EditorCells.js");
  loadScript(harness.context, "EditorView.js");
  harness.CDBVS.render();

  const listCell = harness.CDBVS.app.querySelectorAll("td").find((cell) => cell.dataset.columnIndex === "0");
  listCell.dispatchEvent({ type: "mousedown", target: listCell, button: 0, preventDefault() {} });
  listCell.dispatchEvent({ type: "click", target: listCell });
  assert.equal(harness.state.expandedLists.has("Groups/0/members"), false);

  let listToggle = listCell.querySelector(".list-toggle");
  dispatchBubbling(listToggle, "mousedown", { button: 0 });
  dispatchBubbling(listToggle, "click");
  assert.equal(harness.state.expandedLists.has("Groups/0/members"), true);
  assert.equal(harness.CDBVS.activeCell(target).columnIndex, 0);

  listToggle = listCell.querySelector(".list-toggle");
  harness.document.dispatchEvent({ type: "keydown", key: "Enter", target: listToggle, preventDefault() {} });
  assert.equal(harness.state.expandedLists.has("Groups/0/members"), false);
  assert.equal(harness.CDBVS.activeCell(target), null);

  harness.document.dispatchEvent({ type: "keydown", key: "Enter", target: listCell, preventDefault() {} });
  assert.equal(harness.state.expandedLists.has("Groups/0/members"), true);
  assert.equal(harness.CDBVS.activeCell(target).columnIndex, 0);

  listToggle = listCell.querySelector(".list-toggle");
  dispatchBubbling(listToggle, "mousedown", { button: 0 });
  dispatchBubbling(listToggle, "click");
  assert.equal(harness.state.expandedLists.has("Groups/0/members"), false);
  assert.equal(harness.CDBVS.activeCell(target), null);
});

test("properties cells use the same click and Enter toggle contract", () => {
  const target = sheet("Groups");
  target.columns = [{ name: "settings", typeStr: "17" }];
  target.lines = [{ settings: {} }];
  const child = sheet("Groups@settings");
  child.columns = [{ name: "label", typeStr: "1" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target, child] });
  harness.context.innerWidth = 1200;
  harness.context.innerHeight = 800;
  harness.context.Event = class { constructor(type) { this.type = type; } };
  harness.CDBVS.app = harness.document.createElement("div");
  harness.CDBVS.rememberViewport = () => {};
  harness.CDBVS.restoreViewport = () => {};
  loadScript(harness.context, "EditorCells.js");
  loadScript(harness.context, "EditorView.js");
  harness.CDBVS.render();

  const listCell = harness.CDBVS.app.querySelectorAll("td").find((cell) => cell.dataset.columnIndex === "0");
  listCell.dispatchEvent({ type: "mousedown", target: listCell, button: 0, preventDefault() {} });
  listCell.dispatchEvent({ type: "click", target: listCell });
  let listToggle = listCell.querySelector(".list-toggle");
  dispatchBubbling(listToggle, "mousedown", { button: 0 });
  dispatchBubbling(listToggle, "click");
  assert.equal(harness.state.expandedLists.has("Groups/0/settings"), true);

  listToggle = listCell.querySelector(".list-toggle");
  harness.document.dispatchEvent({ type: "keydown", key: "Enter", target: listToggle, preventDefault() {} });
  assert.equal(harness.state.expandedLists.has("Groups/0/settings"), false);
});

test.skip("nested list toggles stay scoped to their own list cell", () => {
  const target = sheet("Groups");
  target.columns = [{ name: "members", typeStr: "8" }];
  target.lines = [{ members: [{ children: [{ name: "Ada" }] }] }];
  const child = sheet("Groups@members");
  child.columns = [{ name: "children", typeStr: "8" }];
  const grandchild = sheet("Groups@members@children");
  grandchild.columns = [{ name: "name", typeStr: "1" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target, child, grandchild] });
  harness.context.innerWidth = 1200;
  harness.context.innerHeight = 800;
  harness.context.Event = class { constructor(type) { this.type = type; } };
  harness.CDBVS.app = harness.document.createElement("div");
  harness.CDBVS.rememberViewport = () => {};
  harness.CDBVS.restoreViewport = () => {};
  harness.state.expandedLists.add("Groups/0/members");
  loadScript(harness.context, "EditorCells.js");
  loadScript(harness.context, "EditorView.js");
  harness.CDBVS.render();

  const outerCell = harness.CDBVS.app.querySelectorAll("td").find((cell) => cell.dataset.columnIndex === "0");
  const nestedCell = outerCell.querySelector(".nested-cell.list-cell");
  assert.ok(nestedCell);
  assert.equal(harness.state.expandedLists.has("Groups/0/members"), true);
  assert.equal(harness.state.expandedLists.has("Groups/0/members/0/children"), false);

  dispatchBubbling(nestedCell.querySelector(".list-toggle"), "mousedown", { button: 0 });
  dispatchBubbling(nestedCell.querySelector(".list-toggle"), "click");
  assert.equal(harness.state.expandedLists.has("Groups/0/members"), true);
  assert.equal(harness.state.expandedLists.has("Groups/0/members/0/children"), true);

  const nestedToggle = nestedCell.querySelector(".list-toggle");
  harness.document.dispatchEvent({ type: "keydown", key: "Enter", target: nestedToggle, preventDefault() {} });
  assert.equal(harness.state.expandedLists.has("Groups/0/members"), true);
  assert.equal(harness.state.expandedLists.has("Groups/0/members/0/children"), false);
});

test.skip("selecting another cell does not collapse previously expanded lists", () => {
  const target = sheet("Groups");
  const listColumn = { name: "members", typeStr: "8" };
  target.columns = [listColumn];
  target.lines = [{ members: [{ name: "Ada" }] }, { members: [{ name: "Grace" }] }];
  const child = sheet("Groups@members");
  child.columns = [{ name: "name", typeStr: "1" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target, child] });
  harness.context.innerWidth = 1200;
  harness.context.innerHeight = 800;
  harness.CDBVS.app = harness.document.createElement("div");
  harness.CDBVS.rememberViewport = () => {};
  harness.CDBVS.restoreViewport = () => {};
  loadScript(harness.context, "EditorCells.js");
  loadScript(harness.context, "EditorView.js");
  harness.CDBVS.render();

  const listCells = harness.CDBVS.app.querySelectorAll("td").filter((cell) => cell.dataset.columnIndex === "0");
  const firstKey = "Groups/0/members";
  const secondKey = "Groups/1/members";
  listCells[0].dispatchEvent({ type: "mousedown", target: listCells[0], button: 0, preventDefault() {} });
  listCells[0].dispatchEvent({ type: "click", target: listCells[0] });
  listCells[0].dispatchEvent({ type: "click", target: listCells[0] });
  assert.equal(harness.state.expandedLists.has(firstKey), true);

  listCells[1].dispatchEvent({ type: "mousedown", target: listCells[1], button: 0, preventDefault() {} });
  listCells[1].dispatchEvent({ type: "click", target: listCells[1] });
  listCells[1].dispatchEvent({ type: "click", target: listCells[1] });

  assert.equal(harness.state.expandedLists.has(firstKey), true);
  assert.equal(harness.state.expandedLists.has(secondKey), true);
  assert.equal(harness.CDBVS.app.querySelectorAll(".list-editor").length, 2);
});

test.skip("Insert adds a list item when the list cell is selected", () => {
  const target = sheet("Groups");
  target.columns = [{ name: "members", typeStr: "8" }];
  target.lines = [{ members: [{ name: "Ada" }] }];
  const child = sheet("Groups@members");
  child.columns = [{ name: "name", typeStr: "1" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target, child] });
  harness.context.innerWidth = 1200;
  harness.context.innerHeight = 800;
  harness.context.Event = class { constructor(type) { this.type = type; } };
  harness.CDBVS.app = harness.document.createElement("div");
  harness.CDBVS.rememberViewport = () => {};
  harness.CDBVS.restoreViewport = () => {};
  loadScript(harness.context, "EditorCells.js");
  loadScript(harness.context, "EditorView.js");
  harness.CDBVS.render();

  let listCell = harness.CDBVS.app.querySelectorAll("td").find((cell) => cell.dataset.columnIndex === "0");
  listCell.dispatchEvent({ type: "mousedown", target: listCell, button: 0, preventDefault() {} });
  listCell.dispatchEvent({ type: "click", target: listCell });
  listCell.dispatchEvent({ type: "click", target: listCell });
  assert.equal(harness.state.expandedLists.has("Groups/0/members"), true);

  harness.document.dispatchEvent({ type: "keydown", key: "Insert", target: listCell, preventDefault() {} });

  assert.equal(target.lines.length, 1);
  assert.equal(target.lines[0].members.length, 2);
  assert.equal(target.lines[0].members[1].name, "");
  assert.equal(harness.state.expandedLists.has("Groups/0/members"), true);
  listCell = harness.CDBVS.app.querySelectorAll("td").find((cell) => cell.dataset.columnIndex === "0");
  assert.equal(listCell.querySelectorAll(".nested-list-item").length, 2);
});

test.skip("nested list cells share normal cell selection and edit transitions", () => {
  const target = sheet("Groups");
  const listColumn = { name: "members", typeStr: "8" };
  target.columns = [listColumn];
  target.lines = [{ members: [{ name: "Ada", kind: 0, score: 3 }] }];
  const child = sheet("Groups@members");
  child.columns = [
    { name: "name", typeStr: "1" },
    { name: "kind", typeStr: "5:Basic,Advanced" },
    { name: "score", typeStr: "3" }
  ];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target, child] });
  harness.context.innerWidth = 1200;
  harness.context.innerHeight = 800;
  harness.context.Event = class { constructor(type) { this.type = type; } };
  harness.CDBVS.app = harness.document.createElement("div");
  harness.CDBVS.rememberViewport = () => {};
  harness.CDBVS.restoreViewport = () => {};
  harness.state.expandedLists.add("Groups/0/members");
  loadScript(harness.context, "EditorCells.js");
  loadScript(harness.context, "EditorView.js");
  harness.CDBVS.render();

  const listCell = harness.CDBVS.app.querySelectorAll("td").find((cell) => cell.dataset.columnIndex === "0");
  let nestedCells = listCell.querySelector(".nested-list-item").querySelectorAll(".nested-cell");
  listCell.dispatchEvent({ type: "click" });
  harness.document.dispatchEvent({ type: "keydown", key: "ArrowDown", target: listCell, preventDefault() {} });

  const nestedEditor = listCell.querySelector(".list-editor");
  const nestedCellTarget = nestedEditor.querySelector(".nested-cell");
  listCell.dispatchEvent({ type: "mousedown", target: nestedCellTarget, button: 0, preventDefault() {} });
  assert.equal(harness.state.expandedLists.has("Groups/0/members"), true);

  let prevented = false;
  harness.document.dispatchEvent({
    type: "keydown",
    key: "Enter",
    target: nestedCells[0],
    preventDefault() { prevented = true; }
  });
  assert.equal(prevented, true);
  assert.equal(harness.CDBVS.activeCell(target).columnIndex, 0);
  assert.equal(harness.document.activeElement, nestedCells[0].querySelector("input"));

  nestedCells[0].querySelector("input").value = "Grace";
  nestedCells[0].querySelector("input").dispatchEvent({ type: "input" });
  harness.document.dispatchEvent({ type: "keydown", key: "Enter", target: nestedCells[0].querySelector("input"), preventDefault() {} });
  assert.equal(target.lines[0].members[0].name, "Grace");
  assert.equal(harness.CDBVS.activeCell(target), null);
  assert.equal(harness.document.activeElement.classList.contains("nested-cell"), true);
  nestedCells = listCell.querySelector(".nested-list-item").querySelectorAll(".nested-cell");

  nestedCells[1].dispatchEvent({ type: "mousedown", target: nestedCells[1], button: 0, preventDefault() {} });
  nestedCells[1].dispatchEvent({ type: "click", target: nestedCells[1], preventDefault() {}, stopPropagation() {} });
  assert.equal(harness.state.selectedListCells["Groups/0/members"].columnIndex, 1);
  assert.equal(harness.CDBVS.activeCell(target), null);

  nestedCells[1].dispatchEvent({ type: "click", target: nestedCells[1], preventDefault() {}, stopPropagation() {} });
  const nestedMenu = harness.document.querySelector(".cell-select-menu");
  assert.ok(nestedMenu);
  const nestedSelect = nestedCells[1].querySelector("select");
  nestedSelect.getBoundingClientRect = () => ({ left: 315, bottom: 224, width: 180 });
  listCell.querySelector(".list-editor").dispatchEvent({ type: "scroll", target: listCell.querySelector(".list-editor") });
  assert.equal(nestedMenu.style.left, "315px");
  assert.equal(nestedMenu.style.top, "224px");
  harness.document.dispatchEvent({ type: "keydown", key: "Enter", target: harness.document.querySelector(".cell-select-filter"), preventDefault() {} });
  assert.equal(harness.document.querySelector(".cell-select-menu"), null);
  assert.equal(harness.CDBVS.activeCell(target), null);

  nestedCells[2].dispatchEvent({ type: "click", target: nestedCells[2], preventDefault() {}, stopPropagation() {} });
  harness.document.dispatchEvent({ type: "keydown", key: "Delete", target: nestedCells[2], preventDefault() {} });
  assert.equal(target.lines[0].members[0].score, null);
});

test("column type changes convert safe values and reject lossy values before mutation", () => {
  const target = sheet();
  const column = { name: "score", typeStr: "3" };
  target.columns = [column];
  target.lines = [{ score: 4 }, { score: -2 }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });

  const safe = harness.CDBVS.prepareColumnTypeChange(target, column, "4");
  assert.equal(safe.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(safe.values.map((item) => item.value))), [4, -2]);
  const unsafe = harness.CDBVS.prepareColumnTypeChange(target, column, "8");
  assert.equal(unsafe.ok, false);
  assert.equal(column.typeStr, "3");
  assert.deepEqual(target.lines.map((row) => row.score), [4, -2]);
});

test("schema defaults include required fields and unique generated IDs", () => {
  const target = sheet("Targets");
  target.columns = [{ name: "id", typeStr: "0" }];
  target.lines = [{ id: "target" }];
  const parent = sheet("Parents");
  parent.columns = [
    { name: "id", typeStr: "0" },
    { name: "enabled", typeStr: "2" },
    { name: "label", typeStr: "1", opt: true },
    { name: "target", typeStr: "6:Targets" }
  ];
  const harness = createWebviewHarness({ customTypes: [], sheets: [parent, target] });
  const row = harness.CDBVS.createRowForSchema(parent, [{ id: "new_1" }]);

  assert.deepEqual(JSON.parse(JSON.stringify(row)), { id: "new_2", enabled: false, target: "target" });
});

test("row selection supports shift ranges and ctrl toggles", () => {
  const target = sheet();
  target.lines = [{}, {}, {}, {}, {}];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.CDBVS.selectRow(target, 1);
  harness.CDBVS.selectRowWithModifiers(target, 4, { shiftKey: true });
  assert.deepEqual(Array.from(harness.CDBVS.selectedRowIndices(target)), [1, 2, 3, 4]);
  assert.equal(harness.CDBVS.selectedRowIndex(target), 4);
  harness.CDBVS.selectRowWithModifiers(target, 2, { ctrlKey: true });
  assert.deepEqual(Array.from(harness.CDBVS.selectedRowIndices(target)), [1, 3, 4]);
});

test("view filtering and sorting remain non-destructive", () => {
  const target = sheet();
  target.columns = [{ name: "name", typeStr: "1" }, { name: "score", typeStr: "3" }];
  target.lines = [{ name: "Beta", score: 2 }, { name: "Alpha", score: 3 }, { name: "Gamma", score: 1 }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  const view = harness.CDBVS.viewForSheet(target);
  harness.state.sorts[target.name] = { column: "score", direction: "desc" };
  view.filters.name = { value: "a" };
  const result = harness.CDBVS.rowsForView(target);

  assert.deepEqual(result.map((entry) => entry.row.name), ["Alpha", "Beta", "Gamma"]);
  assert.deepEqual(target.lines.map((row) => row.name), ["Beta", "Alpha", "Gamma"]);
});

test("pasting multiple rows emits one document update", () => {
  const target = sheet();
  target.lines = [{ id: "a" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.CDBVS.selectRow(target, 0);
  harness.state.rowClipboard = { sheetName: target.name, rows: [{ id: "b" }, { id: "c" }] };

  assert.equal(harness.CDBVS.pasteSelectedRow(target), true);
  assert.deepEqual(target.lines.map((row) => row.id), ["a", "b", "c"]);
  assert.equal(harness.updates.length, 1);
});

test("row-only clipboard commands bypass an active cell selection", () => {
  const target = sheet();
  target.columns = [{ name: "id", typeStr: "0" }, { name: "label", typeStr: "1" }];
  target.lines = [{ id: "a", label: "A" }, { id: "b", label: "B" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  const active = harness.CDBVS.currentSheet();
  harness.CDBVS.selectCell(active, 0, 1);
  assert.equal(harness.CDBVS.copySelectedRow(active, false), true);
  assert.equal(harness.state.cellClipboard !== null, true);
  assert.equal(harness.CDBVS.copySelectedRow(active, false, true), true);
  assert.equal(harness.state.cellClipboard, null);
  assert.equal(harness.state.rowClipboard.rows.length, 1);
  assert.equal(harness.CDBVS.pasteSelectedRow(active, true), true);
  assert.deepEqual(target.lines.map((row) => row.id), ["a", "a", "b"]);
});

test("moving a sheet moves its sub-sheet block as a unit", () => {
  const first = sheet("First");
  const firstList = sheet("First@items");
  const second = sheet("Second");
  const secondList = sheet("Second@items");
  const harness = createWebviewHarness({ customTypes: [], sheets: [first, firstList, second, secondList] });

  harness.CDBVS.moveSheet(harness.state.data.sheets[0], 1);
  assert.deepEqual(harness.state.data.sheets.map((item) => item.name), ["Second", "Second@items", "First", "First@items"]);
});

test("deleting a sheet removes sub-sheets, clears references, and cleans selection state", () => {
  const main = sheet("Main");
  main.columns = [{ name: "id", typeStr: "0" }];
  main.lines = [{ id: "a" }];
  const child = sheet("Main@items");
  const other = sheet("Other");
  other.columns = [{ name: "main", typeStr: "6:Main" }, { name: "other", typeStr: "6:Other" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [main, child, other] });
  harness.state.selectedRows.Main = [0];
  harness.state.activeRows.Main = 0;
  harness.state.selectedCells.Main = { rowIndex: 0, columnIndex: 0 };
  harness.state.columnFilters.Main = { id: { value: "a" } };
  harness.state.expandedLists.add("Main/0/items");

  assert.equal(harness.CDBVS.deleteSheet(main), true);
  assert.deepEqual(harness.state.data.sheets.map((item) => item.name), ["Other"]);
  assert.equal(other.columns[0].typeStr, "1");
  assert.equal(other.columns[1].typeStr, "6:Other");
  assert.equal(harness.state.selectedRows.Main, undefined);
  assert.equal(harness.state.columnFilters.Main, undefined);
  assert.equal(harness.state.expandedLists.size, 0);
});

test("renaming a sheet updates sub-sheet names, references, and selection state", () => {
  const main = sheet("Main");
  main.columns = [{ name: "id", typeStr: "0" }];
  main.lines = [{ id: "a" }];
  const child = sheet("Main@items");
  const other = sheet("Other");
  other.columns = [{ name: "main", typeStr: "6:Main" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [main, child, other] });
  harness.state.selectedRows.Main = [0];
  harness.state.activeRows.Main = 0;
  harness.state.rowSelectionAnchors.Main = 0;
  harness.state.selectedCells.Main = { rowIndex: 0, columnIndex: 0 };
  harness.state.selectedListRows["Main/0/items"] = 0;
  harness.state.columnFilters.Main = { id: { value: "a" } };
  harness.CDBVS.openSheetEditor(main);
  const overlay = harness.document.querySelector(".text-modal-overlay");
  overlay.querySelector(".column-modal input").value = "Renamed";
  click(buttonByText(overlay, "Save"));

  assert.deepEqual(harness.state.data.sheets.map((item) => item.name), ["Renamed", "Renamed@items", "Other"]);
  assert.equal(other.columns[0].typeStr, "6:Renamed");
  assert.deepEqual(harness.state.selectedRows.Renamed, [0]);
  assert.equal(harness.state.selectedRows.Main, undefined);
  assert.equal(harness.state.activeRows.Renamed, 0);
  assert.deepEqual(harness.state.selectedCells.Renamed, { rowIndex: 0, columnIndex: 0 });
  assert.equal(harness.state.selectedListRows["Renamed/0/items"], 0);
  assert.equal(harness.state.columnFilters.Renamed.id.value, "a");
});

test("sheet advanced properties cannot override form-controlled metadata", () => {
  const target = sheet();
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.CDBVS.openSheetEditor(target);
  const overlay = harness.document.querySelector(".text-modal-overlay");
  overlay.querySelector("textarea").value = JSON.stringify({ hide: true });
  click(buttonByText(overlay, "Save"));

  assert.equal(target.props.hide, undefined);
  assert.match(overlay.querySelector(".column-form-error").textContent, /controlled by the form/);
  assert.equal(harness.updates.length, 0);
});

test("canceling a sheet editor does not create or mutate properties", () => {
  const target = sheet();
  delete target.props;
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.CDBVS.openSheetEditor(target);
  const overlay = harness.document.querySelector(".text-modal-overlay");
  overlay.querySelector(".column-modal input").value = "Changed but canceled";
  click(buttonByText(overlay, "Cancel"));

  assert.equal(target.name, "Players");
  assert.equal(Object.prototype.hasOwnProperty.call(target, "props"), false);
  assert.equal(harness.updates.length, 0);
});

test("filter modal applies a draft without mutating until Apply", () => {
  const target = sheet();
  target.columns = [{ name: "score", typeStr: "3" }];
  target.lines = [{ score: 1 }, { score: 5 }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.CDBVS.openFilterModal(harness.CDBVS.currentSheet());
  const overlay = harness.document.querySelector(".filter-modal");
  const min = overlay.querySelector("input");
  min.value = "3";
  min.dispatchEvent({ type: "input" });
  assert.deepEqual(JSON.parse(JSON.stringify(harness.state.columnFilters)), { Players: {} });
  click(buttonByText(overlay, "Apply"));

  assert.equal(harness.state.columnFilters.Players.score.min, "3");
  assert.deepEqual(harness.CDBVS.rowsForView(harness.CDBVS.currentSheet()).map((entry) => entry.row.score), [5]);
});

test("custom type modal rejects dangling references and accepts valid definitions", () => {
  const target = sheet();
  target.columns = [{ name: "kind", typeStr: "9:Kind" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.CDBVS.openTypesEditor();
  let overlay = harness.document.querySelector(".types-modal");
  overlay.querySelector("textarea").value = JSON.stringify([{ name: "Other", cases: [] }]);
  click(buttonByText(overlay, "Save"));
  assert.match(overlay.querySelector(".column-form-error").textContent, /not defined/);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.state.data.customTypes)), []);

  overlay.querySelector("textarea").value = JSON.stringify([{ name: "Kind", cases: [{ name: "Basic", args: [] }] }]);
  click(buttonByText(overlay, "Save"));
  assert.deepEqual(JSON.parse(JSON.stringify(harness.state.data.customTypes)), [{ name: "Kind", cases: [{ name: "Basic", args: [] }] }]);
  assert.equal(harness.updates.length, 1);
});

test("the entire bottom sheet dock opens New sheet from its context menu", () => {
  const harness = createWebviewHarness({ customTypes: [], sheets: [sheet()] });
  harness.context.innerWidth = 1200;
  harness.context.innerHeight = 800;
  harness.CDBVS.app = harness.document.createElement("div");
  harness.CDBVS.rememberViewport = () => {};
  harness.CDBVS.restoreViewport = () => {};
  harness.CDBVS.makeCellEditor = () => {};
  loadScript(harness.context, "EditorCells.js");
  loadScript(harness.context, "EditorView.js");
  harness.CDBVS.render();
  const sheetsBar = harness.CDBVS.app.querySelector(".sheets");
  assert.ok(sheetsBar);
  sheetsBar.dispatchEvent({ type: "contextmenu", clientX: 10, clientY: 10, preventDefault() {} });
  const menu = harness.document.querySelector(".context-menu");
  assert.ok(menu);
  click(buttonByText(menu, "New sheet"));
  assert.ok(harness.document.querySelector(".sheet-modal"));
});

test("moving and deleting columns keep the selected cell attached to the right column", () => {
  const target = sheet();
  target.columns = [{ name: "a", typeStr: "1" }, { name: "b", typeStr: "1" }, { name: "c", typeStr: "1" }];
  target.lines = [{ a: "A", b: "B", c: "C" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  const active = harness.CDBVS.currentSheet();
  harness.CDBVS.selectCell(active, 0, 1);
  harness.CDBVS.moveColumn(target, 1, 1);
  assert.deepEqual(target.columns.map((column) => column.name), ["a", "c", "b"]);
  assert.equal(harness.CDBVS.selectedCell(active).columnIndex, 2);
  assert.equal(harness.CDBVS.deleteColumn(target, 1), true);
  assert.deepEqual(target.columns.map((column) => column.name), ["a", "b"]);
  assert.equal(harness.CDBVS.selectedCell(active).columnIndex, 1);
  assert.equal(target.lines[0].c, undefined);
});

test("renaming a list column clears stale expansion keys and renames its sub-sheet", () => {
  const main = sheet("Main");
  const listColumn = { name: "items", typeStr: "8" };
  main.columns = [listColumn];
  const child = sheet("Main@items");
  child.columns = [{ name: "name", typeStr: "1" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [main, child] });
  harness.state.expandedLists.add("Main/0/items");
  harness.state.selectedListRows["Main/0/items"] = 0;
  harness.CDBVS.openColumnEditor(main, listColumn, 0, false);
  const overlay = harness.document.querySelector(".text-modal-overlay");
  overlay.querySelector(".column-modal input").value = "members";
  click(buttonByText(overlay, "Save"));

  assert.equal(main.columns[0].name, "members");
  assert.equal(harness.state.data.sheets[1].name, "Main@members");
  assert.equal(harness.state.expandedLists.size, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.state.selectedListRows)), {});
});
