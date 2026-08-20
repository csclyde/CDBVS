// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const services = CDBVS.services;
  const model = services.document.operations;
  const clipboardState = services.clipboard;
  const setCellValue = model.values.setCell;
  const commitCellMutation = services.application.commitCellMutation;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const createModal = CDBVS.createModal;
  const appendModalActions = CDBVS.appendModalActions;
  const typeLabel = CDBVS.typeLabel;
  let modalId = 0;

  function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function cloneRows(values, schema) {
    if (!Array.isArray(values)) return [];
    return values.map((value) => isRecord(value)
      ? (CDBVS.cloneValue(value) || {})
      : (CDBVS.createRowForSchema(schema, values) || {}));
  }

  function activeEditorTarget(cell) {
    if (!cell || typeof cell.querySelectorAll !== "function") return null;
    const controls = Array.from(cell.querySelectorAll("input, select, textarea, [contenteditable=\"true\"]"));
    return controls[0] || null;
  }

  function findCell(grid, rowIndex, columnIndex) {
    if (!grid) return null;
    return grid.querySelector(`td[data-row-index=\"${rowIndex}\"][data-column-index=\"${columnIndex}\"]`)
      || Array.from(grid.querySelectorAll("td")).find((cell) => (
        Number.parseInt(cell.dataset && cell.dataset.rowIndex, 10) === rowIndex
        && Number.parseInt(cell.dataset && cell.dataset.columnIndex, 10) === columnIndex
      )) || null;
  }

  function openListEditor(parentSheet, parentRow, parentColumn, schema, options) {
    const config = options || {};
    if (!parentRow || !parentColumn || !schema || !Array.isArray(schema.columns)) return false;
    const draftRows = cloneRows(parentRow[parentColumn.name], schema);
    const modalSheet = Object.assign({}, schema, { lines: draftRows });
    const modalKey = `${schema.name || parentColumn.name}-list-modal-${++modalId}`;
    modalSheet.name = schema.name || modalKey;
    const isNestedModal = config.deferChanges === true && !!(CDBVS.modalState && CDBVS.modalState.active);
    let selectedCell = null;
    let activeCell = null;
    let selectedRows = new Set();
    let rowAnchor = null;
    let rowClipboard = null;
    let saved = false;
    let grid = null;
    let deleteButton = null;
    let addButton = null;
    let countLabel = null;
    let removeDocumentKeydown = () => {};

    const refreshParent = () => {
      if (saved && typeof config.onDraftChange === "function") config.onDraftChange();
    };
    const modal = createModal({
      className: "list-modal",
      title: `Edit ${parentColumn.name || "list"} items`,
      restorePrevious: isNestedModal,
      onRestore: refreshParent,
      onClose: () => removeDocumentKeydown()
    });
    const { overlay, dialog, footer } = modal;
    const close = modal.close;

    function syncGlobalSelection() {
      if (selectedCell) CDBVS.selectCell(modalSheet, selectedCell.rowIndex, selectedCell.columnIndex);
      else if (selectedRows.size) {
        const indexes = Array.from(selectedRows).sort((left, right) => left - right);
        CDBVS.selectRows(modalSheet, indexes, indexes[indexes.length - 1], rowAnchor);
      } else {
        CDBVS.selectCell(modalSheet, null, null);
      }
      if (activeCell) CDBVS.activateCell(modalSheet, activeCell.rowIndex, activeCell.columnIndex);
      else CDBVS.deactivateCell(modalSheet);
    }

    function currentRowIndex() {
      if (selectedCell) return selectedCell.rowIndex;
      if (selectedRows.size) return Math.max(...Array.from(selectedRows));
      return null;
    }

    function setRowSelection(index, event) {
      if (!Number.isInteger(index) || index < 0 || index >= draftRows.length) return false;
      const modified = !!(event && (event.ctrlKey || event.metaKey));
      if (event && event.shiftKey) {
        const anchor = Number.isInteger(rowAnchor) ? rowAnchor : index;
        const start = Math.min(anchor, index);
        const end = Math.max(anchor, index);
        selectedRows = new Set(Array.from({ length: end - start + 1 }, (_, offset) => start + offset));
      } else if (modified) {
        const next = new Set(selectedRows);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        selectedRows = next;
        rowAnchor = index;
      } else {
        selectedRows = new Set([index]);
        rowAnchor = index;
      }
      selectedCell = null;
      activeCell = null;
      syncGlobalSelection();
      updateSelectionClasses();
      return true;
    }

    function commitActiveEditor() {
      if (!activeCell) return;
      const cell = findCell(grid, activeCell.rowIndex, activeCell.columnIndex);
      const editor = activeEditorTarget(cell);
      if (editor) CDBVS.commitEditorTarget(editor);
    }

    function exitCell(focusCell) {
      if (!activeCell) return false;
      if (typeof CDBVS.closeSelectMenu === "function") CDBVS.closeSelectMenu();
      commitActiveEditor();
      activeCell = null;
      syncGlobalSelection();
      const target = focusCell && selectedCell ? findCell(grid, selectedCell.rowIndex, selectedCell.columnIndex) : null;
      if (target && typeof target.focus === "function") target.focus({ preventScroll: true });
      updateSelectionClasses();
      return true;
    }

    function selectCell(rowIndex, columnIndex) {
      if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)
        || rowIndex < 0 || rowIndex >= draftRows.length || !schema.columns[columnIndex]) return false;
      if (activeCell && (!selectedCell || activeCell.rowIndex !== rowIndex || activeCell.columnIndex !== columnIndex)) exitCell(false);
      selectedCell = { rowIndex, columnIndex };
      selectedRows = new Set([rowIndex]);
      rowAnchor = rowIndex;
      activeCell = null;
      syncGlobalSelection();
      updateSelectionClasses();
      return true;
    }

    function controlForCell(cell) {
      if (!cell) return null;
      const listToggle = cell.querySelector(".list-toggle");
      return listToggle || activeEditorTarget(cell);
    }

    function activateCell(cell, rowIndex, columnIndex, event) {
      if (!selectCell(rowIndex, columnIndex)) return false;
      const control = controlForCell(cell);
      if (!control) return true;
      if (typeof cell._cdbvsToggleBoolean === "function") {
        cell._cdbvsToggleBoolean(event);
        return true;
      }
      activeCell = { rowIndex, columnIndex };
      syncGlobalSelection();
      if (control.classList && control.classList.contains("list-toggle")) {
        activeCell = null;
        syncGlobalSelection();
        if (typeof cell._cdbvsOpenListEditor === "function") cell._cdbvsOpenListEditor(event);
        return true;
      }
      if (control.tagName === "SELECT" && typeof CDBVS.openSelectMenu === "function") {
        CDBVS.openSelectMenu(control, modalSheet, () => exitCell(true));
      } else if (typeof control.focus === "function") {
        control.focus();
        if (typeof control.setSelectionRange === "function") {
          const length = String(control.value || "").length;
          try { control.setSelectionRange(length, length); } catch (_) {}
        }
      }
      updateSelectionClasses();
      return true;
    }

    function updateSelectionClasses() {
      if (!grid) return;
      Array.from(grid.querySelectorAll("tr")).filter((rowElement) => rowElement.dataset && rowElement.dataset.rowIndex !== undefined).forEach((rowElement) => {
        const rowIndex = Number.parseInt(rowElement.dataset && rowElement.dataset.rowIndex, 10);
        const rowSelected = selectedRows.has(rowIndex);
        if (rowSelected) rowElement.classList.add("row-selected");
        else rowElement.classList.remove("row-selected");
        rowElement.setAttribute("aria-selected", String(rowSelected));
      });
      Array.from(grid.querySelectorAll("td")).filter((cell) => cell.dataset && cell.dataset.columnIndex !== undefined).forEach((cell) => {
        const rowIndex = Number.parseInt(cell.dataset && cell.dataset.rowIndex, 10);
        const columnIndex = Number.parseInt(cell.dataset && cell.dataset.columnIndex, 10);
        const isSelected = !!selectedCell
          && selectedCell.rowIndex === rowIndex && selectedCell.columnIndex === columnIndex;
        const isActive = !!activeCell
          && activeCell.rowIndex === rowIndex && activeCell.columnIndex === columnIndex;
        if (isSelected) cell.classList.add("cell-selected");
        else cell.classList.remove("cell-selected");
        if (isActive) cell.classList.add("cell-active");
        else cell.classList.remove("cell-active");
      });
      if (deleteButton) deleteButton.disabled = selectedRows.size === 0;
    }

    function updateButtons() {
      if (deleteButton) deleteButton.disabled = selectedRows.size === 0;
      if (addButton) addButton.disabled = false;
      if (countLabel) countLabel.textContent = `${draftRows.length} item${draftRows.length === 1 ? "" : "s"}`;
    }

    function insertRows() {
      exitCell(false);
      const selected = currentRowIndex();
      const insertAt = selected === null ? draftRows.length : selected + 1;
      const newRow = CDBVS.createRowForSchema(modalSheet, draftRows);
      draftRows.splice(insertAt, 0, newRow);
      selectedRows = new Set([insertAt]);
      selectedCell = schema.columns.length ? { rowIndex: insertAt, columnIndex: 0 } : null;
      rowAnchor = insertAt;
      activeCell = null;
      syncGlobalSelection();
      renderGrid();
      focusSelectedCell();
      return true;
    }

    function deleteRows() {
      exitCell(false);
      const indexes = Array.from(selectedRows).sort((left, right) => left - right);
      if (!indexes.length) return false;
      indexes.slice().reverse().forEach((index) => draftRows.splice(index, 1));
      if (!draftRows.length) {
        selectedRows = new Set();
        selectedCell = null;
        rowAnchor = null;
      } else {
        const next = Math.min(indexes[0], draftRows.length - 1);
        selectedRows = new Set([next]);
        selectedCell = schema.columns.length ? { rowIndex: next, columnIndex: 0 } : null;
        rowAnchor = next;
      }
      activeCell = null;
      syncGlobalSelection();
      renderGrid();
      focusSelectedCell();
      return true;
    }

    function moveSelectedRow(delta) {
      if (selectedRows.size !== 1) return false;
      const index = Array.from(selectedRows)[0];
      const target = index + delta;
      if (target < 0 || target >= draftRows.length) return false;
      exitCell(false);
      [draftRows[index], draftRows[target]] = [draftRows[target], draftRows[index]];
      selectedRows = new Set([target]);
      if (selectedCell && selectedCell.rowIndex === index) selectedCell = { rowIndex: target, columnIndex: selectedCell.columnIndex };
      rowAnchor = target;
      renderGrid();
      focusSelectedCell();
      return true;
    }

    function copyCell(cut) {
      if (!selectedCell || !draftRows[selectedCell.rowIndex] || !schema.columns[selectedCell.columnIndex]) return false;
      const row = draftRows[selectedCell.rowIndex];
      const column = schema.columns[selectedCell.columnIndex];
      const hasValue = Object.prototype.hasOwnProperty.call(row, column.name);
      clipboardState.setCell({
        sheetName: modalSheet.name,
        columnName: column.name,
        hasValue,
        value: hasValue ? CDBVS.cloneValue(row[column.name]) : null
      });
      if (cut) {
        setCellValue(row, column, null);
        renderGrid();
      }
      return true;
    }

    function pasteCell() {
      if (!selectedCell || !draftRows[selectedCell.rowIndex] || !schema.columns[selectedCell.columnIndex]) return false;
      const clipboard = clipboardState.getCell();
      if (!clipboard) return false;
      setCellValue(draftRows[selectedCell.rowIndex], schema.columns[selectedCell.columnIndex],
        clipboard.hasValue ? CDBVS.cloneValue(clipboard.value) : null);
      renderGrid();
      focusSelectedCell();
      return true;
    }

    function copyRows(cut) {
      const indexes = Array.from(selectedRows).sort((left, right) => left - right);
      if (!indexes.length) return false;
      rowClipboard = { rows: indexes.map((index) => CDBVS.cloneValue(draftRows[index])) };
      clipboardState.setRow({ sheetName: modalSheet.name, rows: CDBVS.cloneValue(rowClipboard.rows) });
      if (cut) {
        indexes.slice().reverse().forEach((index) => draftRows.splice(index, 1));
        selectedRows = new Set();
        selectedCell = null;
        activeCell = null;
        renderGrid();
      }
      return true;
    }

    function pasteRows() {
      const clipboard = rowClipboard || clipboardState.getRow();
      const rows = clipboard && Array.isArray(clipboard.rows) ? clipboard.rows : [];
      if (!rows.length) return false;
      const selected = currentRowIndex();
      const insertAt = selected === null ? draftRows.length : selected + 1;
      rows.forEach((row, offset) => draftRows.splice(insertAt + offset, 0, CDBVS.cloneValue(row)));
      selectedRows = new Set(rows.map((_, offset) => insertAt + offset));
      selectedCell = schema.columns.length ? { rowIndex: insertAt + rows.length - 1, columnIndex: 0 } : null;
      rowAnchor = insertAt + rows.length - 1;
      renderGrid();
      focusSelectedCell();
      return true;
    }

    function showRowMenu(event, rowIndex) {
      event.preventDefault();
      if (typeof event.stopPropagation === "function") event.stopPropagation();
      if (!selectedRows.has(rowIndex)) setRowSelection(rowIndex, event);
      CDBVS.showContextMenu(event, [
        { label: "Add row below", action: insertRows },
        { label: "Delete selected rows", action: deleteRows, disabled: selectedRows.size === 0 },
        { separator: true },
        { label: "Move row up", action: () => moveSelectedRow(-1), disabled: selectedRows.size !== 1 || currentRowIndex() <= 0 },
        { label: "Move row down", action: () => moveSelectedRow(1), disabled: selectedRows.size !== 1 || currentRowIndex() >= draftRows.length - 1 },
        { separator: true },
        { label: "Copy selected rows", action: () => copyRows(false) },
        { label: "Cut selected rows", action: () => copyRows(true) },
        { label: "Paste rows below", action: pasteRows }
      ]);
    }

    function showCellMenu(event, rowIndex, columnIndex) {
      event.preventDefault();
      selectCell(rowIndex, columnIndex);
      CDBVS.showContextMenu(event, [
        { label: "Copy cell", action: () => copyCell(false) },
        { label: "Cut cell", action: () => copyCell(true) },
        { label: "Paste cell", action: pasteCell },
        { separator: true },
        { label: "Clear cell", action: () => { setCellValue(draftRows[rowIndex], schema.columns[columnIndex], null); renderGrid(); } }
      ]);
    }

    function focusSelectedCell() {
      if (!selectedCell) return;
      const cell = findCell(grid, selectedCell.rowIndex, selectedCell.columnIndex);
      if (cell && typeof cell.focus === "function") cell.focus({ preventScroll: true });
      if (cell && typeof cell.scrollIntoView === "function") cell.scrollIntoView({ block: "nearest", inline: "nearest" });
    }

    function renderGrid() {
      if (!grid) return;
      grid.replaceChildren();
      const table = document.createElement("table");
      table.className = "list-modal-table";
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      headRow.appendChild(makeElement("th", "#", "row-number"));
      schema.columns.forEach((column) => {
        const th = makeElement("th", null, "nested-heading");
        th.appendChild(makeElement("span", column.name || "?"));
        th.appendChild(makeElement("small", typeLabel(column), "list-modal-type"));
        headRow.appendChild(th);
      });
      head.appendChild(headRow);
      table.appendChild(head);
      const body = document.createElement("tbody");
      draftRows.forEach((rawItem, rowIndex) => {
        const item = isRecord(rawItem) ? rawItem : {};
        const tr = document.createElement("tr");
        tr.dataset.rowIndex = String(rowIndex);
        tr.setAttribute("aria-selected", String(selectedRows.has(rowIndex)));
        if (selectedRows.has(rowIndex)) tr.classList.add("row-selected");
        const rowCell = makeElement("td", null, "row-number");
        const rowSelect = makeButton(String(rowIndex + 1), (event) => {
          event.stopPropagation();
          setRowSelection(rowIndex, event);
        }, "row-select");
        rowSelect.title = `Select list item ${rowIndex + 1}`;
        rowSelect.setAttribute("aria-label", rowSelect.title);
        rowCell.appendChild(rowSelect);
        rowCell.addEventListener("contextmenu", (event) => showRowMenu(event, rowIndex));
        tr.appendChild(rowCell);
        tr.addEventListener("contextmenu", (event) => {
          const targetCell = event.target && event.target.closest ? event.target.closest("td") : null;
          if (targetCell && targetCell.dataset && targetCell.dataset.columnIndex !== undefined) return;
          showRowMenu(event, rowIndex);
        });
        schema.columns.forEach((column, columnIndex) => {
          const td = document.createElement("td");
          td.dataset.rowIndex = String(rowIndex);
          td.dataset.columnIndex = String(columnIndex);
          td.tabIndex = -1;
          td.setAttribute("role", "gridcell");
          if (selectedCell && selectedCell.rowIndex === rowIndex && selectedCell.columnIndex === columnIndex) td.classList.add("cell-selected");
          if (activeCell && activeCell.rowIndex === rowIndex && activeCell.columnIndex === columnIndex) td.classList.add("cell-active");
          const bind = CDBVS.capabilities.table && CDBVS.capabilities.table.bindCellInteractions;
          if (typeof bind === "function") bind(td, {
            sheet: modalSheet,
            rowIndex,
            columnIndex,
            tr,
            getSelection: () => selectedCell,
            isActive: () => !!activeCell && activeCell.rowIndex === rowIndex && activeCell.columnIndex === columnIndex,
            select: () => selectCell(rowIndex, columnIndex),
            activate: (event) => activateCell(td, rowIndex, columnIndex, event),
            exit: () => exitCell(true),
            showContextMenu: (event) => showCellMenu(event, rowIndex, columnIndex)
          });
          CDBVS.makeCellEditor(td, item, column, {
            sheet: modalSheet,
            rowIndex,
            path: `${modalKey}/${rowIndex}`,
            deferChanges: true,
            editSheet: modalSheet,
            editRowIndex: rowIndex,
            editColumnIndex: columnIndex,
            refresh: renderGrid
          });
          if (typeof bind !== "function") td.addEventListener("contextmenu", (event) => showCellMenu(event, rowIndex, columnIndex));
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
      if (!draftRows.length) {
        const empty = document.createElement("tr");
        const emptyCell = makeElement("td", "No list items. Add a row to begin.", "empty");
        emptyCell.colSpan = Math.max(1, schema.columns.length + 1);
        empty.appendChild(emptyCell);
        body.appendChild(empty);
      }
      table.appendChild(body);
      grid.appendChild(table);
      updateSelectionClasses();
      updateButtons();
    }

    function moveCell(rowDelta, columnDelta) {
      if (!selectedCell) return false;
      const rowIndex = selectedCell.rowIndex + rowDelta;
      const columnIndex = selectedCell.columnIndex + columnDelta;
      if (rowIndex < 0 || rowIndex >= draftRows.length || columnIndex < 0 || columnIndex >= schema.columns.length) return false;
      commitActiveEditor();
      exitCell(false);
      selectCell(rowIndex, columnIndex);
      focusSelectedCell();
      return true;
    }

    function moveTab(direction) {
      if (!selectedCell) return false;
      const count = schema.columns.length;
      const position = selectedCell.rowIndex * count + selectedCell.columnIndex + direction;
      if (position < 0 || position >= draftRows.length * count) return false;
      commitActiveEditor();
      exitCell(false);
      selectCell(Math.floor(position / count), position % count);
      focusSelectedCell();
      return true;
    }

    function handleKeydown(event) {
      if (event.__cdbvsListModalHandled) return;
      event.__cdbvsListModalHandled = true;
      const key = String(event.key || "").toLowerCase();
      const modified = event.ctrlKey || event.metaKey;
      const editorTarget = event.target && event.target.closest
        ? event.target.closest("input, textarea, select, [contenteditable=\"true\"]") : null;
      const selectMenu = document.querySelector && document.querySelector(".cell-select-menu");
      if (selectMenu && typeof CDBVS.handleSelectKeydown === "function" && activeCell) {
        const control = activeEditorTarget(findCell(grid, activeCell.rowIndex, activeCell.columnIndex));
        const wasOpen = selectMenu.contains(event.target);
        if (CDBVS.handleSelectKeydown(control, event) || wasOpen || key === "escape" || key === "enter") return;
      }
      if (key === "escape") {
        if (typeof CDBVS.hasContextMenu === "function" && CDBVS.hasContextMenu()) {
          event.preventDefault();
          CDBVS.closeContextMenu();
          return;
        }
        if (activeCell) { event.preventDefault(); exitCell(true); }
        else close();
        return;
      }
      if (modified && key === "s") {
        event.preventDefault(); save();
        return;
      }
      const arrow = key === "arrowup" || key === "arrowdown" || key === "arrowleft" || key === "arrowright";
      if (activeCell && editorTarget && arrow) return;
      if (!modified && key === "tab" && selectedCell) {
        if (moveTab(event.shiftKey ? -1 : 1)) event.preventDefault();
        else exitCell(true);
        return;
      }
      if (!modified && arrow) {
        if (!selectedCell && draftRows.length && schema.columns.length) {
          const rowIndex = key === "arrowup" ? draftRows.length - 1 : 0;
          const columnIndex = key === "arrowleft" ? schema.columns.length - 1 : 0;
          selectCell(rowIndex, columnIndex);
          focusSelectedCell();
          event.preventDefault();
        } else if (selectedCell && moveCell(key === "arrowup" ? -1 : (key === "arrowdown" ? 1 : 0), key === "arrowleft" ? -1 : (key === "arrowright" ? 1 : 0))) {
          event.preventDefault();
        }
        return;
      }
      if (!modified && key === "enter" && selectedCell) {
        event.preventDefault();
        if (activeCell) exitCell(true);
        else activateCell(findCell(grid, selectedCell.rowIndex, selectedCell.columnIndex), selectedCell.rowIndex, selectedCell.columnIndex, event);
        return;
      }
      if (modified && !event.altKey && (key === "arrowup" || key === "arrowdown") && !editorTarget) {
        event.preventDefault();
        moveSelectedRow(key === "arrowup" ? -1 : 1);
        return;
      }
      if (!modified && key === "insert") {
        event.preventDefault();
        insertRows();
        return;
      }
      if (!modified && (key === "delete" || key === "del")) {
        if (activeCell && editorTarget) return;
        event.preventDefault();
        if (selectedCell) {
          setCellValue(draftRows[selectedCell.rowIndex], schema.columns[selectedCell.columnIndex], null);
          renderGrid();
          focusSelectedCell();
        } else deleteRows();
        return;
      }
      if (modified && (key === "c" || key === "x")) {
        event.preventDefault();
        if (selectedCell) copyCell(key === "x");
        else copyRows(key === "x");
        return;
      }
      if (modified && key === "v") {
        event.preventDefault();
        if (selectedCell && clipboardState.getCell()) pasteCell();
        else pasteRows();
      }
    }

    function save() {
      if (saved) return;
      commitActiveEditor();
      const next = CDBVS.cloneValue(draftRows) || [];
      const value = next.length || !parentColumn.opt ? next : null;
      saved = true;
      if (config.deferChanges) {
        setCellValue(parentRow, parentColumn, value);
        close();
        return;
      }
      commitCellMutation(() => setCellValue(parentRow, parentColumn, value), () => {
        close();
        if (typeof config.onDraftChange === "function") config.onDraftChange();
      });
    }

    const toolbar = makeElement("div", null, "list-modal-toolbar");
    countLabel = makeElement("span", "", "list-modal-count");
    toolbar.appendChild(countLabel);
    addButton = makeButton("Add row", insertRows, "button");
    deleteButton = makeButton("Delete selected", deleteRows, "danger-button");
    deleteButton.disabled = true;
    toolbar.appendChild(addButton);
    toolbar.appendChild(deleteButton);
    dialog.appendChild(toolbar);
    const gridWrap = makeElement("div", null, "list-modal-grid table-wrap");
    grid = gridWrap;
    dialog.appendChild(gridWrap);
    appendModalActions(footer, close, save);
    dialog.appendChild(footer);
    overlay.addEventListener("keydown", handleKeydown, true);
    const documentKeydown = (event) => {
      if (CDBVS.modalState && CDBVS.modalState.active !== overlay) return;
      if (!overlay.contains(event.target)) handleKeydown(event);
    };
    document.addEventListener("keydown", documentKeydown, true);
    removeDocumentKeydown = () => document.removeEventListener("keydown", documentKeydown, true);
    renderGrid();
    if (selectedCell) focusSelectedCell();
    else if (draftRows.length && schema.columns.length) {
      selectCell(0, 0);
      focusSelectedCell();
    }
    return true;
  }

  CDBVS.openListEditor = openListEditor;
})(window);
