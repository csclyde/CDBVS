const vscode = require("vscode");
const {
  parseCdb,
  isEditorShapeValid,
  serializeCdb
} = require("./src/cdbParser");

class CdbEditorProvider {
  constructor(context) {
    this.context = context;
    this.activeDocumentUri = null;
  }

  static register(context) {
    const provider = new CdbEditorProvider(context);
    const disposable = vscode.window.registerCustomEditorProvider("cdb.editor", provider, {
      supportsMultipleEditorsPerDocument: true,
      webviewOptions: { retainContextWhenHidden: true }
    });
    return { provider, disposable };
  }

  async resolveCustomTextEditor(document, webviewPanel) {
    const webview = webviewPanel.webview;
    const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, "media");
    webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaRoot]
    };
    webview.html = this.getHtml(webview, mediaRoot);

    let disposed = false;
    let applyingEdit = false;
    const markActive = () => {
      if (webviewPanel.active) this.activeDocumentUri = document.uri;
      else if (this.activeDocumentUri && this.activeDocumentUri.toString() === document.uri.toString()) this.activeDocumentUri = null;
    };
    const viewStateSubscription = webviewPanel.onDidChangeViewState(markActive);
    markActive();
    const sendDocument = () => {
      if (disposed) return;
      const parsed = parseCdb(document.getText());
      webview.postMessage({
        type: "document",
        text: document.getText(),
        data: parsed.data,
        issues: parsed.issues,
        rawMode: !isEditorShapeValid(parsed.data),
        showHiddenSheets: vscode.workspace.getConfiguration("cdbvs").get("showHiddenSheets", false)
      });
    };

    const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString()) return;
      if (!applyingEdit) sendDocument();
    });
    const configurationSubscription = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("cdbvs.showHiddenSheets")) sendDocument();
    });
    const messageSubscription = webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (!message || typeof message.type !== "string") return;
      if (message.type === "ready") {
        sendDocument();
        return;
      }
      if (message.type === "update") {
        if (typeof message.text !== "string" || message.text === document.getText()) return;
        const parsed = parseCdb(message.text);
        if (!parsed.data || parsed.issues.some((issue) => issue.startsWith("Invalid JSON")) || !isEditorShapeValid(parsed.data)) {
          const issues = parsed.issues.slice();
          if (!isEditorShapeValid(parsed.data)) issues.push("CastleDB data must contain valid sheets, columns, rows, and custom type arrays before it can be applied.");
          webview.postMessage({ type: "error", message: issues.join("\n") });
          return;
        }
        applyingEdit = true;
        try {
          const edit = new vscode.WorkspaceEdit();
          const start = document.positionAt(0);
          const end = document.positionAt(document.getText().length);
          edit.replace(document.uri, new vscode.Range(start, end), message.text);
          const applied = await vscode.workspace.applyEdit(edit);
          if (!applied) {
            webview.postMessage({ type: "error", message: "CDBVS could not apply the document update." });
            sendDocument();
          }
        } finally {
          applyingEdit = false;
        }
        return;
      }
      if (message.type === "showMessage") {
        vscode.window.showInformationMessage(String(message.message || ""));
      }
    });

    webviewPanel.onDidDispose(() => {
      disposed = true;
      changeSubscription.dispose();
      configurationSubscription.dispose();
      messageSubscription.dispose();
      viewStateSubscription.dispose();
      if (this.activeDocumentUri && this.activeDocumentUri.toString() === document.uri.toString()) this.activeDocumentUri = null;
    });
  }

  getHtml(webview, mediaRoot) {
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "cdbEditor.css"));
    const scriptUris = [
      "cdbEditorRuntime.js",
      "cdbEditorDom.js",
      "cdbEditorModel.js",
      "cdbEditorActions.js",
      "cdbEditorModals.js",
      "cdbEditorCells.js",
      "cdbEditorView.js",
      "cdbEditor.js"
    ].map((name) => webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, name)));
    const nonce = String(Date.now());
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>CDBVS</title>
</head>
<body>
  <div id="app"></div>
${scriptUris.map((scriptUri) => `  <script nonce="${nonce}" src="${scriptUri}"></script>`).join("\n")}
</body>
</html>`;
  }
}

function activeCdbUri(provider) {
  if (provider && provider.activeDocumentUri) return provider.activeDocumentUri;
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.languageId === "cdb") return editor.document.uri;
  return editor && editor.document.uri.fsPath.toLowerCase().endsWith(".cdb") ? editor.document.uri : null;
}

function activate(context) {
  const registration = CdbEditorProvider.register(context);
  context.subscriptions.push(registration.disposable);
  const provider = registration.provider;
  context.subscriptions.push(vscode.commands.registerCommand("cdb.openEditor", async (resource) => {
    const uri = resource instanceof vscode.Uri ? resource : activeCdbUri(provider);
    if (!uri) {
      vscode.window.showWarningMessage("Open a .cdb file before starting CDBVS.");
      return;
    }
    await vscode.commands.executeCommand("vscode.openWith", uri, "cdb.editor");
  }));
  context.subscriptions.push(vscode.commands.registerCommand("cdb.validate", () => {
    const uri = activeCdbUri(provider);
    if (!uri) {
      vscode.window.showWarningMessage("Open a .cdb file before validating.");
      return;
    }
    const document = vscode.workspace.textDocuments.find((item) => item.uri.toString() === uri.toString());
    if (!document) return;
    const result = parseCdb(document.getText());
    if (result.issues.length) {
      vscode.window.showWarningMessage(`CDBVS found ${result.issues.length} issue(s): ${result.issues[0]}`);
    } else {
      vscode.window.showInformationMessage("CDBVS: CastleDB file is valid.");
    }
  }));
  context.subscriptions.push(vscode.commands.registerCommand("cdb.format", async () => {
    const uri = activeCdbUri(provider);
    if (!uri) {
      vscode.window.showWarningMessage("Open a .cdb file before formatting.");
      return;
    }
    const document = vscode.workspace.textDocuments.find((item) => item.uri.toString() === uri.toString());
    if (!document) return;
    const result = parseCdb(document.getText());
    if (!result.data || result.issues.some((issue) => issue.startsWith("Invalid JSON")) || !isEditorShapeValid(result.data)) {
      const message = result.issues[0] || "CastleDB data has an invalid sheet or schema shape.";
      vscode.window.showErrorMessage(`CDBVS cannot format this file: ${message}`);
      return;
    }
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), serializeCdb(result.data));
    await vscode.workspace.applyEdit(edit);
  }));
}

function deactivate() {}

module.exports = { activate, deactivate };
