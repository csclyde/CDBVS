(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const app = CDBVS.app;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const rememberViewport = CDBVS.rememberViewport;
  const restoreViewport = CDBVS.restoreViewport;
  const currentSheet = (...args) => CDBVS.currentSheet(...args);
  const visibleSheets = (...args) => CDBVS.visibleSheets(...args);
  const clearReferenceOptionsCache = (...args) => CDBVS.clearReferenceOptionsCache(...args);
  const addSheet = (...args) => CDBVS.addSheet(...args);
  const addColumn = (...args) => CDBVS.addColumn(...args);
  const openTypesEditor = (...args) => CDBVS.openTypesEditor(...args);
  const openSheetEditor = (...args) => CDBVS.openSheetEditor(...args);
  const openFilterModal = (...args) => CDBVS.openFilterModal(...args);
  const openRowEditor = (...args) => CDBVS.openRowEditor(...args);
  const activeViewItems = (...args) => CDBVS.activeViewItems(...args);
  const renderViewSummary = (...args) => CDBVS.renderViewSummary(...args);
  const showSheetContextMenu = (...args) => CDBVS.showSheetContextMenu(...args);
  const showSheetsBarContextMenu = (...args) => CDBVS.showSheetsBarContextMenu(...args);
  const closeContextMenu = (...args) => CDBVS.closeContextMenu(...args);
  const renderRaw = (...args) => CDBVS.renderRaw(...args);
  const renderTable = (...args) => CDBVS.renderTable(...args);

  function render() {
    clearReferenceOptionsCache();
    if (state.activeCells) state.activeCells = {};
    closeContextMenu();
    rememberViewport();
    app.replaceChildren();
    const toolbar = makeElement("div", null, "toolbar");
    toolbar.appendChild(makeElement("strong", "CDBVS", "brand"));
    toolbar.appendChild(makeButton("+ Sheet", addSheet));
    toolbar.appendChild(makeButton("+ Column", () => addColumn(currentSheet())));
    toolbar.appendChild(makeButton("Types", openTypesEditor));
    toolbar.appendChild(makeButton("Table", () => { state.rawMode = false; render(); }, state.rawMode ? "button" : "button active"));
    toolbar.appendChild(makeButton("Raw JSON", () => { state.rawMode = true; render(); }, state.rawMode ? "button active" : "button"));
    app.appendChild(toolbar);

    const sheetsBar = makeElement("div", null, "sheets");
    sheetsBar.addEventListener("contextmenu", (event) => {
      if (event.target.closest && event.target.closest(".sheet-tab")) return;
      showSheetsBarContextMenu(event);
    });
    visibleSheets().forEach((sheet, index) => {
      const tab = makeElement("div", null, index === state.sheetIndex ? "sheet-tab active" : "sheet-tab");
      tab.addEventListener("contextmenu", (event) => {
        event.stopPropagation();
        showSheetContextMenu(event, sheet);
      });
      tab.appendChild(makeButton(sheet.name, () => { state.sheetIndex = index; state.rawMode = false; render(); }, "sheet"));
      tab.appendChild(makeButton("\u270E", () => openSheetEditor(sheet), "sheet-edit-button"));
      sheetsBar.appendChild(tab);
    });

    const viewToolbar = makeElement("div", null, "sheet-view-toolbar");
    const viewControls = makeElement("div", null, "sheet-view-controls");
    const selectedSheet = currentSheet();
    const hasActiveView = activeViewItems(selectedSheet).length > 0;
    viewControls.appendChild(makeElement("strong", "Sheet view", "view-toolbar-label"));
    const filterButton = makeButton("", () => openFilterModal(selectedSheet), hasActiveView ? "button active filter-button" : "button filter-button");
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
    renderViewSummary(viewSummary, selectedSheet);
    viewToolbar.appendChild(viewSummary);
    app.appendChild(viewToolbar);

    const status = makeElement("div", null, "status");
    status.id = "status";
    if (state.issues.length) status.textContent = state.issues.join(" / ");
    app.appendChild(status);
    const content = makeElement("main", null, "content");
    if (state.rawMode || !state.data) renderRaw(content);
    else renderTable(content, currentSheet());
    app.appendChild(content);
    app.appendChild(sheetsBar);
    requestAnimationFrame(restoreViewport);
  }

  CDBVS.render = render;
  if (typeof CDBVS.installKeyboardNavigation === "function") CDBVS.installKeyboardNavigation();
})(window);
