(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const typeOf = CDBVS.typeOf;
  const currentSheet = CDBVS.currentSheet;
  const listSheet = CDBVS.listSheet;
  const listKey = CDBVS.listKey;
  const listPreview = CDBVS.listPreview;
  const createRowForSchema = CDBVS.createRowForSchema;
  const readValue = CDBVS.readValue;
  const valueText = CDBVS.valueText;
  const colorText = CDBVS.colorText;
  const referenceOptions = CDBVS.referenceOptions;
  const sendUpdate = () => CDBVS.sendUpdate();
  const setStatus = (message, error) => CDBVS.setStatus(message, error);
  const openTextEditor = (...args) => CDBVS.openTextEditor(...args);
  function canSyncInputValue(type, input) {
    const value = String(input.value || "").trim();
    if (type.code === 1 || type.code === 11) return true;
    if (type.code === 3) return /^[-+]?\d+$/.test(value);
    if (type.code === 4) return /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value);
    return false;
  }
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
      cell.querySelectorAll(".nested-table tbody tr").forEach((row) => {
        const rowIndex = Number.parseInt(row.dataset && row.dataset.itemIndex, 10);
        const isSelected = selected.has(rowIndex);
        if (isSelected) row.classList.add("row-selected", "list-item-selected");
        else row.classList.remove("row-selected", "list-item-selected");
        row.setAttribute("aria-selected", isSelected ? "true" : "false");
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
      if (!deferChanges) sendUpdate();
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
      if (!deferChanges) sendUpdate();
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
        makeCellEditor(childCell, item, childColumn, {
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

  function renderPropertiesCell(cell, row, column, context, schema) {
    const deferChanges = context && context.deferChanges === true;
    const properties = row[column.name] && typeof row[column.name] === "object" && !Array.isArray(row[column.name]) ? row[column.name] : {};
    const key = listKey(context, column);
    const expanded = state.expandedLists.has(key);
    const preview = Object.keys(properties).length ? listPreview([properties], schema) : "empty properties";
    const toggle = makeButton("", () => {
      const tableWrap = document.querySelector(".table-wrap");
      const scrollLeft = tableWrap ? tableWrap.scrollLeft : 0;
      const scrollTop = tableWrap ? tableWrap.scrollTop : 0;
      if (state.expandedLists.has(key)) {
        state.expandedLists.delete(key);
        if (column.opt && Object.keys(properties).length === 0) row[column.name] = null;
      } else {
        state.expandedLists.add(key);
        row[column.name] = properties;
      }
      cell.replaceChildren();
      renderPropertiesCell(cell, row, column, context, schema);
      if (tableWrap) requestAnimationFrame(() => {
        tableWrap.scrollLeft = scrollLeft;
        tableWrap.scrollTop = scrollTop;
      });
    }, expanded ? "list-toggle expanded" : "list-toggle");
    toggle.title = expanded ? "Collapse properties" : "Expand properties";
    toggle.setAttribute("aria-label", toggle.title);
    toggle.appendChild(makeElement("span", preview, "list-preview"));
    toggle.appendChild(makeElement("span", expanded ? "\u25B4" : "\u25BE", "list-arrow"));
    cell.classList.add("list-cell");
    cell.appendChild(toggle);
    if (!expanded) return;

    const editor = makeElement("div", null, "list-editor properties-editor");
    const editorToolbar = makeElement("div", null, "nested-toolbar");
    editorToolbar.appendChild(makeElement("span", `${schema.name} properties`, "nested-title"));
    editor.appendChild(editorToolbar);
    const table = document.createElement("table");
    table.className = "nested-table properties-table";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.appendChild(makeElement("th", "Property"));
    headRow.appendChild(makeElement("th", "Value"));
    head.appendChild(headRow);
    table.appendChild(head);
    const body = document.createElement("tbody");
    (schema.columns || []).forEach((childColumn) => {
      const propertyRow = document.createElement("tr");
      const label = makeElement("th", null, "nested-heading");
      label.appendChild(makeElement("span", childColumn.name || "?"));
      propertyRow.appendChild(label);
      const propertyCell = document.createElement("td");
      makeCellEditor(propertyCell, properties, childColumn, {
        sheet: schema,
        rowIndex: 0,
        path: `${context.path}/${column.name}/properties`,
        deferChanges
      });
      propertyRow.appendChild(propertyCell);
      body.appendChild(propertyRow);
    });
    table.appendChild(body);
    editor.appendChild(table);
    cell.appendChild(editor);
  }

  function makeCellEditor(cell, row, column, context) {
    const type = typeOf(column);
    const value = row[column.name];
    const cellContext = context || { sheet: currentSheet(), rowIndex: 0, path: "root" };
    if (type.code === 8) {
      const schema = listSheet(cellContext.sheet, column);
      if (schema) {
        renderListCell(cell, row, column, cellContext, schema);
        return;
      }
    }
    if (type.code === 17) {
      const schema = listSheet(cellContext.sheet, column);
      if (schema) {
        renderPropertiesCell(cell, row, column, cellContext, schema);
        return;
      }
    }
    let input;
    const refreshAfterCommit = () => {
      if (typeof cellContext.refresh === "function") cellContext.refresh();
      else if (typeof CDBVS.render === "function") CDBVS.render();
    };
    if (type.code === 10 && type.values.length) {
      const flags = makeElement("div", null, "flags-input");
      let current = Number(value) || 0;
      type.values.forEach((label, flagIndex) => {
        const flagLabel = makeElement("label", null, "flag-item");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = (current & (1 << flagIndex)) !== 0;
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) current |= 1 << flagIndex;
          else current &= ~(1 << flagIndex);
          if (column.opt && current === 0) row[column.name] = null;
          else row[column.name] = current;
          if (!cellContext.deferChanges) {
            sendUpdate();
            refreshAfterCommit();
          }
        });
        flagLabel.appendChild(checkbox);
        flagLabel.appendChild(makeElement("span", label));
        flags.appendChild(flagLabel);
      });
      cell.appendChild(flags);
      return;
    } else if (type.code === 2) {
      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = value === true;
      input.className = "bool-input";
    } else if (type.code === 5) {
      input = document.createElement("select");
      const values = type.values.length ? type.values : ["0"];
      values.forEach((label, index) => input.add(new Option(label, String(index))));
      input.value = String(value ?? 0);
    } else if (type.code === 6 && referenceOptions(column)) {
      input = document.createElement("select");
      input.add(new Option("", ""));
      referenceOptions(column).forEach((item) => input.add(new Option(String(item), String(item))));
      input.value = String(value ?? "");
    } else {
      input = document.createElement("input");
      input.type = type.code === 11 ? "color" : ((type.code === 3 || type.code === 4 || type.code === 10) ? "number" : "text");
      input.step = type.code === 4 ? "any" : "1";
      input.value = type.code === 11 ? colorText(value) : valueText(value);
      if (type.code === 11) input.classList.add("color-input");
      if ([8, 9, 14, 15, 16, 17, 18, 19].includes(type.code)) input.classList.add("json-input");
    }
    input.title = `${column.name} (${type.name})`;
    input.addEventListener("input", () => {
      if (cellContext.deferChanges || !canSyncInputValue(type, input)) return;
      const next = readValue(input, column);
      if (next === undefined) return;
      row[column.name] = next;
      if (typeof CDBVS.scheduleUpdate === "function") CDBVS.scheduleUpdate();
      else sendUpdate();
    });
    input.addEventListener("change", () => {
      const next = readValue(input, column);
      const complex = [8, 9, 14, 15, 16, 17, 18, 19].includes(type.code);
      if (complex && input.value !== "" && next === undefined) {
        setStatus("Complex values must contain valid JSON before they can be saved.", true);
        return;
      }
      if (next !== undefined) row[column.name] = next;
      if (!cellContext.deferChanges) {
        sendUpdate();
        refreshAfterCommit();
      }
    });
    if (type.code === 1 && !cellContext.deferChanges) {
      input.title = `${column.name} (text) - double-click to open the larger editor`;
      input.addEventListener("dblclick", (event) => {
        event.preventDefault();
        openTextEditor(row, column, input);
      });
      cell.appendChild(input);
    } else {
      cell.appendChild(input);
    }
  }

  Object.assign(CDBVS, { renderListCell, renderPropertiesCell, makeCellEditor });
})(window);
