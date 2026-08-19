const assert = require("node:assert/strict");
const test = require("node:test");
const { isHostToWebviewMessage, isWebviewToHostMessage } = require("../dist/shared/protocol");

test("host protocol accepts only complete document and error messages", () => {
  assert.equal(isHostToWebviewMessage({
    type: "document",
    text: "{}",
    data: null,
    issues: [],
    rawMode: true,
    showHiddenSheets: false
  }), true);
  assert.equal(isHostToWebviewMessage({ type: "document", text: "{}", data: null, issues: [1], rawMode: true, showHiddenSheets: false }), false);
  assert.equal(isHostToWebviewMessage({ type: "document", text: "{}", data: [], issues: [], rawMode: true, showHiddenSheets: false }), false);
  assert.equal(isHostToWebviewMessage({ type: "error", message: "bad JSON" }), true);
  assert.equal(isHostToWebviewMessage({ type: "error", message: 12 }), false);
});

test("webview protocol rejects unknown and malformed commands", () => {
  assert.equal(isWebviewToHostMessage({ type: "ready" }), true);
  assert.equal(isWebviewToHostMessage({ type: "update", text: "{}" }), true);
  assert.equal(isWebviewToHostMessage({ type: "update", text: 12 }), false);
  assert.equal(isWebviewToHostMessage({ type: "save", extra: "ignored" }), true);
  assert.equal(isWebviewToHostMessage({ type: "unknown" }), false);
  assert.equal(isWebviewToHostMessage(null), false);
});
