// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;

  // All per-sheet state lives behind this registry. Keeping the groups here
  // prevents a new sheet operation from updating one selection/view map while
  // forgetting another one.
  const SHEET_STATE_MAPS = [
    "selectedRows", "activeRows", "rowSelectionAnchors", "selectedCells", "activeCells",
    "columnFilters", "sorts", "collapsedSeparators"
  ];
  const NESTED_SHEET_STATE_MAPS = ["selectedListRows", "selectedListCells", "listSelectionAnchors"];

  function ensureStateMap(key) {
    if (!state[key] || typeof state[key] !== "object" || Array.isArray(state[key])) state[key] = {};
    return state[key];
  }

  function ensureSheetState(key, sheetName, createValue) {
    const map = ensureStateMap(key);
    if (map[sheetName] === undefined && typeof createValue === "function") map[sheetName] = createValue();
    return map[sheetName];
  }

  function matchesKey(key, prefix, separator) {
    return key === prefix || key.startsWith(`${prefix}${separator}`);
  }

  function renameStateKeys(map, oldPrefix, newPrefix, separator = "@") {
    if (!map || oldPrefix === newPrefix) return;
    Object.keys(map).forEach((key) => {
      if (!matchesKey(key, oldPrefix, separator)) return;
      map[`${newPrefix}${key.slice(oldPrefix.length)}`] = map[key];
      delete map[key];
    });
  }

  function removeStateKeys(map, prefix, separator = "@") {
    if (!map) return;
    Object.keys(map).forEach((key) => {
      if (matchesKey(key, prefix, separator)) delete map[key];
    });
  }

  function renameViewSheet(oldName, newName) {
    SHEET_STATE_MAPS.slice(5).forEach((key) => renameStateKeys(ensureStateMap(key), oldName, newName));
  }

  function removeViewSheet(sheetName) {
    SHEET_STATE_MAPS.slice(5).forEach((key) => removeStateKeys(ensureStateMap(key), sheetName));
  }

  function renameViewColumn(sheetName, oldName, newName) {
    const filters = ensureStateMap("columnFilters")[sheetName];
    if (filters && Object.prototype.hasOwnProperty.call(filters, oldName)) {
      filters[newName] = filters[oldName];
      delete filters[oldName];
    }
    const sort = ensureStateMap("sorts")[sheetName];
    if (sort && sort.column === oldName) sort.column = newName;
  }

  function removeViewColumn(sheetName, columnName) {
    const filters = ensureStateMap("columnFilters")[sheetName];
    if (filters) delete filters[columnName];
    const sort = ensureStateMap("sorts")[sheetName];
    if (sort && sort.column === columnName) sort.column = "";
  }

  function renameSheetState(oldName, newName) {
    if (oldName === newName) return;
    SHEET_STATE_MAPS.slice(0, 5).forEach((key) => renameStateKeys(ensureStateMap(key), oldName, newName));
    NESTED_SHEET_STATE_MAPS.forEach((key) => renameStateKeys(ensureStateMap(key), oldName, newName, "/"));
    renameViewSheet(oldName, newName);
    if (state.expandedLists && typeof state.expandedLists.clear === "function") state.expandedLists.clear();
  }

  function removeSheetState(sheetName) {
    SHEET_STATE_MAPS.slice(0, 5).forEach((key) => removeStateKeys(ensureStateMap(key), sheetName));
    NESTED_SHEET_STATE_MAPS.forEach((key) => removeStateKeys(ensureStateMap(key), sheetName, "/"));
    removeViewSheet(sheetName);
    if (state.expandedLists && typeof state.expandedLists.clear === "function") state.expandedLists.clear();
  }

  function clearListState() {
    state.selectedListRows = {};
    state.selectedListCells = {};
    state.listSelectionAnchors = {};
    if (state.expandedLists && typeof state.expandedLists.clear === "function") state.expandedLists.clear();
  }

  function clearViewState() {
    state.filter = "";
    state.columnFilters = {};
    state.sorts = {};
    if (typeof CDBVS.renderNow === "function") CDBVS.renderNow();
  }

  Object.assign(CDBVS, {
    ensureStateMap,
    ensureSheetState,
    renameStateKeys,
    removeStateKeys,
    renameViewSheet,
    removeViewSheet,
    renameViewColumn,
    removeViewColumn,
    renameSheetState,
    removeSheetState,
    clearListState,
    clearViewState
  });
})(window);
