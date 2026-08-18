/*
 * The type numbering and validation rules here follow CastleDB's original
 * cdb/Parser.hx and cdb/Data.hx. The original Haxe sources are retained in
 * vendor/castledb/cdb for reference and for future shared-library work.
 */

const TYPE_NAMES = [
  "id", "string", "bool", "int", "float", "enum", "ref", "image",
  "list", "custom", "flags", "color", "layer", "file", "tilepos",
  "tilelayer", "dynamic", "properties", "gradient", "curve", "guid"
];

function getTypeString(column) {
  if (!column || typeof column !== "object") return null;
  if (column.typeStr !== undefined && column.typeStr !== null) return String(column.typeStr);
  if (column.type !== undefined && column.type !== null) return String(column.type);
  return null;
}

function parseType(typeString) {
  const raw = String(typeString ?? "");
  const separator = raw.indexOf(":");
  const numberText = separator < 0 ? raw : raw.slice(0, separator);
  const code = Number.parseInt(numberText, 10);
  const argument = separator < 0 ? "" : raw.slice(separator + 1);
  if (!Number.isInteger(code) || code < 0 || code >= TYPE_NAMES.length) {
    return { code: -1, name: "unknown", argument, raw };
  }
  const result = { code, name: TYPE_NAMES[code], argument, raw };
  if (code === 5 || code === 10) result.values = argument ? argument.split(",") : [];
  if (code === 6 || code === 9 || code === 12) result.target = argument;
  return result;
}

function defaultValue(column) {
  const type = parseType(getTypeString(column));
  switch (type.code) {
    case 0: // TId
    case 1: // TString
    case 6: // TRef
    case 7: // TImage
    case 12: // TLayer
    case 13: // TFile
      return "";
    case 2: // TBool
      return false;
    case 3: // TInt
    case 4: // TFloat
    case 5: // TEnum
    case 10: // TFlags
    case 11: // TColor
      return 0;
    case 8: // TList
      return [];
    case 17: // TProperties
      return {};
    default:
      return null;
  }
}

function idColumn(sheet) {
  return (sheet?.columns || []).find((column) => parseType(getTypeString(column)).code === 0) || null;
}

