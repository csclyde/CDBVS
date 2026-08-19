const assert = require("node:assert/strict");
const test = require("node:test");
const { createWebviewHarness } = require("./helpers/webviewHarness");

function resultValue(result) {
  return JSON.parse(JSON.stringify(result));
}

function typeOf(harness, typeStr) {
  return harness.CDBVS.typeOf({ typeStr });
}

test("column value conversion handles primitive, enum, flags, list, and properties cases", () => {
  const harness = createWebviewHarness({ customTypes: [], sheets: [] });
  const convert = harness.CDBVS.convertColumnValue;
  assert.deepEqual(resultValue(convert(null, typeOf(harness, "1"), typeOf(harness, "3"))), { ok: true, value: null });
  assert.deepEqual(resultValue(convert(undefined, typeOf(harness, "1"), typeOf(harness, "3"))), { ok: true });
  assert.deepEqual(resultValue(convert("hello", typeOf(harness, "1"), typeOf(harness, "1"))), { ok: true, value: "hello" });
  assert.deepEqual(resultValue(convert(2, typeOf(harness, "5:easy,hard,fast"), typeOf(harness, "1"))), { ok: true, value: "fast" });
  assert.deepEqual(resultValue(convert(3, typeOf(harness, "5:easy,hard"), typeOf(harness, "1"))), { ok: true, value: "3" });
  assert.deepEqual(resultValue(convert(0, typeOf(harness, "1"), typeOf(harness, "2"))), { ok: true, value: false });
  assert.deepEqual(resultValue(convert("true", typeOf(harness, "1"), typeOf(harness, "2"))), { ok: true, value: true });
  assert.deepEqual(resultValue(convert("1.5", typeOf(harness, "1"), typeOf(harness, "3"))), { ok: false });
  assert.deepEqual(resultValue(convert("1.5", typeOf(harness, "1"), typeOf(harness, "4"))), { ok: true, value: 1.5 });
  assert.deepEqual(resultValue(convert(true, typeOf(harness, "2"), typeOf(harness, "3"))), { ok: true, value: 1 });
  assert.deepEqual(resultValue(convert("false", typeOf(harness, "1"), typeOf(harness, "2"))), { ok: true, value: false });
  assert.deepEqual(resultValue(convert("not boolean", typeOf(harness, "1"), typeOf(harness, "2"))), { ok: false });
  assert.deepEqual(resultValue(convert(1, typeOf(harness, "1"), typeOf(harness, "5:a,b"))), { ok: true, value: 1 });
  assert.deepEqual(resultValue(convert(2, typeOf(harness, "1"), typeOf(harness, "5:a,b"))), { ok: false });
  assert.deepEqual(resultValue(convert("1", typeOf(harness, "1"), typeOf(harness, "5:a,b"))), { ok: true, value: 1 });
  assert.deepEqual(resultValue(convert(1, typeOf(harness, "5:a,b"), typeOf(harness, "5:b,a"))), { ok: true, value: 1 });
  assert.deepEqual(resultValue(convert(1, typeOf(harness, "5:a,b"), typeOf(harness, "5:a,c"))), { ok: true, value: 1 });
  assert.deepEqual(resultValue(convert(3, typeOf(harness, "10:a,b"), typeOf(harness, "10:b,a,c"))), { ok: true, value: 3 });
  assert.deepEqual(resultValue(convert(2, typeOf(harness, "10:a,b"), typeOf(harness, "10:a"))), { ok: true, value: 2 });
  assert.deepEqual(resultValue(convert(1, typeOf(harness, "5:a,b"), typeOf(harness, "10:a,b"))), { ok: true, value: 2 });
  assert.deepEqual(resultValue(convert({ value: 1 }, typeOf(harness, "17"), typeOf(harness, "8"))), { ok: true, value: [{ value: 1 }] });
  assert.deepEqual(resultValue(convert({}, typeOf(harness, "17"), typeOf(harness, "8"))), { ok: true, value: [] });
  assert.deepEqual(resultValue(convert([], typeOf(harness, "17"), typeOf(harness, "8"))), { ok: false });
  assert.deepEqual(resultValue(convert([{ value: 1 }], typeOf(harness, "8"), typeOf(harness, "17"))), { ok: true, value: { value: 1 } });
  assert.deepEqual(resultValue(convert([], typeOf(harness, "8"), typeOf(harness, "17"))), { ok: true, value: {} });
  assert.deepEqual(resultValue(convert("x", typeOf(harness, "1"), typeOf(harness, "16"))), { ok: false });
});

