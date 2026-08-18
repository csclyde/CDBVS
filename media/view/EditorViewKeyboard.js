(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;

  let installed = false;

  function handleKeydown(event) {
    if (event.__cdbvsKeyboardHandled) return;
    event.__cdbvsKeyboardHandled = true;
    if (document.querySelector(".text-modal-overlay")) return;
    const sheet = CDBVS.currentSheet();
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
    if (modified && key === "s") {
      event.preventDefault();
      if (editorTarget) CDBVS.commitEditorTarget(editorTarget);
      else if (typeof CDBVS.flushUpdate === "function") CDBVS.flushUpdate();
      if (typeof CDBVS.requestSave === "function") CDBVS.requestSave();
      return;
    }
    const editorCell = editorTarget && editorTarget.closest && editorTarget.closest("td");
    const cellEditorTarget = editorCell && editorCell.closest && editorCell.closest("td") ? editorTarget : null;
    // Once a cell is active, its editor owns arrow keys so text cursors, number
    // inputs, selects, and nested editors can navigate their own value without
    // moving the grid selection.
    if (activeSelection && cellEditorTarget && cellEditorTarget.tagName === "SELECT"
      && typeof CDBVS.handleSelectKeydown === "function"
      && CDBVS.handleSelectKeydown(cellEditorTarget, event)) return;
    if (activeSelection && cellEditorTarget && arrowKey) return;
    if (!modified && !event.altKey && arrowKey && (!editorTarget || cellEditorTarget || cellSelection)) {
      if (!cellSelection) {
        const rows = sheet ? CDBVS.rowsForView(sheet) : [];
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
      CDBVS.moveSelectedCell(sheet, key === "arrowup" ? -1 : (key === "arrowdown" ? 1 : 0), key === "arrowleft" ? -1 : (key === "arrowright" ? 1 : 0));
      return;
    }
    if (!modified && !event.altKey && cellSelection && key === "enter") {
      if (activeSelection) {
        event.preventDefault();
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
        CDBVS.insertSelectedRow(sheet);
        return;
      }
      if (deleteKey) {
        event.preventDefault();
        if (cellSelection) {
          CDBVS.commitEditorTarget(editorTarget);
          CDBVS.deleteSelectedCell(sheet);
        } else CDBVS.deleteSelectedRow(sheet);
        return;
      }
    }
    if (!modified) return;
    if (key === "c" || key === "x") {
      if (CDBVS.selectedRowIndex(sheet) === null) return;
      event.preventDefault();
      CDBVS.commitEditorTarget(editorTarget);
      CDBVS.copySelectedRow(sheet, key === "x");
      return;
    }
    if (key === "v") {
      if (!sheet) return;
      event.preventDefault();
      CDBVS.commitEditorTarget(editorTarget);
      CDBVS.pasteSelectedRow(sheet);
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (CDBVS.selectedRowIndex(sheet) === null) return;
    event.preventDefault();
    CDBVS.moveSelectedRow(sheet, event.key === "ArrowUp" ? -1 : 1);
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
