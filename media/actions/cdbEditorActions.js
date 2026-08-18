(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const sendUpdate = () => CDBVS.sendUpdate();
  const setStatus = (message, error) => CDBVS.setStatus(message, error);
  const selectedRowIndex = CDBVS.selectedRowIndex;
  const selectedRowIndices = CDBVS.selectedRowIndices;
  const selectedCell = CDBVS.selectedCell;
  const selectRow = CDBVS.selectRow;
  const selectCell = CDBVS.selectCell;
  const insertRowAt = CDBVS.insertRow;
  const deleteRowAt = CDBVS.deleteRowAt;
  const moveRowAt = CDBVS.moveRow;
  const rowsForView = CDBVS.rowsForView;
  const visibleSheets = CDBVS.visibleSheets;
  const currentSheet = CDBVS.currentSheet;
  const sheetBlock = CDBVS.sheetBlock;
  const removeViewSheet = CDBVS.removeViewSheet;
  const mapTypeStrings = CDBVS.mapTypeStrings;

  function addSheet() {
    if (typeof CDBVS.openNewSheetEditor === "function") {
      CDBVS.openNewSheetEditor();
      return;
    }
    setStatus("The new sheet editor is unavailable.", true);
  }

  function addColumn(sheet) {
    if (!sheet) {
      setStatus("Create or select a sheet before adding a column.", true);
      return false;
    }
    if (!Array.isArray(sheet.columns)) sheet.columns = [];
    if (typeof CDBVS.openNewColumnEditor === "function") {
      CDBVS.openNewColumnEditor(sheet, sheet.columns.length);
      return true;
    }
    setStatus("The new column editor is unavailable.", true);
    return false;
  }

  function deleteColumn(sheet, index) {
    if (!sheet || !Array.isArray(sheet.columns)) return false;
    const column = sheet.columns[index];
    if (!column) return false;
    sheet.columns.splice(index, 1);
    (sheet.lines || []).forEach((line) => { if (line) delete line[column.name]; });
    if (sheet.props && sheet.props.displayColumn === column.name) delete sheet.props.displayColumn;
    if (sheet.props && sheet.props.displayIcon === column.name) delete sheet.props.displayIcon;
    CDBVS.removeViewColumn(sheet.name, column.name);
    const selection = state.selectedCells && state.selectedCells[sheet.name];
    if (selection) {
      if (selection.columnIndex > index) selection.columnIndex -= 1;
      if (selection.columnIndex >= sheet.columns.length) delete state.selectedCells[sheet.name];
    }
    const active = state.activeCells && state.activeCells[sheet.name];
    if (active) {
      if (active.columnIndex > index) active.columnIndex -= 1;
      if (active.columnIndex >= sheet.columns.length) delete state.activeCells[sheet.name];
    }
    sendUpdate();
    if (typeof CDBVS.render === "function") CDBVS.render();
    return true;
  }

  function deleteSheet(sheet) {
    if (!sheet || !state.data || !Array.isArray(state.data.sheets)) return false;
    const oldName = sheet.name;
    const sheetsBefore = visibleSheets();
    const currentBefore = currentSheet();
    const deletedSheets = new Set(sheetBlock(sheet));
    if (!deletedSheets.size) deletedSheets.add(sheet);
    const deletedIndex = sheetsBefore.indexOf(sheet);

    mapTypeStrings((raw) => {
      const separator = raw.indexOf(":");
      if (separator < 0) return raw;
      const code = raw.slice(0, separator);
      const target = raw.slice(separator + 1);
      return (code === "6" || code === "12") && (target === oldName || target.startsWith(`${oldName}@`)) ? "1" : raw;
    });
    state.data.sheets = state.data.sheets.filter((item) => !deletedSheets.has(item));
    removeViewSheet(oldName);
    ["selectedRows", "activeRows", "rowSelectionAnchors", "selectedCells", "activeCells", "selectedListRows", "listSelectionAnchors"].forEach((key) => {
      Object.keys(state[key] || {}).forEach((name) => {
        if (name === oldName || name.startsWith(`${oldName}@`)) delete state[key][name];
      });
    });
    state.expandedLists.clear();

    const sheetsAfter = visibleSheets();
    if (currentBefore && !deletedSheets.has(currentBefore)) {
      state.sheetIndex = Math.max(0, sheetsAfter.indexOf(currentBefore));
    } else {
      state.sheetIndex = Math.max(0, Math.min(deletedIndex < 0 ? 0 : deletedIndex, sheetsAfter.length - 1));
    }
    sendUpdate();
    if (typeof CDBVS.render === "function") CDBVS.render();
    return true;
  }

  function addRow(sheet) {
    if (!sheet) return;
    if (!Array.isArray(sheet.lines)) sheet.lines = [];
    sheet.lines.push(CDBVS.createRowForSchema(sheet, sheet.lines));
    sendUpdate();
    if (typeof CDBVS.render === "function") CDBVS.render();
  }

  function deleteRow(sheet, index) {
    if (!sheet) return false;
    if (typeof CDBVS.openConfirmDialog !== "function") {
      setStatus("The confirmation dialog is unavailable.", true);
      return false;
    }
    CDBVS.openConfirmDialog({
      title: `Delete row ${index + 1}?`,
      message: "This row will be removed from the sheet.",
      confirmLabel: "Delete row",
      onConfirm: () => {
        CDBVS.deleteRowAt(sheet, index);
        sendUpdate();
        if (typeof CDBVS.render === "function") CDBVS.render();
      }
    });
    return true;
  }

  function insertSelectedRow(sheet) {
    if (!sheet) {
      setStatus("Create or select a sheet before inserting a row.", true);
      return false;
    }
    const selected = selectedRowIndex(sheet);
    const index = selected === null ? (Array.isArray(sheet.lines) ? sheet.lines.length : 0) : selected + 1;
    insertRowAt(sheet, index);
    selectRow(sheet, index);
    if (typeof CDBVS.render === "function") CDBVS.render();
    return true;
  }

  function deleteSelectedRow(sheet) {
    if (!sheet) {
      setStatus("Create or select a sheet before deleting a row.", true);
      return false;
    }
    const selected = selectedRowIndices(sheet);
    if (!selected.length) {
      setStatus("Select a row before deleting it.", true);
      return false;
    }
    selected.slice().sort((left, right) => right - left).forEach((index) => deleteRowAt(sheet, index));
    const remaining = Array.isArray(sheet.lines) ? sheet.lines.length : 0;
    selectRow(sheet, remaining ? Math.min(selected[0], remaining - 1) : null);
    sendUpdate();
    if (typeof CDBVS.render === "function") CDBVS.render();
    return true;
  }

  function moveSelectedRow(sheet, delta) {
    if (!sheet) return;
    const selected = selectedRowIndex(sheet);
    if (selected === null) return;
    const target = selected + delta;
    if (target < 0 || target >= (sheet.lines || []).length) return;
    const cell = selectedCell(sheet);
    moveRowAt(sheet, selected, delta);
    if (cell) selectCell(sheet, target, cell.columnIndex);
    else selectRow(sheet, target);
    if (typeof CDBVS.render === "function") CDBVS.render();
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
    if (typeof CDBVS.exitRenderedCell === "function") CDBVS.exitRenderedCell(sheet);
    selectCell(sheet, rowIndex, columnIndex);
    const next = CDBVS.selectedCell(sheet);
    if (typeof CDBVS.updateRenderedSelection === "function") CDBVS.updateRenderedSelection(sheet, previous, next);
    else if (typeof CDBVS.render === "function") CDBVS.render();
    return true;
  }

  Object.assign(CDBVS, { addSheet, addColumn, deleteColumn, deleteSheet, addRow, deleteRow, insertSelectedRow, deleteSelectedRow, moveSelectedRow, moveSelectedCell });
})(window);
