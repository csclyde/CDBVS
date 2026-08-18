(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const rowsForView = (...args) => CDBVS.rowsForView(...args);
  const selectedRowIndex = (...args) => CDBVS.selectedRowIndex(...args);
  const selectedCell = (...args) => CDBVS.selectedCell(...args);
  const activeCell = (...args) => CDBVS.activeCell(...args);
  const selectCell = (...args) => CDBVS.selectCell(...args);
  const deactivateCell = (...args) => CDBVS.deactivateCell(...args);
  const currentSheet = (...args) => CDBVS.currentSheet(...args);
  const insertSelectedRow = (...args) => CDBVS.insertSelectedRow(...args);
  const deleteSelectedRow = (...args) => CDBVS.deleteSelectedRow(...args);
  const deleteSelectedCell = (...args) => CDBVS.deleteSelectedCell(...args);
  const moveSelectedRow = (...args) => CDBVS.moveSelectedRow(...args);
  const moveSelectedCell = (...args) => CDBVS.moveSelectedCell(...args);
  const copySelectedRow = (...args) => CDBVS.copySelectedRow(...args);
  const pasteSelectedRow = (...args) => CDBVS.pasteSelectedRow(...args);
  const updateRenderedSelection = (...args) => CDBVS.updateRenderedSelection(...args);
  const activateRenderedCell = (...args) => CDBVS.activateRenderedCell(...args);
  const exitRenderedCell = (...args) => CDBVS.exitRenderedCell(...args);
  const closeContextMenu = (...args) => CDBVS.closeContextMenu(...args);
  const commitEditorTarget = (...args) => CDBVS.commitEditorTarget(...args);

  let installed = false;

  function handleKeydown(event) {
    if (event.__cdbvsKeyboardHandled) return;
    event.__cdbvsKeyboardHandled = true;
    if (document.querySelector(".text-modal-overlay")) return;
    const sheet = currentSheet();
    const key = String(event.key || "").toLowerCase();
    if (key === "escape" && typeof CDBVS.hasContextMenu === "function" && CDBVS.hasContextMenu()) {
      event.preventDefault();
      closeContextMenu();
      return;
    }
    const modified = event.ctrlKey || event.metaKey;
    const editorTarget = event.target && event.target.closest && event.target.closest("input, textarea, select, [contenteditable=\"true\"]");
    const cellSelection = selectedCell(sheet);
    const activeSelection = activeCell(sheet);
    const arrowKey = key === "arrowup" || key === "arrowdown" || key === "arrowleft" || key === "arrowright";
    const clipboardKey = key === "c" || key === "x" || key === "v";
    const deleteKey = key === "delete" || key === "del";
    if (modified && key === "s") {
      event.preventDefault();
      if (editorTarget) commitEditorTarget(editorTarget);
      else if (typeof CDBVS.flushUpdate === "function") CDBVS.flushUpdate();
      if (typeof CDBVS.requestSave === "function") CDBVS.requestSave();
      return;
    }
    const editorCell = editorTarget && editorTarget.closest && editorTarget.closest("td");
    const cellEditorTarget = editorCell && editorCell.closest && editorCell.closest("td") ? editorTarget : null;
    if (!modified && !event.altKey && arrowKey && (!editorTarget || cellEditorTarget || cellSelection)) {
      if (!cellSelection) {
        const rows = sheet ? rowsForView(sheet) : [];
        const columns = sheet && Array.isArray(sheet.columns) ? sheet.columns : [];
        if (!rows.length || !columns.length) return;
        const rowIndex = key === "arrowup" ? rows[rows.length - 1].rowIndex : rows[0].rowIndex;
        const columnIndex = key === "arrowleft" ? columns.length - 1 : 0;
        event.preventDefault();
        selectCell(sheet, rowIndex, columnIndex);
        updateRenderedSelection(sheet, null, selectedCell(sheet));
        return;
      }
      event.preventDefault();
      commitEditorTarget(editorTarget);
      moveSelectedCell(sheet, key === "arrowup" ? -1 : (key === "arrowdown" ? 1 : 0), key === "arrowleft" ? -1 : (key === "arrowright" ? 1 : 0));
      return;
    }
    if (!modified && !event.altKey && cellSelection && key === "enter") {
      event.preventDefault();
      if (activeSelection) {
        exitRenderedCell(sheet);
      } else activateRenderedCell(sheet, cellSelection.rowIndex, cellSelection.columnIndex, event);
      return;
    }
    if (!modified && !event.altKey && activeSelection && key === "escape") {
      event.preventDefault();
      deactivateCell(sheet);
      return;
    }
    if (!modified && !event.altKey && activeSelection && editorTarget && deleteKey) return;
    if (editorTarget && !((!modified && (arrowKey || deleteKey) && cellSelection) || (modified && clipboardKey && cellSelection))) return;
    if (!modified) {
      if (key === "insert") {
        event.preventDefault();
        insertSelectedRow(sheet);
        return;
      }
      if (deleteKey) {
        event.preventDefault();
        if (cellSelection) {
          commitEditorTarget(editorTarget);
          deleteSelectedCell(sheet);
        } else deleteSelectedRow(sheet);
        return;
      }
    }
    if (!modified) return;
    if (key === "c" || key === "x") {
      if (selectedRowIndex(sheet) === null) return;
      event.preventDefault();
      commitEditorTarget(editorTarget);
      copySelectedRow(sheet, key === "x");
      return;
    }
    if (key === "v") {
      if (!sheet) return;
      event.preventDefault();
      commitEditorTarget(editorTarget);
      pasteSelectedRow(sheet);
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (selectedRowIndex(sheet) === null) return;
    event.preventDefault();
    moveSelectedRow(sheet, event.key === "ArrowUp" ? -1 : 1);
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
