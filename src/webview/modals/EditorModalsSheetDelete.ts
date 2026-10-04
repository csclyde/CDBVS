// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const deleteSheet = CDBVS.services.application.sheetActions.deleteSheet;

  function openDeleteSheetConfirmation(sheet, options) {
    if (!sheet) return;
    const config = options || {};
    CDBVS.openConfirmDialog({
      title: `Delete sheet: ${sheet.name}`,
      message: `Delete '${sheet.name}' and all of its sub-sheets? References to this sheet will be cleared.`,
      confirmLabel: "Delete sheet", restorePrevious: config.restorePrevious === true,
      onConfirm: () => { if (deleteSheet(sheet) && typeof config.onDeleted === "function") config.onDeleted(); }
    });
  }

  CDBVS.openDeleteSheetConfirmation = openDeleteSheetConfirmation;
})(window);
