// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const sheetView = CDBVS.services.sheetView;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;

  function renderTableHeader(sheet) {
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.appendChild(makeElement("th", "#", "row-number"));
    (sheet.columns || []).forEach((column, columnIndex) => {
      const th = document.createElement("th");
      if (CDBVS.typeOf(column).code === 0) th.classList.add("primary-id-column");
      const activeSort = sheetView.viewForSheet(sheet).sort;
      const sortDirection = activeSort.column === column.name ? activeSort.direction : "";
      const sortButton = makeButton(sortDirection === "desc" ? "\u25BC" : (sortDirection === "asc" ? "\u25B2" : "\u2195"), () => CDBVS.cycleColumnSort(sheet, column.name), sortDirection ? "column-sort-button active" : "column-sort-button");
      sortButton.title = sortDirection === "desc" ? `Sorted descending by ${column.name}` : (sortDirection === "asc" ? `Sorted ascending by ${column.name}` : `Sort by ${column.name}`);
      sortButton.setAttribute("aria-label", sortButton.title);
      const title = makeElement("div", null, "column-title");
      title.appendChild(makeElement("span", column.name || "?"));
      title.appendChild(makeButton("\u270E", () => CDBVS.openColumnEditor(sheet, column, columnIndex), "column-edit-button"));
      const header = makeElement("div", null, "column-header");
      header.appendChild(sortButton);
      header.appendChild(title);
      th.appendChild(header);
      th.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        CDBVS.showColumnContextMenu(event, sheet, columnIndex);
      });
      headRow.appendChild(th);
    });
    head.appendChild(headRow);
    return head;
  }

  CDBVS.capabilities.table.renderHeader = renderTableHeader;
  CDBVS.renderTableHeader = renderTableHeader;
})(window);
