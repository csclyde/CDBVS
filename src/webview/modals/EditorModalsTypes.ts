// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const commitMutation = CDBVS.services.application.commitMutation;
  const documentModel = CDBVS.services.document;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const updateCustomTypes = documentModel.operations.schema.updateCustomTypes;
  const hasDocument = CDBVS.hasDocument;
  const currentCustomTypes = CDBVS.currentCustomTypes;
  const createModal = CDBVS.createModal;

  function openTypesEditor() {
    if (typeof CDBVS.prepareCellTransition === "function" && !CDBVS.prepareCellTransition()) return false;
    if (!hasDocument()) {
      CDBVS.setStatus("Load a valid CastleDB document before editing custom types.", true);
      return;
    }
    const { overlay, dialog, footer, close } = createModal({ className: "types-modal", title: "Edit custom types" });
    const hint = makeElement("p", "Edit the CastleDB customTypes JSON array. Each type contains cases with name and args fields.", "types-hint");
    const textarea = document.createElement("textarea");
    textarea.className = "types-editor";
    textarea.spellcheck = false;
    textarea.value = JSON.stringify(currentCustomTypes(), null, "\t");
    const error = makeElement("div", null, "column-form-error");
    error.setAttribute("role", "alert");
    const save = () => {
      let customTypes;
      try {
        customTypes = JSON.parse(textarea.value || "[]");
        if (!Array.isArray(customTypes)) throw new Error("Custom types must be a JSON array.");
        const result = updateCustomTypes(customTypes);
        if (!result.ok) throw new Error(result.message);
      } catch (parseError) {
        error.textContent = `Invalid custom types: ${parseError.message}`;
        return;
      }
      close();
      commitMutation();
    };
    CDBVS.appendModalActions(footer, close, save);
    dialog.appendChild(hint);
    dialog.appendChild(textarea);
    dialog.appendChild(error);
    dialog.appendChild(footer);
    textarea.focus();
  }

  Object.assign(CDBVS, { openTypesEditor });
})(window);
