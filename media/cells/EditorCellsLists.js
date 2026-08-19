(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const listKey = CDBVS.listKey;
  const listPreview = CDBVS.listPreview;
  const createRowForSchema = CDBVS.createRowForSchema;

  function renderListCell(cell, row, column, context, schema) {
    const deferChanges = context && context.deferChanges === true;
    const editSheet = context && (context.editSheet || context.sheet);
    const editRowIndex = context && (Number.isInteger(context.editRowIndex) ? context.editRowIndex : context.rowIndex);
    const editColumnIndex = context && (Number.isInteger(context.editColumnIndex)
      ? context.editColumnIndex
      : (editSheet && Array.isArray(editSheet.columns) ? editSheet.columns.indexOf(column) : -1));
    const values = Array.isArray(row[column.name]) ? row[column.name] : [];
    const key = listKey(context, column);
    const expanded = state.expandedLists.has(key);
    const selectedListItems = () => {
      const raw = state.selectedListRows && state.selectedListRows[key];
      const indexes = Array.isArray(raw) ? raw : [raw];
      return [...new Set(indexes.filter((index) => Number.isInteger(index) && index >= 0 && index < values.length))];
    };
    const initialSelectedItems = selectedListItems();
    if (!initialSelectedItems.length && state.selectedListRows) delete state.selectedListRows[key];
    const selectedListCell = () => {
      const selected = state.selectedListCells && state.selectedListCells[key];
      if (!selected || !Number.isInteger(selected.itemIndex) || !Number.isInteger(selected.columnIndex)
        || selected.itemIndex < 0 || selected.itemIndex >= values.length
        || selected.columnIndex < 0 || selected.columnIndex >= (schema.columns || []).length) return null;
      return { itemIndex: selected.itemIndex, columnIndex: selected.columnIndex };
    };
    const currentSelectedItem = () => {
      const selected = selectedListItems();
      return selected.length ? selected[selected.length - 1] : null;
    };
    const moveSelectedListItem = (direction) => {
      if (direction !== -1 && direction !== 1) return false;
      const selected = selectedListItems().sort((left, right) => left - right);
      if (!selected.length) return false;
      if ((direction < 0 && selected[0] <= 0) || (direction > 0 && selected[selected.length - 1] >= values.length - 1)) return false;
      const selectedSet = new Set(selected);
      if (direction < 0) {
        selected.forEach((index) => {
          if (!selectedSet.has(index - 1)) [values[index - 1], values[index]] = [values[index], values[index - 1]];
        });
      } else {
        selected.slice().reverse().forEach((index) => {
          if (!selectedSet.has(index + 1)) [values[index], values[index + 1]] = [values[index + 1], values[index]];
        });
      }
      const selectedNext = selected.map((index) => index + direction);
      const active = currentSelectedItem();
      const anchor = state.listSelectionAnchors && state.listSelectionAnchors[key];
      storeSelectedItems(selectedNext, active === null ? null : active + direction,
        Number.isInteger(anchor) ? anchor + direction : undefined);
      const nestedSelection = selectedListCell();
      if (nestedSelection && selectedSet.has(nestedSelection.itemIndex)) {
        nestedSelection.itemIndex += direction;
        if (!state.selectedListCells) state.selectedListCells = {};
        state.selectedListCells[key] = nestedSelection;
      }
      if (editSheet && typeof CDBVS.deactivateCell === "function") CDBVS.deactivateCell(editSheet);
      rerender();
      const focusNestedSelection = () => {
        const nextNestedSelection = selectedListCell();
        if (nextNestedSelection) focusListCell(nextNestedSelection.itemIndex, nextNestedSelection.columnIndex);
        else {
          const row = listItemRows()[active === null ? selectedNext[selectedNext.length - 1] : active + direction];
          if (row && typeof row.focus === "function") row.focus({ preventScroll: true });
        }
      };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(focusNestedSelection);
      else focusNestedSelection();
      if (!deferChanges) CDBVS.sendUpdate();
      return true;
    };
    const listItemRows = () => {
      const table = cell.querySelector(".nested-table");
      const body = table && table.querySelector("tbody");
      return body ? Array.from(body.children).filter((child) => child.tagName === "TR") : [];
    };
    const updateListItemSelection = (selected) => {
      listItemRows().forEach((rowElement) => {
        const rowIndex = Number.parseInt(rowElement.dataset && rowElement.dataset.itemIndex, 10);
        const isSelected = selected.has(rowIndex);
        if (isSelected) rowElement.classList.add("row-selected", "list-item-selected");
        else rowElement.classList.remove("row-selected", "list-item-selected");
        rowElement.setAttribute("aria-selected", isSelected ? "true" : "false");
      });
      const deleteButton = cell.querySelector(".nested-delete-item");
      if (deleteButton) deleteButton.disabled = !selected.size;
    };
    const updateListCellSelection = () => {
      const selected = selectedListCell();
      listItemRows().forEach((rowElement) => {
        Array.from(rowElement.children).forEach((childCell, childIndex) => {
          if (childIndex === 0) return;
          if (selected && Number.parseInt(rowElement.dataset.itemIndex, 10) === selected.itemIndex
            && childIndex - 1 === selected.columnIndex) childCell.classList.add("cell-selected");
          else childCell.classList.remove("cell-selected");
        });
      });
    };
    const storeSelectedItems = (indexes, activeIndex, anchorIndex) => {
      if (!state.selectedListRows) state.selectedListRows = {};
      const valid = [...new Set(indexes.filter((index) => Number.isInteger(index) && index >= 0 && index < values.length))];
      if (!valid.length) delete state.selectedListRows[key];
      else {
        const active = Number.isInteger(activeIndex) && valid.includes(activeIndex) ? activeIndex : valid[valid.length - 1];
        state.selectedListRows[key] = valid.filter((index) => index !== active).concat(active);
        if (state.selectedListRows[key].length === 1) state.selectedListRows[key] = state.selectedListRows[key][0];
        if (!state.listSelectionAnchors) state.listSelectionAnchors = {};
        state.listSelectionAnchors[key] = Number.isInteger(anchorIndex) && valid.includes(anchorIndex) ? anchorIndex : active;
      }
    };
    const selectListItem = (itemIndex, itemRow, event) => {
      if (state.selectedListCells) delete state.selectedListCells[key];
      const current = selectedListItems();
      const modified = event && (event.ctrlKey || event.metaKey);
      const anchor = state.listSelectionAnchors && state.listSelectionAnchors[key];
      let next;
      let active = itemIndex;
      let nextAnchor = itemIndex;
      if (event && event.shiftKey) {
        nextAnchor = Number.isInteger(anchor) && anchor >= 0 && anchor < values.length ? anchor : (current.length ? current[0] : itemIndex);
        const start = Math.min(nextAnchor, itemIndex);
        const end = Math.max(nextAnchor, itemIndex);
        next = Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
      } else if (modified) {
        next = current.includes(itemIndex) ? current.filter((index) => index !== itemIndex) : current.concat(itemIndex);
        active = next.includes(itemIndex) ? itemIndex : (next.length ? next[next.length - 1] : null);
      } else {
        next = [itemIndex];
      }
      storeSelectedItems(next, active, nextAnchor);
      updateListItemSelection(new Set(selectedListItems()));
      updateListCellSelection();
    };
    const focusListCell = (itemIndex, columnIndex) => {
      const rowElement = listItemRows()[itemIndex];
      const childCell = rowElement && rowElement.children[columnIndex + 1];
      if (!childCell) return false;
      if (typeof childCell.focus === "function") childCell.focus({ preventScroll: true });
      if (typeof childCell.scrollIntoView === "function") childCell.scrollIntoView({ block: "nearest", inline: "nearest" });
      return true;
    };
    const selectListCell = (itemIndex, columnIndex, focus = true) => {
      const rows = listItemRows();
      const rowElement = rows[itemIndex];
      if (!rowElement || !(schema.columns || [])[columnIndex]) return false;
      selectListItem(itemIndex, rowElement, {});
      if (!state.selectedListCells) state.selectedListCells = {};
      state.selectedListCells[key] = { itemIndex, columnIndex };
      updateListCellSelection();
      if (focus) focusListCell(itemIndex, columnIndex);
      return true;
    };
    const ensureParentCellSelected = () => {
      if (!editSheet || !Number.isInteger(editRowIndex) || !Number.isInteger(editColumnIndex)) return false;
      const selected = typeof CDBVS.selectedCell === "function" ? CDBVS.selectedCell(editSheet) : null;
      if (!selected || selected.rowIndex !== editRowIndex || selected.columnIndex !== editColumnIndex) {
        if (typeof CDBVS.exitRenderedCell === "function") CDBVS.exitRenderedCell(editSheet, false);
        if (typeof CDBVS.selectCell === "function") CDBVS.selectCell(editSheet, editRowIndex, editColumnIndex);
        if (typeof CDBVS.updateRenderedSelection === "function") CDBVS.updateRenderedSelection(editSheet, null, CDBVS.selectedCell(editSheet));
      }
      return true;
    };
    const selectedListCellElement = () => {
      const selected = selectedListCell();
      if (!selected) return null;
      const rowElement = listItemRows()[selected.itemIndex];
      return rowElement && rowElement.children[selected.columnIndex + 1];
    };
    const activateSelectedListCell = (event) => {
      const selected = selectedListCell();
      const target = selectedListCellElement();
      if (!selected || !target || !ensureParentCellSelected()) return false;
      if (typeof target._cdbvsToggleBoolean === "function") return target._cdbvsToggleBoolean(event);
      if (typeof CDBVS.activateCell === "function") CDBVS.activateCell(editSheet, editRowIndex, editColumnIndex);
      if (typeof CDBVS.activateEditorInCell === "function") CDBVS.activateEditorInCell(target, editSheet, event, exitSelectedListCell);
      else if (typeof target.focus === "function") target.focus({ preventScroll: true });
      return true;
    };
    const exitSelectedListCell = () => {
      const target = selectedListCellElement();
      if (!target || !editSheet) return false;
      if (typeof CDBVS.exitEditorInCell === "function") return CDBVS.exitEditorInCell(target, editSheet, () => selectedListCellElement(), true);
      if (typeof target.focus === "function") target.focus({ preventScroll: true });
      if (typeof CDBVS.deactivateCell === "function") CDBVS.deactivateCell(editSheet);
      return true;
    };
    const selectNestedCell = (itemIndex, columnIndex) => {
      const current = selectedListCell();
      if (current && (current.itemIndex !== itemIndex || current.columnIndex !== columnIndex)
        && editSheet && typeof CDBVS.activeCell === "function" && CDBVS.activeCell(editSheet)
        && typeof CDBVS.exitEditorInCell === "function") {
        CDBVS.exitEditorInCell(selectedListCellElement(), editSheet, null, true);
      }
      ensureParentCellSelected();
      return selectListCell(itemIndex, columnIndex);
    };
    const copySelectedListCell = (cut) => {
      const selected = selectedListCell();
      if (!selected || !schema.columns[selected.columnIndex]) return false;
      const item = values[selected.itemIndex];
      const childColumn = schema.columns[selected.columnIndex];
      state.cellClipboard = {
        sheetName: schema.name,
        columnName: childColumn.name,
        hasValue: !!item && Object.prototype.hasOwnProperty.call(item, childColumn.name),
        value: item && Object.prototype.hasOwnProperty.call(item, childColumn.name) ? CDBVS.cloneValue(item[childColumn.name]) : null
      };
      state.rowClipboard = null;
      if (cut) {
        item[childColumn.name] = null;
        rerender();
        if (!deferChanges) CDBVS.sendUpdate();
      }
      return true;
    };
    const pasteSelectedListCell = () => {
      const selected = selectedListCell();
      const clipboard = state.cellClipboard;
      if (!selected || !clipboard || !schema.columns[selected.columnIndex]) return false;
      const item = values[selected.itemIndex];
      if (!item) return false;
      const childColumn = schema.columns[selected.columnIndex];
      item[childColumn.name] = clipboard.hasValue ? CDBVS.cloneValue(clipboard.value) : null;
      rerender();
      if (!deferChanges) CDBVS.sendUpdate();
      return true;
    };
    const deleteSelectedListCell = () => {
      const selected = selectedListCell();
      if (!selected || !schema.columns[selected.columnIndex]) return false;
      const item = values[selected.itemIndex];
      if (!item) return false;
      item[schema.columns[selected.columnIndex].name] = null;
      rerender();
      if (!deferChanges) CDBVS.sendUpdate();
      return true;
    };
    const showNestedCellContextMenu = (event) => {
      if (typeof CDBVS.showContextMenu !== "function") return;
      CDBVS.showContextMenu(event, [
        { label: "Copy cell", action: () => copySelectedListCell(false) },
        { label: "Cut cell", action: () => copySelectedListCell(true) },
        { label: "Paste cell", action: pasteSelectedListCell },
        { separator: true },
        { label: "Clear cell", action: deleteSelectedListCell }
      ]);
    };
    cell._cdbvsHasSelectedListCell = () => !!selectedListCell();
    cell._cdbvsHasSelectedListItem = () => selectedListItems().length > 0;
    cell._cdbvsMoveSelectedListItem = moveSelectedListItem;
    cell._cdbvsActivateSelectedListCell = activateSelectedListCell;
    cell._cdbvsExitSelectedListCell = exitSelectedListCell;
    cell._cdbvsDeleteSelectedListCell = deleteSelectedListCell;
    cell._cdbvsCopySelectedListCell = copySelectedListCell;
    cell._cdbvsPasteSelectedListCell = pasteSelectedListCell;
    const insertSelectedListItem = () => {
      if (!Array.isArray(row[column.name])) row[column.name] = values;
      const selected = currentSelectedItem();
      const insertAt = selected === null ? values.length : selected + 1;
      values.splice(insertAt, 0, createRowForSchema(schema, values));
      storeSelectedItems([insertAt], insertAt, insertAt);
      state.expandedLists.add(key);
      rerender();
      if (!deferChanges) CDBVS.sendUpdate();
      return true;
    };
    cell._cdbvsInsertSelectedListItem = insertSelectedListItem;
    const closeExpandedList = () => {
      const toggle = cell.querySelector(".list-toggle.expanded");
      if (!toggle) return false;
      if (typeof cell._cdbvsToggleList === "function") cell._cdbvsToggleList();
      else if (typeof toggle.click === "function") toggle.click();
      else if (typeof toggle.dispatchEvent === "function") toggle.dispatchEvent({
        type: "click", target: toggle, preventDefault() {}, stopPropagation() {}
      });
      return true;
    };
    cell._cdbvsCloseExpandedList = closeExpandedList;
    cell._cdbvsNavigateListGrid = (rowDelta, columnDelta) => {
      if (!expanded || (rowDelta !== -1 && rowDelta !== 0 && rowDelta !== 1)
        || (columnDelta !== -1 && columnDelta !== 0 && columnDelta !== 1)) return false;
      const rows = listItemRows();
      if (!rows.length) return false;
      const columns = schema.columns || [];
      const currentCell = selectedListCell();
      if (!columns.length) {
        const currentRow = currentSelectedItem();
        if (currentRow === null && rowDelta < 0) return false;
        const nextRow = currentRow === null ? 0 : currentRow + rowDelta;
        if (nextRow < 0) {
          delete state.selectedListRows[key];
          if (state.listSelectionAnchors) delete state.listSelectionAnchors[key];
          updateListItemSelection(new Set());
          if (editSheet && typeof CDBVS.deactivateCell === "function") CDBVS.deactivateCell(editSheet);
          if (typeof cell.focus === "function") cell.focus({ preventScroll: true });
          return true;
        }
        if (nextRow >= rows.length) return false;
        selectListItem(nextRow, rows[nextRow], {});
        if (typeof rows[nextRow].focus === "function") rows[nextRow].focus({ preventScroll: true });
        return true;
      }
      if (!currentCell) {
        const currentRow = currentSelectedItem();
        if (currentRow === null && rowDelta < 0) return false;
        if (rowDelta === 0 && currentRow === null) return false;
        const nextRow = currentRow === null ? 0 : currentRow + rowDelta;
        if (nextRow < 0) {
          delete state.selectedListRows[key];
          if (state.listSelectionAnchors) delete state.listSelectionAnchors[key];
          updateListItemSelection(new Set());
          if (editSheet && typeof CDBVS.deactivateCell === "function") CDBVS.deactivateCell(editSheet);
          if (typeof cell.focus === "function") cell.focus({ preventScroll: true });
          return true;
        }
        if (nextRow >= rows.length) return false;
        return selectListCell(nextRow, columnDelta > 0 ? columns.length - 1 : 0);
      }
      const nextRow = currentCell.itemIndex + rowDelta;
      const nextColumn = currentCell.columnIndex + columnDelta;
      if (nextRow < 0) {
        delete state.selectedListRows[key];
        if (state.selectedListCells) delete state.selectedListCells[key];
        if (state.listSelectionAnchors) delete state.listSelectionAnchors[key];
        updateListItemSelection(new Set());
        updateListCellSelection();
        if (editSheet && typeof CDBVS.deactivateCell === "function") CDBVS.deactivateCell(editSheet);
        if (typeof cell.focus === "function") cell.focus({ preventScroll: true });
        return true;
      }
      if (nextRow >= rows.length) return false;
      if (nextColumn < 0 || nextColumn >= columns.length) return true;
      return selectListCell(nextRow, nextColumn);
    };
    cell._cdbvsSelectListBoundary = (direction) => {
      if (!expanded || (direction !== -1 && direction !== 1)) return false;
      const rows = listItemRows();
      if (!rows.length || !(schema.columns || []).length) return false;
      if (!ensureParentCellSelected()) return false;
      return selectListCell(direction < 0 ? rows.length - 1 : 0, 0);
    };
    cell._cdbvsNavigateList = (delta) => {
      if (delta !== -1 && delta !== 1) return false;
      return cell._cdbvsNavigateListGrid(delta, 0);
    };
    const rerender = () => {
      const tableWrap = document.querySelector(".table-wrap");
      const scrollLeft = tableWrap ? tableWrap.scrollLeft : 0;
      const scrollTop = tableWrap ? tableWrap.scrollTop : 0;
      cell.replaceChildren();
      renderListCell(cell, row, column, context, schema);
      if (tableWrap) requestAnimationFrame(() => {
        tableWrap.scrollLeft = scrollLeft;
        tableWrap.scrollTop = scrollTop;
      });
    };
    const deleteSelectedListItem = () => {
      const selected = selectedListItems();
      if (!selected.length) return false;
      selected.slice().sort((left, right) => right - left).forEach((index) => values.splice(index, 1));
      if (values.length === 0) {
        row[column.name] = column.opt ? null : [];
        delete state.selectedListRows[key];
        if (state.selectedListCells) delete state.selectedListCells[key];
        if (state.listSelectionAnchors) delete state.listSelectionAnchors[key];
      } else {
        const nextIndex = Math.min(selected[selected.length - 1], values.length - 1);
        storeSelectedItems([nextIndex], nextIndex, nextIndex);
      }
      rerender();
      if (!deferChanges) CDBVS.sendUpdate();
      return true;
    };
    const toggleList = () => {
      const wasExpanded = state.expandedLists.has(key);
      if (wasExpanded) {
        const active = editSheet && typeof CDBVS.activeCell === "function" ? CDBVS.activeCell(editSheet) : null;
        if (active && active.rowIndex === editRowIndex && active.columnIndex === editColumnIndex
          && typeof CDBVS.deactivateCell === "function") CDBVS.deactivateCell(editSheet);
        state.expandedLists.delete(key);
      } else {
        ensureParentCellSelected();
        if (editSheet && typeof CDBVS.activeCell === "function" && !CDBVS.activeCell(editSheet)
          && typeof CDBVS.activateCell === "function") CDBVS.activateCell(editSheet, editRowIndex, editColumnIndex);
        state.expandedLists.add(key);
      }
      rerender();
    };
    const toggle = makeButton("", toggleList, expanded ? "list-toggle expanded" : "list-toggle");
    cell._cdbvsToggleList = toggleList;
    toggle.title = expanded ? "Collapse list" : "Expand list";
    toggle.setAttribute("aria-label", toggle.title);
    toggle.appendChild(makeElement("span", listPreview(values, schema), "list-preview"));
    toggle.appendChild(makeElement("span", expanded ? "\u25B4" : "\u25BE", "list-arrow"));
    cell.classList.add("list-cell");
    cell.appendChild(toggle);
    if (!expanded) return;

    const editor = makeElement("div", null, "list-editor");
    const editorToolbar = makeElement("div", null, "nested-toolbar");
    editorToolbar.appendChild(makeElement("span", `${schema.name} items`, "nested-title"));
    editorToolbar.appendChild(makeButton("Insert Item", insertSelectedListItem));
    const deleteItem = makeButton("Delete Item", deleteSelectedListItem, "danger-button nested-delete-item");
    deleteItem.disabled = !initialSelectedItems.length;
    editorToolbar.appendChild(deleteItem);
    editor.appendChild(editorToolbar);

    const table = document.createElement("table");
    table.className = "nested-table";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.appendChild(makeElement("th", "#", "row-number"));
    (schema.columns || []).forEach((childColumn) => {
      const th = makeElement("th", null, "nested-heading");
      th.appendChild(makeElement("span", childColumn.name || "?"));
      headRow.appendChild(th);
    });
    head.appendChild(headRow);
    table.appendChild(head);

    const body = document.createElement("tbody");
    values.forEach((rawItem, itemIndex) => {
      const item = rawItem && typeof rawItem === "object" && !Array.isArray(rawItem) ? rawItem : {};
      const itemRow = document.createElement("tr");
      itemRow.className = "nested-list-item";
      itemRow.tabIndex = -1;
      itemRow.dataset = itemRow.dataset || {};
      itemRow.dataset.itemIndex = String(itemIndex);
      itemRow.setAttribute("aria-selected", initialSelectedItems.includes(itemIndex) ? "true" : "false");
      itemRow._cdbvsDelete = deleteSelectedListItem;
      itemRow.addEventListener("keydown", (event) => {
        const keyName = String(event.key || "").toLowerCase();
        if (keyName !== "delete" && keyName !== "del") return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        if (typeof event.stopPropagation === "function") event.stopPropagation();
        deleteSelectedListItem();
      });
      if (initialSelectedItems.includes(itemIndex)) itemRow.classList.add("row-selected", "list-item-selected");
      itemRow.addEventListener("click", (event) => {
        if (!event.target.closest || event.target.closest("tr") !== itemRow) return;
        selectListItem(itemIndex, itemRow, event);
      });
      const rowNumber = makeElement("td", null, "row-number");
      const rowSelect = makeButton(String(itemIndex + 1), (event) => {
        if (typeof event.stopPropagation === "function") event.stopPropagation();
        selectListItem(itemIndex, itemRow, event);
      }, "row-select");
      rowSelect.title = `Select list item ${itemIndex + 1}`;
      rowSelect.setAttribute("aria-label", rowSelect.title);
      rowNumber.appendChild(rowSelect);
      itemRow.appendChild(rowNumber);
      (schema.columns || []).forEach((childColumn, childColumnIndex) => {
        const childCell = document.createElement("td");
        childCell.classList.add("nested-cell");
        childCell.tabIndex = -1;
        childCell.setAttribute("role", "gridcell");
        childCell.dataset.columnIndex = String(childColumnIndex);
        if (typeof CDBVS.bindCellInteractions === "function") CDBVS.bindCellInteractions(childCell, {
          sheet: editSheet,
          rowIndex: itemIndex,
          columnIndex: childColumnIndex,
          tr: itemRow,
          getSelection: () => {
            const selected = selectedListCell();
            return selected ? { rowIndex: selected.itemIndex, columnIndex: selected.columnIndex } : null;
          },
          isActive: () => !!(editSheet && typeof CDBVS.activeCell === "function" && CDBVS.activeCell(editSheet)),
          select: () => selectNestedCell(itemIndex, childColumnIndex),
          activate: (event) => {
            selectNestedCell(itemIndex, childColumnIndex);
            return activateSelectedListCell(event);
          },
          exit: exitSelectedListCell,
          stopPropagation: true,
          shouldIgnore: (target) => {
            const nestedEditor = target && target.closest && target.closest(".list-editor");
            return !!(nestedEditor && typeof childCell.contains === "function" && childCell.contains(nestedEditor));
          },
          showContextMenu: showNestedCellContextMenu
        });
        CDBVS.makeCellEditor(childCell, item, childColumn, {
          sheet: schema,
          rowIndex: itemIndex,
          path: `${context.path}/${column.name}/${itemIndex}`,
          deferChanges,
          refresh: rerender,
          editSheet,
          editRowIndex,
          editColumnIndex
        });
        itemRow.appendChild(childCell);
      });
      body.appendChild(itemRow);
    });
      table.appendChild(body);
    editor.appendChild(table);
    cell.appendChild(editor);
    updateListCellSelection();
  }

  CDBVS.renderListCell = renderListCell;
})(window);
