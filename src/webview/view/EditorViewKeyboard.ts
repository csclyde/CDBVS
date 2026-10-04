// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const application = CDBVS.services.application;
  const documentActions = application.documentActions;
  const clipboardActions = application.clipboardActions;
  const sheetViewModel = CDBVS.services.sheetView;
  let installed = false;

  function moveToTabCell(sheet, selection, direction) {
    if (!sheet || !selection || typeof sheetViewModel.rowsForNavigation !== "function"
      || typeof documentActions.moveSelectedCell !== "function") return false;
    const rows = CDBVS.navigationRows(sheet);
    const columns = Array.isArray(sheet.columns) ? sheet.columns : [];
    const rowPosition = rows.findIndex((entry) => entry.rowIndex === selection.rowIndex);
    if (rowPosition < 0 || !columns.length) return false;
    const currentPosition = rowPosition * columns.length + selection.columnIndex;
    const targetPosition = currentPosition + direction;
    if (targetPosition < 0 || targetPosition >= rows.length * columns.length) return false;
    const targetRowPosition = Math.floor(targetPosition / columns.length);
    const targetColumnIndex = targetPosition % columns.length;
    const rowDelta = targetRowPosition - rowPosition;
    const columnDelta = targetColumnIndex - selection.columnIndex;
    if (!documentActions.moveSelectedCell(sheet, rowDelta, columnDelta)) return false;
    const next = CDBVS.selectedCell(sheet);
    if (!next || typeof CDBVS.activateRenderedCell !== "function") return true;
    const nextCell = typeof CDBVS.findRenderedCell === "function"
      ? CDBVS.findRenderedCell(next.rowIndex, next.columnIndex)
      : null;
    // Boolean cells are selection-owned controls, so Tab should not toggle them.
    if (nextCell && (typeof nextCell._cdbvsToggleBoolean === "function" || nextCell.querySelector(".list-toggle"))) return true;
    CDBVS.activateRenderedCell(sheet, next.rowIndex, next.columnIndex);
    return true;
  }

  function isPrintableKey(event) {
    if (!event || event.ctrlKey || event.metaKey || event.altKey) return false;
    const key = String(event.key || "");
    // Array.from also treats a single Unicode code point (for example an
    // emoji) as one printable key, even though it can contain two UTF-16
    // code units.
    return Array.from(key).length === 1;
  }

  function startCellEditWithKey(sheet, selection, event) {
    if (!sheet || !selection || !isPrintableKey(event)
      || typeof CDBVS.findRenderedCell !== "function"
      || typeof CDBVS.activateRenderedCell !== "function") return false;
    const cell = CDBVS.findRenderedCell(selection.rowIndex, selection.columnIndex);
    if (!cell || typeof cell.querySelector !== "function") return false;
    const control = cell.querySelector("input, textarea");
    if (!control) return false;
    const controlType = String(control.type || "text").toLowerCase();
    const editable = control.tagName === "TEXTAREA"
      || (control.tagName === "INPUT" && ["text", "number", "search", "email", "url", "tel", "password"].includes(controlType));
    if (!editable) return false;
    // Number inputs sanitize unsupported text to an empty string. Do not
    // replace a valid stored number with null merely by typing a letter.
    if (controlType === "number" && !/^[0-9]$/.test(String(event.key))) return false;

    event.preventDefault();
    CDBVS.activateRenderedCell(sheet, selection.rowIndex, selection.columnIndex, event);
    const activeControl = cell.querySelector("input, textarea");
    if (!activeControl) return true;
    activeControl.value = String(event.key);
    activeControl.dispatchEvent(new Event("input", { bubbles: false }));
    if (typeof activeControl.setSelectionRange === "function") {
      const caret = String(activeControl.value || "").length;
      try { activeControl.setSelectionRange(caret, caret); } catch (_) {}
    }
    return true;
  }

  function handleKeydown(event) {
    if (event.__cdbvsKeyboardHandled) return;
    event.__cdbvsKeyboardHandled = true;
    if (event.isComposing || event.keyCode === 229) return;
    const modal = CDBVS.modalState && CDBVS.modalState.active;
    if (modal) {
      const modalKey = String(event.key || "").toLowerCase();
      if (modal._cdbvsConfirmation && (event.ctrlKey || event.metaKey) && !event.altKey && (modalKey === "s" || modalKey === "enter")) {
        event.preventDefault();
        event.__cdbvsModalHandled = true;
        if (typeof event.stopPropagation === "function") event.stopPropagation();
        modal.querySelector(".modal-status").textContent = "Choose an action button or Cancel. Save shortcuts do not confirm this action.";
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && (modalKey === "s" || modalKey === "enter") && typeof modal._cdbvsApply === "function") {
        event.preventDefault();
        event.__cdbvsModalHandled = true;
        if (typeof event.stopPropagation === "function") event.stopPropagation();
        if (event.repeat || modal._cdbvsDiscardPrompt) return;
        modal._cdbvsApply();
        if (CDBVS.modalState.active !== modal && !modal._cdbvsPrevious && !modal._cdbvsViewOnly && modalKey === "s" && typeof CDBVS.requestSave === "function") CDBVS.requestSave();
      }
      return;
    }
    const sheet = sheetViewModel.currentSheet();
    const key = String(event.key || "").toLowerCase();
    if (key === "escape" && event.repeat) { event.preventDefault(); return; }
    const dropdownOpen = typeof CDBVS.hasOpenSelectMenu === "function" && CDBVS.hasOpenSelectMenu();
    if (key === "escape" && !dropdownOpen
      && typeof CDBVS.hasContextMenu === "function" && CDBVS.hasContextMenu()) {
      if (event.target && event.target.closest && event.target.closest(".context-menu")) return;
      event.preventDefault();
      CDBVS.closeContextMenu();
      return;
    }
    const modified = event.ctrlKey || event.metaKey;
    const editorTarget = event.target && event.target.closest && (
      event.target.closest("input")
      || event.target.closest("textarea")
      || event.target.closest("select")
      || event.target.closest("[contenteditable=\"true\"]")
    );
    const cellSelection = CDBVS.selectedCell(sheet);
    if (CDBVS.isGridUpdating() && ((event.target && event.target.closest && event.target.closest(".table-wrap"))
      || event.target === document || event.target === document.body)) {
      event.preventDefault();
      return;
    }
    const activeSelection = CDBVS.activeCell(sheet);
    const arrowKey = key === "arrowup" || key === "arrowdown" || key === "arrowleft" || key === "arrowright";
    const clipboardKey = key === "c" || key === "x" || key === "v";
    const deleteKey = key === "delete" || key === "del";
    const selectMenu = document.querySelector && document.querySelector(".cell-select-menu");
    const selectFilter = selectMenu && selectMenu.querySelector && selectMenu.querySelector(".cell-select-filter");
    const selectFilterTarget = !!(selectFilter && (event.target === selectFilter
      || (typeof selectFilter.contains === "function" && selectFilter.contains(event.target))));
    const selectMenuTarget = !!(selectMenu && (event.target === selectMenu
      || (typeof selectMenu.contains === "function" && selectMenu.contains(event.target))));
    if (!modified && !event.altKey && key === "tab" && cellSelection) {
      const tableTarget = event.target && event.target.closest && event.target.closest("td");
      if (tableTarget || selectMenuTarget) {
        if (activeSelection && editorTarget && CDBVS.commitEditorTarget(editorTarget) === false) {
          event.preventDefault();
          return;
        }
        // Tab is a commit-and-advance action for an open dropdown. Close it
        // through the normal lifecycle before moving the grid selection so the
        // value is never left dependent on a later blur or render.
        if (selectMenuTarget && typeof CDBVS.finishSelectMenu === "function"
          && typeof CDBVS.hasOpenSelectMenu === "function" && CDBVS.hasOpenSelectMenu()) {
          CDBVS.finishSelectMenu(true);
        }
        if (moveToTabCell(sheet, cellSelection, event.shiftKey ? -1 : 1)) event.preventDefault();
        else if (activeSelection) CDBVS.exitRenderedCell(sheet, false);
        return;
      }
    }
    if (modified && key === "s") {
      event.preventDefault();
      if (document.querySelector(".raw-editor") && typeof CDBVS.applyRawDraft === "function") {
        CDBVS.applyRawDraft(true);
        return;
      }
      if (activeSelection && !selectMenuTarget && typeof CDBVS.findRenderedCell === "function") {
        const activeCellElement = CDBVS.findRenderedCell(activeSelection.rowIndex, activeSelection.columnIndex);
        if (activeCellElement && !CDBVS.commitCellEditors(activeCellElement)) return;
      }
      if ((selectFilterTarget || selectMenuTarget) && typeof CDBVS.finishSelectMenu === "function") {
        CDBVS.finishSelectMenu(true);
        if (typeof CDBVS.flushUpdate === "function") CDBVS.flushUpdate();
      } else if (editorTarget) {
        if (CDBVS.commitEditorTarget(editorTarget) === false) return;
      }
      else if (typeof CDBVS.flushUpdate === "function") CDBVS.flushUpdate();
      if (typeof CDBVS.requestSave === "function") CDBVS.requestSave();
      return;
    }
    const editorCell = editorTarget && editorTarget.closest && editorTarget.closest("td");
    const cellEditorTarget = editorCell && editorCell.closest && editorCell.closest("td") ? editorTarget : null;
    // Selection can outlive focus in the grid. Search, toolbar controls and
    // raw JSON editors must keep ownership of their keys in that case.
    if (editorTarget && !cellEditorTarget && !selectMenuTarget) return;
    const buttonTarget = event.target && event.target.closest && event.target.closest("button");
    if (buttonTarget && !buttonTarget.closest("td") && !selectMenuTarget) return;
    if (!editorTarget && !activeSelection && cellSelection && startCellEditWithKey(sheet, cellSelection, event)) return;
    // Clipboard and modified arrows are native text editing operations while
    // a cell editor is active, including when focus restored its editor before
    // the active-cell bookkeeping caught up.
    if (cellEditorTarget && (activeSelection || document.activeElement === editorTarget)
      && modified && (clipboardKey || arrowKey)) return;
    const opensSelect = (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
      && (key === " " || key === "f4"))
      || (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
        && (key === "arrowup" || key === "arrowdown"));
    if (!activeSelection && cellSelection && opensSelect && typeof CDBVS.findRenderedCell === "function") {
      const selectedCellElement = CDBVS.findRenderedCell(cellSelection.rowIndex, cellSelection.columnIndex);
      const selectedControl = selectedCellElement && selectedCellElement.querySelector
        ? selectedCellElement.querySelector("select") : null;
      if (selectedControl && typeof CDBVS.activateRenderedCell === "function") {
        event.preventDefault();
        CDBVS.activateRenderedCell(sheet, cellSelection.rowIndex, cellSelection.columnIndex, event);
        return;
      }
    }
    // Once a cell is active, its editor owns arrow keys so text cursors, number
    // inputs, selects, and nested editors can navigate their own value without
    // moving the grid selection.
    let selectKeyTarget = event.target;
    if (!editorTarget && activeSelection && typeof CDBVS.findRenderedCell === "function") {
      const activeCellElement = CDBVS.findRenderedCell(activeSelection.rowIndex, activeSelection.columnIndex);
      const activeControl = activeCellElement && activeCellElement.querySelector
        ? activeCellElement.querySelector("select") : null;
      if (activeControl) selectKeyTarget = activeControl;
    }
    if (typeof CDBVS.handleSelectKeydown === "function"
      && CDBVS.handleSelectKeydown(selectKeyTarget, event)) return;
    // The dropdown filter is a real text input living outside the table cell.
    // Keep its editing keys and clipboard shortcuts away from grid navigation.
    if (selectFilterTarget && ((arrowKey || key === "home" || key === "end")
      || (modified && clipboardKey))) return;
    if (event.altKey) return;
    if (activeSelection && cellEditorTarget && arrowKey) return;
    if (!modified && !event.altKey && arrowKey && (!editorTarget || cellEditorTarget || cellSelection)) {
      if (!cellSelection) {
        const rows = sheet ? CDBVS.navigationRows(sheet) : [];
        const columns = sheet && Array.isArray(sheet.columns) ? sheet.columns : [];
        if (!rows.length || !columns.length) return;
        const rowIndex = key === "arrowup" ? rows[rows.length - 1].rowIndex : rows[0].rowIndex;
        const columnIndex = key === "arrowleft" ? columns.length - 1 : 0;
        event.preventDefault();
        CDBVS.selectCell(sheet, rowIndex, columnIndex);
        CDBVS.updateRenderedSelection(sheet, null, CDBVS.selectedCell(sheet));
        return;
      }
      event.preventDefault();
      CDBVS.commitEditorTarget(editorTarget);
      documentActions.moveSelectedCell(sheet, key === "arrowup" ? -1 : (key === "arrowdown" ? 1 : 0), key === "arrowleft" ? -1 : (key === "arrowright" ? 1 : 0));
      return;
    }
    if (!modified && !event.altKey && cellSelection && (key === "enter" || key === "f2")) {
      if (event.repeat) { event.preventDefault(); return; }
      if (key === "f2" && activeSelection) { event.preventDefault(); return; }
      if (activeSelection) {
        event.preventDefault();
        CDBVS.exitRenderedCell(sheet);
      } else if (editorTarget && editorTarget.tagName !== "SELECT" && editorCell && cellSelection
        && editorCell === CDBVS.findRenderedCell(cellSelection.rowIndex, cellSelection.columnIndex)) {
        event.preventDefault();
        CDBVS.activateCell(sheet, cellSelection.rowIndex, cellSelection.columnIndex);
        CDBVS.exitRenderedCell(sheet);
      } else {
        CDBVS.activateRenderedCell(sheet, cellSelection.rowIndex, cellSelection.columnIndex, event);
        event.preventDefault();
      }
      return;
    }
    if (!modified && !event.altKey && activeSelection && key === "escape") {
      event.preventDefault();
      CDBVS.cancelRenderedCell(sheet);
      return;
    }
    if (!modified && !event.altKey && !activeSelection && cellSelection && key === " ") {
      const cell = CDBVS.findRenderedCell(cellSelection.rowIndex, cellSelection.columnIndex);
      if (cell && typeof cell._cdbvsToggleBoolean === "function") {
        event.preventDefault();
        if (!event.repeat) cell._cdbvsToggleBoolean();
        return;
      }
    }
    if (!modified && !event.altKey && activeSelection && editorTarget && deleteKey) return;
    if (editorTarget && !((!modified && (arrowKey || deleteKey) && cellSelection) || (modified && clipboardKey && cellSelection))) return;
    if (!modified) {
      if (key === "insert") {
        event.preventDefault();
        if (typeof event.stopPropagation === "function") event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
        documentActions.insertSelectedRow(sheet);
        return;
      }
      if (deleteKey) {
        event.preventDefault();
        if (cellSelection) {
          CDBVS.commitEditorTarget(editorTarget);
          clipboardActions.deleteSelectedCell(sheet);
        } else documentActions.deleteSelectedRow(sheet);
        return;
      }
    }
    if (!modified) return;
    if (key === "c" || key === "x") {
      if (CDBVS.selectedRowIndex(sheet) === null) return;
      event.preventDefault();
      CDBVS.commitEditorTarget(editorTarget);
      clipboardActions.copySelectedRow(sheet, key === "x");
      return;
    }
    if (key === "v") {
      if (!sheet) return;
      event.preventDefault();
      CDBVS.commitEditorTarget(editorTarget);
      clipboardActions.pasteSelectedRow(sheet);
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (CDBVS.selectedRowIndex(sheet) === null) return;
    event.preventDefault();
    documentActions.moveSelectedRow(sheet, event.key === "ArrowUp" ? -1 : 1);
  }

  function installKeyboardNavigation() {
    if (installed) return;
    installed = true;
    document.addEventListener("keydown", handleKeydown, true);
    if (typeof global.addEventListener === "function") global.addEventListener("keydown", handleKeydown, true);
  }

  CDBVS.installKeyboardNavigation = installKeyboardNavigation;
  installKeyboardNavigation();
})(window);
