import type { CdbDatabase, ParsedCdb } from "./types";
import { isEditorShapeValid, validateData } from "./Validation";
import {
  TYPE_NAMES, defaultValue, getTypeString, idColumn, parseType
} from "./TypeSystem";

/*
 * The type numbering and validation rules here follow CastleDB's original
 * cdb/Parser.hx and cdb/Data.hx. The original Haxe sources are retained in
 * vendor/castledb/cdb for reference and for future shared-library work.
 */

export function parseCdb(text: string): ParsedCdb {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    const parseError = error instanceof Error ? error : new Error(String(error));
    return { data: null, issues: [`Invalid JSON: ${parseError.message}`], error: parseError };
  }
  const issues = validateData(data);
  return { data, issues, error: issues.length ? new Error(issues[0]) : null };
}

export function serializeCdb(data: unknown): string {
  return `${JSON.stringify(data, null, "\t")}\n`;
}

export {
  TYPE_NAMES,
  getTypeString,
  parseType,
  defaultValue,
  idColumn,
  validateData,
  isEditorShapeValid
};

export type { CdbDatabase };
