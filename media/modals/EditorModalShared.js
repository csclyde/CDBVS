(function (global) {
  const CDBVS = global.CDBVS;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const modalState = CDBVS.modalState || (CDBVS.modalState = { active: null });

  function closeActiveModal() {
    if (modalState.active) modalState.active.remove();
    modalState.active = null;
  }

  function closeModal(overlay) {
    if (modalState.active === overlay) modalState.active = null;
    if (overlay) overlay.remove();
  }

  function closeAllModals() {
    closeActiveModal();
    const overlay = document.querySelector && document.querySelector(".text-modal-overlay");
    if (overlay) overlay.remove();
    modalState.active = null;
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

  function createModal(options) {
    const config = options || {};
    closeActiveModal();
    const overlay = makeElement("div", null, "text-modal-overlay");
    const dialog = makeElement("section", null, `text-modal${config.className ? ` ${config.className}` : ""}`);
    dialog.setAttribute("role", config.role || "dialog");
    dialog.setAttribute("aria-modal", "true");
    const heading = makeElement("div", null, "text-modal-heading");
    heading.appendChild(makeElement("strong", config.title || ""));
    const footer = makeElement("div", null, "text-modal-footer");
    const close = () => closeModal(overlay);
    heading.appendChild(makeButton("x", close, "text-modal-close"));
    dialog.appendChild(heading);
    overlay.appendChild(dialog);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    document.body.appendChild(overlay);
    setActiveModal(overlay);
    return { overlay, dialog, heading, footer, close };
  }

  Object.assign(CDBVS, { modalState, closeActiveModal, closeModal, closeAllModals, setActiveModal, modalField, createModal });
})(window);
