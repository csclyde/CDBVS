// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const sheetView = CDBVS.services.sheetView;
  function renderedRoot() {
    const app = CDBVS.app;
    return app && typeof app.querySelectorAll === "function" ? app : document;
  }

  function markRenderedRowSelected() {
    const sheet = sheetView.currentSheet();
    renderedRoot().querySelectorAll(".table-wrap tr").forEach((row) => {
      if (CDBVS.isRowSelected(sheet, Number.parseInt(row.dataset.rowIndex, 10))) row.classList.add("row-selected");
      else row.classList.remove("row-selected");
    });
  }

  function isGridUpdating() {
    const wrap = CDBVS.app && CDBVS.app.querySelector(".table-wrap");
    return !!wrap && wrap.getAttribute("aria-busy") === "true";
  }

  function navigationRows(sheet) {
    if (sheet !== sheetView.currentSheet() || !CDBVS.app) return sheetView.rowsForNavigation(sheet);
    const body = CDBVS.app.querySelector(".table-wrap tbody");
    if (!body) return sheetView.rowsForNavigation(sheet);
    if (isGridUpdating()) return [];
    // The displayed order stays stable during editing, even if a live draft
    // changes the sort key. Navigate that order until the view is refreshed.
    return Array.from(body.children).filter((row) => !row.hidden && row.dataset.rowIndex !== undefined)
      .map((row) => ({ rowIndex: Number(row.dataset.rowIndex), row: sheet.lines[Number(row.dataset.rowIndex)] }));
  }

  function findRenderedRow(rowIndex) {
    return Array.from(renderedRoot().querySelectorAll(".table-wrap tr"))
      .filter((row) => !row.hidden && row.dataset && row.dataset.rowIndex !== undefined)
      .find((row) => Number.parseInt(row.dataset.rowIndex, 10) === rowIndex) || null;
  }

  function findRenderedCell(rowIndex, columnIndex) {
    const row = findRenderedRow(rowIndex);
    if (!row) return null;
    return Array.from(row.children).find((cell) => Number.parseInt(cell.dataset && cell.dataset.columnIndex, 10) === columnIndex) || null;
  }

  function applyCellErrors(cell, errors, fallbackTitle) {
    if (errors.length) {
      cell.classList.add("cell-error");
      cell.title = errors.map((error) => error.message).join("\n");
      cell.setAttribute("aria-invalid", "true");
      cell.dataset.errorMessage = cell.title;
    } else {
      cell.classList.remove("cell-error");
      cell.setAttribute("aria-invalid", "false");
      delete cell.dataset.errorMessage;
      cell.title = fallbackTitle;
    }
  }

  function refreshRenderedCell(sheet, rowIndex, columnIndex) {
    if (!sheet || !Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return false;
    const cell = findRenderedCell(rowIndex, columnIndex);
    if (!cell) return false;
    const column = (sheet.columns || [])[columnIndex];
    if (!column) return false;
    const errorsForSheet = CDBVS.cellErrorsForSheet(sheet);
    const idTitle = "Click to select; Enter or F2 to edit. Double-click the row number to edit the row.";
    applyCellErrors(cell, errorsForSheet[CDBVS.cellErrorKey(rowIndex, column.name)] || [], CDBVS.typeOf(column).code === 0 ? idTitle : "");
    if (CDBVS.typeOf(column).code === 0) {
      renderedRoot().querySelectorAll(".table-wrap tr").forEach((row) => {
        const renderedRowIndex = Number.parseInt(row.dataset.rowIndex, 10);
        const idCell = Array.from(row.children).find((item) => Number.parseInt(item.dataset && item.dataset.columnIndex, 10) === columnIndex);
        if (idCell && renderedRowIndex !== rowIndex) {
          const otherErrors = errorsForSheet[CDBVS.cellErrorKey(renderedRowIndex, column.name)] || [];
          applyCellErrors(idCell, otherErrors, idTitle);
        }
      });
    }
    return true;
  }

  function updateRenderedSelection(sheet, previous, next) {
    if (previous && (previous.rowIndex !== next?.rowIndex || previous.columnIndex !== next?.columnIndex)) {
      const previousCell = findRenderedCell(previous.rowIndex, previous.columnIndex);
      if (previousCell) {
        previousCell.classList.remove("cell-selected", "cell-active");
        previousCell.tabIndex = -1;
        previousCell.setAttribute("aria-selected", "false");
      }
      const previousRow = findRenderedRow(previous.rowIndex);
      if (previousRow) previousRow.classList.remove("row-selected");
    }
    if (next) {
      const nextCell = findRenderedCell(next.rowIndex, next.columnIndex);
      if (nextCell) {
        nextCell.classList.add("cell-selected");
        nextCell.tabIndex = 0;
        nextCell.setAttribute("aria-selected", "true");
        if (typeof nextCell.focus === "function") nextCell.focus({ preventScroll: true });
        if (typeof nextCell.scrollIntoView === "function") nextCell.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      const nextRow = findRenderedRow(next.rowIndex);
      if (nextRow) nextRow.classList.add("row-selected");
    }
    updateCellModeHint();
    return true;
  }

  function updateCellModeHint() {
    const hint = renderedRoot().querySelector(".cell-mode-hint");
    if (!hint) return;
    if (isGridUpdating()) { hint.textContent = "Updating rows — cell editing resumes when the view is ready"; return; }
    const sheet = sheetView.currentSheet();
    const selection = CDBVS.selectedCell(sheet);
    const active = CDBVS.activeCell(sheet);
    if (selection) {
      const type = CDBVS.typeOf(selection.column).code;
      const location = `${selection.column.name} · Row ${selection.rowIndex + 1}`;
      hint.textContent = active
        ? `Editing ${location} — Enter: apply · Escape: cancel · Tab: apply and move`
        : `Selected ${location} — ${type === 2 ? "Enter: toggle" : (type === 8 || type === 17 ? "Enter: open" : "Enter or F2: edit")} · Arrows: move`;
    } else {
      const rows = CDBVS.selectedRowIndices(sheet);
      hint.textContent = rows.length ? `${rows.length} row${rows.length === 1 ? "" : "s"} selected — Shift-click: range · Ctrl/Cmd-click: add or remove`
        : "Click a cell to select · Click again or press Enter to edit";
    }
  }

  function commitCellEditors(cell) {
    if (!cell) return true;
    const controls = Array.from(cell.querySelectorAll("input, textarea, select"));
    for (const control of controls) {
      if (typeof control._cdbvsValidate === "function" && !control._cdbvsValidate()) {
        if (typeof control.focus === "function") control.focus();
        return false;
      }
    }
    for (const control of controls) {
      if (CDBVS.commitEditorTarget(control) === false) {
        if (typeof control.focus === "function") control.focus();
        return false;
      }
    }
    return true;
  }

  function prepareCellTransition() {
    const sheet = sheetView.currentSheet();
    if (!CDBVS.activeCell(sheet)) return true;
    return exitRenderedCell(sheet, false, false);
  }

  function cancelRenderedCell(sheet) {
    const active = CDBVS.activeCell(sheet);
    if (!active) return false;
    const cell = findRenderedCell(active.rowIndex, active.columnIndex);
    if (typeof CDBVS.closeSelectMenu === "function") CDBVS.closeSelectMenu();
    if (cell) {
      cell.querySelectorAll("input, textarea, select").forEach((control) => {
        if (typeof control._cdbvsCancel === "function") control._cdbvsCancel();
      });
      cell.classList.remove("cell-active");
      cell.focus({ preventScroll: true });
    }
    CDBVS.deactivateCell(sheet);
    CDBVS.setStatus("Cell edit cancelled.");
    updateCellModeHint();
    return true;
  }

  // Commit before an outside action can change the view/schema. Invalid
  // drafts keep focus and block that action; native gestures inside cells and
  // dropdown/modal interactions use their own transition handlers.
  function guardOutsideCellAction(event) {
    const target = event.target;
    const app = CDBVS.app;
    if (!app || !target || !app.contains(target) || !target.closest) return;
    if (target.closest("td") || target.closest(".cell-select-menu") || target.closest(".text-modal-overlay")) return;
    if (!prepareCellTransition()) {
      event.preventDefault();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
      else if (typeof event.stopPropagation === "function") event.stopPropagation();
    }
  }
  document.addEventListener("mousedown", guardOutsideCellAction, true);
  document.addEventListener("click", guardOutsideCellAction, true);

  function captureCellDrafts() {
    const drafts = [];
    const sheet = sheetView.currentSheet();
    const active = CDBVS.activeCell(sheet);
    const cell = active && findRenderedCell(active.rowIndex, active.columnIndex);
    if (cell) cell.querySelectorAll("input, textarea, select").forEach((control) => {
      const draft = typeof control._cdbvsDraft === "function" && control._cdbvsDraft();
      if (draft) drafts.push(draft);
    });
    let overlay = CDBVS.modalState && CDBVS.modalState.active;
    while (overlay) {
      if (typeof overlay._cdbvsDrafts === "function") drafts.push(...overlay._cdbvsDrafts());
      overlay = overlay._cdbvsPrevious;
    }
    const raw = renderedRoot().querySelector(".raw-editor");
    if (raw && raw.value !== CDBVS.documentText()) drafts.push({ label: "Raw JSON draft", text: raw.value });
    else if (CDBVS.state.rawDraft) drafts.push({ label: "Raw JSON draft", text: CDBVS.state.rawDraft.text });
    return drafts.filter((draft, index) => drafts.findIndex((other) => other.label === draft.label && other.text === draft.text) === index);
  }

  function activateEditorInCell(cell, sheet, event, onClose) {
    if (!cell) return true;
    const controls = Array.from(cell.querySelectorAll("input, select, textarea, button"));
    const control = controls.find((item) => item.classList && item.classList.contains("list-toggle"))
      || controls.find((item) => item.tagName === "INPUT" || item.tagName === "SELECT" || item.tagName === "TEXTAREA" || item.tagName === "BUTTON");
    if (!control) return true;
    if (typeof control._cdbvsActivateLazyEditor === "function") {
      control._cdbvsActivateLazyEditor();
      return activateEditorInCell(cell, sheet, event, onClose);
    }
    const directControlClick = CDBVS.isControlTarget(event && event.target, control);
    cell.querySelectorAll("input, textarea, select").forEach((item) => {
      if (typeof item._cdbvsBeginEdit === "function") item._cdbvsBeginEdit();
    });
    if (typeof control.focus === "function") control.focus();
    if (control.tagName === "SELECT") {
      const opened = CDBVS.openSelectMenu(control, sheet, onClose);
      if (!opened && typeof CDBVS.exitRenderedCell === "function") CDBVS.exitRenderedCell(sheet);
    } else if (control.classList && control.classList.contains("list-toggle")) {
      if (typeof cell._cdbvsToggleList === "function") {
        if (cell._cdbvsToggleList() === false) {
          CDBVS.deactivateCell(sheet);
          cell.classList.remove("cell-active");
          cell.focus({ preventScroll: true });
          return false;
        }
      }
      else CDBVS.clickControl(control);
    } else if (!directControlClick && control.tagName === "INPUT" && control.type === "color" && typeof control.showPicker === "function") {
      try { control.showPicker(); } catch (_) {}
    } else if (!directControlClick && typeof control.setSelectionRange === "function") {
      try { control.setSelectionRange(String(control.value || "").length, String(control.value || "").length); } catch (_) {}
    }
    if (control.classList && control.classList.contains("list-toggle") && !document.querySelector(".text-modal-overlay") && typeof cell.focus === "function") {
      cell.focus({ preventScroll: true });
    }
    return true;
  }

  function activateRenderedCell(sheet, rowIndex, columnIndex, event) {
    if (isGridUpdating()) return false;
    const cell = findRenderedCell(rowIndex, columnIndex);
    if (!cell) return false;
    if (cell && typeof cell._cdbvsToggleBoolean === "function") return cell._cdbvsToggleBoolean(event);
    if (!CDBVS.activateCell(sheet, rowIndex, columnIndex)) return false;
    cell.classList.add("cell-active");
    const result = activateEditorInCell(cell, sheet, event);
    updateCellModeHint();
    return result;
  }

  function exitEditorInCell(cell, sheet, focusTarget, collapseList) {
    if (!cell) return false;
    if (typeof CDBVS.closeSelectMenu === "function") CDBVS.closeSelectMenu();
    const focused = document.activeElement;
    const focusedInCell = focused && typeof cell.contains === "function" && cell.contains(focused);
    if (!commitCellEditors(cell)) return false;
    if (focusedInCell && typeof focused.blur === "function") focused.blur();
    CDBVS.deactivateCell(sheet);
    cell.classList.remove("cell-active");
    updateCellModeHint();
    if (collapseList) {
      const toggle = cell.querySelector(".list-toggle.expanded");
      if (toggle) {
        if (typeof cell._cdbvsToggleList === "function") cell._cdbvsToggleList();
        else CDBVS.clickControl(toggle);
      }
    }
    const nextFocusTarget = typeof focusTarget === "function" ? focusTarget() : focusTarget;
    if (nextFocusTarget && typeof nextFocusTarget.focus === "function") nextFocusTarget.focus({ preventScroll: true });
    return true;
  }

  function exitRenderedCell(sheet, collapseList = true, restoreFocus = true) {
    const active = CDBVS.activeCell(sheet);
    if (!active) return false;
    const cell = findRenderedCell(active.rowIndex, active.columnIndex);
    return exitEditorInCell(cell, sheet, restoreFocus ? cell : null, collapseList);
  }

  function selectRenderedRow(sheet, rowIndex, rowElement, event) {
    if (isGridUpdating()) return false;
    const previous = CDBVS.selectedCell(sheet);
    if (CDBVS.activeCell(sheet) && !CDBVS.exitRenderedCell(sheet, false)) return false;
    if (event && (event.shiftKey || event.ctrlKey || event.metaKey)) CDBVS.selectRowWithModifiers(sheet, rowIndex, event);
    else CDBVS.selectRow(sheet, rowIndex);
    CDBVS.updateRenderedSelection(sheet, previous, null);
    markRenderedRowSelected(rowElement);
    updateCellModeHint();
    const focusRow = rowElement || findRenderedRow(rowIndex);
    const rowControl = focusRow && focusRow.querySelector(".row-select");
    if (rowControl) rowControl.focus({ preventScroll: true });
  }

  function selectRenderedCell(sheet, rowIndex, columnIndex, rowElement, cellElement) {
    if (isGridUpdating()) return false;
    const previous = CDBVS.selectedCell(sheet);
    if (CDBVS.activeCell(sheet) && !CDBVS.exitRenderedCell(sheet, false)) return false;
    CDBVS.selectCell(sheet, rowIndex, columnIndex);
    CDBVS.updateRenderedSelection(sheet, previous, CDBVS.selectedCell(sheet));
    if (cellElement && !cellElement.classList.contains("cell-selected")) cellElement.classList.add("cell-selected");
    markRenderedRowSelected(rowElement);
  }

  Object.assign(CDBVS, {
    renderedRoot, findRenderedRow, findRenderedCell, refreshRenderedCell, updateRenderedSelection, markRenderedRowSelected,
    updateCellModeHint, commitCellEditors, prepareCellTransition, cancelRenderedCell,
    captureCellDrafts,
    isGridUpdating, navigationRows,
    activateEditorInCell, exitEditorInCell, activateRenderedCell, exitRenderedCell, selectRenderedRow, selectRenderedCell,
    // Selection, rendering, and custom select-menu behavior are intentionally
    // exposed as separate runtime capabilities.
  });
})(window);
