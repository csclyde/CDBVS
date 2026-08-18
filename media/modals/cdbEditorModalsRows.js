(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const renderAfterUpdate = CDBVS.renderAfterUpdate;
  const closeModal = CDBVS.closeModal;
  const closeActiveModal = CDBVS.closeActiveModal;
  const setActiveModal = CDBVS.setActiveModal;
  const typeLabel = CDBVS.typeLabel;
  const idColumn = CDBVS.idColumn;

  function closeExistingModal() {
    closeActiveModal();
  }

  function cloneRowForEditor(row) {
    return CDBVS.cloneValue(row && typeof row === "object" && !Array.isArray(row) ? row : {}) || {};
  }

  function openRowEditor(sheet, rowIndex) {
    if (!sheet || !Array.isArray(sheet.lines) || !sheet.lines[rowIndex]) return;
    closeExistingModal();
    const row = sheet.lines[rowIndex];
    const draft = cloneRowForEditor(row);
    const overlay = makeElement("div", null, "text-modal-overlay");
    const dialog = makeElement("section", null, "text-modal row-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const heading = makeElement("div", null, "text-modal-heading");
    const primary = idColumn(sheet);
    const rowLabel = primary && draft[primary.name] !== undefined ? `: ${draft[primary.name]}` : ` ${rowIndex + 1}`;
    heading.appendChild(makeElement("strong", `Edit row${rowLabel}`));
    const form = makeElement("div", null, "row-form");
    const close = () => closeModal(overlay);
    const save = () => {
      form.querySelectorAll("input, select, textarea").forEach((input) => input.dispatchEvent(new Event("change", { bubbles: false })));
      Object.keys(row).forEach((key) => delete row[key]);
      Object.assign(row, draft);
      close();
      renderAfterUpdate();
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
    heading.appendChild(makeButton("x", close, "text-modal-close"));
    const footer = makeElement("div", null, "text-modal-footer");
    footer.appendChild(makeButton("Cancel", close, "modal-cancel"));
    footer.appendChild(makeButton("Save", save, "button primary"));
    dialog.appendChild(heading);
    dialog.appendChild(form);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") save();
    });
    document.body.appendChild(overlay);
    setActiveModal(overlay);
    const firstControl = form.querySelector("input, select, textarea");
    if (firstControl) firstControl.focus();
  }

  function openTextEditor(row, column, input) {
    closeExistingModal();
    const overlay = makeElement("div", null, "text-modal-overlay");
    const dialog = makeElement("section", null, "text-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const heading = makeElement("div", null, "text-modal-heading");
    heading.appendChild(makeElement("strong", `Edit ${column.name}`));
    const textarea = document.createElement("textarea");
    textarea.value = input.value;
    textarea.spellcheck = false;
    const footer = makeElement("div", null, "text-modal-footer");
    const close = () => closeModal(overlay);
    const save = () => {
      row[column.name] = textarea.value;
      input.value = textarea.value;
      close();
      renderAfterUpdate();
    };
    heading.appendChild(makeButton("x", close, "text-modal-close"));
    footer.appendChild(makeButton("Cancel", close));
    footer.appendChild(makeButton("Save", save, "button primary"));
    dialog.appendChild(heading);
    dialog.appendChild(textarea);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
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
