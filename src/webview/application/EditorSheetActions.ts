// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const services = CDBVS.services;
  const documentModel = services.document;
  const sheetState = services.sheetState;
  const sheetLifecycle = sheetState.lifecycle;
  const sheetViewModel = services.sheetView;
  const commitMutation = services.application.commitMutation;
  const model = services.document.operations.sheets;

  function rootVisibleSheets() {
    const visible = sheetViewModel.visibleSheets();
    return visible.filter((candidate) => !visible.some((parent) => (
      parent !== candidate && candidate.name.startsWith(`${parent.name}@`)
    )));
  }

  function reconcileActiveSheet(previousSheet, previousIndex) {
    const visible = sheetViewModel.visibleSheets();
    if (previousSheet && visible.includes(previousSheet)) {
      sheetState.setActiveIndex(Math.max(0, visible.indexOf(previousSheet)));
      return;
    }
    const fallback = Number.isInteger(previousIndex) ? previousIndex : 0;
    sheetState.setActiveIndex(Math.max(0, Math.min(fallback, visible.length - 1)));
  }

  function createSheet(name) {
    const result = model.create(name);
    if (!result.ok) return result;
    const visible = sheetViewModel.visibleSheets();
    const index = visible.indexOf(result.sheet);
    if (index >= 0) sheetState.setActiveIndex(index);
    return result;
  }

  function renameSheet(sheet, newName) {
    if (!sheet) return false;
    const oldName = sheet.name;
    const result = model.rename(sheet, newName);
    if (result === true && oldName !== sheet.name) sheetLifecycle.renameSheet(oldName, sheet.name);
    return result;
  }

  function updateSheetMetadata(sheet, options) {
    if (!sheet) return { ok: false, message: "Sheet is unavailable." };
    const oldName = sheet.name;
    const result = model.updateMetadata(sheet, options);
    if (result.ok && oldName !== sheet.name) sheetLifecycle.renameSheet(oldName, sheet.name);
    return result;
  }

  function deleteSheet(sheet) {
    if (!sheet || !documentModel.has()) return false;
    const previousSheet = sheetViewModel.currentSheet();
    const previousIndex = sheetViewModel.visibleSheets().indexOf(sheet);
    return commitMutation(() => {
      const result = model.deleteAt(sheet);
      if (result === true) {
        sheetLifecycle.removeSheet(sheet.name);
        reconcileActiveSheet(previousSheet, previousIndex);
      }
      return result;
    }) === true;
  }

  function moveSheet(sheet, delta) {
    if (!sheet || !Number.isInteger(delta)) return false;
    const roots = rootVisibleSheets();
    const index = roots.indexOf(sheet);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= roots.length) return false;
    return commitMutation(() => model.moveBlock(sheet, roots[target], delta)) === true;
  }

  const sheetActions = services.application.sheetActions;
  Object.assign(sheetActions, { createSheet, deleteSheet, moveSheet, rootVisibleSheets });
  Object.freeze(sheetActions);
  CDBVS.sheetActions = sheetActions;
  Object.assign(CDBVS, { createSheet, updateSheetMetadata, renameSheet, deleteSheet, moveSheet });
})(window);
