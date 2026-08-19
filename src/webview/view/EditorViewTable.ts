// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const renderAfterUpdate = CDBVS.renderAfterUpdate;

  function renderRaw(container) {
    const raw = document.createElement("textarea");
    raw.className = "raw-editor";
    raw.value = state.text;
    raw.spellcheck = false;
    container.appendChild(raw);
    container.appendChild(makeButton("Apply JSON", () => {
      try {
        const parsed = JSON.parse(raw.value);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("The root must be an object.");
        state.data = parsed;
        renderAfterUpdate();
      } catch (error) {
        CDBVS.setStatus(`Invalid JSON: ${error.message}`, true);
      }
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
