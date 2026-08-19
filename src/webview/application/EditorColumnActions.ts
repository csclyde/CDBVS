// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const services = CDBVS.services;
  const sheetState = services.sheetState;
  const sheetViewState = sheetState.view;
  const sheetSelection = sheetState.selection;
  const listState = sheetState.lists;
  const model = services.document.operations;
  const applyColumnEditModel = model.columns.applyEdit;
  const deleteColumnModel = model.columns.deleteAt;
  const moveColumnModel = model.columns.move;
  const isNestedType = model.nested.isType;
  const commitMutation = services.application.commitMutation;

  function applyColumnEdit(sheet, column, columnIndex, options) {
    if (!sheet || !column) return { ok: false, message: "Column is unavailable." };
    const oldName = column.name;
    const oldNested = isNestedType(CDBVS.typeOf(column));
    const result = applyColumnEditModel(sheet, column, columnIndex, options);
    if (!result.ok) return result;

    if (oldName !== column.name) {
      sheetViewState.renameColumn(sheet.name, oldName, column.name);
      listState.clear();
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
      sheetViewState.removeColumn(sheet.name, column.name);
      sheetSelection.adjustAfterColumnRemoval(sheet.name, index, sheet.columns.length);
      if (nested) sheetState.lifecycle.removeSheet(`${sheet.name}@${column.name}`);
    }
    return result;
  }

  function moveColumn(sheet, index, delta) {
    if (!sheet || !Number.isInteger(index) || !Number.isInteger(delta)) return false;
    return commitMutation(() => {
      const result = moveColumnModel(sheet, index, delta);
      if (result) sheetSelection.swapColumns(sheet.name, index, index + delta);
      return result;
    }) === true;
  }

  const columnActions = services.application.registerActionGroup(services.application.columnActions, {
    applyColumnEdit, deleteColumn, moveColumn
  });
  Object.assign(CDBVS, { applyColumnEdit, deleteColumn, moveColumn });
})(window);
