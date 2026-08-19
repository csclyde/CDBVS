// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const commitMutation = CDBVS.commitMutation;

  function isNestedType(type) {
    const code = typeof type === "number" ? type : (type && type.code);
    return code === 8 || code === 17;
  }

  function nestedSheetPrefix(sheet, columnName) {
    return `${sheet.name}@${columnName}`;
  }

  function nestedSheetBlock(sheet, columnName) {
    if (!state.data || !Array.isArray(state.data.sheets) || !sheet) return [];
    const prefix = nestedSheetPrefix(sheet, columnName);
    return state.data.sheets.filter((item) => item && (item.name === prefix || item.name.startsWith(`${prefix}@`)));
  }

  function ensureNestedSheet(sheet, column) {
    if (!sheet || !column || !state.data || !Array.isArray(state.data.sheets) || !isNestedType(CDBVS.typeOf(column))) return null;
    const prefix = nestedSheetPrefix(sheet, column.name);
    let child = state.data.sheets.find((item) => item && item.name === prefix);
    if (!child) {
      child = { name: prefix, props: { hide: true }, separators: [], lines: [], columns: [] };
      const parentIndex = state.data.sheets.indexOf(sheet);
      let insertAt = parentIndex < 0 ? state.data.sheets.length : parentIndex + 1;
      (sheet.columns || []).some((candidate) => {
        if (candidate === column) return true;
        if (!isNestedType(CDBVS.typeOf(candidate))) return false;
        const block = nestedSheetBlock(sheet, candidate.name);
        if (block.length) insertAt = Math.max(insertAt, state.data.sheets.indexOf(block[block.length - 1]) + 1);
        return false;
      });
      state.data.sheets.splice(insertAt, 0, child);
    }
    if (!child.props || typeof child.props !== "object" || Array.isArray(child.props)) child.props = {};
    child.props.hide = true;
    if (CDBVS.typeOf(column).code === 17) child.props.isProps = true;
    else delete child.props.isProps;
    if (!Array.isArray(child.columns)) child.columns = [];
    if (!Array.isArray(child.lines)) child.lines = [];
    if (!Array.isArray(child.separators)) child.separators = [];
    return child;
  }

  function removeNestedSheet(sheet, columnName) {
    if (!sheet || !state.data || !Array.isArray(state.data.sheets)) return false;
    const prefix = nestedSheetPrefix(sheet, columnName);
    const block = nestedSheetBlock(sheet, columnName);
    if (!block.length) return false;
    if (typeof CDBVS.mapTypeStrings === "function") {
      CDBVS.mapTypeStrings((raw) => {
        const separator = raw.indexOf(":");
        if (separator < 0) return raw;
        const code = raw.slice(0, separator);
        const target = raw.slice(separator + 1);
        return (code === "6" || code === "12") && (target === prefix || target.startsWith(`${prefix}@`)) ? "1" : raw;
      });
    }
    state.data.sheets = state.data.sheets.filter((item) => !block.includes(item));
    if (typeof CDBVS.removeSheetState === "function") CDBVS.removeSheetState(prefix);
    return true;
  }

  function integerValue(value) {
    if (typeof value === "number") return Number.isInteger(value) ? value : null;
    if (typeof value === "string" && /^[-+]?\d+$/.test(value.trim())) return Number(value);
    return null;
  }

  function numericValue(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
    return null;
  }

  function convertColumnValue(value, fromType, toType) {
    if (value === undefined || value === null) return { ok: true, value };
    if (fromType.code === toType.code) return { ok: true, value };
    if ([0, 1, 6, 7, 9, 12, 13, 20].includes(toType.code)) {
      if (toType.code === 1 && fromType.code === 5 && Number.isInteger(value) && fromType.values[value] !== undefined) {
        return { ok: true, value: fromType.values[value] };
      }
      if (["string", "number", "boolean"].includes(typeof value)) return { ok: true, value: String(value) };
      return { ok: false };
    }
    if (toType.code === 2) {
      if (typeof value === "boolean") return { ok: true, value };
      if (typeof value === "number" && Number.isFinite(value)) return { ok: true, value: value !== 0 };
      if (value === "true" || value === "false") return { ok: true, value: value === "true" };
      return { ok: false };
    }
    if ([3, 4].includes(toType.code)) {
      const number = typeof value === "boolean" ? (value ? 1 : 0) : numericValue(value);
      if (number === null || (toType.code === 3 && !Number.isInteger(number))) return { ok: false };
      return { ok: true, value: toType.code === 3 ? Math.trunc(number) : number };
    }
    if ([5, 10, 11].includes(toType.code)) {
      if (toType.code === 5 && fromType.code === 5 && Number.isInteger(value)) {
        const label = fromType.values[value];
        const mapped = toType.values.findIndex((item) => item === label);
        return { ok: mapped >= 0, value: mapped >= 0 ? mapped : undefined };
      }
      if (toType.code === 10 && fromType.code === 10 && Number.isInteger(value) && fromType.values.length && toType.values.length) {
        let mapped = 0;
        fromType.values.forEach((label, index) => {
          const targetIndex = toType.values.indexOf(label);
          if ((value & (1 << index)) !== 0 && targetIndex >= 0) mapped |= 1 << targetIndex;
        });
        return { ok: true, value: mapped };
      }
      if (toType.code === 10 && fromType.code === 5 && fromType.values.join(",") === toType.values.join(",") && Number.isInteger(value)) {
        return { ok: value >= 0 && value < toType.values.length, value: value >= 0 ? 1 << value : undefined };
      }
      const number = integerValue(value);
      if (number === null || (toType.code === 5 && toType.values.length && (number < 0 || number >= toType.values.length))) return { ok: false };
      return { ok: true, value: number };
    }
    if (toType.code === 8 && fromType.code === 17) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false };
      return { ok: true, value: Object.keys(value).length ? [value] : [] };
    }
    if (toType.code === 17 && fromType.code === 8) {
      if (!Array.isArray(value)) return { ok: false };
      return { ok: true, value: value[0] && typeof value[0] === "object" && !Array.isArray(value[0]) ? value[0] : {} };
    }
    // Lists, properties, and the remaining structured CastleDB values have
    // different JSON shapes. Do not silently reinterpret one as another.
    return { ok: false };
  }

  function prepareColumnTypeChange(sheet, column, typeString) {
    const fromType = CDBVS.typeOf(column);
    const toType = CDBVS.typeOf({ typeStr: typeString });
    if (toType.code < 0) {
      if (CDBVS.getTypeString(column) === typeString) return { ok: true, type: toType, columnName: column.name, values: [] };
      return { ok: false, message: `Unknown type '${typeString}'.` };
    }
    const values = [];
    if (fromType.code === toType.code) {
      if (fromType.code === 5 && fromType.argument !== toType.argument) {
        for (const line of (sheet.lines || [])) {
          if (!line || !Object.prototype.hasOwnProperty.call(line, column.name)) continue;
          const value = line[column.name];
          if (value === undefined || value === null) continue;
          if (!Number.isInteger(value) || fromType.values[value] === undefined) return { ok: false, message: `Cannot safely remap enum values for '${column.name}'.` };
          const next = toType.values.indexOf(fromType.values[value]);
          if (next < 0) return { ok: false, message: `Enum value '${fromType.values[value]}' is not defined by the new type.` };
          values.push({ line, value: next });
        }
      } else if (fromType.code === 10 && fromType.argument !== toType.argument) {
        for (const line of (sheet.lines || [])) {
          if (!line || !Object.prototype.hasOwnProperty.call(line, column.name)) continue;
          const value = line[column.name];
          if (value === undefined || value === null) continue;
          if (!Number.isInteger(value)) return { ok: false, message: `Cannot safely remap flags for '${column.name}'.` };
          let mapped = 0;
          let lost = false;
          for (let index = 0; index < fromType.values.length; index += 1) {
            const label = fromType.values[index];
            const next = toType.values.indexOf(label);
            if ((value & (1 << index)) !== 0) {
              if (next < 0) lost = true;
              else mapped |= 1 << next;
            }
          }
          if (lost) return { ok: false, message: `The new flags type removes a value used by '${column.name}'.` };
          values.push({ line, value: mapped });
        }
      }
      return { ok: true, type: toType, columnName: column.name, values };
    }
    for (const line of (sheet.lines || [])) {
      if (!line || !Object.prototype.hasOwnProperty.call(line, column.name)) continue;
      const converted = convertColumnValue(line[column.name], fromType, toType);
      if (!converted.ok) return { ok: false, message: `Cannot safely convert '${column.name}' from ${fromType.name} to ${toType.name}.` };
      values.push({ line, value: converted.value });
    }
    return { ok: true, type: toType, columnName: column.name, values };
  }

  function deleteColumnAt(sheet, index) {
    if (!sheet || !Array.isArray(sheet.columns) || !Number.isInteger(index)) return false;
    const column = sheet.columns[index];
    if (!column) return false;
    const nested = isNestedType(CDBVS.typeOf(column));
    sheet.columns.splice(index, 1);
    (sheet.lines || []).forEach((line) => { if (line) delete line[column.name]; });
    if (sheet.props && sheet.props.displayColumn === column.name) delete sheet.props.displayColumn;
    if (sheet.props && sheet.props.displayIcon === column.name) delete sheet.props.displayIcon;
    CDBVS.removeViewColumn(sheet.name, column.name);
    [state.selectedCells, state.activeCells].forEach((selections) => {
      const selection = selections && selections[sheet.name];
      if (!selection) return;
      if (selection.columnIndex > index) selection.columnIndex -= 1;
      if (selection.columnIndex >= sheet.columns.length) delete selections[sheet.name];
    });
    if (nested) removeNestedSheet(sheet, column.name);
    return true;
  }

  function moveColumn(sheet, index, delta) {
    if (!sheet || !Array.isArray(sheet.columns) || !Number.isInteger(index) || !Number.isInteger(delta)) return;
    const target = index + delta;
    if (target < 0 || target >= sheet.columns.length) return;
    commitMutation(() => {
      [sheet.columns[index], sheet.columns[target]] = [sheet.columns[target], sheet.columns[index]];
      const selection = state.selectedCells && state.selectedCells[sheet.name];
      if (selection && selection.columnIndex === index) selection.columnIndex = target;
      else if (selection && selection.columnIndex === target) selection.columnIndex = index;
      const active = state.activeCells && state.activeCells[sheet.name];
      if (active && active.columnIndex === index) active.columnIndex = target;
      else if (active && active.columnIndex === target) active.columnIndex = index;
    });
  }

  function sheetBlock(sheet) {
    if (!state.data || !Array.isArray(state.data.sheets)) return [];
    return state.data.sheets.filter((item) => item === sheet || item.name.startsWith(`${sheet.name}@`));
  }

  function moveSheet(sheet, delta) {
    const visible = CDBVS.visibleSheets();
    const sheets = visible.filter((candidate) => !visible.some((parent) => parent !== candidate && candidate.name.startsWith(`${parent.name}@`)));
    const index = sheets.indexOf(sheet);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= sheets.length) return;
    const other = sheets[target];
    const firstBlock = sheetBlock(sheet);
    const otherBlock = sheetBlock(other);
    const firstSet = new Set(firstBlock);
    const remaining = state.data.sheets.filter((item) => !firstSet.has(item));
    const otherIndex = remaining.indexOf(other);
    const insertAt = delta < 0 ? otherIndex : otherIndex + otherBlock.length;
    commitMutation(() => {
      remaining.splice(insertAt, 0, ...firstBlock);
      state.data.sheets = remaining;
    });
  }

  function mapTypeStrings(callback) {
    const sheets = state.data && Array.isArray(state.data.sheets) ? state.data.sheets : [];
    sheets.forEach((sheet) => (sheet.columns || []).forEach((column) => {
      const property = Object.prototype.hasOwnProperty.call(column, "typeStr") ? "typeStr" : (Object.prototype.hasOwnProperty.call(column, "type") ? "type" : null);
      if (property) column[property] = callback(String(column[property]));
    }));
    (state.data && Array.isArray(state.data.customTypes) ? state.data.customTypes : []).forEach((customType) => {
      (customType.cases || []).forEach((typeCase) => (typeCase.args || []).forEach((argument) => {
        const property = Object.prototype.hasOwnProperty.call(argument, "typeStr") ? "typeStr" : (Object.prototype.hasOwnProperty.call(argument, "type") ? "type" : null);
        if (property) argument[property] = callback(String(argument[property]));
      }));
    });
  }

  Object.assign(CDBVS, {
    isNestedType, nestedSheetBlock, ensureNestedSheet, removeNestedSheet,
    convertColumnValue, prepareColumnTypeChange,
    deleteColumnAt, moveColumn, sheetBlock, moveSheet, mapTypeStrings
  });
})(window);
