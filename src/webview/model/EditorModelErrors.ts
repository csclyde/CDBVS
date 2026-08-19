// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const sheetState = CDBVS.services.sheetState;

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
    const sheetErrors = sheetState.errors(sheet.name);
    const key = cellErrorKey(rowIndex, columnName);
    const errors = sheetErrors[key] || (sheetErrors[key] = []);
    if (!errors.some((item) => item.code === normalized.code && item.message === normalized.message)) errors.push(normalized);
    return true;
  }

  function clearCellErrors(sheet, rowIndex, columnName) {
    if (!sheet) return;
    const sheetErrors = sheetState.readErrors(sheet.name);
    if (!sheetErrors) return;
    if (!Number.isInteger(rowIndex)) {
      sheetState.clearErrors(sheet.name);
      return;
    }
    if (columnName) delete sheetErrors[cellErrorKey(rowIndex, columnName)];
    else {
      const prefix = `${rowIndex}\u0000`;
      Object.keys(sheetErrors).forEach((key) => { if (key.startsWith(prefix)) delete sheetErrors[key]; });
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
    const custom = sheetState.readErrors(sheet.name);
    Object.keys(custom || {}).forEach((key) => {
      (Array.isArray(custom[key]) ? custom[key] : [custom[key]]).forEach((error) => {
        const separator = key.indexOf("\u0000");
        if (separator < 0) return;
        add(Number.parseInt(key.slice(0, separator), 10), key.slice(separator + 1), error);
      });
    });
    const primary = CDBVS.idColumn(sheet);
    if (primary && Array.isArray(sheet.lines)) {
      const seen = new Map();
      sheet.lines.forEach((line, rowIndex) => {
        const value = line && line[primary.name];
        if (value === undefined || value === null || value === "") return;
        const key = String(value);
        if (seen.has(key)) add(rowIndex, primary.name, { code: "duplicate-primary-id", message: `Duplicate primary ID '${value}'. The first occurrence is row ${seen.get(key) + 1}.` });
        else seen.set(key, rowIndex);
      });
    }
    return result;
  }

  Object.assign(CDBVS, { cellErrorKey, addCellError, clearCellErrors, cellErrorsForSheet });
})(window);
