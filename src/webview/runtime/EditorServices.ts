// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;

  // Internal modules depend on this bundle rather than reaching through the
  // ambient CDBVS namespace for state and application lifecycle services.
  // The individual globals remain only as a compatibility seam for the legacy
  // IIFE modules and the headless harness.
  const sheetActions = {};
  const columnActions = {};
  const rowActions = {};
  const documentActions = {};
  const clipboardActions = {};
  const sheetView = {};
  function registerActionGroup(registry, actions) {
    Object.assign(registry, actions || {});
    Object.freeze(registry);
    return registry;
  }
  const application = Object.freeze({
    applyMutation: CDBVS.applyMutation,
    commitMutation: CDBVS.commitMutation,
    persistMutation: CDBVS.persistMutation,
    renderMutation: CDBVS.renderMutation,
    commitCellMutation: CDBVS.commitCellMutation,
    scheduleCellMutation: CDBVS.scheduleCellMutation,
    render: CDBVS.renderNow,
    persist: CDBVS.persist,
    sheetActions,
    columnActions,
    rowActions,
    documentActions,
    clipboardActions,
    registerActionGroup
  });

  CDBVS.services = Object.freeze({
    application,
    document: CDBVS.documentModel,
    sheetState: CDBVS.sheetState,
    viewState: CDBVS.viewState,
    clipboard: CDBVS.clipboardState,
    sheetView
  });
})(window);
