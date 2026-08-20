const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { loadTsModule } = require("./helpers/loadTsModule");

const projectRoot = path.join(__dirname, "..");
const source = (relativePath) => path.join(projectRoot, relativePath);

function validText(title = "Alice") {
  return JSON.stringify({
    customTypes: [],
    sheets: [{
      name: "Players",
      columns: [{ name: "id", typeStr: "0" }, { name: "title", typeStr: "1" }],
      lines: [{ id: "p1", title }],
      props: {}
    }]
  });
}

test("parseEditableCdb distinguishes JSON errors, editor-shape errors, and repairable data", () => {
  const { parseEditableCdb, INVALID_SHAPE_MESSAGE } = loadTsModule(source("src/Document.ts"));

  const valid = parseEditableCdb(validText());
  assert.equal(valid.valid, true);
  assert.ok(valid.data);
  assert.deepEqual(valid.issues, []);

  const malformed = parseEditableCdb("{");
  assert.equal(malformed.valid, false);
  assert.equal(malformed.data, null);
  assert.match(malformed.issues[0], /^Invalid JSON:/);
  assert.ok(malformed.issues.includes(INVALID_SHAPE_MESSAGE));

  const wrongShape = parseEditableCdb(JSON.stringify({ sheets: [] }));
  assert.equal(wrongShape.valid, false);
  assert.equal(wrongShape.data, null);
  assert.deepEqual(wrongShape.issues, ["Missing or invalid 'customTypes' array.", INVALID_SHAPE_MESSAGE]);

  const duplicateId = parseEditableCdb(JSON.stringify({
    customTypes: [],
    sheets: [{ name: "Players", columns: [{ name: "id", typeStr: "0" }], lines: [{ id: "same" }, { id: "same" }] }]
  }));
  assert.equal(duplicateId.valid, true);
  assert.equal(duplicateId.data.sheets[0].lines.length, 2);
  assert.deepEqual(duplicateId.issues, ["Duplicate id 'same' in sheet 'Players'."]);
});

test("replaceDocument replaces the complete text document through WorkspaceEdit", async () => {
  const { replaceDocument } = loadTsModule(source("src/Document.ts"));
  const calls = [];
  class WorkspaceEdit {
    replace(uri, range, text) { this.uri = uri; this.range = range; this.text = text; }
  }
  class Range {
    constructor(start, end) { this.start = start; this.end = end; }
  }
  const vscode = {
    WorkspaceEdit,
    Range,
    workspace: { applyEdit: async (edit) => { calls.push(edit); return true; } }
  };
  const document = {
    uri: "file:///players.cdb",
    getText: () => "old text",
    positionAt: (offset) => ({ offset })
  };

  assert.equal(await replaceDocument(vscode, document, "new text"), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].uri, document.uri);
  assert.deepEqual(calls[0].range.start, { offset: 0 });
  assert.deepEqual(calls[0].range.end, { offset: 8 });
  assert.equal(calls[0].text, "new text");
});

test("DocumentUpdateQueue preserves order and remains usable after rejection", async () => {
  const { DocumentUpdateQueue } = loadTsModule(source("src/host/DocumentUpdateQueue.ts"));
  const queue = new DocumentUpdateQueue();
  const events = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = queue.enqueue(async () => {
    events.push("first-start");
    await gate;
    events.push("first-end");
  });
  const second = queue.enqueue(async () => { events.push("second"); });
  await Promise.resolve();
  assert.deepEqual(events, ["first-start"]);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first-start", "first-end", "second"]);

  await assert.rejects(queue.enqueue(async () => {
    events.push("failed");
    throw new Error("expected failure");
  }), /expected failure/);
  await queue.enqueue(async () => { events.push("after-failure"); });
  await queue.wait();
  assert.deepEqual(events.slice(-2), ["failed", "after-failure"]);
});

