// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;

  function hasDocument() {
    return !!(state.data && typeof state.data === "object" && !Array.isArray(state.data));
  }

  function currentDocument() {
    return hasDocument() ? state.data : null;
  }

  const documentModel = {
    get: currentDocument,
    has: hasDocument,
    sheets() {
      const document = currentDocument();
      return document && Array.isArray(document.sheets) ? document.sheets : [];
    },
    findSheet(name) {
      return this.sheets().find((sheet) => sheet && sheet.name === name) || null;
    },
    customTypes() {
      const document = currentDocument();
      return document && Array.isArray(document.customTypes) ? document.customTypes : [];
    },
    load(document) {
      if (document !== null && (typeof document !== "object" || Array.isArray(document))) {
        return { ok: false, message: "The document must be an object or null." };
      }
      state.data = document;
      return { ok: true };
    },
    mutate(mutator) {
      if (!hasDocument() || typeof mutator !== "function") return false;
      return mutator(state.data);
    }
  };

  function currentCustomTypes() {
    return documentModel.customTypes();
  }

  function replaceDocument(document) {
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      return { ok: false, message: "The root must be an object." };
    }
    return documentModel.load(document);
  }

  function replaceDocumentText(text) {
    let document;
    try {
      document = JSON.parse(text);
    } catch (error) {
      return { ok: false, message: `Invalid JSON: ${error.message}` };
    }
    return replaceDocument(document);
  }

  Object.assign(CDBVS, {
    documentModel,
    hasDocument,
    currentDocument,
    currentCustomTypes,
    replaceDocument,
    replaceDocumentText
  });
})(window);
