import { getTypeString, idColumn, parseType } from "./TypeSystem";
import type { CdbDatabase } from "./types";

export function validateData(data: unknown): string[] {
  const issues: string[] = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return ["The document root must be a JSON object."];
  }
  const root = data as Record<string, any>;
  if (!Array.isArray(root.sheets)) issues.push("Missing or invalid 'sheets' array.");
  if (!Array.isArray(root.customTypes)) issues.push("Missing or invalid 'customTypes' array.");

  const sheets = Array.isArray(root.sheets) ? root.sheets : [];
  const names = new Set<string>();
  for (const sheet of sheets) {
    if (!sheet || typeof sheet !== "object") {
      issues.push("A sheet is not an object.");
      continue;
    }
    if (typeof sheet.name !== "string" || !sheet.name) issues.push("A sheet is missing a valid name.");
    if (typeof sheet.name === "string" && names.has(sheet.name)) issues.push(`Duplicate sheet name '${sheet.name}'.`);
    if (typeof sheet.name === "string" && sheet.name) names.add(sheet.name);
    if (!Array.isArray(sheet.columns)) issues.push(`Sheet '${sheet.name || "?"}' has no valid columns array.`);
    if (!Array.isArray(sheet.lines)) issues.push(`Sheet '${sheet.name || "?"}' has no valid lines array.`);
    if (sheet.props !== undefined && (!sheet.props || typeof sheet.props !== "object" || Array.isArray(sheet.props))) issues.push(`Sheet '${sheet.name || "?"}' has invalid properties.`);
    if (sheet.separators !== undefined && !Array.isArray(sheet.separators)) issues.push(`Sheet '${sheet.name || "?"}' has invalid separators.`);
    if (Array.isArray(sheet.separators)) {
      sheet.separators.forEach((separator: any, separatorIndex: number) => {
        const validNumber = Number.isInteger(separator) && separator >= 0;
        const validObject = separator && typeof separator === "object" && !Array.isArray(separator)
          && ((separator.index !== undefined && Number.isInteger(separator.index) && separator.index >= 0)
            || (separator.id !== undefined && typeof separator.id === "string" && separator.id.length > 0));
        if (!validNumber && !validObject) issues.push(`Sheet '${sheet.name || "?"}' has an invalid separator at index ${separatorIndex}.`);
      });
    }
    const columns = Array.isArray(sheet.columns) ? sheet.columns : [];
    const lines = Array.isArray(sheet.lines) ? sheet.lines : [];
    lines.forEach((line: any, lineIndex: number) => {
      if (!line || typeof line !== "object" || Array.isArray(line)) issues.push(`Sheet '${sheet.name || "?"}' contains an invalid row at index ${lineIndex}.`);
    });
    const columnNames = new Set<string>();
    for (const column of columns as any[]) {
      if (!column || typeof column !== "object") {
        issues.push(`Sheet '${sheet.name || "?"}' contains an invalid column.`);
        continue;
      }
      if (!column.name) issues.push(`Sheet '${sheet.name || "?"}' contains a column without a name.`);
      if (typeof column.name !== "string" || !column.name) issues.push(`Sheet '${sheet.name || "?"}' contains a column without a valid name.`);
      if (typeof column.name === "string" && columnNames.has(column.name)) issues.push(`Duplicate column '${sheet.name}.${column.name}'.`);
      if (typeof column.name === "string" && column.name) columnNames.add(column.name);
      if (parseType(getTypeString(column)).code < 0) issues.push(`Unknown type '${getTypeString(column)}' on '${sheet.name || "?"}.${column.name || "?"}'.`);
    }
    const key = idColumn(sheet);
    if (key && Array.isArray(sheet.lines)) {
      const ids = new Set<string>();
      for (const line of sheet.lines) {
        const id = line && line[key.name];
        if (id !== undefined && id !== null && id !== "") {
          if (ids.has(String(id))) issues.push(`Duplicate id '${id}' in sheet '${sheet.name}'.`);
          ids.add(String(id));
        }
      }
    }
  }

  const customTypes = Array.isArray(root.customTypes) ? root.customTypes : [];
  const customNames = new Set<string>();
  const reportedCustomNames = new Set<string>();
  customTypes.forEach((custom: any) => {
    if (!custom || typeof custom !== "object" || Array.isArray(custom) || !custom.name) return;
    if (customNames.has(custom.name)) reportedCustomNames.add(custom.name);
    customNames.add(custom.name);
  });
  reportedCustomNames.forEach((name) => issues.push(`Duplicate custom type '${name}'.`));
  for (const custom of customTypes) {
    if (!custom || typeof custom !== "object") {
      issues.push("A custom type is not an object.");
      continue;
    }
    if (typeof custom.name !== "string" || !custom.name) issues.push("A custom type is missing a valid name.");
    if (!Array.isArray(custom.cases)) {
      issues.push(`Custom type '${custom.name || "?"}' has no valid cases array.`);
      continue;
    }
    const caseNames = new Set<string>();
    for (const typeCase of custom.cases) {
      if (!typeCase || typeof typeCase !== "object" || Array.isArray(typeCase)) {
        issues.push(`Custom type '${custom.name || "?"}' contains an invalid case.`);
        continue;
      }
      if (typeof typeCase.name !== "string" || !typeCase.name) issues.push(`Custom type '${custom.name || "?"}' contains a case without a valid name.`);
      if (typeCase.name && caseNames.has(typeCase.name)) issues.push(`Duplicate case '${custom.name || "?"}.${typeCase.name}'.`);
      if (typeCase.name) caseNames.add(typeCase.name);
      if (!Array.isArray(typeCase.args)) {
        issues.push(`Case '${typeCase.name || "?"}' in custom type '${custom.name || "?"}' has no valid args array.`);
        continue;
      }
      for (const argument of typeCase.args as any[]) {
        const type = parseType(getTypeString(argument));
        if (type.code < 0) issues.push(`Unknown custom type argument '${getTypeString(argument)}'.`);
        if (type.code === 9 && type.argument && !customNames.has(type.argument)) issues.push(`Custom type '${type.argument}' is not defined.`);
      }
    }
  }
  return issues;
}

