(function (global) {
  const CDBVS = global.CDBVS;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const deleteSheet = CDBVS.deleteSheet;
  const createModal = CDBVS.createModal;

  function openDeleteSheetConfirmation(sheet) {
    if (!sheet) return;
    const { dialog, footer, close } = createModal({ className: "column-modal", title: `Delete sheet: ${sheet.name}` });
    const message = makeElement("p", `Delete '${sheet.name}' and all of its sub-sheets? References to this sheet will be cleared.`, "delete-sheet-message");
    footer.appendChild(makeButton("Cancel", close, "modal-cancel"));
    footer.appendChild(makeButton("Delete sheet", () => { close(); deleteSheet(sheet); }, "danger-button"));
    dialog.appendChild(message);
    dialog.appendChild(footer);
    dialog.querySelector(".modal-cancel").focus();
  }

  CDBVS.openDeleteSheetConfirmation = openDeleteSheetConfirmation;
})(window);
