// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const tableCapabilities = CDBVS.capabilities.table;
  const commitMutation = CDBVS.services.application.commitMutation;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const documentText = CDBVS.documentText;
  const replaceDocumentText = CDBVS.replaceDocumentText;

  function renderRaw(container) {
    const raw = document.createElement("textarea");
    raw.className = "raw-editor";
    raw.dataset.cdbvsViewportKey = "raw";
    raw.value = documentText();
    raw.spellcheck = false;
    container.appendChild(raw);
    container.appendChild(makeButton("Apply JSON", () => {
      const result = replaceDocumentText(raw.value);
      if (!result.ok) {
        CDBVS.setStatus(result.message, true);
        return;
      }
      commitMutation();
    }, "button primary raw-apply"));
  }

  function renderTable(container, sheet, options) {
    if (!sheet) {
      container.appendChild(makeElement("p", "No visible sheets. Create one to begin.", "empty"));
      return;
    }
    const config = options || {};
    const tableWrap = makeElement("div", null, "table-wrap");
    tableWrap.dataset.cdbvsViewportKey = CDBVS.viewportKeyForSheet(sheet.name);
    tableWrap.setAttribute("aria-busy", "true");
    const loading = makeElement("div", "Loading sheet...", "sheet-loading");
    loading.setAttribute("role", "status");
    loading.setAttribute("aria-live", "polite");
    const table = document.createElement("table");
    table.appendChild(tableCapabilities.renderHeader(sheet));
    const body = document.createElement("tbody");
    table.appendChild(body);
    const finish = () => {
      tableWrap.setAttribute("aria-busy", "false");
      if (loading.parentNode) loading.parentNode.removeChild(loading);
      updateHorizontalScrollSize();
      if (typeof config.onComplete === "function") config.onComplete();
    };
    tableWrap.appendChild(table);
    tableWrap.appendChild(loading);
    container.appendChild(tableWrap);
    const horizontalScroll = makeElement("div", null, "horizontal-scroll-dock");
    horizontalScroll.setAttribute("aria-label", "Horizontal sheet scroll");
    const horizontalScrollContent = makeElement("div", null, "horizontal-scroll-content");
    horizontalScroll.appendChild(horizontalScrollContent);
    const updateHorizontalScrollSize = () => {
      const tableWidth = Math.max(table.scrollWidth, table.offsetWidth, Math.ceil(table.getBoundingClientRect().width), tableWrap.scrollWidth);
      horizontalScrollContent.style.width = `${Math.max(tableWidth, tableWrap.clientWidth)}px`;
    };
    const syncTableToHorizontalScroll = () => { if (horizontalScroll.scrollLeft !== tableWrap.scrollLeft) horizontalScroll.scrollLeft = tableWrap.scrollLeft; };
    const syncHorizontalScrollToTable = () => { if (tableWrap.scrollLeft !== horizontalScroll.scrollLeft) tableWrap.scrollLeft = horizontalScroll.scrollLeft; };
    tableWrap.addEventListener("scroll", syncTableToHorizontalScroll);
    horizontalScroll.addEventListener("scroll", syncHorizontalScrollToTable);
    if (typeof ResizeObserver === "function") new ResizeObserver(updateHorizontalScrollSize).observe(table);
    requestAnimationFrame(updateHorizontalScrollSize);
    container.appendChild(horizontalScroll);
    if (typeof tableCapabilities.renderBodyProgressive === "function") {
      const cancel = tableCapabilities.renderBodyProgressive(body, sheet, { onComplete: finish });
      return typeof cancel === "function" ? cancel : undefined;
    }
    body.replaceChildren(tableCapabilities.renderBody(sheet));
    finish();
  }

  CDBVS.capabilities.views.renderRaw = renderRaw;
  CDBVS.capabilities.views.renderTable = renderTable;
  Object.assign(CDBVS, { renderRaw, renderTable });
})(window);