export function isEditorShapeValid(data: unknown): data is CdbDatabase {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const root = data as Record<string, any>;
  if (!Array.isArray(root.sheets) || !Array.isArray(root.customTypes)) return false;
  const sheetNames = new Set<string>();
  if (!root.sheets.every((sheet: any) => {
    if (!sheet || typeof sheet !== "object" || Array.isArray(sheet) || typeof sheet.name !== "string" || !sheet.name) return false;
    if (sheetNames.has(sheet.name)) return false;
    sheetNames.add(sheet.name);
    if (!Array.isArray(sheet.columns) || !Array.isArray(sheet.lines)) return false;
    if (sheet.props !== undefined && (!sheet.props || typeof sheet.props !== "object" || Array.isArray(sheet.props))) return false;
    if (sheet.separators !== undefined && !Array.isArray(sheet.separators)) return false;
    const columnNames = new Set<string>();
    if (!sheet.columns.every((column: any) => {
      if (!column || typeof column !== "object" || Array.isArray(column) || typeof column.name !== "string" || !column.name) return false;
      if (columnNames.has(column.name) || parseType(getTypeString(column)).code < 0) return false;
      columnNames.add(column.name);
      return true;
    })) return false;
    if (sheet.separators && !sheet.separators.every((separator: any) => {
      if (Number.isInteger(separator)) return separator >= 0;
      return separator && typeof separator === "object" && !Array.isArray(separator)
        && ((Number.isInteger(separator.index) && separator.index >= 0) || (typeof separator.id === "string" && separator.id.length > 0));
    })) return false;
    return sheet.lines.every((line: any) => line && typeof line === "object" && !Array.isArray(line));
  })) return false;
  const customNames = new Set<string>();
  return root.customTypes.every((customType: any) => {
    if (!customType || typeof customType !== "object" || Array.isArray(customType) || typeof customType.name !== "string" || !customType.name || !Array.isArray(customType.cases)) return false;
    if (customNames.has(customType.name)) return false;
    customNames.add(customType.name);
    const caseNames = new Set<string>();
    return customType.cases.every((typeCase: any) => {
      if (!typeCase || typeof typeCase !== "object" || Array.isArray(typeCase) || typeof typeCase.name !== "string" || !typeCase.name || caseNames.has(typeCase.name) || !Array.isArray(typeCase.args)) return false;
      caseNames.add(typeCase.name);
      return typeCase.args.every((argument: any) => argument && typeof argument === "object" && !Array.isArray(argument) && typeof argument.name === "string" && argument.name && parseType(getTypeString(argument)).code >= 0);
    });
  });
}
