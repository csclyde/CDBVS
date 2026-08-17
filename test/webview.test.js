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

function buttonByText(root, text) {
  return root.querySelectorAll("button").find((button) => button.textContent === text);
}

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

test("nested list items show selection and delete immediately", () => {
  const parent = sheet("Groups");
  const listColumn = { name: "members", typeStr: "8" };
  parent.columns = [listColumn];
  parent.lines = [{ members: [{ name: "Ada" }, { name: "Grace" }] }];
  const child = { name: "Groups@members", columns: [{ name: "name", typeStr: "1" }], lines: [], props: {} };
  const harness = createWebviewHarness({ customTypes: [], sheets: [parent, child] });
  loadScript(harness.context, "cdbEditorCells.js");
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

test("Delete key removes the selected nested list item", () => {
  const parent = sheet("Groups");
  const listColumn = { name: "members", typeStr: "8" };
  parent.columns = [listColumn];
  parent.lines = [{ members: [{ name: "Ada" }, { name: "Grace" }] }];
  const child = { name: "Groups@members", columns: [{ name: "name", typeStr: "1" }], lines: [], props: {} };
  const harness = createWebviewHarness({ customTypes: [], sheets: [parent, child] });
  loadScript(harness.context, "cdbEditorCells.js");
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

test("nested list items support multi-select and insert after the active item", () => {
  const parent = sheet("Groups");
  const listColumn = { name: "members", typeStr: "8" };
  parent.columns = [listColumn];
  parent.lines = [{ members: [{ name: "Ada" }, { name: "Grace" }, { name: "Lee" }] }];
  const child = { name: "Groups@members", columns: [{ name: "name", typeStr: "1" }], lines: [], props: {} };
  const harness = createWebviewHarness({ customTypes: [], sheets: [parent, child] });
  loadScript(harness.context, "cdbEditorCells.js");
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

test("deleting multiple selected nested list items removes them together", () => {
  const parent = sheet("Groups");
  const listColumn = { name: "members", typeStr: "8" };
  parent.columns = [listColumn];
  parent.lines = [{ members: [{ name: "Ada" }, { name: "Grace" }, { name: "Lee" }] }];
  const child = { name: "Groups@members", columns: [{ name: "name", typeStr: "1" }], lines: [], props: {} };
  const harness = createWebviewHarness({ customTypes: [], sheets: [parent, child] });
  loadScript(harness.context, "cdbEditorCells.js");
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
  const mediaRoot = path.join(__dirname, "..", "media");
  const sources = fs.readdirSync(mediaRoot).filter((name) => name.endsWith(".js")).map((name) => fs.readFileSync(path.join(mediaRoot, name), "utf8")).join("\n");
  assert.doesNotMatch(sources, /window\.(prompt|confirm|alert)\s*\(/);
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
  loadScript(context, "cdbEditorRuntime.js");
  context.CDBVS.render = () => {};
  loadScript(context, "cdbEditor.js");

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
  loadScript(harness.context, "cdbEditorCells.js");
  loadScript(harness.context, "cdbEditorView.js");
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
