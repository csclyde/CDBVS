(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const app = CDBVS.app;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const rememberViewport = CDBVS.rememberViewport;
  const restoreViewport = CDBVS.restoreViewport;
  const sendUpdate = () => CDBVS.sendUpdate();
  const setStatus = (message, error) => CDBVS.setStatus(message, error);
  const typeOf = CDBVS.typeOf;
  const viewForSheet = CDBVS.viewForSheet;
  const rowsForView = CDBVS.rowsForView;
  const selectedRowIndex = CDBVS.selectedRowIndex;
  const selectRow = CDBVS.selectRow;
  const separatorIndex = CDBVS.separatorIndex;
  const currentSheet = CDBVS.currentSheet;
  const visibleSheets = CDBVS.visibleSheets;
  const makeCellEditor = CDBVS.makeCellEditor;
  const addSheet = CDBVS.addSheet;
  const addColumn = CDBVS.addColumn;
  const insertSelectedRow = CDBVS.insertSelectedRow;
  const deleteSelectedRow = CDBVS.deleteSelectedRow;
  const openTypesEditor = CDBVS.openTypesEditor;
  const openColumnEditor = CDBVS.openColumnEditor;
  const openSheetEditor = CDBVS.openSheetEditor;
  const openFilterModal = CDBVS.openFilterModal;

  function activeViewItems(sheet) {
    if (!sheet) return [];
    const view = viewForSheet(sheet);
    const items = [];
    if (state.filter.trim()) {
      items.push({
        label: `Search: "${state.filter.trim()}"`,
        remove: () => { state.filter = ""; CDBVS.render(); }
      });
    }
    Object.keys(view.filters).forEach((columnName) => {
      const rule = view.filters[columnName];
      const column = (sheet.columns || []).find((item) => item.name === columnName);
      if (!column || !rule) return;
      const type = typeOf(column);
      let label = "";
      if (rule.min !== undefined || rule.max !== undefined) {
        const bounds = [];
        if (rule.min !== "" && rule.min !== undefined) bounds.push(`>= ${rule.min}`);
        if (rule.max !== "" && rule.max !== undefined) bounds.push(`<= ${rule.max}`);
        label = `${columnName} ${bounds.join(" and ")}`;
      } else if (type.code === 2) {
        label = `${columnName} = ${rule.value === "true" ? "True" : "False"}`;
      } else if (type.code === 5 && rule.value !== undefined) {
        label = `${columnName} = ${type.values[Number(rule.value)] || rule.value}`;
      } else if (type.code === 10 && rule.mask !== undefined) {
        label = `${columnName} flags mask ${rule.mask}`;
      } else if (rule.value !== undefined && String(rule.value) !== "") {
        label = `${columnName} contains "${rule.value}"`;
      }
      if (label) items.push({
        label,
        remove: () => {
          delete view.filters[columnName];
          CDBVS.render();
        }
      });
    });
    if (view.sort.column) items.push({
      label: `Sort: ${view.sort.column} (${view.sort.direction})`,
      remove: () => {
        view.sort.column = "";
        view.sort.direction = "asc";
        CDBVS.render();
      }
    });
    return items;
  }

  function renderViewSummary(container, sheet) {
    container.replaceChildren();
    const items = activeViewItems(sheet);
    if (!items.length) {
      container.appendChild(makeElement("span", "No search, filters, or sorting applied.", "view-summary-empty"));
      return;
    }
    items.forEach((item) => {
      const pill = makeElement("span", null, "view-pill");
      pill.appendChild(makeElement("span", item.label));
      const remove = makeButton("x", item.remove, "view-pill-remove");
      remove.title = `Remove ${item.label}`;
      remove.setAttribute("aria-label", `Remove ${item.label}`);
      pill.appendChild(remove);
      container.appendChild(pill);
    });
  }

  function cycleColumnSort(sheet, columnName) {
    const sort = viewForSheet(sheet).sort;
    if (sort.column !== columnName) {
      sort.column = columnName;
      sort.direction = "desc";
    } else if (sort.direction === "desc") {
      sort.direction = "asc";
    } else {
      sort.column = "";
      sort.direction = "asc";
    }
    CDBVS.render();
  }

  function renderSeparatorRows(body, sheet, rowIndex) {
    (sheet.separators || []).forEach((separator, separatorPosition) => {
      if (separatorIndex(separator) !== rowIndex) return;
      const row = document.createElement("tr");
      row.className = "separator-row";
      const cell = document.createElement("td");
      cell.colSpan = Math.max(1, (sheet.columns || []).length + 1);
      const props = sheet.props || {};
      const titles = Array.isArray(props.separatorTitles) ? props.separatorTitles : [];
      const title = separator && typeof separator === "object" && separator.title
        ? separator.title
        : titles[separatorPosition];
      cell.appendChild(makeElement("span", title || "Section", "separator-label"));
      row.appendChild(cell);
      body.appendChild(row);
    });
  }

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
        sendUpdate();
      } catch (error) {
        setStatus(`Invalid JSON: ${error.message}`, true);
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
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.appendChild(makeElement("th", "#", "row-number"));
    (sheet.columns || []).forEach((column, columnIndex) => {
      const th = document.createElement("th");
      if (typeOf(column).code === 0) th.classList.add("primary-id-column");
      const activeSort = viewForSheet(sheet).sort;
      const sortDirection = activeSort.column === column.name ? activeSort.direction : "";
      const sortButton = makeButton(
        sortDirection === "desc" ? "\u25BC" : (sortDirection === "asc" ? "\u25B2" : "\u2195"),
        () => cycleColumnSort(sheet, column.name),
        sortDirection ? "column-sort-button active" : "column-sort-button"
      );
      sortButton.title = sortDirection === "desc" ? `Sorted descending by ${column.name}` : (sortDirection === "asc" ? `Sorted ascending by ${column.name}` : `Sort by ${column.name}`);
      sortButton.setAttribute("aria-label", sortButton.title);
      const title = makeElement("div", null, "column-title");
      title.appendChild(makeElement("span", column.name || "?"));
      title.appendChild(makeButton("\u270E", () => openColumnEditor(sheet, column, columnIndex), "column-edit-button"));
      const header = makeElement("div", null, "column-header");
      header.appendChild(sortButton);
      header.appendChild(title);
      th.appendChild(header);
      headRow.appendChild(th);
    });
    head.appendChild(headRow);
    table.appendChild(head);
    const body = document.createElement("tbody");
    const rows = rowsForView(sheet);
    const selected = selectedRowIndex(sheet);
    rows.forEach(({ row, rowIndex }) => {
      renderSeparatorRows(body, sheet, rowIndex);
      const tr = document.createElement("tr");
      if (selected === rowIndex) tr.className = "row-selected";
      const rowCell = makeElement("td", null, "row-number");
      const rowSelect = makeButton(String(rowIndex + 1), () => {
        selectRow(sheet, rowIndex);
        CDBVS.render();
      }, "row-select");
      rowSelect.title = `Select row ${rowIndex + 1}`;
      rowSelect.setAttribute("aria-label", rowSelect.title);
      rowCell.appendChild(rowSelect);
      tr.appendChild(rowCell);
      (sheet.columns || []).forEach((column) => {
        const td = document.createElement("td");
        if (typeOf(column).code === 0) td.classList.add("primary-id-column");
        makeCellEditor(td, row, column, {
          sheet,
          rowIndex,
          path: `${sheet.name}/${rowIndex}`
        });
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    if (!rows.length) {
      const emptyRow = document.createElement("tr");
      const emptyCell = makeElement("td", "No rows match the current search and filters.", "empty");
      emptyCell.colSpan = Math.max(1, (sheet.columns || []).length + 1);
      emptyRow.appendChild(emptyCell);
      body.appendChild(emptyRow);
    }
    table.appendChild(body);
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);
  }

  function render() {
    rememberViewport();
    app.replaceChildren();
    const toolbar = makeElement("div", null, "toolbar");
    toolbar.appendChild(makeElement("strong", "CDBVS", "brand"));
    toolbar.appendChild(makeButton("+ Sheet", addSheet));
    toolbar.appendChild(makeButton("+ Column", () => addColumn(currentSheet())));
    const activeSheet = currentSheet();
    const insertButton = makeButton("Insert Row", () => insertSelectedRow(activeSheet));
    insertButton.disabled = !activeSheet;
    insertButton.title = "Insert a row below the selected row, or append a row if none is selected";
    toolbar.appendChild(insertButton);
    const deleteButton = makeButton("Delete Row", () => deleteSelectedRow(activeSheet), "danger-button");
    deleteButton.disabled = selectedRowIndex(activeSheet) === null;
    deleteButton.title = "Delete the selected row";
    toolbar.appendChild(deleteButton);
    toolbar.appendChild(makeButton("Types", openTypesEditor));
    toolbar.appendChild(makeButton("Table", () => { state.rawMode = false; render(); }, state.rawMode ? "button" : "button active"));
    toolbar.appendChild(makeButton("Raw JSON", () => { state.rawMode = true; render(); }, state.rawMode ? "button active" : "button"));
    app.appendChild(toolbar);

    const sheetsBar = makeElement("div", null, "sheets");
    visibleSheets().forEach((sheet, index) => {
      const tab = makeElement("div", null, index === state.sheetIndex ? "sheet-tab active" : "sheet-tab");
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
})(window);
