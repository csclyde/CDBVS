(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const sendUpdate = () => CDBVS.sendUpdate();
  const setStatus = (message, error) => CDBVS.setStatus(message, error);
  const typeOf = CDBVS.typeOf;
  const typeLabel = CDBVS.typeLabel;
  const visibleSheets = CDBVS.visibleSheets;
  const viewForSheet = CDBVS.viewForSheet;
  const referenceOptions = CDBVS.referenceOptions;
  const removeViewColumn = CDBVS.removeViewColumn;
  const renameViewColumn = CDBVS.renameViewColumn;
  const renameViewSheet = CDBVS.renameViewSheet;
  const moveColumn = CDBVS.moveColumn;
  const moveSheet = CDBVS.moveSheet;
  const deleteSheet = CDBVS.deleteSheet;
  const mapTypeStrings = CDBVS.mapTypeStrings;
  const idColumn = CDBVS.idColumn;
  const setPrimaryColumn = CDBVS.setPrimaryColumn;
  const columnExtraProperties = CDBVS.columnExtraProperties;
  const sheetExtraProperties = CDBVS.sheetExtraProperties;
  const columnTypeOptions = [
    [0, "Primary ID"], [1, "Text"], [2, "Boolean"], [3, "Integer"], [4, "Float"],
    [5, "Enum"], [6, "Reference"], [7, "Image"], [8, "List"], [9, "Custom type"],
    [10, "Flags"], [11, "Color"], [12, "Layer"], [13, "File"], [14, "Tile position"],
    [15, "Tile layer"], [16, "Dynamic"], [17, "Properties"], [18, "Gradient"],
    [19, "Curve"], [20, "GUID"]
  ];
  const typeArgumentCodes = new Set([5, 6, 9, 10, 12]);
  let activeModal = null;
  function cloneRowForEditor(row) {
    try {
      return JSON.parse(JSON.stringify(row && typeof row === "object" && !Array.isArray(row) ? row : {}));
    } catch (_) {
      return {};
    }
  }

  function openRowEditor(sheet, rowIndex) {
    if (!sheet || !Array.isArray(sheet.lines) || !sheet.lines[rowIndex]) return;
    if (activeModal) activeModal.remove();
    const row = sheet.lines[rowIndex];
    const draft = cloneRowForEditor(row);
    const overlay = makeElement("div", null, "text-modal-overlay");
    const dialog = makeElement("section", null, "text-modal row-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const heading = makeElement("div", null, "text-modal-heading");
    const idColumn = (sheet.columns || []).find((column) => typeOf(column).code === 0);
    const rowLabel = idColumn && draft[idColumn.name] !== undefined ? `: ${draft[idColumn.name]}` : ` ${rowIndex + 1}`;
    heading.appendChild(makeElement("strong", `Edit row${rowLabel}`));
    const form = makeElement("div", null, "row-form");
    const close = () => {
      if (activeModal === overlay) activeModal = null;
      overlay.remove();
    };
    const save = () => {
      form.querySelectorAll("input, select, textarea").forEach((input) => {
        input.dispatchEvent(new Event("change", { bubbles: false }));
      });
      Object.keys(row).forEach((key) => delete row[key]);
      Object.assign(row, draft);
      close();
      sendUpdate();
      if (typeof CDBVS.render === "function") CDBVS.render();
    };
    (sheet.columns || []).forEach((column) => {
      const field = makeElement("div", null, "row-field");
      const label = makeElement("label", column.name || "?", "row-field-label");
      label.title = `${column.name || "?"} (${typeLabel(column)})`;
      const editor = makeElement("div", null, "row-field-editor");
      CDBVS.makeCellEditor(editor, draft, column, {
        sheet,
        rowIndex,
        path: `${sheet.name}/${rowIndex}/modal`,
        deferChanges: true
      });
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
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") save();
    });
    document.body.appendChild(overlay);
    activeModal = overlay;
    const firstControl = form.querySelector("input, select, textarea");
    if (firstControl) firstControl.focus();
  }

  function openTextEditor(row, column, input) {
    if (activeModal) activeModal.remove();
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
    const close = () => {
      if (activeModal === overlay) activeModal = null;
      overlay.remove();
    };
    const save = () => {
      row[column.name] = textarea.value;
      input.value = textarea.value;
      close();
      sendUpdate();
      if (typeof CDBVS.render === "function") CDBVS.render();
    };
    heading.appendChild(makeButton("x", close, "text-modal-close"));
    footer.appendChild(makeButton("Cancel", close));
    footer.appendChild(makeButton("Save", save, "button primary"));
    dialog.appendChild(heading);
    dialog.appendChild(textarea);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") save();
    });
    document.body.appendChild(overlay);
    activeModal = overlay;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  function columnField(label, control, className) {
    const field = makeElement("label", null, `column-field${className ? ` ${className}` : ""}`);
    field.appendChild(makeElement("span", label));
    field.appendChild(control);
    return field;
  }


  function openColumnEditor(sheet, column, columnIndex, isNew = false) {
    if (activeModal) activeModal.remove();
    const overlay = makeElement("div", null, "text-modal-overlay");
    const dialog = makeElement("section", null, "text-modal column-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const heading = makeElement("div", null, "text-modal-heading");
    heading.appendChild(makeElement("strong", `${isNew ? "Add" : "Edit"} column${isNew ? "" : `: ${column.name}`}`));

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
    typeArgumentInput.placeholder = "Enum labels, sheet name, custom type, flags, or layer name";
    const typeArgumentField = columnField("Type argument", typeArgumentInput);
    form.appendChild(typeArgumentField);

    const rawTypeInput = document.createElement("input");
    rawTypeInput.type = "text";
    rawTypeInput.value = currentTypeRaw;
    rawTypeInput.placeholder = "For unsupported or advanced CastleDB types";
    const rawTypeField = columnField("Raw type string", rawTypeInput);
    form.appendChild(rawTypeField);

    const primaryInput = document.createElement("input");
    primaryInput.type = "checkbox";
    primaryInput.checked = currentType.code === 0;
    form.appendChild(columnField("Primary ID field", primaryInput, "checkbox-field"));

    const updateTypeControls = () => {
      const code = Number(typeSelect.value);
      typeArgumentField.hidden = typeSelect.value === "raw" || !typeArgumentCodes.has(code);
      rawTypeField.hidden = typeSelect.value !== "raw";
      primaryInput.checked = code === 0;
    };
    updateTypeControls();
    typeSelect.addEventListener("change", updateTypeControls);
    primaryInput.addEventListener("change", () => {
      if (primaryInput.checked) typeSelect.value = "0";
      else if (typeSelect.value === "0") typeSelect.value = "1";
      updateTypeControls();
    });

    const optionalInput = document.createElement("input");
    optionalInput.type = "checkbox";
    optionalInput.checked = column.opt === true;
    form.appendChild(columnField("Optional", optionalInput, "checkbox-field"));

    const displayInput = document.createElement("select");
    displayInput.add(new Option("Default", ""));
    displayInput.add(new Option("Percentage", "1"));
    displayInput.value = column.display === 1 ? "1" : "";
    form.appendChild(columnField("Display", displayInput));

    const kindInput = document.createElement("select");
    kindInput.add(new Option("None", ""));
    ["localizable", "script", "hidden", "typekind"].forEach((kind) => kindInput.add(new Option(kind, kind)));
    kindInput.value = column.kind || "";
    form.appendChild(columnField("Kind", kindInput));

    const scopeInput = document.createElement("input");
    scopeInput.type = "number";
    scopeInput.step = "1";
    scopeInput.value = column.scope === undefined || column.scope === null ? "" : String(column.scope);
    form.appendChild(columnField("Scope", scopeInput));

    const documentationInput = document.createElement("textarea");
    documentationInput.value = column.documentation || "";
    documentationInput.rows = 3;
    form.appendChild(columnField("Documentation", documentationInput));

    const extraInput = document.createElement("textarea");
    extraInput.className = "column-extra-input";
    extraInput.spellcheck = false;
    extraInput.value = JSON.stringify(columnExtraProperties(column), null, "\t");
    extraInput.rows = 7;
    form.appendChild(columnField("Advanced properties (JSON)", extraInput));

    const error = makeElement("div", null, "column-form-error");
    form.appendChild(error);
    const footer = makeElement("div", null, "text-modal-footer column-modal-footer");
    const close = () => {
      if (activeModal === overlay) activeModal = null;
      overlay.remove();
    };
    const showError = (message) => { error.textContent = message; };
    const removeColumn = () => {
      if (isNew) {
        close();
        return;
      }
      sheet.columns.splice(columnIndex, 1);
      (sheet.lines || []).forEach((line) => { if (line) delete line[column.name]; });
      if (sheet.props && sheet.props.displayColumn === column.name) delete sheet.props.displayColumn;
      if (sheet.props && sheet.props.displayIcon === column.name) delete sheet.props.displayIcon;
      removeViewColumn(sheet.name, column.name);
      close();
      sendUpdate();
      CDBVS.render();
    };
    const save = () => {
      const newName = nameInput.value.trim();
      if (!newName) {
        showError("Column name cannot be empty.");
        return;
      }
      if (sheet.columns.some((item, index) => (isNew || index !== columnIndex) && item.name === newName)) {
        showError(`Column '${newName}' already exists on this sheet.`);
        return;
      }
      let extra;
      try {
        extra = JSON.parse(extraInput.value || "{}");
        if (!extra || typeof extra !== "object" || Array.isArray(extra)) throw new Error("Advanced properties must be a JSON object.");
        const reserved = new Set(["name", "type", "typeStr", "opt", "display", "kind", "scope", "documentation"]);
        const reservedKey = Object.keys(extra).find((key) => reserved.has(key));
        if (reservedKey) throw new Error(`'${reservedKey}' is controlled by the form above.`);
      } catch (parseError) {
        showError(`Invalid advanced properties JSON: ${parseError.message}`);
        return;
      }

      const oldName = column.name;
      const typeProperty = Object.prototype.hasOwnProperty.call(column, "typeStr") ? "typeStr" : (Object.prototype.hasOwnProperty.call(column, "type") ? "type" : "typeStr");
      if (primaryInput.checked) typeSelect.value = "0";
      else if (typeSelect.value === "0") typeSelect.value = "1";
      const selectedType = typeSelect.value === "raw"
        ? rawTypeInput.value.trim()
        : `${typeSelect.value}${typeArgumentCodes.has(Number(typeSelect.value)) && typeArgumentInput.value.trim() ? `:${typeArgumentInput.value.trim()}` : ""}`;
      if (!selectedType) {
        showError("Type cannot be empty.");
        return;
      }
      if (!isNew && oldName !== newName) {
        (sheet.lines || []).forEach((line) => {
          if (!line || !Object.prototype.hasOwnProperty.call(line, oldName)) return;
          if (!Object.prototype.hasOwnProperty.call(line, newName)) line[newName] = line[oldName];
          delete line[oldName];
        });
        const oldPrefix = `${sheet.name}@${oldName}`;
        const newPrefix = `${sheet.name}@${newName}`;
        (state.data.sheets || []).forEach((subSheet) => {
          if (subSheet.name === oldPrefix || subSheet.name.startsWith(`${oldPrefix}@`)) {
            subSheet.name = `${newPrefix}${subSheet.name.slice(oldPrefix.length)}`;
          }
        });
        mapTypeStrings((raw) => {
          const separator = raw.indexOf(":");
          if (separator < 0) return raw;
          const code = raw.slice(0, separator);
          const target = raw.slice(separator + 1);
          if ((code === "6" || code === "12") && (target === oldPrefix || target.startsWith(`${oldPrefix}@`))) return `${code}:${newPrefix}${target.slice(oldPrefix.length)}`;
          return raw;
        });
        if (sheet.props && sheet.props.displayColumn === oldName) sheet.props.displayColumn = newName;
        if (sheet.props && sheet.props.displayIcon === oldName) sheet.props.displayIcon = newName;
        renameViewColumn(sheet.name, oldName, newName);
      }
      column.name = newName;
      column[typeProperty] = selectedType;
      column.opt = optionalInput.checked;
      if (displayInput.value === "") delete column.display;
      else column.display = Number(displayInput.value);
      if (kindInput.value === "") delete column.kind;
      else column.kind = kindInput.value;
      if (scopeInput.value === "") delete column.scope;
      else column.scope = Number(scopeInput.value);
      if (documentationInput.value === "") delete column.documentation;
      else column.documentation = documentationInput.value;
      const standard = new Set(["name", "type", "typeStr", "opt", "display", "kind", "scope", "documentation"]);
      Object.keys(column).forEach((key) => {
        if (!standard.has(key)) delete column[key];
      });
      Object.assign(column, extra);
      if (isNew) sheet.columns.splice(Math.min(columnIndex, sheet.columns.length), 0, column);
      if (primaryInput.checked) setPrimaryColumn(sheet, column.name);
      close();
      sendUpdate();
      if (typeof CDBVS.render === "function") CDBVS.render();
    };
    heading.appendChild(makeButton("x", close, "text-modal-close"));
    const moveLeft = makeButton("Move left", () => { close(); moveColumn(sheet, columnIndex, -1); });
    moveLeft.disabled = isNew || columnIndex <= 0;
    const moveRight = makeButton("Move right", () => { close(); moveColumn(sheet, columnIndex, 1); });
    moveRight.disabled = isNew || columnIndex >= sheet.columns.length - 1;
    footer.appendChild(moveLeft);
    footer.appendChild(moveRight);
    footer.appendChild(makeButton(isNew ? "Discard column" : "Delete column", removeColumn, "danger-button"));
    footer.appendChild(makeButton("Cancel", close, "modal-cancel"));
    footer.appendChild(makeButton("Save", save, "button primary"));
    dialog.appendChild(heading);
    dialog.appendChild(form);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    document.body.appendChild(overlay);
    activeModal = overlay;
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

  function openSheetEditor(sheet) {
    if (activeModal) activeModal.remove();
    const overlay = makeElement("div", null, "text-modal-overlay");
    const dialog = makeElement("section", null, "text-modal column-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const heading = makeElement("div", null, "text-modal-heading");
    heading.appendChild(makeElement("strong", `Edit sheet: ${sheet.name}`));

    const props = sheet.props || (sheet.props = {});
    const form = makeElement("div", null, "column-form");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = sheet.name || "";
    form.appendChild(columnField("Name", nameInput));

    const primaryInput = document.createElement("select");
    primaryInput.add(new Option("None", ""));
    (sheet.columns || []).forEach((column) => primaryInput.add(new Option(column.name || "?", column.name || "")));
    const currentPrimary = idColumn(sheet);
    primaryInput.value = currentPrimary ? currentPrimary.name : "";
    form.appendChild(columnField("Primary ID column", primaryInput));

    const displayColumnInput = document.createElement("input");
    displayColumnInput.type = "text";
    displayColumnInput.value = props.displayColumn || "";
    form.appendChild(columnField("Display column", displayColumnInput));

    const displayIconInput = document.createElement("input");
    displayIconInput.type = "text";
    displayIconInput.value = props.displayIcon || "";
    form.appendChild(columnField("Display icon", displayIconInput));

    const hiddenInput = document.createElement("input");
    hiddenInput.type = "checkbox";
    hiddenInput.checked = props.hide === true;
    form.appendChild(columnField("Hidden sheet", hiddenInput, "checkbox-field"));

    const propsInput = document.createElement("input");
    propsInput.type = "checkbox";
    propsInput.checked = props.isProps === true;
    form.appendChild(columnField("Properties sheet", propsInput, "checkbox-field"));

    const indexInput = document.createElement("input");
    indexInput.type = "checkbox";
    indexInput.checked = props.hasIndex === true;
    form.appendChild(columnField("Has index", indexInput, "checkbox-field"));

    const groupInput = document.createElement("input");
    groupInput.type = "checkbox";
    groupInput.checked = props.hasGroup === true;
    form.appendChild(columnField("Has group", groupInput, "checkbox-field"));

    const dataFilesInput = document.createElement("input");
    dataFilesInput.type = "text";
    dataFilesInput.value = props.dataFiles || "";
    form.appendChild(columnField("Data files", dataFilesInput));

    const extraInput = document.createElement("textarea");
    extraInput.className = "column-extra-input";
    extraInput.spellcheck = false;
    extraInput.value = JSON.stringify(sheetExtraProperties(props), null, "\t");
    extraInput.rows = 8;
    form.appendChild(columnField("Advanced properties (JSON)", extraInput));

    const error = makeElement("div", null, "column-form-error");
    form.appendChild(error);
    const footer = makeElement("div", null, "text-modal-footer column-modal-footer");
    const close = () => {
      if (activeModal === overlay) activeModal = null;
      overlay.remove();
    };
    const showError = (message) => { error.textContent = message; };
    const removeSheet = () => {
      close();
      openDeleteSheetConfirmation(sheet);
    };
    const save = () => {
      const newName = nameInput.value.trim();
      if (!newName) {
        showError("Sheet name cannot be empty.");
        return;
      }
      if (state.data.sheets.some((item) => item !== sheet && item.name === newName)) {
        showError(`Sheet '${newName}' already exists.`);
        return;
      }
      let extra;
      try {
        extra = JSON.parse(extraInput.value || "{}");
        if (!extra || typeof extra !== "object" || Array.isArray(extra)) throw new Error("Advanced properties must be a JSON object.");
      } catch (parseError) {
        showError(`Invalid advanced properties JSON: ${parseError.message}`);
        return;
      }
      const oldName = sheet.name;
      if (oldName !== newName) {
        mapTypeStrings((raw) => {
          const separator = raw.indexOf(":");
          if (separator < 0) return raw;
          const code = raw.slice(0, separator);
          const target = raw.slice(separator + 1);
          if ((code === "6" || code === "12") && (target === oldName || target.startsWith(`${oldName}@`))) return `${code}:${newName}${target.slice(oldName.length)}`;
          return raw;
        });
        state.data.sheets.forEach((item) => {
          if (item.name === oldName || item.name.startsWith(`${oldName}@`)) {
            item.name = `${newName}${item.name.slice(oldName.length)}`;
          }
        });
        renameViewSheet(oldName, newName);
        state.expandedLists.clear();
      }
      sheet.name = newName;
      setPrimaryColumn(sheet, primaryInput.value);
      if (displayColumnInput.value === "") delete props.displayColumn;
      else props.displayColumn = displayColumnInput.value;
      if (displayIconInput.value === "") delete props.displayIcon;
      else props.displayIcon = displayIconInput.value;
      if (hiddenInput.checked) props.hide = true;
      else delete props.hide;
      if (propsInput.checked) props.isProps = true;
      else delete props.isProps;
      if (indexInput.checked) props.hasIndex = true;
      else delete props.hasIndex;
      if (groupInput.checked) props.hasGroup = true;
      else delete props.hasGroup;
      if (dataFilesInput.value === "") delete props.dataFiles;
      else props.dataFiles = dataFilesInput.value;
      const standard = new Set(["displayColumn", "displayIcon", "hide", "isProps", "hasIndex", "hasGroup", "dataFiles"]);
      Object.keys(props).forEach((key) => {
        if (!standard.has(key)) delete props[key];
      });
      Object.assign(props, extra);
      close();
      sendUpdate();
      if (typeof CDBVS.render === "function") CDBVS.render();
    };
    heading.appendChild(makeButton("x", close, "text-modal-close"));
    const moveLeft = makeButton("Move left", () => { close(); moveSheet(sheet, -1); });
    const moveRight = makeButton("Move right", () => { close(); moveSheet(sheet, 1); });
    const visible = visibleSheets();
    const sheetIndex = visible.indexOf(sheet);
    moveLeft.disabled = sheetIndex <= 0;
    moveRight.disabled = sheetIndex < 0 || sheetIndex >= visible.length - 1;
    footer.appendChild(moveLeft);
    footer.appendChild(moveRight);
    footer.appendChild(makeButton("Delete sheet", removeSheet, "danger-button"));
    footer.appendChild(makeButton("Cancel", close, "modal-cancel"));
    footer.appendChild(makeButton("Save", save, "button primary"));
    dialog.appendChild(heading);
    dialog.appendChild(form);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    document.body.appendChild(overlay);
    activeModal = overlay;
    nameInput.focus();
    nameInput.select();
  }

  function openDeleteSheetConfirmation(sheet) {
    if (!sheet) return;
    if (activeModal) activeModal.remove();
    const overlay = makeElement("div", null, "text-modal-overlay");
    const dialog = makeElement("section", null, "text-modal column-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const heading = makeElement("div", null, "text-modal-heading");
    heading.appendChild(makeElement("strong", `Delete sheet: ${sheet.name}`));
    const message = makeElement("p", `Delete '${sheet.name}' and all of its sub-sheets? References to this sheet will be cleared.`, "delete-sheet-message");
    const footer = makeElement("div", null, "text-modal-footer");
    const close = () => {
      if (activeModal === overlay) activeModal = null;
      overlay.remove();
    };
    heading.appendChild(makeButton("x", close, "text-modal-close"));
    footer.appendChild(makeButton("Cancel", close, "modal-cancel"));
    footer.appendChild(makeButton("Delete sheet", () => { close(); deleteSheet(sheet); }, "danger-button"));
    dialog.appendChild(heading);
    dialog.appendChild(message);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    document.body.appendChild(overlay);
    activeModal = overlay;
    overlay.querySelector(".modal-cancel").focus();
  }


  function openTypesEditor() {
    if (!state.data || typeof state.data !== "object") {
      setStatus("Load a valid CastleDB document before editing custom types.", true);
      return;
    }
    if (activeModal) activeModal.remove();
    const overlay = makeElement("div", null, "text-modal-overlay");
    const dialog = makeElement("section", null, "text-modal types-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const heading = makeElement("div", null, "text-modal-heading");
    heading.appendChild(makeElement("strong", "Edit custom types"));
    const hint = makeElement("p", "Edit the CastleDB customTypes JSON array. Each type contains cases with name and args fields.", "types-hint");
    const textarea = document.createElement("textarea");
    textarea.className = "types-editor";
    textarea.spellcheck = false;
    textarea.value = JSON.stringify(state.data.customTypes || [], null, "\t");
    const error = makeElement("div", null, "column-form-error");
    const footer = makeElement("div", null, "text-modal-footer");
    const close = () => {
      if (activeModal === overlay) activeModal = null;
      overlay.remove();
    };
    const save = () => {
      let customTypes;
      try {
        customTypes = JSON.parse(textarea.value || "[]");
        if (!Array.isArray(customTypes)) throw new Error("Custom types must be a JSON array.");
        const names = new Set();
        customTypes.forEach((customType) => {
          if (!customType || typeof customType !== "object" || !customType.name || names.has(customType.name)) throw new Error("Each custom type needs a unique name.");
          names.add(customType.name);
          if (!Array.isArray(customType.cases)) throw new Error(`Custom type '${customType.name}' needs a cases array.`);
          customType.cases.forEach((typeCase) => {
            if (!typeCase || typeof typeCase !== "object" || !typeCase.name || !Array.isArray(typeCase.args)) throw new Error(`Invalid case in custom type '${customType.name}'.`);
          });
        });
        const customNames = new Set(customTypes.map((customType) => customType.name));
        const checkTypeReference = (column) => {
          const parsed = typeOf(column);
          if (parsed.code === 9 && !customNames.has(parsed.argument)) throw new Error(`Custom type '${parsed.argument}' is not defined.`);
        };
        (state.data.sheets || []).forEach((sheet) => (sheet.columns || []).forEach(checkTypeReference));
        customTypes.forEach((customType) => (customType.cases || []).forEach((typeCase) => (typeCase.args || []).forEach(checkTypeReference)));
      } catch (parseError) {
        error.textContent = `Invalid custom types: ${parseError.message}`;
        return;
      }
      state.data.customTypes = customTypes;
      close();
      sendUpdate();
    };
    heading.appendChild(makeButton("x", close, "text-modal-close"));
    footer.appendChild(makeButton("Cancel", close));
    footer.appendChild(makeButton("Save", save, "button primary"));
    dialog.appendChild(heading);
    dialog.appendChild(hint);
    dialog.appendChild(textarea);
    dialog.appendChild(error);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") save();
    });
    document.body.appendChild(overlay);
    activeModal = overlay;
    textarea.focus();
  }


  function openFilterModal(sheet) {
    if (!sheet) {
      setStatus("Select a sheet before configuring filters.", true);
      return;
    }
    if (activeModal) activeModal.remove();
    const overlay = makeElement("div", null, "text-modal-overlay");
    const dialog = makeElement("section", null, "text-modal filter-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const heading = makeElement("div", null, "text-modal-heading");
    heading.appendChild(makeElement("strong", `Filter: ${sheet.name}`));

    const view = viewForSheet(sheet);
    const draftFilters = JSON.parse(JSON.stringify(view.filters));
    const form = makeElement("div", null, "filter-form");
    form.appendChild(makeElement("h3", "Column filters", "filter-section-heading"));
    const controls = makeElement("div", null, "filter-controls");
    (sheet.columns || []).forEach((column) => {
      const type = typeOf(column);
      const rule = draftFilters[column.name] || {};
      const field = makeElement("div", null, "filter-field");
      const label = makeElement("div", null, "filter-field-label");
      label.appendChild(makeElement("strong", column.name || "?"));
      label.appendChild(makeElement("small", typeLabel(column), "filter-type"));
      field.appendChild(label);

      if (type.code === 2) {
        const select = document.createElement("select");
        select.add(new Option("Any", "any"));
        select.add(new Option("True", "true"));
        select.add(new Option("False", "false"));
        select.value = rule.value || "any";
        select.addEventListener("change", () => {
          if (select.value === "any") delete draftFilters[column.name];
          else draftFilters[column.name] = { value: select.value };
        });
        field.appendChild(select);
      } else if (type.code === 3 || type.code === 4) {
        const range = makeElement("div", null, "filter-range");
        const min = document.createElement("input");
        min.type = "number";
        min.step = type.code === 3 ? "1" : "any";
        min.placeholder = "Minimum";
        min.value = rule.min === undefined ? "" : rule.min;
        const max = document.createElement("input");
        max.type = "number";
        max.step = type.code === 3 ? "1" : "any";
        max.placeholder = "Maximum";
        max.value = rule.max === undefined ? "" : rule.max;
        const updateRange = () => {
          if (min.value === "" && max.value === "") delete draftFilters[column.name];
          else draftFilters[column.name] = { min: min.value, max: max.value };
        };
        min.addEventListener("input", updateRange);
        max.addEventListener("input", updateRange);
        range.appendChild(min);
        range.appendChild(max);
        field.appendChild(range);
      } else if (type.code === 11) {
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "Color hex or decimal...";
        input.value = rule.value === undefined ? "" : String(rule.value);
        input.addEventListener("input", () => {
          if (input.value.trim() === "") delete draftFilters[column.name];
          else draftFilters[column.name] = { value: input.value };
        });
        field.appendChild(input);
      } else if (type.code === 5) {
        const select = document.createElement("select");
        select.add(new Option("Any", ""));
        type.values.forEach((value, index) => select.add(new Option(value, String(index))));
        select.value = rule.value === undefined ? "" : String(rule.value);
        select.addEventListener("change", () => {
          if (select.value === "") delete draftFilters[column.name];
          else draftFilters[column.name] = { value: select.value };
        });
        field.appendChild(select);
      } else if (type.code === 6 && referenceOptions(column)) {
        const select = document.createElement("select");
        select.add(new Option("Any", ""));
        referenceOptions(column).forEach((value) => select.add(new Option(String(value), String(value))));
        select.value = rule.value === undefined ? "" : String(rule.value);
        select.addEventListener("change", () => {
          if (select.value === "") delete draftFilters[column.name];
          else draftFilters[column.name] = { value: select.value };
        });
        field.appendChild(select);
      } else if (type.code === 10 && type.values.length) {
        const checks = makeElement("div", null, "filter-checks");
        let mask = Number(rule.mask) || 0;
        type.values.forEach((value, index) => {
          const label = makeElement("label", null, "filter-check");
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = (mask & (1 << index)) !== 0;
          checkbox.addEventListener("change", () => {
            if (checkbox.checked) mask |= 1 << index;
            else mask &= ~(1 << index);
            if (mask) draftFilters[column.name] = { mask };
            else delete draftFilters[column.name];
          });
          label.appendChild(checkbox);
          label.appendChild(makeElement("span", value));
          checks.appendChild(label);
        });
        field.appendChild(checks);
      } else {
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = type.code === 8 || type.code === 17 ? "Contains JSON text..." : "Contains...";
        input.value = rule.value === undefined ? "" : String(rule.value);
        input.addEventListener("input", () => {
          if (input.value.trim() === "") delete draftFilters[column.name];
          else draftFilters[column.name] = { value: input.value };
        });
        field.appendChild(input);
      }
      controls.appendChild(field);
    });
    form.appendChild(controls);

    const footer = makeElement("div", null, "text-modal-footer");
    const close = () => {
      if (activeModal === overlay) activeModal = null;
      overlay.remove();
    };
    const apply = () => {
      state.columnFilters[sheet.name] = draftFilters;
      close();
      CDBVS.render();
    };
    heading.appendChild(makeButton("x", close, "text-modal-close"));
    footer.appendChild(makeButton("Cancel", close, "modal-cancel"));
    footer.appendChild(makeButton("Apply", apply, "button primary"));
    dialog.appendChild(heading);
    dialog.appendChild(form);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    document.body.appendChild(overlay);
    activeModal = overlay;
    const firstControl = controls.querySelector("input, select");
    if (firstControl) firstControl.focus();
  }

  Object.assign(CDBVS, {
    openTextEditor, openRowEditor, openColumnEditor, openNewColumnEditor, openSheetEditor, openDeleteSheetConfirmation, openTypesEditor, openFilterModal
  });
})(window);
