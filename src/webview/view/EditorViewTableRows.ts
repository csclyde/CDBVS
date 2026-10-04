// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const application = CDBVS.services.application;
  const sheetState = CDBVS.services.sheetState;
  const sheetViewState = sheetState.view;
  const tableCapabilities = CDBVS.capabilities.table;
  const sheetView = CDBVS.services.sheetView;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const persistMutation = application.persistMutation;
  const updateSeparatorTitle = CDBVS.updateSeparatorTitle;

  function separatorIndexes(sheet) {
    return (sheet && Array.isArray(sheet.separators) ? sheet.separators : [])
      .map((separator) => CDBVS.separatorIndex(separator))
      .filter((index) => Number.isInteger(index))
      .sort((left, right) => left - right);
  }

  // Section collapse is view-only state. Updating it locally keeps the table,
  // focus, and scroll container alive instead of routing through the global
  // renderer and replacing the whole webview.
  function updateRenderedSeparatorSection(sheet, index, collapsed, body) {
    const targetBody = body || (CDBVS.app && CDBVS.app.querySelector
      ? CDBVS.app.querySelector(".table-wrap tbody") : null);
    if (!targetBody || !targetBody.querySelectorAll) return false;

    const nextIndex = separatorIndexes(sheet).find((separatorIndex) => separatorIndex > index);
    targetBody.querySelectorAll("tr").forEach((row) => {
      if (!row.dataset || row.dataset.rowIndex === undefined) return;
      const rowIndex = Number.parseInt(row.dataset.rowIndex, 10);
      const inSection = rowIndex >= index && (nextIndex === undefined || rowIndex < nextIndex);
      if (!inSection) return;
      row.hidden = collapsed;
    });

    targetBody.querySelectorAll(".separator-row").forEach((row) => {
      if (!row.dataset || row.dataset.separatorIndex !== String(index)) return;
      const toggle = row.querySelector && row.querySelector(".separator-toggle");
      if (!toggle) return;
      toggle.textContent = collapsed ? "\u25B6" : "\u25BC";
      toggle.title = collapsed ? "Expand section" : "Collapse section";
      toggle.setAttribute("aria-label", toggle.title);
      toggle.setAttribute("aria-expanded", String(!collapsed));
    });
    return true;
  }

  function editSeparatorTitle(sheet, separator, separatorPosition, titleSpan, label, currentTitle) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "separator-title-input";
    input.value = currentTitle || "";
    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      if (!save) {
        label.replaceChild(titleSpan, input);
        return;
      }
      const title = input.value.trim();
      const result = persistMutation(() => updateSeparatorTitle(sheet, separatorPosition, title));
      if (result !== false) {
        titleSpan.textContent = title;
        label.replaceChild(titleSpan, input);
      }
    };
    label.replaceChild(input, titleSpan);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); finish(true); }
      else if (event.key === "Escape") { event.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
    input.focus();
    input.select();
  }

  function renderSeparatorRows(body, sheet, rowIndex, positions) {
    const separatorPositions = Array.isArray(positions) ? positions : (sheet.separators || []).map((_, index) => index);
    separatorPositions.forEach((separatorPosition) => {
      const separator = (sheet.separators || [])[separatorPosition];
      const index = CDBVS.separatorIndex(separator);
      const row = document.createElement("tr");
      row.className = "separator-row";
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        CDBVS.showSeparatorContextMenu(event, sheet, index);
      });
      const cell = document.createElement("td");
      cell.colSpan = Math.max(1, (sheet.columns || []).length + 1);
      const props = sheet.props || {};
      const titles = Array.isArray(props.separatorTitles) ? props.separatorTitles : [];
      const titleValue = separator && typeof separator === "object" && separator.title !== undefined
        ? String(separator.title).trim() : (titles[separatorPosition] === undefined || titles[separatorPosition] === null
          ? "" : String(titles[separatorPosition]).trim());
      const collapsed = sheetViewState.isSeparatorCollapsed(sheet.name, index);
      const label = makeElement("span", null, "separator-label");
      const toggleSeparator = () => {
        const active = typeof CDBVS.activeCell === "function" ? CDBVS.activeCell(sheet) : null;
        const nextIndex = separatorIndexes(sheet).find((separatorIndex) => separatorIndex > index);
        if (active && active.rowIndex >= index && (nextIndex === undefined || active.rowIndex < nextIndex)
          && typeof CDBVS.exitRenderedCell === "function") {
          if (!CDBVS.exitRenderedCell(sheet, false)) return;
        }
        const nextCollapsed = sheetViewState.toggleSeparatorCollapsed(sheet.name, index);
        if (nextCollapsed) {
          const inSection = (rowIndex) => rowIndex >= index && (nextIndex === undefined || rowIndex < nextIndex);
          const selectedCell = CDBVS.selectedCell(sheet);
          const selectedRows = CDBVS.selectedRowIndices(sheet);
          if (selectedRows.some(inSection)) {
            CDBVS.selectRows(sheet, selectedRows.filter((rowIndex) => !inSection(rowIndex)));
            CDBVS.updateRenderedSelection(sheet, selectedCell, null);
            CDBVS.markRenderedRowSelected();
          }
        }
        updateRenderedSeparatorSection(sheet, index, nextCollapsed, body);
      };
      const toggle = makeButton(collapsed ? "\u25B6" : "\u25BC", toggleSeparator, "separator-toggle");
      toggle.title = collapsed ? "Expand section" : "Collapse section";
      toggle.setAttribute("aria-label", toggle.title);
      toggle.setAttribute("aria-expanded", String(!collapsed));
      label.appendChild(toggle);
      const titleSpan = makeElement("span", titleValue, "separator-title");
      titleSpan.title = "Double-click to edit section name";
      titleSpan.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        editSeparatorTitle(sheet, separator, separatorPosition, titleSpan, label, titleValue);
      });
      label.appendChild(titleSpan);
      row.addEventListener("dblclick", (event) => {
        const target = event.target;
        if (target && typeof target.closest === "function" && target.closest(".separator-title, .separator-title-input")) return;
        event.preventDefault();
        toggleSeparator();
      });
      cell.appendChild(label);
      row.dataset.separatorIndex = String(index);
      row.appendChild(cell);
      body.appendChild(row);
    });
  }

  function prepareTableBody(sheet) {
    CDBVS.reconcileVisibleSelection(sheet);
    const rows = sheetView.rowsForView(sheet);
    const separatorPositionsByIndex = new Map();
    const separatorIndexes = [];
    (sheet.separators || []).forEach((separator, separatorPosition) => {
      const index = CDBVS.separatorIndex(separator);
      if (!Number.isInteger(index)) return;
      const positions = separatorPositionsByIndex.get(index) || [];
      positions.push(separatorPosition);
      separatorPositionsByIndex.set(index, positions);
      separatorIndexes.push(index);
    });
    separatorIndexes.sort((left, right) => left - right);
    const separatorRows = new Map();
    separatorPositionsByIndex.forEach((positions, index) => {
      const nextIndex = separatorIndexes.find((separatorIndex) => separatorIndex > index);
      const firstMatch = rows.find((entry) => (
        entry.rowIndex >= index && (nextIndex === undefined || entry.rowIndex < nextIndex)
      ));
      if (!firstMatch) return;
      const projected = separatorRows.get(firstMatch.rowIndex) || [];
      projected.push(...positions);
      separatorRows.set(firstMatch.rowIndex, projected);
    });
    return {
      rows,
      separatorRows,
      separatorIndexes,
      selected: CDBVS.selectedRowIndices(sheet),
      selectedCellValue: CDBVS.selectedCell(sheet),
      cellErrors: CDBVS.cellErrorsForSheet(sheet)
    };
  }

  function collapsedSectionForRow(sheet, separatorIndexes, rowIndex) {
    let low = 0;
    let high = separatorIndexes.length - 1;
    let last = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (separatorIndexes[middle] <= rowIndex) { last = separatorIndexes[middle]; low = middle + 1; }
      else high = middle - 1;
    }
    return last !== null && sheetViewState.isSeparatorCollapsed(sheet.name, last);
  }

  function appendTableRow(body, sheet, entry, renderContext) {
    const { row, rowIndex } = entry;
    const { separatorRows, separatorIndexes, selected, selectedCellValue, cellErrors } = renderContext;
    const separators = separatorRows.get(rowIndex);
    if (separators) renderSeparatorRows(body, sheet, rowIndex, separators);
    const tr = document.createElement("tr");
    tr.dataset.rowIndex = String(rowIndex);
    const collapsed = collapsedSectionForRow(sheet, separatorIndexes, rowIndex);
    tr.hidden = collapsed;
    if (selected.includes(rowIndex)) tr.className = "row-selected";
    const rowCell = makeElement("td", null, "row-number");
    rowCell.title = "Double-click to edit this row";
    rowCell.addEventListener("click", (event) => CDBVS.selectRenderedRow(sheet, rowIndex, tr, event));
    rowCell.addEventListener("dblclick", (event) => { event.preventDefault(); CDBVS.openRowEditor(sheet, rowIndex); });
    rowCell.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (!CDBVS.isRowSelected(sheet, rowIndex)) CDBVS.selectRenderedRow(sheet, rowIndex, tr);
      CDBVS.showRowContextMenu(event, sheet, rowIndex);
    });
    const rowSelect = makeButton(String(rowIndex + 1), (event) => {
      event.stopPropagation();
      CDBVS.selectRenderedRow(sheet, rowIndex, tr, event);
    }, "row-select");
    rowSelect.title = `Select row ${rowIndex + 1}`;
    rowSelect.setAttribute("aria-label", rowSelect.title);
    rowCell.appendChild(rowSelect);
    tr.appendChild(rowCell);
    (sheet.columns || []).forEach((column, columnIndex) => {
      tr.appendChild(tableCapabilities.renderCell(sheet, row, rowIndex, column, columnIndex, tr, cellErrors, selectedCellValue));
    });
    body.appendChild(tr);
  }

  function appendEmptyTableRow(body, sheet) {
    const emptyRow = document.createElement("tr");
    const empty = !sheet.lines || !sheet.lines.length;
    const emptyCell = makeElement("td", empty ? "No rows yet. Use + Row to add your first row." : "No rows match the current search and filters.", "empty");
    if (!empty) {
      const clear = makeButton("Clear search and filters", () => {
        if (!CDBVS.prepareCellTransition()) return;
        CDBVS.services.viewState.setFilter("");
        sheetViewState.setFilters(sheet.name, {});
        const firstRow = sheetView.rowsForNavigation(sheet)[0];
        if (firstRow) {
          if (sheet.columns && sheet.columns.length) CDBVS.selectCell(sheet, firstRow.rowIndex, 0);
          else CDBVS.selectRow(sheet, firstRow.rowIndex);
        }
        CDBVS.refreshView({ focusSelection: true });
        CDBVS.setStatus("Search and filters cleared.");
      }, "button empty-view-reset");
      emptyCell.appendChild(clear);
    }
    emptyCell.colSpan = Math.max(1, (sheet.columns || []).length + 1);
    emptyRow.appendChild(emptyCell);
    body.appendChild(emptyRow);
  }

  function renderTableBody(sheet) {
    const body = document.createElement("tbody");
    const renderContext = prepareTableBody(sheet);
    renderContext.rows.forEach((entry) => appendTableRow(body, sheet, entry, renderContext));
    if (!renderContext.rows.length) appendEmptyTableRow(body, sheet);
    return body;
  }

  function timeNow() {
    return global.performance && typeof global.performance.now === "function"
      ? global.performance.now() : Date.now();
  }

  function renderTableBodyProgressive(body, sheet, options) {
    const config = options || {};
    const frameBudget = Number.isFinite(config.frameBudget) ? Math.max(1, config.frameBudget) : 6;
    let cancelled = false;
    let timer = null;
    let frame = null;
    let renderContext = null;
    let cursor = 0;

    const requestFrame = (callback) => {
      if (typeof global.requestAnimationFrame === "function") return global.requestAnimationFrame(callback);
      return global.setTimeout(callback, 0);
    };
    const schedule = (callback, initial) => {
      if (cancelled) return;
      if (initial && typeof global.setTimeout === "function") {
        timer = global.setTimeout(() => {
          timer = null;
          if (!cancelled) frame = requestFrame(callback);
        }, 0);
      } else frame = requestFrame(callback);
    };
    const complete = () => {
      if (cancelled) return;
      if (!renderContext.rows.length) appendEmptyTableRow(body, sheet);
      if (typeof config.onComplete === "function") config.onComplete();
    };
    const renderChunk = () => {
      if (cancelled) return;
      if (!renderContext) renderContext = prepareTableBody(sheet);
      const deadline = timeNow() + frameBudget;
      let rendered = 0;
      while (cursor < renderContext.rows.length && (rendered === 0 || timeNow() < deadline)) {
        appendTableRow(body, sheet, renderContext.rows[cursor], renderContext);
        cursor += 1;
        rendered += 1;
      }
      if (cursor < renderContext.rows.length) schedule(renderChunk, false);
      else complete();
    };

    schedule(renderChunk, true);
    return () => {
      cancelled = true;
      if (timer !== null && typeof global.clearTimeout === "function") global.clearTimeout(timer);
      if (frame !== null && typeof global.cancelAnimationFrame === "function") global.cancelAnimationFrame(frame);
      timer = null;
      frame = null;
    };
  }

  CDBVS.capabilities.table.renderBody = renderTableBody;
  CDBVS.capabilities.table.renderBodyProgressive = renderTableBodyProgressive;
  CDBVS.renderTableBody = renderTableBody;
  CDBVS.renderTableBodyProgressive = renderTableBodyProgressive;
  CDBVS.updateRenderedSeparatorSection = updateRenderedSeparatorSection;
})(window);
