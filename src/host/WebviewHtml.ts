import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { WEBVIEW_BUNDLE, WEBVIEW_STYLE } from "../WebviewFiles";

export function getWebviewHtml(webview: vscode.Webview, mediaRoot: vscode.Uri): string {
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
