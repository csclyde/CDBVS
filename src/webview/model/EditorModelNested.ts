// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const services = CDBVS.services;
  const documentModel = services.document;

  function isNestedType(type) {
    const code = typeof type === "number" ? type : (type && type.code);
    return code === 8 || code === 17;
  }

  function nestedSheetPrefix(sheet, columnName) {
    return `${sheet.name}@${columnName}`;
  }

  function nestedSheetBlock(sheet, columnName) {
    if (!sheet) return [];
    const prefix = nestedSheetPrefix(sheet, columnName);
    return documentModel.sheets().filter((item) => item && (item.name === prefix || item.name.startsWith(`${prefix}@`)));
  }

  function ensureNestedSheet(sheet, column) {
    if (!sheet || !column || !documentModel.has() || !isNestedType(CDBVS.typeOf(column))) return null;
    const sheets = documentModel.sheets();
    const prefix = nestedSheetPrefix(sheet, column.name);
    let child = sheets.find((item) => item && item.name === prefix);
    if (!child) {
      child = { name: prefix, props: { hide: true }, separators: [], lines: [], columns: [] };
      const parentIndex = sheets.indexOf(sheet);
      let insertAt = parentIndex < 0 ? sheets.length : parentIndex + 1;
      (sheet.columns || []).some((candidate) => {
        if (candidate === column) return true;
        if (!isNestedType(CDBVS.typeOf(candidate))) return false;
        const block = nestedSheetBlock(sheet, candidate.name);
        if (block.length) insertAt = Math.max(insertAt, sheets.indexOf(block[block.length - 1]) + 1);
        return false;
      });
      sheets.splice(insertAt, 0, child);
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
    if (!sheet || !documentModel.has()) return false;
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
    const sheets = documentModel.sheets();
    const remaining = sheets.filter((item) => !block.includes(item));
    documentModel.mutate((document) => { document.sheets = remaining; });
    return true;
  }

  Object.assign(CDBVS, { isNestedType, nestedSheetBlock, ensureNestedSheet, removeNestedSheet });
})(window);
