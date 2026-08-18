(function (global) {
  const CDBVS = global.CDBVS;
  const makeElement = CDBVS.makeElement;

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
    let selectionOnlyClick = false;
    td.addEventListener("mousedown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      const current = CDBVS.selectedCell(sheet);
      const alreadySelected = current && current.rowIndex === rowIndex && current.columnIndex === columnIndex;
      const selectTarget = event.target && event.target.closest && event.target.closest("select");
      if (alreadySelected && CDBVS.activeCell(sheet)) {
        event.preventDefault();
        CDBVS.exitRenderedCell(sheet);
        selectionOnlyClick = true;
        return;
      }
      if (alreadySelected && selectTarget) {
        event.preventDefault();
        CDBVS.activateRenderedCell(sheet, rowIndex, columnIndex, event);
        selectionOnlyClick = true;
        return;
      }
      if (alreadySelected || event.target === td) return;
      event.preventDefault();
      CDBVS.selectRenderedCell(sheet, rowIndex, columnIndex, tr, td);
      selectionOnlyClick = true;
    }, true);
    td.addEventListener("mouseleave", () => { selectionOnlyClick = false; });
    td.addEventListener("pointercancel", () => { selectionOnlyClick = false; });
    td.addEventListener("click", (event) => {
      if (!selectionOnlyClick) return;
      event.preventDefault();
      if (typeof event.stopPropagation === "function") event.stopPropagation();
    }, true);
    td.addEventListener("click", (event) => {
      if (!event.target.closest || event.target.closest("tr") !== tr) return;
      const current = CDBVS.selectedCell(sheet);
      if (selectionOnlyClick) { selectionOnlyClick = false; return; }
      if (current && current.rowIndex === rowIndex && current.columnIndex === columnIndex) CDBVS.activateRenderedCell(sheet, rowIndex, columnIndex, event);
      else CDBVS.selectRenderedCell(sheet, rowIndex, columnIndex, tr, td);
    });
    td.addEventListener("contextmenu", (event) => {
      if (!event.target.closest || event.target.closest("tr") !== tr) return;
      event.preventDefault();
      CDBVS.selectRenderedCell(sheet, rowIndex, columnIndex, tr, td);
      CDBVS.showCellContextMenu(event, sheet);
    });
    CDBVS.makeCellEditor(td, row, column, { sheet, rowIndex, path: `${sheet.name}/${rowIndex}` });
    return td;
  }

  CDBVS.renderTableCell = renderTableCell;
})(window);
