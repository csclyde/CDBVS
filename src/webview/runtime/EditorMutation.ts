// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;

  function persist() {
    if (typeof CDBVS.sendUpdate === "function") CDBVS.sendUpdate();
  }

  function render() {
    if (typeof CDBVS.renderNow === "function") CDBVS.renderNow();
  }

  // This is the application boundary for document mutations. Leaf modules
  // perform only their domain change; this service owns the persist/render
  // lifecycle so those concerns cannot drift apart.
  function applyMutation(mutator, options) {
    const config = options || {};
    const result = typeof mutator === "function" ? mutator() : undefined;
    if (result === false) return result;
    if (config.persist !== false) persist();
    if (config.render !== false) {
      if (typeof config.render === "function") config.render();
      else render();
    }
    return result;
  }

  function commitMutation(mutator, options) {
    return applyMutation(mutator, options);
  }

  function persistMutation(mutator) {
    return applyMutation(mutator, { render: false });
  }

  function renderMutation(mutator) {
    return applyMutation(mutator, { persist: false });
  }

  function commitCellMutation(mutator, refresh) {
    const result = persistMutation(mutator);
    if (typeof refresh === "function") refresh();
    // Cell mutations must never fall back to the document renderer. The
    // editor control already reflects primitive changes, and complex cells
    // provide their own local refresh callback.
    return result;
  }

  function scheduleCellMutation(mutator, delay) {
    return scheduleMutation(mutator, delay);
  }

  function scheduleMutation(mutator, delay) {
    const result = typeof mutator === "function" ? mutator() : undefined;
    if (typeof CDBVS.scheduleUpdate === "function") CDBVS.scheduleUpdate(delay);
    else persist();
    return result;
  }

  Object.assign(CDBVS, {
    persist,
    applyMutation,
    commitMutation,
    persistMutation,
    renderMutation,
    commitCellMutation,
    scheduleCellMutation,
    scheduleMutation,
    // Compatibility name for the older call sites while they migrate.
    renderAfterUpdate: commitMutation
  });
})(window);
