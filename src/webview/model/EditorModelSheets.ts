// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const services = CDBVS.services;
  const documentModel = services.document;

  function validateSheetRename(sheet, newName) {
    if (!sheet || typeof newName !== "string" || !newName.trim()) return { ok: false, message: "Sheet name cannot be empty." };
    if (sheet.name === newName) return { ok: true };
    if (CDBVS.schemaParent(sheet)) return { ok: false, message: "Rename a nested sheet through its parent column to keep the schema and stored values connected." };
    const block = documentModel.sheets().filter((item) => item === sheet || item.name.startsWith(`${sheet.name}@`));
    const targets = block.map((item) => `${newName}${item.name.slice(sheet.name.length)}`);
    const collision = documentModel.sheets().find((item) => !block.includes(item) && targets.includes(item.name));
    return collision ? { ok: false, message: `Sheet '${collision.name}' already exists. Choose another name to preserve both sheets.` } : { ok: true };
  }

  function renameSheet(sheet, newName) {
    if (!sheet || !documentModel.has() || !newName || sheet.name === newName) return false;
    if (!validateSheetRename(sheet, newName).ok) return false;
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
    const renameCheck = validateSheetRename(sheet, newName);
    if (!renameCheck.ok) return renameCheck;
    const parent = CDBVS.schemaParent(sheet);
    if (parent && (!config.props || config.props.hide !== true
      || (config.props.isProps === true) !== (CDBVS.typeOf(parent.column).code === 17))) {
      return { ok: false, message: "Nested sheet visibility and kind are controlled by the parent column. Change the parent column instead." };
    }
    if (config.primaryColumn) {
      const primary = (sheet.columns || []).find((column) => column.name === config.primaryColumn);
      if (!primary || ![0, 1].includes(CDBVS.typeOf(primary).code)) {
        return { ok: false, message: "Choose a text or existing ID column as the primary ID. Convert other column types in the column editor first." };
      }
      const source = CDBVS.schemaRows(sheet);
      if (!source.ok) return source;
      if (source.rows.some((row) => row[primary.name] !== undefined && row[primary.name] !== null && typeof row[primary.name] !== "string")) {
        return { ok: false, message: "Primary IDs must contain text. Repair this column's values before selecting it as the primary ID." };
      }
    }
    if (sheet.name !== newName) renameSheet(sheet, newName);
    CDBVS.setPrimaryColumn(sheet, config.primaryColumn || "");
    sheet.props = config.props && typeof config.props === "object" && !Array.isArray(config.props) ? config.props : {};
    return { ok: true };
  }

  function deleteSheetAt(sheet) {
    if (!sheet || !documentModel.has()) return false;
    if (CDBVS.schemaParent(sheet)) return false;
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
