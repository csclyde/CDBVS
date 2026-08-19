// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const application = CDBVS.services.application;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const commitMutation = application.commitMutation;
  const allSheets = CDBVS.allSheets;
  const createSheet = CDBVS.createSheet;
  const setRawMode = CDBVS.viewState.setRawMode;
  const modalField = CDBVS.modalField;
  const appendModalActions = CDBVS.appendModalActions;
  const createModal = CDBVS.createModal;

  function openNewSheetEditor() {
    const { overlay, dialog, footer, close } = createModal({ className: "sheet-modal", title: "New sheet" });
    const form = makeElement("div", null, "sheet-form");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    const existingNames = new Set(allSheets().map((sheet) => sheet && sheet.name));
    let suggestedName = "newSheet";
    let suffix = 1;
    while (existingNames.has(suggestedName)) suggestedName = `newSheet${++suffix}`;
    nameInput.value = suggestedName;
    form.appendChild(modalField("Name", nameInput));
    const error = makeElement("div", null, "column-form-error");
    form.appendChild(error);
    const save = () => {
      const name = nameInput.value.trim();
      if (!name) {
        error.textContent = "Sheet name cannot be empty.";
        nameInput.focus();
        return;
      }
      const result = createSheet(name);
      if (!result.ok) {
        error.textContent = result.message;
        nameInput.focus();
        return;
      }
      setRawMode(false);
      close();
      commitMutation();
    };
    appendModalActions(footer, close, save, { saveLabel: "Create sheet" });
    dialog.appendChild(form);
    dialog.appendChild(footer);
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target === nameInput) save();
    });
    nameInput.focus();
    nameInput.select();
  }

  CDBVS.openNewSheetEditor = openNewSheetEditor;
})(window);
