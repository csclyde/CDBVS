const vscode = require("vscode");
const {
  parseCdb,
  isEditorShapeValid,
  serializeCdb
} = require("./src/Parser");
const { parseEditableCdb, replaceDocument } = require("./src/Document");
const { WEBVIEW_STYLE, WEBVIEW_SCRIPTS } = require("./src/WebviewFiles");

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
    let updateQueue = Promise.resolve();
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
        const applyUpdate = async () => {
          if (typeof message.text !== "string" || message.text === document.getText()) return;
          const parsed = parseEditableCdb(message.text);
          if (!parsed.valid) {
            if (!disposed) webview.postMessage({ type: "error", message: parsed.issues.join("\n") });
            return;
          }
          applyingEdit = true;
          try {
            const applied = await replaceDocument(vscode, document, message.text);
            if (!applied) {
              if (!disposed) webview.postMessage({ type: "error", message: "CDBVS could not apply the document update." });
              sendDocument();
            }
          } finally {
            applyingEdit = false;
          }
        };
        updateQueue = updateQueue.then(applyUpdate, applyUpdate).catch((error) => {
          if (!disposed) webview.postMessage({ type: "error", message: `CDBVS could not apply the document update: ${error.message}` });
          sendDocument();
        });
        await updateQueue;
        return;
      }
      if (message.type === "save") {
        try {
          await updateQueue;
          if (disposed || typeof document.save !== "function") return;
          const saved = await document.save();
          if (!saved && !disposed) webview.postMessage({ type: "error", message: "CDBVS could not save the document." });
        } catch (error) {
          if (!disposed) webview.postMessage({ type: "error", message: `CDBVS could not save the document: ${error.message}` });
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
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, WEBVIEW_STYLE));
    const scriptUris = WEBVIEW_SCRIPTS.map(([file, folder]) => {
      return webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, folder, file));
    });
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
    const result = parseEditableCdb(document.getText());
    if (!result.valid) {
      const message = result.issues[0] || "CastleDB data has an invalid sheet or schema shape.";
      vscode.window.showErrorMessage(`CDBVS cannot format this file: ${message}`);
      return;
    }
    await replaceDocument(vscode, document, serializeCdb(result.data));
  }));
}

function deactivate() {}

module.exports = { activate, deactivate, CdbEditorProvider };
