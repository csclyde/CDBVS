import { isEditorShapeValid, parseCdb } from "./cdb/Parser";
import type { CdbDatabase, ParsedCdb } from "./cdb/types";

const INVALID_SHAPE_MESSAGE = "CastleDB data must contain valid sheets, columns, rows, and custom type arrays before it can be applied.";

export interface EditableCdbResult extends ParsedCdb {
  data: CdbDatabase | null;
  valid: boolean;
}

export function parseEditableCdb(text: string): EditableCdbResult {
  const parsed = parseCdb(text);
  const data = isEditorShapeValid(parsed.data) ? parsed.data : null;
  const shapeValid = data !== null;
  const issues = parsed.issues.slice();
  if (!shapeValid) issues.push(INVALID_SHAPE_MESSAGE);
  return {
    ...parsed,
    data,
    issues,
    valid: shapeValid && !parsed.issues.some((issue) => issue.startsWith("Invalid JSON"))
  };
}

export function replaceDocument(vscode: any, document: any, text: string): Promise<boolean> {
  const edit = new vscode.WorkspaceEdit();
  const documentText = document.getText();
  edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(documentText.length)), text);
  return vscode.workspace.applyEdit(edit);
}

export { INVALID_SHAPE_MESSAGE };
