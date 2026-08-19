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

  function currentCustomTypes() {
    const document = currentDocument();
    return document && Array.isArray(document.customTypes) ? document.customTypes : [];
  }

  function replaceDocument(document) {
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      return { ok: false, message: "The root must be an object." };
    }
    state.data = document;
    return { ok: true };
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
    hasDocument,
    currentDocument,
    currentCustomTypes,
    replaceDocument,
    replaceDocumentText
  });
})(window);