function validateData(data) {
  const issues = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return ["The document root must be a JSON object."];
  }
  if (!Array.isArray(data.sheets)) issues.push("Missing or invalid 'sheets' array.");
  if (!Array.isArray(data.customTypes)) issues.push("Missing or invalid 'customTypes' array.");

  const sheets = Array.isArray(data.sheets) ? data.sheets : [];
  const names = new Set();
  for (const sheet of sheets) {
    if (!sheet || typeof sheet !== "object") {
      issues.push("A sheet is not an object.");
      continue;
    }
    if (!sheet.name) issues.push("A sheet is missing its name.");
    if (sheet.name && names.has(sheet.name)) issues.push(`Duplicate sheet name '${sheet.name}'.`);
    if (sheet.name) names.add(sheet.name);
    if (!Array.isArray(sheet.columns)) issues.push(`Sheet '${sheet.name || "?"}' has no valid columns array.`);
    if (!Array.isArray(sheet.lines)) issues.push(`Sheet '${sheet.name || "?"}' has no valid lines array.`);
    if (sheet.props !== undefined && (!sheet.props || typeof sheet.props !== "object" || Array.isArray(sheet.props))) issues.push(`Sheet '${sheet.name || "?"}' has invalid properties.`);
    if (sheet.separators !== undefined && !Array.isArray(sheet.separators)) issues.push(`Sheet '${sheet.name || "?"}' has invalid separators.`);
    const columns = Array.isArray(sheet.columns) ? sheet.columns : [];
    const lines = Array.isArray(sheet.lines) ? sheet.lines : [];
    lines.forEach((line, lineIndex) => {
      if (!line || typeof line !== "object" || Array.isArray(line)) issues.push(`Sheet '${sheet.name || "?"}' contains an invalid row at index ${lineIndex}.`);
    });
    const columnNames = new Set();
    for (const column of columns) {
      if (!column || typeof column !== "object") {
        issues.push(`Sheet '${sheet.name || "?"}' contains an invalid column.`);
        continue;
      }
      if (!column.name) issues.push(`Sheet '${sheet.name || "?"}' contains a column without a name.`);
      if (column.name && columnNames.has(column.name)) issues.push(`Duplicate column '${sheet.name}.${column.name}'.`);
      if (column.name) columnNames.add(column.name);
      const type = parseType(getTypeString(column));
      if (type.code < 0) issues.push(`Unknown type '${getTypeString(column)}' on '${sheet.name || "?"}.${column.name || "?"}'.`);
    }
    const key = idColumn(sheet);
    if (key && Array.isArray(sheet.lines)) {
      const ids = new Set();
      for (const line of sheet.lines) {
        const id = line && line[key.name];
        if (id !== undefined && id !== null && id !== "") {
          if (ids.has(String(id))) issues.push(`Duplicate id '${id}' in sheet '${sheet.name}'.`);
          ids.add(String(id));
        }
      }
    }
  }

  const customTypes = Array.isArray(data.customTypes) ? data.customTypes : [];
  for (const custom of customTypes) {
    if (!custom || typeof custom !== "object") {
      issues.push("A custom type is not an object.");
      continue;
    }
    if (!custom.name) issues.push("A custom type is missing its name.");
    if (!Array.isArray(custom.cases)) {
      issues.push(`Custom type '${custom.name || "?"}' has no valid cases array.`);
      continue;
    }
    for (const typeCase of custom.cases) {
      if (!typeCase || typeof typeCase !== "object" || Array.isArray(typeCase)) {
        issues.push(`Custom type '${custom.name || "?"}' contains an invalid case.`);
        continue;
      }
      if (!typeCase.name) issues.push(`Custom type '${custom.name || "?"}' contains a case without a name.`);
      if (!Array.isArray(typeCase.args)) {
        issues.push(`Case '${typeCase.name || "?"}' in custom type '${custom.name || "?"}' has no valid args array.`);
        continue;
      }
      for (const argument of (Array.isArray(typeCase.args) ? typeCase.args : [])) {
        const type = parseType(getTypeString(argument));
        if (type.code < 0) issues.push(`Unknown custom type argument '${getTypeString(argument)}'.`);
      }
    }
  }
  return issues;
}

function parseCdb(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { data: null, issues: [`Invalid JSON: ${error.message}`], error };
  }
  const issues = validateData(data);
  return { data, issues, error: issues.length ? new Error(issues[0]) : null };
}

function isEditorShapeValid(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (!Array.isArray(data.sheets) || !Array.isArray(data.customTypes)) return false;
  if (!data.sheets.every((sheet) => {
    if (!sheet || typeof sheet !== "object" || Array.isArray(sheet) || typeof sheet.name !== "string" || !sheet.name) return false;
    if (!Array.isArray(sheet.columns) || !Array.isArray(sheet.lines)) return false;
    if (sheet.props !== undefined && (!sheet.props || typeof sheet.props !== "object" || Array.isArray(sheet.props))) return false;
    if (sheet.separators !== undefined && !Array.isArray(sheet.separators)) return false;
    if (!sheet.columns.every((column) => column && typeof column === "object" && !Array.isArray(column) && typeof column.name === "string" && column.name)) return false;
    return sheet.lines.every((line) => line && typeof line === "object" && !Array.isArray(line));
  })) return false;
  return data.customTypes.every((customType) => {
    if (!customType || typeof customType !== "object" || Array.isArray(customType) || typeof customType.name !== "string" || !customType.name || !Array.isArray(customType.cases)) return false;
    return customType.cases.every((typeCase) => typeCase && typeof typeCase === "object" && !Array.isArray(typeCase) && typeof typeCase.name === "string" && typeCase.name && Array.isArray(typeCase.args) && typeCase.args.every((argument) => argument && typeof argument === "object" && !Array.isArray(argument) && typeof argument.name === "string" && argument.name));
  });
}

function serializeCdb(data) {
  return `${JSON.stringify(data, null, "\t")}\n`;
}

module.exports = {
  TYPE_NAMES,
  getTypeString,
  parseType,
  defaultValue,
  idColumn,
  validateData,
  parseCdb,
  isEditorShapeValid,
  serializeCdb
};
