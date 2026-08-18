(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const sendUpdate = () => CDBVS.sendUpdate();
  const renderAfterUpdate = CDBVS.renderAfterUpdate;
  const visibleSheets = (...args) => CDBVS.visibleSheets(...args);

  function deleteColumnAt(sheet, index) {
    if (!sheet || !Array.isArray(sheet.columns) || !Number.isInteger(index)) return false;
    const column = sheet.columns[index];
    if (!column) return false;
    sheet.columns.splice(index, 1);
    (sheet.lines || []).forEach((line) => { if (line) delete line[column.name]; });
    if (sheet.props && sheet.props.displayColumn === column.name) delete sheet.props.displayColumn;
    if (sheet.props && sheet.props.displayIcon === column.name) delete sheet.props.displayIcon;
    CDBVS.removeViewColumn(sheet.name, column.name);
    [state.selectedCells, state.activeCells].forEach((selections) => {
      const selection = selections && selections[sheet.name];
      if (!selection) return;
      if (selection.columnIndex > index) selection.columnIndex -= 1;
      if (selection.columnIndex >= sheet.columns.length) delete selections[sheet.name];
    });
    return true;
  }

  function isSeparatorCollapsed(sheet, index) {
    if (!sheet || !state.collapsedSeparators) return false;
    return state.collapsedSeparators[sheet.name] && state.collapsedSeparators[sheet.name][String(index)] === true;
  }

  function toggleSeparatorCollapsed(sheet, index) {
    if (!sheet) return false;
    if (!state.collapsedSeparators) state.collapsedSeparators = {};
    if (!state.collapsedSeparators[sheet.name]) state.collapsedSeparators[sheet.name] = {};
    const key = String(index);
    state.collapsedSeparators[sheet.name][key] = !isSeparatorCollapsed(sheet, index);
    return state.collapsedSeparators[sheet.name][key];
  }

  function shiftCollapsedSeparators(sheet, change) {
    if (!sheet || !state.collapsedSeparators || !state.collapsedSeparators[sheet.name]) return;
    const shifted = {};
    Object.keys(state.collapsedSeparators[sheet.name]).forEach((key) => {
      const next = change(Number.parseInt(key, 10));
      if (next !== null && next !== undefined) shifted[String(next)] = state.collapsedSeparators[sheet.name][key];
    });
    state.collapsedSeparators[sheet.name] = shifted;
  }

  function separatorIndex(separator) {
    return typeof separator === "number" ? separator : separator && separator.index;
  }

  function moveSeparators(sheet, change) {
    if (!Array.isArray(sheet.separators)) return;
    sheet.separators = sheet.separators.map((separator) => {
      const index = separatorIndex(separator);
      if (index === undefined) return separator;
      const next = change(index);
      if (next === null) return null;
      if (typeof separator === "number") return next;
      return Object.assign({}, separator, { index: next });
    }).filter((separator) => separator !== null);
  }

  function insertRow(sheet, index, row, notify = true) {
    if (!sheet) return;
    if (!Array.isArray(sheet.lines)) sheet.lines = [];
    const insertionIndex = Number.isInteger(index) ? Math.max(0, Math.min(index, sheet.lines.length)) : sheet.lines.length;
    const nextRow = row && typeof row === "object" && !Array.isArray(row) ? row : CDBVS.createRowForSchema(sheet, sheet.lines);
    sheet.lines.splice(insertionIndex, 0, nextRow);
    moveSeparators(sheet, (separatorIndexValue) => separatorIndexValue >= insertionIndex ? separatorIndexValue + 1 : separatorIndexValue);
    shiftCollapsedSeparators(sheet, (separatorIndexValue) => separatorIndexValue >= insertionIndex ? separatorIndexValue + 1 : separatorIndexValue);
    if (notify) sendUpdate();
  }

  function moveRow(sheet, index, delta) {
    if (!sheet || !Array.isArray(sheet.lines) || !Number.isInteger(index) || !Number.isInteger(delta)) return;
    const target = index + delta;
    if (target < 0 || target >= sheet.lines.length) return;
    [sheet.lines[index], sheet.lines[target]] = [sheet.lines[target], sheet.lines[index]];
    sendUpdate();
  }

  function toggleSeparator(sheet, index) {
    if (!sheet) return;
    if (!Array.isArray(sheet.separators)) sheet.separators = [];
    const existing = sheet.separators.findIndex((separator) => separatorIndex(separator) === index);
    if (existing >= 0) sheet.separators.splice(existing, 1);
    else {
      sheet.separators.push(index);
      sheet.separators.sort((a, b) => separatorIndex(a) - separatorIndex(b));
    }
    sendUpdate();
  }

  function addSeparator(sheet, index) {
    if (!sheet || !Number.isInteger(index)) return false;
    if (!Array.isArray(sheet.separators)) sheet.separators = [];
    if (sheet.separators.some((separator) => separatorIndex(separator) === index)) return false;
    sheet.separators.push({ index, title: "Section" });
    sheet.separators.sort((left, right) => separatorIndex(left) - separatorIndex(right));
    renderAfterUpdate();
    return true;
  }

  function removeSeparator(sheet, index) {
    if (!sheet || !Array.isArray(sheet.separators)) return false;
    const position = sheet.separators.findIndex((separator) => separatorIndex(separator) === index);
    if (position < 0) return false;
    sheet.separators.splice(position, 1);
    if (sheet.props && Array.isArray(sheet.props.separatorTitles)) sheet.props.separatorTitles.splice(position, 1);
    if (state.collapsedSeparators && state.collapsedSeparators[sheet.name]) delete state.collapsedSeparators[sheet.name][String(index)];
    renderAfterUpdate();
    return true;
  }

  function deleteRowAt(sheet, index) {
    if (!sheet || !Array.isArray(sheet.lines) || !Number.isInteger(index) || index < 0 || index >= sheet.lines.length) return false;
    sheet.lines.splice(index, 1);
    moveSeparators(sheet, (separatorIndexValue) => {
      if (separatorIndexValue === index) return null;
      return separatorIndexValue > index ? separatorIndexValue - 1 : separatorIndexValue;
    });
    shiftCollapsedSeparators(sheet, (separatorIndexValue) => {
      if (separatorIndexValue === index) return null;
      return separatorIndexValue > index ? separatorIndexValue - 1 : separatorIndexValue;
    });
    return true;
  }

  function moveColumn(sheet, index, delta) {
    if (!sheet || !Array.isArray(sheet.columns) || !Number.isInteger(index) || !Number.isInteger(delta)) return;
    const target = index + delta;
    if (target < 0 || target >= sheet.columns.length) return;
    [sheet.columns[index], sheet.columns[target]] = [sheet.columns[target], sheet.columns[index]];
    const selection = state.selectedCells && state.selectedCells[sheet.name];
    if (selection && selection.columnIndex === index) selection.columnIndex = target;
    else if (selection && selection.columnIndex === target) selection.columnIndex = index;
    const active = state.activeCells && state.activeCells[sheet.name];
    if (active && active.columnIndex === index) active.columnIndex = target;
    else if (active && active.columnIndex === target) active.columnIndex = index;
    renderAfterUpdate();
  }

  function sheetBlock(sheet) {
    if (!state.data || !Array.isArray(state.data.sheets)) return [];
    return state.data.sheets.filter((item) => item === sheet || item.name.startsWith(`${sheet.name}@`));
  }

  function moveSheet(sheet, delta) {
    const visible = visibleSheets();
    const sheets = visible.filter((candidate) => !visible.some((parent) => parent !== candidate && candidate.name.startsWith(`${parent.name}@`)));
    const index = sheets.indexOf(sheet);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= sheets.length) return;
    const other = sheets[target];
    const firstBlock = sheetBlock(sheet);
    const otherBlock = sheetBlock(other);
    const firstSet = new Set(firstBlock);
    const remaining = state.data.sheets.filter((item) => !firstSet.has(item));
    const otherIndex = remaining.indexOf(other);
    const insertAt = delta < 0 ? otherIndex : otherIndex + otherBlock.length;
    remaining.splice(insertAt, 0, ...firstBlock);
    state.data.sheets = remaining;
    renderAfterUpdate();
  }

  function mapTypeStrings(callback) {
    const sheets = state.data && Array.isArray(state.data.sheets) ? state.data.sheets : [];
    sheets.forEach((sheet) => (sheet.columns || []).forEach((column) => {
      const property = Object.prototype.hasOwnProperty.call(column, "typeStr") ? "typeStr" : (Object.prototype.hasOwnProperty.call(column, "type") ? "type" : null);
      if (property) column[property] = callback(String(column[property]));
    }));
    (state.data && Array.isArray(state.data.customTypes) ? state.data.customTypes : []).forEach((customType) => {
      (customType.cases || []).forEach((typeCase) => (typeCase.args || []).forEach((argument) => {
        const property = Object.prototype.hasOwnProperty.call(argument, "typeStr") ? "typeStr" : (Object.prototype.hasOwnProperty.call(argument, "type") ? "type" : null);
        if (property) argument[property] = callback(String(argument[property]));
      }));
    });
  }

  Object.assign(CDBVS, {
    isSeparatorCollapsed, toggleSeparatorCollapsed, shiftCollapsedSeparators, separatorIndex,
    moveSeparators, insertRow, moveRow, toggleSeparator, addSeparator, removeSeparator, deleteRowAt,
    deleteColumnAt, moveColumn, sheetBlock, moveSheet, mapTypeStrings
  });
})(window);
