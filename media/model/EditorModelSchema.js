(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const typeOf = CDBVS.typeOf;
  const idColumn = CDBVS.idColumn;
  let referenceOptionsCache = new Map();

  function guidValue() {
    const chars = "#&0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let value = "";
    for (let index = 0; index < 11; index++) {
      if (index === 4 || index === 8) value += "-";
      value += chars[Math.floor(Math.random() * chars.length)];
    }
    return value;
  }

  function listSheet(parentSheet, column) {
    if (!state.data || !Array.isArray(state.data.sheets) || !parentSheet || !column) return null;
    return state.data.sheets.find((sheet) => sheet.name === `${parentSheet.name}@${column.name}`) || null;
  }

  function listKey(context, column) {
    return `${context.path}/${column.name}`;
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

  function readValue(input, column) {
    const type = typeOf(column);
    if (type.code === 2) return input.checked;
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

  Object.assign(CDBVS, {
    defaultValue, listSheet, listKey, readValue,
    referenceOptions, clearReferenceOptionsCache, createRowForSchema, listPreview,
    columnExtraProperties, sheetExtraProperties
  });
})(window);