function makeCommandVscode() {
  class Uri {
    constructor(fsPath) { this.fsPath = fsPath; }
    toString() { return this.fsPath; }
    static joinPath(root, ...parts) { return `${root}/${parts.join("/")}`; }
  }
  const registered = [];
  const executed = [];
  const messages = [];
  const edits = [];
  class WorkspaceEdit {
    replace(uri, range, text) { this.uri = uri; this.range = range; this.text = text; }
  }
  class Range {
    constructor(start, end) { this.start = start; this.end = end; }
  }
  const vscode = {
    Uri,
    WorkspaceEdit,
    Range,
    commands: {
      registerCommand(name, handler) { registered.push({ name, handler }); return { dispose() {} }; },
      executeCommand: async (...args) => { executed.push(args); }
    },
    window: {
      activeTextEditor: null,
      showWarningMessage: (message) => messages.push({ type: "warning", message }),
      showInformationMessage: (message) => messages.push({ type: "info", message }),
      showErrorMessage: (message) => messages.push({ type: "error", message })
    },
    workspace: {
      textDocuments: [],
      applyEdit: async (edit) => { edits.push(edit); return true; }
    }
  };
  return { vscode, registered, executed, messages, edits, Uri };
}

test("commands select the active CDB URI and open the custom editor", async () => {
  const env = makeCommandVscode();
  const { registerCommands } = loadTsModule(source("src/host/Commands.ts"), env.vscode);
  const provider = { activeDocumentUri: null };
  registerCommands(provider);
  const open = env.registered.find((item) => item.name === "cdb.openEditor").handler;

  await open();
  assert.deepEqual(env.messages, [{ type: "warning", message: "Open a .cdb file before starting CDBVS." }]);

  const uri = new env.Uri("file:///active.cdb");
  env.vscode.window.activeTextEditor = { document: { languageId: "cdb", uri } };
  await open();
  assert.deepEqual(env.executed, [["vscode.openWith", uri, "cdb.editor"]]);

  const explicit = new env.Uri("file:///explicit.cdb");
  await open(explicit);
  assert.deepEqual(env.executed.at(-1), ["vscode.openWith", explicit, "cdb.editor"]);
});

test("commands recognize CDB files by path and validate missing, valid, and invalid documents", async () => {
  const env = makeCommandVscode();
  const { registerCommands } = loadTsModule(source("src/host/Commands.ts"), env.vscode);
  const provider = { activeDocumentUri: null };
  registerCommands(provider);
  const validate = env.registered.find((item) => item.name === "cdb.validate").handler;
  const uri = new env.Uri("file:///players.CDB");

  await validate();
  assert.deepEqual(env.messages, [{ type: "warning", message: "Open a .cdb file before validating." }]);

  env.vscode.window.activeTextEditor = { document: { languageId: "json", uri } };
  const document = { uri, getText: () => validText() };
  env.vscode.workspace.textDocuments = [document];
  validate();
  assert.deepEqual(env.messages.at(-1), { type: "info", message: "CDBVS: CastleDB file is valid." });

  document.getText = () => "{";
  validate();
  assert.match(env.messages.at(-1).message, /^CDBVS found 1 issue\(s\): Invalid JSON:/);

  env.vscode.workspace.textDocuments = [];
  validate();
  assert.equal(env.messages.length, 3);
});

test("format command rejects invalid documents and writes formatted valid documents", async () => {
  const env = makeCommandVscode();
  const { registerCommands } = loadTsModule(source("src/host/Commands.ts"), env.vscode);
  const provider = { activeDocumentUri: null };
  registerCommands(provider);
  const format = env.registered.find((item) => item.name === "cdb.format").handler;
  const uri = new env.Uri("file:///players.cdb");
  const document = { uri, getText: () => "{", positionAt: (offset) => offset };
  env.vscode.window.activeTextEditor = { document: { languageId: "cdb", uri } };
  env.vscode.workspace.textDocuments = [document];
  await format();
  assert.match(env.messages.at(-1).message, /^CDBVS cannot format this file: Invalid JSON:/);
  assert.equal(env.edits.length, 0);

  document.getText = () => JSON.stringify({ sheets: [], customTypes: [] });
  await format();
  assert.equal(env.edits.length, 1);
  assert.equal(env.edits[0].text, JSON.stringify({ sheets: [], customTypes: [] }, null, "\t") + "\n");
  assert.equal(env.messages.some((message) => message.type === "error"), true);
});

