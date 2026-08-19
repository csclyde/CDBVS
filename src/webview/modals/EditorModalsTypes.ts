// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const typeOf = CDBVS.typeOf;
  const renderAfterUpdate = CDBVS.renderAfterUpdate;
  const createModal = CDBVS.createModal;

  function openTypesEditor() {
    if (!state.data || typeof state.data !== "object") {
      CDBVS.setStatus("Load a valid CastleDB document before editing custom types.", true);
      return;
    }
    const { overlay, dialog, footer, close } = createModal({ className: "types-modal", title: "Edit custom types" });
    const hint = makeElement("p", "Edit the CastleDB customTypes JSON array. Each type contains cases with name and args fields.", "types-hint");
    const textarea = document.createElement("textarea");
    textarea.className = "types-editor";
    textarea.spellcheck = false;
    textarea.value = JSON.stringify(state.data.customTypes || [], null, "\t");
    const error = makeElement("div", null, "column-form-error");
    const save = () => {
      let customTypes;
      try {
        customTypes = JSON.parse(textarea.value || "[]");
        if (!Array.isArray(customTypes)) throw new Error("Custom types must be a JSON array.");
        const names = new Set();
        customTypes.forEach((customType) => {
          if (!customType || typeof customType !== "object" || !customType.name || names.has(customType.name)) throw new Error("Each custom type needs a unique name.");
          names.add(customType.name);
          if (!Array.isArray(customType.cases)) throw new Error(`Custom type '${customType.name}' needs a cases array.`);
          customType.cases.forEach((typeCase) => {
            if (!typeCase || typeof typeCase !== "object" || !typeCase.name || !Array.isArray(typeCase.args)) throw new Error(`Invalid case in custom type '${customType.name}'.`);
          });
        });
        const customNames = new Set(customTypes.map((customType) => customType.name));
        const checkTypeReference = (column) => {
          const parsed = typeOf(column);
          if (parsed.code === 9 && !customNames.has(parsed.argument)) throw new Error(`Custom type '${parsed.argument}' is not defined.`);
        };
        (state.data.sheets || []).forEach((sheet) => (sheet.columns || []).forEach(checkTypeReference));
        customTypes.forEach((customType) => (customType.cases || []).forEach((typeCase) => (typeCase.args || []).forEach(checkTypeReference)));
      } catch (parseError) {
        error.textContent = `Invalid custom types: ${parseError.message}`;
        return;
      }
      state.data.customTypes = customTypes;
      close();
      renderAfterUpdate();
    };
    footer.appendChild(makeButton("Cancel", close));
    footer.appendChild(makeButton("Save", save, "button primary"));
    dialog.appendChild(hint);
    dialog.appendChild(textarea);
    dialog.appendChild(error);
    dialog.appendChild(footer);
    overlay.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") save();
    });
    textarea.focus();
  }

  Object.assign(CDBVS, { openTypesEditor });
})(window);
