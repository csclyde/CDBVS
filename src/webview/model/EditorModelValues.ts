// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;

  // All leaf editors write through this tiny value boundary. Keeping the
  // assignment here makes null/undefined normalization a single future change.
  function setCellValue(row, column, value) {
    if (!row || !column || typeof column.name !== "string" || !column.name) return false;
    row[column.name] = value;
    const type = typeof CDBVS.typeOf === "function" ? CDBVS.typeOf(column) : null;
    if (type && type.code === 0 && typeof CDBVS.clearReferenceOptionsCache === "function") {
      CDBVS.clearReferenceOptionsCache();
    }
    return true;
  }

  function clearCellValue(row, column) {
    return setCellValue(row, column, null);
  }

  Object.assign(CDBVS, { setCellValue, clearCellValue });
})(window);
