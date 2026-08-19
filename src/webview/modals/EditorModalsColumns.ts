// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const application = CDBVS.services.application;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const commitMutation = application.commitMutation;
  const typeOf = CDBVS.typeOf;
  const moveColumn = CDBVS.moveColumn;
  const deleteColumnAt = CDBVS.services.application.columnActions.deleteColumn;
  const applyColumnEdit = application.columnActions.applyColumnEdit;
  const createModal = CDBVS.createModal;
  const modalField = CDBVS.modalField;
  const appendModalActions = CDBVS.appendModalActions;
  const columnTypeOptions = [
    [0, "Primary ID"], [1, "Text"], [2, "Boolean"], [3, "Integer"], [4, "Float"],
    [5, "Enum"], [6, "Reference"], [7, "Image"], [8, "List"], [9, "Custom type"],
    [10, "Flags"], [11, "Color"], [12, "Layer"], [13, "File"], [14, "Tile position"],
    [15, "Tile layer"], [16, "Dynamic"], [17, "Properties"], [18, "Gradient"],
    [19, "Curve"], [20, "GUID"]
  ];
  const typeArgumentCodes = new Set([5, 6, 9, 10, 12]);

  const columnField = modalField;

  function openColumnEditor(sheet, column, columnIndex, isNew = false) {
    const { dialog, heading, footer, close } = createModal({
      className: "column-modal column-editor-modal",
      title: `${isNew ? "Add" : "Edit"} column${isNew ? "" : `: ${column.name}`}`
    });
    const form = makeElement("div", null, "column-form");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = column.name || "";
    form.appendChild(columnField("Name", nameInput));
    const currentTypeRaw = column.typeStr !== undefined ? String(column.typeStr) : String(column.type ?? "1");
    const currentType = typeOf(column);
    const typeSelect = document.createElement("select");
    columnTypeOptions.forEach(([code, label]) => typeSelect.add(new Option(`${label} (${code})`, String(code))));
    typeSelect.add(new Option("Raw / unknown type string", "raw"));
    typeSelect.value = currentType.code >= 0 && currentType.code <= 20 ? String(currentType.code) : "raw";
    form.appendChild(columnField("Type", typeSelect));
    const typeArgumentInput = document.createElement("input");
    typeArgumentInput.type = "text";
    typeArgumentInput.value = currentType.argument || "";
    const typeArgumentField = columnField("Type argument", typeArgumentInput);
    form.appendChild(typeArgumentField);
    const rawTypeInput = document.createElement("input");
    rawTypeInput.type = "text";
    rawTypeInput.value = currentTypeRaw;
    rawTypeInput.placeholder = "For unsupported or advanced CastleDB types";
    const rawTypeField = columnField("Raw type string", rawTypeInput);
    form.appendChild(rawTypeField);
    const optionalInput = document.createElement("input");
    optionalInput.type = "checkbox";
    optionalInput.checked = column.opt === true;
    form.appendChild(columnField("Optional", optionalInput, "checkbox-field"));
    const displayInput = document.createElement("select");
    displayInput.add(new Option("Default", ""));
    displayInput.add(new Option("Percentage", "1"));
    displayInput.value = column.display === 1 ? "1" : "";
    form.appendChild(columnField("Display", displayInput));
    const updateTypeControls = () => {
      const code = Number(typeSelect.value);
      const hasArgument = typeSelect.value !== "raw" && typeArgumentCodes.has(code);
      typeArgumentField.hidden = !hasArgument;
      rawTypeField.hidden = typeSelect.value !== "raw";
      if (code === 5) typeArgumentInput.placeholder = "Enum values, comma-separated";
      else if (code === 6) typeArgumentInput.placeholder = "Reference sheet name";
      else if (code === 9) typeArgumentInput.placeholder = "Custom type name";
      else if (code === 10) typeArgumentInput.placeholder = "Flag names, comma-separated";
      else if (code === 12) typeArgumentInput.placeholder = "Layer name";
      else typeArgumentInput.placeholder = "Type-specific argument";
    };
    updateTypeControls();
    typeSelect.addEventListener("change", updateTypeControls);
    const error = makeElement("div", null, "column-form-error");
    form.appendChild(error);
    footer.className = "text-modal-footer column-modal-footer";
    const showError = (message) => { error.textContent = message; };
    const removeColumn = () => {
      if (isNew) { close(); return; }
      commitMutation(() => deleteColumnAt(sheet, columnIndex));
      close();
    };
    const save = () => {
      const newName = nameInput.value.trim();
      const selectedType = typeSelect.value === "raw" ? rawTypeInput.value.trim() : `${typeSelect.value}${typeArgumentCodes.has(Number(typeSelect.value)) && typeArgumentInput.value.trim() ? `:${typeArgumentInput.value.trim()}` : ""}`;
      const result = applyColumnEdit(sheet, column, columnIndex, {
        name: newName,
        typeString: selectedType,
        optional: optionalInput.checked,
        display: displayInput.value,
        isNew
      });
      if (!result.ok) { showError(result.message); return; }
      close();
      commitMutation();
    };
    const moveLeft = makeButton("Move left", () => { close(); moveColumn(sheet, columnIndex, -1); });
    moveLeft.disabled = isNew || columnIndex <= 0;
    const moveRight = makeButton("Move right", () => { close(); moveColumn(sheet, columnIndex, 1); });
    moveRight.disabled = isNew || columnIndex >= sheet.columns.length - 1;
    footer.appendChild(moveLeft);
    footer.appendChild(moveRight);
    footer.appendChild(makeButton(isNew ? "Discard column" : "Delete column", removeColumn, "danger-button"));
    appendModalActions(footer, close, save);
    dialog.appendChild(form);
    dialog.appendChild(footer);
    nameInput.focus();
    nameInput.select();
  }

  function openNewColumnEditor(sheet, columnIndex) {
    if (!sheet || !Array.isArray(sheet.columns)) return;
    const names = new Set(sheet.columns.map((column) => column && column.name));
    let name = "newColumn";
    let suffix = 1;
    while (names.has(name)) name = `newColumn${++suffix}`;
    const index = Math.max(0, Math.min(Number.isInteger(columnIndex) ? columnIndex : sheet.columns.length, sheet.columns.length));
    openColumnEditor(sheet, { name, typeStr: "1", opt: true }, index, true);
  }

  Object.assign(CDBVS, { columnField, openColumnEditor, openNewColumnEditor });
})(window);
