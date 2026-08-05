(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const TYPE_NAMES = CDBVS.TYPE_NAMES;
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

  function defaultValue(column) {
    switch (typeOf(column).code) {
      case 0: case 1: case 6: case 7: case 12: case 13: return "";
      case 2: return false;
      case 3: case 4: case 5: case 10: case 11: return 0;
      case 8: return [];
      case 17: return {};
      default: return null;
    }
  }

  function visibleSheets() {
    if (!state.data || !Array.isArray(state.data.sheets)) return [];
    return state.data.sheets.filter((sheet) => state.showHiddenSheets || !sheet.props || !sheet.props.hide);
  }

  function currentSheet() {
    const sheets = visibleSheets();
    if (state.sheetIndex >= sheets.length) state.sheetIndex = Math.max(0, sheets.length - 1);
    return sheets[state.sheetIndex] || null;
  }

  function selectedRowIndex(sheet) {
    if (!sheet || !state.selectedRows) return null;
    const index = state.selectedRows[sheet.name];
    return Number.isInteger(index) && index >= 0 && index < (sheet.lines || []).length ? index : null;
  }

  function selectRow(sheet, index) {
    if (!sheet) return;
    if (!state.selectedRows) state.selectedRows = {};
    if (Number.isInteger(index) && index >= 0 && index < (sheet.lines || []).length) state.selectedRows[sheet.name] = index;
    else delete state.selectedRows[sheet.name];
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
  }

  function removeViewSheet(sheetName) {
    Object.keys(state.columnFilters).forEach((name) => {
      if (name === sheetName || name.startsWith(`${sheetName}@`)) delete state.columnFilters[name];
    });
    Object.keys(state.sorts).forEach((name) => {
      if (name === sheetName || name.startsWith(`${sheetName}@`)) delete state.sorts[name];
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
      if (row !== rawRow) sheet.lines[rowIndex] = row;
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
    const sheet = (state.data.sheets || []).find((item) => item.name === target);
    const id = idColumn(sheet);
    if (!sheet || !id || !Array.isArray(sheet.lines)) return null;
    return sheet.lines.map((line) => line && line[id.name]).filter((value) => value !== undefined && value !== null);
  }

  function createRowForSchema(sheet, collection) {
    const row = {};
    (sheet && Array.isArray(sheet.columns) ? sheet.columns : []).forEach((column) => {
      const value = defaultValue(column);
      if (value !== null && (!column.opt || typeOf(column).code === 0)) row[column.name] = value;
    });
    const id = idColumn(sheet);
    if (id) {
      let index = collection.length + 1;
      let candidate = `new_${index}`;
      while (collection.some((item) => item && item[id.name] === candidate)) candidate = `new_${++index}`;
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

  function insertRow(sheet, index) {
    if (!sheet) return;
    if (!Array.isArray(sheet.lines)) sheet.lines = [];
    sheet.lines.splice(index, 0, createRowForSchema(sheet, sheet.lines));
    moveSeparators(sheet, (separatorIndexValue) => separatorIndexValue >= index ? separatorIndexValue + 1 : separatorIndexValue);
    sendUpdate();
  }

  function moveRow(sheet, index, delta) {
    if (!sheet || !Array.isArray(sheet.lines)) return;
    const target = index + delta;
    if (target < 0 || target >= sheet.lines.length) return;
    const lines = sheet.lines;
    [lines[index], lines[target]] = [lines[target], lines[index]];
    moveSeparators(sheet, (separatorIndexValue) => {
      if (separatorIndexValue === index) return target;
      if (separatorIndexValue === target) return index;
      return separatorIndexValue;
    });
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

  function deleteRowAt(sheet, index) {
    if (!sheet || !Array.isArray(sheet.lines)) return;
    sheet.lines.splice(index, 1);
    moveSeparators(sheet, (separatorIndexValue) => {
      if (separatorIndexValue === index) return null;
      return separatorIndexValue > index ? separatorIndexValue - 1 : separatorIndexValue;
    });
  }

  function moveColumn(sheet, index, delta) {
    if (!sheet || !Array.isArray(sheet.columns)) return;
    const target = index + delta;
    if (target < 0 || target >= sheet.columns.length) return;
    const columns = sheet.columns;
    [columns[index], columns[target]] = [columns[target], columns[index]];
    sendUpdate();
    if (typeof CDBVS.render === "function") CDBVS.render();
  }

  function sheetBlock(sheet) {
    if (!state.data || !Array.isArray(state.data.sheets)) return [];
    return state.data.sheets.filter((item) => item === sheet || item.name.startsWith(`${sheet.name}@`));
  }

  function moveSheet(sheet, delta) {
    const sheets = visibleSheets();
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
    typeOf, typeLabel, defaultValue, visibleSheets, currentSheet, selectedRowIndex, selectRow, viewForSheet,
    renameViewSheet, removeViewSheet, renameViewColumn, removeViewColumn,
    clearViewState, filterMatches, rowsForView, idColumn, setPrimaryColumn, listSheet, listKey,
    readValue, valueText, colorText, referenceOptions, createRowForSchema,
    separatorIndex, moveSeparators, insertRow, moveRow, toggleSeparator,
    deleteRowAt, moveColumn, sheetBlock, moveSheet, listPreview,
    columnExtraProperties, sheetExtraProperties, mapTypeStrings
  });
})(window);
