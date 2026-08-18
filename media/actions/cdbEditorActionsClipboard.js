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
  const insertRowAt = CDBVS.insertRow;
  const deleteRowAt = CDBVS.deleteRowAt;

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

  function clearCellValue(row, column) {
    row[column.name] = null;
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
    clearCellValue(row, selection.column);
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
    clearCellValue(sheet.lines[selection.rowIndex], selection.column);
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
    else clearCellValue(row, selection.column);
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

  Object.assign(CDBVS, { deleteSelectedCell, copySelectedRow, pasteSelectedRow });
})(window);
