(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const sendUpdate = () => CDBVS.sendUpdate();
  const setStatus = (message, error) => CDBVS.setStatus(message, error);
  const selectedRowIndex = CDBVS.selectedRowIndex;
  const selectedRowIndices = CDBVS.selectedRowIndices;
  const selectedCell = CDBVS.selectedCell;
  const selectRow = CDBVS.selectRow;
  const selectRows = CDBVS.selectRows;
  const selectCell = CDBVS.selectCell;
  const insertRowAt = CDBVS.insertRow;
  const deleteRowAt = CDBVS.deleteRowAt;
  const moveRowAt = CDBVS.moveRow;
  const rowsForView = CDBVS.rowsForView;
  const defaultValue = CDBVS.defaultValue;
  const visibleSheets = CDBVS.visibleSheets;
  const currentSheet = CDBVS.currentSheet;
  const sheetBlock = CDBVS.sheetBlock;
  const removeViewSheet = CDBVS.removeViewSheet;
  const mapTypeStrings = CDBVS.mapTypeStrings;

  function cloneRow(row) {
    return JSON.parse(JSON.stringify(row));
  }

  function writeRowClipboard(rows) {
    const values = Array.isArray(rows) ? rows : [rows];
    const text = `${values.length > 1 ? "CDBVS_ROWS" : "CDBVS_ROW"}\n${JSON.stringify(values.length > 1 ? values : values[0])}`;
    if (typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.writeText !== "function") return;
    try { navigator.clipboard.writeText(text).catch(() => {}); } catch (_) {}
  }

  function writeCellClipboard(cell) {
    const text = `CDBVS_CELL\n${JSON.stringify(cell)}`;
    if (typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.writeText !== "function") return;
    try { navigator.clipboard.writeText(text).catch(() => {}); } catch (_) {}
  }

  function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function clearCellValue(row, column, sheet) {
    if (column.opt) delete row[column.name];
    else row[column.name] = cloneValue(defaultValue(column, sheet));
  }

  function copySelectedCell(sheet, cut) {
    const selection = selectedCell(sheet);
    if (!selection || !sheet.lines[selection.rowIndex]) return false;
    const row = sheet.lines[selection.rowIndex];
    const hasValue = Object.prototype.hasOwnProperty.call(row, selection.column.name);
    const cell = {
      sheetName: sheet.name,
      columnName: selection.column.name,
      hasValue,
      value: hasValue ? cloneValue(row[selection.column.name]) : null
    };
    state.cellClipboard = cell;
    state.rowClipboard = null;
    writeCellClipboard(cell);
    if (!cut) return true;
    clearCellValue(row, selection.column, sheet);
    sendUpdate();
    if (typeof CDBVS.render === "function") CDBVS.render();
    return true;
  }

  function copySelectedRow(sheet, cut, rowOnly = false) {
    if (!sheet) return false;
    if (!rowOnly && selectedCell(sheet)) return copySelectedCell(sheet, cut);
    const selected = selectedRowIndices(sheet);
    if (!selected.length) return false;
    const rows = selected.map((index) => sheet.lines[index]).filter(Boolean).map(cloneRow);
    if (!rows.length) return false;
    state.rowClipboard = { sheetName: sheet.name, rows };
    state.cellClipboard = null;
    writeRowClipboard(rows);
    if (!cut) return true;
    selected.slice().sort((left, right) => right - left).forEach((index) => deleteRowAt(sheet, index));
    const remaining = Array.isArray(sheet.lines) ? sheet.lines.length : 0;
    selectRow(sheet, remaining ? Math.min(selected[0], remaining - 1) : null);
    sendUpdate();
    if (typeof CDBVS.render === "function") CDBVS.render();
    return true;
  }

  function deleteSelectedCell(sheet) {
    const selection = selectedCell(sheet);
    if (!selection || !sheet.lines[selection.rowIndex]) return false;
    clearCellValue(sheet.lines[selection.rowIndex], selection.column, sheet);
    sendUpdate();
    if (typeof CDBVS.render === "function") CDBVS.render();
    return true;
  }

  function insertPastedRows(sheet, rows) {
    if (!sheet || !Array.isArray(rows) || !rows.length || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) return false;
    const selected = selectedRowIndex(sheet);
    const index = selected === null ? (Array.isArray(sheet.lines) ? sheet.lines.length : 0) : selected + 1;
    rows.forEach((row, offset) => insertRowAt(sheet, index + offset, cloneRow(row), false));
    selectRows(sheet, rows.map((_, offset) => index + offset), index + rows.length - 1);
    sendUpdate();
    if (typeof CDBVS.render === "function") CDBVS.render();
    return true;
  }

  function insertPastedRow(sheet, row) {
    return insertPastedRows(sheet, [row]);
  }

  function parseRowClipboard(text) {
    if (typeof text !== "string") return null;
    try {
      if (text.startsWith("CDBVS_ROWS\n")) {
        const rows = JSON.parse(text.slice("CDBVS_ROWS\n".length));
        return Array.isArray(rows) && rows.length && rows.every((row) => row && typeof row === "object" && !Array.isArray(row)) ? rows : null;
      }
      if (!text.startsWith("CDBVS_ROW\n")) return null;
      const row = JSON.parse(text.slice("CDBVS_ROW\n".length));
      return row && typeof row === "object" && !Array.isArray(row) ? [row] : null;
    } catch (_) {
      return null;
    }
  }

  function parseCellClipboard(text) {
    if (typeof text !== "string" || !text.startsWith("CDBVS_CELL\n")) return null;
    try {
      const cell = JSON.parse(text.slice("CDBVS_CELL\n".length));
      if (!cell || typeof cell !== "object" || Array.isArray(cell) || typeof cell.hasValue !== "boolean") return null;
      return cell;
    } catch (_) {
      return null;
    }
  }

  function pasteCellData(sheet, cell) {
    const selection = selectedCell(sheet);
    if (!selection || !cell || typeof cell !== "object") return false;
    const row = sheet.lines[selection.rowIndex];
    if (!row) return false;
    if (cell.hasValue) row[selection.column.name] = cloneValue(cell.value);
    else clearCellValue(row, selection.column, sheet);
    sendUpdate();
    if (typeof CDBVS.render === "function") CDBVS.render();
    return true;
  }

  function pasteSelectedCell(sheet) {
    if (!sheet || !selectedCell(sheet)) return false;
    if (state.cellClipboard) return pasteCellData(sheet, state.cellClipboard);
    if (typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.readText !== "function") return false;
    try {
      navigator.clipboard.readText().then((text) => {
        const cell = parseCellClipboard(text);
        if (!cell) {
          setStatus("Clipboard does not contain a CDBVS cell.", true);
          return;
        }
        state.cellClipboard = cell;
        state.rowClipboard = null;
        pasteCellData(sheet, cell);
      }).catch(() => setStatus("Unable to read the clipboard.", true));
      return true;
    } catch (_) {
      return false;
    }
  }

  function pasteSelectedRow(sheet, rowOnly = false) {
    if (!sheet) return false;
    if (!rowOnly && selectedCell(sheet)) return pasteSelectedCell(sheet);
    if (state.rowClipboard && (state.rowClipboard.rows || state.rowClipboard.row)) return insertPastedRows(sheet, state.rowClipboard.rows || [state.rowClipboard.row]);
    if (typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.readText !== "function") return false;
    try {
      navigator.clipboard.readText().then((text) => {
        const row = parseRowClipboard(text);
        if (!row) {
          setStatus("Clipboard does not contain a CDBVS row.", true);
          return;
        }
        state.rowClipboard = { sheetName: sheet.name, rows: row };
        state.cellClipboard = null;
        insertPastedRows(sheet, row);
      }).catch(() => setStatus("Unable to read the clipboard.", true));
      return true;
    } catch (_) {
      return false;
    }
  }

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
    ["selectedRows", "activeRows", "rowSelectionAnchors", "selectedCells", "selectedListRows"].forEach((key) => {
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
    let columnIndex = selection.columnIndex + columnDelta;
    if (rowDelta) {
      const rows = rowsForView(sheet);
      const visibleIndex = rows.findIndex((entry) => entry.rowIndex === selection.rowIndex);
      const targetVisibleIndex = visibleIndex + rowDelta;
      if (visibleIndex < 0 || targetVisibleIndex < 0 || targetVisibleIndex >= rows.length) return false;
      rowIndex = rows[targetVisibleIndex].rowIndex;
    }
    if (columnIndex < 0 || columnIndex >= (sheet.columns || []).length) return false;
    selectCell(sheet, rowIndex, columnIndex);
    if (typeof CDBVS.render === "function") CDBVS.render();
    return true;
  }

  Object.assign(CDBVS, { addSheet, addColumn, deleteColumn, deleteSheet, addRow, deleteRow, insertSelectedRow, deleteSelectedRow, deleteSelectedCell, moveSelectedRow, moveSelectedCell, copySelectedRow, pasteSelectedRow });
})(window);
