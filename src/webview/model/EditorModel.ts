// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const documentModel = CDBVS.documentModel;

  function allSheets() {
    return documentModel.sheets();
  }

  function setPrimaryColumn(sheet, columnName) {
    if (!sheet || !Array.isArray(sheet.columns)) return;
    sheet.columns.forEach((column) => {
      if (column.name === columnName) CDBVS.setColumnTypeString(column, "0");
      else if (typeOf(column).code === 0) CDBVS.setColumnTypeString(column, "1");
    });
  }

  Object.assign(CDBVS, {
    allSheets, setPrimaryColumn
  });
})(window);
