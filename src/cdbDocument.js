const { parseCdb, isEditorShapeValid } = require("./cdbParser");

const INVALID_SHAPE_MESSAGE = "CastleDB data must contain valid sheets, columns, rows, and custom type arrays before it can be applied.";

function parseEditableCdb(text) {
  const parsed = parseCdb(text);
  const shapeValid = isEditorShapeValid(parsed.data);
  const issues = parsed.issues.slice();
  if (!shapeValid) issues.push(INVALID_SHAPE_MESSAGE);
  return { ...parsed, issues, valid: !!parsed.data && shapeValid && !parsed.issues.some((issue) => issue.startsWith("Invalid JSON")) };
}

function replaceDocument(vscode, document, text) {
  const edit = new vscode.WorkspaceEdit();
  const documentText = document.getText();
  edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(documentText.length)), text);
  return vscode.workspace.applyEdit(edit);
}

module.exports = { INVALID_SHAPE_MESSAGE, parseEditableCdb, replaceDocument };
