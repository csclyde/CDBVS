const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const parser = require("../dist/cdb/Parser");

const fixtureRoot = path.join(__dirname, "fixtures");

test("CastleDB fixtures parse as valid editor documents and round-trip", () => {
  for (const name of ["data.cdb", "sample.cdb"]) {
    const text = fs.readFileSync(path.join(fixtureRoot, name), "utf8");
    const result = parser.parseCdb(text);
    assert.deepEqual(result.issues, [], name);
    assert.equal(parser.isEditorShapeValid(result.data), true, name);
    assert.deepEqual(parser.parseCdb(parser.serializeCdb(result.data)).data, result.data, name);
  }
});

test("type strings preserve CastleDB codes, arguments, and values", () => {
  assert.deepEqual(parser.parseType("0"), { code: 0, name: "id", argument: "", raw: "0" });
  assert.deepEqual(parser.parseType("5:easy,hard"), { code: 5, name: "enum", argument: "easy,hard", raw: "5:easy,hard", values: ["easy", "hard"] });
  assert.deepEqual(parser.parseType("6:Players"), { code: 6, name: "ref", argument: "Players", raw: "6:Players", target: "Players" });
  assert.equal(parser.parseType("999").code, -1);
  assert.equal(parser.parseType("3garbage").code, -1);
  assert.equal(parser.parseType("4.5").code, -1);
});

test("validation catches malformed separators and duplicate custom definitions", () => {
  const issues = parser.validateData({
    customTypes: [
      { name: "Kind", cases: [{ name: "Basic", args: [] }, { name: "Basic", args: [] }] },
      { name: "Kind", cases: [] }
    ],
    sheets: [{
      name: "Players",
      columns: [{ name: "id", typeStr: "0" }],
      lines: [{ id: "one" }],
      separators: [{ title: "missing index" }]
    }]
  });
  assert.ok(issues.some((issue) => issue.includes("invalid separator")));
  assert.ok(issues.some((issue) => issue.includes("Duplicate custom type 'Kind'")));
  assert.ok(issues.some((issue) => issue.includes("Duplicate case 'Kind.Basic'")));
});

test("editor shape validation rejects ambiguous schemas but permits duplicate row IDs for repair", () => {
  const duplicateColumns = { customTypes: [], sheets: [{ name: "Players", columns: [{ name: "id", typeStr: "0" }, { name: "id", typeStr: "1" }], lines: [] }] };
  const unknownType = { customTypes: [], sheets: [{ name: "Players", columns: [{ name: "id", typeStr: "0garbage" }], lines: [] }] };
  const duplicateIds = { customTypes: [], sheets: [{ name: "Players", columns: [{ name: "id", typeStr: "0" }], lines: [{ id: "same" }, { id: "same" }] }] };
  assert.equal(parser.isEditorShapeValid(duplicateColumns), false);
  assert.equal(parser.isEditorShapeValid(unknownType), false);
  assert.equal(parser.isEditorShapeValid(duplicateIds), true);
});

test("validation reports malformed JSON, schema shape, and duplicate IDs", () => {
  assert.match(parser.parseCdb("{").issues[0], /^Invalid JSON:/);
  const data = {
    customTypes: [],
    sheets: [{
      name: "Players",
      columns: [{ name: "id", typeStr: "0" }],
      lines: [{ id: 1 }, { id: 1 }]
    }]
  };
  assert.deepEqual(parser.validateData(data), ["Duplicate id '1' in sheet 'Players'."]);
  assert.equal(parser.isEditorShapeValid({ customTypes: [], sheets: [{ name: "Broken", columns: [], lines: [null] }] }), false);
});

test("default values match the supported CastleDB primitive types", () => {
  const expected = new Map([
    ["0", ""], ["1", ""], ["2", false], ["3", 0], ["4", 0],
    ["5:a,b", 0], ["6:Players", ""], ["8", []], ["17", {}]
  ]);
  expected.forEach((value, type) => assert.deepEqual(parser.defaultValue({ typeStr: type }), value, type));
});
