// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const renameSheetState = CDBVS.renameSheetState;
  const removeSheetState = CDBVS.removeSheetState;
  const setSheetIndex = CDBVS.setSheetIndex;
  const allSheets = CDBVS.allSheets;

  function renameSheet(sheet, newName) {
    if (!sheet || !state.data || !Array.isArray(state.data.sheets) || !newName || sheet.name === newName) return false;
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
    state.data.sheets.forEach((item) => {
      if (item.name === oldName || item.name.startsWith(`${oldName}@`)) item.name = `${newName}${item.name.slice(oldName.length)}`;
    });
    renameSheetState(oldName, newName);
    return true;
  }

  function createSheet(name) {
    const nextName = typeof name === "string" ? name.trim() : "";
    if (!nextName) return { ok: false, message: "Sheet name cannot be empty." };
    if (!state.data || typeof state.data !== "object" || Array.isArray(state.data)) state.data = { customTypes: [], sheets: [] };
    if (!Array.isArray(state.data.sheets)) state.data.sheets = [];
    if (state.data.sheets.some((sheet) => sheet && sheet.name === nextName)) {
      return { ok: false, message: `Sheet '${nextName}' already exists.` };
    }
    const sheet = { name: nextName, columns: [], lines: [], separators: [], props: {} };
    state.data.sheets.push(sheet);
    const visible = CDBVS.visibleSheets();
    const index = visible.indexOf(sheet);
    if (index >= 0) setSheetIndex(index);
    return { ok: true, sheet };
  }

  function updateSheetMetadata(sheet, options) {
    const config = options || {};
    const newName = typeof config.name === "string" ? config.name.trim() : "";
    if (!sheet || !newName) return { ok: false, message: "Sheet name cannot be empty." };
    if (allSheets().some((item) => item !== sheet && item && item.name === newName)) {
      return { ok: false, message: `Sheet '${newName}' already exists.` };
    }
    if (sheet.name !== newName) renameSheet(sheet, newName);
    CDBVS.setPrimaryColumn(sheet, config.primaryColumn || "");
    sheet.props = config.props && typeof config.props === "object" && !Array.isArray(config.props) ? config.props : {};
    return { ok: true };
  }

  function deleteSheetAt(sheet) {
    if (!sheet || !state.data || !Array.isArray(state.data.sheets)) return false;
    const oldName = sheet.name;
    const sheetsBefore = CDBVS.visibleSheets();
    const currentBefore = CDBVS.currentSheet();
    const deletedSheets = new Set(CDBVS.sheetBlock(sheet));
    if (!deletedSheets.size) deletedSheets.add(sheet);
    const deletedIndex = sheetsBefore.indexOf(sheet);
    CDBVS.mapTypeStrings((raw) => {
      const separator = raw.indexOf(":");
      if (separator < 0) return raw;
      const code = raw.slice(0, separator);
      const target = raw.slice(separator + 1);
      return (code === "6" || code === "12") && (target === oldName || target.startsWith(`${oldName}@`)) ? "1" : raw;
    });
    state.data.sheets = state.data.sheets.filter((item) => !deletedSheets.has(item));
    removeSheetState(oldName);
    const sheetsAfter = CDBVS.visibleSheets();
    if (currentBefore && !deletedSheets.has(currentBefore)) {
      setSheetIndex(Math.max(0, sheetsAfter.indexOf(currentBefore)));
    } else {
      setSheetIndex(Math.max(0, Math.min(deletedIndex < 0 ? 0 : deletedIndex, sheetsAfter.length - 1)));
    }
    return true;
  }

  Object.assign(CDBVS, { createSheet, updateSheetMetadata, renameSheet, deleteSheetAt });
})(window);
