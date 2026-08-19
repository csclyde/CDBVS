// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;

  function selectedRowIndices(sheet) {
    if (!sheet || !state.selectedRows) return [];
    const raw = state.selectedRows[sheet.name];
    const values = Array.isArray(raw) ? raw : [raw];
    const indexes = values.filter((index) => Number.isInteger(index) && index >= 0 && index < (sheet.lines || []).length);
    return [...new Set(indexes)].sort((left, right) => left - right);
  }

  function selectedRowIndex(sheet) {
    const indexes = selectedRowIndices(sheet);
    const active = state.activeRows && state.activeRows[sheet && sheet.name];
    return indexes.length ? (Number.isInteger(active) && indexes.includes(active) ? active : indexes[indexes.length - 1]) : null;
  }

  function isRowSelected(sheet, index) {
    return selectedRowIndices(sheet).includes(index);
  }

  function selectRows(sheet, indexes, activeIndex, anchorIndex) {
    if (!sheet) return;
    if (!state.selectedRows) state.selectedRows = {};
    const valid = [...new Set((Array.isArray(indexes) ? indexes : [indexes]).filter((index) => Number.isInteger(index) && index >= 0 && index < (sheet.lines || []).length))].sort((left, right) => left - right);
    if (valid.length) {
      const active = Number.isInteger(activeIndex) && valid.includes(activeIndex) ? activeIndex : valid[valid.length - 1];
      state.selectedRows[sheet.name] = valid.filter((index) => index !== active).concat(active);
      if (!state.activeRows) state.activeRows = {};
      state.activeRows[sheet.name] = active;
      if (!state.rowSelectionAnchors) state.rowSelectionAnchors = {};
      state.rowSelectionAnchors[sheet.name] = Number.isInteger(anchorIndex) && valid.includes(anchorIndex) ? anchorIndex : active;
    } else {
      delete state.selectedRows[sheet.name];
      if (state.activeRows) delete state.activeRows[sheet.name];
      if (state.rowSelectionAnchors) delete state.rowSelectionAnchors[sheet.name];
    }
    if (state.selectedCells) delete state.selectedCells[sheet.name];
    if (state.activeCells) delete state.activeCells[sheet.name];
  }

  function selectRow(sheet, index) {
    selectRows(sheet, Number.isInteger(index) ? [index] : [], index);
  }

  function selectRowWithModifiers(sheet, index, event) {
    if (!sheet || !Number.isInteger(index)) return;
    const current = selectedRowIndices(sheet);
    const modified = event && (event.ctrlKey || event.metaKey);
    if (event && event.shiftKey) {
      const savedAnchor = state.rowSelectionAnchors && state.rowSelectionAnchors[sheet.name];
      const anchor = Number.isInteger(savedAnchor) && savedAnchor >= 0 && savedAnchor < (sheet.lines || []).length
        ? savedAnchor
        : (current.length ? current[current.length - 1] : index);
      const start = Math.min(anchor, index);
      const end = Math.max(anchor, index);
      selectRows(sheet, Array.from({ length: end - start + 1 }, (_, offset) => start + offset), index, anchor);
    } else if (modified) {
      selectRows(sheet, current.includes(index) ? current.filter((item) => item !== index) : current.concat(index), index);
    } else {
      selectRow(sheet, index);
    }
  }

  function selectedCell(sheet) {
    if (!sheet || !state.selectedCells) return null;
    const selection = state.selectedCells[sheet.name];
    if (!selection || !Number.isInteger(selection.rowIndex) || !Number.isInteger(selection.columnIndex)) return null;
    if (selection.rowIndex < 0 || selection.rowIndex >= (sheet.lines || []).length) return null;
    if (selection.columnIndex < 0 || selection.columnIndex >= (sheet.columns || []).length) return null;
    return {
      rowIndex: selection.rowIndex,
      columnIndex: selection.columnIndex,
      column: sheet.columns[selection.columnIndex]
    };
  }

  function activeCell(sheet) {
    if (!sheet || !state.activeCells) return null;
    const active = state.activeCells[sheet.name];
    const selected = selectedCell(sheet);
    if (!active || !selected || active.rowIndex !== selected.rowIndex || active.columnIndex !== selected.columnIndex) return null;
    return selected;
  }

  function selectCell(sheet, rowIndex, columnIndex) {
    if (!sheet) return;
    if (!state.selectedCells) state.selectedCells = {};
    if (!state.selectedRows) state.selectedRows = {};
    if (Number.isInteger(rowIndex) && rowIndex >= 0 && rowIndex < (sheet.lines || []).length && Number.isInteger(columnIndex) && columnIndex >= 0 && columnIndex < (sheet.columns || []).length) {
      selectRow(sheet, rowIndex);
      state.selectedCells[sheet.name] = { rowIndex, columnIndex };
    } else {
      delete state.selectedCells[sheet.name];
    }
    if (state.activeCells) delete state.activeCells[sheet.name];
  }

  function activateCell(sheet, rowIndex, columnIndex) {
    if (!sheet || !Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return false;
    const selected = selectedCell(sheet);
    if (!selected || selected.rowIndex !== rowIndex || selected.columnIndex !== columnIndex) return false;
    if (!state.activeCells) state.activeCells = {};
    state.activeCells[sheet.name] = { rowIndex, columnIndex };
    return true;
  }

  function deactivateCell(sheet) {
    if (!sheet || !state.activeCells) return;
    delete state.activeCells[sheet.name];
  }

  Object.assign(CDBVS, {
    selectedRowIndex,
    selectedRowIndices,
    isRowSelected,
    selectRows,
    selectRow,
    selectRowWithModifiers,
    selectedCell,
    activeCell,
    selectCell,
    activateCell,
    deactivateCell
  });
})(window);
