// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const services = CDBVS.services;
  const model = services.document.operations;
  const commitMutation = services.application.commitMutation;
  const commitCellMutation = services.application.commitCellMutation;
  const selectedRowIndex = CDBVS.selectedRowIndex;
  const selectedRowIndices = CDBVS.selectedRowIndices;
  const selectedCell = CDBVS.selectedCell;
  const selectRow = CDBVS.selectRow;
  const selectRows = CDBVS.selectRows;
  const insertRowAt = model.rows.insert;
  const deleteRowAt = model.rows.delete;
  const clearCellValue = model.values.clearCell;
  const setCellValue = model.values.setCell;
  const clipboardState = services.clipboard;

  function cloneRow(row) {
    return CDBVS.cloneValue(row);
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
    return CDBVS.cloneValue(value);
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
    clipboardState.setCell(cell);
    writeCellClipboard(cell);
    if (!cut) return true;
    commitCellMutation(() => clearCellValue(row, selection.column), () => {
      refreshCellValue(sheet, selection);
    });
    return true;
  }

  function copySelectedRow(sheet, cut, rowOnly = false) {
    if (!sheet) return false;
    if (!rowOnly && selectedCell(sheet)) return copySelectedCell(sheet, cut);
    const selected = selectedRowIndices(sheet);
    if (!selected.length) return false;
    const rows = selected.map((index) => sheet.lines[index]).filter(Boolean).map(cloneRow);
    if (!rows.length) return false;
    clipboardState.setRow({ sheetName: sheet.name, rows });
    writeRowClipboard(rows);
    if (!cut) return true;
    commitMutation(() => {
      selected.slice().sort((left, right) => right - left).forEach((index) => deleteRowAt(sheet, index));
      const remaining = Array.isArray(sheet.lines) ? sheet.lines.length : 0;
      selectRow(sheet, remaining ? Math.min(selected[0], remaining - 1) : null);
    });
    return true;
  }

  function deleteSelectedCell(sheet) {
    const selection = selectedCell(sheet);
    if (!selection || !sheet.lines[selection.rowIndex]) return false;
    commitCellMutation(() => clearCellValue(sheet.lines[selection.rowIndex], selection.column), () => {
      refreshCellValue(sheet, selection);
    });
    return true;
  }

  function insertPastedRows(sheet, rows) {
    if (!sheet || !Array.isArray(rows) || !rows.length || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) return false;
    const selected = selectedRowIndex(sheet);
    const index = selected === null ? (Array.isArray(sheet.lines) ? sheet.lines.length : 0) : selected + 1;
    commitMutation(() => {
      rows.forEach((row, offset) => insertRowAt(sheet, index + offset, cloneRow(row)));
      selectRows(sheet, rows.map((_, offset) => index + offset), index + rows.length - 1);
    });
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

  function refreshCellValue(sheet, selection) {
    const rowIndex = selection && selection.rowIndex;
    const columnIndex = selection && selection.columnIndex;
    const currentSheet = CDBVS.services && CDBVS.services.sheetView
      && typeof CDBVS.services.sheetView.currentSheet === "function"
      ? CDBVS.services.sheetView.currentSheet()
      : sheet;
    if (currentSheet !== sheet) return false;
    const cell = typeof CDBVS.findRenderedCell === "function"
      ? CDBVS.findRenderedCell(rowIndex, columnIndex)
      : null;
    const column = sheet && Array.isArray(sheet.columns) ? sheet.columns[columnIndex] : null;
    const row = sheet && Array.isArray(sheet.lines) ? sheet.lines[rowIndex] : null;
    if (!cell || !column || !row || typeof CDBVS.refreshCell !== "function") return false;
    CDBVS.refreshCell(cell, () => {
      CDBVS.makeCellEditor(cell, row, column, {
        sheet,
        rowIndex,
        path: `${sheet.name}/${rowIndex}`,
        lazy: true
      });
    });
    if (typeof CDBVS.refreshRenderedCell === "function") {
      CDBVS.refreshRenderedCell(sheet, rowIndex, columnIndex);
    }
    return true;
  }

  function pasteCellData(sheet, cell, targetSelection) {
    const selection = targetSelection || selectedCell(sheet);
    if (!selection || !cell || typeof cell !== "object") return false;
    const row = sheet.lines[selection.rowIndex];
    if (!row) return false;
    commitCellMutation(() => {
      if (cell.hasValue) setCellValue(row, selection.column, cloneValue(cell.value));
      else clearCellValue(row, selection.column);
    }, () => {
      refreshCellValue(sheet, selection);
    });
    return true;
  }

  function pasteSelectedCell(sheet) {
    const targetSelection = selectedCell(sheet);
    if (!sheet || !targetSelection) return false;
    const clipboard = clipboardState.getCell();
    if (clipboard) return pasteCellData(sheet, clipboard, targetSelection);
    if (typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.readText !== "function") return false;
    try {
      navigator.clipboard.readText().then((text) => {
        const cell = parseCellClipboard(text);
        if (!cell) {
          CDBVS.setStatus("Clipboard does not contain a CDBVS cell.", true);
          return;
        }
        clipboardState.setCell(cell);
        pasteCellData(sheet, cell, targetSelection);
      }).catch(() => CDBVS.setStatus("Unable to read the clipboard.", true));
      return true;
    } catch (_) {
      return false;
    }
  }

  function pasteSelectedRow(sheet, rowOnly = false) {
    if (!sheet) return false;
    if (!rowOnly && selectedCell(sheet)) return pasteSelectedCell(sheet);
    const clipboard = clipboardState.getRow();
    if (clipboard && (clipboard.rows || clipboard.row)) return insertPastedRows(sheet, clipboard.rows || [clipboard.row]);
    if (typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.readText !== "function") return false;
    try {
      navigator.clipboard.readText().then((text) => {
        const row = parseRowClipboard(text);
        if (!row) {
          CDBVS.setStatus("Clipboard does not contain a CDBVS row.", true);
          return;
        }
        clipboardState.setRow({ sheetName: sheet.name, rows: row });
        insertPastedRows(sheet, row);
      }).catch(() => CDBVS.setStatus("Unable to read the clipboard.", true));
      return true;
    } catch (_) {
      return false;
    }
  }

  const clipboardActions = services.application.registerActionGroup(services.application.clipboardActions, {
    deleteSelectedCell, copySelectedRow, pasteSelectedRow
  });
  Object.assign(CDBVS, { deleteSelectedCell, copySelectedRow, pasteSelectedRow });
})(window);
