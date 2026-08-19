// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const commitMutation = CDBVS.commitMutation;
  const isNestedType = CDBVS.isNestedType;
  const removeNestedSheet = CDBVS.removeNestedSheet;
  const adjustCellSelectionAfterColumnRemoval = CDBVS.adjustCellSelectionAfterColumnRemoval;
  const swapCellSelectionColumns = CDBVS.swapCellSelectionColumns;

  function deleteColumnAt(sheet, index) {
    if (!sheet || !Array.isArray(sheet.columns) || !Number.isInteger(index)) return false;
    const column = sheet.columns[index];
    if (!column) return false;
    const nested = isNestedType(CDBVS.typeOf(column));
    sheet.columns.splice(index, 1);
    (sheet.lines || []).forEach((line) => { if (line) delete line[column.name]; });
    if (sheet.props && sheet.props.displayColumn === column.name) delete sheet.props.displayColumn;
    if (sheet.props && sheet.props.displayIcon === column.name) delete sheet.props.displayIcon;
    CDBVS.removeViewColumn(sheet.name, column.name);
    adjustCellSelectionAfterColumnRemoval(sheet.name, index, sheet.columns.length);
    if (nested) removeNestedSheet(sheet, column.name);
    return true;
  }

  function moveColumn(sheet, index, delta) {
    if (!sheet || !Array.isArray(sheet.columns) || !Number.isInteger(index) || !Number.isInteger(delta)) return;
    const target = index + delta;
    if (target < 0 || target >= sheet.columns.length) return;
    commitMutation(() => {
      [sheet.columns[index], sheet.columns[target]] = [sheet.columns[target], sheet.columns[index]];
      swapCellSelectionColumns(sheet.name, index, target);
    });
  }

  function sheetBlock(sheet) {
    if (!state.data || !Array.isArray(state.data.sheets)) return [];
    return state.data.sheets.filter((item) => item === sheet || item.name.startsWith(`${sheet.name}@`));
  }

  function moveSheet(sheet, delta) {
    const visible = CDBVS.visibleSheets();
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
    commitMutation(() => {
      remaining.splice(insertAt, 0, ...firstBlock);
      state.data.sheets = remaining;
    });
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
    deleteColumnAt, moveColumn, sheetBlock, moveSheet, mapTypeStrings
  });
})(window);
