const assert = require("node:assert/strict");
const test = require("node:test");
const { createWebviewHarness } = require("./helpers/webviewHarness");

function click(element) {
  assert.ok(element, "expected an element to click");
  element.dispatchEvent({ type: "click", target: element });
}

function buttonByText(root, text) {
  return root.querySelectorAll("button").find((button) => button.textContent === text);
}

function sheet(name = "Players") {
  return { name, columns: [], lines: [], separators: [], props: {} };
}

test("view summary exposes removable search, filter, and sort pills", () => {
  const target = sheet();
  target.columns = [
    { name: "enabled", typeStr: "2" },
    { name: "score", typeStr: "3" },
    { name: "kind", typeStr: "5:a,b" },
    { name: "flags", typeStr: "10:x,y" },
    { name: "name", typeStr: "1" }
  ];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.CDBVS.viewState.setFilter("needle");
  harness.CDBVS.sheetState.view.setFilters("Players", {
    enabled: { value: "true" }, score: { min: "2", max: "5" }, kind: { value: "1" }, flags: { mask: 2 }, name: { value: "a" }
  });
  harness.CDBVS.sheetState.view.cycleSort("Players", "score");
  const items = harness.CDBVS.activeViewItems(target);
  assert.equal(items.length, 7);
  assert.match(items[0].label, /Search/);
  assert.match(items[1].label, /enabled = True/);
  assert.match(items[2].label, /score >= 2 and <= 5/);
  assert.match(items[3].label, /kind = b/);
  assert.match(items[4].label, /flags mask 2/);
  assert.match(items[5].label, /name contains/);
  assert.match(items[6].label, /Sort: score/);
  items[0].remove();
  assert.equal(harness.CDBVS.viewState.getFilter(), "");
  items[1].remove();
  assert.equal(harness.CDBVS.sheetState.view.readFilters("Players").enabled, undefined);
  items.at(-1).remove();
  assert.equal(harness.CDBVS.sheetState.view.readSort("Players").column, "");

  const container = harness.document.createElement("div");
  harness.CDBVS.renderViewSummary(container, target);
  assert.equal(container.querySelectorAll(".view-pill").length, 4);
  harness.CDBVS.sheetState.view.clear();
  harness.CDBVS.renderViewSummary(container, target);
  assert.equal(container.querySelector(".view-summary-empty").textContent, "No search, filters, or sorting applied.");
});

test("viewport remember and restore synchronize the table and horizontal dock", () => {
  const harness = createWebviewHarness({ customTypes: [], sheets: [] });
  harness.CDBVS.rememberViewport();
  harness.CDBVS.restoreViewport();
  const table = harness.document.createElement("div");
  table.className = "table-wrap";
  table.scrollLeft = 42;
  table.scrollTop = 84;
  const dock = harness.document.createElement("div");
  dock.className = "horizontal-scroll-dock";
  harness.document.body.appendChild(table);
  harness.document.body.appendChild(dock);
  harness.CDBVS.rememberViewport();
  assert.equal(harness.state.scrollLeft, 42);
  assert.equal(harness.state.scrollTop, 84);
  table.scrollLeft = 0;
  table.scrollTop = 0;
  dock.scrollLeft = 0;
  harness.CDBVS.restoreViewport();
  assert.equal(table.scrollLeft, 42);
  assert.equal(table.scrollTop, 84);
  assert.equal(dock.scrollLeft, 42);
});

