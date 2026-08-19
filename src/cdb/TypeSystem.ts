import type { CdbColumn, CdbSheet, JsonValue, ParsedType } from "./types";

/** CastleDB's stable type numbering, shared by parsing and editor defaults. */
export const TYPE_NAMES = [
  "id", "string", "bool", "int", "float", "enum", "ref", "image",
  "list", "custom", "flags", "color", "layer", "file", "tilepos",
  "tilelayer", "dynamic", "properties", "gradient", "curve", "guid"
];

export function getTypeString(column: unknown): string | null {
  const value = column as Record<string, unknown> | null;
  if (!value || typeof value !== "object") return null;
  if (value.typeStr !== undefined && value.typeStr !== null) return String(value.typeStr);
  if (value.type !== undefined && value.type !== null) return String(value.type);
  return null;
}

export function parseType(typeString: unknown): ParsedType {
  const raw = String(typeString ?? "");
  const separator = raw.indexOf(":");
  const numberText = (separator < 0 ? raw : raw.slice(0, separator)).trim();
  // Do not accept numeric prefixes such as "3garbage" as valid type strings.
  const code = /^\d+$/.test(numberText) ? Number(numberText) : NaN;
  const argument = separator < 0 ? "" : raw.slice(separator + 1);
  if (!Number.isInteger(code) || code < 0 || code >= TYPE_NAMES.length) {
    return { code: -1, name: "unknown", argument, raw };
  }
  const result: ParsedType = { code, name: TYPE_NAMES[code], argument, raw };
  if (code === 5 || code === 10) result.values = argument ? argument.split(",") : [];
  if (code === 6 || code === 9 || code === 12) result.target = argument;
  return result;
}

export function defaultValue(column: unknown): JsonValue | null {
  const type = parseType(getTypeString(column));
  switch (type.code) {
    case 0: case 1: case 6: case 7: case 12: case 13: return "";
    case 2: return false;
    case 3: case 4: case 5: case 10: case 11: return 0;
    case 8: return [];
    case 17: return {};
    default: return null;
  }
}

export function idColumn(sheet: CdbSheet | null | undefined): CdbColumn | null {
  return (sheet?.columns || []).find((column) => parseType(getTypeString(column)).code === 0) || null;
}
