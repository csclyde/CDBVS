// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const listPreview = CDBVS.listPreview;

  // Lists deliberately have one interaction now: activate the cell to open
  // the modal editor. Keeping the cell as a single button means mouse and
  // keyboard activation follow the same path, including Enter from a selected
  // cell and direct clicks on the preview.
  function renderListCell(cell, row, column, context, schema) {
    const values = Array.isArray(row[column.name]) ? row[column.name] : [];
    const editSheet = context && (context.editSheet || context.sheet);
    const editRowIndex = context && (Number.isInteger(context.editRowIndex)
      ? context.editRowIndex : context.rowIndex);
    const editColumnIndex = context && (Number.isInteger(context.editColumnIndex)
      ? context.editColumnIndex
      : (editSheet && Array.isArray(editSheet.columns) ? editSheet.columns.indexOf(column) : -1));
    const open = (event) => {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      if (event && typeof event.stopPropagation === "function") event.stopPropagation();
      if (typeof CDBVS.openListEditor !== "function") {
        CDBVS.setStatus("The list editor is unavailable.", true);
        return false;
      }
      return CDBVS.openListEditor(editSheet, row, column, schema, {
        context,
        rowIndex: editRowIndex,
        columnIndex: editColumnIndex,
        deferChanges: !!(context && context.deferChanges),
        onDraftChange: (context && context.refresh) || (() => {
          cell.replaceChildren();
          renderListCell(cell, row, column, context, schema);
        })
      });
    };
    const button = makeButton("", open, "list-toggle");
    button.title = `Edit ${column.name || "list"} items`;
    button.setAttribute("aria-label", button.title);
    button.appendChild(makeElement("span", listPreview(values, schema), "list-preview"));
    button.appendChild(makeElement("span", "✎", "list-edit-icon"));
    cell.classList.add("list-cell");
    cell.appendChild(button);
    cell._cdbvsToggleList = open;
    cell._cdbvsOpenListEditor = open;
    // Compatibility hooks fail closed; inline rows no longer exist.
    cell._cdbvsHasSelectedListCell = () => false;
    cell._cdbvsHasSelectedListItem = () => false;
    cell._cdbvsNavigateListGrid = () => false;
    cell._cdbvsNavigateList = () => false;
    cell._cdbvsSelectListBoundary = () => false;
    cell._cdbvsCloseExpandedList = () => false;
    return cell;
  }

  CDBVS.capabilities.cells.renderListCell = renderListCell;
  CDBVS.renderListCell = renderListCell;
})(window);
