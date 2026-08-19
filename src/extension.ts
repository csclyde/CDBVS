import * as vscode from "vscode";
import { CdbEditorProvider } from "./host/CdbEditorProvider";
import { registerCommands } from "./host/Commands";

export function activate(context: vscode.ExtensionContext): void {
  const registration = CdbEditorProvider.register(context);
  context.subscriptions.push(registration.disposable);
  context.subscriptions.push(...registerCommands(registration.provider));
}

export function deactivate(): void {}

export { CdbEditorProvider } from "./host/CdbEditorProvider";
