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

  function optionLabel(option) {
    if (!option) return "";
    const text = String(option.textContent || "");
    if (text) return text;
    return String(option.value || "") === "" ? "None" : String(option.value);
  }

  function closeSelectMenu() {
    if (!openSelectState) return null;
    const state = openSelectState;
    const { control, menu, cleanup } = state;
    if (typeof cleanup === "function") cleanup();
    if (menu && typeof menu.remove === "function") menu.remove();
    else if (menu && menu.parentNode && typeof menu.parentNode.removeChild === "function") menu.parentNode.removeChild(menu);
    if (control && typeof control.removeAttribute === "function") {
      control.setAttribute("aria-expanded", "false");
      control.removeAttribute("aria-controls");
      control.removeAttribute("aria-activedescendant");
    }
    openSelectState = null;
    return state;
  }

  function finishSelectMenu(commit, restoreFocusTarget) {
    if (!openSelectState) return false;
    const state = openSelectState;
    const handler = state.onClose;
    const sheet = state.sheet;
    closeSelectMenu();
    if (!commit && state.control) state.control.value = state.initialValue;
    const restoreFocus = () => {
      if (restoreFocusTarget && typeof restoreFocusTarget.focus === "function") {
        restoreFocusTarget.focus({ preventScroll: true });
      }
    };
    if (typeof handler === "function") {
      try { handler(); }
      finally { restoreFocus(); }
      return true;
    }
    if (sheet && typeof CDBVS.exitRenderedCell === "function") {
      const exited = CDBVS.exitRenderedCell(sheet);
      if (!exited && typeof CDBVS.commitEditorTarget === "function") CDBVS.commitEditorTarget(state.control);
      restoreFocus();
      return true;
    }
    return true;
  }

  function cancelSelectMenu() {
    return finishSelectMenu(false);
  }

  function hasOpenSelectMenu() {
    return !!openSelectState;
  }

  function dispatchSelectChange(control) {
    if (!control || typeof control.dispatchEvent !== "function") return;
    const dispatch = (type) => {
      if (typeof global.Event === "function") {
        control.dispatchEvent(new global.Event(type, { bubbles: false }));
        return;
      }
      control.dispatchEvent({ type, target: control, preventDefault() {}, stopPropagation() {} });
    };
    // Native selects expose both events when keyboard navigation changes the
    // closed value. Keep the same contract for listeners outside the editor.
    dispatch("input");
    dispatch("change");
  }

  function optionDisabled(option) {
    return !!(option && option.disabled);
  }

  function optionSnapshot(options) {
    return options.map((option) => `${String(option.value)}\u0000${optionLabel(option)}\u0000${optionDisabled(option)}`);
  }

  function currentOpenOptions() {
    if (!openSelectState) return null;
    const options = selectOptions(openSelectState.control);
    const keys = optionSnapshot(options);
    const state = openSelectState;
    if (keys.length !== state.optionKeys.length || keys.some((value, index) => value !== state.optionKeys[index])) {
      finishSelectMenu(true);
      return null;
    }
    return options;
  }

  function moveClosedSelect(control, key) {
    const allOptions = selectOptions(control);
    const options = allOptions.filter((option) => !optionDisabled(option));
    if (!allOptions.length) return false;
    if (!options.length) return true;
    const currentIndex = options.findIndex((option) => String(option.value) === String(control.value));
    const step = key === "pageup" || key === "pagedown" ? 5 : 1;
    const direction = key === "arrowup" || key === "arrowleft" || key === "pageup" ? -1 : 1;
    let index = currentIndex < 0 ? (direction < 0 ? options.length - 1 : 0) : currentIndex;
    if (key === "home") index = 0;
    else if (key === "end") index = options.length - 1;
    else {
      if (currentIndex >= 0) index = Math.max(0, Math.min(index + direction * step, options.length - 1));
    }
    const nextValue = String(options[index].value);
    if (String(control.value) !== nextValue) {
      control.value = nextValue;
      dispatchSelectChange(control);
    }
    return true;
  }

  function isActiveSelectControl(control) {
    const cell = control && control.closest ? control.closest("td") : null;
    const row = cell && cell.closest ? cell.closest("tr") : null;
    const sheet = sheetView && typeof sheetView.currentSheet === "function" ? sheetView.currentSheet() : null;
    const active = sheet && typeof CDBVS.activeCell === "function" ? CDBVS.activeCell(sheet) : null;
    const rowIndex = cell && cell.dataset && cell.dataset.rowIndex !== undefined
      ? cell.dataset.rowIndex : row && row.dataset && row.dataset.rowIndex;
    return !!cell && !!active
      && Number.parseInt(rowIndex, 10) === active.rowIndex
      && Number.parseInt(cell.dataset && cell.dataset.columnIndex, 10) === active.columnIndex;
  }

  function updateSelectMenu() {
    if (!openSelectState) return;
    const { control, optionItems, filterValue, emptyMessage, filter } = openSelectState;
    const options = selectOptions(control);
    const optionKeys = optionSnapshot(options);
    if (optionKeys.length !== openSelectState.optionKeys.length
      || optionKeys.some((value, index) => value !== openSelectState.optionKeys[index])) {
      finishSelectMenu(true);
      return;
    }
    const selectedIndex = options.findIndex((option) => String(option.value) === String(control.value));
    openSelectState.selectedIndex = selectedIndex;
    const normalizedFilter = String(filterValue || "").trim().toLowerCase();
    const visibleIndexes = [];
    let selectedItem = null;
    optionItems.forEach((item, index) => {
      const optionText = optionLabel(options[index]).toLowerCase();
      const visible = !normalizedFilter || optionText.includes(normalizedFilter);
      item.style.display = visible ? "" : "none";
      const selected = index === selectedIndex;
      if (visible) visibleIndexes.push(index);
      if (selected && visible) selectedItem = item;
      if (selected) item.classList.add("selected");
      else item.classList.remove("selected");
      if (optionDisabled(options[index])) item.classList.add("disabled");
      else item.classList.remove("disabled");
      if (index === openSelectState.activeIndex && visible) item.classList.add("active");
      else item.classList.remove("active");
      item.setAttribute("aria-selected", String(selected));
      item.setAttribute("aria-disabled", String(optionDisabled(options[index])));
    });
    if (!visibleIndexes.includes(openSelectState.activeIndex)) {
      openSelectState.activeIndex = visibleIndexes.includes(selectedIndex) ? selectedIndex : (visibleIndexes[0] ?? -1);
    }
    optionItems.forEach((item, index) => {
      if (index === openSelectState.activeIndex && item.style.display !== "none") item.classList.add("active");
      else item.classList.remove("active");
    });
    if (emptyMessage) emptyMessage.style.display = visibleIndexes.length ? "none" : "";
    const activeItem = optionItems[openSelectState.activeIndex];
    if (filter && typeof filter.removeAttribute === "function") {
      if (activeItem && activeItem.style.display !== "none") filter.setAttribute("aria-activedescendant", activeItem.id);
      else filter.removeAttribute("aria-activedescendant");
    }
    const scrollTarget = activeItem && activeItem.style.display !== "none" ? activeItem : selectedItem;
    if (scrollTarget && typeof scrollTarget.scrollIntoView === "function") scrollTarget.scrollIntoView({ block: "nearest" });
  }

  function visibleSelectIndexes() {
    if (!openSelectState) return [];
    const options = currentOpenOptions();
    if (!options) return [];
    const normalizedFilter = String(openSelectState.filterValue || "").trim().toLowerCase();
    return options.map((option, index) => ({ option, index }))
      .filter(({ option }) => !optionDisabled(option)
        && (!normalizedFilter || optionLabel(option).toLowerCase().includes(normalizedFilter)))
      .map(({ index }) => index);
  }

  function chooseSelectOption(index) {
    if (!openSelectState) return;
    const { control } = openSelectState;
    const options = currentOpenOptions();
    if (!options || !options.length) return;
    const nextIndex = Math.max(0, Math.min(index, options.length - 1));
    if (optionDisabled(options[nextIndex])) return;
    openSelectState.activeIndex = nextIndex;
    control.value = String(options[nextIndex].value);
    updateSelectMenu();
  }

  function openSelectMenu(control, sheet, onClose) {
    if (openSelectState) {
      finishSelectMenu(true);
      if (openSelectState) return false;
    }
    const options = selectOptions(control);
    if (!control || control.disabled || !options.length || !document.body || typeof document.createElement !== "function") return false;
    const menu = document.createElement("div");
    const filter = document.createElement("input");
    const optionsContainer = document.createElement("div");
    const emptyMessage = document.createElement("div");
    const menuId = `cdbvs-select-menu-${++selectMenuId}`;
    const optionsId = `${menuId}-options`;
    menu.id = menuId;
    menu.className = "cell-select-menu";
    menu.setAttribute("role", "presentation");
    menu.addEventListener("mousedown", (event) => {
      const option = event.target && event.target.closest && event.target.closest(".cell-select-option");
      if (option && typeof event.preventDefault === "function") event.preventDefault();
    });
    filter.type = "text";
    filter.className = "cell-select-filter";
    filter.placeholder = "Filter options";
    filter.autocomplete = "off";
    filter.spellcheck = false;
    filter.setAttribute("role", "combobox");
    filter.setAttribute("aria-label", "Filter dropdown options");
    filter.setAttribute("aria-autocomplete", "list");
    filter.setAttribute("aria-haspopup", "listbox");
    filter.setAttribute("aria-expanded", "true");
    filter.setAttribute("aria-controls", optionsId);
    optionsContainer.className = "cell-select-options";
    optionsContainer.id = optionsId;
    optionsContainer.setAttribute("role", "listbox");
    optionsContainer.setAttribute("aria-label", "Dropdown options");
    emptyMessage.className = "cell-select-empty";
    emptyMessage.textContent = "No matching options.";
    emptyMessage.setAttribute("role", "status");
    emptyMessage.setAttribute("aria-live", "polite");
    emptyMessage.style.display = "none";
    menu.appendChild(filter);
    menu.appendChild(optionsContainer);
    menu.appendChild(emptyMessage);
    const optionItems = [];
    options.forEach((option, index) => {
      const item = document.createElement("div");
      item.className = "cell-select-option";
      item.id = `${menuId}-option-${index}`;
      const label = optionLabel(option);
      item.textContent = label;
      item.title = label;
      item.setAttribute("role", "option");
      item.setAttribute("aria-setsize", String(options.length));
      item.setAttribute("aria-posinset", String(index + 1));
      item.tabIndex = -1;
      item.addEventListener("click", (event) => {
        if (typeof event.preventDefault === "function") event.preventDefault();
        if (optionDisabled(option)) return;
        chooseSelectOption(index);
        if (typeof control.focus === "function") control.focus();
        finishSelectMenu(true);
      });
      item.addEventListener("mouseenter", () => {
        if (!openSelectState) return;
        if (optionDisabled(option)) return;
        openSelectState.activeIndex = index;
        updateSelectMenu();
      });
      optionsContainer.appendChild(item);
      optionItems.push(item);
    });
    filter.addEventListener("input", () => {
      if (openSelectState) openSelectState.filterValue = filter.value;
      updateSelectMenu();
    });
    document.body.appendChild(menu);
    const measuredHeight = (element, fallback) => {
      const offset = element && Number(element.offsetHeight);
      if (Number.isFinite(offset) && offset > 0) return offset;
      const rect = element && typeof element.getBoundingClientRect === "function"
        ? element.getBoundingClientRect() : null;
      const height = rect && Number(rect.height);
      return Number.isFinite(height) && height > 0 ? height : fallback;
    };
    const reposition = () => {
      const rect = typeof control.getBoundingClientRect === "function" ? control.getBoundingClientRect() : null;
      if (!rect || !menu.style) return;
      const viewportHeight = Number(global.innerHeight)
        || (document.documentElement && Number(document.documentElement.clientHeight))
        || 0;
      const viewportWidth = Number(global.innerWidth)
        || (document.documentElement && Number(document.documentElement.clientWidth))
        || 0;
      const margin = 8;
      const width = Number(rect.width) || 0;
      const minimumWidth = Math.max(width, 120);
      const availableWidth = viewportWidth > 0 ? Math.max(margin * 2, viewportWidth - margin * 2) : minimumWidth;
      menu.style.minWidth = `${Math.min(minimumWidth, availableWidth)}px`;
      // Measure the natural menu every time. Otherwise a previous tight
      // viewport cap would become the new preferred height after scrolling.
      menu.style.maxHeight = "";
      optionsContainer.style.maxHeight = "";
      const measuredMenuHeight = measuredHeight(menu, 0);
      const desiredMenuHeight = measuredMenuHeight;
      const menuRect = typeof menu.getBoundingClientRect === "function" ? menu.getBoundingClientRect() : null;
      const menuWidth = Number(menu.offsetWidth) || (menuRect && Number(menuRect.width)) || Math.max(width, 120);
      const controlTop = Number.isFinite(Number(rect.top))
        ? Number(rect.top) : (Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : margin);
      const controlBottom = Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : controlTop;
      let opensAbove = false;
      let availableMenuSpace = null;
      if (viewportHeight > 0 && desiredMenuHeight > 0) {
        const usableHeight = Math.max(0, viewportHeight - margin * 2);
        const spaceAbove = Math.max(0, Math.min(usableHeight, controlTop - margin));
        const spaceBelow = Math.max(0, Math.min(usableHeight, viewportHeight - controlBottom - margin));
        if (desiredMenuHeight <= spaceBelow) opensAbove = false;
        else if (desiredMenuHeight <= spaceAbove) opensAbove = true;
        else opensAbove = spaceAbove > spaceBelow;
        availableMenuSpace = opensAbove ? spaceAbove : spaceBelow;
        const menuLimit = Math.max(0, availableMenuSpace - 2);
        menu.style.maxHeight = `${menuLimit}px`;
        const filterHeight = measuredHeight(filter, 32);
        const emptyHeight = emptyMessage.style.display === "none" ? 0 : measuredHeight(emptyMessage, 32);
        const optionsLimit = Math.max(0, menuLimit - filterHeight - emptyHeight);
        optionsContainer.style.maxHeight = `${optionsLimit}px`;
      }
      let renderedMenuHeight = measuredHeight(menu, desiredMenuHeight);
      if (availableMenuSpace !== null && renderedMenuHeight > 0) {
        // The fake DOM and some layout engines report the pre-cap offsetHeight;
        // use the available space as the authoritative upper bound for placement.
        renderedMenuHeight = Math.min(renderedMenuHeight, availableMenuSpace);
      }
      let top = opensAbove ? controlTop - renderedMenuHeight : controlBottom;
      if (viewportHeight > 0) {
        const bottomLimit = renderedMenuHeight > 0
          ? Math.max(margin, viewportHeight - renderedMenuHeight - margin)
          : viewportHeight - margin;
        top = Math.max(margin, Math.min(top, bottomLimit));
      }
      let left = Number.isFinite(Number(rect.left)) ? Number(rect.left) : margin;
      if (viewportWidth > 0 && menuWidth > 0) left = Math.max(margin, Math.min(left, viewportWidth - menuWidth - margin));
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    };
    const listeners = [];
    const listen = (target, type, handler, capture) => {
      if (!target || typeof target.addEventListener !== "function") return;
      target.addEventListener(type, handler, capture);
      listeners.push(() => target.removeEventListener(type, handler, capture));
    };
    const closeIfOutside = (event) => {
      if (!openSelectState) return;
      const target = event && event.target;
      const active = openSelectState.control;
      const activeCell = active && active.closest ? active.closest("td") : null;
      if (target && ((openSelectState.menu && openSelectState.menu.contains && openSelectState.menu.contains(target))
        || (active && (target === active || (active.contains && active.contains(target))))
        || (activeCell && activeCell.contains && activeCell.contains(target)))) return;
      finishSelectMenu(true);
    };
    const closeIfFocusOutside = (event) => {
      if (!openSelectState) return;
      const target = event && event.target;
      const active = openSelectState.control;
      if (target && ((openSelectState.menu && openSelectState.menu.contains && openSelectState.menu.contains(target))
        || target === active || (active && active.contains && active.contains(target)))) return;
      finishSelectMenu(true, target);
    };
    listen(document, "scroll", reposition, true);
    listen(global, "scroll", reposition, true);
    listen(global, "resize", reposition);
    listen(document, "pointerdown", closeIfOutside, true);
    listen(document, "mousedown", closeIfOutside, true);
    listen(document, "focusin", closeIfFocusOutside, true);
    listen(global, "blur", () => finishSelectMenu(true));
    listen(document, "visibilitychange", () => {
      if (document.hidden) finishSelectMenu(true);
    });
    const cleanup = () => listeners.splice(0).forEach((remove) => remove());
    let ancestor = control.parentNode;
    while (ancestor) {
      listen(ancestor, "scroll", reposition, false);
      ancestor = ancestor.parentNode;
    }
    filter.addEventListener("blur", (event) => {
      if (!openSelectState) return;
      const next = event && event.relatedTarget;
      const active = openSelectState.control;
      if (next && ((openSelectState.menu && openSelectState.menu.contains && openSelectState.menu.contains(next))
        || next === active || (active && active.contains && active.contains(next)))) return;
      finishSelectMenu(true, next);
    });
    openSelectState = {
      control, menu, filter, optionItems, emptyMessage,
      optionKeys: optionSnapshot(options),
      filterValue: "", selectedIndex: -1,
      activeIndex: -1, initialValue: String(control.value ?? ""),
      sheet: sheet || sheetView.currentSheet(), onClose, reposition, cleanup
    };
    reposition();
    if (typeof control.setAttribute === "function") {
      control.setAttribute("aria-haspopup", "listbox");
      control.setAttribute("aria-expanded", "true");
      control.setAttribute("aria-controls", optionsId);
    }
    updateSelectMenu();
    if (typeof filter.focus === "function") filter.focus();
    return true;
  }

  function handleSelectKeydown(control, event) {
    const rawKey = String(event.key || "");
    const key = rawKey.toLowerCase();
    const menuTarget = openSelectState && openSelectState.menu
      && (event.target === openSelectState.menu || (typeof openSelectState.menu.contains === "function" && openSelectState.menu.contains(event.target)));
    const filterTarget = openSelectState && openSelectState.filter
      && (event.target === openSelectState.filter || (typeof openSelectState.filter.contains === "function" && openSelectState.filter.contains(event.target)));
    const verticalArrow = key === "arrowup" || key === "arrowdown";
    const navigationKey = verticalArrow || key === "arrowleft" || key === "arrowright"
      || key === "home" || key === "end" || key === "pageup" || key === "pagedown";
    const modified = event.ctrlKey || event.metaKey || event.shiftKey;
    const menuSurfaceTarget = !!(menuTarget && !filterTarget);
    if (menuTarget || (openSelectState && (verticalArrow || key === "enter" || key === "escape"))) control = openSelectState.control;
    if (filterTarget && (key === "arrowleft" || key === "arrowright")) return false;
    if (filterTarget && (key === "home" || key === "end" || key === " ")) return false;
    if (menuSurfaceTarget && key === "tab") return false;
    if (menuSurfaceTarget && (event.ctrlKey || event.metaKey) && key === "s") return false;
    if ((event.ctrlKey || event.metaKey || event.shiftKey) && navigationKey) {
      if (!menuSurfaceTarget) return false;
      if (typeof event.preventDefault === "function") event.preventDefault();
      return true;
    }
    if (!menuTarget && (!control || control.tagName !== "SELECT")) return false;
    if (!openSelectState || openSelectState.control !== control) {
      if (!isActiveSelectControl(control)) return false;
      if (navigationKey && !modified && !event.altKey) {
        if (moveClosedSelect(control, key) && typeof event.preventDefault === "function") event.preventDefault();
        return true;
      }
      const opensMenu = (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
        && (key === "enter" || key === " " || key === "f4"))
        || (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && verticalArrow);
      const startsFilter = rawKey.length === 1 && !modified && !event.altKey && rawKey !== " ";
      if (!opensMenu && !startsFilter) return false;
      if (!openSelectMenu(control)) return false;
      if (startsFilter && openSelectState && openSelectState.filter) {
        openSelectState.filter.value = rawKey;
        openSelectState.filterValue = rawKey;
        updateSelectMenu();
      }
      if (typeof event.preventDefault === "function") event.preventDefault();
      return true;
    }
    const plainAction = !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
    const altToggle = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && verticalArrow;
    if (altToggle) {
      finishSelectMenu(true);
      if (typeof event.preventDefault === "function") event.preventDefault();
      return true;
    }
    const dismissKey = key === "escape" && plainAction;
    const commitKey = (key === "enter" || key === "f4") && plainAction;
    if (dismissKey || commitKey) {
      if (dismissKey) cancelSelectMenu();
      else {
        if (key === "enter") {
          const visibleIndexes = visibleSelectIndexes();
          if (openSelectState && visibleIndexes.includes(openSelectState.activeIndex)) {
            chooseSelectOption(openSelectState.activeIndex);
          }
        }
        finishSelectMenu(true);
      }
      if (typeof event.preventDefault === "function") event.preventDefault();
      return true;
    }
    if (key === " ") {
      if (typeof event.preventDefault === "function") event.preventDefault();
      return true;
    }
    if (menuSurfaceTarget) {
      if (typeof event.preventDefault === "function") event.preventDefault();
      return true;
    }
    if (key !== "arrowup" && key !== "arrowdown" && key !== "home" && key !== "end"
      && key !== "pageup" && key !== "pagedown") return false;
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
    let position = visibleIndexes.indexOf(openSelectState.activeIndex);
    if (position < 0) position = key === "arrowup" || key === "end" ? visibleIndexes.length - 1 : 0;
    if (key === "home") position = 0;
    else if (key === "end") position = visibleIndexes.length - 1;
    else {
      const step = key === "pageup" || key === "pagedown" ? 5 : 1;
      position = Math.max(0, Math.min(position + ((key === "arrowup" || key === "pageup") ? -step : step), visibleIndexes.length - 1));
    }
    chooseSelectOption(visibleIndexes[position]);
    if (typeof event.preventDefault === "function") event.preventDefault();
    return true;
  }

  Object.assign(CDBVS, {
    isControlTarget, clickControl, handleSelectKeydown, closeSelectMenu,
    finishSelectMenu, cancelSelectMenu, hasOpenSelectMenu, openSelectMenu
  });
})(window);
