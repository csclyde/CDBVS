// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const commitMutation = CDBVS.commitMutation;
  const documentText = CDBVS.documentText;
  const replaceDocumentText = CDBVS.replaceDocumentText;

  function renderRaw(container) {
    const raw = document.createElement("textarea");
    raw.className = "raw-editor";
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

  function renderTable(container, sheet) {
    if (!sheet) {
      container.appendChild(makeElement("p", "No visible sheets. Create one to begin.", "empty"));
      return;
    }
    const tableWrap = makeElement("div", null, "table-wrap");
    const table = document.createElement("table");
    table.appendChild(CDBVS.renderTableHeader(sheet));
    table.appendChild(CDBVS.renderTableBody(sheet));
    tableWrap.appendChild(table);
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
  }

  Object.assign(CDBVS, { renderRaw, renderTable });
})(window);
