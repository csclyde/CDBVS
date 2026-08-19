// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  function renderedRoot() {
    const app = CDBVS.app;
    return app && typeof app.querySelectorAll === "function" ? app : document;
  }

  function markRenderedRowSelected() {
    const sheet = CDBVS.sheetViewModel.currentSheet();
    renderedRoot().querySelectorAll(".table-wrap tr").forEach((row) => {
      if (CDBVS.isRowSelected(sheet, Number.parseInt(row.dataset.rowIndex, 10))) row.classList.add("row-selected");
      else row.classList.remove("row-selected");
    });
  }

  function findRenderedRow(rowIndex) {
    return Array.from(renderedRoot().querySelectorAll(".table-wrap tr"))
      .filter((row) => row.dataset && row.dataset.rowIndex !== undefined)
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
    applyCellErrors(cell, errorsForSheet[CDBVS.cellErrorKey(rowIndex, column.name)] || [], CDBVS.typeOf(column).code === 0 ? "Double-click to edit this row" : "");
    if (CDBVS.typeOf(column).code === 0) {
      renderedRoot().querySelectorAll(".table-wrap tr").forEach((row) => {
        const renderedRowIndex = Number.parseInt(row.dataset.rowIndex, 10);
        const idCell = Array.from(row.children).find((item) => Number.parseInt(item.dataset && item.dataset.columnIndex, 10) === columnIndex);
        if (idCell && renderedRowIndex !== rowIndex) {
          const otherErrors = errorsForSheet[CDBVS.cellErrorKey(renderedRowIndex, column.name)] || [];
          applyCellErrors(idCell, otherErrors, "Double-click to edit this row");
        }
      });
    }
    return true;
  }

  function updateRenderedSelection(sheet, previous, next) {
    if (previous && (previous.rowIndex !== next?.rowIndex || previous.columnIndex !== next?.columnIndex)) {
      const previousCell = findRenderedCell(previous.rowIndex, previous.columnIndex);
      if (previousCell) previousCell.classList.remove("cell-selected");
      const previousRow = findRenderedRow(previous.rowIndex);
      if (previousRow) previousRow.classList.remove("row-selected");
    }
    if (next) {
      const nextCell = findRenderedCell(next.rowIndex, next.columnIndex);
      if (nextCell) {
        nextCell.classList.add("cell-selected");
        if (typeof nextCell.focus === "function") nextCell.focus({ preventScroll: true });
        if (typeof nextCell.scrollIntoView === "function") nextCell.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      const nextRow = findRenderedRow(next.rowIndex);
      if (nextRow) nextRow.classList.add("row-selected");
    }
    return true;
  }

  function activateEditorInCell(cell, sheet, event, onClose) {
    if (!cell) return true;
    const controls = Array.from(cell.querySelectorAll("input, select, textarea, button"));
    const control = controls.find((item) => item.classList && item.classList.contains("list-toggle"))
      || controls.find((item) => item.tagName === "INPUT" || item.tagName === "SELECT" || item.tagName === "TEXTAREA");
    if (!control) return true;
    const directControlClick = CDBVS.isControlTarget(event && event.target, control);
    const directListToggleClick = !!(event && event.target && event.target.closest
      && event.target.closest(".list-toggle"));
    if (typeof control.focus === "function") control.focus();
    if (control.tagName === "SELECT") {
      CDBVS.openSelectMenu(control, sheet, onClose);
    } else if (control.classList && control.classList.contains("list-toggle") && !directListToggleClick) {
      if (typeof cell._cdbvsToggleList === "function") cell._cdbvsToggleList();
      else CDBVS.clickControl(control);
    } else if (!directControlClick && control.tagName === "INPUT" && control.type === "color" && typeof control.showPicker === "function") {
      try { control.showPicker(); } catch (_) {}
    } else if (!directControlClick && typeof control.setSelectionRange === "function") {
      try { control.setSelectionRange(String(control.value || "").length, String(control.value || "").length); } catch (_) {}
    }
    if (control.classList && control.classList.contains("list-toggle") && typeof cell.focus === "function") {
      cell.focus({ preventScroll: true });
    }
    return true;
  }

  function activateRenderedCell(sheet, rowIndex, columnIndex, event) {
    const cell = findRenderedCell(rowIndex, columnIndex);
    if (cell && typeof cell._cdbvsToggleBoolean === "function") return cell._cdbvsToggleBoolean(event);
    if (!CDBVS.activateCell(sheet, rowIndex, columnIndex)) return false;
    return activateEditorInCell(cell, sheet, event);
  }

  function exitEditorInCell(cell, sheet, focusTarget, collapseList) {
    if (!cell) return false;
    if (typeof CDBVS.closeSelectMenu === "function") CDBVS.closeSelectMenu();
    const focused = document.activeElement;
    const focusedInCell = focused && typeof cell.contains === "function" && cell.contains(focused);
    const editorTarget = focusedInCell && focused.closest && focused.closest("input, textarea, select, [contenteditable=\"true\"]")
      || cell.querySelector("input, textarea, select, [contenteditable=\"true\"]");
    if (focusedInCell && typeof focused.blur === "function") focused.blur();
    if (editorTarget) CDBVS.commitEditorTarget(editorTarget);
    CDBVS.deactivateCell(sheet);
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

  function exitRenderedCell(sheet, collapseList = true) {
    const active = CDBVS.activeCell(sheet);
    if (!active) return false;
    const cell = findRenderedCell(active.rowIndex, active.columnIndex);
    return exitEditorInCell(cell, sheet, cell, collapseList);
  }

  function selectRenderedRow(sheet, rowIndex, rowElement, event) {
    const previous = CDBVS.selectedCell(sheet);
    if (previous) CDBVS.exitRenderedCell(sheet, false);
    if (event && (event.shiftKey || event.ctrlKey || event.metaKey)) CDBVS.selectRowWithModifiers(sheet, rowIndex, event);
    else CDBVS.selectRow(sheet, rowIndex);
    CDBVS.updateRenderedSelection(sheet, previous, null);
    markRenderedRowSelected(rowElement);
  }

  function selectRenderedCell(sheet, rowIndex, columnIndex, rowElement, cellElement) {
    const previous = CDBVS.selectedCell(sheet);
    if (!previous || previous.rowIndex !== rowIndex || previous.columnIndex !== columnIndex) CDBVS.exitRenderedCell(sheet, false);
    CDBVS.selectCell(sheet, rowIndex, columnIndex);
    CDBVS.updateRenderedSelection(sheet, previous, CDBVS.selectedCell(sheet));
    if (cellElement && !cellElement.classList.contains("cell-selected")) cellElement.classList.add("cell-selected");
    markRenderedRowSelected(rowElement);
  }

  Object.assign(CDBVS, {
    renderedRoot, findRenderedRow, findRenderedCell, refreshRenderedCell, updateRenderedSelection,
    activateEditorInCell, exitEditorInCell, activateRenderedCell, exitRenderedCell, selectRenderedRow, selectRenderedCell,
    // Selection, rendering, and custom select-menu behavior are intentionally
    // exposed as separate runtime capabilities.
  });
})(window);
