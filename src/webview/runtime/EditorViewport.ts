// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;

  CDBVS.rememberViewport = function () {
    const tableWrap = document.querySelector(".table-wrap");
    if (!tableWrap) return;
    CDBVS.state.scrollLeft = tableWrap.scrollLeft;
    CDBVS.state.scrollTop = tableWrap.scrollTop;
  };

  CDBVS.restoreViewport = function () {
    const tableWrap = document.querySelector(".table-wrap");
    if (!tableWrap) return;
    tableWrap.scrollLeft = CDBVS.state.scrollLeft;
    tableWrap.scrollTop = CDBVS.state.scrollTop;
    const horizontalScroll = document.querySelector(".horizontal-scroll-dock");
    if (horizontalScroll) horizontalScroll.scrollLeft = tableWrap.scrollLeft;
  };
})(window);
