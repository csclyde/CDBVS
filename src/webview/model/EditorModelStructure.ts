// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const services = CDBVS.services;
  const documentModel = services.document;
  const isNestedType = CDBVS.isNestedType;
  const removeNestedSheet = CDBVS.removeNestedSheet;

  function deleteColumnAt(sheet, index) {
    if (!sheet || !Array.isArray(sheet.columns) || !Number.isInteger(index)) return false;
    const column = sheet.columns[index];
    if (!column) return false;
    sheet.columns.splice(index, 1);
    (sheet.lines || []).forEach((line) => { if (line) delete line[column.name]; });
    if (sheet.props && sheet.props.displayColumn === column.name) delete sheet.props.displayColumn;
    if (sheet.props && sheet.props.displayIcon === column.name) delete sheet.props.displayIcon;
    if (isNestedType(CDBVS.typeOf(column))) removeNestedSheet(sheet, column.name);
    return true;
  }

  function moveColumnBlock(sheet, index, delta) {
    if (!sheet || !Array.isArray(sheet.columns) || !Number.isInteger(index) || !Number.isInteger(delta)) return false;
    const target = index + delta;
    if (target < 0 || target >= sheet.columns.length) return false;
    [sheet.columns[index], sheet.columns[target]] = [sheet.columns[target], sheet.columns[index]];
    return true;
  }

  function sheetBlock(sheet) {
    return documentModel.sheets().filter((item) => item === sheet || item.name.startsWith(`${sheet.name}@`));
  }

  function moveSheetBlock(sheet, other, delta) {
    if (!sheet || !other || !Number.isInteger(delta)) return false;
    const firstBlock = sheetBlock(sheet);
    const otherBlock = sheetBlock(other);
    const firstSet = new Set(firstBlock);
    const remaining = documentModel.sheets().filter((item) => !firstSet.has(item));
    const otherIndex = remaining.indexOf(other);
    if (otherIndex < 0) return false;
    const insertAt = delta < 0 ? otherIndex : otherIndex + otherBlock.length;
    remaining.splice(insertAt, 0, ...firstBlock);
    documentModel.mutate((document) => { document.sheets = remaining; });
    return true;
  }

  function mapTypeStrings(callback) {
    const sheets = documentModel.sheets();
    sheets.forEach((sheet) => (sheet.columns || []).forEach((column) => {
      const property = Object.prototype.hasOwnProperty.call(column, "typeStr") ? "typeStr" : (Object.prototype.hasOwnProperty.call(column, "type") ? "type" : null);
      if (property) column[property] = callback(String(column[property]));
    }));
    documentModel.customTypes().forEach((customType) => {
      (customType.cases || []).forEach((typeCase) => (typeCase.args || []).forEach((argument) => {
        const property = Object.prototype.hasOwnProperty.call(argument, "typeStr") ? "typeStr" : (Object.prototype.hasOwnProperty.call(argument, "type") ? "type" : null);
        if (property) argument[property] = callback(String(argument[property]));
      }));
    });
  }

  Object.assign(CDBVS, {
    deleteColumnAt, moveColumnBlock, sheetBlock, moveSheetBlock, mapTypeStrings
  });
})(window);