test("viewport tracking follows scroll events and keeps sheet and raw positions separate", () => {
  const harness = createWebviewHarness({ customTypes: [], sheets: [] });
  const app = harness.document.createElement("div");
  harness.CDBVS.app = app;
  harness.document.body.appendChild(app);

  const firstTable = harness.document.createElement("div");
  firstTable.className = "table-wrap";
  firstTable.dataset.cdbvsViewportKey = "table:Players";
  const firstDock = harness.document.createElement("div");
  firstDock.className = "horizontal-scroll-dock";
  app.appendChild(firstTable);
  app.appendChild(firstDock);
  harness.CDBVS.restoreViewport();
  firstTable.scrollLeft = 42;
  firstTable.scrollTop = 84;
  firstTable.dispatchEvent({ type: "scroll", target: firstTable });

  const secondTable = harness.document.createElement("div");
  secondTable.className = "table-wrap";
  secondTable.dataset.cdbvsViewportKey = "table:Scores";
  const secondDock = harness.document.createElement("div");
  secondDock.className = "horizontal-scroll-dock";
  app.replaceChildren(secondTable, secondDock);
  harness.CDBVS.restoreViewport();
  assert.equal(secondTable.scrollLeft, 0);
  assert.equal(secondTable.scrollTop, 0);

  const raw = harness.document.createElement("textarea");
  raw.className = "raw-editor";
  raw.dataset.cdbvsViewportKey = "raw";
  app.replaceChildren(raw);
  harness.CDBVS.restoreViewport();
  raw.scrollLeft = 3;
  raw.scrollTop = 7;
  raw.dispatchEvent({ type: "scroll", target: raw });

  const renamedTable = harness.document.createElement("div");
  renamedTable.className = "table-wrap";
  renamedTable.dataset.cdbvsViewportKey = "table:Renamed";
  const renamedDock = harness.document.createElement("div");
  renamedDock.className = "horizontal-scroll-dock";
  app.replaceChildren(renamedTable, renamedDock);
  harness.CDBVS.renameViewport("Players", "Renamed");
  harness.CDBVS.restoreViewport();
  assert.equal(renamedTable.scrollLeft, 42);
  assert.equal(renamedTable.scrollTop, 84);
  assert.equal(renamedDock.scrollLeft, 42);

  app.replaceChildren(raw);
  raw.scrollLeft = 0;
  raw.scrollTop = 0;
  harness.CDBVS.restoreViewport();
  assert.equal(raw.scrollLeft, 3);
  assert.equal(raw.scrollTop, 7);
});

test("row editor keeps a draft until Save and text editor supports cancel and save", () => {
  const target = {
    name: "Players",
    columns: [{ name: "id", typeStr: "0" }, { name: "name", typeStr: "1" }],
    lines: [{ id: "p1", name: "Alice" }]
  };
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.CDBVS.makeCellEditor = (container, draft, column) => {
    const input = harness.document.createElement("input");
    input.value = draft[column.name] || "";
    input.addEventListener("change", () => { draft[column.name] = input.value; });
    container.appendChild(input);
  };
  harness.CDBVS.openRowEditor(target, 0);
  let overlay = harness.document.querySelector(".row-modal");
  assert.match(overlay.querySelector(".text-modal-heading strong").textContent, /Edit row: p1/);
  const inputs = overlay.querySelectorAll("input");
  inputs[1].value = "Changed";
  click(buttonByText(overlay, "Cancel"));
  assert.equal(target.lines[0].name, "Alice");

  harness.CDBVS.openRowEditor(target, 0);
  overlay = harness.document.querySelector(".row-modal");
  overlay.querySelectorAll("input")[1].value = "Changed";
  click(buttonByText(overlay, "Save"));
  assert.equal(target.lines[0].name, "Changed");
  assert.equal(harness.updates.length, 1);

  const input = harness.document.createElement("input");
  input.value = "Changed";
  harness.CDBVS.openTextEditor(target.lines[0], target.columns[1], input);
  overlay = harness.document.querySelector(".text-modal");
  overlay.querySelector("textarea").value = "Final";
  click(buttonByText(overlay, "Cancel"));
  assert.equal(target.lines[0].name, "Changed");
  let renderCount = 0;
  const render = harness.CDBVS.render;
  harness.CDBVS.render = () => { renderCount += 1; render(); };
  harness.CDBVS.openTextEditor(target.lines[0], target.columns[1], input);
  overlay = harness.document.querySelector(".text-modal");
  overlay.querySelector("textarea").value = "Final";
  click(buttonByText(overlay, "Save"));
  assert.equal(target.lines[0].name, "Final");
  assert.equal(input.value, "Final");
  assert.equal(renderCount, 0);
});