test("prepareColumnTypeChange rejects lossy remaps and returns safe line updates", () => {
  const enumSheet = {
    name: "Items",
    columns: [{ name: "kind", typeStr: "5:a,b" }],
    lines: [{ kind: 1 }, { kind: null }, {}, { kind: 0 }]
  };
  const harness = createWebviewHarness({ customTypes: [], sheets: [enumSheet] });
  const prepare = harness.CDBVS.prepareColumnTypeChange;
  const same = prepare(enumSheet, enumSheet.columns[0], "5:b,a");
  assert.equal(same.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(same.values.map((item) => item.value))), [0, 1]);
  const unsafe = prepare(enumSheet, enumSheet.columns[0], "5:a,c");
  assert.equal(unsafe.ok, false);
  assert.match(unsafe.message, /not defined/);

  const flags = { name: "flags", typeStr: "10:a,b" };
  const flagSheet = { name: "Flags", columns: [flags], lines: [{ flags: 3 }, { flags: 0 }] };
  const flagHarness = createWebviewHarness({ customTypes: [], sheets: [flagSheet] });
  const flagResult = flagHarness.CDBVS.prepareColumnTypeChange(flagSheet, flags, "10:b,a,c");
  assert.equal(flagResult.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(flagResult.values.map((item) => item.value))), [3, 0]);
  flagSheet.lines[0].flags = 2;
  const lost = flagHarness.CDBVS.prepareColumnTypeChange(flagSheet, flags, "10:a");
  assert.equal(lost.ok, false);
  assert.match(lost.message, /removes a value/);

  const unknown = prepare(enumSheet, enumSheet.columns[0], "999");
  assert.equal(unknown.ok, false);
  assert.match(unknown.message, /Unknown type/);
});

test("document model rejects invalid roots and controls mutation boundaries", () => {
  const harness = createWebviewHarness({ customTypes: [], sheets: [] });
  const model = harness.CDBVS.documentModel;
  assert.equal(model.has(), true);
  assert.deepEqual(model.sheets(), []);
  assert.deepEqual(model.customTypes(), []);
  assert.equal(model.load([]).ok, false);
  assert.equal(model.get(), harness.state.data);
  assert.equal(model.load(null).ok, true);
  assert.equal(model.has(), false);
  assert.equal(model.mutate(() => true), false);
  assert.equal(model.mutate(null), false);
  assert.deepEqual(resultValue(harness.CDBVS.replaceDocument({ customTypes: [], sheets: [] })), { ok: true });
  assert.equal(harness.CDBVS.replaceDocument([]).ok, false);
  assert.equal(harness.CDBVS.replaceDocumentText("{").ok, false);
  assert.match(harness.CDBVS.replaceDocumentText("{").message, /^Invalid JSON:/);
  assert.equal(harness.CDBVS.replaceDocumentText(JSON.stringify({ customTypes: [], sheets: [] })).ok, true);
});

test("cell errors normalize, deduplicate, clear by scope, and report duplicate primary IDs", () => {
  const sheet = {
    name: "Players",
    columns: [{ name: "id", typeStr: "0" }, { name: "name", typeStr: "1" }],
    lines: [{ id: "same", name: "A" }, { id: "same", name: "B" }]
  };
  const harness = createWebviewHarness({ customTypes: [], sheets: [sheet] });
  assert.equal(harness.CDBVS.addCellError(null, 0, "id", "bad"), false);
  assert.equal(harness.CDBVS.addCellError(sheet, 0, "", "bad"), false);
  assert.equal(harness.CDBVS.addCellError(sheet, 0, "name", "bad", "required"), true);
  assert.equal(harness.CDBVS.addCellError(sheet, 0, "name", "bad", "required"), true);
  assert.equal(harness.CDBVS.addCellError(sheet, 0, "name", { message: "warning", severity: "warning" }), true);
  let errors = harness.CDBVS.cellErrorsForSheet(sheet);
  assert.equal(errors["0\u0000name"].length, 2);
  assert.equal(errors["0\u0000name"][0].code, "required");
  assert.equal(errors["0\u0000name"][0].severity, "error");
  assert.equal(errors["1\u0000id"][0].code, "duplicate-primary-id");
  assert.match(errors["1\u0000id"][0].message, /first occurrence is row 1/);

  harness.CDBVS.clearCellErrors(sheet, 0, "name");
  errors = harness.CDBVS.cellErrorsForSheet(sheet);
  assert.equal(errors["0\u0000name"], undefined);
  harness.CDBVS.addCellError(sheet, 0, "name", "again");
  harness.CDBVS.addCellError(sheet, 0, "id", "again");
  harness.CDBVS.clearCellErrors(sheet, 0);
  errors = harness.CDBVS.cellErrorsForSheet(sheet);
  assert.equal(errors["0\u0000name"], undefined);
  assert.equal(errors["0\u0000id"], undefined);
  assert.equal(errors["1\u0000id"].length, 1);
  harness.CDBVS.clearCellErrors(sheet, null);
  assert.equal(harness.CDBVS.cellErrorsForSheet(sheet)["1\u0000id"].length, 1);
});

