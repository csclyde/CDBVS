// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;

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
    const selected = CDBVS.selectedRowIndices(sheet);
    const active = CDBVS.selectedRowIndex(sheet);
    const selectionLabel = selected.length > 1 ? `${selected.length} rows` : "row";
    const rowCount = Array.isArray(sheet.lines) ? sheet.lines.length : 0;
    const hasSeparator = (sheet.separators || []).some((separator) => CDBVS.separatorIndex(separator) === rowIndex);
    showContextMenu(event, [
      { label: "Edit", action: () => CDBVS.openRowEditor(sheet, rowIndex) },
      { separator: true },
      { label: "Add Separator", action: () => CDBVS.addSeparator(sheet, rowIndex), disabled: hasSeparator },
      { separator: true },
      { label: "Insert row below", action: () => CDBVS.insertSelectedRow(sheet) },
      { label: `Delete ${selectionLabel}`, action: () => CDBVS.deleteSelectedRow(sheet) },
      { separator: true },
      { label: "Move row up", action: () => CDBVS.moveSelectedRow(sheet, -1), disabled: selected.length !== 1 || active === null || active <= 0 },
      { label: "Move row down", action: () => CDBVS.moveSelectedRow(sheet, 1), disabled: selected.length !== 1 || active === null || active >= rowCount - 1 },
      { separator: true },
      { label: `Copy ${selectionLabel}`, action: () => CDBVS.copySelectedRow(sheet, false, true) },
      { label: `Cut ${selectionLabel}`, action: () => CDBVS.copySelectedRow(sheet, true, true) },
      { label: "Paste row below", action: () => CDBVS.pasteSelectedRow(sheet, true) }
    ]);
  }

  function showCellContextMenu(event, sheet) {
    showContextMenu(event, [
      { label: "Copy cell", action: () => CDBVS.copySelectedRow(sheet, false) },
      { label: "Cut cell", action: () => CDBVS.copySelectedRow(sheet, true) },
      { label: "Paste cell", action: () => CDBVS.pasteSelectedRow(sheet) },
      { separator: true },
      { label: "Clear cell", action: () => CDBVS.deleteSelectedCell(sheet) }
    ]);
  }

  function showColumnContextMenu(event, sheet, columnIndex) {
    const columnCount = Array.isArray(sheet.columns) ? sheet.columns.length : 0;
    showContextMenu(event, [
      { label: "Add column", action: () => CDBVS.openNewColumnEditor(sheet, columnIndex + 1) },
      { separator: true },
      { label: "Move column left", action: () => CDBVS.moveColumn(sheet, columnIndex, -1), disabled: columnIndex <= 0 },
      { label: "Move column right", action: () => CDBVS.moveColumn(sheet, columnIndex, 1), disabled: columnIndex >= columnCount - 1 },
      { separator: true },
      { label: "Delete column", action: () => CDBVS.deleteColumn(sheet, columnIndex) }
    ]);
  }

  function showSeparatorContextMenu(event, sheet, index) {
    showContextMenu(event, [{ label: "Remove Separator", action: () => CDBVS.removeSeparator(sheet, index) }]);
  }

  function showSheetContextMenu(event, sheet) {
    event.preventDefault();
    showContextMenu(event, [
      { label: "New sheet", action: CDBVS.addSheet },
      { separator: true },
      { label: "Edit sheet", action: () => CDBVS.openSheetEditor(sheet) },
      { separator: true },
      { label: "Delete sheet", action: () => CDBVS.openDeleteSheetConfirmation(sheet) }
    ]);
  }

  function showSheetsBarContextMenu(event) {
    event.preventDefault();
    showContextMenu(event, [{ label: "New sheet", action: CDBVS.addSheet }]);
  }

  Object.assign(CDBVS, {
    hasContextMenu, closeContextMenu, showContextMenu, showRowContextMenu, showCellContextMenu,
    showColumnContextMenu, showSeparatorContextMenu, showSheetContextMenu,
    showSheetsBarContextMenu
  });
})(window);
