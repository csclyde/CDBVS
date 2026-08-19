const assert = require("node:assert/strict");
const test = require("node:test");
const parser = require("../dist/cdb/Parser");

test("type strings accept both CastleDB field spellings and prefer typeStr", () => {
  assert.equal(parser.getTypeString(null), null);
  assert.equal(parser.getTypeString("1"), null);
  assert.equal(parser.getTypeString({}), null);
  assert.equal(parser.getTypeString({ type: 3 }), "3");
  assert.equal(parser.getTypeString({ type: 3, typeStr: "4:x" }), "4:x");
  assert.equal(parser.getTypeString({ typeStr: 0 }), "0");
});

test("all CastleDB type codes retain their names and special arguments", () => {
  parser.TYPE_NAMES.forEach((name, code) => {
    const parsed = parser.parseType(String(code));
    assert.equal(parsed.code, code);
    assert.equal(parsed.name, name);
    assert.equal(parsed.argument, "");
  });
  assert.deepEqual(parser.parseType(" 5:easy,hard "), {
    code: 5, name: "enum", argument: "easy,hard ", raw: " 5:easy,hard ", values: ["easy", "hard "]
  });
  assert.deepEqual(parser.parseType("10:Visible,Locked"), {
    code: 10, name: "flags", argument: "Visible,Locked", raw: "10:Visible,Locked", values: ["Visible", "Locked"]
  });
  assert.equal(parser.parseType("6:Players").target, "Players");
  assert.equal(parser.parseType("9:Kind").target, "Kind");
  assert.equal(parser.parseType("12:Players").target, "Players");
  assert.equal(parser.parseType("3 :x").code, 3);
  assert.equal(parser.parseType("+3").code, -1);
  assert.equal(parser.parseType("3.0").code, -1);
  assert.equal(parser.parseType("3garbage").code, -1);
  assert.equal(parser.parseType("21").code, -1);
  assert.equal(parser.parseType(null).code, -1);
});

test("default values and primary-column lookup cover optional and legacy fields", () => {
  const expected = new Map([
    [0, ""], [1, ""], [2, false], [3, 0], [4, 0], [5, 0], [6, ""], [7, ""],
    [8, []], [9, null], [10, 0], [11, 0], [12, ""], [13, ""], [14, null],
    [15, null], [16, null], [17, {}], [18, null], [19, null], [20, null]
  ]);
  expected.forEach((value, code) => assert.deepEqual(parser.defaultValue({ typeStr: String(code) }), value, String(code)));
  assert.deepEqual(parser.defaultValue({ type: "2" }), false);
  assert.equal(parser.idColumn(null), null);
  assert.equal(parser.idColumn({ columns: [] }), null);
  const id = { name: "key", type: 0 };
  assert.strictEqual(parser.idColumn({ columns: [{ name: "name", typeStr: "1" }, id] }), id);
});

test("serializeCdb uses CastleDB indentation, a trailing newline, and preserves unknown data", () => {
  const data = {
    customTypes: [],
    sheets: [{ name: "Players", columns: [{ name: "id", typeStr: "0", futureColumnField: { keep: true } }], lines: [{ id: "p1", futureRowField: [1, 2] }], futureSheetField: "keep" }],
    futureRootField: { enabled: true }
  };
  const text = parser.serializeCdb(data);
  assert.equal(text.endsWith("\n"), true);
  assert.match(text, /\n\t"sheets"/);
  assert.match(text, /"futureColumnField"/);
  assert.deepEqual(parser.parseCdb(text).data, data);
});

test("validateData reports malformed roots, sheets, columns, rows, and separators", () => {
  assert.ok(parser.validateData(null).includes("The document root must be a JSON object."));
  assert.ok(parser.validateData([]).includes("The document root must be a JSON object."));
  const issues = parser.validateData({
    sheets: [
      null,
      { name: "", columns: [null, { name: "", typeStr: "999" }, { name: "x", typeStr: "1" }, { name: "x", typeStr: "1" }], lines: [null, []], props: [], separators: [-1, 1.5, {}, { index: -1 }, { id: "" }, { id: "ok" }] },
      { name: "Players", columns: [], lines: [] },
      { name: "Players", columns: [], lines: [] }
    ],
    customTypes: []
  });
  assert.ok(issues.includes("A sheet is not an object."));
  assert.ok(issues.some((issue) => issue.includes("missing a valid name")));
  assert.ok(issues.some((issue) => issue.includes("invalid properties")));
  assert.ok(issues.some((issue) => issue.includes("invalid separator")));
  assert.ok(issues.some((issue) => issue.includes("invalid row")));
  assert.ok(issues.some((issue) => issue.includes("invalid column")));
  assert.ok(issues.some((issue) => issue.includes("without a valid name")));
  assert.ok(issues.some((issue) => issue.includes("Unknown type '999'")));
  assert.ok(issues.includes("Duplicate sheet name 'Players'."));
});

test("validateData checks custom type cases, arguments, and duplicate identifiers", () => {
  const issues = parser.validateData({
    customTypes: [
      null,
      { name: "Kind", cases: [null, { name: "Basic", args: [{ typeStr: "999" }, { typeStr: "9:Missing" }] }, { name: "Basic", args: [] }] },
      { name: "Kind", cases: "bad" },
      { name: "Broken", cases: [{ name: "Case", args: [{ typeStr: "1" }] }] },
      { name: "NoCases" }
    ],
    sheets: [{ name: "Players", columns: [{ name: "id", typeStr: "0" }], lines: [{ id: "x" }, { id: "x" }, { id: null }, { id: "" }] }]
  });
  assert.ok(issues.includes("Duplicate custom type 'Kind'."));
  assert.ok(issues.includes("Duplicate case 'Kind.Basic'."));
  assert.ok(issues.includes("Unknown custom type argument '999'."));
  assert.ok(issues.includes("Custom type 'Missing' is not defined."));
  assert.ok(issues.includes("A custom type is not an object."));
  assert.ok(issues.includes("Custom type 'NoCases' has no valid cases array."));
  assert.ok(issues.includes("Duplicate id 'x' in sheet 'Players'."));
});

test("isEditorShapeValid is strict about editor structure but allows repairable row IDs", () => {
  const base = { customTypes: [], sheets: [{ name: "Players", columns: [{ name: "id", typeStr: "0" }], lines: [] }] };
  assert.equal(parser.isEditorShapeValid(base), true);
  assert.equal(parser.isEditorShapeValid({ ...base, sheets: "bad" }), false);
  assert.equal(parser.isEditorShapeValid({ ...base, customTypes: "bad" }), false);
  assert.equal(parser.isEditorShapeValid({ ...base, sheets: [{ ...base.sheets[0], props: [] }] }), false);
  assert.equal(parser.isEditorShapeValid({ ...base, sheets: [{ ...base.sheets[0], separators: [{ title: "missing index" }] }] }), false);
  assert.equal(parser.isEditorShapeValid({ ...base, sheets: [{ ...base.sheets[0], columns: [{ name: "id", typeStr: "0" }, { name: "id", typeStr: "1" }] }] }), false);
  assert.equal(parser.isEditorShapeValid({ ...base, sheets: [{ ...base.sheets[0], lines: [null] }] }), false);
  assert.equal(parser.isEditorShapeValid({
    customTypes: [{ name: "Kind", cases: [{ name: "Basic", args: [{ name: "value", typeStr: "9:Missing" }] }] }],
    sheets: []
  }), true);
});
