// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const viewState = CDBVS.viewState;

  CDBVS.rememberViewport = function () {
    const tableWrap = document.querySelector(".table-wrap");
    if (!tableWrap) return;
    viewState.setViewport(tableWrap.scrollLeft, tableWrap.scrollTop);
  };

  CDBVS.restoreViewport = function () {
    const tableWrap = document.querySelector(".table-wrap");
    if (!tableWrap) return;
    const viewport = viewState.viewport();
    tableWrap.scrollLeft = viewport.left;
    tableWrap.scrollTop = viewport.top;
    const horizontalScroll = document.querySelector(".horizontal-scroll-dock");
    if (horizontalScroll) horizontalScroll.scrollLeft = tableWrap.scrollLeft;
  };
})(window);
