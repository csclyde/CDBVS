// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const services = CDBVS.services;
  const sheetState = services.sheetState;
  const sheetViewState = sheetState.view;
  const model = services.document.operations.rows;
  const insertRowModel = model.insert;
  const appendRowModel = model.append;
  const deleteRowModel = model.delete;
  const removeSeparatorModel = model.remove;

  function insertRow(sheet, index, row) {
    if (!sheet) return false;
    const lineCount = Array.isArray(sheet.lines) ? sheet.lines.length : 0;
    const insertionIndex = Number.isInteger(index) ? Math.max(0, Math.min(index, lineCount)) : lineCount;
    const result = insertRowModel(sheet, index, row);
    if (result !== false) {
      sheetViewState.shiftCollapsedSeparators(sheet.name, (separatorIndex) => (
        separatorIndex >= insertionIndex ? separatorIndex + 1 : separatorIndex
      ));
    }
    return result !== false;
  }

  function appendRow(sheet) {
    if (!sheet) return false;
    const index = Array.isArray(sheet.lines) ? sheet.lines.length : 0;
    const result = appendRowModel(sheet);
    if (result !== false) {
      sheetViewState.shiftCollapsedSeparators(sheet.name, (separatorIndex) => (
        separatorIndex >= index ? separatorIndex + 1 : separatorIndex
      ));
    }
    return result !== false;
  }

  function deleteRowAt(sheet, index) {
    const result = deleteRowModel(sheet, index);
    if (result) {
      sheetViewState.shiftCollapsedSeparators(sheet.name, (separatorIndex) => {
        if (separatorIndex === index) return null;
        return separatorIndex > index ? separatorIndex - 1 : separatorIndex;
      });
    }
    return result;
  }

  function removeSeparatorAt(sheet, index) {
    const result = removeSeparatorModel(sheet, index);
    if (result) sheetViewState.removeCollapsedSeparator(sheet.name, index);
    return result;
  }

  const rowActions = services.application.rowActions;
  Object.assign(rowActions, { insertRow, appendRow, deleteRowAt, removeSeparatorAt });
  Object.freeze(rowActions);
  Object.assign(CDBVS, { insertRow, appendRow, deleteRowAt, removeSeparatorAt });
})(window);
