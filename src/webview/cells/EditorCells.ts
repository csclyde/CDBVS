// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const cellCapabilities = CDBVS.capabilities.cells;
  const model = CDBVS.services.document.operations;
  const application = CDBVS.services.application;
  const makeElement = CDBVS.makeElement;
  const typeOf = CDBVS.typeOf;
  const currentSheet = CDBVS.services.sheetView.currentSheet;
  const listSheet = CDBVS.listSheet;
  const readValue = CDBVS.readValue;
  const valueText = CDBVS.valueText;
  const colorText = CDBVS.colorText;
  const referenceOptions = CDBVS.referenceOptions;
  const commitCellMutation = application.commitCellMutation;
  const scheduleCellMutation = application.scheduleCellMutation;
  const setCellValue = model.values.setCell;

  function canSyncInputValue(type, input) {
    const value = String(input.value || "").trim();
    if (type.code === 1 || type.code === 11) return true;
    if (type.code === 3) return /^[-+]?\d+$/.test(value);
    if (type.code === 4) return /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value);
    return false;
  }

  function materializeCellEditor(cell, row, column, context) {
    const existingInput = context && context.existingInput;
    if (!existingInput) cell.replaceChildren();
    makeCellEditor(cell, row, column, Object.assign({}, context || {}, { lazy: false, existingInput }));
  }

  function choiceValue(value) {
    return value === undefined || value === null ? "" : String(value);
  }

  function enumValues(type) {
    return type.values.length ? type.values : ["0"];
  }

  function addEnumOptions(input, type, value) {
    const values = enumValues(type);
    const current = choiceValue(value);
    if (current === "") input.add(new Option("None", ""));
    values.forEach((label, index) => input.add(new Option(label, String(index))));
    if (current !== "" && !values.some((_, index) => String(index) === current)) {
      input.add(new Option(`Missing value: ${current}`, current));
    }
    input.value = current;
  }

  function addReferenceOptions(input, references, value, referencesKnown = true) {
    const current = choiceValue(value);
    input.add(new Option("", ""));
    const values = references || [];
    values.forEach((item) => input.add(new Option(String(item), String(item))));
    if (current !== "" && !values.some((item) => String(item) === current)) {
      // A lazy preview has not loaded the target sheet yet. Preserve the raw
      // reference there; only a fully materialized editor can call it missing.
      const label = referencesKnown ? `Missing value: ${current}` : current;
      input.add(new Option(label, current));
    }
    input.value = current;
  }

  function lazyChoiceEditor(cell, row, column, context, type) {
    const input = document.createElement("select");
    input.className = "lazy-cell-editor";
    input.title = `${column.name} (${type.name})`;
    if (type.code === 6 && input.tagName === "SELECT") {
      input._cdbvsRefreshChoices = () => {
        const selectedValue = input.value;
        input.replaceChildren();
        addReferenceOptions(input, referenceOptions(column), selectedValue);
      };
    }
    const value = row[column.name];
    if (type.code === 5) {
      const current = choiceValue(value);
      const values = enumValues(type);
      const index = Number(value);
      const validIndex = Number.isInteger(index) && index >= 0 && index < values.length && String(index) === current;
      const label = current === "" ? "None"
        : (validIndex ? values[index] : `Missing value: ${current}`);
      input.add(new Option(label, current));
      input.value = current;
    } else {
      addReferenceOptions(input, [], value, false);
    }
    input._cdbvsActivateLazyEditor = () => materializeCellEditor(cell, row, column, Object.assign({}, context, { existingInput: input }));
    cell.appendChild(input);
  }

  function flagsPreview(type, value) {
    const current = Number(value) || 0;
    const labels = type.values.filter((label, index) => (current & (1 << index)) !== 0);
    return labels.length ? labels.join(", ") : "none";
  }

  function lazyFlagsEditor(cell, row, column, context, type) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lazy-cell-editor flags-preview";
    button.textContent = flagsPreview(type, row[column.name]);
    button.title = `${column.name} (${type.name})`;
    button._cdbvsActivateLazyEditor = () => materializeCellEditor(cell, row, column, context);
    cell.appendChild(button);
  }

  function makeCellEditor(cell, row, column, context) {
    const type = typeOf(column);
    const value = row[column.name];
    const cellContext = context || { sheet: currentSheet(), rowIndex: 0, path: "root" };
    const existingInput = cellContext.existingInput;
    if (cellContext.lazy && type.code === 5) {
      lazyChoiceEditor(cell, row, column, cellContext, type);
      return;
    }
    if (cellContext.lazy && type.code === 6) {
      lazyChoiceEditor(cell, row, column, cellContext, type);
      return;
    }
    if (cellContext.lazy && type.code === 10 && type.values.length) {
      lazyFlagsEditor(cell, row, column, cellContext, type);
      return;
    }
    const references = type.code === 6 ? referenceOptions(column) : null;
    if (type.code === 8) {
      const schema = listSheet(cellContext.sheet, column);
      if (schema && typeof cellCapabilities.renderListCell === "function") {
        cellCapabilities.renderListCell(cell, row, column, cellContext, schema);
        return;
      }
    }
    if (type.code === 17) {
      const schema = listSheet(cellContext.sheet, column);
      if (schema && typeof cellCapabilities.renderPropertiesCell === "function") {
        cellCapabilities.renderPropertiesCell(cell, row, column, cellContext, schema);
        return;
      }
    }
    let input;
    let needsCommit = false;
    let committing = false;
    let originalPresent = Object.prototype.hasOwnProperty.call(row, column.name);
    let originalValue = CDBVS.cloneValue(row[column.name]);
    const rememberValue = () => {
      originalPresent = Object.prototype.hasOwnProperty.call(row, column.name);
      originalValue = CDBVS.cloneValue(row[column.name]);
    };
    const restoreValue = () => {
      if (originalPresent) setCellValue(row, column, CDBVS.cloneValue(originalValue));
      else delete row[column.name];
    };
    const isActiveCellEditor = () => {
      const editSheet = cellContext.editSheet || cellContext.sheet;
      if (!editSheet || typeof CDBVS.activeCell !== "function") return false;
      const active = CDBVS.activeCell(editSheet);
      const editRowIndex = Number.isInteger(cellContext.editRowIndex) ? cellContext.editRowIndex : cellContext.rowIndex;
      const editColumnIndex = Number.isInteger(cellContext.editColumnIndex)
        ? cellContext.editColumnIndex
        : (Array.isArray(editSheet.columns) ? editSheet.columns.indexOf(column) : -1);
      return !!active && active.rowIndex === editRowIndex && active.columnIndex === editColumnIndex;
    };
    const isFocusedSelectedCellEditor = () => {
      const editSheet = cellContext.editSheet || cellContext.sheet;
      if (!editSheet || typeof CDBVS.selectedCell !== "function" || typeof document === "undefined") return false;
      const selected = CDBVS.selectedCell(editSheet);
      const editRowIndex = Number.isInteger(cellContext.editRowIndex) ? cellContext.editRowIndex : cellContext.rowIndex;
      const editColumnIndex = Number.isInteger(cellContext.editColumnIndex)
        ? cellContext.editColumnIndex
        : (Array.isArray(editSheet.columns) ? editSheet.columns.indexOf(column) : -1);
      const focused = document.activeElement;
      return !!selected && selected.rowIndex === editRowIndex && selected.columnIndex === editColumnIndex
        && !!focused && typeof cell.contains === "function" && cell.contains(focused);
    };
    const isEditingCell = () => isActiveCellEditor() || isFocusedSelectedCellEditor();
    const refreshAfterCommit = () => {
      if (typeof cellContext.refresh === "function") cellContext.refresh();
      else if (typeof CDBVS.refreshRenderedCell === "function") {
        const columnIndex = (cellContext.sheet && Array.isArray(cellContext.sheet.columns))
          ? cellContext.sheet.columns.indexOf(column)
          : -1;
        CDBVS.refreshRenderedCell(cellContext.sheet, cellContext.rowIndex, columnIndex);
      }
    };
    if (type.code === 10 && type.values.length) {
      const flags = makeElement("div", null, "flags-input");
      let current = Number(value) || 0;
      let flagsNeedCommit = false;
      type.values.forEach((label, flagIndex) => {
        const flagLabel = makeElement("label", null, "flag-item");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.tabIndex = cellContext.rowEditor ? 0 : -1;
        checkbox.checked = (current & (1 << flagIndex)) !== 0;
        checkbox._cdbvsCommit = () => {
          if (!flagsNeedCommit) return;
          committing = true;
          try { checkbox.dispatchEvent(new Event("change", { bubbles: false })); }
          finally { committing = false; }
          rememberValue();
        };
        checkbox._cdbvsBeginEdit = rememberValue;
        checkbox._cdbvsCancel = () => {
          restoreValue();
          current = Number(originalValue) || 0;
          flagsNeedCommit = false;
          flags.querySelectorAll("input").forEach((control, index) => { control.checked = (current & (1 << index)) !== 0; });
        };
        checkbox._cdbvsDraft = () => flagsNeedCommit ? { label: `${cellContext.sheet.name} / ${column.name}`, text: String(current) } : null;
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) current |= 1 << flagIndex;
          else current &= ~(1 << flagIndex);
          setCellValue(row, column, column.opt && current === 0 ? null : current);
          if (isActiveCellEditor() && !committing) {
            flagsNeedCommit = true;
            return;
          }
          flagsNeedCommit = false;
          if (!cellContext.deferChanges) {
            commitCellMutation(undefined, refreshAfterCommit);
          }
        });
        flagLabel.appendChild(checkbox);
        flagLabel.appendChild(makeElement("span", label));
        flags.appendChild(flagLabel);
      });
      cell.appendChild(flags);
      return;
    } else if (type.code === 2) {
      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = value === true;
      input.className = "bool-input";
    } else if (type.code === 5) {
      input = existingInput && existingInput.tagName === "SELECT" ? existingInput : document.createElement("select");
      input.replaceChildren();
      addEnumOptions(input, type, value);
    } else if (type.code === 6 && references) {
      input = existingInput && existingInput.tagName === "SELECT" ? existingInput : document.createElement("select");
      input.replaceChildren();
      addReferenceOptions(input, references, value);
    } else {
      input = document.createElement("input");
      input.type = type.code === 11 ? "color" : ((type.code === 3 || type.code === 4 || type.code === 10) ? "number" : "text");
      input.step = type.code === 4 ? "any" : "1";
      input.value = type.code === 11 ? colorText(value) : valueText(value);
      if (type.code === 11) input.classList.add("color-input");
      if ([8, 9, 14, 15, 16, 17, 18, 19].includes(type.code)) input.classList.add("json-input");
    }
    if (input && typeof input._cdbvsActivateLazyEditor === "function") delete input._cdbvsActivateLazyEditor;
    if (input && input.classList && input.classList.contains("lazy-cell-editor")) input.classList.remove("lazy-cell-editor");
    input.title = `${column.name} (${type.name})`;
    input.tabIndex = cellContext.rowEditor ? 0 : -1;
    let originalInputValue = input.type === "checkbox" ? input.checked : input.value;
    const inputValue = () => input.type === "checkbox" ? input.checked : input.value;
    const hasDraft = () => needsCommit || inputValue() !== originalInputValue || !!(input.validity && input.validity.badInput);
    input._cdbvsBeginEdit = () => {
      rememberValue();
      originalInputValue = inputValue();
    };
    input._cdbvsCancel = () => {
      restoreValue();
      if (input.type === "checkbox") input.checked = originalInputValue;
      else input.value = originalInputValue;
      needsCommit = false;
      input.setAttribute("aria-invalid", "false");
      cell.classList.remove("cell-draft-error");
    };
    input._cdbvsDraft = () => hasDraft() ? { label: `${cellContext.sheet && cellContext.sheet.name || "Cell"} / ${column.name}`, text: String(inputValue()) } : null;
    let composing = false;
    input.addEventListener("compositionstart", () => { composing = true; });
    input.addEventListener("compositionend", () => { composing = false; });
    input._cdbvsValidate = () => {
      if (composing) {
        CDBVS.setStatus("Finish composing the value before leaving this cell.", true);
        return false;
      }
      if (!hasDraft()) return true;
      const next = readValue(input, column);
      if (next === undefined || (input.validity && input.validity.badInput)) {
        input.dispatchEvent(new Event("change", { bubbles: false }));
        return false;
      }
      return true;
    };
    input._cdbvsCommit = () => {
      // Activating and leaving an untouched cell must preserve absent fields
      // and malformed existing values rather than normalize them to null.
      if (!input._cdbvsValidate()) return false;
      if (!hasDraft()) return true;
      const next = readValue(input, column);
      const current = row[column.name];
      const changed = next !== undefined && JSON.stringify(next) !== JSON.stringify(current);
      if (!needsCommit && !changed) {
        input._cdbvsBeginEdit();
        return true;
      }
      committing = true;
      try { input.dispatchEvent(new Event("change", { bubbles: false })); }
      finally { committing = false; }
      input._cdbvsBeginEdit();
      return true;
    };
    input.addEventListener("input", () => {
      if (cellContext.deferChanges || !canSyncInputValue(type, input)) return;
      const next = readValue(input, column);
      if (next === undefined) return;
      needsCommit = true;
      setCellValue(row, column, next);
      if (isEditingCell()) return;
      scheduleCellMutation();
    });
    input.addEventListener("change", () => {
      const invalid = (message) => {
        input.setAttribute("aria-invalid", "true");
        cell.classList.add("cell-draft-error");
        CDBVS.setStatus(`${message} Correct the value or press Escape to cancel.`, true);
      };
      const next = readValue(input, column);
      if (input.validity && input.validity.badInput) {
        invalid(`${column.name} must contain a valid ${type.name} value.`);
        return;
      }
      const complex = [8, 9, 14, 15, 16, 17, 18, 19].includes(type.code);
      if (complex && input.value !== "" && next === undefined) {
        invalid("Complex values must contain valid JSON before they can be saved.");
        return;
      }
      if (next === undefined) {
        invalid(`${column.name} must contain a valid ${type.name} value.`);
        return;
      }
      input.setAttribute("aria-invalid", "false");
      const wasInvalid = cell.classList.contains("cell-draft-error");
      cell.classList.remove("cell-draft-error");
      if (wasInvalid) CDBVS.setStatus("Cell value applied.");
      if (next !== undefined) setCellValue(row, column, next);
      if (isEditingCell() && !committing) {
        needsCommit = true;
        return;
      }
      needsCommit = false;
      if (!cellContext.deferChanges) {
        commitCellMutation(undefined, refreshAfterCommit);
      }
    });
    if (type.code === 1 && !cellContext.deferChanges) {
      input.title = `${column.name} (text) - right-click the cell for the larger editor`;
    }
    if (type.code === 2) {
      if (!cellContext.rowEditor) {
        input.tabIndex = -1;
        input.style.pointerEvents = "none";
        input.setAttribute("aria-readonly", "true");
      }
      cell._cdbvsToggleBoolean = () => {
        setCellValue(row, column, row[column.name] !== true);
        input.checked = row[column.name] === true;
        if (!cellContext.deferChanges) {
          commitCellMutation(undefined, refreshAfterCommit);
        }
        return true;
      };
    }
    if (existingInput && existingInput !== input && existingInput.parentNode === cell) cell.removeChild(existingInput);
    cell.appendChild(input);
  }

  Object.assign(CDBVS, { makeCellEditor });
})(window);
