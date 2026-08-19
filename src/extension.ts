import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import { isEditorShapeValid, parseCdb, serializeCdb } from "./cdb/Parser";
import { parseEditableCdb, replaceDocument } from "./Document";
import { WEBVIEW_BUNDLE, WEBVIEW_STYLE } from "./WebviewFiles";
import { isWebviewToHostMessage } from "./shared/protocol";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class CdbEditorProvider {
  private readonly context: vscode.ExtensionContext;
  public activeDocumentUri: vscode.Uri | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  static register(context: vscode.ExtensionContext): { provider: CdbEditorProvider; disposable: vscode.Disposable } {
    const provider = new CdbEditorProvider(context);
    const disposable = vscode.window.registerCustomEditorProvider("cdb.editor", provider, {
      supportsMultipleEditorsPerDocument: true,
      webviewOptions: { retainContextWhenHidden: true }
    });
    return { provider, disposable };
  }

  async resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel): Promise<void> {
    const webview = webviewPanel.webview;
    const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, "media");
    webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaRoot]
    };
    webview.html = this.getHtml(webview, mediaRoot);

    let disposed = false;
    let applyingEdit = false;
    let pendingDocumentRefresh = false;
    let updateQueue: Promise<void> = Promise.resolve();
    const markActive = () => {
      if (webviewPanel.active) this.activeDocumentUri = document.uri;
      else if (this.activeDocumentUri && this.activeDocumentUri.toString() === document.uri.toString()) this.activeDocumentUri = null;
    };
    const viewStateSubscription = webviewPanel.onDidChangeViewState(markActive);
    markActive();
    const sendDocument = () => {
      if (disposed) return;
      const parsed = parseCdb(document.getText());
      const validData = isEditorShapeValid(parsed.data) ? parsed.data : null;
      void webview.postMessage({
        type: "document",
        text: document.getText(),
        data: validData,
        issues: parsed.issues,
        rawMode: !validData,
        showHiddenSheets: vscode.workspace.getConfiguration("cdbvs").get<boolean>("showHiddenSheets", false)
      });
    };

    const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString()) return;
      if (applyingEdit) pendingDocumentRefresh = true;
      else sendDocument();
    });
    const configurationSubscription = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("cdbvs.showHiddenSheets")) sendDocument();
    });
    const messageSubscription = webviewPanel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!isWebviewToHostMessage(message)) return;
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
            if (pendingDocumentRefresh) {
              pendingDocumentRefresh = false;
              sendDocument();
            }
          }
        };
        updateQueue = updateQueue.then(applyUpdate, applyUpdate).catch((error: unknown) => {
          if (!disposed) void webview.postMessage({ type: "error", message: `CDBVS could not apply the document update: ${errorMessage(error)}` });
          sendDocument();
        });
        await updateQueue;
        return;
      }
      if (message.type === "save") {
        try {
          await updateQueue;
          if (disposed) return;
          const saved = await document.save();
          if (!saved && !disposed) void webview.postMessage({ type: "error", message: "CDBVS could not save the document." });
        } catch (error: unknown) {
          if (!disposed) void webview.postMessage({ type: "error", message: `CDBVS could not save the document: ${errorMessage(error)}` });
        }
        return;
      }
      if (message.type === "showMessage") {
        void vscode.window.showInformationMessage(message.message);
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

  getHtml(webview: vscode.Webview, mediaRoot: vscode.Uri): string {
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, WEBVIEW_STYLE));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, WEBVIEW_BUNDLE));
    const nonce = randomBytes(16).toString("hex");
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
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function activeCdbUri(provider: CdbEditorProvider): vscode.Uri | null {
  if (provider && provider.activeDocumentUri) return provider.activeDocumentUri;
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.languageId === "cdb") return editor.document.uri;
  return editor && editor.document.uri.fsPath.toLowerCase().endsWith(".cdb") ? editor.document.uri : null;
}

export function activate(context: vscode.ExtensionContext): void {
  const registration = CdbEditorProvider.register(context);
  context.subscriptions.push(registration.disposable);
  const provider = registration.provider;
  context.subscriptions.push(vscode.commands.registerCommand("cdb.openEditor", async (resource: unknown) => {
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
    const applied = await replaceDocument(vscode, document, serializeCdb(result.data));
    if (!applied) vscode.window.showErrorMessage("CDBVS could not apply the formatted document.");
  }));
}

export function deactivate(): void {}
