(function (global) {
  const CDBVS = global.CDBVS;
  const makeElement = CDBVS.makeElement;
  const modalState = CDBVS.modalState || (CDBVS.modalState = { active: null });

  function closeActiveModal() {
    if (modalState.active) modalState.active.remove();
    modalState.active = null;
  }

  function closeModal(overlay) {
    if (modalState.active === overlay) modalState.active = null;
    if (overlay) overlay.remove();
  }

  function setActiveModal(overlay) {
    modalState.active = overlay;
    return overlay;
  }

  function modalField(label, control, className) {
    const field = makeElement("label", null, `column-field${className ? ` ${className}` : ""}`);
    field.appendChild(makeElement("span", label));
    field.appendChild(control);
    return field;
  }

  Object.assign(CDBVS, { modalState, closeActiveModal, closeModal, setActiveModal, modalField });
})(window);
