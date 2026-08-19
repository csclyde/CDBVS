// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const renderAfterUpdate = CDBVS.renderAfterUpdate;
  const typeOf = CDBVS.typeOf;
  const renameViewColumn = CDBVS.renameViewColumn;
  const moveColumn = CDBVS.moveColumn;
  const deleteColumnAt = CDBVS.deleteColumnAt;
  const mapTypeStrings = CDBVS.mapTypeStrings;
  const setPrimaryColumn = CDBVS.setPrimaryColumn;
  const clearListState = CDBVS.clearListState;
  const createModal = CDBVS.createModal;
  const isNestedType = CDBVS.isNestedType;
  const prepareColumnTypeChange = CDBVS.prepareColumnTypeChange;
  const ensureNestedSheet = CDBVS.ensureNestedSheet;
  const removeNestedSheet = CDBVS.removeNestedSheet;
  const defaultValue = CDBVS.defaultValue;
  const columnTypeOptions = [
    [0, "Primary ID"], [1, "Text"], [2, "Boolean"], [3, "Integer"], [4, "Float"],
    [5, "Enum"], [6, "Reference"], [7, "Image"], [8, "List"], [9, "Custom type"],
    [10, "Flags"], [11, "Color"], [12, "Layer"], [13, "File"], [14, "Tile position"],
    [15, "Tile layer"], [16, "Dynamic"], [17, "Properties"], [18, "Gradient"],
    [19, "Curve"], [20, "GUID"]
  ];
  const typeArgumentCodes = new Set([5, 6, 9, 10, 12]);

  function columnField(label, control, className) {
    const field = makeElement("label", null, `column-field${className ? ` ${className}` : ""}`);
    field.appendChild(makeElement("span", label));
    field.appendChild(control);
    return field;
  }

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
      deleteColumnAt(sheet, columnIndex);
      close();
      renderAfterUpdate();
    };
    const save = () => {
      const newName = nameInput.value.trim();
      if (!newName) { showError("Column name cannot be empty."); return; }
      if (sheet.columns.some((item, index) => (isNew || index !== columnIndex) && item.name === newName)) { showError(`Column '${newName}' already exists on this sheet.`); return; }
      const selectedType = typeSelect.value === "raw" ? rawTypeInput.value.trim() : `${typeSelect.value}${typeArgumentCodes.has(Number(typeSelect.value)) && typeArgumentInput.value.trim() ? `:${typeArgumentInput.value.trim()}` : ""}`;
      if (!selectedType) { showError("Type cannot be empty."); return; }
      const oldName = column.name;
      const oldNested = isNestedType(typeOf(column));
      const preparedType = prepareColumnTypeChange(sheet, column, selectedType);
      if (!preparedType.ok) { showError(preparedType.message); return; }
      const typeProperty = Object.prototype.hasOwnProperty.call(column, "typeStr") ? "typeStr" : (Object.prototype.hasOwnProperty.call(column, "type") ? "type" : "typeStr");
      if (!isNew && oldName !== newName) {
        (sheet.lines || []).forEach((line) => {
          if (!line || !Object.prototype.hasOwnProperty.call(line, oldName)) return;
          if (!Object.prototype.hasOwnProperty.call(line, newName)) line[newName] = line[oldName];
          delete line[oldName];
        });
        const oldPrefix = `${sheet.name}@${oldName}`;
        const newPrefix = `${sheet.name}@${newName}`;
        (state.data.sheets || []).forEach((subSheet) => {
          if (subSheet.name === oldPrefix || subSheet.name.startsWith(`${oldPrefix}@`)) subSheet.name = `${newPrefix}${subSheet.name.slice(oldPrefix.length)}`;
        });
        mapTypeStrings((raw) => {
          const separator = raw.indexOf(":");
          if (separator < 0) return raw;
          const code = raw.slice(0, separator);
          const target = raw.slice(separator + 1);
          return (code === "6" || code === "12") && (target === oldPrefix || target.startsWith(`${oldPrefix}@`)) ? `${code}:${newPrefix}${target.slice(oldPrefix.length)}` : raw;
        });
        if (sheet.props && sheet.props.displayColumn === oldName) sheet.props.displayColumn = newName;
        if (sheet.props && sheet.props.displayIcon === oldName) sheet.props.displayIcon = newName;
        renameViewColumn(sheet.name, oldName, newName);
        clearListState();
      }
      column.name = newName;
      column[typeProperty] = selectedType;
      column.opt = optionalInput.checked;
      preparedType.values.forEach(({ line, value }) => { line[newName] = value; });
      if (!column.opt) {
        (sheet.lines || []).forEach((line) => {
          if (!line || Object.prototype.hasOwnProperty.call(line, newName)) return;
          const value = defaultValue(column, sheet);
          if (value !== null) line[newName] = value;
        });
      }
      if (displayInput.value === "") delete column.display;
      else column.display = Number(displayInput.value);
      if (isNew) sheet.columns.splice(Math.min(columnIndex, sheet.columns.length), 0, column);
      if (Number(typeSelect.value) === 0) setPrimaryColumn(sheet, column.name);
      const newNested = isNestedType(typeOf(column));
      if (oldNested && !newNested) removeNestedSheet(sheet, newName);
      else if (newNested) ensureNestedSheet(sheet, column);
      close();
      renderAfterUpdate();
    };
    const moveLeft = makeButton("Move left", () => { close(); moveColumn(sheet, columnIndex, -1); });
    moveLeft.disabled = isNew || columnIndex <= 0;
    const moveRight = makeButton("Move right", () => { close(); moveColumn(sheet, columnIndex, 1); });
    moveRight.disabled = isNew || columnIndex >= sheet.columns.length - 1;
    footer.appendChild(moveLeft);
    footer.appendChild(moveRight);
    footer.appendChild(makeButton(isNew ? "Discard column" : "Delete column", removeColumn, "danger-button"));
    footer.appendChild(makeButton("Cancel", close, "modal-cancel"));
    footer.appendChild(makeButton("Save", save, "button primary"));
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
