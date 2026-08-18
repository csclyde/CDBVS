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
    const currentSelectedItem = () => {
      const selected = selectedListItems();
      return selected.length ? selected[selected.length - 1] : null;
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
      const selected = new Set(selectedListItems());
      cell.querySelectorAll(".nested-table tbody tr").forEach((rowElement) => {
        const rowIndex = Number.parseInt(rowElement.dataset && rowElement.dataset.itemIndex, 10);
        const isSelected = selected.has(rowIndex);
        if (isSelected) rowElement.classList.add("row-selected", "list-item-selected");
        else rowElement.classList.remove("row-selected", "list-item-selected");
        rowElement.setAttribute("aria-selected", isSelected ? "true" : "false");
      });
      const deleteButton = cell.querySelector(".nested-delete-item");
      if (deleteButton) deleteButton.disabled = !selected.size;
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
        if (state.listSelectionAnchors) delete state.listSelectionAnchors[key];
      } else {
        const nextIndex = Math.min(selected[selected.length - 1], values.length - 1);
        storeSelectedItems([nextIndex], nextIndex, nextIndex);
      }
      rerender();
      if (!deferChanges) CDBVS.sendUpdate();
      return true;
    };
    const toggle = makeButton("", () => {
      if (state.expandedLists.has(key)) state.expandedLists.delete(key);
      else state.expandedLists.add(key);
      rerender();
    }, expanded ? "list-toggle expanded" : "list-toggle");
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
    editorToolbar.appendChild(makeButton("Insert Item", () => {
      if (!Array.isArray(row[column.name])) row[column.name] = values;
      const selected = currentSelectedItem();
      const insertAt = selected === null ? values.length : selected + 1;
      values.splice(insertAt, 0, createRowForSchema(schema, values));
      storeSelectedItems([insertAt], insertAt, insertAt);
      state.expandedLists.add(key);
      rerender();
      if (!deferChanges) CDBVS.sendUpdate();
    }));
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
      if (item !== rawItem) values[itemIndex] = item;
      const itemRow = document.createElement("tr");
      itemRow.className = "nested-list-item";
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
      (schema.columns || []).forEach((childColumn) => {
        const childCell = document.createElement("td");
        CDBVS.makeCellEditor(childCell, item, childColumn, {
          sheet: schema,
          rowIndex: itemIndex,
          path: `${context.path}/${column.name}/${itemIndex}`,
          deferChanges,
          refresh: rerender
        });
        itemRow.appendChild(childCell);
      });
      body.appendChild(itemRow);
    });
    table.appendChild(body);
    editor.appendChild(table);
    cell.appendChild(editor);
  }

  CDBVS.renderListCell = renderListCell;
})(window);
