(function (global) {
  const CDBVS = global.CDBVS;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const modalState = CDBVS.modalState;
  const closeActiveModal = CDBVS.closeActiveModal;
  const setActiveModal = CDBVS.setActiveModal;

  function closeDialog(overlay) {
    if (modalState.active === overlay) modalState.active = null;
    overlay.remove();
  }

  function openConfirmDialog(options) {
    const config = options && typeof options === "object" ? options : {};
    closeActiveModal();
    const overlay = makeElement("div", null, "text-modal-overlay");
    const dialog = makeElement("section", null, "text-modal confirm-modal");
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    const heading = makeElement("div", null, "text-modal-heading");
    heading.appendChild(makeElement("strong", config.title || "Confirm action"));
    const message = makeElement("p", config.message || "Are you sure?", "confirm-message");
    const footer = makeElement("div", null, "text-modal-footer");
    const close = () => closeDialog(overlay);
    const confirm = () => {
      close();
      if (typeof config.onConfirm === "function") config.onConfirm();
    };
    heading.appendChild(makeButton("x", close, "text-modal-close"));
    footer.appendChild(makeButton(config.cancelLabel || "Cancel", close, "modal-cancel"));
    footer.appendChild(makeButton(config.confirmLabel || "Confirm", confirm, config.danger === false ? "button primary" : "danger-button"));
    dialog.appendChild(heading);
    dialog.appendChild(message);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    document.body.appendChild(overlay);
    setActiveModal(overlay);
    overlay.querySelector(".modal-cancel").focus();
  }

  CDBVS.openConfirmDialog = openConfirmDialog;
})(window);
