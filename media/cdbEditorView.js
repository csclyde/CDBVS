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
  const selectedCell = CDBVS.selectedCell;
  const cellErrorKey = CDBVS.cellErrorKey;
  const cellErrorsForSheet = CDBVS.cellErrorsForSheet;
  const selectRow = CDBVS.selectRow;
  const selectCell = CDBVS.selectCell;
  const separatorIndex = CDBVS.separatorIndex;
  const addSeparator = CDBVS.addSeparator;
  const removeSeparator = CDBVS.removeSeparator;
  const isSeparatorCollapsed = CDBVS.isSeparatorCollapsed;
  const toggleSeparatorCollapsed = CDBVS.toggleSeparatorCollapsed;
  const currentSheet = CDBVS.currentSheet;
  const visibleSheets = CDBVS.visibleSheets;
  const makeCellEditor = CDBVS.makeCellEditor;
  const addSheet = CDBVS.addSheet;
  const addColumn = CDBVS.addColumn;
  const insertSelectedRow = CDBVS.insertSelectedRow;
  const deleteSelectedRow = CDBVS.deleteSelectedRow;
  const deleteSelectedCell = CDBVS.deleteSelectedCell;
  const moveSelectedRow = CDBVS.moveSelectedRow;
  const moveSelectedCell = CDBVS.moveSelectedCell;
  const copySelectedRow = CDBVS.copySelectedRow;
  const pasteSelectedRow = CDBVS.pasteSelectedRow;
  const openTypesEditor = CDBVS.openTypesEditor;
  const openColumnEditor = CDBVS.openColumnEditor;
  const openNewColumnEditor = CDBVS.openNewColumnEditor;
  const moveColumn = CDBVS.moveColumn;
  const deleteColumn = CDBVS.deleteColumn;
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

  function editSeparatorTitle(sheet, separator, separatorPosition, titleSpan, label) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "separator-title-input";
    input.value = titleSpan.textContent || "Section";
    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      if (!save) {
        label.replaceChild(titleSpan, input);
        return;
      }
      const title = input.value.trim() || "Section";
      if (separator && typeof separator === "object") separator.title = title;
      else {
        if (!sheet.props || typeof sheet.props !== "object") sheet.props = {};
        if (!Array.isArray(sheet.props.separatorTitles)) sheet.props.separatorTitles = [];
        sheet.props.separatorTitles[separatorPosition] = title;
      }
      sendUpdate();
      CDBVS.render();
    };
    label.replaceChild(input, titleSpan);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
    input.focus();
    input.select();
  }

  function renderSeparatorRows(body, sheet, rowIndex) {
    (sheet.separators || []).forEach((separator, separatorPosition) => {
      const index = separatorIndex(separator);
      if (index !== rowIndex) return;
      const row = document.createElement("tr");
      row.className = "separator-row";
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        showSeparatorContextMenu(event, sheet, index);
      });
      const cell = document.createElement("td");
      cell.colSpan = Math.max(1, (sheet.columns || []).length + 1);
      const props = sheet.props || {};
      const titles = Array.isArray(props.separatorTitles) ? props.separatorTitles : [];
      const title = separator && typeof separator === "object" && separator.title
        ? separator.title
        : titles[separatorPosition];
      const collapsed = isSeparatorCollapsed(sheet, index);
      const label = makeElement("span", null, "separator-label");
      const toggle = makeButton(collapsed ? "\u25B6" : "\u25BC", () => {
        toggleSeparatorCollapsed(sheet, index);
        CDBVS.render();
      }, "separator-toggle");
      toggle.title = collapsed ? "Expand section" : "Collapse section";
      toggle.setAttribute("aria-label", toggle.title);
      toggle.setAttribute("aria-expanded", String(!collapsed));
      label.appendChild(toggle);
      const titleSpan = makeElement("span", title || "Section");
      titleSpan.title = "Double-click to edit section name";
      titleSpan.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        editSeparatorTitle(sheet, separator, separatorPosition, titleSpan, label);
      });
      label.appendChild(titleSpan);
      cell.appendChild(label);
      row.appendChild(cell);
      body.appendChild(row);
    });
  }

  function rowInCollapsedSection(sheet, rowIndex) {
    const indexes = (sheet.separators || []).map(separatorIndex).filter((index) => Number.isInteger(index)).sort((left, right) => left - right);
    let current = null;
    indexes.forEach((index) => { if (index <= rowIndex) current = index; });
    return current !== null && isSeparatorCollapsed(sheet, current);
  }

  function markRenderedRowSelected(rowElement) {
    document.querySelectorAll(".table-wrap tr[data-row-index].row-selected").forEach((row) => row.classList.remove("row-selected"));
    rowElement.classList.add("row-selected");
  }

  function selectRenderedRow(sheet, rowIndex, rowElement) {
    selectRow(sheet, rowIndex);
    document.querySelectorAll(".table-wrap td.cell-selected").forEach((cell) => cell.classList.remove("cell-selected"));
    markRenderedRowSelected(rowElement);
  }

  function selectRenderedCell(sheet, rowIndex, columnIndex, rowElement, cellElement) {
    selectCell(sheet, rowIndex, columnIndex);
    document.querySelectorAll(".table-wrap td.cell-selected").forEach((cell) => cell.classList.remove("cell-selected"));
    cellElement.classList.add("cell-selected");
    markRenderedRowSelected(rowElement);
  }

  let contextMenu = null;
  let contextMenuCleanup = null;

  function closeContextMenu() {
    if (contextMenuCleanup) contextMenuCleanup();
    contextMenuCleanup = null;
    if (contextMenu) contextMenu.remove();
    contextMenu = null;
  }

  function showContextMenu(event, items) {
    closeContextMenu();
    const menu = makeElement("div", null, "context-menu");
    menu.setAttribute("role", "menu");
    items.forEach((item) => {
      if (item.separator) {
        menu.appendChild(makeElement("div", null, "context-menu-separator"));
        return;
      }
      const button = makeButton(item.label, () => {
        closeContextMenu();
        item.action();
      }, "context-menu-item");
      button.setAttribute("role", "menuitem");
      button.disabled = item.disabled === true;
      menu.appendChild(button);
    });
    document.body.appendChild(menu);
    contextMenu = menu;
    const margin = 5;
    const left = Math.min(event.clientX, Math.max(margin, window.innerWidth - menu.offsetWidth - margin));
    const top = Math.min(event.clientY, Math.max(margin, window.innerHeight - menu.offsetHeight - margin));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    const closeIfOutside = (pointerEvent) => {
      if (!menu.contains(pointerEvent.target)) closeContextMenu();
    };
    contextMenuCleanup = () => document.removeEventListener("pointerdown", closeIfOutside);
    setTimeout(() => document.addEventListener("pointerdown", closeIfOutside), 0);
  }

  function showRowContextMenu(event, sheet, rowIndex) {
    const selected = selectedRowIndex(sheet);
    const rowCount = Array.isArray(sheet.lines) ? sheet.lines.length : 0;
    const hasSeparator = (sheet.separators || []).some((separator) => separatorIndex(separator) === rowIndex);
    showContextMenu(event, [
      { label: "Add Separator", action: () => addSeparator(sheet, rowIndex), disabled: hasSeparator },
      { separator: true },
      { label: "Insert row below", action: () => insertSelectedRow(sheet) },
      { label: "Delete row", action: () => deleteSelectedRow(sheet) },
      { separator: true },
      { label: "Move row up", action: () => moveSelectedRow(sheet, -1), disabled: selected === null || selected <= 0 },
      { label: "Move row down", action: () => moveSelectedRow(sheet, 1), disabled: selected === null || selected >= rowCount - 1 },
      { separator: true },
      { label: "Copy row", action: () => copySelectedRow(sheet, false) },
      { label: "Cut row", action: () => copySelectedRow(sheet, true) },
      { label: "Paste row below", action: () => pasteSelectedRow(sheet) }
    ]);
  }

  function showCellContextMenu(event, sheet) {
    showContextMenu(event, [
      { label: "Copy cell", action: () => copySelectedRow(sheet, false) },
      { label: "Cut cell", action: () => copySelectedRow(sheet, true) },
      { label: "Paste cell", action: () => pasteSelectedRow(sheet) },
      { separator: true },
      { label: "Clear cell", action: () => CDBVS.deleteSelectedCell(sheet) }
    ]);
  }

  function showColumnContextMenu(event, sheet, columnIndex) {
    const columnCount = Array.isArray(sheet.columns) ? sheet.columns.length : 0;
    showContextMenu(event, [
      { label: "Add column", action: () => openNewColumnEditor(sheet, columnIndex + 1) },
      { separator: true },
      { label: "Move column left", action: () => moveColumn(sheet, columnIndex, -1), disabled: columnIndex <= 0 },
      { label: "Move column right", action: () => moveColumn(sheet, columnIndex, 1), disabled: columnIndex >= columnCount - 1 },
      { separator: true },
      { label: "Delete column", action: () => deleteColumn(sheet, columnIndex) }
    ]);
  }

  function showSeparatorContextMenu(event, sheet, index) {
    showContextMenu(event, [
      { label: "Remove Separator", action: () => removeSeparator(sheet, index) }
    ]);
  }

  function commitEditorTarget(editorTarget) {
    if (!editorTarget || typeof editorTarget.dispatchEvent !== "function") return;
    editorTarget.dispatchEvent(new Event("change", { bubbles: false }));
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
      th.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        showColumnContextMenu(event, sheet, columnIndex);
      });
      headRow.appendChild(th);
    });
    head.appendChild(headRow);
    table.appendChild(head);
    const body = document.createElement("tbody");
    const rows = rowsForView(sheet);
    const selected = selectedRowIndex(sheet);
    const selectedCellValue = selectedCell(sheet);
    const cellErrors = cellErrorsForSheet(sheet);
    rows.forEach(({ row, rowIndex }) => {
      renderSeparatorRows(body, sheet, rowIndex);
      if (rowInCollapsedSection(sheet, rowIndex)) return;
      const tr = document.createElement("tr");
      tr.dataset.rowIndex = String(rowIndex);
      if (selected === rowIndex) tr.className = "row-selected";
      const rowCell = makeElement("td", null, "row-number");
      rowCell.addEventListener("click", () => selectRenderedRow(sheet, rowIndex, tr));
      rowCell.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        selectRenderedRow(sheet, rowIndex, tr);
        showRowContextMenu(event, sheet, rowIndex);
      });
      const rowSelect = makeButton(String(rowIndex + 1), () => {
        selectRenderedRow(sheet, rowIndex, tr);
      }, "row-select");
      rowSelect.title = `Select row ${rowIndex + 1}`;
      rowSelect.setAttribute("aria-label", rowSelect.title);
      rowCell.appendChild(rowSelect);
      tr.appendChild(rowCell);
      (sheet.columns || []).forEach((column, columnIndex) => {
        const td = document.createElement("td");
        if (typeOf(column).code === 0) td.classList.add("primary-id-column");
        td.dataset.columnIndex = String(columnIndex);
        const errors = cellErrors[cellErrorKey(rowIndex, column.name)] || [];
        if (errors.length) {
          td.classList.add("cell-error");
          td.title = errors.map((error) => error.message).join("\n");
          td.setAttribute("aria-invalid", "true");
          td.dataset.errorMessage = td.title;
        }
        if (selectedCellValue && selectedCellValue.rowIndex === rowIndex && selectedCellValue.columnIndex === columnIndex) td.classList.add("cell-selected");
        td.addEventListener("click", (event) => {
          if (!event.target.closest || event.target.closest("tr") !== tr) return;
          selectRenderedCell(sheet, rowIndex, columnIndex, tr, td);
        });
        td.addEventListener("contextmenu", (event) => {
          if (!event.target.closest || event.target.closest("tr") !== tr) return;
          event.preventDefault();
          selectRenderedCell(sheet, rowIndex, columnIndex, tr, td);
          showCellContextMenu(event, sheet);
        });
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

    const horizontalScroll = makeElement("div", null, "horizontal-scroll-dock");
    horizontalScroll.setAttribute("aria-label", "Horizontal sheet scroll");
    const horizontalScrollContent = makeElement("div", null, "horizontal-scroll-content");
    horizontalScroll.appendChild(horizontalScrollContent);
    const updateHorizontalScrollSize = () => {
      const tableWidth = Math.max(
        table.scrollWidth,
        table.offsetWidth,
        Math.ceil(table.getBoundingClientRect().width),
        tableWrap.scrollWidth
      );
      horizontalScrollContent.style.width = `${Math.max(tableWidth, tableWrap.clientWidth)}px`;
    };
    const syncTableToHorizontalScroll = () => {
      if (horizontalScroll.scrollLeft !== tableWrap.scrollLeft) horizontalScroll.scrollLeft = tableWrap.scrollLeft;
    };
    const syncHorizontalScrollToTable = () => {
      if (tableWrap.scrollLeft !== horizontalScroll.scrollLeft) tableWrap.scrollLeft = horizontalScroll.scrollLeft;
    };
    tableWrap.addEventListener("scroll", syncTableToHorizontalScroll);
    horizontalScroll.addEventListener("scroll", syncHorizontalScrollToTable);
    if (typeof ResizeObserver === "function") new ResizeObserver(updateHorizontalScrollSize).observe(table);
    requestAnimationFrame(updateHorizontalScrollSize);
    container.appendChild(horizontalScroll);
  }

  function render() {
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

  document.addEventListener("keydown", (event) => {
    if (document.querySelector(".text-modal-overlay")) return;
    const sheet = currentSheet();
    const key = String(event.key || "").toLowerCase();
    if (key === "escape" && contextMenu) {
      event.preventDefault();
      closeContextMenu();
      return;
    }
    const modified = event.ctrlKey || event.metaKey;
    const editorTarget = event.target && event.target.closest && event.target.closest("input, textarea, select, [contenteditable=\"true\"]");
    const cellSelection = selectedCell(sheet);
    const arrowKey = key === "arrowup" || key === "arrowdown" || key === "arrowleft" || key === "arrowright";
    const clipboardKey = key === "c" || key === "x" || key === "v";
    const deleteKey = key === "delete" || key === "del";
    if (editorTarget && !((!modified && (arrowKey || deleteKey) && cellSelection) || (modified && clipboardKey && cellSelection))) return;
    if (!modified && !event.altKey && cellSelection && arrowKey) {
      event.preventDefault();
      commitEditorTarget(editorTarget);
      moveSelectedCell(sheet,
        key === "arrowup" ? -1 : (key === "arrowdown" ? 1 : 0),
        key === "arrowleft" ? -1 : (key === "arrowright" ? 1 : 0));
      return;
    }
    if (!modified && !event.altKey) {
      if (key === "insert") {
        event.preventDefault();
        insertSelectedRow(sheet);
        return;
      }
      if (deleteKey) {
        event.preventDefault();
        if (cellSelection) {
          commitEditorTarget(editorTarget);
          deleteSelectedCell(sheet);
        } else {
          deleteSelectedRow(sheet);
        }
        return;
      }
    }
    if (!modified) return;
    if (key === "c" || key === "x") {
      if (selectedRowIndex(sheet) === null) return;
      event.preventDefault();
      commitEditorTarget(editorTarget);
      copySelectedRow(sheet, key === "x");
      return;
    }
    if (key === "v") {
      if (!sheet) return;
      event.preventDefault();
      commitEditorTarget(editorTarget);
      pasteSelectedRow(sheet);
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (selectedRowIndex(sheet) === null) return;
    event.preventDefault();
    moveSelectedRow(sheet, event.key === "ArrowUp" ? -1 : 1);
  });

  CDBVS.render = render;
})(window);
