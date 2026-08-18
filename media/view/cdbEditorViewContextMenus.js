(function (global) {
  const CDBVS = global.CDBVS;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const selectedRowIndex = (...args) => CDBVS.selectedRowIndex(...args);
  const selectedRowIndices = (...args) => CDBVS.selectedRowIndices(...args);
  const separatorIndex = (...args) => CDBVS.separatorIndex(...args);
  const addSeparator = (...args) => CDBVS.addSeparator(...args);
  const removeSeparator = (...args) => CDBVS.removeSeparator(...args);
  const addSheet = (...args) => CDBVS.addSheet(...args);
  const insertSelectedRow = (...args) => CDBVS.insertSelectedRow(...args);
  const deleteSelectedRow = (...args) => CDBVS.deleteSelectedRow(...args);
  const moveSelectedRow = (...args) => CDBVS.moveSelectedRow(...args);
  const copySelectedRow = (...args) => CDBVS.copySelectedRow(...args);
  const pasteSelectedRow = (...args) => CDBVS.pasteSelectedRow(...args);
  const openRowEditor = (...args) => CDBVS.openRowEditor(...args);
  const openNewColumnEditor = (...args) => CDBVS.openNewColumnEditor(...args);
  const moveColumn = (...args) => CDBVS.moveColumn(...args);
  const deleteColumn = (...args) => CDBVS.deleteColumn(...args);
  const openSheetEditor = (...args) => CDBVS.openSheetEditor(...args);
  const openDeleteSheetConfirmation = (...args) => CDBVS.openDeleteSheetConfirmation(...args);

  let contextMenu = null;
  let contextMenuCleanup = null;

  function closeContextMenu() {
    if (contextMenuCleanup) contextMenuCleanup();
    contextMenuCleanup = null;
    if (contextMenu) contextMenu.remove();
    contextMenu = null;
  }

  function hasContextMenu() {
    return !!contextMenu;
  }

  function showContextMenu(event, items) {
    closeContextMenu();
    const menu = makeElement("div", null, "context-menu");
    menu.setAttribute("role", "menu");
    items.forEach((item) => {
      if (item.separator) {
        menu.appendChild(makeElement("div", null, "context-menu-separator"));
        return;
      }
      const button = makeButton(item.label, () => {
        closeContextMenu();
        item.action();
      }, "context-menu-item");
      button.setAttribute("role", "menuitem");
      button.disabled = item.disabled === true;
      menu.appendChild(button);
    });
    document.body.appendChild(menu);
    contextMenu = menu;
    const margin = 5;
    const left = Math.min(event.clientX, Math.max(margin, window.innerWidth - menu.offsetWidth - margin));
    const top = Math.min(event.clientY, Math.max(margin, window.innerHeight - menu.offsetHeight - margin));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    const closeIfOutside = (pointerEvent) => {
      if (!menu.contains(pointerEvent.target)) closeContextMenu();
    };
    contextMenuCleanup = () => document.removeEventListener("pointerdown", closeIfOutside);
    setTimeout(() => document.addEventListener("pointerdown", closeIfOutside), 0);
  }

  function showRowContextMenu(event, sheet, rowIndex) {
    const selected = selectedRowIndices(sheet);
    const active = selectedRowIndex(sheet);
    const selectionLabel = selected.length > 1 ? `${selected.length} rows` : "row";
    const rowCount = Array.isArray(sheet.lines) ? sheet.lines.length : 0;
    const hasSeparator = (sheet.separators || []).some((separator) => separatorIndex(separator) === rowIndex);
    showContextMenu(event, [
      { label: "Edit", action: () => openRowEditor(sheet, rowIndex) },
      { separator: true },
      { label: "Add Separator", action: () => addSeparator(sheet, rowIndex), disabled: hasSeparator },
      { separator: true },
      { label: "Insert row below", action: () => insertSelectedRow(sheet) },
      { label: `Delete ${selectionLabel}`, action: () => deleteSelectedRow(sheet) },
      { separator: true },
      { label: "Move row up", action: () => moveSelectedRow(sheet, -1), disabled: selected.length !== 1 || active === null || active <= 0 },
      { label: "Move row down", action: () => moveSelectedRow(sheet, 1), disabled: selected.length !== 1 || active === null || active >= rowCount - 1 },
      { separator: true },
      { label: `Copy ${selectionLabel}`, action: () => copySelectedRow(sheet, false, true) },
      { label: `Cut ${selectionLabel}`, action: () => copySelectedRow(sheet, true, true) },
      { label: "Paste row below", action: () => pasteSelectedRow(sheet, true) }
    ]);
  }

  function showCellContextMenu(event, sheet) {
    showContextMenu(event, [
      { label: "Copy cell", action: () => copySelectedRow(sheet, false) },
      { label: "Cut cell", action: () => copySelectedRow(sheet, true) },
      { label: "Paste cell", action: () => pasteSelectedRow(sheet) },
      { separator: true },
      { label: "Clear cell", action: () => CDBVS.deleteSelectedCell(sheet) }
    ]);
  }

  function showColumnContextMenu(event, sheet, columnIndex) {
    const columnCount = Array.isArray(sheet.columns) ? sheet.columns.length : 0;
    showContextMenu(event, [
      { label: "Add column", action: () => openNewColumnEditor(sheet, columnIndex + 1) },
      { separator: true },
      { label: "Move column left", action: () => moveColumn(sheet, columnIndex, -1), disabled: columnIndex <= 0 },
      { label: "Move column right", action: () => moveColumn(sheet, columnIndex, 1), disabled: columnIndex >= columnCount - 1 },
      { separator: true },
      { label: "Delete column", action: () => deleteColumn(sheet, columnIndex) }
    ]);
  }

  function showSeparatorContextMenu(event, sheet, index) {
    showContextMenu(event, [{ label: "Remove Separator", action: () => removeSeparator(sheet, index) }]);
  }

  function showSheetContextMenu(event, sheet) {
    event.preventDefault();
    showContextMenu(event, [
      { label: "New sheet", action: addSheet },
      { separator: true },
      { label: "Edit sheet", action: () => openSheetEditor(sheet) },
      { separator: true },
      { label: "Delete sheet", action: () => openDeleteSheetConfirmation(sheet) }
    ]);
  }

  function showSheetsBarContextMenu(event) {
    event.preventDefault();
    showContextMenu(event, [{ label: "New sheet", action: addSheet }]);
  }

  function commitEditorTarget(editorTarget) {
    if (!editorTarget || typeof editorTarget.dispatchEvent !== "function") return;
    if (typeof editorTarget._cdbvsCommit === "function") {
      editorTarget._cdbvsCommit();
      return;
    }
    editorTarget.dispatchEvent(new Event("change", { bubbles: false }));
  }

  Object.assign(CDBVS, {
    hasContextMenu, closeContextMenu, showContextMenu, showRowContextMenu, showCellContextMenu,
    showColumnContextMenu, showSeparatorContextMenu, showSheetContextMenu,
    showSheetsBarContextMenu, commitEditorTarget
  });
})(window);
