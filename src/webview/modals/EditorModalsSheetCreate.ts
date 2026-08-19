// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const renderAfterUpdate = CDBVS.renderAfterUpdate;
  const visibleSheets = CDBVS.visibleSheets;
  const modalField = CDBVS.modalField;
  const createModal = CDBVS.createModal;

  function openNewSheetEditor() {
    const { overlay, dialog, footer, close } = createModal({ className: "sheet-modal", title: "New sheet" });
    const form = makeElement("div", null, "sheet-form");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    const existingNames = new Set((state.data && Array.isArray(state.data.sheets) ? state.data.sheets : []).map((sheet) => sheet && sheet.name));
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
      if (!state.data || typeof state.data !== "object" || Array.isArray(state.data)) state.data = { customTypes: [], sheets: [] };
      if (!Array.isArray(state.data.sheets)) state.data.sheets = [];
      if (state.data.sheets.some((sheet) => sheet && sheet.name === name)) {
        error.textContent = `Sheet '${name}' already exists.`;
        nameInput.focus();
        return;
      }
      const sheet = { name, columns: [], lines: [], separators: [], props: {} };
      state.data.sheets.push(sheet);
      const sheets = visibleSheets();
      const index = sheets.indexOf(sheet);
      if (index >= 0) state.sheetIndex = index;
      state.rawMode = false;
      close();
      renderAfterUpdate();
    };
    footer.appendChild(makeButton("Cancel", close, "modal-cancel"));
    footer.appendChild(makeButton("Create sheet", save, "button primary"));
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
