// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const documentModel = CDBVS.documentModel;
  const commitMutation = CDBVS.commitMutation;
  const isNestedType = CDBVS.isNestedType;
  const removeNestedSheet = CDBVS.removeNestedSheet;
  const adjustCellSelectionAfterColumnRemoval = CDBVS.sheetState.adjustSelectionAfterColumnRemoval;
  const swapCellSelectionColumns = CDBVS.sheetState.swapSelectionColumns;

  function deleteColumnAt(sheet, index) {
    if (!sheet || !Array.isArray(sheet.columns) || !Number.isInteger(index)) return false;
    const column = sheet.columns[index];
    if (!column) return false;
    const nested = isNestedType(CDBVS.typeOf(column));
    sheet.columns.splice(index, 1);
    (sheet.lines || []).forEach((line) => { if (line) delete line[column.name]; });
    if (sheet.props && sheet.props.displayColumn === column.name) delete sheet.props.displayColumn;
    if (sheet.props && sheet.props.displayIcon === column.name) delete sheet.props.displayIcon;
    CDBVS.sheetState.removeColumn(sheet.name, column.name);
    adjustCellSelectionAfterColumnRemoval(sheet.name, index, sheet.columns.length);
    if (nested) removeNestedSheet(sheet, column.name);
    return true;
  }

  function moveColumn(sheet, index, delta) {
    if (!sheet || !Array.isArray(sheet.columns) || !Number.isInteger(index) || !Number.isInteger(delta)) return;
    const target = index + delta;
    if (target < 0 || target >= sheet.columns.length) return;
    commitMutation(() => {
      [sheet.columns[index], sheet.columns[target]] = [sheet.columns[target], sheet.columns[index]];
      swapCellSelectionColumns(sheet.name, index, target);
    });
  }

  function sheetBlock(sheet) {
    return documentModel.sheets().filter((item) => item === sheet || item.name.startsWith(`${sheet.name}@`));
  }

  function moveSheet(sheet, delta) {
    const visible = CDBVS.sheetViewModel.visibleSheets();
    const sheets = visible.filter((candidate) => !visible.some((parent) => parent !== candidate && candidate.name.startsWith(`${parent.name}@`)));
    const index = sheets.indexOf(sheet);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= sheets.length) return;
    const other = sheets[target];
    const firstBlock = sheetBlock(sheet);
    const otherBlock = sheetBlock(other);
    const firstSet = new Set(firstBlock);
    const remaining = documentModel.sheets().filter((item) => !firstSet.has(item));
    const otherIndex = remaining.indexOf(other);
    const insertAt = delta < 0 ? otherIndex : otherIndex + otherBlock.length;
    commitMutation(() => {
      remaining.splice(insertAt, 0, ...firstBlock);
      documentModel.mutate((document) => { document.sheets = remaining; });
    });
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
    deleteColumnAt, moveColumn, sheetBlock, moveSheet, mapTypeStrings
  });
})(window);
