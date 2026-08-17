class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.className = "";
    this.classList = {
      add: (...names) => { this.className = [...new Set(`${this.className} ${names.join(" ")}`.trim().split(/\s+/).filter(Boolean))].join(" "); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter((name) => name && !names.includes(name)).join(" "); },
      contains: (name) => this.className.split(/\s+/).includes(name)
    };
    this._textContent = "";
    this.value = "";
    this.type = "";
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.scrollLeft = 0;
    this.scrollTop = 0;
    this.scrollWidth = 0;
    this.offsetWidth = 0;
    this.clientWidth = 0;
  }

  appendChild(child) {
    if (!child) return child;
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument;
    this.children.push(child);
    return child;
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    this._textContent = String(value ?? "");
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  contains(child) {
    if (child === this) return true;
    return this.children.some((item) => item === child || item.contains(child));
  }

  getBoundingClientRect() {
    return { width: this.offsetWidth, height: 0, top: 0, left: 0, right: this.offsetWidth, bottom: 0 };
  }

  replaceChildren(...children) {
    this.children.slice().forEach((child) => this.removeChild(child));
    children.forEach((child) => this.appendChild(child));
  }

  addEventListener(type, listener) {
    (this.listeners[type] || (this.listeners[type] = [])).push(listener);
  }

  removeEventListener(type, listener) {
    this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== listener);
  }

  dispatchEvent(event) {
    const nextEvent = event || {};
    if (!nextEvent.type) throw new Error("Fake events need a type.");
    if (!nextEvent.target) nextEvent.target = this;
    nextEvent.currentTarget = this;
    (this.listeners[nextEvent.type] || []).slice().forEach((listener) => listener.call(this, nextEvent));
    return !nextEvent.defaultPrevented;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  add(option) {
    this.appendChild(option);
  }

  focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }

  select() {}

  closest(selector) {
    let current = this;
    while (current) {
      if (matchesSelector(current, selector)) return current;
      current = current.parentNode;
    }
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const result = [];
    const selectors = String(selector).split(",").map((part) => part.trim()).filter(Boolean);
    const visit = (element) => {
      element.children.forEach((child) => {
        if (selectors.some((part) => matchesSelectorPath(child, part))) result.push(child);
        visit(child);
      });
    };
    visit(this);
    return result;
  }
}

function matchesSelector(element, selector) {
  const value = selector.trim();
  if (!value) return false;
  if (value.includes(",")) return value.split(",").some((part) => matchesSelector(element, part));
  if (value.startsWith(".")) return value.slice(1).split(".").every((name) => element.className.split(/\s+/).includes(name));
  if (value.startsWith("#")) return element.attributes.id === value.slice(1);
  return element.tagName.toLowerCase() === value.toLowerCase();
}

function matchesSelectorPath(element, selector) {
  const parts = selector.split(/\s+/).filter(Boolean);
  if (!matchesSelector(element, parts[parts.length - 1])) return false;
  let ancestor = element.parentNode;
  for (let index = parts.length - 2; index >= 0; index--) {
    while (ancestor && !matchesSelector(ancestor, parts[index])) ancestor = ancestor.parentNode;
    if (!ancestor) return false;
    ancestor = ancestor.parentNode;
  }
  return true;
}

class FakeDocument extends FakeElement {
  constructor() {
    super("document", null);
    this.ownerDocument = this;
    this.body = new FakeElement("body", this);
    this.appendChild(this.body);
    this.activeElement = null;
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  getElementById(id) {
    return this.querySelector(`#${id}`);
  }
}

class FakeOption extends FakeElement {
  constructor(label, value) {
    super("option", null);
    this.textContent = label;
    this.value = value;
  }
}

module.exports = { FakeDocument, FakeElement, FakeOption };
