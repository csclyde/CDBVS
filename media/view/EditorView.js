(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const app = CDBVS.app;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const rememberViewport = CDBVS.rememberViewport;
  const restoreViewport = CDBVS.restoreViewport;

  function render() {
    CDBVS.clearReferenceOptionsCache();
    if (state.activeCells) state.activeCells = {};
    CDBVS.closeContextMenu();
    rememberViewport();
    app.replaceChildren();
    const toolbar = makeElement("div", null, "toolbar");
    toolbar.appendChild(makeElement("strong", "CDBVS", "brand"));
    toolbar.appendChild(makeButton("+ Sheet", CDBVS.addSheet));
    toolbar.appendChild(makeButton("+ Column", () => CDBVS.addColumn(CDBVS.currentSheet())));
    toolbar.appendChild(makeButton("Types", CDBVS.openTypesEditor));
    toolbar.appendChild(makeButton("Table", () => { state.rawMode = false; render(); }, state.rawMode ? "button" : "button active"));
    toolbar.appendChild(makeButton("Raw JSON", () => { state.rawMode = true; render(); }, state.rawMode ? "button active" : "button"));
    app.appendChild(toolbar);

    const sheetsBar = makeElement("div", null, "sheets");
    sheetsBar.addEventListener("contextmenu", (event) => {
      if (event.target.closest && event.target.closest(".sheet-tab")) return;
        CDBVS.showSheetsBarContextMenu(event);
    });
    CDBVS.visibleSheets().forEach((sheet, index) => {
      const tab = makeElement("div", null, index === state.sheetIndex ? "sheet-tab active" : "sheet-tab");
      tab.addEventListener("contextmenu", (event) => {
        event.stopPropagation();
        CDBVS.showSheetContextMenu(event, sheet);
      });
      tab.appendChild(makeButton(sheet.name, () => { state.sheetIndex = index; state.rawMode = false; render(); }, "sheet"));
      tab.appendChild(makeButton("\u270E", () => CDBVS.openSheetEditor(sheet), "sheet-edit-button"));
      sheetsBar.appendChild(tab);
    });

    const viewToolbar = makeElement("div", null, "sheet-view-toolbar");
    const viewControls = makeElement("div", null, "sheet-view-controls");
    const selectedSheet = CDBVS.currentSheet();
    const hasActiveView = CDBVS.activeViewItems(selectedSheet).length > 0;
    viewControls.appendChild(makeElement("strong", "Sheet view", "view-toolbar-label"));
    const filterButton = makeButton("", () => CDBVS.openFilterModal(selectedSheet), hasActiveView ? "button active filter-button" : "button filter-button");
    filterButton.appendChild(makeElement("span", null, "filter-icon"));
    filterButton.title = "Filter this sheet";
    filterButton.setAttribute("aria-label", "Filter this sheet");
    viewControls.appendChild(filterButton);
    const searchWrap = makeElement("div", null, "search-wrap");
    const search = document.createElement("input");
    search.className = "search";
    search.placeholder = "Search this sheet...";
    search.value = state.filter;
    search.addEventListener("input", () => {
      const value = search.value;
      state.filter = value;
      render();
      const nextSearch = document.querySelector(".search");
      if (nextSearch) {
        nextSearch.focus();
        nextSearch.setSelectionRange(value.length, value.length);
      }
    });
    searchWrap.appendChild(search);
    if (state.filter.trim()) searchWrap.classList.add("has-value");
    const clearSearch = makeButton("x", () => {
      state.filter = "";
      render();
      const nextSearch = document.querySelector(".search");
      if (nextSearch) nextSearch.focus();
    }, "search-clear");
    clearSearch.title = "Clear search";
    clearSearch.setAttribute("aria-label", "Clear search");
    searchWrap.appendChild(clearSearch);
    viewControls.appendChild(searchWrap);
    viewToolbar.appendChild(viewControls);
    const viewSummary = makeElement("div", null, "sheet-view-summary");
    CDBVS.renderViewSummary(viewSummary, selectedSheet);
    viewToolbar.appendChild(viewSummary);
    app.appendChild(viewToolbar);

    const status = makeElement("div", null, "status");
    status.id = "status";
    if (state.issues.length) status.textContent = state.issues.join(" / ");
    app.appendChild(status);
    const content = makeElement("main", null, "content");
    if (state.rawMode || !state.data) CDBVS.renderRaw(content);
    else CDBVS.renderTable(content, CDBVS.currentSheet());
    app.appendChild(content);
    app.appendChild(sheetsBar);
    requestAnimationFrame(restoreViewport);
  }

  CDBVS.render = render;
  if (typeof CDBVS.installKeyboardNavigation === "function") CDBVS.installKeyboardNavigation();
})(window);
