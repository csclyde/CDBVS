(function (global) {
  const CDBVS = global.CDBVS;

  function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function cloneValue(value) {
    if (value === undefined) return undefined;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  function getTypeString(column) {
    if (!isRecord(column)) return null;
    if (column.typeStr !== undefined && column.typeStr !== null) return String(column.typeStr);
    if (column.type !== undefined && column.type !== null) return String(column.type);
    return null;
  }

  function typeOf(column) {
    const raw = String(getTypeString(column) ?? "");
    const separator = raw.indexOf(":");
    const code = Number.parseInt(separator < 0 ? raw : raw.slice(0, separator), 10);
    const argument = separator < 0 ? "" : raw.slice(separator + 1);
    const validCode = Number.isInteger(code) && code >= 0 && code < CDBVS.TYPE_NAMES.length;
    return {
      code: validCode ? code : -1,
      name: validCode ? CDBVS.TYPE_NAMES[code] : "unknown",
      argument,
      values: validCode && (code === 5 || code === 10) && argument ? argument.split(",") : []
    };
  }

  function typeLabel(column) {
    return String(getTypeString(column) ?? "?");
  }

  function valueText(value) {
    if (value === undefined || value === null) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function colorText(value) {
    return `#${Math.max(0, Number(value) || 0).toString(16).slice(-6).padStart(6, "0")}`;
  }

  function idColumn(sheet) {
    return (sheet && Array.isArray(sheet.columns) ? sheet.columns : [])
      .find((column) => typeOf(column).code === 0) || null;
  }

  function setColumnTypeString(column, typeString) {
    if (!isRecord(column)) return;
    const property = Object.prototype.hasOwnProperty.call(column, "typeStr")
      ? "typeStr"
      : (Object.prototype.hasOwnProperty.call(column, "type") ? "type" : "typeStr");
    column[property] = typeString;
  }

  function renderAfterUpdate() {
    CDBVS.sendUpdate();
    renderNow();
  }

  function renderNow() {
    if (typeof CDBVS.render === "function") CDBVS.render();
  }

  function matchesStateKey(key, prefix, separator) {
    return key === prefix || key.startsWith(`${prefix}${separator}`);
  }

  function renameStateKeys(map, oldPrefix, newPrefix, separator = "@") {
    if (!map) return;
    Object.keys(map).forEach((key) => {
      if (!matchesStateKey(key, oldPrefix, separator)) return;
      map[`${newPrefix}${key.slice(oldPrefix.length)}`] = map[key];
      delete map[key];
    });
  }

  function removeStateKeys(map, prefix, separator = "@") {
    if (!map) return;
    Object.keys(map).forEach((key) => {
      if (matchesStateKey(key, prefix, separator)) delete map[key];
    });
  }

  function renameSheetState(oldName, newName) {
    const state = CDBVS.state;
    ["selectedRows", "activeRows", "rowSelectionAnchors", "selectedCells", "activeCells"].forEach((key) => {
      renameStateKeys(state[key], oldName, newName);
    });
    renameStateKeys(state.selectedListRows, oldName, newName, "/");
    renameStateKeys(state.listSelectionAnchors, oldName, newName, "/");
    state.expandedLists.clear();
  }

  function removeSheetState(sheetName) {
    const state = CDBVS.state;
    ["selectedRows", "activeRows", "rowSelectionAnchors", "selectedCells", "activeCells"].forEach((key) => {
      removeStateKeys(state[key], sheetName);
    });
    removeStateKeys(state.selectedListRows, sheetName, "/");
    removeStateKeys(state.listSelectionAnchors, sheetName, "/");
    state.expandedLists.clear();
  }

  function clearListState() {
    const state = CDBVS.state;
    state.selectedListRows = {};
    state.listSelectionAnchors = {};
    state.expandedLists.clear();
  }

  function commitEditorTarget(editorTarget) {
    if (!editorTarget || typeof editorTarget.dispatchEvent !== "function") return;
    if (typeof editorTarget._cdbvsCommit === "function") {
      editorTarget._cdbvsCommit();
      return;
    }
    editorTarget.dispatchEvent(new Event("change", { bubbles: false }));
  }

  Object.assign(CDBVS, {
    isRecord,
    cloneValue,
    getTypeString,
    typeOf,
    typeLabel,
    valueText,
    colorText,
    idColumn,
    setColumnTypeString,
    renderNow,
    renderAfterUpdate,
    renameStateKeys,
    removeStateKeys,
    renameSheetState,
    removeSheetState,
    clearListState,
    commitEditorTarget
  });
})(window);