test("webview HTML has isolated CSP, asset URLs, and an application mount point", () => {
  const env = makeCommandVscode();
  const { getWebviewHtml } = loadTsModule(source("src/host/WebviewHtml.ts"), env.vscode);
  const webview = {
    cspSource: "vscode-webview://csp",
    asWebviewUri: (uri) => `webview:${uri}`
  };
  const first = getWebviewHtml(webview, "extension/media");
  const second = getWebviewHtml(webview, "extension/media");
  assert.match(first, /<!DOCTYPE html>/);
  assert.match(first, /<div id="app"><\/div>/);
  assert.match(first, /style-src vscode-webview:\/\/csp/);
  assert.match(first, /script-src 'nonce-[0-9a-f]{32}'/);
  assert.match(first, /<link rel="stylesheet" href="webview:extension\/media\/Editor\.css">/);
  assert.match(first, /<script nonce="[0-9a-f]{32}" src="webview:extension\/media\/editor\.js"><\/script>/);
  const nonce = first.match(/nonce="([0-9a-f]+)"/)[1];
  const nextNonce = second.match(/nonce="([0-9a-f]+)"/)[1];
  assert.notEqual(nonce, nextNonce);
  assert.doesNotMatch(first, /unsafe-inline|unsafe-eval/);
});

function makeProviderVscode(options = {}) {
  class Uri {
    constructor(fsPath) { this.fsPath = fsPath; }
    toString() { return this.fsPath; }
    static joinPath(root, ...parts) { return `${root}/${parts.join("/")}`; }
  }
  class WorkspaceEdit {
    replace(uri, range, text) { this.uri = uri; this.range = range; this.text = text; }
  }
  class Range {
    constructor(start, end) { this.start = start; this.end = end; }
  }
  const hooks = { documentChange: null, configuration: null, viewState: null, message: null, dispose: null };
  const posted = [];
  const infoMessages = [];
  const edits = [];
  const vscode = {
    Uri,
    WorkspaceEdit,
    Range,
    window: { showInformationMessage: (message) => infoMessages.push(message) },
    workspace: {
      onDidChangeTextDocument(handler) { hooks.documentChange = handler; return { dispose() { hooks.documentChange = null; } }; },
      onDidChangeConfiguration(handler) { hooks.configuration = handler; return { dispose() { hooks.configuration = null; } }; },
      getConfiguration() { return { get: () => options.showHidden === true }; },
      applyEdit: async (edit) => {
        edits.push(edit);
        if (typeof options.onApplyEdit === "function") options.onApplyEdit(edit);
        return options.applyEditResult !== false;
      }
    }
  };
  const webview = {
    options: null,
    html: "",
    cspSource: "vscode-webview://csp",
    asWebviewUri: (uri) => `webview:${uri}`,
    postMessage: (message) => { posted.push(message); return Promise.resolve(true); },
    onDidReceiveMessage: (handler) => { hooks.message = handler; return { dispose() { hooks.message = null; } }; }
  };
  const panel = {
    webview,
    active: true,
    onDidChangeViewState: (handler) => { hooks.viewState = handler; return { dispose() { hooks.viewState = null; } }; },
    onDidDispose: (handler) => { hooks.dispose = handler; return { dispose() { hooks.dispose = null; } }; }
  };
  return { vscode, hooks, posted, infoMessages, edits, panel, Uri };
}

