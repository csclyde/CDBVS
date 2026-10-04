// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;

  function bindCellInteractions(td, options) {
    const sheet = options.sheet;
    const rowIndex = options.rowIndex;
    const columnIndex = options.columnIndex;
    const tr = options.tr;
    const getSelection = options.getSelection;
    const isActive = options.isActive;
    const select = options.select;
    const activate = options.activate;
    const exit = options.exit;
    const showContextMenu = options.showContextMenu;
    const stopPropagation = options.stopPropagation === true;
    const shouldIgnore = (target, event) => {
      const wrap = td.closest(".table-wrap");
      if (wrap && wrap.getAttribute("aria-busy") === "true") {
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        if (event && typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
        else if (event && typeof event.stopPropagation === "function") event.stopPropagation();
        return true;
      }
      return typeof options.shouldIgnore === "function" && options.shouldIgnore(target, event);
    };
    const matchesSelection = (selection) => !!selection
      && selection.rowIndex === rowIndex && selection.columnIndex === columnIndex;
    let selectionOnlyClick = false;
    td.addEventListener("mousedown", (event) => {
      selectionOnlyClick = false;
      if (shouldIgnore(event.target, event)) return;
      if (event.button !== undefined && event.button !== 0) return;
      const alreadySelected = matchesSelection(getSelection());
      const selectTarget = event.target && event.target.closest && event.target.closest("select");
      if (alreadySelected && isActive()) {
        // Native editor gestures (caret placement, text selection, number
        // spinners and flag labels) belong to the active editor. Only a click
        // on the cell surface exits editing; selects retain their menu toggle.
        const editorTarget = event.target && event.target.closest
          && event.target.closest("input, textarea, label, [contenteditable=\"true\"]");
        if (editorTarget && td.contains(editorTarget)) return;
        event.preventDefault();
        exit(event);
        selectionOnlyClick = true;
        return;
      }
      if (alreadySelected && selectTarget) {
        event.preventDefault();
        activate(event);
        selectionOnlyClick = true;
        return;
      }
      if (alreadySelected || event.target === td) return;
      event.preventDefault();
      select(event);
      selectionOnlyClick = true;
    }, true);
    td.addEventListener("mouseleave", () => { selectionOnlyClick = false; });
    td.addEventListener("pointercancel", () => { selectionOnlyClick = false; });
    td.addEventListener("click", (event) => {
      if (shouldIgnore(event.target, event)) return;
      if (selectionOnlyClick || (matchesSelection(getSelection()) && !isActive())) {
        event.__cdbvsCellClickHandled = true;
        event.preventDefault();
        if (typeof event.stopPropagation === "function") event.stopPropagation();
        if (!selectionOnlyClick) activate(event);
      }
    }, true);
    td.addEventListener("click", (event) => {
      if (shouldIgnore(event.target, event)) return;
      if (event.__cdbvsCellClickHandled) { selectionOnlyClick = false; return; }
      if (!event.target.closest || event.target.closest("tr") !== tr) return;
      if (stopPropagation && typeof event.stopPropagation === "function") event.stopPropagation();
      if (selectionOnlyClick) { selectionOnlyClick = false; return; }
      if (matchesSelection(getSelection())) {
        if (!isActive()) activate(event);
      }
      else select(event);
    });
    td.addEventListener("contextmenu", (event) => {
      if (shouldIgnore(event.target, event)) return;
      if (!event.target.closest || event.target.closest("tr") !== tr) return;
      event.preventDefault();
      if (stopPropagation && typeof event.stopPropagation === "function") event.stopPropagation();
      if (select(event) !== false) showContextMenu(event);
    });
    return td;
  }

  function renderTableCell(sheet, row, rowIndex, column, columnIndex, tr, cellErrors, selectedCellValue) {
    const td = document.createElement("td");
    if (CDBVS.typeOf(column).code === 0) td.classList.add("primary-id-column");
    td.tabIndex = -1;
    td.setAttribute("role", "gridcell");
    td.dataset.columnIndex = String(columnIndex);
    if (CDBVS.typeOf(column).code === 0) {
      td.title = "Click to select; Enter or F2 to edit. Double-click the row number to edit the row.";
    }
    const errors = cellErrors[CDBVS.cellErrorKey(rowIndex, column.name)] || [];
    if (errors.length) {
      td.classList.add("cell-error");
      td.title = errors.map((error) => error.message).join("\n");
      td.setAttribute("aria-invalid", "true");
      td.dataset.errorMessage = td.title;
    }
    const selected = selectedCellValue && selectedCellValue.rowIndex === rowIndex && selectedCellValue.columnIndex === columnIndex;
    td.setAttribute("aria-selected", String(!!selected));
    if (selected) { td.classList.add("cell-selected"); td.tabIndex = 0; }
    bindCellInteractions(td, {
      sheet,
      rowIndex,
      columnIndex,
      tr,
      getSelection: () => CDBVS.selectedCell(sheet),
      isActive: () => !!CDBVS.activeCell(sheet),
      select: () => CDBVS.selectRenderedCell(sheet, rowIndex, columnIndex, tr, td),
      activate: (event) => CDBVS.activateRenderedCell(sheet, rowIndex, columnIndex, event),
      exit: () => CDBVS.exitRenderedCell(sheet),
      shouldIgnore: (target) => !!(target && target.closest && target.closest(".list-editor")),
      showContextMenu: (event) => CDBVS.showCellContextMenu(event, sheet)
    });
    CDBVS.makeCellEditor(td, row, column, { sheet, rowIndex, path: `${sheet.name}/${rowIndex}`, lazy: true });
    return td;
  }

  CDBVS.capabilities.table.renderCell = renderTableCell;
  CDBVS.capabilities.table.bindCellInteractions = bindCellInteractions;
  CDBVS.renderTableCell = renderTableCell;
  CDBVS.bindCellInteractions = bindCellInteractions;
})(window);
