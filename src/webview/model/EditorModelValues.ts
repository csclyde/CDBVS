// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;

  // All leaf editors write through this tiny value boundary. Keeping the
  // assignment here makes null/undefined normalization a single future change.
  function setCellValue(row, column, value) {
    if (!row || !column || typeof column.name !== "string" || !column.name) return false;
    row[column.name] = value;
    return true;
  }

  function clearCellValue(row, column) {
    return setCellValue(row, column, null);
  }

  Object.assign(CDBVS, { setCellValue, clearCellValue });
})(window);
