// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const model = CDBVS.services.document.operations;
  const commitMutation = CDBVS.services.application.commitMutation;
  const commitCellMutation = CDBVS.services.application.commitCellMutation;
  const makeElement = CDBVS.makeElement;
  const appendModalActions = CDBVS.appendModalActions;
  const createModal = CDBVS.createModal;
  const setActiveModal = CDBVS.setActiveModal;
  const typeLabel = CDBVS.typeLabel;
  const idColumn = CDBVS.idColumn;
  const updateRow = model.rows.update;
  const setCellValue = model.values.setCell;

  function cloneRowForEditor(row) {
    return CDBVS.cloneValue(row && typeof row === "object" && !Array.isArray(row) ? row : {}) || {};
  }

  function openRowEditor(sheet, rowIndex) {
    if (!sheet || !Array.isArray(sheet.lines) || !sheet.lines[rowIndex]) return;
    const row = sheet.lines[rowIndex];
    const draft = cloneRowForEditor(row);
    const primary = idColumn(sheet);
    const rowLabel = primary && draft[primary.name] !== undefined ? `: ${draft[primary.name]}` : ` ${rowIndex + 1}`;
    const { overlay, dialog, footer, close } = createModal({ className: "row-modal", title: `Edit row${rowLabel}` });
    const form = makeElement("div", null, "row-form");
    const save = () => {
      form.querySelectorAll("input, select, textarea").forEach((input) => input.dispatchEvent(new Event("change", { bubbles: false })));
      close();
      commitMutation(() => updateRow(sheet, rowIndex, draft));
    };
    (sheet.columns || []).forEach((column) => {
      const field = makeElement("div", null, "row-field");
      const label = makeElement("label", column.name || "?", "row-field-label");
      label.title = `${column.name || "?"} (${typeLabel(column)})`;
      const editor = makeElement("div", null, "row-field-editor");
      CDBVS.makeCellEditor(editor, draft, column, { sheet, rowIndex, path: `${sheet.name}/${rowIndex}/modal`, deferChanges: true });
      field.appendChild(label);
      field.appendChild(editor);
      form.appendChild(field);
    });
    appendModalActions(footer, close, save);
    dialog.appendChild(form);
    dialog.appendChild(footer);
    overlay.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") save();
    });
    const firstControl = form.querySelector("input, select, textarea");
    if (firstControl) firstControl.focus();
  }

  function openTextEditor(row, column, input) {
    const { overlay, dialog, footer, close } = createModal({ title: `Edit ${column.name}` });
    const textarea = document.createElement("textarea");
    textarea.value = input.value;
    textarea.spellcheck = false;
    const save = () => {
      close();
      commitCellMutation(() => {
        setCellValue(row, column, textarea.value);
        input.value = textarea.value;
      });
    };
    appendModalActions(footer, close, save, { cancelClass: "button" });
    dialog.appendChild(textarea);
    dialog.appendChild(footer);
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") save();
    });
    document.body.appendChild(overlay);
    setActiveModal(overlay);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  Object.assign(CDBVS, { openRowEditor, openTextEditor });
})(window);
