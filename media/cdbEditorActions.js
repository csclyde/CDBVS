(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const sendUpdate = () => CDBVS.sendUpdate();
  const setStatus = (message, error) => CDBVS.setStatus(message, error);
  const selectedRowIndex = CDBVS.selectedRowIndex;
  const selectedCell = CDBVS.selectedCell;
  const selectRow = CDBVS.selectRow;
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

  function writeRowClipboard(row) {
    const text = `CDBVS_ROW\n${JSON.stringify(row)}`;
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

  function copySelectedRow(sheet, cut) {
    if (!sheet) return false;
    if (selectedCell(sheet)) return copySelectedCell(sheet, cut);
    const selected = selectedRowIndex(sheet);
    if (selected === null || !sheet.lines[selected]) return false;
    const row = cloneRow(sheet.lines[selected]);
    state.rowClipboard = { sheetName: sheet.name, row };
    state.cellClipboard = null;
    writeRowClipboard(row);
    if (!cut) return true;
    deleteRowAt(sheet, selected);
    const remaining = Array.isArray(sheet.lines) ? sheet.lines.length : 0;
    selectRow(sheet, remaining ? Math.min(selected, remaining - 1) : null);
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

  function insertPastedRow(sheet, row) {
    if (!sheet || !row || typeof row !== "object" || Array.isArray(row)) return false;
    const selected = selectedRowIndex(sheet);
    const index = selected === null ? (Array.isArray(sheet.lines) ? sheet.lines.length : 0) : selected + 1;
    insertRowAt(sheet, index, cloneRow(row));
    selectRow(sheet, index);
    if (typeof CDBVS.render === "function") CDBVS.render();
    return true;
  }

  function parseRowClipboard(text) {
    if (typeof text !== "string" || !text.startsWith("CDBVS_ROW\n")) return null;
    try {
      const row = JSON.parse(text.slice("CDBVS_ROW\n".length));
      return row && typeof row === "object" && !Array.isArray(row) ? row : null;
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

  function pasteSelectedRow(sheet) {
    if (!sheet) return false;
    if (selectedCell(sheet)) return pasteSelectedCell(sheet);
    if (state.rowClipboard && state.rowClipboard.row) return insertPastedRow(sheet, state.rowClipboard.row);
    if (typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.readText !== "function") return false;
    try {
      navigator.clipboard.readText().then((text) => {
        const row = parseRowClipboard(text);
        if (!row) {
          setStatus("Clipboard does not contain a CDBVS row.", true);
          return;
        }
        state.rowClipboard = { sheetName: sheet.name, row };
        state.cellClipboard = null;
        insertPastedRow(sheet, row);
      }).catch(() => setStatus("Unable to read the clipboard.", true));
      return true;
    } catch (_) {
      return false;
    }
  }

  function addSheet() {
    const name = window.prompt("New sheet name:", "newSheet");
    if (!name) return;
    if (!state.data || typeof state.data !== "object" || Array.isArray(state.data)) state.data = { customTypes: [], sheets: [] };
    if (!Array.isArray(state.data.sheets)) state.data.sheets = [];
    if (state.data.sheets.some((sheet) => sheet.name === name)) {
      setStatus(`Sheet '${name}' already exists.`, true);
      return;
    }
    state.data.sheets.push({ name, columns: [], lines: [], separators: [], props: {} });
    state.sheetIndex = CDBVS.visibleSheets().length - 1;
    sendUpdate();
    if (typeof CDBVS.render === "function") CDBVS.render();
  }

  function addColumn(sheet) {
    if (!sheet) return;
    const name = window.prompt("Column name:", "newColumn");
    if (!name) return;
    const type = window.prompt("CastleDB type string (0=id, 1=text, 2=bool, 3=int, 4=float, 5:a,b=enum, 6:sheet=ref, 8=list, 17=properties):", "1");
    if (type === null || type === "") return;
    if (!Array.isArray(sheet.columns)) sheet.columns = [];
    if (sheet.columns.some((column) => column.name === name)) {
      setStatus(`Column '${name}' already exists.`, true);
      return;
    }
    sheet.columns.push({ name, typeStr: type, opt: true });
    sendUpdate();
    if (typeof CDBVS.render === "function") CDBVS.render();
  }

  function deleteColumn(sheet, index) {
    const column = sheet.columns[index];
    if (!column) return false;
    sheet.columns.splice(index, 1);
    (sheet.lines || []).forEach((line) => { if (line) delete line[column.name]; });
    if (sheet.props && sheet.props.displayColumn === column.name) delete sheet.props.displayColumn;
    if (sheet.props && sheet.props.displayIcon === column.name) delete sheet.props.displayIcon;
    CDBVS.removeViewColumn(sheet.name, column.name);
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
    ["selectedRows", "selectedCells", "selectedListRows"].forEach((key) => {
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
    if (!sheet || !window.confirm(`Delete row ${index + 1}?`)) return;
    CDBVS.deleteRowAt(sheet, index);
    sendUpdate();
    if (typeof CDBVS.render === "function") CDBVS.render();
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
    const selected = selectedRowIndex(sheet);
    if (selected === null) {
      setStatus("Select a row before deleting it.", true);
      return false;
    }
    deleteRowAt(sheet, selected);
    const remaining = Array.isArray(sheet.lines) ? sheet.lines.length : 0;
    selectRow(sheet, remaining ? Math.min(selected, remaining - 1) : null);
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
