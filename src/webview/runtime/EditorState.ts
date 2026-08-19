import type { WebviewState } from "../contract";

export const TYPE_NAMES = [
  "id", "string", "bool", "int", "float", "enum", "ref", "image",
  "list", "custom", "flags", "color", "layer", "file", "tilepos",
  "tilelayer", "dynamic", "properties", "gradient", "curve", "guid"
];

export function createEditorState(): WebviewState {
  return {
    text: "",
    data: null,
    issues: [],
    sheetIndex: 0,
    rawMode: false,
    filter: "",
    columnFilters: {},
    sorts: {},
    selectedRows: {},
    activeRows: {},
    rowSelectionAnchors: {},
    selectedCells: {},
    activeCells: {},
    selectedListRows: {},
    selectedListCells: {},
    listSelectionAnchors: {},
    rowClipboard: null,
    cellClipboard: null,
    cellErrors: {},
    collapsedSeparators: {},
    showHiddenSheets: false,
    expandedLists: new Set<string>(),
    scrollLeft: 0,
    scrollTop: 0
  };
}
