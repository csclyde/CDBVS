import * as vscode from "vscode";
import { isEditorShapeValid, parseCdb } from "../cdb/Parser";
import { parseEditableCdb, replaceDocument } from "../Document";
import { isWebviewToHostMessage } from "../shared/protocol";
import { DocumentUpdateQueue } from "./DocumentUpdateQueue";
import { getWebviewHtml } from "./WebviewHtml";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizedDocumentText(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

async function saveDocumentWithRetry(document: vscode.TextDocument): Promise<boolean> {
  let saved = await document.save();
  if (saved || document.isDirty !== true) return saved;

  // WorkspaceEdit can resolve before VS Code has finished settling the text
  // document's save state. Give that state one turn to settle before treating
  // a false result as a real failure.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  saved = await document.save();
  return saved;
}

export class CdbEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly context: vscode.ExtensionContext;
  private readonly editorPanels = new Map<vscode.WebviewPanel, vscode.Uri>();
  public activeDocumentUri: vscode.Uri | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  private refreshActiveDocumentUri(): void {
    let activeUri: vscode.Uri | null = null;
    for (const [panel, uri] of this.editorPanels) {
      if (panel.active) activeUri = uri;
    }
    this.activeDocumentUri = activeUri;
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
    webview.options = { enableScripts: true, localResourceRoots: [mediaRoot] };
    webview.html = this.getHtml(webview, mediaRoot);

    let disposed = false;
    let applyingEdit = false;
    let pendingDocumentRefresh = false;
    const selfAppliedTexts = new Set<string>();
    const updateQueue = new DocumentUpdateQueue();
    this.editorPanels.set(webviewPanel, document.uri);
    const markActive = () => {
      if (webviewPanel.active) this.activeDocumentUri = document.uri;
      else this.refreshActiveDocumentUri();
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
      else if (selfAppliedTexts.delete(normalizedDocumentText(document.getText()))) return;
      else sendDocument();
    });
    const configurationSubscription = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("cdbvs.showHiddenSheets")) sendDocument();
    });
    const messageSubscription = webview.onDidReceiveMessage(async (message: unknown) => {
      if (!isWebviewToHostMessage(message)) return;
      if (message.type === "ready") {
        sendDocument();
        return;
      }
      if (message.type === "update") {
        await updateQueue.enqueue(async () => {
          if (disposed) return;
          const normalizedMessageText = normalizedDocumentText(message.text);
          if (normalizedMessageText === normalizedDocumentText(document.getText())) {
            selfAppliedTexts.delete(normalizedMessageText);
            return;
          }
          const parsed = parseEditableCdb(message.text);
          if (!parsed.valid) {
            if (!disposed) void webview.postMessage({ type: "error", message: parsed.issues.join("\n") });
            return;
          }
          if (disposed) return;
          applyingEdit = true;
          selfAppliedTexts.add(normalizedMessageText);
          let applied = false;
          try {
            applied = await replaceDocument(vscode, document, message.text);
            if (!applied) {
              selfAppliedTexts.delete(normalizedMessageText);
              if (!disposed) void webview.postMessage({ type: "error", message: "CDBVS could not apply the document update." });
              sendDocument();
            }
          } finally {
            applyingEdit = false;
            if (pendingDocumentRefresh) {
              pendingDocumentRefresh = false;
              // The webview already has the exact text it just submitted. Do
              // not echo that self-originated change back through the full
              // document renderer; only refresh if another change left the
              // document with different text while the edit was applying.
              if (applied && normalizedDocumentText(document.getText()) === normalizedMessageText) selfAppliedTexts.delete(normalizedMessageText);
              else {
                selfAppliedTexts.delete(normalizedMessageText);
                sendDocument();
              }
            }
          }
        }).catch((error: unknown) => {
          selfAppliedTexts.delete(normalizedDocumentText(message.text));
          if (!disposed) void webview.postMessage({ type: "error", message: `CDBVS could not apply the document update: ${errorMessage(error)}` });
          sendDocument();
        });
        return;
      }
      if (message.type === "save") {
        try {
          await updateQueue.wait();
          if (disposed) return;
          // Keep the save call after the update queue even when the dirty flag
          // has not caught up with WorkspaceEdit yet. A transient false result
          // is retried once before reporting a failure.
          const saved = await saveDocumentWithRetry(document);
          const stillDirty = document.isDirty === true;
          if (!saved && stillDirty && !disposed) {
            void webview.postMessage({ type: "error", message: "CDBVS could not save the document." });
          }
        } catch (error: unknown) {
          if (!disposed) void webview.postMessage({ type: "error", message: `CDBVS could not save the document: ${errorMessage(error)}` });
        }
        return;
      }
      if (message.type === "showMessage") void vscode.window.showInformationMessage(message.message);
    });

    webviewPanel.onDidDispose(() => {
      disposed = true;
      changeSubscription.dispose();
      configurationSubscription.dispose();
      messageSubscription.dispose();
      viewStateSubscription.dispose();
      this.editorPanels.delete(webviewPanel);
      this.refreshActiveDocumentUri();
    });
  }

  getHtml(webview: vscode.Webview, mediaRoot: vscode.Uri): string {
    return getWebviewHtml(webview, mediaRoot);
  }
}
