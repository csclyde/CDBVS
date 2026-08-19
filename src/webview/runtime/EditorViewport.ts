// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const viewState = CDBVS.viewState;

  function appViewportElement() {
    const app = CDBVS.app;
    if (app && typeof app.querySelector === "function") {
      const inApp = app.querySelector(".table-wrap") || app.querySelector(".raw-editor");
      if (inApp) return inApp;
    }
    return document.querySelector(".table-wrap") || document.querySelector(".raw-editor");
  }

  function viewportKey(element) {
    if (element && element.dataset && element.dataset.cdbvsViewportKey) return element.dataset.cdbvsViewportKey;
    return element && element.classList && element.classList.contains("raw-editor") ? "raw" : "table";
  }

  function horizontalDock(element) {
    if (!element) return null;
    const parent = element.parentNode;
    if (parent && typeof parent.querySelector === "function") {
      const siblingDock = parent.querySelector(".horizontal-scroll-dock");
      if (siblingDock) return siblingDock;
    }
    return document.querySelector(".horizontal-scroll-dock");
  }

  function bindViewport(element) {
    if (!element || typeof element.addEventListener !== "function" || element._cdbvsViewportListener) return;
    const listener = () => CDBVS.rememberViewport(element);
    element._cdbvsViewportListener = listener;
    element.addEventListener("scroll", listener);
  }

  CDBVS.viewportKeyForSheet = function (sheetName) {
    return `table:${String(sheetName || "")}`;
  };

  CDBVS.rememberViewport = function (element) {
    const target = element || appViewportElement();
    if (!target) return;
    bindViewport(target);
    viewState.setViewport(target.scrollLeft, target.scrollTop, viewportKey(target));
  };

  CDBVS.restoreViewport = function (element) {
    const target = element || appViewportElement();
    if (!target) return;
    bindViewport(target);
    const viewport = viewState.viewport(viewportKey(target));
    target.scrollLeft = viewport.left;
    target.scrollTop = viewport.top;
    const horizontalScroll = horizontalDock(target);
    if (horizontalScroll && target.classList && target.classList.contains("table-wrap")) {
      horizontalScroll.scrollLeft = target.scrollLeft;
    }
  };

  CDBVS.restoreViewportAfterLayout = function (element) {
    const schedule = typeof global.requestAnimationFrame === "function"
      ? global.requestAnimationFrame.bind(global)
      : (callback) => global.setTimeout(callback, 0);
    schedule(() => CDBVS.restoreViewport(element));
  };

  CDBVS.renameViewport = function (oldSheetName, newSheetName) {
    viewState.renameViewport(
      CDBVS.viewportKeyForSheet(oldSheetName),
      CDBVS.viewportKeyForSheet(newSheetName)
    );
  };
})(window);