test("schema values parse safely and create rows with references, nested properties, and unique IDs", () => {
  const target = { name: "Targets", columns: [{ name: "id", typeStr: "0" }], lines: [{ id: "first" }, { id: "second" }] };
  const parent = {
    name: "Groups",
    columns: [
      { name: "id", typeStr: "0" },
      { name: "target", typeStr: "6:Targets" },
      { name: "settings", typeStr: "17", opt: true }
    ],
    lines: [{ id: "new_3" }]
  };
  const settings = {
    name: "Groups@settings",
    columns: [{ name: "enabled", typeStr: "2" }, { name: "label", typeStr: "1", opt: true }],
    lines: []
  };
  const harness = createWebviewHarness({ customTypes: [], sheets: [parent, settings, target] });
  assert.equal(harness.CDBVS.defaultValue(parent.columns[1], parent), "first");
  assert.deepEqual(resultValue(harness.CDBVS.defaultValue(parent.columns[2], parent)), { enabled: false });
  const row = harness.CDBVS.createRowForSchema(parent, parent.lines);
  assert.deepEqual(resultValue(row), { id: "new_2", target: "first" });
  assert.equal(harness.CDBVS.listKey({ path: "Groups/0" }, { name: "settings" }), "Groups/0/settings");
  assert.equal(harness.CDBVS.listPreview([{ enabled: true, label: "A" }], settings), "enabled: true, label: A");
  assert.equal(harness.CDBVS.listPreview([], settings), "empty list");
  assert.equal(harness.CDBVS.listPreview(["plain"], settings), "plain");

  const input = (value, checked = false) => ({ value, checked });
  assert.equal(harness.CDBVS.readValue(input("", false), { typeStr: "1" }), null);
  assert.equal(harness.CDBVS.readValue(input("#ff00aa"), { typeStr: "11" }), 16711850);
  assert.equal(harness.CDBVS.readValue(input("nope"), { typeStr: "11" }), undefined);
  assert.equal(harness.CDBVS.readValue(input("-12"), { typeStr: "3" }), -12);
  assert.equal(harness.CDBVS.readValue(input("1.2e3"), { typeStr: "4" }), 1200);
  assert.equal(harness.CDBVS.readValue(input("1.2.3"), { typeStr: "4" }), undefined);
  assert.deepEqual(harness.CDBVS.readValue(input("{\"x\":1}"), { typeStr: "17" }), { x: 1 });
  assert.equal(harness.CDBVS.readValue(input("bad json"), { typeStr: "17" }), undefined);
  assert.equal(harness.CDBVS.readValue(input("ignored", true), { typeStr: "2" }), true);
});

test("custom type validation preserves document boundaries and rejects dangling references", () => {
  const sheet = { name: "Players", columns: [{ name: "kind", typeStr: "9:Kind" }], lines: [] };
  const harness = createWebviewHarness({ customTypes: [], sheets: [sheet] });
  assert.deepEqual(resultValue(harness.CDBVS.validateCustomTypes(null)), { ok: false, message: "Custom types must be a JSON array." });
  const invalid = harness.CDBVS.validateCustomTypes([{ name: "Other", cases: [{ name: "Basic", args: [] }] }]);
  assert.equal(invalid.ok, false);
  assert.match(invalid.message, /not defined/);
  const valid = [{ name: "Kind", cases: [{ name: "Basic", args: [{ name: "value", typeStr: "1" }] }] }];
  assert.deepEqual(resultValue(harness.CDBVS.updateCustomTypes(valid)), { ok: true });
  assert.strictEqual(harness.CDBVS.documentModel.customTypes(), valid);
  assert.deepEqual(resultValue(harness.CDBVS.updateCustomTypes([{ name: "Kind", cases: [] }, { name: "Kind", cases: [] }])), { ok: false, message: "Each custom type needs a unique name." });
  harness.CDBVS.documentModel.load(null);
  assert.deepEqual(resultValue(harness.CDBVS.updateCustomTypes([])), { ok: false, message: "Load a valid CastleDB document before editing custom types." });
});