test("invalid numeric filter ranges keep the draft open without changing the active view", () => {
  const target = { name: "Rows", columns: [{ name: "score", typeStr: "3" }], lines: [{ score: 2 }] };
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.CDBVS.openFilterModal(target);
  const modal = harness.document.querySelector(".filter-modal");
  const [min, max] = modal.querySelectorAll("input");
  const apply = buttonByText(modal, "Apply");
  min.value = "5"; max.value = "2";
  min.dispatchEvent({ type: "input" }); max.dispatchEvent({ type: "input" });
  click(apply);
  assert.equal(min.getAttribute("aria-invalid"), "true");
  assert.match(harness.statuses.at(-1).message, /Minimum cannot exceed Maximum/);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.state.columnFilters.Rows)), {});
  min.value = "1.5"; min.dispatchEvent({ type: "input" }); click(apply);
  assert.match(harness.statuses.at(-1).message, /whole number/);
  min.value = "1"; min.dispatchEvent({ type: "input" }); click(apply);
  assert.equal(harness.state.columnFilters.Rows.score.min, "1");
  assert.equal(harness.document.querySelector(".filter-modal"), null);
});

test("filter modal renders all specialized controls and applies a draft atomically", () => {
  const target = {
    name: "Players",
    columns: [
      { name: "enabled", typeStr: "2" }, { name: "score", typeStr: "3" }, { name: "ratio", typeStr: "4" },
      { name: "color", typeStr: "11" }, { name: "kind", typeStr: "5:a,b" }, { name: "flags", typeStr: "10:x,y" },
      { name: "name", typeStr: "1" }, { name: "items", typeStr: "8" }
    ],
    lines: []
  };
  const refs = { name: "Targets", columns: [{ name: "id", typeStr: "0" }], lines: [{ id: "one" }] };
  target.columns.splice(6, 0, { name: "target", typeStr: "6:Targets" });
  const harness = createWebviewHarness({ customTypes: [], sheets: [target, refs] });
  harness.state.columnFilters.Players = { kind: { value: "9" }, target: { value: "missing" } };
  harness.CDBVS.openFilterModal(target);
  const overlay = harness.document.querySelector(".filter-modal");
  const fields = overlay.querySelectorAll(".filter-field");
  assert.equal(fields.length, target.columns.length);
  const bool = fields.find((field) => field.textContent.includes("enabled"));
  const boolSelect = bool.querySelector("select");
  boolSelect.value = "true";
  boolSelect.dispatchEvent({ type: "change" });
  const score = fields.find((field) => field.textContent.includes("score"));
  const scoreInputs = score.querySelectorAll("input");
  scoreInputs[0].value = "3";
  scoreInputs[0].dispatchEvent({ type: "input" });
  scoreInputs[1].value = "8";
  scoreInputs[1].dispatchEvent({ type: "input" });
  const enumSelect = fields.find((field) => field.textContent.includes("kind")).querySelector("select");
  assert.equal(enumSelect.value, "9");
  assert.equal(enumSelect.querySelectorAll("option").some((option) => option.textContent === "Missing value: 9"), true);
  enumSelect.value = "1";
  enumSelect.dispatchEvent({ type: "change" });
  const refSelect = fields.find((field) => field.textContent.includes("target")).querySelector("select");
  assert.equal(refSelect.value, "missing");
  assert.equal(refSelect.querySelectorAll("option").some((option) => option.textContent === "Missing value: missing"), true);
  refSelect.value = "one";
  refSelect.dispatchEvent({ type: "change" });
  const flags = fields.find((field) => field.textContent.includes("flags"));
  const checks = flags.querySelectorAll("input");
  checks[1].checked = true;
  checks[1].dispatchEvent({ type: "change" });
  const generic = fields.find((field) => field.textContent.includes("name"));
  const genericInput = generic.querySelector("input");
  genericInput.value = "Alice";
  genericInput.dispatchEvent({ type: "input" });
  assert.deepEqual(JSON.parse(JSON.stringify(harness.state.columnFilters.Players)), { kind: { value: "9" }, target: { value: "missing" } });
  click(buttonByText(overlay, "Apply"));
  assert.equal(harness.state.columnFilters.Players.enabled.value, "true");
  assert.equal(harness.state.columnFilters.Players.score.min, "3");
  assert.equal(harness.state.columnFilters.Players.score.max, "8");
  assert.equal(harness.state.columnFilters.Players.kind.value, "1");
  assert.equal(harness.state.columnFilters.Players.target.value, "one");
  assert.equal(harness.state.columnFilters.Players.flags.mask, 2);
  assert.equal(harness.state.columnFilters.Players.name.value, "Alice");
});

