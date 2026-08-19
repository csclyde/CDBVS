const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

function loadProvider(vscode) {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    return request === "vscode" ? vscode : originalLoad.call(this, request, parent, isMain);
  };
  try {
    const filename = require.resolve("../dist/extension");
    delete require.cache[filename];
    return require(filename).CdbEditorProvider;
  } finally {
    Module._load = originalLoad;
  }
}

function makeVscode(document, applyEdit) {
  class WorkspaceEdit {
    replace(uri, range, text) {
      this.uri = uri;
      this.range = range;
      this.text = text;
    }
  }
  class Range {
    constructor(start, end) {
      this.start = start;
      this.end = end;
    }
  }
  return {
    Uri: { joinPath: (...parts) => parts.join("/") },
    WorkspaceEdit,
    Range,
    window: {
      registerCustomEditorProvider() { return { dispose() {} }; },
      activeTextEditor: null
    },
    workspace: {
      onDidChangeTextDocument() { return { dispose() {} }; },
      onDidChangeConfiguration() { return { dispose() {} }; },
      getConfiguration() { return { get: () => false }; },
      applyEdit
    }
  };
}

function validDocumentText(title) {
  return `${JSON.stringify({
    customTypes: [],
    sheets: [{ name: "Players", columns: [{ name: "title", typeStr: "1" }], lines: [{ title }], props: {} }]
  })}\n`;
}

test("custom editor serializes concurrent webview document updates", async () => {
  let text = validDocumentText("initial");
  const applied = [];
  let activeEdits = 0;
  let maxActiveEdits = 0;
  const document = {
    uri: { toString: () => "file:///players.cdb" },
    getText: () => text,
    positionAt: (offset) => offset
  };
  const applyEdit = async (edit) => {
    activeEdits += 1;
    maxActiveEdits = Math.max(maxActiveEdits, activeEdits);
    await new Promise((resolve) => setTimeout(resolve, 5));
    text = edit.text;
    applied.push(edit.text);
    activeEdits -= 1;
    return true;
  };
  const vscode = makeVscode(document, applyEdit);
  const CdbEditorProvider = loadProvider(vscode);
  const messages = [];
  let receiveMessage;
  const webview = {
    options: null,
    html: "",
    asWebviewUri: (uri) => uri,
    postMessage: (message) => messages.push(message),
    onDidReceiveMessage: (handler) => { receiveMessage = handler; return { dispose() {} }; }
  };
  const panel = {
    webview,
    active: true,
    onDidChangeViewState: () => ({ dispose() {} }),
    onDidDispose: () => {}
  };
  const provider = new CdbEditorProvider({ extensionUri: "extension" });
  await provider.resolveCustomTextEditor(document, panel);
  const first = receiveMessage({ type: "update", text: validDocumentText("first") });
  const second = receiveMessage({ type: "update", text: validDocumentText("second") });
  await Promise.all([first, second]);

  assert.equal(maxActiveEdits, 1);
  assert.deepEqual(applied, [validDocumentText("first"), validDocumentText("second")]);
  assert.equal(text, validDocumentText("second"));
  assert.equal(messages.some((message) => message.type === "error"), false);
});

test("custom editor waits for queued updates before saving the document", async () => {
  let text = validDocumentText("initial");
  let saveCalls = 0;
  const document = {
    uri: { toString: () => "file:///players.cdb" },
    getText: () => text,
    positionAt: (offset) => offset,
    save: async () => {
      saveCalls += 1;
      assert.equal(text, validDocumentText("saved"));
      return true;
    }
  };
  const vscode = makeVscode(document, async (edit) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    text = edit.text;
    return true;
  });
  const CdbEditorProvider = loadProvider(vscode);
  const messages = [];
  let receiveMessage;
  const panel = {
    active: true,
    webview: {
      options: null,
      html: "",
      asWebviewUri: (uri) => uri,
      postMessage: (message) => messages.push(message),
      onDidReceiveMessage: (handler) => { receiveMessage = handler; return { dispose() {} }; }
    },
    onDidChangeViewState: () => ({ dispose() {} }),
    onDidDispose: () => {}
  };
  await new CdbEditorProvider({ extensionUri: "extension" }).resolveCustomTextEditor(document, panel);

  const update = receiveMessage({ type: "update", text: validDocumentText("saved") });
  const save = receiveMessage({ type: "save" });
  await Promise.all([update, save]);

  assert.equal(saveCalls, 1);
  assert.equal(messages.some((message) => message.type === "error"), false);
});

test("custom editor rejects malformed webview updates without changing the document", async () => {
  const originalText = validDocumentText("initial");
  let text = originalText;
  let applyCount = 0;
  const document = {
    uri: { toString: () => "file:///players.cdb" },
    getText: () => text,
    positionAt: (offset) => offset
  };
  const vscode = makeVscode(document, async (edit) => {
    applyCount += 1;
    text = edit.text;
    return true;
  });
  const CdbEditorProvider = loadProvider(vscode);
  const messages = [];
  let receiveMessage;
  const panel = {
    active: true,
    webview: {
      options: null,
      html: "",
      asWebviewUri: (uri) => uri,
      postMessage: (message) => messages.push(message),
      onDidReceiveMessage: (handler) => { receiveMessage = handler; return { dispose() {} }; }
    },
    onDidChangeViewState: () => ({ dispose() {} }),
    onDidDispose: () => {}
  };
  await new CdbEditorProvider({ extensionUri: "extension" }).resolveCustomTextEditor(document, panel);
  await receiveMessage({ type: "update", text: "not JSON" });

  assert.equal(applyCount, 0);
  assert.equal(text, originalText);
  assert.equal(messages.at(-1).type, "error");
});

test("a failed document update does not poison later saves", async () => {
  const originalText = validDocumentText("initial");
  let text = originalText;
  let saveCalls = 0;
  const document = {
    uri: { toString: () => "file:///players.cdb" },
    getText: () => text,
    positionAt: (offset) => offset,
    save: async () => { saveCalls += 1; return true; }
  };
  let applyCount = 0;
  const vscode = makeVscode(document, async (edit) => {
    applyCount += 1;
    if (applyCount === 1) throw new Error("transient edit failure");
    text = edit.text;
    return true;
  });
  const CdbEditorProvider = loadProvider(vscode);
  const messages = [];
  let receiveMessage;
  const panel = {
    active: true,
    webview: {
      options: null,
      html: "",
      asWebviewUri: (uri) => uri,
      postMessage: (message) => messages.push(message),
      onDidReceiveMessage: (handler) => { receiveMessage = handler; return { dispose() {} }; }
    },
    onDidChangeViewState: () => ({ dispose() {} }),
    onDidDispose: () => {}
  };
  await new CdbEditorProvider({ extensionUri: "extension" }).resolveCustomTextEditor(document, panel);

  await receiveMessage({ type: "update", text: validDocumentText("failed") });
  await receiveMessage({ type: "save" });

  assert.equal(saveCalls, 1);
  assert.equal(text, originalText);
  assert.equal(messages.some((message) => message.type === "error"), true);
});
