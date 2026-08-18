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
    const shouldIgnore = typeof options.shouldIgnore === "function" ? options.shouldIgnore : () => false;
    const matchesSelection = (selection) => !!selection
      && selection.rowIndex === rowIndex && selection.columnIndex === columnIndex;
    let selectionOnlyClick = false;
    td.addEventListener("mousedown", (event) => {
      if (shouldIgnore(event.target, event)) return;
      if (event.button !== undefined && event.button !== 0) return;
      const alreadySelected = matchesSelection(getSelection());
      const listToggleTarget = event.target && event.target.closest && event.target.closest(".list-toggle");
      if (listToggleTarget) {
        if (!alreadySelected) select(event);
        if (!isActive()) activate(event);
        selectionOnlyClick = false;
        return;
      }
      const selectTarget = event.target && event.target.closest && event.target.closest("select");
      if (alreadySelected && isActive()) {
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
      if (!selectionOnlyClick) return;
      event.preventDefault();
      if (typeof event.stopPropagation === "function") event.stopPropagation();
    }, true);
    td.addEventListener("click", (event) => {
      if (shouldIgnore(event.target, event)) return;
      if (!event.target.closest || event.target.closest("tr") !== tr) return;
      if (stopPropagation && typeof event.stopPropagation === "function") event.stopPropagation();
      if (selectionOnlyClick) { selectionOnlyClick = false; return; }
      if (matchesSelection(getSelection())) activate(event);
      else select(event);
    });
    td.addEventListener("contextmenu", (event) => {
      if (shouldIgnore(event.target, event)) return;
      if (!event.target.closest || event.target.closest("tr") !== tr) return;
      event.preventDefault();
      if (stopPropagation && typeof event.stopPropagation === "function") event.stopPropagation();
      select(event);
      showContextMenu(event);
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
      td.title = "Double-click to edit this row";
      td.addEventListener("dblclick", (event) => { event.preventDefault(); CDBVS.openRowEditor(sheet, rowIndex); });
    }
    const errors = cellErrors[CDBVS.cellErrorKey(rowIndex, column.name)] || [];
    if (errors.length) {
      td.classList.add("cell-error");
      td.title = errors.map((error) => error.message).join("\n");
      td.setAttribute("aria-invalid", "true");
      td.dataset.errorMessage = td.title;
    }
    if (selectedCellValue && selectedCellValue.rowIndex === rowIndex && selectedCellValue.columnIndex === columnIndex) td.classList.add("cell-selected");
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
    CDBVS.makeCellEditor(td, row, column, { sheet, rowIndex, path: `${sheet.name}/${rowIndex}` });
    return td;
  }

  CDBVS.renderTableCell = renderTableCell;
  CDBVS.bindCellInteractions = bindCellInteractions;
})(window);
