// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const services = CDBVS.services;
  const documentModel = services.document;
  const sheetState = services.sheetState;
  const sheetViewState = sheetState.view;
  const viewState = services.viewState;
  const typeOf = CDBVS.typeOf;
  const valueText = CDBVS.valueText;
  const colorText = CDBVS.colorText;

  function visibleSheets() {
    const sheets = documentModel.sheets();
    return sheets.filter((sheet) => viewState.showHiddenSheets() || !sheet.props || !sheet.props.hide);
  }

  function currentSheet() {
    const sheets = visibleSheets();
    const index = sheetState.getActiveIndex();
    if (index < 0 || index >= sheets.length) sheetState.setActiveIndex(Math.max(0, sheets.length - 1));
    return sheets[sheetState.getActiveIndex()] || null;
  }

  function viewForSheet(sheet) {
    if (!sheet || typeof sheet.name !== "string") return { filters: {}, sort: { column: "", direction: "asc" } };
    return { filters: sheetViewState.readFilters(sheet.name), sort: sheetViewState.readSort(sheet.name) };
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
      if (value === null || value === undefined || value === "") return false;
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
    if (type.code === 5 || type.code === 6) {
      if (rule.value === undefined || rule.value === null || String(rule.value) === "") return true;
      return String(value) === String(rule.value);
    }
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
      const filter = viewState.getFilter();
      if (filter && !JSON.stringify(entry.row).toLowerCase().includes(filter.toLowerCase())) return false;
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
      return comparison ? comparison * direction : left.rowIndex - right.rowIndex;
    });
    return rows;
  }

  function rowsForNavigation(sheet) {
    const separators = (sheet && Array.isArray(sheet.separators) ? sheet.separators : [])
      .map((separator) => CDBVS.separatorIndex(separator))
      .filter(Number.isInteger).sort((left, right) => left - right);
    return rowsForView(sheet).filter((entry) => {
      let section = null;
      let low = 0;
      let high = separators.length - 1;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (separators[middle] <= entry.rowIndex) {
          section = separators[middle];
          low = middle + 1;
        } else high = middle - 1;
      }
      return section === null || !sheetViewState.isSeparatorCollapsed(sheet.name, section);
    });
  }

  const sheetViewModel = services.sheetView;
  Object.assign(sheetViewModel, { visibleSheets, currentSheet, viewForSheet, filterMatches, rowsForView, rowsForNavigation });
  Object.freeze(sheetViewModel);
  Object.assign(CDBVS, { sheetViewModel, visibleSheets, currentSheet, viewForSheet, filterMatches, rowsForView });
})(window);
