(function (global) {
  const CDBVS = global.CDBVS;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const deleteSheet = CDBVS.deleteSheet;
  const closeActiveModal = CDBVS.closeActiveModal;
  const closeModal = CDBVS.closeModal;
  const setActiveModal = CDBVS.setActiveModal;

  function openDeleteSheetConfirmation(sheet) {
    if (!sheet) return;
    closeActiveModal();
    const overlay = makeElement("div", null, "text-modal-overlay");
    const dialog = makeElement("section", null, "text-modal column-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const heading = makeElement("div", null, "text-modal-heading");
    heading.appendChild(makeElement("strong", `Delete sheet: ${sheet.name}`));
    const message = makeElement("p", `Delete '${sheet.name}' and all of its sub-sheets? References to this sheet will be cleared.`, "delete-sheet-message");
    const footer = makeElement("div", null, "text-modal-footer");
    const close = () => closeModal(overlay);
    heading.appendChild(makeButton("x", close, "text-modal-close"));
    footer.appendChild(makeButton("Cancel", close, "modal-cancel"));
    footer.appendChild(makeButton("Delete sheet", () => { close(); deleteSheet(sheet); }, "danger-button"));
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

  CDBVS.openDeleteSheetConfirmation = openDeleteSheetConfirmation;
})(window);
