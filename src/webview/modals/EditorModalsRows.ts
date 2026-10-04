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
    if (typeof CDBVS.prepareCellTransition === "function" && !CDBVS.prepareCellTransition()) return false;
    if (!sheet || !Array.isArray(sheet.lines) || !sheet.lines[rowIndex]) return;
    const row = sheet.lines[rowIndex];
    const draft = cloneRowForEditor(row);
    const primary = idColumn(sheet);
    const rowLabel = primary && draft[primary.name] !== undefined ? `: ${draft[primary.name]}` : ` ${rowIndex + 1}`;
    const { overlay, dialog, footer, close } = createModal({ className: "row-modal", title: `Edit row${rowLabel}` });
    const form = makeElement("div", null, "row-form");
    const inputDrafts = overlay._cdbvsDrafts;
    overlay._cdbvsDrafts = () => {
      const drafts = inputDrafts();
      if (JSON.stringify(draft) !== JSON.stringify(row)) drafts.unshift({ label: `${sheet.name} / Row ${rowIndex + 1} draft`, text: JSON.stringify(draft, null, "\t") });
      return drafts;
    };
    const save = () => {
      if (!CDBVS.commitCellEditors(form)) return;
      if (commitMutation(() => updateRow(sheet, rowIndex, draft)) === false) {
        CDBVS.setStatus("The row could not be updated. Your draft is still open.", true);
        return;
      }
      close();
    };
    (sheet.columns || []).forEach((column) => {
      const field = makeElement("div", null, "row-field");
      const label = makeElement("label", column.name || "?", "row-field-label");
      label.title = `${column.name || "?"} (${typeLabel(column)})`;
      const editor = makeElement("div", null, "row-field-editor");
      CDBVS.makeCellEditor(editor, draft, column, { sheet, rowIndex, path: `${sheet.name}/${rowIndex}/modal`, deferChanges: true, rowEditor: true });
      field.appendChild(label);
      field.appendChild(editor);
      form.appendChild(field);
    });
    appendModalActions(footer, close, save);
    dialog.appendChild(form);
    dialog.appendChild(footer);
    const firstControl = form.querySelector("input, select, textarea");
    if (firstControl) firstControl.focus();
  }

  function openTextEditor(row, column, input) {
    if (typeof CDBVS.prepareCellTransition === "function" && !CDBVS.prepareCellTransition()) return false;
    const { overlay, dialog, footer, close } = createModal({ title: `Edit ${column.name}` });
    const textarea = document.createElement("textarea");
    textarea.value = input.value;
    overlay._cdbvsDrafts = () => textarea.value !== input.value ? [{ label: `${column.name} text draft`, text: textarea.value }] : [];
    textarea.spellcheck = false;
    const save = () => {
      if (commitCellMutation(() => {
        setCellValue(row, column, textarea.value);
        input.value = textarea.value;
      }) === false) return;
      close();
    };
    appendModalActions(footer, close, save, { cancelClass: "button" });
    dialog.appendChild(textarea);
    dialog.appendChild(footer);
    document.body.appendChild(overlay);
    setActiveModal(overlay);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  Object.assign(CDBVS, { openRowEditor, openTextEditor });
})(window);
