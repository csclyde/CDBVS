(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const TYPE_NAMES = CDBVS.TYPE_NAMES;
  let referenceOptionsCache = new Map();
  const sendUpdate = () => CDBVS.sendUpdate();

  function typeOf(column) {
    const raw = column && column.typeStr !== undefined ? column.typeStr : column && column.type;
    const value = String(raw ?? "");
    const separator = value.indexOf(":");
    const code = Number.parseInt(separator < 0 ? value : value.slice(0, separator), 10);
    const argument = separator < 0 ? "" : value.slice(separator + 1);
    return {
      code: Number.isInteger(code) ? code : -1,
      name: TYPE_NAMES[code] || "unknown",
      argument,
      values: (code === 5 || code === 10) && argument ? argument.split(",") : []
    };
  }

  function typeLabel(column) {
    const raw = column && column.typeStr !== undefined ? column.typeStr : column && column.type;
    return String(raw ?? "?");
  }

  function guidValue() {
    const chars = "#&0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let value = "";
    for (let index = 0; index < 11; index++) {
      if (index === 4 || index === 8) value += "-";
      value += chars[Math.floor(Math.random() * chars.length)];
    }
    return value;
  }

  function defaultValue(column, parentSheet) {
    switch (typeOf(column).code) {
      case 0: case 1: case 7: case 12: case 13: return "";
      case 6: {
        const options = referenceOptions(column);
        return options && options.length ? options[0] : "";
      }
      case 2: return false;
      case 3: case 4: case 5: case 10: case 11: return 0;
      case 8: return [];
      case 17: {
        const schema = listSheet(parentSheet, column);
        if (!schema) return {};
        const properties = {};
        (schema.columns || []).forEach((childColumn) => {
          if (childColumn.opt) return;
          const value = defaultValue(childColumn, schema);
          if (value !== null) properties[childColumn.name] = value;
        });
        return properties;
      }
      case 20: return guidValue();
      default: return null;
    }
  }

  function visibleSheets() {
    if (!state.data || !Array.isArray(state.data.sheets)) return [];
    return state.data.sheets.filter((sheet) => state.showHiddenSheets || !sheet.props || !sheet.props.hide);
  }

  function currentSheet() {
    const sheets = visibleSheets();
    if (!Number.isInteger(state.sheetIndex) || state.sheetIndex < 0 || state.sheetIndex >= sheets.length) state.sheetIndex = Math.max(0, sheets.length - 1);
    return sheets[state.sheetIndex] || null;
  }

  function selectedRowIndex(sheet) {
    const indexes = selectedRowIndices(sheet);
    const active = state.activeRows && state.activeRows[sheet && sheet.name];
    return indexes.length ? (Number.isInteger(active) && indexes.includes(active) ? active : indexes[indexes.length - 1]) : null;
  }

  function selectedRowIndices(sheet) {
    if (!sheet || !state.selectedRows) return [];
    const raw = state.selectedRows[sheet.name];
    const values = Array.isArray(raw) ? raw : [raw];
    const indexes = values.filter((index) => Number.isInteger(index) && index >= 0 && index < (sheet.lines || []).length);
    return [...new Set(indexes)].sort((left, right) => left - right);
  }

  function isRowSelected(sheet, index) {
    return selectedRowIndices(sheet).includes(index);
  }

  function selectRows(sheet, indexes, activeIndex, anchorIndex) {
    if (!sheet) return;
    if (!state.selectedRows) state.selectedRows = {};
    const valid = [...new Set((Array.isArray(indexes) ? indexes : [indexes]).filter((index) => Number.isInteger(index) && index >= 0 && index < (sheet.lines || []).length))].sort((left, right) => left - right);
    if (valid.length) {
      const active = Number.isInteger(activeIndex) && valid.includes(activeIndex) ? activeIndex : valid[valid.length - 1];
      state.selectedRows[sheet.name] = valid.filter((index) => index !== active).concat(active);
      if (!state.activeRows) state.activeRows = {};
      state.activeRows[sheet.name] = active;
      if (!state.rowSelectionAnchors) state.rowSelectionAnchors = {};
      state.rowSelectionAnchors[sheet.name] = Number.isInteger(anchorIndex) && valid.includes(anchorIndex) ? anchorIndex : active;
    } else {
      delete state.selectedRows[sheet.name];
      if (state.activeRows) delete state.activeRows[sheet.name];
      if (state.rowSelectionAnchors) delete state.rowSelectionAnchors[sheet.name];
    }
    if (state.selectedCells) delete state.selectedCells[sheet.name];
  }

  function selectRow(sheet, index) {
    selectRows(sheet, Number.isInteger(index) ? [index] : [], index);
  }

  function selectRowWithModifiers(sheet, index, event) {
    if (!sheet || !Number.isInteger(index)) return;
    const current = selectedRowIndices(sheet);
    const modified = event && (event.ctrlKey || event.metaKey);
    if (event && event.shiftKey) {
      const savedAnchor = state.rowSelectionAnchors && state.rowSelectionAnchors[sheet.name];
      const anchor = Number.isInteger(savedAnchor) && savedAnchor >= 0 && savedAnchor < (sheet.lines || []).length
        ? savedAnchor
        : (current.length ? current[current.length - 1] : index);
      const start = Math.min(anchor, index);
      const end = Math.max(anchor, index);
      selectRows(sheet, Array.from({ length: end - start + 1 }, (_, offset) => start + offset), index, anchor);
    } else if (modified) {
      selectRows(sheet, current.includes(index) ? current.filter((item) => item !== index) : current.concat(index), index);
    } else {
      selectRow(sheet, index);
    }
  }

  function selectedCell(sheet) {
    if (!sheet || !state.selectedCells) return null;
    const selection = state.selectedCells[sheet.name];
    if (!selection || !Number.isInteger(selection.rowIndex) || !Number.isInteger(selection.columnIndex)) return null;
    if (selection.rowIndex < 0 || selection.rowIndex >= (sheet.lines || []).length) return null;
    if (selection.columnIndex < 0 || selection.columnIndex >= (sheet.columns || []).length) return null;
    return {
      rowIndex: selection.rowIndex,
      columnIndex: selection.columnIndex,
      column: sheet.columns[selection.columnIndex]
    };
  }

  function selectCell(sheet, rowIndex, columnIndex) {
    if (!sheet) return;
    if (!state.selectedCells) state.selectedCells = {};
    if (!state.selectedRows) state.selectedRows = {};
    if (Number.isInteger(rowIndex) && rowIndex >= 0 && rowIndex < (sheet.lines || []).length && Number.isInteger(columnIndex) && columnIndex >= 0 && columnIndex < (sheet.columns || []).length) {
      selectRow(sheet, rowIndex);
      state.selectedCells[sheet.name] = { rowIndex, columnIndex };
    } else {
      delete state.selectedCells[sheet.name];
    }
  }

  function isSeparatorCollapsed(sheet, index) {
    if (!sheet || !state.collapsedSeparators) return false;
    return state.collapsedSeparators[sheet.name] && state.collapsedSeparators[sheet.name][String(index)] === true;
  }

  function toggleSeparatorCollapsed(sheet, index) {
    if (!sheet) return false;
    if (!state.collapsedSeparators) state.collapsedSeparators = {};
    if (!state.collapsedSeparators[sheet.name]) state.collapsedSeparators[sheet.name] = {};
    const key = String(index);
    state.collapsedSeparators[sheet.name][key] = !isSeparatorCollapsed(sheet, index);
    return state.collapsedSeparators[sheet.name][key];
  }

  function shiftCollapsedSeparators(sheet, change) {
    if (!sheet || !state.collapsedSeparators || !state.collapsedSeparators[sheet.name]) return;
    const shifted = {};
    Object.keys(state.collapsedSeparators[sheet.name]).forEach((key) => {
      const next = change(Number.parseInt(key, 10));
      if (next !== null && next !== undefined) shifted[String(next)] = state.collapsedSeparators[sheet.name][key];
    });
    state.collapsedSeparators[sheet.name] = shifted;
  }

  function viewForSheet(sheet) {
    if (!state.columnFilters[sheet.name]) state.columnFilters[sheet.name] = {};
    if (!state.sorts[sheet.name]) state.sorts[sheet.name] = { column: "", direction: "asc" };
    return { filters: state.columnFilters[sheet.name], sort: state.sorts[sheet.name] };
  }

  function renameViewSheet(oldName, newName) {
    if (oldName === newName) return;
    Object.keys(state.columnFilters).forEach((sheetName) => {
      if (sheetName !== oldName && !sheetName.startsWith(`${oldName}@`)) return;
      state.columnFilters[`${newName}${sheetName.slice(oldName.length)}`] = state.columnFilters[sheetName];
      delete state.columnFilters[sheetName];
    });
    Object.keys(state.sorts).forEach((sheetName) => {
      if (sheetName !== oldName && !sheetName.startsWith(`${oldName}@`)) return;
      state.sorts[`${newName}${sheetName.slice(oldName.length)}`] = state.sorts[sheetName];
      delete state.sorts[sheetName];
    });
    Object.keys(state.collapsedSeparators || {}).forEach((sheetName) => {
      if (sheetName !== oldName && !sheetName.startsWith(`${oldName}@`)) return;
      state.collapsedSeparators[`${newName}${sheetName.slice(oldName.length)}`] = state.collapsedSeparators[sheetName];
      delete state.collapsedSeparators[sheetName];
    });
  }

  function removeViewSheet(sheetName) {
    Object.keys(state.columnFilters).forEach((name) => {
      if (name === sheetName || name.startsWith(`${sheetName}@`)) delete state.columnFilters[name];
    });
    Object.keys(state.sorts).forEach((name) => {
      if (name === sheetName || name.startsWith(`${sheetName}@`)) delete state.sorts[name];
    });
    Object.keys(state.collapsedSeparators || {}).forEach((name) => {
      if (name === sheetName || name.startsWith(`${sheetName}@`)) delete state.collapsedSeparators[name];
    });
  }

  function renameViewColumn(sheetName, oldName, newName) {
    const filters = state.columnFilters[sheetName];
    if (filters && filters[oldName]) {
      filters[newName] = filters[oldName];
      delete filters[oldName];
    }
    const sort = state.sorts[sheetName];
    if (sort && sort.column === oldName) sort.column = newName;
  }

  function removeViewColumn(sheetName, columnName) {
    const filters = state.columnFilters[sheetName];
    if (filters) delete filters[columnName];
    const sort = state.sorts[sheetName];
    if (sort && sort.column === columnName) sort.column = "";
  }

  function clearViewState() {
    state.filter = "";
    state.columnFilters = {};
    state.sorts = {};
    CDBVS.render();
  }

  function filterMatches(column, value, rule) {
    if (!rule) return true;
    const type = typeOf(column);
    if (type.code === 2) {
      if (!rule.value || rule.value === "any") return true;
      if (value === undefined || value === null) return false;
      const booleanValue = value === true || value === 1 || value === "true";
      return rule.value === "true" ? booleanValue : !booleanValue;
    }
    if (type.code === 3 || type.code === 4) {
      const number = Number(value);
      if (!Number.isFinite(number)) return false;
      if (rule.min !== "" && rule.min !== undefined && number < Number(rule.min)) return false;
      if (rule.max !== "" && rule.max !== undefined && number > Number(rule.max)) return false;
      return true;
    }
    if (type.code === 11) {
      if (rule.value === undefined || String(rule.value).trim() === "") return true;
      if (value === undefined || value === null) return false;
      const query = String(rule.value).toLowerCase();
      return colorText(value).toLowerCase().includes(query) || String(value).toLowerCase().includes(query);
    }
    if (type.code === 5) return !rule.value || String(value) === String(rule.value);
    if (type.code === 10) {
      const mask = Number(rule.mask) || 0;
      return !mask || ((Number(value) || 0) & mask) === mask;
    }
    if (rule.value === undefined || String(rule.value).trim() === "") return true;
    return valueText(value).toLowerCase().includes(String(rule.value).toLowerCase());
  }

  function rowsForView(sheet) {
    const view = viewForSheet(sheet);
    const rows = (Array.isArray(sheet.lines) ? sheet.lines : []).map((rawRow, rowIndex) => {
      const row = rawRow && typeof rawRow === "object" && !Array.isArray(rawRow) ? rawRow : {};
      return { row, rowIndex };
    }).filter((entry) => {
      if (state.filter && !JSON.stringify(entry.row).toLowerCase().includes(state.filter.toLowerCase())) return false;
      return (sheet.columns || []).every((column) => filterMatches(column, entry.row[column.name], view.filters[column.name]));
    });
    if (!view.sort.column) return rows;
    const column = (sheet.columns || []).find((item) => item.name === view.sort.column);
    if (!column) return rows;
    const direction = view.sort.direction === "desc" ? -1 : 1;
    rows.sort((left, right) => {
      const a = left.row[column.name];
      const b = right.row[column.name];
      if (a === undefined || a === null || a === "") return b === undefined || b === null || b === "" ? left.rowIndex - right.rowIndex : 1;
      if (b === undefined || b === null || b === "") return -1;
      const type = typeOf(column);
      let comparison;
      if (type.code === 2 || type.code === 3 || type.code === 4 || type.code === 5 || type.code === 10 || type.code === 11) {
        comparison = Number(a) - Number(b);
      } else {
        comparison = valueText(a).toLowerCase().localeCompare(valueText(b).toLowerCase());
      }
      return (comparison || (left.rowIndex - right.rowIndex)) * direction;
    });
    return rows;
  }

  function idColumn(sheet) {
    return (sheet && Array.isArray(sheet.columns) ? sheet.columns : []).find((column) => typeOf(column).code === 0) || null;
  }

  function cellErrorKey(rowIndex, columnName) {
    return `${rowIndex}\u0000${columnName}`;
  }

  function normalizeCellError(error, code) {
    const normalized = typeof error === "string" ? { message: error } : Object.assign({}, error || {});
    if (!normalized.message) return null;
    normalized.code = normalized.code || code || "cell-error";
    normalized.severity = normalized.severity || "error";
    return normalized;
  }

  function addCellError(sheet, rowIndex, columnName, error, code) {
    if (!sheet || !Number.isInteger(rowIndex) || !columnName) return false;
    const normalized = normalizeCellError(error, code);
    if (!normalized) return false;
    if (!state.cellErrors) state.cellErrors = {};
    if (!state.cellErrors[sheet.name]) state.cellErrors[sheet.name] = {};
    const key = cellErrorKey(rowIndex, columnName);
    const errors = state.cellErrors[sheet.name][key] || (state.cellErrors[sheet.name][key] = []);
    if (!errors.some((item) => item.code === normalized.code && item.message === normalized.message)) errors.push(normalized);
    return true;
  }

  function clearCellErrors(sheet, rowIndex, columnName) {
    if (!sheet || !state.cellErrors || !state.cellErrors[sheet.name]) return;
    if (!Number.isInteger(rowIndex)) {
      delete state.cellErrors[sheet.name];
      return;
    }
    if (columnName) delete state.cellErrors[sheet.name][cellErrorKey(rowIndex, columnName)];
    else {
      const prefix = `${rowIndex}\u0000`;
      Object.keys(state.cellErrors[sheet.name]).forEach((key) => { if (key.startsWith(prefix)) delete state.cellErrors[sheet.name][key]; });
    }
  }

  function cellErrorsForSheet(sheet) {
    const result = {};
    if (!sheet) return result;
    const add = (rowIndex, columnName, error) => {
      const normalized = normalizeCellError(error);
      if (!normalized) return;
      const key = cellErrorKey(rowIndex, columnName);
      if (!result[key]) result[key] = [];
      if (!result[key].some((item) => item.code === normalized.code && item.message === normalized.message)) result[key].push(normalized);
    };
    const custom = state.cellErrors && state.cellErrors[sheet.name];
    Object.keys(custom || {}).forEach((key) => {
      (Array.isArray(custom[key]) ? custom[key] : [custom[key]]).forEach((error) => {
        const separator = key.indexOf("\u0000");
        if (separator < 0) return;
        add(Number.parseInt(key.slice(0, separator), 10), key.slice(separator + 1), error);
      });
    });
    const primary = idColumn(sheet);
    if (primary && Array.isArray(sheet.lines)) {
      const seen = new Map();
      sheet.lines.forEach((line, rowIndex) => {
        const value = line && line[primary.name];
        if (value === undefined || value === null || value === "") return;
        const key = String(value);
        if (seen.has(key)) {
          add(rowIndex, primary.name, {
            code: "duplicate-primary-id",
            message: `Duplicate primary ID '${value}'. The first occurrence is row ${seen.get(key) + 1}.`
          });
        } else seen.set(key, rowIndex);
      });
    }
    return result;
  }

  function setColumnTypeString(column, typeString) {
    if (!column || typeof column !== "object") return;
    const property = Object.prototype.hasOwnProperty.call(column, "typeStr") ? "typeStr" : (Object.prototype.hasOwnProperty.call(column, "type") ? "type" : "typeStr");
    column[property] = typeString;
  }

  function setPrimaryColumn(sheet, columnName) {
    if (!sheet || !Array.isArray(sheet.columns)) return;
    sheet.columns.forEach((column) => {
      if (column.name === columnName) setColumnTypeString(column, "0");
      else if (typeOf(column).code === 0) setColumnTypeString(column, "1");
    });
  }

  function listSheet(parentSheet, column) {
    if (!state.data || !Array.isArray(state.data.sheets) || !parentSheet || !column) return null;
    return state.data.sheets.find((sheet) => sheet.name === `${parentSheet.name}@${column.name}`) || null;
  }

  function listKey(context, column) {
    return `${context.path}/${column.name}`;
  }

  function readValue(input, column) {
    const type = typeOf(column);
    if (type.code === 2) return input.checked;
    // An empty editor value represents an explicitly cleared field. Keep the
    // property in the row so the serialized CastleDB document records null
    // instead of silently changing the value to a type default or omitting it.
    const inputValue = input && input.value !== undefined && input.value !== null ? String(input.value) : "";
    if (inputValue.trim() === "") return null;
    if (type.code === 11) return Number.parseInt(String(input.value).replace(/^#/, ""), 16) || 0;
    if (type.code === 3 || type.code === 5 || type.code === 10) return Number.parseInt(input.value, 10) || 0;
    if (type.code === 4) return Number.parseFloat(input.value) || 0;
    if ([8, 9, 14, 15, 16, 17, 18, 19].includes(type.code)) {
      try { return JSON.parse(input.value); } catch (_) { return undefined; }
    }
    return input.value;
  }

  function valueText(value) {
    if (value === undefined || value === null) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function colorText(value) {
    return `#${Math.max(0, Number(value) || 0).toString(16).slice(-6).padStart(6, "0")}`;
  }

  function referenceOptions(column) {
    const target = typeOf(column).argument;
    if (referenceOptionsCache.has(target)) return referenceOptionsCache.get(target);
    const sheet = (state.data.sheets || []).find((item) => item.name === target);
    const id = idColumn(sheet);
    if (!sheet || !id || !Array.isArray(sheet.lines)) {
      referenceOptionsCache.set(target, null);
      return null;
    }
    const values = sheet.lines.map((line) => line && line[id.name]).filter((value) => value !== undefined && value !== null);
    referenceOptionsCache.set(target, values);
    return values;
  }

  function clearReferenceOptionsCache() {
    referenceOptionsCache = new Map();
  }

  function createRowForSchema(sheet, collection) {
    const row = {};
    (sheet && Array.isArray(sheet.columns) ? sheet.columns : []).forEach((column) => {
      const value = defaultValue(column, sheet);
      if (value !== null && (!column.opt || typeOf(column).code === 0)) row[column.name] = value;
    });
    const id = idColumn(sheet);
    if (id) {
      const rows = Array.isArray(collection) ? collection : [];
      let index = rows.length + 1;
      let candidate = `new_${index}`;
      while (rows.some((item) => item && item[id.name] === candidate)) candidate = `new_${++index}`;
      row[id.name] = candidate;
    }
    return row;
  }

  function separatorIndex(separator) {
    return typeof separator === "number" ? separator : separator && separator.index;
  }

  function moveSeparators(sheet, change) {
    if (!Array.isArray(sheet.separators)) return;
    sheet.separators = sheet.separators.map((separator) => {
      const index = separatorIndex(separator);
      if (index === undefined) return separator;
      const next = change(index);
      if (next === null) return null;
      if (typeof separator === "number") return next;
      return Object.assign({}, separator, { index: next });
    }).filter((separator) => separator !== null);
  }

  function insertRow(sheet, index, row, notify = true) {
    if (!sheet) return;
    if (!Array.isArray(sheet.lines)) sheet.lines = [];
    const insertionIndex = Number.isInteger(index) ? Math.max(0, Math.min(index, sheet.lines.length)) : sheet.lines.length;
    const nextRow = row && typeof row === "object" && !Array.isArray(row) ? row : createRowForSchema(sheet, sheet.lines);
    sheet.lines.splice(insertionIndex, 0, nextRow);
    moveSeparators(sheet, (separatorIndexValue) => separatorIndexValue >= insertionIndex ? separatorIndexValue + 1 : separatorIndexValue);
    shiftCollapsedSeparators(sheet, (separatorIndexValue) => separatorIndexValue >= insertionIndex ? separatorIndexValue + 1 : separatorIndexValue);
    if (notify) sendUpdate();
  }

  function moveRow(sheet, index, delta) {
    if (!sheet || !Array.isArray(sheet.lines) || !Number.isInteger(index) || !Number.isInteger(delta)) return;
    const target = index + delta;
    if (target < 0 || target >= sheet.lines.length) return;
    const lines = sheet.lines;
    [lines[index], lines[target]] = [lines[target], lines[index]];
    // Separators mark fixed section boundaries, not row ownership. Keep their
    // indexes unchanged so a moved row can cross a separator naturally.
    sendUpdate();
  }

  function toggleSeparator(sheet, index) {
    if (!sheet) return;
    if (!Array.isArray(sheet.separators)) sheet.separators = [];
    const existing = sheet.separators.findIndex((separator) => separatorIndex(separator) === index);
    if (existing >= 0) sheet.separators.splice(existing, 1);
    else {
      sheet.separators.push(index);
      sheet.separators.sort((a, b) => separatorIndex(a) - separatorIndex(b));
    }
    sendUpdate();
  }

  function addSeparator(sheet, index) {
    if (!sheet || !Number.isInteger(index)) return false;
    if (!Array.isArray(sheet.separators)) sheet.separators = [];
    if (sheet.separators.some((separator) => separatorIndex(separator) === index)) return false;
    sheet.separators.push({ index, title: "Section" });
    sheet.separators.sort((left, right) => separatorIndex(left) - separatorIndex(right));
    sendUpdate();
    if (typeof CDBVS.render === "function") CDBVS.render();
    return true;
  }

  function removeSeparator(sheet, index) {
    if (!sheet || !Array.isArray(sheet.separators)) return false;
    const position = sheet.separators.findIndex((separator) => separatorIndex(separator) === index);
    if (position < 0) return false;
    sheet.separators.splice(position, 1);
    if (sheet.props && Array.isArray(sheet.props.separatorTitles)) sheet.props.separatorTitles.splice(position, 1);
    if (state.collapsedSeparators && state.collapsedSeparators[sheet.name]) delete state.collapsedSeparators[sheet.name][String(index)];
    sendUpdate();
    if (typeof CDBVS.render === "function") CDBVS.render();
    return true;
  }

  function deleteRowAt(sheet, index) {
    if (!sheet || !Array.isArray(sheet.lines) || !Number.isInteger(index) || index < 0 || index >= sheet.lines.length) return false;
    sheet.lines.splice(index, 1);
    moveSeparators(sheet, (separatorIndexValue) => {
      if (separatorIndexValue === index) return null;
      return separatorIndexValue > index ? separatorIndexValue - 1 : separatorIndexValue;
    });
    shiftCollapsedSeparators(sheet, (separatorIndexValue) => {
      if (separatorIndexValue === index) return null;
      return separatorIndexValue > index ? separatorIndexValue - 1 : separatorIndexValue;
    });
    return true;
  }

  function moveColumn(sheet, index, delta) {
    if (!sheet || !Array.isArray(sheet.columns) || !Number.isInteger(index) || !Number.isInteger(delta)) return;
    const target = index + delta;
    if (target < 0 || target >= sheet.columns.length) return;
    const columns = sheet.columns;
    [columns[index], columns[target]] = [columns[target], columns[index]];
    const selection = state.selectedCells && state.selectedCells[sheet.name];
    if (selection && selection.columnIndex === index) selection.columnIndex = target;
    else if (selection && selection.columnIndex === target) selection.columnIndex = index;
    sendUpdate();
    if (typeof CDBVS.render === "function") CDBVS.render();
  }

  function sheetBlock(sheet) {
    if (!state.data || !Array.isArray(state.data.sheets)) return [];
    return state.data.sheets.filter((item) => item === sheet || item.name.startsWith(`${sheet.name}@`));
  }

  function moveSheet(sheet, delta) {
    const visible = visibleSheets();
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
    remaining.splice(insertAt, 0, ...firstBlock);
    state.data.sheets = remaining;
    sendUpdate();
    if (typeof CDBVS.render === "function") CDBVS.render();
  }

  function listPreview(values, schema) {
    if (!values.length) return "empty list";
    const columns = Array.isArray(schema.columns) ? schema.columns : [];
    const first = values[0];
    if (!first || typeof first !== "object") return String(first);
    const fields = columns.map((column) => {
      const value = first[column.name];
      if (value === undefined || value === null) return null;
      if (typeof value === "object") return `${column.name}: [...]`;
      return `${column.name}: ${String(value)}`;
    }).filter((value) => value !== null);
    let preview = fields.join(", ") || "empty item";
    if (preview.length > 90) preview = `${preview.slice(0, 87)}...`;
    return preview;
  }

  function columnExtraProperties(column) {
    const standard = new Set(["name", "type", "typeStr", "opt", "display", "kind", "scope", "documentation"]);
    const extra = {};
    Object.keys(column).forEach((key) => {
      if (!standard.has(key)) extra[key] = column[key];
    });
    return extra;
  }

  function sheetExtraProperties(props) {
    const standard = new Set(["displayColumn", "displayIcon", "hide", "isProps", "hasIndex", "hasGroup", "dataFiles"]);
    const extra = {};
    Object.keys(props || {}).forEach((key) => {
      if (!standard.has(key)) extra[key] = props[key];
    });
    return extra;
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
    typeOf, typeLabel, defaultValue, visibleSheets, currentSheet, selectedRowIndex, selectedRowIndices, isRowSelected, selectRow, selectRows, selectRowWithModifiers, selectedCell, selectCell, viewForSheet,
    renameViewSheet, removeViewSheet, renameViewColumn, removeViewColumn,
    clearViewState, filterMatches, rowsForView, idColumn, setPrimaryColumn, cellErrorKey, addCellError, clearCellErrors, cellErrorsForSheet, isSeparatorCollapsed, toggleSeparatorCollapsed, listSheet, listKey,
    readValue, valueText, colorText, referenceOptions, clearReferenceOptionsCache, createRowForSchema,
    separatorIndex, moveSeparators, insertRow, moveRow, toggleSeparator, addSeparator, removeSeparator,
    deleteRowAt, moveColumn, sheetBlock, moveSheet, listPreview,
    columnExtraProperties, sheetExtraProperties, mapTypeStrings
  });
})(window);
