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
  const renderMutation = application.renderMutation;
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

  function lazyChoiceEditor(cell, row, column, context, type) {
    const input = document.createElement("select");
    input.className = "lazy-cell-editor";
    input.title = `${column.name} (${type.name})`;
    const value = row[column.name];
    if (type.code === 5) {
      const index = Number.isInteger(Number(value)) ? Number(value) : 0;
      input.add(new Option(type.values[index] || String(value ?? ""), String(value ?? 0)));
      input.value = String(value ?? 0);
    } else {
      input.add(new Option("", ""));
      if (value !== undefined && value !== null && value !== "") input.add(new Option(String(value), String(value)));
      input.value = String(value ?? "");
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
      } else renderMutation();
    };
    if (type.code === 10 && type.values.length) {
      const flags = makeElement("div", null, "flags-input");
      let current = Number(value) || 0;
      let flagsNeedCommit = false;
      type.values.forEach((label, flagIndex) => {
        const flagLabel = makeElement("label", null, "flag-item");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = (current & (1 << flagIndex)) !== 0;
        checkbox._cdbvsCommit = () => {
          if (!flagsNeedCommit) return;
          committing = true;
          try { checkbox.dispatchEvent(new Event("change", { bubbles: false })); }
          finally { committing = false; }
        };
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
      const values = type.values.length ? type.values : ["0"];
      values.forEach((label, index) => input.add(new Option(label, String(index))));
      input.value = String(value ?? 0);
    } else if (type.code === 6 && references) {
      input = existingInput && existingInput.tagName === "SELECT" ? existingInput : document.createElement("select");
      input.replaceChildren();
      input.add(new Option("", ""));
      references.forEach((item) => input.add(new Option(String(item), String(item))));
      input.value = String(value ?? "");
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
    input._cdbvsCommit = () => {
      const next = readValue(input, column);
      const current = row[column.name];
      const changed = next !== undefined && JSON.stringify(next) !== JSON.stringify(current);
      if (!needsCommit && !changed) return;
      committing = true;
      try { input.dispatchEvent(new Event("change", { bubbles: false })); }
      finally { committing = false; }
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
      const next = readValue(input, column);
      const complex = [8, 9, 14, 15, 16, 17, 18, 19].includes(type.code);
      if (complex && input.value !== "" && next === undefined) {
        CDBVS.setStatus("Complex values must contain valid JSON before they can be saved.", true);
        return;
      }
      if (next === undefined) {
        CDBVS.setStatus(`${column.name} must contain a valid ${type.name} value.`, true);
        return;
      }
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
      input.title = `${column.name} (text) - double-click to open the larger editor`;
      input.addEventListener("dblclick", (event) => {
        event.preventDefault();
        CDBVS.openTextEditor(row, column, input);
      });
    }
    if (type.code === 2 && !cellContext.deferChanges) {
      input.tabIndex = -1;
      input.style.pointerEvents = "none";
      input.setAttribute("aria-readonly", "true");
      cell._cdbvsToggleBoolean = () => {
        setCellValue(row, column, row[column.name] !== true);
        input.checked = row[column.name] === true;
        if (!cellContext.deferChanges) {
          commitCellMutation(undefined, refreshAfterCommit);
        }
        return true;
      };
    }
    cell.appendChild(input);
  }

  Object.assign(CDBVS, { makeCellEditor });
})(window);
