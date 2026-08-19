// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const application = CDBVS.services.application;
  const documentActions = application.documentActions;
  const clipboardActions = application.clipboardActions;
  const sheetViewModel = CDBVS.services.sheetView;
  let installed = false;

  function moveToTabCell(sheet, selection, direction) {
    if (!sheet || !selection || typeof sheetViewModel.rowsForView !== "function"
      || typeof documentActions.moveSelectedCell !== "function") return false;
    const rows = sheetViewModel.rowsForView(sheet);
    const columns = Array.isArray(sheet.columns) ? sheet.columns : [];
    const rowPosition = rows.findIndex((entry) => entry.rowIndex === selection.rowIndex);
    if (rowPosition < 0 || !columns.length) return false;
    const currentPosition = rowPosition * columns.length + selection.columnIndex;
    const targetPosition = currentPosition + direction;
    if (targetPosition < 0 || targetPosition >= rows.length * columns.length) return false;
    const targetRowPosition = Math.floor(targetPosition / columns.length);
    const targetColumnIndex = targetPosition % columns.length;
    const rowDelta = targetRowPosition - rowPosition;
    const columnDelta = targetColumnIndex - selection.columnIndex;
    if (!documentActions.moveSelectedCell(sheet, rowDelta, columnDelta)) return false;
    const next = CDBVS.selectedCell(sheet);
    if (!next || typeof CDBVS.activateRenderedCell !== "function") return true;
    const nextCell = typeof CDBVS.findRenderedCell === "function"
      ? CDBVS.findRenderedCell(next.rowIndex, next.columnIndex)
      : null;
    // Boolean cells are selection-owned controls, so Tab should not toggle them.
    if (nextCell && typeof nextCell._cdbvsToggleBoolean === "function") return true;
    CDBVS.activateRenderedCell(sheet, next.rowIndex, next.columnIndex);
    return true;
  }

  function handleKeydown(event) {
    if (event.__cdbvsKeyboardHandled) return;
    event.__cdbvsKeyboardHandled = true;
    if (document.querySelector(".text-modal-overlay")) return;
    const sheet = sheetViewModel.currentSheet();
    const key = String(event.key || "").toLowerCase();
    if (key === "escape" && typeof CDBVS.hasContextMenu === "function" && CDBVS.hasContextMenu()) {
      event.preventDefault();
      CDBVS.closeContextMenu();
      return;
    }
    const modified = event.ctrlKey || event.metaKey;
    const editorTarget = event.target && event.target.closest && event.target.closest("input, textarea, select, [contenteditable=\"true\"]");
    const cellSelection = CDBVS.selectedCell(sheet);
    const activeSelection = CDBVS.activeCell(sheet);
    const arrowKey = key === "arrowup" || key === "arrowdown" || key === "arrowleft" || key === "arrowright";
    const clipboardKey = key === "c" || key === "x" || key === "v";
    const deleteKey = key === "delete" || key === "del";
    if (!modified && !event.altKey && key === "tab" && cellSelection) {
      const tableTarget = event.target && event.target.closest && event.target.closest("td");
      const cellSelectMenuTarget = event.target && event.target.closest && event.target.closest(".cell-select-menu");
      if (tableTarget || cellSelectMenuTarget) {
        if (moveToTabCell(sheet, cellSelection, event.shiftKey ? -1 : 1)) event.preventDefault();
        else if (activeSelection) CDBVS.exitRenderedCell(sheet, false);
        return;
      }
    }
    if (modified && key === "s") {
      event.preventDefault();
      if (editorTarget) CDBVS.commitEditorTarget(editorTarget);
      else if (typeof CDBVS.flushUpdate === "function") CDBVS.flushUpdate();
      if (typeof CDBVS.requestSave === "function") CDBVS.requestSave();
      return;
    }
    const editorCell = editorTarget && editorTarget.closest && editorTarget.closest("td");
    const cellEditorTarget = editorCell && editorCell.closest && editorCell.closest("td") ? editorTarget : null;
    const directListToggle = event.target && event.target.closest && event.target.closest(".list-toggle");
    const directToggleCell = directListToggle && directListToggle.closest
      ? directListToggle.closest(".list-cell")
      : null;
    if (!modified && !event.altKey && key === "enter" && directListToggle
      && directToggleCell && typeof directToggleCell._cdbvsToggleList === "function") {
      event.preventDefault();
      directToggleCell._cdbvsToggleList(event);
      return;
    }
    // Once a cell is active, its editor owns arrow keys so text cursors, number
    // inputs, selects, and nested editors can navigate their own value without
    // moving the grid selection.
    if (typeof CDBVS.handleSelectKeydown === "function"
      && CDBVS.handleSelectKeydown(event.target, event)) return;
    if (activeSelection && cellEditorTarget && arrowKey) return;
    if (!modified && !event.altKey && arrowKey && (!editorTarget || cellEditorTarget || cellSelection)) {
      if (!cellSelection) {
        const rows = sheet ? sheetViewModel.rowsForView(sheet) : [];
        const columns = sheet && Array.isArray(sheet.columns) ? sheet.columns : [];
        if (!rows.length || !columns.length) return;
        const rowIndex = key === "arrowup" ? rows[rows.length - 1].rowIndex : rows[0].rowIndex;
        const columnIndex = key === "arrowleft" ? columns.length - 1 : 0;
        event.preventDefault();
        CDBVS.selectCell(sheet, rowIndex, columnIndex);
        CDBVS.updateRenderedSelection(sheet, null, CDBVS.selectedCell(sheet));
        return;
      }
      event.preventDefault();
      CDBVS.commitEditorTarget(editorTarget);
      documentActions.moveSelectedCell(sheet, key === "arrowup" ? -1 : (key === "arrowdown" ? 1 : 0), key === "arrowleft" ? -1 : (key === "arrowright" ? 1 : 0));
      return;
    }
    if (!modified && !event.altKey && cellSelection && key === "enter") {
      if (activeSelection) {
        event.preventDefault();
        CDBVS.exitRenderedCell(sheet);
      } else if (editorTarget && editorTarget.tagName !== "SELECT" && editorCell && cellSelection
        && editorCell === CDBVS.findRenderedCell(cellSelection.rowIndex, cellSelection.columnIndex)) {
        event.preventDefault();
        CDBVS.activateCell(sheet, cellSelection.rowIndex, cellSelection.columnIndex);
        CDBVS.exitRenderedCell(sheet);
      } else {
        CDBVS.activateRenderedCell(sheet, cellSelection.rowIndex, cellSelection.columnIndex, event);
        event.preventDefault();
      }
      return;
    }
    if (!modified && !event.altKey && activeSelection && key === "escape") {
      event.preventDefault();
      CDBVS.exitRenderedCell(sheet);
      return;
    }
    if (!modified && !event.altKey && activeSelection && editorTarget && deleteKey) return;
    if (editorTarget && !((!modified && (arrowKey || deleteKey) && cellSelection) || (modified && clipboardKey && cellSelection))) return;
    if (!modified) {
      if (key === "insert") {
        event.preventDefault();
        documentActions.insertSelectedRow(sheet);
        return;
      }
      if (deleteKey) {
        event.preventDefault();
        if (cellSelection) {
          CDBVS.commitEditorTarget(editorTarget);
          clipboardActions.deleteSelectedCell(sheet);
        } else documentActions.deleteSelectedRow(sheet);
        return;
      }
    }
    if (!modified) return;
    if (key === "c" || key === "x") {
      if (CDBVS.selectedRowIndex(sheet) === null) return;
      event.preventDefault();
      CDBVS.commitEditorTarget(editorTarget);
      clipboardActions.copySelectedRow(sheet, key === "x");
      return;
    }
    if (key === "v") {
      if (!sheet) return;
      event.preventDefault();
      CDBVS.commitEditorTarget(editorTarget);
      clipboardActions.pasteSelectedRow(sheet);
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (CDBVS.selectedRowIndex(sheet) === null) return;
    event.preventDefault();
    documentActions.moveSelectedRow(sheet, event.key === "ArrowUp" ? -1 : 1);
  }

  function installKeyboardNavigation() {
    if (installed) return;
    installed = true;
    document.addEventListener("keydown", handleKeydown, true);
    if (typeof global.addEventListener === "function") global.addEventListener("keydown", handleKeydown, true);
  }

  CDBVS.installKeyboardNavigation = installKeyboardNavigation;
  installKeyboardNavigation();
})(window);
