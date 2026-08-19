// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;

  function viewportStore() {
    if (!state.viewports || typeof state.viewports !== "object" || Array.isArray(state.viewports)) state.viewports = {};
    return state.viewports;
  }

  function validCoordinate(value) {
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

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
    viewport(key) {
      const store = viewportStore();
      if (key && Object.prototype.hasOwnProperty.call(store, key)) {
        const saved = store[key];
        return {
          left: validCoordinate(saved && saved.left),
          top: validCoordinate(saved && saved.top)
        };
      }
      if (key && Object.keys(store).length) return { left: 0, top: 0 };
      // Keep the original coordinates as a compatibility fallback for old
      // callers and for the first view before any keyed position is saved.
      return {
        left: validCoordinate(state.scrollLeft),
        top: validCoordinate(state.scrollTop)
      };
    },
    setViewport(left, top, key) {
      const nextLeft = validCoordinate(left);
      const nextTop = validCoordinate(top);
      state.scrollLeft = nextLeft;
      state.scrollTop = nextTop;
      if (key) viewportStore()[key] = { left: nextLeft, top: nextTop };
    },
    renameViewport(oldKey, newKey) {
      if (!oldKey || !newKey || oldKey === newKey) return;
      const store = viewportStore();
      Object.keys(store).filter((key) => key === oldKey || key.startsWith(`${oldKey}@`)).forEach((key) => {
        const nextKey = `${newKey}${key.slice(oldKey.length)}`;
        if (!Object.prototype.hasOwnProperty.call(store, nextKey)) store[nextKey] = store[key];
        delete store[key];
      });
    },
    removeViewport(key) {
      if (key) delete viewportStore()[key];
    },
    clear() {
      this.setFilter("");
      CDBVS.sheetState.view.clear();
    }
  };

  CDBVS.viewState = viewState;
})(window);