test("custom editor sends initial and external document refreshes and honors configuration", async () => {
  const env = makeProviderVscode({ showHidden: true });
  const { CdbEditorProvider } = loadTsModule(source("src/host/CdbEditorProvider.ts"), env.vscode);
  const uri = new env.Uri("file:///players.cdb");
  const document = { uri, getText: () => validText(), positionAt: (offset) => offset, save: async () => true };
  const provider = new CdbEditorProvider({ extensionUri: "extension" });
  await provider.resolveCustomTextEditor(document, env.panel);
  assert.equal(provider.activeDocumentUri, uri);
  assert.equal(env.panel.webview.options.enableScripts, true);
  assert.match(env.panel.webview.html, /CDBVS/);

  await env.hooks.message({ type: "ready" });
  let message = env.posted.at(-1);
  assert.equal(message.type, "document");
  assert.equal(message.rawMode, false);
  assert.equal(message.showHiddenSheets, true);
  assert.ok(message.data);

  env.hooks.documentChange({ document: { uri }, contentChanges: [] });
  assert.equal(env.posted.at(-1).type, "document");
  env.hooks.configuration({ affectsConfiguration: (key) => key === "cdbvs.showHiddenSheets" });
  assert.equal(env.posted.at(-1).showHiddenSheets, true);
  env.hooks.message({ type: "showMessage", message: "hello" });
  assert.deepEqual(env.infoMessages, ["hello"]);

  env.panel.active = false;
  env.hooks.viewState();
  assert.equal(provider.activeDocumentUri, null);
  env.panel.active = true;
  env.hooks.viewState();
  assert.equal(provider.activeDocumentUri, uri);
  env.hooks.dispose();
  assert.equal(provider.activeDocumentUri, null);
});

test("custom editor reports failed applications and ignores redundant or malformed updates", async () => {
  const env = makeProviderVscode({ applyEditResult: false });
  const { CdbEditorProvider } = loadTsModule(source("src/host/CdbEditorProvider.ts"), env.vscode);
  const uri = new env.Uri("file:///players.cdb");
  let text = validText();
  const document = { uri, getText: () => text, positionAt: (offset) => offset, save: async () => true };
  const provider = new CdbEditorProvider({ extensionUri: "extension" });
  await provider.resolveCustomTextEditor(document, env.panel);
  const initialMessages = env.posted.length;

  await env.hooks.message({ type: "update", text: "{" });
  assert.equal(env.edits.length, 0);
  assert.equal(env.posted.at(-1).type, "error");
  await env.hooks.message({ type: "update", text: text });
  assert.equal(env.edits.length, 0);
  assert.equal(env.posted.length > initialMessages, true);
  await env.hooks.message({ type: "update", text: validText("Changed") });
  assert.equal(env.edits.length, 1);
  assert.equal(env.posted.at(-2).type, "error");
  assert.equal(env.posted.at(-1).type, "document");
});

test("custom editor does not echo a successful self-applied update", async () => {
  let text = validText();
  let document;
  const env = makeProviderVscode({
    onApplyEdit: (edit) => {
      text = edit.text.replace(/\n/g, "\r\n");
    }
  });
  const { CdbEditorProvider } = loadTsModule(source("src/host/CdbEditorProvider.ts"), env.vscode);
  const uri = new env.Uri("file:///players.cdb");
  document = { uri, getText: () => text, positionAt: (offset) => offset, save: async () => true };
  const provider = new CdbEditorProvider({ extensionUri: "extension" });
  await provider.resolveCustomTextEditor(document, env.panel);
  await env.hooks.message({ type: "ready" });
  const postedBeforeUpdate = env.posted.length;

  const pastedText = `${JSON.stringify(JSON.parse(validText("Pasted")), null, "\t")}\n`;
  await env.hooks.message({ type: "update", text: pastedText });
  assert.equal(env.edits.length, 1);
  env.hooks.documentChange({ document, contentChanges: [] });
  assert.equal(env.posted.length, postedBeforeUpdate);

  text = validText("External");
  env.hooks.documentChange({ document, contentChanges: [] });
  assert.equal(env.posted.length, postedBeforeUpdate + 1);
  assert.equal(env.posted.at(-1).type, "document");
});
