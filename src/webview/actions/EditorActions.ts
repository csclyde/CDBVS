// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const commitMutation = CDBVS.commitMutation;
  const renderMutation = CDBVS.renderMutation;
  const selectedRowIndex = CDBVS.selectedRowIndex;
  const selectedRowIndices = CDBVS.selectedRowIndices;
  const selectedCell = CDBVS.selectedCell;
  const selectRow = CDBVS.selectRow;
  const selectCell = CDBVS.selectCell;
  const insertRowAt = CDBVS.insertRow;
  const deleteRowAt = CDBVS.deleteRowAt;
  const moveRowAt = CDBVS.moveRow;
  const rowsForView = CDBVS.rowsForView;
  const deleteColumnAt = CDBVS.deleteColumnAt;
  const deleteSheetAt = CDBVS.deleteSheetAt;

  function addSheet() {
    if (typeof CDBVS.openNewSheetEditor === "function") {
      CDBVS.openNewSheetEditor();
      return;
    }
      CDBVS.setStatus("The new sheet editor is unavailable.", true);
  }

  function addColumn(sheet) {
    if (!sheet) {
      CDBVS.setStatus("Create or select a sheet before adding a column.", true);
      return false;
    }
    if (!Array.isArray(sheet.columns)) sheet.columns = [];
    if (typeof CDBVS.openNewColumnEditor === "function") {
      CDBVS.openNewColumnEditor(sheet, sheet.columns.length);
      return true;
    }
    CDBVS.setStatus("The new column editor is unavailable.", true);
    return false;
  }

  function deleteColumn(sheet, index) {
    return commitMutation(() => deleteColumnAt(sheet, index)) === true;
  }

  function deleteSheet(sheet) {
    return commitMutation(() => deleteSheetAt(sheet)) === true;
  }

  function addRow(sheet) {
    if (!sheet) return;
    commitMutation(() => {
      if (!Array.isArray(sheet.lines)) sheet.lines = [];
      sheet.lines.push(CDBVS.createRowForSchema(sheet, sheet.lines));
    });
  }

  function deleteRow(sheet, index) {
    if (!sheet) return false;
    if (typeof CDBVS.openConfirmDialog !== "function") {
      CDBVS.setStatus("The confirmation dialog is unavailable.", true);
      return false;
    }
    CDBVS.openConfirmDialog({
      title: `Delete row ${index + 1}?`,
      message: "This row will be removed from the sheet.",
      confirmLabel: "Delete row",
      onConfirm: () => {
        commitMutation(() => CDBVS.deleteRowAt(sheet, index));
      }
    });
    return true;
  }

  function insertSelectedRow(sheet) {
    if (!sheet) {
      CDBVS.setStatus("Create or select a sheet before inserting a row.", true);
      return false;
    }
    const selected = selectedRowIndex(sheet);
    const index = selected === null ? (Array.isArray(sheet.lines) ? sheet.lines.length : 0) : selected + 1;
    commitMutation(() => {
      insertRowAt(sheet, index, undefined, false);
      selectRow(sheet, index);
    });
    return true;
  }

  function deleteSelectedRow(sheet) {
    if (!sheet) {
      CDBVS.setStatus("Create or select a sheet before deleting a row.", true);
      return false;
    }
    const selected = selectedRowIndices(sheet);
    if (!selected.length) {
      CDBVS.setStatus("Select a row before deleting it.", true);
      return false;
    }
    commitMutation(() => {
      selected.slice().sort((left, right) => right - left).forEach((index) => deleteRowAt(sheet, index));
      const remaining = Array.isArray(sheet.lines) ? sheet.lines.length : 0;
      selectRow(sheet, remaining ? Math.min(selected[0], remaining - 1) : null);
    });
    return true;
  }

  function moveSelectedRow(sheet, delta) {
    if (!sheet) return;
    const selected = selectedRowIndex(sheet);
    if (selected === null) return;
    const target = selected + delta;
    if (target < 0 || target >= (sheet.lines || []).length) return;
    const cell = selectedCell(sheet);
    commitMutation(() => {
      moveRowAt(sheet, selected, delta, false);
      if (cell) selectCell(sheet, target, cell.columnIndex);
      else selectRow(sheet, target);
    });
  }

  function moveSelectedCell(sheet, rowDelta, columnDelta) {
    if (!sheet) return false;
    const selection = selectedCell(sheet);
    if (!selection) return false;
    let rowIndex = selection.rowIndex;
    const columnIndex = selection.columnIndex + columnDelta;
    if (rowDelta) {
      const rows = rowsForView(sheet);
      const visibleIndex = rows.findIndex((entry) => entry.rowIndex === selection.rowIndex);
      const targetVisibleIndex = visibleIndex + rowDelta;
      if (visibleIndex < 0 || targetVisibleIndex < 0 || targetVisibleIndex >= rows.length) return false;
      rowIndex = rows[targetVisibleIndex].rowIndex;
    }
    if (columnIndex < 0 || columnIndex >= (sheet.columns || []).length) return false;
    const previous = selection;
    if (typeof CDBVS.exitRenderedCell === "function") CDBVS.exitRenderedCell(sheet, false);
    selectCell(sheet, rowIndex, columnIndex);
    const next = CDBVS.selectedCell(sheet);
    if (typeof CDBVS.updateRenderedSelection === "function") CDBVS.updateRenderedSelection(sheet, previous, next);
    else renderMutation();
    return true;
  }

  Object.assign(CDBVS, { addSheet, addColumn, deleteColumn, deleteSheet, addRow, deleteRow, insertSelectedRow, deleteSelectedRow, moveSelectedRow, moveSelectedCell });
})(window);
