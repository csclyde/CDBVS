(function (global) {
  const CDBVS = global.CDBVS;
  let openSelectState = null;
  let selectMenuId = 0;
  function renderedRoot() {
    const app = CDBVS.app;
    return app && typeof app.querySelectorAll === "function" ? app : document;
  }

  function markRenderedRowSelected() {
    const sheet = CDBVS.currentSheet();
    renderedRoot().querySelectorAll(".table-wrap tr").forEach((row) => {
      if (CDBVS.isRowSelected(sheet, Number.parseInt(row.dataset.rowIndex, 10))) row.classList.add("row-selected");
      else row.classList.remove("row-selected");
    });
  }

  function findRenderedRow(rowIndex) {
    return Array.from(renderedRoot().querySelectorAll(".table-wrap tr"))
      .filter((row) => row.dataset && row.dataset.rowIndex !== undefined)
      .find((row) => Number.parseInt(row.dataset.rowIndex, 10) === rowIndex) || null;
  }

  function findRenderedCell(rowIndex, columnIndex) {
    const row = findRenderedRow(rowIndex);
    if (!row) return null;
    return Array.from(row.children).find((cell) => Number.parseInt(cell.dataset && cell.dataset.columnIndex, 10) === columnIndex) || null;
  }

  function applyCellErrors(cell, errors, fallbackTitle) {
    if (errors.length) {
      cell.classList.add("cell-error");
      cell.title = errors.map((error) => error.message).join("\n");
      cell.setAttribute("aria-invalid", "true");
      cell.dataset.errorMessage = cell.title;
    } else {
      cell.classList.remove("cell-error");
      cell.setAttribute("aria-invalid", "false");
      delete cell.dataset.errorMessage;
      cell.title = fallbackTitle;
    }
  }

  function refreshRenderedCell(sheet, rowIndex, columnIndex) {
    if (!sheet || !Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return false;
    const cell = findRenderedCell(rowIndex, columnIndex);
    if (!cell) return false;
    const column = (sheet.columns || [])[columnIndex];
    if (!column) return false;
    const errorsForSheet = CDBVS.cellErrorsForSheet(sheet);
    applyCellErrors(cell, errorsForSheet[CDBVS.cellErrorKey(rowIndex, column.name)] || [], CDBVS.typeOf(column).code === 0 ? "Double-click to edit this row" : "");
    if (CDBVS.typeOf(column).code === 0) {
      renderedRoot().querySelectorAll(".table-wrap tr").forEach((row) => {
        const renderedRowIndex = Number.parseInt(row.dataset.rowIndex, 10);
        const idCell = Array.from(row.children).find((item) => Number.parseInt(item.dataset && item.dataset.columnIndex, 10) === columnIndex);
        if (idCell && renderedRowIndex !== rowIndex) {
          const otherErrors = errorsForSheet[CDBVS.cellErrorKey(renderedRowIndex, column.name)] || [];
          applyCellErrors(idCell, otherErrors, "Double-click to edit this row");
        }
      });
    }
    return true;
  }

  function updateRenderedSelection(sheet, previous, next) {
    if (previous && (previous.rowIndex !== next?.rowIndex || previous.columnIndex !== next?.columnIndex)) {
      const previousCell = findRenderedCell(previous.rowIndex, previous.columnIndex);
      if (previousCell) previousCell.classList.remove("cell-selected");
      const previousRow = findRenderedRow(previous.rowIndex);
      if (previousRow) previousRow.classList.remove("row-selected");
    }
    if (next) {
      const nextCell = findRenderedCell(next.rowIndex, next.columnIndex);
      if (nextCell) {
        nextCell.classList.add("cell-selected");
        if (typeof nextCell.focus === "function") nextCell.focus({ preventScroll: true });
        if (typeof nextCell.scrollIntoView === "function") nextCell.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      const nextRow = findRenderedRow(next.rowIndex);
      if (nextRow) nextRow.classList.add("row-selected");
    }
    return true;
  }

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
    if (selectedItem && typeof selectedItem.scrollIntoView === "function") {
      selectedItem.scrollIntoView({ block: "nearest" });
    }
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
        const sheet = openSelectState && openSelectState.sheet;
        const closeHandler = openSelectState && openSelectState.onClose;
        closeSelectMenu();
        if (typeof closeHandler === "function") closeHandler();
        else if (sheet) CDBVS.exitRenderedCell(sheet);
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
      sheet: sheet || CDBVS.currentSheet(), onClose, reposition, cleanup
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
      && (event.target === openSelectState.menu
        || (typeof openSelectState.menu.contains === "function" && openSelectState.menu.contains(event.target)));
    const filterTarget = openSelectState && openSelectState.filter
      && (event.target === openSelectState.filter
        || (typeof openSelectState.filter.contains === "function" && openSelectState.filter.contains(event.target)));
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

  function activateEditorInCell(cell, sheet, event, onClose) {
    if (!cell) return true;
    const controls = Array.from(cell.querySelectorAll("input, select, textarea, button"));
    const control = controls.find((item) => item.classList && item.classList.contains("list-toggle"))
      || controls.find((item) => item.tagName === "INPUT" || item.tagName === "SELECT" || item.tagName === "TEXTAREA");
    if (!control) return true;
    const directControlClick = isControlTarget(event && event.target, control);
    const directListToggleClick = !!(event && event.target && event.target.closest
      && event.target.closest(".list-toggle"));
    if (typeof control.focus === "function") control.focus();
    if (control.tagName === "SELECT") {
      openSelectMenu(control, sheet, onClose);
    } else if (control.classList && control.classList.contains("list-toggle") && !directListToggleClick) {
      if (typeof cell._cdbvsToggleList === "function") cell._cdbvsToggleList();
      else clickControl(control);
    } else if (!directControlClick && control.tagName === "INPUT" && control.type === "color" && typeof control.showPicker === "function") {
      try { control.showPicker(); } catch (_) {}
    } else if (!directControlClick && typeof control.setSelectionRange === "function") {
      try { control.setSelectionRange(String(control.value || "").length, String(control.value || "").length); } catch (_) {}
    }
    if (control.classList && control.classList.contains("list-toggle") && typeof cell.focus === "function") {
      cell.focus({ preventScroll: true });
    }
    return true;
  }

  function activateRenderedCell(sheet, rowIndex, columnIndex, event) {
    const cell = findRenderedCell(rowIndex, columnIndex);
    if (cell && typeof cell._cdbvsToggleBoolean === "function") return cell._cdbvsToggleBoolean(event);
    if (!CDBVS.activateCell(sheet, rowIndex, columnIndex)) return false;
    return activateEditorInCell(cell, sheet, event);
  }

  function exitEditorInCell(cell, sheet, focusTarget, collapseList) {
    if (!cell) return false;
    if (openSelectState) closeSelectMenu();
    const focused = document.activeElement;
    const focusedInCell = focused && typeof cell.contains === "function" && cell.contains(focused);
    const editorTarget = focusedInCell && focused.closest && focused.closest("input, textarea, select, [contenteditable=\"true\"]")
      || cell.querySelector("input, textarea, select, [contenteditable=\"true\"]");
    if (focusedInCell && typeof focused.blur === "function") focused.blur();
    if (editorTarget) CDBVS.commitEditorTarget(editorTarget);
    CDBVS.deactivateCell(sheet);
    if (collapseList) {
      const toggle = cell.querySelector(".list-toggle.expanded");
      if (toggle) {
        if (typeof cell._cdbvsToggleList === "function") cell._cdbvsToggleList();
        else clickControl(toggle);
      }
    }
    const nextFocusTarget = typeof focusTarget === "function" ? focusTarget() : focusTarget;
    if (nextFocusTarget && typeof nextFocusTarget.focus === "function") nextFocusTarget.focus({ preventScroll: true });
    return true;
  }

  function exitRenderedCell(sheet, collapseList = true) {
    const active = CDBVS.activeCell(sheet);
    if (!active) return false;
    const cell = findRenderedCell(active.rowIndex, active.columnIndex);
    return exitEditorInCell(cell, sheet, cell, collapseList);
  }

  function selectRenderedRow(sheet, rowIndex, rowElement, event) {
    const previous = CDBVS.selectedCell(sheet);
    if (previous) CDBVS.exitRenderedCell(sheet, false);
    if (event && (event.shiftKey || event.ctrlKey || event.metaKey)) CDBVS.selectRowWithModifiers(sheet, rowIndex, event);
    else CDBVS.selectRow(sheet, rowIndex);
    CDBVS.updateRenderedSelection(sheet, previous, null);
    markRenderedRowSelected(rowElement);
  }

  function selectRenderedCell(sheet, rowIndex, columnIndex, rowElement, cellElement) {
    const previous = CDBVS.selectedCell(sheet);
    if (!previous || previous.rowIndex !== rowIndex || previous.columnIndex !== columnIndex) CDBVS.exitRenderedCell(sheet, false);
    CDBVS.selectCell(sheet, rowIndex, columnIndex);
    CDBVS.updateRenderedSelection(sheet, previous, CDBVS.selectedCell(sheet));
    if (cellElement && !cellElement.classList.contains("cell-selected")) cellElement.classList.add("cell-selected");
    markRenderedRowSelected(rowElement);
  }

  Object.assign(CDBVS, {
    renderedRoot, findRenderedRow, findRenderedCell, refreshRenderedCell, updateRenderedSelection,
    activateEditorInCell, exitEditorInCell, activateRenderedCell, exitRenderedCell, selectRenderedRow, selectRenderedCell,
    handleSelectKeydown, closeSelectMenu, openSelectMenu
  });
})(window);
