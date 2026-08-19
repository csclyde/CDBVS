import * as vscode from "vscode";
import { parseCdb, serializeCdb } from "../cdb/Parser";
import { parseEditableCdb, replaceDocument } from "../Document";
import { CdbEditorProvider } from "./CdbEditorProvider";

function activeCdbUri(provider: CdbEditorProvider): vscode.Uri | null {
  if (provider.activeDocumentUri) return provider.activeDocumentUri;
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.languageId === "cdb") return editor.document.uri;
  return editor && editor.document.uri.fsPath.toLowerCase().endsWith(".cdb") ? editor.document.uri : null;
}

function openDocument(uri: vscode.Uri): vscode.TextDocument | undefined {
  return vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
}

export function registerCommands(provider: CdbEditorProvider): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("cdb.openEditor", async (resource: unknown) => {
      const uri = resource instanceof vscode.Uri ? resource : activeCdbUri(provider);
      if (!uri) {
        void vscode.window.showWarningMessage("Open a .cdb file before starting CDBVS.");
        return;
      }
      await vscode.commands.executeCommand("vscode.openWith", uri, "cdb.editor");
    }),
    vscode.commands.registerCommand("cdb.validate", () => {
      const uri = activeCdbUri(provider);
      if (!uri) {
        void vscode.window.showWarningMessage("Open a .cdb file before validating.");
        return;
      }
      const document = openDocument(uri);
      if (!document) return;
      const result = parseCdb(document.getText());
      if (result.issues.length) void vscode.window.showWarningMessage(`CDBVS found ${result.issues.length} issue(s): ${result.issues[0]}`);
      else void vscode.window.showInformationMessage("CDBVS: CastleDB file is valid.");
    }),
    vscode.commands.registerCommand("cdb.format", async () => {
      const uri = activeCdbUri(provider);
      if (!uri) {
        void vscode.window.showWarningMessage("Open a .cdb file before formatting.");
        return;
      }
      const document = openDocument(uri);
      if (!document) return;
      const result = parseEditableCdb(document.getText());
      if (!result.valid) {
        const message = result.issues[0] || "CastleDB data has an invalid sheet or schema shape.";
        void vscode.window.showErrorMessage(`CDBVS cannot format this file: ${message}`);
        return;
      }
      const applied = await replaceDocument(vscode, document, serializeCdb(result.data));
      if (!applied) void vscode.window.showErrorMessage("CDBVS could not apply the formatted document.");
    })
  ];
}
