// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;

  // All per-sheet state lives behind this registry. Keeping the groups here
  // prevents a new sheet operation from updating one selection/view map while
  // forgetting another one.
  const SHEET_STATE_MAPS = [
    "selectedRows", "activeRows", "rowSelectionAnchors", "selectedCells", "activeCells",
    "columnFilters", "sorts", "collapsedSeparators", "cellErrors"
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

  function clearSheetState(key, sheetName) {
    delete ensureStateMap(key)[sheetName];
  }

  function clearStateMap(key) {
    state[key] = {};
    return state[key];
  }

  function adjustCellSelectionAfterColumnRemoval(sheetName, removedIndex, columnCount) {
    ["selectedCells", "activeCells"].forEach((key) => {
      const selection = ensureStateMap(key)[sheetName];
      if (!selection) return;
      if (selection.columnIndex > removedIndex) selection.columnIndex -= 1;
      if (selection.columnIndex >= columnCount) delete ensureStateMap(key)[sheetName];
    });
  }

  function swapCellSelectionColumns(sheetName, firstIndex, secondIndex) {
    ["selectedCells", "activeCells"].forEach((key) => {
      const selection = ensureStateMap(key)[sheetName];
      if (!selection) return;
      if (selection.columnIndex === firstIndex) selection.columnIndex = secondIndex;
      else if (selection.columnIndex === secondIndex) selection.columnIndex = firstIndex;
    });
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

  function setColumnFilters(sheetName, filters) {
    ensureStateMap("columnFilters")[sheetName] = filters && typeof filters === "object" ? filters : {};
    return ensureStateMap("columnFilters")[sheetName];
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

  function isListExpanded(key) {
    return !!(state.expandedLists && typeof state.expandedLists.has === "function" && state.expandedLists.has(key));
  }

  function setListExpanded(key, expanded) {
    if (!state.expandedLists || typeof state.expandedLists.add !== "function") state.expandedLists = new Set();
    if (expanded) state.expandedLists.add(key);
    else state.expandedLists.delete(key);
    return expanded;
  }

  function selectedListItems(key, itemCount) {
    const raw = ensureStateMap("selectedListRows")[key];
    const indexes = Array.isArray(raw) ? raw : [raw];
    const valid = [...new Set(indexes.filter((index) => Number.isInteger(index) && index >= 0 && index < itemCount))];
    if (!valid.length) delete ensureStateMap("selectedListRows")[key];
    return valid;
  }

  function selectedListCell(key, itemCount, columnCount) {
    const selected = ensureStateMap("selectedListCells")[key];
    if (!selected || !Number.isInteger(selected.itemIndex) || !Number.isInteger(selected.columnIndex)
      || selected.itemIndex < 0 || selected.itemIndex >= itemCount
      || selected.columnIndex < 0 || selected.columnIndex >= columnCount) return null;
    return { itemIndex: selected.itemIndex, columnIndex: selected.columnIndex };
  }

  function listSelectionAnchor(key) {
    return ensureStateMap("listSelectionAnchors")[key];
  }

  function setSelectedListItems(key, indexes, activeIndex, anchorIndex, itemCount) {
    const rows = ensureStateMap("selectedListRows");
    const anchors = ensureStateMap("listSelectionAnchors");
    const valid = [...new Set((Array.isArray(indexes) ? indexes : [indexes])
      .filter((index) => Number.isInteger(index) && index >= 0 && index < itemCount))];
    if (!valid.length) {
      delete rows[key];
      delete anchors[key];
      return [];
    }
    const active = Number.isInteger(activeIndex) && valid.includes(activeIndex) ? activeIndex : valid[valid.length - 1];
    const ordered = valid.filter((index) => index !== active).concat(active);
    rows[key] = ordered.length === 1 ? ordered[0] : ordered;
    anchors[key] = Number.isInteger(anchorIndex) && valid.includes(anchorIndex) ? anchorIndex : active;
    return valid;
  }

  function selectListItems(key, itemIndex, itemCount, event) {
    const current = selectedListItems(key, itemCount);
    const modified = event && (event.ctrlKey || event.metaKey);
    const savedAnchor = listSelectionAnchor(key);
    let next;
    let active = itemIndex;
    let anchor = itemIndex;
    if (event && event.shiftKey) {
      anchor = Number.isInteger(savedAnchor) && savedAnchor >= 0 && savedAnchor < itemCount
        ? savedAnchor : (current.length ? current[0] : itemIndex);
      const start = Math.min(anchor, itemIndex);
      const end = Math.max(anchor, itemIndex);
      next = Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
    } else if (modified) {
      next = current.includes(itemIndex) ? current.filter((index) => index !== itemIndex) : current.concat(itemIndex);
      active = next.includes(itemIndex) ? itemIndex : (next.length ? next[next.length - 1] : null);
    } else {
      next = [itemIndex];
    }
    delete ensureStateMap("selectedListCells")[key];
    return setSelectedListItems(key, next, active, anchor, itemCount);
  }

  function setSelectedListCell(key, itemIndex, columnIndex) {
    ensureStateMap("selectedListCells")[key] = { itemIndex, columnIndex };
    return ensureStateMap("selectedListCells")[key];
  }

  function clearSelectedListCell(key) {
    delete ensureStateMap("selectedListCells")[key];
  }

  function clearSelectedListItems(key) {
    delete ensureStateMap("selectedListRows")[key];
    delete ensureStateMap("listSelectionAnchors")[key];
  }

  function clearSelectedListSelection(key) {
    clearSelectedListItems(key);
    clearSelectedListCell(key);
  }

  Object.assign(CDBVS, {
    ensureStateMap,
    ensureSheetState,
    clearSheetState,
    clearStateMap,
    adjustCellSelectionAfterColumnRemoval,
    swapCellSelectionColumns,
    renameStateKeys,
    removeStateKeys,
    renameViewSheet,
    removeViewSheet,
    renameViewColumn,
    removeViewColumn,
    setColumnFilters,
    renameSheetState,
    removeSheetState,
    clearListState,
    isListExpanded,
    setListExpanded,
    selectedListItems,
    selectedListCell,
    listSelectionAnchor,
    setSelectedListItems,
    selectListItems,
    setSelectedListCell,
    clearSelectedListCell,
    clearSelectedListItems,
    clearSelectedListSelection
  });
})(window);
