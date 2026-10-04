// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const tableCapabilities = CDBVS.capabilities.table;
  const commitMutation = CDBVS.services.application.commitMutation;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const documentText = CDBVS.documentText;
  const replaceDocumentText = CDBVS.replaceDocumentText;
  let cancelActiveBodyRender = null;

  function cancelBodyRender() {
    if (typeof cancelActiveBodyRender === "function") cancelActiveBodyRender();
    cancelActiveBodyRender = null;
  }

  function refreshTableBody(sheet, options) {
    if (typeof CDBVS.prepareCellTransition === "function" && !CDBVS.prepareCellTransition()) return true;
    if (!sheet || !CDBVS.app || typeof CDBVS.app.querySelector !== "function") return false;
    const tableWrap = CDBVS.app.querySelector(".table-wrap");
    if (!tableWrap || !tableWrap.querySelector) return false;
    const expectedKey = typeof CDBVS.viewportKeyForSheet === "function"
      ? CDBVS.viewportKeyForSheet(sheet.name) : null;
    if (expectedKey && tableWrap.dataset && tableWrap.dataset.cdbvsViewportKey !== expectedKey) return false;
    const table = tableWrap.querySelector("table");
    const previousBody = table && table.querySelector("tbody");
    if (!table || !previousBody) return false;

    const scrollLeft = tableWrap.scrollLeft;
    const scrollTop = tableWrap.scrollTop;
    const restoreGridFocus = previousBody.contains(document.activeElement);
    if (typeof CDBVS.cancelTableRender === "function") CDBVS.cancelTableRender();
    cancelBodyRender();
    tableWrap.setAttribute("aria-busy", "true");
    if (typeof CDBVS.updateCellModeHint === "function") CDBVS.updateCellModeHint();
    previousBody.inert = true;
    const body = document.createElement("tbody");
    const finish = () => {
      if (previousBody.parentNode === table) table.removeChild(previousBody);
      table.appendChild(body);
      tableWrap.setAttribute("aria-busy", "false");
      if (typeof CDBVS.updateCellModeHint === "function") CDBVS.updateCellModeHint();
      if (restoreGridFocus || (options && options.focusSelection)) {
        const selected = CDBVS.selectedCell(sheet);
        const selectedRow = !selected && CDBVS.findRenderedRow(CDBVS.selectedRowIndex(sheet));
        const target = selected ? CDBVS.findRenderedCell(selected.rowIndex, selected.columnIndex) : selectedRow && selectedRow.querySelector(".row-select");
        if (target) {
          target.focus({ preventScroll: true });
          if (options && options.focusSelection && typeof target.scrollIntoView === "function") target.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      }
      if (tableWrap._cdbvsUpdateHorizontalScrollSize) tableWrap._cdbvsUpdateHorizontalScrollSize();
      if (!(options && options.focusSelection)) {
        tableWrap.scrollLeft = scrollLeft;
        tableWrap.scrollTop = scrollTop;
      }
      cancelActiveBodyRender = null;
    };
    if (typeof tableCapabilities.renderBodyProgressive === "function") {
      cancelActiveBodyRender = tableCapabilities.renderBodyProgressive(body, sheet, { onComplete: finish });
    } else {
      body.replaceChildren(tableCapabilities.renderBody(sheet));
      finish();
    }
    return true;
  }

  function renderRaw(container) {
    const raw = document.createElement("textarea");
    raw.className = "raw-editor";
    raw.dataset.cdbvsViewportKey = "raw";
    const retained = CDBVS.state.rawDraft;
    raw.value = retained ? retained.text : documentText();
    raw.spellcheck = false;
    raw.setAttribute("aria-label", "CastleDB JSON draft");
    const hint = makeElement("p", "", "raw-draft-hint");
    hint.setAttribute("role", "status");
    const updateHint = () => {
      hint.textContent = CDBVS.state.rawDraft
        ? "Unapplied JSON draft retained when you switch views. Apply JSON updates the document; Ctrl/Cmd+S applies and saves."
        : "Apply JSON updates the document. Ctrl/Cmd+S applies and saves.";
    };
    raw.addEventListener("input", () => {
      const base = CDBVS.state.rawDraft ? CDBVS.state.rawDraft.base : documentText();
      CDBVS.state.rawDraft = raw.value === base ? null : { text: raw.value, base };
      updateHint();
    });
    updateHint();
    container.appendChild(hint);
    container.appendChild(raw);
    CDBVS.applyRawDraft = (saveFile = false) => {
      if (CDBVS.state.rawDraft && CDBVS.state.rawDraft.base !== documentText()) {
        CDBVS.setStatus("The document changed after this JSON draft started. Copy the draft, then discard it and edit the current JSON to avoid overwriting newer changes.", true);
        raw.focus();
        return false;
      }
      const result = replaceDocumentText(raw.value);
      if (!result.ok) {
        CDBVS.setStatus(result.message, true);
        raw.focus();
        return false;
      }
      CDBVS.state.rawDraft = null;
      commitMutation();
      if (saveFile && typeof CDBVS.requestSave === "function") CDBVS.requestSave();
      CDBVS.setStatus(saveFile ? "JSON applied; file save requested." : "JSON applied to the document. Use Ctrl/Cmd+S to save the file.");
      return true;
    };
    container.appendChild(makeButton("Apply JSON", () => CDBVS.applyRawDraft(), "button primary raw-apply"));
    const discard = () => {
      CDBVS.state.rawDraft = null;
      raw.value = documentText();
      updateHint();
      CDBVS.setStatus("JSON draft discarded; current document restored.");
      raw.focus();
    };
    container.appendChild(makeButton("Discard JSON draft", () => {
      if (raw.value === documentText()) { discard(); return; }
      CDBVS.openConfirmDialog({ title: "Discard JSON draft?", message: "The unapplied JSON changes will be discarded. The current document will be restored.", confirmLabel: "Discard draft", cancelLabel: "Keep editing", onConfirm: discard });
    }, "button raw-discard"));
  }

  function renderTable(container, sheet, options) {
    if (!sheet) {
      container.appendChild(makeElement("p", "No visible sheets. Create one to begin.", "empty"));
      return;
    }
    cancelBodyRender();
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
    body.inert = true;
    table.appendChild(body);
    const finish = () => {
      tableWrap.setAttribute("aria-busy", "false");
      body.inert = false;
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
      const availableWidth = Math.max(tableWrap.clientWidth, tableWrap.offsetWidth, horizontalScroll.clientWidth);
      horizontalScrollContent.style.width = `${Math.max(tableWidth, availableWidth)}px`;
      if (availableWidth > 0) horizontalScroll.hidden = tableWidth <= availableWidth + 1;
    };
    tableWrap._cdbvsUpdateHorizontalScrollSize = updateHorizontalScrollSize;
    const syncTableToHorizontalScroll = () => { if (horizontalScroll.scrollLeft !== tableWrap.scrollLeft) horizontalScroll.scrollLeft = tableWrap.scrollLeft; };
    const syncHorizontalScrollToTable = () => { if (tableWrap.scrollLeft !== horizontalScroll.scrollLeft) tableWrap.scrollLeft = horizontalScroll.scrollLeft; };
    tableWrap.addEventListener("scroll", syncTableToHorizontalScroll);
    horizontalScroll.addEventListener("scroll", syncHorizontalScrollToTable);
    if (typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver(updateHorizontalScrollSize);
      resizeObserver.observe(table);
      resizeObserver.observe(tableWrap);
    }
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
  Object.assign(CDBVS, { renderRaw, renderTable, refreshTableBody, cancelBodyRender });
})(window);
