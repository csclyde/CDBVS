// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const typeOf = CDBVS.typeOf;
  const valueText = CDBVS.valueText;
  const colorText = CDBVS.colorText;
  const renameStateKeys = CDBVS.renameStateKeys;
  const removeStateKeys = CDBVS.removeStateKeys;
  const renderNow = CDBVS.renderNow;

  function visibleSheets() {
    if (!state.data || !Array.isArray(state.data.sheets)) return [];
    return state.data.sheets.filter((sheet) => state.showHiddenSheets || !sheet.props || !sheet.props.hide);
  }

  function currentSheet() {
    const sheets = visibleSheets();
    if (!Number.isInteger(state.sheetIndex) || state.sheetIndex < 0 || state.sheetIndex >= sheets.length) state.sheetIndex = Math.max(0, sheets.length - 1);
    return sheets[state.sheetIndex] || null;
  }

  function viewForSheet(sheet) {
    if (!sheet || typeof sheet.name !== "string") return { filters: {}, sort: { column: "", direction: "asc" } };
    if (!state.columnFilters[sheet.name]) state.columnFilters[sheet.name] = {};
    if (!state.sorts[sheet.name]) state.sorts[sheet.name] = { column: "", direction: "asc" };
    return { filters: state.columnFilters[sheet.name], sort: state.sorts[sheet.name] };
  }

  function renameViewSheet(oldName, newName) {
    if (oldName === newName) return;
    renameStateKeys(state.columnFilters, oldName, newName);
    renameStateKeys(state.sorts, oldName, newName);
    renameStateKeys(state.collapsedSeparators, oldName, newName);
  }

  function removeViewSheet(sheetName) {
    removeStateKeys(state.columnFilters, sheetName);
    removeStateKeys(state.sorts, sheetName);
    removeStateKeys(state.collapsedSeparators, sheetName);
  }

  function renameViewColumn(sheetName, oldName, newName) {
    const filters = state.columnFilters[sheetName];
    if (filters && filters[oldName]) {
      filters[newName] = filters[oldName];
      delete filters[oldName];
    }
    const sort = state.sorts[sheetName];
    if (sort && sort.column === oldName) sort.column = newName;
  }

  function removeViewColumn(sheetName, columnName) {
    const filters = state.columnFilters[sheetName];
    if (filters) delete filters[columnName];
    const sort = state.sorts[sheetName];
    if (sort && sort.column === columnName) sort.column = "";
  }

  function clearViewState() {
    state.filter = "";
    state.columnFilters = {};
    state.sorts = {};
    renderNow();
  }

  function filterMatches(column, value, rule) {
    if (!rule) return true;
    const type = typeOf(column);
    if (type.code === 2) {
      if (!rule.value || rule.value === "any") return true;
      if (value === undefined || value === null) return false;
      const booleanValue = value === true || value === 1 || value === "true";
      return rule.value === "true" ? booleanValue : !booleanValue;
    }
    if (type.code === 3 || type.code === 4) {
      const number = Number(value);
      if (!Number.isFinite(number)) return false;
      if (rule.min !== "" && rule.min !== undefined && number < Number(rule.min)) return false;
      if (rule.max !== "" && rule.max !== undefined && number > Number(rule.max)) return false;
      return true;
    }
    if (type.code === 11) {
      if (rule.value === undefined || String(rule.value).trim() === "") return true;
      if (value === undefined || value === null) return false;
      const query = String(rule.value).toLowerCase();
      return colorText(value).toLowerCase().includes(query) || String(value).toLowerCase().includes(query);
    }
    if (type.code === 5) return !rule.value || String(value) === String(rule.value);
    if (type.code === 10) {
      const mask = Number(rule.mask) || 0;
      return !mask || ((Number(value) || 0) & mask) === mask;
    }
    if (rule.value === undefined || String(rule.value).trim() === "") return true;
    return valueText(value).toLowerCase().includes(String(rule.value).toLowerCase());
  }

  function rowsForView(sheet) {
    if (!sheet || typeof sheet !== "object") return [];
    const view = viewForSheet(sheet);
    const rows = (Array.isArray(sheet.lines) ? sheet.lines : []).map((rawRow, rowIndex) => {
      const row = rawRow && typeof rawRow === "object" && !Array.isArray(rawRow) ? rawRow : {};
      return { row, rowIndex };
    }).filter((entry) => {
      if (state.filter && !JSON.stringify(entry.row).toLowerCase().includes(state.filter.toLowerCase())) return false;
      return (sheet.columns || []).every((column) => filterMatches(column, entry.row[column.name], view.filters[column.name]));
    });
    if (!view.sort.column) return rows;
    const column = (sheet.columns || []).find((item) => item.name === view.sort.column);
    if (!column) return rows;
    const direction = view.sort.direction === "desc" ? -1 : 1;
    rows.sort((left, right) => {
      const a = left.row[column.name];
      const b = right.row[column.name];
      if (a === undefined || a === null || a === "") return b === undefined || b === null || b === "" ? left.rowIndex - right.rowIndex : 1;
      if (b === undefined || b === null || b === "") return -1;
      const type = typeOf(column);
      let comparison;
      if (type.code === 2 || type.code === 3 || type.code === 4 || type.code === 5 || type.code === 10 || type.code === 11) comparison = Number(a) - Number(b);
      else comparison = valueText(a).toLowerCase().localeCompare(valueText(b).toLowerCase());
      return (comparison || (left.rowIndex - right.rowIndex)) * direction;
    });
    return rows;
  }

  function setPrimaryColumn(sheet, columnName) {
    if (!sheet || !Array.isArray(sheet.columns)) return;
    sheet.columns.forEach((column) => {
      if (column.name === columnName) CDBVS.setColumnTypeString(column, "0");
      else if (typeOf(column).code === 0) CDBVS.setColumnTypeString(column, "1");
    });
  }

  Object.assign(CDBVS, {
    visibleSheets, currentSheet, viewForSheet, renameViewSheet, removeViewSheet, renameViewColumn, removeViewColumn,
    clearViewState, filterMatches, rowsForView, setPrimaryColumn
  });
})(window);
