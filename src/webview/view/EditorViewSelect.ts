// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const sheetView = CDBVS.services.sheetView;
  let openSelectState = null;
  let selectMenuId = 0;

  function isControlTarget(target, control) {
    return !!target && (target === control || (typeof control.contains === "function" && control.contains(target)));
  }

  function clickControl(control) {
    if (!control) return false;
    if (typeof control.click === "function") {
      control.click();
      return true;
    }
    if (typeof control.dispatchEvent === "function") {
      control.dispatchEvent({ type: "click", target: control, preventDefault() {}, stopPropagation() {} });
      return true;
    }
    return false;
  }

  function selectOptions(control) {
    if (control && control.options) return Array.from(control.options);
    return control && typeof control.querySelectorAll === "function" ? Array.from(control.querySelectorAll("option")) : [];
  }

  function closeSelectMenu() {
    if (!openSelectState) return;
    const { control, menu, cleanup } = openSelectState;
    if (typeof cleanup === "function") cleanup();
    if (menu && typeof menu.remove === "function") menu.remove();
    else if (menu && menu.parentNode && typeof menu.parentNode.removeChild === "function") menu.parentNode.removeChild(menu);
    if (control && typeof control.removeAttribute === "function") {
      control.removeAttribute("aria-expanded");
      control.removeAttribute("aria-controls");
    }
    openSelectState = null;
  }

  function updateSelectMenu() {
    if (!openSelectState) return;
    const { control, optionItems, filterValue } = openSelectState;
    const options = selectOptions(control);
    const selectedIndex = Math.max(0, options.findIndex((option) => String(option.value) === String(control.value)));
    openSelectState.selectedIndex = selectedIndex;
    const normalizedFilter = String(filterValue || "").trim().toLowerCase();
    let selectedItem = null;
    optionItems.forEach((item, index) => {
      const optionText = String(options[index].textContent || options[index].value || "").toLowerCase();
      const visible = !normalizedFilter || optionText.includes(normalizedFilter);
      item.style.display = visible ? "" : "none";
      const selected = index === selectedIndex;
      if (selected && visible) selectedItem = item;
      if (selected) item.classList.add("selected");
      else item.classList.remove("selected");
      item.setAttribute("aria-selected", String(selected));
    });
    if (selectedItem && typeof selectedItem.scrollIntoView === "function") selectedItem.scrollIntoView({ block: "nearest" });
  }

  function visibleSelectIndexes() {
    if (!openSelectState) return [];
    const options = selectOptions(openSelectState.control);
    const normalizedFilter = String(openSelectState.filterValue || "").trim().toLowerCase();
    return options.map((option, index) => ({ option, index }))
      .filter(({ option }) => !normalizedFilter || String(option.textContent || option.value || "").toLowerCase().includes(normalizedFilter))
      .map(({ index }) => index);
  }

  function chooseSelectOption(index) {
    if (!openSelectState) return;
    const { control } = openSelectState;
    const options = selectOptions(control);
    if (!options.length) return;
    const nextIndex = Math.max(0, Math.min(index, options.length - 1));
    control.value = String(options[nextIndex].value);
    updateSelectMenu();
  }

  function openSelectMenu(control, sheet, onClose) {
    closeSelectMenu();
    const options = selectOptions(control);
    if (!options.length || !document.body || typeof document.createElement !== "function") return false;
    const menu = document.createElement("div");
    const filter = document.createElement("input");
    const optionsContainer = document.createElement("div");
    const menuId = `cdbvs-select-menu-${++selectMenuId}`;
    menu.id = menuId;
    menu.className = "cell-select-menu";
    menu.setAttribute("role", "listbox");
    menu.addEventListener("mousedown", (event) => {
      const option = event.target && event.target.closest && event.target.closest(".cell-select-option");
      if (option && typeof event.preventDefault === "function") event.preventDefault();
    });
    filter.type = "text";
    filter.className = "cell-select-filter";
    filter.placeholder = "Filter options";
    filter.setAttribute("aria-label", "Filter dropdown options");
    optionsContainer.className = "cell-select-options";
    menu.appendChild(filter);
    menu.appendChild(optionsContainer);
    const optionItems = [];
    options.forEach((option, index) => {
      const item = document.createElement("div");
      item.className = "cell-select-option";
      item.textContent = option.textContent || option.value;
      item.setAttribute("role", "option");
      item.addEventListener("click", (event) => {
        if (typeof event.preventDefault === "function") event.preventDefault();
        chooseSelectOption(index);
        if (typeof control.focus === "function") control.focus();
        const activeSheet = openSelectState && openSelectState.sheet;
        const closeHandler = openSelectState && openSelectState.onClose;
        closeSelectMenu();
        if (typeof closeHandler === "function") closeHandler();
        else if (activeSheet) CDBVS.exitRenderedCell(activeSheet);
      });
      optionsContainer.appendChild(item);
      optionItems.push(item);
    });
    filter.addEventListener("input", () => {
      if (openSelectState) openSelectState.filterValue = filter.value;
      updateSelectMenu();
    });
    document.body.appendChild(menu);
    const reposition = () => {
      const rect = typeof control.getBoundingClientRect === "function" ? control.getBoundingClientRect() : null;
      if (!rect || !menu.style) return;
      menu.style.left = `${rect.left}px`;
      menu.style.top = `${rect.bottom}px`;
      menu.style.minWidth = `${Math.max(rect.width || 0, 120)}px`;
    };
    const listeners = [];
    const listen = (target, type, capture) => {
      if (!target || typeof target.addEventListener !== "function") return;
      target.addEventListener(type, reposition, capture);
      listeners.push(() => target.removeEventListener(type, reposition, capture));
    };
    listen(document, "scroll", true);
    listen(global, "scroll", true);
    listen(global, "resize");
    const cleanup = () => listeners.splice(0).forEach((remove) => remove());
    let ancestor = control.parentNode;
    while (ancestor) {
      listen(ancestor, "scroll", false);
      ancestor = ancestor.parentNode;
    }
    openSelectState = {
      control, menu, filter, optionItems, filterValue: "", selectedIndex: 0,
      sheet: sheet || sheetView.currentSheet(), onClose, reposition, cleanup
    };
    reposition();
    if (typeof control.setAttribute === "function") {
      control.setAttribute("aria-expanded", "true");
      control.setAttribute("aria-controls", menuId);
    }
    updateSelectMenu();
    if (typeof filter.focus === "function") filter.focus();
    return true;
  }

  function handleSelectKeydown(control, event) {
    const key = String(event.key || "").toLowerCase();
    const menuTarget = openSelectState && openSelectState.menu
      && (event.target === openSelectState.menu || (typeof openSelectState.menu.contains === "function" && openSelectState.menu.contains(event.target)));
    const filterTarget = openSelectState && openSelectState.filter
      && (event.target === openSelectState.filter || (typeof openSelectState.filter.contains === "function" && openSelectState.filter.contains(event.target)));
    const verticalArrow = key === "arrowup" || key === "arrowdown";
    if (menuTarget || (openSelectState && verticalArrow)) control = openSelectState.control;
    if (filterTarget && (key === "arrowleft" || key === "arrowright")) return false;
    if (!menuTarget && (!control || control.tagName !== "SELECT")) return false;
    if (!openSelectState || openSelectState.control !== control) {
      if (key === "enter") return false;
      if (key !== " " && !["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) return false;
      openSelectMenu(control);
      if (typeof event.preventDefault === "function") event.preventDefault();
      return true;
    }
    if (key === "escape" || key === "enter") {
      closeSelectMenu();
      return false;
    }
    if (key === " ") {
      if (typeof event.preventDefault === "function") event.preventDefault();
      return true;
    }
    if (key !== "arrowup" && key !== "arrowdown" && key !== "home" && key !== "end") return false;
    const options = selectOptions(control);
    if (!options.length) {
      if (typeof event.preventDefault === "function") event.preventDefault();
      return true;
    }
    const visibleIndexes = visibleSelectIndexes();
    if (!visibleIndexes.length) {
      if (typeof event.preventDefault === "function") event.preventDefault();
      return true;
    }
    let position = visibleIndexes.indexOf(openSelectState.selectedIndex);
    if (position < 0) position = key === "arrowup" || key === "end" ? visibleIndexes.length - 1 : 0;
    if (key === "home") position = 0;
    else if (key === "end") position = visibleIndexes.length - 1;
    else position = Math.max(0, Math.min(position + (key === "arrowup" ? -1 : 1), visibleIndexes.length - 1));
    chooseSelectOption(visibleIndexes[position]);
    if (typeof event.preventDefault === "function") event.preventDefault();
    return true;
  }

  Object.assign(CDBVS, { isControlTarget, clickControl, handleSelectKeydown, closeSelectMenu, openSelectMenu });
})(window);
