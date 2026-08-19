// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const documentModel = CDBVS.services.document;

  // Model modules expose compatibility globals for the legacy IIFE surface,
  // but application code consumes this grouped operation boundary. Keeping
  // the groups here makes the document hierarchy explicit and prevents a
  // coordinator from reaching into an unrelated model module by accident.
  const operations = {
    document: Object.freeze({
      allSheets: CDBVS.allSheets,
      customTypes: documentModel.customTypes,
      mapTypeStrings: CDBVS.mapTypeStrings
    }),
    sheets: Object.freeze({
      create: CDBVS.createSheet,
      updateMetadata: CDBVS.updateSheetMetadata,
      rename: CDBVS.renameSheet,
      deleteAt: CDBVS.deleteSheetAt,
      block: CDBVS.sheetBlock,
      moveBlock: CDBVS.moveSheetBlock
    }),
    columns: Object.freeze({
      ensure: CDBVS.ensureSheetColumns,
      applyEdit: CDBVS.applyColumnEdit,
      deleteAt: CDBVS.deleteColumnAt,
      move: CDBVS.moveColumnBlock
    }),
    rows: Object.freeze({
      separatorIndex: CDBVS.separatorIndex,
      moveSeparators: CDBVS.moveSeparators,
      insert: CDBVS.insertRow,
      append: CDBVS.appendRow,
      update: CDBVS.updateRow,
      move: CDBVS.moveRow,
      toggleSeparator: CDBVS.toggleSeparator,
      addSeparator: CDBVS.addSeparatorAt,
      removeSeparator: CDBVS.removeSeparatorAt,
      delete: CDBVS.deleteRowAt,
      updateSeparatorTitle: CDBVS.updateSeparatorTitle
    }),
    nested: Object.freeze({
      isType: CDBVS.isNestedType,
      block: CDBVS.nestedSheetBlock,
      ensureSheet: CDBVS.ensureNestedSheet,
      removeSheet: CDBVS.removeNestedSheet
    }),
    schema: Object.freeze({
      defaultValue: CDBVS.defaultValue,
      listSheet: CDBVS.listSheet,
      listKey: CDBVS.listKey,
      readValue: CDBVS.readValue,
      referenceOptions: CDBVS.referenceOptions,
      clearReferenceOptionsCache: CDBVS.clearReferenceOptionsCache,
      createRow: CDBVS.createRowForSchema,
      listPreview: CDBVS.listPreview,
      columnExtraProperties: CDBVS.columnExtraProperties,
      sheetExtraProperties: CDBVS.sheetExtraProperties,
      validateCustomTypes: CDBVS.validateCustomTypes,
      updateCustomTypes: CDBVS.updateCustomTypes
    }),
    values: Object.freeze({
      setCell: CDBVS.setCellValue,
      clearCell: CDBVS.clearCellValue
    })
  };

  documentModel.operations = Object.freeze(operations);
})(window);