test("sheet view filtering, sorting, hidden sheets, and filter modes remain deterministic", () => {
  const visible = {
    name: "Players",
    columns: [
      { name: "id", typeStr: "0" }, { name: "enabled", typeStr: "2" }, { name: "score", typeStr: "3" },
      { name: "kind", typeStr: "5:a,b" }, { name: "flags", typeStr: "10:x,y" }, { name: "color", typeStr: "11" }, { name: "name", typeStr: "1" }
    ],
    lines: [
      { id: "a", enabled: true, score: 5, kind: 1, flags: 3, color: 16711680, name: "Alpha" },
      { id: "b", enabled: false, score: 2, kind: 0, flags: 1, color: 255, name: "Beta" },
      { id: "c", enabled: true, score: 8, kind: 0, flags: 0, color: 16777215, name: "Gamma" }
    ]
  };
  const hidden = { name: "Hidden", props: { hide: true }, columns: [], lines: [] };
  const harness = createWebviewHarness({ customTypes: [], sheets: [visible, hidden] });
  assert.deepEqual(harness.CDBVS.visibleSheets().map((sheet) => sheet.name), ["Players"]);
  harness.state.showHiddenSheets = true;
  assert.deepEqual(harness.CDBVS.visibleSheets().map((sheet) => sheet.name), ["Players", "Hidden"]);

  harness.CDBVS.sheetState.view.setFilters("Players", { enabled: { value: "true" }, score: { min: "4", max: "6" }, kind: { value: "1" }, flags: { mask: 1 }, color: { value: "#ff" } });
  assert.deepEqual(harness.CDBVS.rowsForView(visible).map((item) => item.row.id), ["a"]);
  harness.CDBVS.sheetState.view.setFilters("Players", { name: { value: "mm" } });
  assert.deepEqual(harness.CDBVS.rowsForView(visible).map((item) => item.row.id), ["c"]);
  harness.CDBVS.sheetState.view.setFilters("Players", {});
  harness.CDBVS.sheetState.view.cycleSort("Players", "score");
  assert.deepEqual(harness.CDBVS.rowsForView(visible).map((item) => item.row.id), ["c", "a", "b"]);
  harness.CDBVS.sheetState.view.cycleSort("Players", "score");
  assert.deepEqual(harness.CDBVS.rowsForView(visible).map((item) => item.row.id), ["b", "a", "c"]);
  harness.CDBVS.sheetState.view.cycleSort("Players", "score");
  assert.equal(harness.CDBVS.sheetState.view.readSort("Players").column, "");
  harness.CDBVS.viewState.setFilter("gamma");
  assert.deepEqual(harness.CDBVS.rowsForView(visible).map((item) => item.row.id), ["c"]);
});

test("sheet state selection, collapsed separators, and lifecycle keys are cleaned safely", () => {
  const harness = createWebviewHarness({ customTypes: [], sheets: [] });
  const state = harness.CDBVS.sheetState;
  state.setSelectedListItems("Groups/0/items", [0, 1, 1, -1, 4], 1, 0, 2);
  assert.deepEqual(Array.from(state.selectedListItems("Groups/0/items", 2)), [0, 1]);
  assert.deepEqual(state.selectedListCell("Groups/0/items", 2, 2), null);
  state.setSelectedListCell("Groups/0/items", 1, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(state.selectedListCell("Groups/0/items", 2, 2))), { itemIndex: 1, columnIndex: 1 });
  state.selectListItems("Groups/0/items", 0, 2, {});
  state.selectListItems("Groups/0/items", 1, 2, { shiftKey: true });
  assert.deepEqual(Array.from(state.selectedListItems("Groups/0/items", 2)), [0, 1]);
  state.selectListItems("Groups/0/items", 1, 2, { ctrlKey: true });
  assert.deepEqual(Array.from(state.selectedListItems("Groups/0/items", 2)), [0]);
  state.clearSelectedListSelection("Groups/0/items");
  assert.deepEqual(Array.from(state.selectedListItems("Groups/0/items", 2)), []);

  state.toggleSeparatorCollapsed("Players", 2);
  assert.equal(state.isSeparatorCollapsed("Players", 2), true);
  state.shiftCollapsedSeparators("Players", (index) => index === 2 ? 3 : index);
  assert.equal(state.isSeparatorCollapsed("Players", 3), true);
  state.removeCollapsedSeparator("Players", 3);
  assert.equal(state.isSeparatorCollapsed("Players", 3), false);

  state.selection.cells().Players = { columnIndex: 2 };
  state.selection.activeCells().Players = { columnIndex: 1 };
  state.adjustSelectionAfterColumnRemoval("Players", 1, 2);
  assert.equal(state.selection.cells().Players.columnIndex, 1);
  assert.equal(state.selection.activeCells().Players.columnIndex, 1);
  state.selection.cells().Players = { columnIndex: 0 };
  state.adjustSelectionAfterColumnRemoval("Players", 1, 1);
  assert.equal(state.selection.cells().Players.columnIndex, 0);
  assert.equal(state.selection.activeCells().Players, undefined);
  state.selection.cells().Players = { columnIndex: 0 };
  state.selection.activeCells().Players = { columnIndex: 1 };
  state.swapSelectionColumns("Players", 0, 1);
  assert.equal(state.selection.cells().Players.columnIndex, 1);
  assert.equal(state.selection.activeCells().Players.columnIndex, 0);
  state.renameSheet("Players", "Renamed");
  assert.deepEqual(state.selection.cells().Renamed, { columnIndex: 1 });
  state.removeSheet("Renamed");
  assert.equal(state.selection.cells().Renamed, undefined);
});