test("context menus position safely, expose disabled actions, and close on selection or outside click", () => {
  const target = sheet();
  target.columns = [{ name: "name", typeStr: "1" }];
  target.lines = [{ name: "Alice" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.context.innerWidth = 10;
  harness.context.innerHeight = 10;
  harness.CDBVS.showContextMenu({ clientX: 95, clientY: 75 }, [
    { label: "Disabled", disabled: true, action() {} },
    { separator: true },
    { label: "Chosen", action() { harness.state.filter = "chosen"; } }
  ]);
  let menu = harness.document.querySelector(".context-menu");
  assert.equal(harness.CDBVS.hasContextMenu(), true);
  assert.equal(menu.getAttribute("role"), "menu");
  assert.equal(menu.querySelectorAll(".context-menu-separator").length, 1);
  assert.equal(menu.querySelectorAll("button")[0].disabled, true);
  assert.equal(menu.style.left, "5px");
  assert.equal(menu.style.top, "5px");
  click(menu.querySelectorAll("button")[1]);
  assert.equal(harness.state.filter, "chosen");
  assert.equal(harness.CDBVS.hasContextMenu(), false);

  harness.CDBVS.showContextMenu({ clientX: 20, clientY: 20 }, [{ label: "Close", action() {} }]);
  menu = harness.document.querySelector(".context-menu");
  harness.document.dispatchEvent({ type: "pointerdown", target: harness.document.body });
  assert.equal(harness.CDBVS.hasContextMenu(), false);

  harness.CDBVS.selectRow(target, 0);
  harness.CDBVS.showRowContextMenu({ clientX: 10, clientY: 10 }, target, 0);
  menu = harness.document.querySelector(".context-menu");
  assert.equal(menu.querySelectorAll("button").length, 9);
  assert.equal(menu.querySelectorAll("button")[4].disabled, true);
});

test("separator context menu removes the separator and refreshes the sheet", () => {
  const target = sheet("Players");
  target.columns = [{ name: "id", typeStr: "0" }];
  target.lines = [{ id: "a" }];
  target.separators = [{ index: 0, title: "First" }];
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.CDBVS.showSeparatorContextMenu({ clientX: 10, clientY: 10 }, target, 0);
  let menu = harness.document.querySelector(".context-menu");
  assert.deepEqual(menu.querySelectorAll("button").map((button) => button.textContent), ["Collapse All", "Expand All", "Remove Separator"]);
  click(buttonByText(menu, "Collapse All"));
  assert.equal(harness.CDBVS.isSeparatorCollapsed(target, 0), true);
  harness.CDBVS.showSeparatorContextMenu({ clientX: 10, clientY: 10 }, target, 0);
  menu = harness.document.querySelector(".context-menu");
  click(buttonByText(menu, "Expand All"));
  assert.equal(harness.CDBVS.isSeparatorCollapsed(target, 0), false);
  harness.CDBVS.showSeparatorContextMenu({ clientX: 10, clientY: 10 }, target, 0);
  menu = harness.document.querySelector(".context-menu");
  click(buttonByText(menu, "Remove Separator"));
  assert.deepEqual(target.separators, []);
  assert.equal(harness.updates.length, 1);
});

test("clipboard actions handle system clipboard success, malformed data, and rejected reads", async () => {
  const target = { name: "Players", columns: [{ name: "id", typeStr: "0" }, { name: "name", typeStr: "1" }], lines: [{ id: "p1", name: "Alice" }] };
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.CDBVS.selectCell(target, 0, 1);
  const writes = [];
  let clipboardText = "CDBVS_CELL\n{\"hasValue\":true,\"value\":\"Bob\"}";
  harness.context.navigator = {
    clipboard: {
      writeText: (text) => { writes.push(text); return Promise.resolve(); },
      readText: () => Promise.resolve(clipboardText)
    }
  };
  assert.equal(harness.CDBVS.copySelectedRow(target, false), true);
  assert.equal(writes.length, 1);
  assert.match(writes[0], /^CDBVS_CELL\n/);
  harness.state.cellClipboard = null;
  assert.equal(harness.CDBVS.pasteSelectedRow(target), true);
  await Promise.resolve();
  assert.equal(target.lines[0].name, "Bob");

  clipboardText = "not CDBVS data";
  harness.state.cellClipboard = null;
  harness.CDBVS.pasteSelectedRow(target);
  await Promise.resolve();
  assert.match(harness.statuses.at(-1).message, /does not contain a CDBVS cell/);
  harness.context.navigator.clipboard.readText = () => Promise.reject(new Error("denied"));
  harness.CDBVS.pasteSelectedRow(target);
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(harness.statuses.at(-1).message, /Unable to read the clipboard/);
});

test("sheet deletion confirmation cancels without mutation and deletes only after confirmation", () => {
  const first = sheet("First");
  const second = sheet("Second");
  const harness = createWebviewHarness({ customTypes: [], sheets: [first, second] });
  harness.CDBVS.openDeleteSheetConfirmation(first);
  let overlay = harness.document.querySelector(".confirm-modal");
  assert.match(overlay.textContent, /Delete 'First'/);
  click(buttonByText(overlay, "Cancel"));
  assert.deepEqual(harness.state.data.sheets.map((item) => item.name), ["First", "Second"]);
  harness.CDBVS.openDeleteSheetConfirmation(first);
  overlay = harness.document.querySelector(".confirm-modal");
  click(buttonByText(overlay, "Delete sheet"));
  assert.deepEqual(harness.state.data.sheets.map((item) => item.name), ["Second"]);
});

test("raw JSON view reports invalid drafts and commits valid replacements", () => {
  const harness = createWebviewHarness({ customTypes: [], sheets: [sheet()] });
  const container = harness.document.createElement("main");
  harness.CDBVS.renderRaw(container);
  const editor = container.querySelector("textarea");
  const apply = buttonByText(container, "Apply JSON");
  editor.value = "{";
  click(apply);
  assert.equal(harness.statuses.at(-1).error, true);
  assert.equal(harness.state.data.sheets.length, 1);
  editor.value = JSON.stringify({ customTypes: [], sheets: [{ name: "Replaced", columns: [], lines: [] }] });
  click(apply);
  assert.equal(harness.state.data.sheets[0].name, "Replaced");
  assert.equal(harness.updates.length, 1);
});

test("table body renders empty states, separators, selected rows, and collapsed sections", () => {
  const empty = { name: "Empty", columns: [{ name: "id", typeStr: "0" }], lines: [], separators: [] };
  const harness = createWebviewHarness({ customTypes: [], sheets: [empty] });
  harness.CDBVS.makeCellEditor = () => {};
  let body = harness.CDBVS.renderTableBody(empty);
  assert.equal(body.querySelector(".empty").textContent, "No rows yet. Use + Row to add your first row.");

  const target = {
    name: "Players",
    columns: [{ name: "id", typeStr: "0" }, { name: "name", typeStr: "1" }],
    lines: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
    separators: [{ index: 0, title: "First" }, 1],
    props: { separatorTitles: ["Fallback"] }
  };
  harness.state.data.sheets.push(target);
  harness.CDBVS.selectRow(target, 1);
  body = harness.CDBVS.renderTableBody(target);
  assert.equal(body.querySelectorAll(".separator-row").length, 2);
  assert.equal(body.querySelectorAll("tr").filter((row) => row.dataset.rowIndex !== undefined).length, 2);
  assert.equal(body.querySelectorAll("tr").find((row) => row.dataset.rowIndex === "1").className, "row-selected");
  const firstToggle = body.querySelectorAll(".separator-toggle")[0];
  const firstSection = body.querySelectorAll(".separator-row")[0];
  firstSection.dispatchEvent({ type: "dblclick", preventDefault() {} });
  assert.equal(harness.CDBVS.isSeparatorCollapsed(target, 0), true);
  assert.equal(body.querySelectorAll("tr").find((row) => row.dataset.rowIndex === "0").hidden, true);
  firstSection.dispatchEvent({ type: "dblclick", preventDefault() {} });
  assert.equal(harness.CDBVS.isSeparatorCollapsed(target, 0), false);
  click(firstToggle);
  assert.equal(body.querySelectorAll("tr").filter((row) => row.dataset.rowIndex !== undefined && !row.hidden).length, 1);
  assert.equal(body.querySelectorAll("tr").find((row) => row.dataset.rowIndex === "0").hidden, true);
  click(firstToggle);
  assert.equal(body.querySelectorAll("tr").filter((row) => row.dataset.rowIndex !== undefined && !row.hidden).length, 2);
  assert.equal(body.querySelectorAll("tr").find((row) => row.dataset.rowIndex === "0").hidden, false);
  assert.equal(harness.renders.length, 0);
});

test("section title editing persists inline without rebuilding the table", () => {
  const target = {
    name: "Players",
    columns: [{ name: "id", typeStr: "0" }],
    lines: [{ id: "a" }],
    separators: [{ index: 0, title: "First" }],
    props: {}
  };
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.CDBVS.makeCellEditor = () => {};
  const body = harness.CDBVS.renderTableBody(target);
  const section = body.querySelector(".separator-row");
  const titleSpan = section.querySelector(".separator-title");
  titleSpan.dispatchEvent({ type: "dblclick", preventDefault() {}, stopPropagation() {} });
  const input = section.querySelector("input");
  input.value = "Updated";
  input.dispatchEvent({ type: "keydown", key: "Enter", preventDefault() {} });
  assert.equal(target.separators[0].title, "Updated");
  assert.equal(section.querySelector("input"), null);
  assert.equal(section.querySelectorAll("span").find((span) => span.textContent === "Updated") !== undefined, true);
  assert.equal(harness.updates.length, 1);
  assert.equal(harness.renders.length, 0);

  titleSpan.dispatchEvent({ type: "dblclick", preventDefault() {}, stopPropagation() {} });
  section.querySelector("input").value = "";
  section.querySelector("input").dispatchEvent({ type: "keydown", key: "Enter", preventDefault() {} });
  assert.equal(target.separators.length, 1);
  assert.equal(target.separators[0].title, "");
  assert.equal(section.querySelector(".separator-title").textContent, "");

  section.querySelector(".separator-title").dispatchEvent({ type: "dblclick", preventDefault() {}, stopPropagation() {} });
  section.querySelector("input").value = "Renamed after blank";
  section.querySelector("input").dispatchEvent({ type: "keydown", key: "Enter", preventDefault() {} });
  assert.equal(target.separators[0].title, "Renamed after blank");
});

test("filtered rows retain the header for their matching section", () => {
  const target = {
    name: "Players",
    columns: [{ name: "id", typeStr: "0" }, { name: "name", typeStr: "1" }],
    lines: [{ id: "a", name: "Hidden" }, { id: "b", name: "Keep me" }],
    separators: [{ index: 0, title: "Players" }],
    props: {}
  };
  const harness = createWebviewHarness({ customTypes: [], sheets: [target] });
  harness.CDBVS.makeCellEditor = () => {};
  harness.CDBVS.viewState.setFilter("Keep me");
  assert.deepEqual(harness.CDBVS.rowsForView(target).map((entry) => entry.rowIndex), [1]);
  const body = harness.CDBVS.renderTableBody(target);
  assert.equal(body.querySelectorAll(".separator-row").length, 1);
  assert.equal(body.querySelector(".separator-row").textContent.includes("Players"), true);
  assert.equal(body.querySelectorAll("tr").find((row) => row.dataset.rowIndex === "1") !== undefined, true);
});
