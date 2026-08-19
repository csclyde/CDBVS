// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const services = CDBVS.services;
  const sheetState = services.sheetState;
  const applyColumnEditModel = CDBVS.applyColumnEdit;
  const deleteColumnModel = CDBVS.deleteColumnAt;
  const moveColumnModel = CDBVS.moveColumnBlock;
  const isNestedType = CDBVS.isNestedType;
  const commitMutation = services.application.commitMutation;

  function applyColumnEdit(sheet, column, columnIndex, options) {
    if (!sheet || !column) return { ok: false, message: "Column is unavailable." };
    const oldName = column.name;
    const oldNested = isNestedType(CDBVS.typeOf(column));
    const result = applyColumnEditModel(sheet, column, columnIndex, options);
    if (!result.ok) return result;

    if (oldName !== column.name) {
      sheetState.renameColumn(sheet.name, oldName, column.name);
      sheetState.clearList();
    }
    if (oldNested && !isNestedType(CDBVS.typeOf(column))) {
      sheetState.removeSheet(`${sheet.name}@${oldName}`);
    }
    return result;
  }

  function deleteColumn(sheet, index) {
    if (!sheet || !Array.isArray(sheet.columns)) return false;
    const column = sheet.columns[index];
    if (!column) return false;
    const nested = isNestedType(CDBVS.typeOf(column));
    const result = deleteColumnModel(sheet, index);
    if (result) {
      sheetState.removeColumn(sheet.name, column.name);
      sheetState.adjustSelectionAfterColumnRemoval(sheet.name, index, sheet.columns.length);
      if (nested) sheetState.removeSheet(`${sheet.name}@${column.name}`);
    }
    return result;
  }

  function moveColumn(sheet, index, delta) {
    if (!sheet || !Number.isInteger(index) || !Number.isInteger(delta)) return false;
    return commitMutation(() => {
      const result = moveColumnModel(sheet, index, delta);
      if (result) sheetState.swapSelectionColumns(sheet.name, index, index + delta);
      return result;
    }) === true;
  }

  const columnActions = services.application.columnActions;
  Object.assign(columnActions, { applyColumnEdit, deleteColumn, moveColumn });
  Object.freeze(columnActions);
  Object.assign(CDBVS, { applyColumnEdit, deleteColumn, moveColumn });
})(window);
