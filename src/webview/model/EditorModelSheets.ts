// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const services = CDBVS.services;
  const documentModel = services.document;

  function renameSheet(sheet, newName) {
    if (!sheet || !documentModel.has() || !newName || sheet.name === newName) return false;
    const oldName = sheet.name;
    CDBVS.mapTypeStrings((raw) => {
      const separator = raw.indexOf(":");
      if (separator < 0) return raw;
      const code = raw.slice(0, separator);
      const target = raw.slice(separator + 1);
      return (code === "6" || code === "12") && (target === oldName || target.startsWith(`${oldName}@`))
        ? `${code}:${newName}${target.slice(oldName.length)}`
        : raw;
    });
    documentModel.sheets().forEach((item) => {
      if (item.name === oldName || item.name.startsWith(`${oldName}@`)) item.name = `${newName}${item.name.slice(oldName.length)}`;
    });
    return true;
  }

  function createSheet(name) {
    const nextName = typeof name === "string" ? name.trim() : "";
    if (!nextName) return { ok: false, message: "Sheet name cannot be empty." };
    if (!documentModel.has()) documentModel.load({ customTypes: [], sheets: [] });
    const sheets = documentModel.sheets();
    if (sheets.some((sheet) => sheet && sheet.name === nextName)) {
      return { ok: false, message: `Sheet '${nextName}' already exists.` };
    }
    const sheet = { name: nextName, columns: [], lines: [], separators: [], props: {} };
    sheets.push(sheet);
    return { ok: true, sheet };
  }

  function updateSheetMetadata(sheet, options) {
    const config = options || {};
    const newName = typeof config.name === "string" ? config.name.trim() : "";
    if (!sheet || !newName) return { ok: false, message: "Sheet name cannot be empty." };
    if (documentModel.sheets().some((item) => item !== sheet && item && item.name === newName)) {
      return { ok: false, message: `Sheet '${newName}' already exists.` };
    }
    if (sheet.name !== newName) renameSheet(sheet, newName);
    CDBVS.setPrimaryColumn(sheet, config.primaryColumn || "");
    sheet.props = config.props && typeof config.props === "object" && !Array.isArray(config.props) ? config.props : {};
    return { ok: true };
  }

  function deleteSheetAt(sheet) {
    if (!sheet || !documentModel.has()) return false;
    const oldName = sheet.name;
    const deletedSheets = new Set(CDBVS.sheetBlock(sheet));
    if (!deletedSheets.size) deletedSheets.add(sheet);
    CDBVS.mapTypeStrings((raw) => {
      const separator = raw.indexOf(":");
      if (separator < 0) return raw;
      const code = raw.slice(0, separator);
      const target = raw.slice(separator + 1);
      return (code === "6" || code === "12") && (target === oldName || target.startsWith(`${oldName}@`)) ? "1" : raw;
    });
    const remaining = documentModel.sheets().filter((item) => !deletedSheets.has(item));
    documentModel.mutate((document) => { document.sheets = remaining; });
    return true;
  }

  Object.assign(CDBVS, { createSheet, updateSheetMetadata, renameSheet, deleteSheetAt });
})(window);
