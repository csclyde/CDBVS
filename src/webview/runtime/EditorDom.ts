// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;

  CDBVS.makeElement = function (tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined && text !== null) element.textContent = text;
    if (className) element.className = className;
    return element;
  };

  CDBVS.makeButton = function (label, handler, className) {
    const button = CDBVS.makeElement("button", label, className || "button");
    button.type = "button";
    button.addEventListener("click", handler);
    return button;
  };
})(window);
