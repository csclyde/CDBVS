// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;

  // Local cell refreshes preserve the viewport while keeping the full-table
  // renderer out of nested editor interactions.
  function refreshCell(cell, render) {
    const tableWrap = document.querySelector(".table-wrap");
    const scrollLeft = tableWrap ? tableWrap.scrollLeft : 0;
    const scrollTop = tableWrap ? tableWrap.scrollTop : 0;
    cell.replaceChildren();
    if (typeof render === "function") render();
    if (tableWrap) requestAnimationFrame(() => {
      tableWrap.scrollLeft = scrollLeft;
      tableWrap.scrollTop = scrollTop;
    });
  }

  CDBVS.refreshCell = refreshCell;
})(window);
