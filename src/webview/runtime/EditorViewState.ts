// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;

  // View state describes application mode/query state only. It has no DOM
  // behavior; renderers decide how these values are presented.
  const viewState = {
    getFilter() {
      return typeof state.filter === "string" ? state.filter : "";
    },
    setFilter(value) {
      state.filter = value === undefined || value === null ? "" : String(value);
      return state.filter;
    },
    isRawMode() {
      return state.rawMode === true;
    },
    setRawMode(enabled) {
      state.rawMode = enabled === true;
      return state.rawMode;
    },
    showHiddenSheets() {
      return state.showHiddenSheets === true;
    },
    viewport() {
      return {
        left: Number.isFinite(state.scrollLeft) ? state.scrollLeft : 0,
        top: Number.isFinite(state.scrollTop) ? state.scrollTop : 0
      };
    },
    setViewport(left, top) {
      state.scrollLeft = Number.isFinite(left) ? left : 0;
      state.scrollTop = Number.isFinite(top) ? top : 0;
    },
    clear() {
      this.setFilter("");
      CDBVS.sheetState.view.clear();
    }
  };

  CDBVS.viewState = viewState;
})(window);
