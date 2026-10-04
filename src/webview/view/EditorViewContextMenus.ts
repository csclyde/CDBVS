// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const services = CDBVS.services;
  const documentActions = services.application.documentActions;
  const clipboardActions = services.application.clipboardActions;
  const columnActions = services.application.columnActions;
  const sheetViewState = services.sheetState.view;
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
    const launchTarget = document.activeElement;
    const menu = makeElement("div", null, "context-menu");
    menu.setAttribute("role", "menu");
    items.forEach((item) => {
      if (item.separator) {
        menu.appendChild(makeElement("div", null, "context-menu-separator"));
        return;
      }
      const button = makeButton(item.label, () => {
        closeContextMenu();
        if (launchTarget && launchTarget.parentNode) launchTarget.focus({ preventScroll: true });
        item.action();
      }, "context-menu-item");
      button.setAttribute("role", "menuitem");
      button.disabled = item.disabled === true;
      menu.appendChild(button);
    });
    document.body.appendChild(menu);
    contextMenu = menu;
    const enabledItems = () => Array.from(menu.querySelectorAll("button")).filter((button) => !button.disabled);
    const menuKeydown = (keyEvent) => {
      if (keyEvent.isComposing || keyEvent.keyCode === 229) return;
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(keyEvent.key)) {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        const buttons = enabledItems();
        if (!buttons.length) return;
        const index = buttons.indexOf(document.activeElement);
        const next = keyEvent.key === "Home" ? 0 : keyEvent.key === "End" ? buttons.length - 1
          : (index + (keyEvent.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus();
      } else if (keyEvent.key === "Escape" || keyEvent.key === "Tab") {
        if (keyEvent.key === "Escape") { keyEvent.preventDefault(); keyEvent.stopPropagation(); }
        closeContextMenu();
        if (launchTarget && launchTarget.parentNode) launchTarget.focus({ preventScroll: true });
      }
    };
    menu.addEventListener("keydown", menuKeydown);
    const firstItem = enabledItems()[0];
    if (firstItem) firstItem.focus({ preventScroll: true });
    const margin = 5;
    const left = Math.min(event.clientX, Math.max(margin, window.innerWidth - menu.offsetWidth - margin));
    const top = Math.min(event.clientY, Math.max(margin, window.innerHeight - menu.offsetHeight - margin));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    const closeIfOutside = (pointerEvent) => {
      if (!menu.contains(pointerEvent.target)) closeContextMenu();
    };
    contextMenuCleanup = () => document.removeEventListener("pointerdown", closeIfOutside);
    setTimeout(() => {
      if (contextMenu === menu) document.addEventListener("pointerdown", closeIfOutside);
    }, 0);
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
      { label: "Add Separator", action: () => documentActions.addSeparator(sheet, rowIndex), disabled: hasSeparator },
      { separator: true },
      { label: "Insert row below", action: () => documentActions.insertSelectedRow(sheet) },
      { label: `Delete ${selectionLabel}`, action: () => documentActions.deleteSelectedRow(sheet) },
      { separator: true },
      { label: "Move row up", action: () => documentActions.moveSelectedRow(sheet, -1), disabled: selected.length !== 1 || active === null || active <= 0 },
      { label: "Move row down", action: () => documentActions.moveSelectedRow(sheet, 1), disabled: selected.length !== 1 || active === null || active >= rowCount - 1 },
      { separator: true },
      { label: `Copy ${selectionLabel}`, action: () => clipboardActions.copySelectedRow(sheet, false, true) },
      { label: `Cut ${selectionLabel}`, action: () => clipboardActions.copySelectedRow(sheet, true, true) },
      { label: "Paste row below", action: () => clipboardActions.pasteSelectedRow(sheet, true) }
    ]);
  }

  function showCellContextMenu(event, sheet) {
    const items = [
      { label: "Copy cell", action: () => clipboardActions.copySelectedRow(sheet, false) },
      { label: "Cut cell", action: () => clipboardActions.copySelectedRow(sheet, true) },
      { label: "Paste cell", action: () => clipboardActions.pasteSelectedRow(sheet) },
      { separator: true },
      { label: "Clear cell", action: () => clipboardActions.deleteSelectedCell(sheet) }
    ];
    const selection = CDBVS.selectedCell(sheet);
    if (selection && CDBVS.typeOf(selection.column).code === 1) {
      items.unshift({ label: "Edit text in dialog", action: () => {
        const cell = CDBVS.findRenderedCell(selection.rowIndex, selection.columnIndex);
        const input = cell && cell.querySelector("input");
        if (input) CDBVS.openTextEditor(sheet.lines[selection.rowIndex], selection.column, input);
      } }, { separator: true });
    }
    showContextMenu(event, items);
  }

  function showColumnContextMenu(event, sheet, columnIndex) {
    const columnCount = Array.isArray(sheet.columns) ? sheet.columns.length : 0;
    showContextMenu(event, [
      { label: "Add column", action: () => CDBVS.openNewColumnEditor(sheet, columnIndex + 1) },
      { separator: true },
      { label: "Move column left", action: () => columnActions.moveColumn(sheet, columnIndex, -1), disabled: columnIndex <= 0 },
      { label: "Move column right", action: () => columnActions.moveColumn(sheet, columnIndex, 1), disabled: columnIndex >= columnCount - 1 },
      { separator: true },
      { label: "Delete column", action: () => CDBVS.openConfirmDialog({
        title: `Delete column: ${sheet.columns[columnIndex].name}`,
        message: `Delete '${sheet.columns[columnIndex].name}' and its values in every row? Nested data in this column will also be removed.`,
        confirmLabel: "Delete column",
        onConfirm: () => services.application.commitMutation(() => columnActions.deleteColumn(sheet, columnIndex))
      }) }
    ]);
  }

  function showSeparatorContextMenu(event, sheet, index) {
    const indexes = (sheet && Array.isArray(sheet.separators) ? sheet.separators : [])
      .map((separator) => CDBVS.separatorIndex(separator))
      .filter((separatorIndex) => Number.isInteger(separatorIndex));
    const setAllCollapsed = (collapsed) => {
      sheetViewState.setAllSeparatorsCollapsed(sheet.name, indexes, collapsed);
      let refreshed = false;
      indexes.forEach((separatorIndex) => {
        if (typeof CDBVS.updateRenderedSeparatorSection === "function") {
          refreshed = CDBVS.updateRenderedSeparatorSection(sheet, separatorIndex, collapsed) || refreshed;
        }
      });
      if (!refreshed && typeof CDBVS.renderNow === "function") CDBVS.renderNow();
    };
    showContextMenu(event, [
      { label: "Collapse All", action: () => setAllCollapsed(true) },
      { label: "Expand All", action: () => setAllCollapsed(false) },
      { separator: true },
      { label: "Remove Separator", action: () => documentActions.removeSeparator(sheet, index) }
    ]);
  }

  function showSheetContextMenu(event, sheet) {
    event.preventDefault();
    const unavailable = CDBVS.viewState.isRawMode() || !CDBVS.hasDocument();
    showContextMenu(event, [
      { label: "New sheet", action: documentActions.addSheet, disabled: unavailable },
      { separator: true },
      { label: "Edit sheet", action: () => CDBVS.openSheetEditor(sheet), disabled: unavailable },
      { separator: true },
      { label: "Delete sheet", action: () => CDBVS.openDeleteSheetConfirmation(sheet), disabled: unavailable || !!CDBVS.schemaParent(sheet) }
    ]);
  }

  function showSheetsBarContextMenu(event) {
    event.preventDefault();
    showContextMenu(event, [{ label: "New sheet", action: documentActions.addSheet, disabled: CDBVS.viewState.isRawMode() || !CDBVS.hasDocument() }]);
  }

  Object.assign(CDBVS, {
    hasContextMenu, closeContextMenu, showContextMenu, showRowContextMenu, showCellContextMenu,
    showColumnContextMenu, showSeparatorContextMenu, showSheetContextMenu,
    showSheetsBarContextMenu
  });
})(window);
