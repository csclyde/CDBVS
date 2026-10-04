// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const services = CDBVS.services;
  const model = services.document.operations;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const listKey = CDBVS.listKey;
  const listPreview = CDBVS.listPreview;
  const sheetState = services.sheetState;
  const listState = sheetState.lists;
  const commitCellMutation = services.application.commitCellMutation;
  const refreshCell = CDBVS.refreshCell;
  const setCellValue = model.values.setCell;

  function renderPropertiesCell(cell, row, column, context, schema) {
    const deferChanges = context && context.deferChanges === true;
    const editSheet = context && (context.editSheet || context.sheet);
    const editRowIndex = context && (Number.isInteger(context.editRowIndex) ? context.editRowIndex : context.rowIndex);
    const editColumnIndex = context && (Number.isInteger(context.editColumnIndex)
      ? context.editColumnIndex
      : (editSheet && Array.isArray(editSheet.columns) ? editSheet.columns.indexOf(column) : -1));
    const properties = row[column.name] && typeof row[column.name] === "object" && !Array.isArray(row[column.name]) ? row[column.name] : {};
    const key = listKey(context, column);
    const expanded = listState.isExpanded(key);
    const refresh = () => refreshCell(cell, () => renderPropertiesCell(cell, row, column, context, schema));
    const applyPropertyMutation = (mutator, persist) => {
      if (deferChanges || !persist) {
        mutator();
        refresh();
      } else commitCellMutation(mutator, refresh);
    };
    const preview = Object.keys(properties).length ? listPreview([properties], schema) : "empty properties";
    const toggleProperties = (event) => {
      if (event && typeof event.stopPropagation === "function") event.stopPropagation();
      const wasExpanded = listState.isExpanded(key);
      if (wasExpanded && typeof CDBVS.commitCellEditors === "function" && !CDBVS.commitCellEditors(cell)) return false;
      const rawValue = row[column.name];
      const needsObject = !rawValue || typeof rawValue !== "object" || Array.isArray(rawValue);
      if (!wasExpanded && rawValue !== undefined && rawValue !== null && needsObject) {
        CDBVS.setStatus("This properties value is not an object. Use Raw JSON to repair it before editing.", true);
        return false;
      }
      const documentChanged = wasExpanded ? column.opt && Object.keys(properties).length === 0 : needsObject;
      applyPropertyMutation(() => {
        listState.setExpanded(key, !wasExpanded);
        if (wasExpanded) {
          if (column.opt && Object.keys(properties).length === 0) setCellValue(row, column, null);
        } else {
          setCellValue(row, column, properties);
        }
        return true;
      }, documentChanged);
    };
    const toggle = makeButton("", toggleProperties, expanded ? "list-toggle expanded" : "list-toggle");
    cell._cdbvsToggleList = toggleProperties;
    toggle.title = expanded ? "Collapse properties" : "Expand properties";
    toggle.setAttribute("aria-label", toggle.title);
    toggle.appendChild(makeElement("span", preview, "list-preview"));
    toggle.appendChild(makeElement("span", expanded ? "\u25B4" : "\u25BE", "list-arrow"));
    cell.classList.add("list-cell");
    cell.appendChild(toggle);
    if (!expanded) return;

    const editor = makeElement("div", null, "list-editor properties-editor");
    editor.addEventListener("focusin", (event) => {
      if (!event.target || !event.target.closest("input, textarea, select")) return;
      if (context && typeof context.activateProperties === "function") {
        if (context.activateProperties() !== false && document.activeElement !== event.target) event.target.focus();
        return;
      }
      const active = CDBVS.activeCell(editSheet);
      if (deferChanges || (active && active.rowIndex === editRowIndex && active.columnIndex === editColumnIndex)) return;
      const selected = CDBVS.selectedCell(editSheet);
      if ((!selected || selected.rowIndex !== editRowIndex || selected.columnIndex !== editColumnIndex)
        && CDBVS.selectRenderedCell(editSheet, editRowIndex, editColumnIndex) === false) return;
      cell.querySelectorAll("input, textarea, select").forEach((control) => {
        if (typeof control._cdbvsBeginEdit === "function") control._cdbvsBeginEdit();
      });
      CDBVS.activateCell(editSheet, editRowIndex, editColumnIndex);
      cell.classList.add("cell-active");
      CDBVS.updateCellModeHint();
      if (document.activeElement !== event.target) event.target.focus();
    });
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
      CDBVS.makeCellEditor(propertyCell, properties, childColumn, {
        sheet: schema,
        rowIndex: 0,
        path: `${context.path}/${column.name}/properties`,
        deferChanges,
        rowEditor: !!(context && context.rowEditor),
        editSheet,
        editRowIndex,
        editColumnIndex
      });
      propertyRow.appendChild(propertyCell);
      body.appendChild(propertyRow);
    });
    table.appendChild(body);
    editor.appendChild(table);
    cell.appendChild(editor);
  }

  CDBVS.capabilities.cells.renderPropertiesCell = renderPropertiesCell;
  CDBVS.renderPropertiesCell = renderPropertiesCell;
})(window);