test("row model operations handle invalid inputs, separator variants, and boundary shifts", () => {
  const harness = createWebviewHarness({ customTypes: [], sheets: [] });
  const rows = harness.CDBVS.services.document.operations.rows;
  assert.equal(rows.separatorIndex(2), 2);
  assert.equal(rows.separatorIndex({ index: 3 }), 3);
  assert.equal(rows.separatorIndex(null), null);
  assert.equal(rows.insert(null, 0), undefined);
  assert.equal(rows.update(null, 0, {}), false);
  assert.equal(rows.move(null, 0, 1), undefined);
  assert.equal(rows.toggleSeparator(null, 0), undefined);
  assert.equal(rows.addSeparator(null, 0), false);
  assert.equal(rows.removeSeparator(null, 0), false);
  assert.equal(rows.delete(null, 0), false);

  const sheet = {
    name: "Players",
    columns: [{ name: "id", typeStr: "0" }, { name: "name", typeStr: "1" }],
    lines: [{ id: "a", name: "A", extra: true }, { id: "b", name: "B" }],
    separators: [1, { index: 1, title: "Object section" }],
    props: { separatorTitles: ["Numeric section", "Legacy title"] }
  };
  assert.equal(rows.insert(sheet, -2, { id: "new", name: "N" }), true);
  assert.deepEqual(sheet.lines.map((line) => line.id), ["new", "a", "b"]);
  assert.deepEqual(JSON.parse(JSON.stringify(sheet.separators)), [2, { index: 2, title: "Object section" }]);
  assert.equal(rows.append(sheet), true);
  assert.equal(sheet.lines.length, 4);
  assert.match(sheet.lines.at(-1).id, /^new_/);
  assert.equal(rows.update(sheet, 1, { id: "a2" }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(sheet.lines[1])), { id: "a2" });
  assert.equal(rows.update(sheet, 99, {}), false);
  assert.equal(rows.update(sheet, 1, []), false);
  assert.equal(rows.move(sheet, 0, -1), undefined);
  rows.move(sheet, 0, 1);
  assert.equal(sheet.lines[1].id, "new");
  assert.equal(rows.move(sheet, 99, 1), undefined);

  assert.equal(rows.toggleSeparator(sheet, 2), true);
  assert.equal(sheet.separators.length, 1);
  assert.equal(rows.toggleSeparator(sheet, 1), true);
  assert.deepEqual(JSON.parse(JSON.stringify(sheet.separators)), [1, { index: 2, title: "Object section" }]);
  assert.equal(rows.addSeparator(sheet, 1), false);
  assert.equal(rows.addSeparator(sheet, 3), true);
  assert.equal(rows.removeSeparator(sheet, 99), false);
  assert.equal(rows.removeSeparator(sheet, 3), true);
  assert.equal(rows.updateSeparatorTitle(sheet, 0, "Updated"), true);
  assert.equal(sheet.props.separatorTitles[0], "Updated");

  sheet.separators = [{ index: 1, title: "Inline" }];
  assert.equal(rows.updateSeparatorTitle(sheet, 0, "Renamed"), true);
  assert.equal(sheet.separators[0].title, "Renamed");
  assert.equal(rows.delete(sheet, 1), true);
  assert.equal(rows.delete(sheet, -1), false);
  assert.equal(rows.delete(sheet, 99), false);
});
