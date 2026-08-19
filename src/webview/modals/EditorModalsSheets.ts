// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const commitMutation = CDBVS.commitMutation;
  const visibleSheets = CDBVS.visibleSheets;
  const renameSheet = CDBVS.renameSheet;
  const moveSheet = CDBVS.moveSheet;
  const idColumn = CDBVS.idColumn;
  const setPrimaryColumn = CDBVS.setPrimaryColumn;
  const sheetExtraProperties = CDBVS.sheetExtraProperties;
  const modalField = CDBVS.modalField;
  const createModal = CDBVS.createModal;
  const appendModalActions = CDBVS.appendModalActions;

  function openSheetEditor(sheet) {
    const { dialog, footer, close } = createModal({ className: "column-modal", title: `Edit sheet: ${sheet.name}` });

    const props = sheet.props && typeof sheet.props === "object" && !Array.isArray(sheet.props)
      ? Object.assign({}, sheet.props)
      : {};
    const form = makeElement("div", null, "column-form");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = sheet.name || "";
    form.appendChild(modalField("Name", nameInput));

    const primaryInput = document.createElement("select");
    primaryInput.add(new Option("None", ""));
    (sheet.columns || []).forEach((column) => primaryInput.add(new Option(column.name || "?", column.name || "")));
    const currentPrimary = idColumn(sheet);
    primaryInput.value = currentPrimary ? currentPrimary.name : "";
    form.appendChild(modalField("Primary ID column", primaryInput));

    const displayColumnInput = document.createElement("input");
    displayColumnInput.type = "text";
    displayColumnInput.value = props.displayColumn || "";
    form.appendChild(modalField("Display column", displayColumnInput));

    const displayIconInput = document.createElement("input");
    displayIconInput.type = "text";
    displayIconInput.value = props.displayIcon || "";
    form.appendChild(modalField("Display icon", displayIconInput));

    const hiddenInput = document.createElement("input");
    hiddenInput.type = "checkbox";
    hiddenInput.checked = props.hide === true;
    form.appendChild(modalField("Hidden sheet", hiddenInput, "checkbox-field"));

    const propsInput = document.createElement("input");
    propsInput.type = "checkbox";
    propsInput.checked = props.isProps === true;
    form.appendChild(modalField("Properties sheet", propsInput, "checkbox-field"));

    const indexInput = document.createElement("input");
    indexInput.type = "checkbox";
    indexInput.checked = props.hasIndex === true;
    form.appendChild(modalField("Has index", indexInput, "checkbox-field"));

    const groupInput = document.createElement("input");
    groupInput.type = "checkbox";
    groupInput.checked = props.hasGroup === true;
    form.appendChild(modalField("Has group", groupInput, "checkbox-field"));

    const dataFilesInput = document.createElement("input");
    dataFilesInput.type = "text";
    dataFilesInput.value = props.dataFiles || "";
    form.appendChild(modalField("Data files", dataFilesInput));

    const extraInput = document.createElement("textarea");
    extraInput.className = "column-extra-input";
    extraInput.spellcheck = false;
    extraInput.value = JSON.stringify(sheetExtraProperties(props), null, "\t");
    extraInput.rows = 8;
    form.appendChild(modalField("Advanced properties (JSON)", extraInput));

    const error = makeElement("div", null, "column-form-error");
    form.appendChild(error);
    footer.className = "text-modal-footer column-modal-footer";
    const showError = (message) => { error.textContent = message; };
    const removeSheet = () => {
      close();
      CDBVS.openDeleteSheetConfirmation(sheet);
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
        const reserved = new Set(["displayColumn", "displayIcon", "hide", "isProps", "hasIndex", "hasGroup", "dataFiles"]);
        const reservedKey = Object.keys(extra).find((key) => reserved.has(key));
        if (reservedKey) throw new Error(`'${reservedKey}' is controlled by the form above.`);
      } catch (parseError) {
        showError(`Invalid advanced properties JSON: ${parseError.message}`);
        return;
      }
      const oldName = sheet.name;
      if (oldName !== newName) {
        renameSheet(sheet, newName);
      }
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
      sheet.props = props;
      close();
      commitMutation();
    };
    const moveLeft = makeButton("Move left", () => { close(); moveSheet(sheet, -1); });
    const moveRight = makeButton("Move right", () => { close(); moveSheet(sheet, 1); });
    const visible = visibleSheets();
    const sheetIndex = visible.indexOf(sheet);
    moveLeft.disabled = sheetIndex <= 0;
    moveRight.disabled = sheetIndex < 0 || sheetIndex >= visible.length - 1;
    footer.appendChild(moveLeft);
    footer.appendChild(moveRight);
    footer.appendChild(makeButton("Delete sheet", removeSheet, "danger-button"));
    appendModalActions(footer, close, save);
    dialog.appendChild(form);
    dialog.appendChild(footer);
    nameInput.focus();
    nameInput.select();
  }

  CDBVS.openSheetEditor = openSheetEditor;
})(window);
