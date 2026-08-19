// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const createModal = CDBVS.createModal;
  const appendModalActions = CDBVS.appendModalActions;

  function openConfirmDialog(options) {
    const config = options && typeof options === "object" ? options : {};
    const { dialog, footer, close } = createModal({
      className: "confirm-modal",
      role: "alertdialog",
      title: config.title || "Confirm action"
    });
    const message = makeElement("p", config.message || "Are you sure?", "confirm-message");
    const confirm = () => {
      close();
      if (typeof config.onConfirm === "function") config.onConfirm();
    };
    appendModalActions(footer, close, confirm, {
      cancelLabel: config.cancelLabel || "Cancel",
      saveLabel: config.confirmLabel || "Confirm",
      saveClass: config.danger === false ? "button primary" : "danger-button"
    });
    dialog.appendChild(message);
    dialog.appendChild(footer);
    dialog.querySelector(".modal-cancel").focus();
  }

  CDBVS.openConfirmDialog = openConfirmDialog;
})(window);
