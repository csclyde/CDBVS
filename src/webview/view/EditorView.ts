// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const viewCapabilities = CDBVS.capabilities.views;
  const services = CDBVS.services;
  const documentActions = services.application.documentActions;
  const sheetState = services.sheetState;
  const sheetViewModel = services.sheetView;
  const viewState = services.viewState;
  const getFilter = viewState.getFilter;
  const setFilter = viewState.setFilter;
  const setRawMode = viewState.setRawMode;
  const getSheetIndex = sheetState.getActiveIndex;
  const setSheetIndex = sheetState.setActiveIndex;
  const isRawMode = viewState.isRawMode;
  const app = CDBVS.app;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const rememberViewport = CDBVS.rememberViewport;
  const restoreViewport = CDBVS.restoreViewport;
  const restoreViewportAfterLayout = CDBVS.restoreViewportAfterLayout;
  const documentIssues = CDBVS.documentIssues;
  const hasDocument = CDBVS.hasDocument;
  let cancelActiveTableRender = null;
  function cancelTableRender() {
    if (typeof cancelActiveTableRender === "function") cancelActiveTableRender();
    cancelActiveTableRender = null;
    const loading = app.querySelector(".sheet-loading");
    if (loading) loading.remove();
  }

  function render() {
    if (typeof CDBVS.prepareCellTransition === "function" && !CDBVS.prepareCellTransition()) return false;
    if (typeof cancelActiveTableRender === "function") cancelActiveTableRender();
    cancelActiveTableRender = null;
    if (typeof CDBVS.finishSelectMenu === "function") CDBVS.finishSelectMenu(true);
    CDBVS.clearReferenceOptionsCache();
    sheetState.clearMap("activeCells");
    CDBVS.closeContextMenu();
    rememberViewport();
    app.replaceChildren();
    const toolbar = makeElement("div", null, "toolbar");
    toolbar.appendChild(makeElement("strong", "CDBVS", "brand"));
    const schemaUnavailable = isRawMode() || !hasDocument();
    const addSheet = makeButton("+ Sheet", documentActions.addSheet);
    addSheet.disabled = schemaUnavailable;
    toolbar.appendChild(addSheet);
    const addRow = makeButton("+ Row", () => documentActions.addRow(sheetViewModel.currentSheet()));
    addRow.disabled = isRawMode() || !hasDocument() || !sheetViewModel.currentSheet();
    addRow.title = "Add a row at the end of this sheet";
    toolbar.appendChild(addRow);
    const addColumn = makeButton("+ Column", () => documentActions.addColumn(sheetViewModel.currentSheet()));
    addColumn.disabled = schemaUnavailable || !sheetViewModel.currentSheet();
    toolbar.appendChild(addColumn);
    const types = makeButton("Types", CDBVS.openTypesEditor);
    types.disabled = schemaUnavailable;
    toolbar.appendChild(types);
    toolbar.appendChild(makeButton("Table", () => { if (!CDBVS.prepareCellTransition()) return; setRawMode(false); render(); }, isRawMode() ? "button" : "button active"));
    toolbar.appendChild(makeButton("Raw JSON", () => { if (!CDBVS.prepareCellTransition()) return; setRawMode(true); render(); }, isRawMode() ? "button active" : "button"));
    app.appendChild(toolbar);
    if (CDBVS.state.rawDraft && !isRawMode()) {
      app.appendChild(makeElement("p", "You have an unapplied JSON draft. Return to Raw JSON to review it.", "raw-draft-hint"));
    }

    const sheetsBar = makeElement("div", null, "sheets");
    sheetsBar.addEventListener("contextmenu", (event) => {
      if (event.target.closest && event.target.closest(".sheet-tab")) return;
        CDBVS.showSheetsBarContextMenu(event);
    });
    sheetViewModel.visibleSheets().forEach((sheet, index) => {
      const tab = makeElement("div", null, index === getSheetIndex() ? "sheet-tab active" : "sheet-tab");
      tab.addEventListener("contextmenu", (event) => {
        event.stopPropagation();
        CDBVS.showSheetContextMenu(event, sheet);
      });
      tab.appendChild(makeButton(sheet.name, () => { if (!CDBVS.prepareCellTransition()) return; setSheetIndex(index); setRawMode(false); render(); }, "sheet"));
      const editSheet = makeButton("\u270E", () => CDBVS.openSheetEditor(sheet), "sheet-edit-button");
      editSheet.setAttribute("aria-label", `Edit sheet: ${sheet.name}`);
      editSheet.title = `Edit sheet: ${sheet.name}`;
      editSheet.disabled = schemaUnavailable;
      tab.appendChild(editSheet);
      sheetsBar.appendChild(tab);
    });

    const viewToolbar = makeElement("div", null, "sheet-view-toolbar");
    const viewControls = makeElement("div", null, "sheet-view-controls");
    const selectedSheet = sheetViewModel.currentSheet();
    const hasActiveView = CDBVS.activeViewItems(selectedSheet).length > 0;
    viewControls.appendChild(makeElement("strong", "Sheet view", "view-toolbar-label"));
    const filterButton = makeButton("", () => CDBVS.openFilterModal(selectedSheet), hasActiveView ? "button active filter-button" : "button filter-button");
    filterButton.appendChild(makeElement("span", null, "filter-icon"));
    filterButton.title = "Filter this sheet";
    filterButton.setAttribute("aria-label", "Filter this sheet");
    filterButton.disabled = schemaUnavailable || !selectedSheet;
    viewControls.appendChild(filterButton);
    const searchWrap = makeElement("div", null, "search-wrap");
    const search = document.createElement("input");
    search.className = "search";
    search.placeholder = "Search this sheet...";
    search.setAttribute("aria-label", "Search this sheet");
    search.disabled = schemaUnavailable || !selectedSheet;
    search.value = getFilter();
    search.addEventListener("input", () => {
      if (!CDBVS.prepareCellTransition()) { search.value = getFilter(); return; }
      const value = search.value;
      setFilter(value);
      if (!refreshView()) render();
      const nextSearch = app.querySelector && app.querySelector(".search");
      if (nextSearch) {
        nextSearch.focus();
        nextSearch.setSelectionRange(value.length, value.length);
      }
    });
    searchWrap.appendChild(search);
    if (getFilter().trim()) searchWrap.classList.add("has-value");
    const clearSearch = makeButton("x", () => {
      if (!CDBVS.prepareCellTransition()) return;
      search.value = "";
      searchWrap.classList.remove("has-value");
      setFilter("");
      if (!refreshView()) render();
      const nextSearch = app.querySelector && app.querySelector(".search");
      if (nextSearch) nextSearch.focus();
    }, "search-clear");
    clearSearch.title = "Clear search";
    clearSearch.setAttribute("aria-label", "Clear search");
    searchWrap.appendChild(clearSearch);
    viewControls.appendChild(searchWrap);
    viewToolbar.appendChild(viewControls);
    const viewSummary = makeElement("div", null, "sheet-view-summary");
    viewCapabilities.renderViewSummary(viewSummary, selectedSheet);
    viewToolbar.appendChild(viewSummary);
    app.appendChild(viewToolbar);

    const status = makeElement("div", null, "status");
    status.id = "status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const issues = documentIssues();
    if (issues.length) status.textContent = issues.join(" / ");
    if (CDBVS.state.lastDocumentError) {
      status.textContent = CDBVS.state.lastDocumentError;
      status.classList.add("error");
    }
    app.appendChild(status);
    const modeHint = makeElement("div", null, "cell-mode-hint");
    modeHint.setAttribute("role", "status");
    modeHint.setAttribute("aria-live", "polite");
    app.appendChild(modeHint);
    CDBVS.updateCellModeHint();
    app.appendChild(makeElement("div", null, "draft-recovery-host"));
    refreshDraftRecovery();
    const content = makeElement("main", null, "content");
    const renderedViewport = () => content.querySelector(".table-wrap") || content.querySelector(".raw-editor");
    if (isRawMode() || !hasDocument()) viewCapabilities.renderRaw(content);
    else cancelActiveTableRender = viewCapabilities.renderTable(content, sheetViewModel.currentSheet(), {
      onComplete: () => {
        cancelActiveTableRender = null;
        // Progressive row construction can clamp scrollTop while the table is
        // still short. Restore after the last batch has established its size.
        const target = renderedViewport();
        CDBVS.updateCellModeHint();
        if (typeof restoreViewportAfterLayout === "function") restoreViewportAfterLayout(target);
        else restoreViewport(target);
      }
    });
    app.appendChild(content);
    app.appendChild(sheetsBar);
    const target = renderedViewport();
    if (typeof restoreViewportAfterLayout === "function") restoreViewportAfterLayout(target);
    else requestAnimationFrame(() => restoreViewport(target));
    return true;
  }

  function refreshDraftRecovery() {
    const host = app.querySelector(".draft-recovery-host");
    if (!host) return;
    host.replaceChildren();
    const drafts = CDBVS.state.recoveredDrafts || [];
    host.hidden = !drafts.length;
    if (!drafts.length) return;
    const recovery = makeElement("section", null, "cell-draft-recovery");
    recovery.setAttribute("role", "region");
    recovery.setAttribute("aria-label", "Recovered edits");
    recovery.appendChild(makeElement("strong", "Edits preserved for recovery."));
    recovery.appendChild(makeElement("p", "These edits were interrupted or could not be applied. Review the current document and copy anything you want to keep."));
    drafts.forEach((draft) => {
      const field = makeElement("label", null, "recovered-draft");
      field.appendChild(makeElement("span", draft.label));
      const text = document.createElement("textarea");
      text.readOnly = true;
      text.value = draft.text;
      text.setAttribute("aria-label", draft.label);
      field.appendChild(text);
      recovery.appendChild(field);
    });
    recovery.appendChild(makeButton("Dismiss recovered edits", () => CDBVS.openConfirmDialog({ title: "Discard recovered edits?", message: "Copy anything you want to keep before discarding these recovered edits.", confirmLabel: "Discard recovered edits", onConfirm: () => { CDBVS.state.recoveredDrafts = []; refreshDraftRecovery(); } })));
    host.appendChild(recovery);
  }

  function refreshView(options) {
    if (!CDBVS.prepareCellTransition()) return true; // Handled: keep the existing editor.
    const selectedSheet = sheetViewModel.currentSheet();
    if (isRawMode() || !hasDocument() || !selectedSheet) return false;
    const config = options || {};
    if (typeof CDBVS.refreshTableBody !== "function" || !CDBVS.refreshTableBody(selectedSheet, config)) return false;
    if (config.refreshHeader) {
      const tableWrap = app.querySelector && app.querySelector(".table-wrap");
      const table = tableWrap && tableWrap.querySelector && tableWrap.querySelector("table");
      const previousHeader = table && table.querySelector("thead");
      if (table && previousHeader && typeof CDBVS.renderTableHeader === "function") {
        table.replaceChild(CDBVS.renderTableHeader(selectedSheet), previousHeader);
        if (tableWrap._cdbvsUpdateHorizontalScrollSize) tableWrap._cdbvsUpdateHorizontalScrollSize();
      }
    }

    const summary = app.querySelector && app.querySelector(".sheet-view-summary");
    if (summary && typeof viewCapabilities.renderViewSummary === "function") {
      viewCapabilities.renderViewSummary(summary, selectedSheet);
    }
    const filterButton = app.querySelector && app.querySelector(".filter-button");
    if (filterButton) filterButton.className = CDBVS.activeViewItems(selectedSheet).length ? "button active filter-button" : "button filter-button";
    const search = app.querySelector && app.querySelector(".search");
    const searchWrap = search && search.parentNode;
    if (search && search.value !== getFilter()) search.value = getFilter();
    if (searchWrap) {
      if (getFilter().trim()) searchWrap.classList.add("has-value");
      else searchWrap.classList.remove("has-value");
    }
    CDBVS.updateCellModeHint();
    return true;
  }

  CDBVS.render = render;
  CDBVS.refreshView = refreshView;
  CDBVS.cancelTableRender = cancelTableRender;
  CDBVS.refreshDraftRecovery = refreshDraftRecovery;
  if (typeof CDBVS.installKeyboardNavigation === "function") CDBVS.installKeyboardNavigation();
})(window);
