// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const documentModel = CDBVS.services.document;
  const typeOf = CDBVS.typeOf;
  const mapTypeStrings = CDBVS.mapTypeStrings;
  const setPrimaryColumn = CDBVS.setPrimaryColumn;
  const isNestedType = CDBVS.isNestedType;
  const prepareColumnTypeChange = CDBVS.prepareColumnTypeChange;
  const ensureNestedSheet = CDBVS.ensureNestedSheet;
  const removeNestedSheet = CDBVS.removeNestedSheet;
  const defaultValue = CDBVS.defaultValue;

  function ensureSheetColumns(sheet) {
    if (!sheet) return [];
    if (!Array.isArray(sheet.columns)) sheet.columns = [];
    return sheet.columns;
  }

  function applyColumnEdit(sheet, column, columnIndex, options) {
    const config = options || {};
    if (!sheet || !column || !Array.isArray(sheet.columns)) return { ok: false, message: "Column is unavailable." };
    const newName = typeof config.name === "string" ? config.name.trim() : "";
    const typeString = typeof config.typeString === "string" ? config.typeString.trim() : "";
    if (!newName) return { ok: false, message: "Column name cannot be empty." };
    if (!typeString) return { ok: false, message: "Type cannot be empty." };
    const isNew = config.isNew === true;
    const source = CDBVS.schemaRows(sheet);
    if (!source.ok) return source;
    if (sheet.columns.some((item, index) => (isNew || index !== columnIndex) && item.name === newName)) {
      return { ok: false, message: `Column '${newName}' already exists on this sheet.` };
    }
    if ((isNew || column.name !== newName) && source.rows.some((row) => Object.prototype.hasOwnProperty.call(row, newName))) {
      return { ok: false, message: `Field '${newName}' already contains data outside this column. Choose another name to preserve it.` };
    }
    const oldPrefix = `${sheet.name}@${column.name}`;
    const newPrefix = `${sheet.name}@${newName}`;
    if (column.name !== newName) {
      const block = CDBVS.nestedSheetBlock(sheet, column.name);
      if (block.some((child) => documentModel.sheets().some((other) => !block.includes(other)
        && other.name === `${newPrefix}${child.name.slice(oldPrefix.length)}`))) {
        return { ok: false, message: `Renaming this column would collide with an existing nested sheet. Choose another name.` };
      }
    }
    const preparedType = prepareColumnTypeChange(sheet, column, typeString);
    if (!preparedType.ok) return preparedType;
    let preparedDefault;
    if (Object.prototype.hasOwnProperty.call(column, "defaultValue") && column.defaultValue !== undefined
      && CDBVS.getTypeString(column) !== typeString) {
      const defaultChange = prepareColumnTypeChange({ lines: [{ [column.name]: column.defaultValue }] }, column, typeString);
      if (!defaultChange.ok) return { ok: false, message: `Cannot safely convert the default value for '${column.name}'. Review it in Raw JSON first.` };
      preparedDefault = defaultChange.values.length ? defaultChange.values[0] : null;
    }
    const oldName = column.name;
    const oldNested = isNestedType(typeOf(column));
    if (!oldNested && isNestedType(preparedType.type) && documentModel.findSheet(newPrefix)) {
      return { ok: false, message: `Nested sheet '${newPrefix}' already exists outside this column. Choose another name to preserve it.` };
    }
    const typeProperty = Object.prototype.hasOwnProperty.call(column, "typeStr")
      ? "typeStr" : (Object.prototype.hasOwnProperty.call(column, "type") ? "type" : "typeStr");
    if (!isNew && oldName !== newName) {
      source.rows.forEach((line) => {
        if (!line || !Object.prototype.hasOwnProperty.call(line, oldName)) return;
        if (!Object.prototype.hasOwnProperty.call(line, newName)) line[newName] = line[oldName];
        delete line[oldName];
      });
      const oldPrefix = `${sheet.name}@${oldName}`;
      const newPrefix = `${sheet.name}@${newName}`;
      const sheets = documentModel.sheets();
      sheets.forEach((subSheet) => {
        if (subSheet.name === oldPrefix || subSheet.name.startsWith(`${oldPrefix}@`)) {
          subSheet.name = `${newPrefix}${subSheet.name.slice(oldPrefix.length)}`;
        }
      });
      mapTypeStrings((raw) => {
        const separator = raw.indexOf(":");
        if (separator < 0) return raw;
        const code = raw.slice(0, separator);
        const target = raw.slice(separator + 1);
        return (code === "6" || code === "12") && (target === oldPrefix || target.startsWith(`${oldPrefix}@`))
          ? `${code}:${newPrefix}${target.slice(oldPrefix.length)}` : raw;
      });
      if (sheet.props && sheet.props.displayColumn === oldName) sheet.props.displayColumn = newName;
      if (sheet.props && sheet.props.displayIcon === oldName) sheet.props.displayIcon = newName;
    }
    column.name = newName;
    CDBVS.setColumnTypeString(column, typeString);
    if (preparedDefault) column.defaultValue = preparedDefault.value;
    column.opt = config.optional === true;
    preparedType.values.forEach(({ line, value }) => { line[newName] = value; });
    if (!column.opt) {
      source.rows.forEach((line) => {
        if (!line || Object.prototype.hasOwnProperty.call(line, newName)) return;
        const value = defaultValue(column, sheet);
        if (value !== null) line[newName] = value;
      });
    }
    if (config.display === undefined || config.display === null || config.display === "") delete column.display;
    else column.display = Number(config.display);
    if (isNew) sheet.columns.splice(Math.min(columnIndex, sheet.columns.length), 0, column);
    if (typeOf(column).code === 0) setPrimaryColumn(sheet, column.name);
    const newNested = isNestedType(typeOf(column));
    if (oldNested && !newNested) removeNestedSheet(sheet, newName);
    else if (newNested) ensureNestedSheet(sheet, column);
    return { ok: true };
  }

  Object.assign(CDBVS, { ensureSheetColumns, applyColumnEdit });
})(window);
