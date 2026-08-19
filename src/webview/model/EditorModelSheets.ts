// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const renameSheetState = CDBVS.renameSheetState;
  const removeSheetState = CDBVS.removeSheetState;

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
    CDBVS.renameViewSheet(oldName, newName);
    renameSheetState(oldName, newName);
    return true;
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
    CDBVS.removeViewSheet(oldName);
    removeSheetState(oldName);
    const sheetsAfter = CDBVS.visibleSheets();
    if (currentBefore && !deletedSheets.has(currentBefore)) {
      state.sheetIndex = Math.max(0, sheetsAfter.indexOf(currentBefore));
    } else {
      state.sheetIndex = Math.max(0, Math.min(deletedIndex < 0 ? 0 : deletedIndex, sheetsAfter.length - 1));
    }
    return true;
  }

  Object.assign(CDBVS, { renameSheet, deleteSheetAt });
})(window);
