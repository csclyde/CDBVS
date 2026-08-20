const assert = require("node:assert/strict");
const test = require("node:test");
const { createWebviewHarness, loadScript } = require("./helpers/webviewHarness");

function makeFixture() {
  const parent = {
    name: "Groups",
    columns: [{ name: "members", typeStr: "8" }],
    lines: [{ members: [{ name: "Ada" }, { name: "Grace" }] }],
    separators: [],
    props: {}
  };
  const child = {
    name: "Groups@members",
    columns: [{ name: "name", typeStr: "1" }],
    lines: [],
    separators: [],
    props: {}
  };
  const harness = createWebviewHarness({ customTypes: [], sheets: [parent, child] });
  loadScript(harness.context, "EditorCells.js");
  const cell = harness.document.createElement("td");
  harness.CDBVS.makeCellEditor(cell, parent.lines[0], parent.columns[0], {
    sheet: parent,
    rowIndex: 0,
    path: "Groups/0"
  });
  return { harness, parent, cell };
}

function click(button) {
  button.dispatchEvent({ type: "click", target: button, preventDefault() {}, stopPropagation() {} });
}

function modalParts(harness) {
  const overlay = harness.document.querySelector(".text-modal-overlay");
  const dialog = overlay && overlay.querySelector(".list-modal");
  return { overlay, dialog };
}

test("list activation opens one modal instead of inline rows", () => {
  const { harness, cell } = makeFixture();
  const toggle = cell.querySelector(".list-toggle");
  click(toggle);
  const { dialog } = modalParts(harness);

  assert.ok(dialog);
  assert.equal(cell.querySelector(".list-editor"), null);
  assert.equal(dialog.querySelectorAll(".list-modal-table tbody tr").length, 2);
  assert.equal(dialog.querySelectorAll("td").filter((item) => item.classList.contains("cell-selected")).length, 1);
});

test("list modal keeps edits draft-only and supports add/delete buttons", () => {
  const { harness, parent, cell } = makeFixture();
  click(cell.querySelector(".list-toggle"));
  const { dialog } = modalParts(harness);
  const add = dialog.querySelectorAll("button").find((button) => button.textContent === "Add row");
  const remove = dialog.querySelectorAll("button").find((button) => button.textContent === "Delete selected");
  click(add);
  assert.equal(dialog.querySelectorAll(".list-modal-table tbody tr").length, 3);
  assert.equal(parent.lines[0].members.length, 2);
  assert.equal(remove.disabled, false);
  click(remove);
  assert.equal(dialog.querySelectorAll(".list-modal-table tbody tr").length, 2);
  assert.equal(parent.lines[0].members.length, 2);

  const input = dialog.querySelector(".list-modal-table tbody tr input");
  input.value = "Bea";
  input.dispatchEvent({ type: "change", target: input });
  harness.renders.length = 0;
  click(dialog.querySelectorAll("button").find((button) => button.textContent === "Save"));
  assert.equal(parent.lines[0].members[0].name, "Bea");
  assert.equal(harness.updates.length, 1);
  assert.equal(harness.renders.length, 0);
});

test("list modal keyboard navigation and row context menu use the modal grid", () => {
  const { harness, cell } = makeFixture();
  click(cell.querySelector(".list-toggle"));
  const { overlay, dialog } = modalParts(harness);
  let prevented = false;
  overlay.dispatchEvent({ type: "keydown", key: "ArrowDown", target: dialog, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(dialog.querySelectorAll("td").filter((item) => item.classList.contains("cell-selected")).some((item) => item.dataset.rowIndex === "1"), true);

  const rowNumber = dialog.querySelectorAll("tbody tr")[1].querySelector(".row-number");
  rowNumber.dispatchEvent({ type: "contextmenu", target: rowNumber, clientX: 1, clientY: 1, preventDefault() {}, stopPropagation() {} });
  const menu = harness.document.querySelector(".context-menu");
  assert.ok(menu);
  click(menu.querySelectorAll("button").find((button) => button.textContent === "Add row below"));
  assert.equal(dialog.querySelectorAll(".list-modal-table tbody tr").length, 3);
  assert.equal(dialog.querySelectorAll("td").filter((item) => item.classList.contains("cell-selected")).length, 1);
});

test("nested list modal restores its parent after save", () => {
  const { harness, cell } = makeFixture();
  const child = harness.state.data.sheets[1];
  child.columns.push({ name: "children", typeStr: "8" });
  harness.state.data.sheets.push({
    name: "Groups@members@children",
    columns: [{ name: "label", typeStr: "1" }],
    lines: [],
    separators: [],
    props: {}
  });
  click(cell.querySelector(".list-toggle"));
  const parentDialog = modalParts(harness).dialog;
  const itemCell = parentDialog.querySelectorAll("td").find((item) => item._cdbvsOpenListEditor);
  itemCell._cdbvsOpenListEditor();
  const nested = modalParts(harness).dialog;
  assert.ok(nested);
  click(nested.querySelectorAll("button").find((button) => button.textContent === "Save"));
  assert.equal(harness.document.querySelectorAll(".text-modal-overlay").length, 1);
  assert.equal(harness.document.querySelector(".list-modal"), parentDialog);
});
