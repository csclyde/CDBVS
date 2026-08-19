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
      const rawValue = row[column.name];
      const needsObject = !rawValue || typeof rawValue !== "object" || Array.isArray(rawValue);
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
