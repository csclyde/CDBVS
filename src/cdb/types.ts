export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface CdbObject {
  [key: string]: unknown;
}

export interface CdbColumn extends CdbObject {
  name: string;
  typeStr?: string | number;
  type?: string | number;
  opt?: boolean;
  display?: boolean;
  kind?: string;
  scope?: number;
  documentation?: string;
}

export interface CdbRow extends CdbObject {}

export interface CdbSeparatorObject extends CdbObject {
  index?: number;
  id?: string;
  title?: string;
}

export type CdbSeparator = number | CdbSeparatorObject;

export interface CdbSheetProps extends CdbObject {
  displayColumn?: string;
  displayIcon?: string;
  hide?: boolean;
  isProps?: boolean;
  hasIndex?: boolean;
  hasGroup?: boolean;
  dataFiles?: string[];
}

export interface CdbSheet extends CdbObject {
  name: string;
  columns: CdbColumn[];
  lines: CdbRow[];
  separators?: CdbSeparator[];
  props?: CdbSheetProps;
}

export interface CdbTypeCase extends CdbObject {
  name: string;
  args: CdbColumn[];
}

export interface CdbCustomType extends CdbObject {
  name: string;
  cases: CdbTypeCase[];
}

export interface CdbDatabase extends CdbObject {
  customTypes: CdbCustomType[];
  sheets: CdbSheet[];
}

export interface ParsedType {
  code: number;
  name: string;
  argument: string;
  raw: string;
  values?: string[];
  target?: string;
}

export interface ParsedCdb {
  data: unknown | null;
  issues: string[];
  error: Error | null;
}

export function isJsonObject(value: unknown): value is { [key: string]: unknown } {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
