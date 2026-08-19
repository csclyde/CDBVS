// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const typeOf = CDBVS.typeOf;
  const renameViewColumn = CDBVS.renameViewColumn;
  const mapTypeStrings = CDBVS.mapTypeStrings;
  const setPrimaryColumn = CDBVS.setPrimaryColumn;
  const clearListState = CDBVS.clearListState;
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
    if (sheet.columns.some((item, index) => (isNew || index !== columnIndex) && item.name === newName)) {
      return { ok: false, message: `Column '${newName}' already exists on this sheet.` };
    }
    const preparedType = prepareColumnTypeChange(sheet, column, typeString);
    if (!preparedType.ok) return preparedType;
    const oldName = column.name;
    const oldNested = isNestedType(typeOf(column));
    const typeProperty = Object.prototype.hasOwnProperty.call(column, "typeStr")
      ? "typeStr" : (Object.prototype.hasOwnProperty.call(column, "type") ? "type" : "typeStr");
    if (!isNew && oldName !== newName) {
      (sheet.lines || []).forEach((line) => {
        if (!line || !Object.prototype.hasOwnProperty.call(line, oldName)) return;
        if (!Object.prototype.hasOwnProperty.call(line, newName)) line[newName] = line[oldName];
        delete line[oldName];
      });
      const oldPrefix = `${sheet.name}@${oldName}`;
      const newPrefix = `${sheet.name}@${newName}`;
      const sheets = CDBVS.allSheets();
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
      renameViewColumn(sheet.name, oldName, newName);
      clearListState();
    }
    column.name = newName;
    CDBVS.setColumnTypeString(column, typeString);
    column.opt = config.optional === true;
    preparedType.values.forEach(({ line, value }) => { line[newName] = value; });
    if (!column.opt) {
      (sheet.lines || []).forEach((line) => {
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
