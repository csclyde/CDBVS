// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const modalState = CDBVS.modalState || (CDBVS.modalState = { active: null });
  let modalId = 0;

  function closeActiveModal() {
    if (typeof CDBVS.finishSelectMenu === "function") CDBVS.finishSelectMenu(true);
    if (modalState.active) {
      if (typeof modalState.active._cdbvsDispose === "function") modalState.active._cdbvsDispose();
      modalState.active.remove();
    }
    modalState.active = null;
    if (CDBVS.app) CDBVS.app.inert = false;
  }

  function closeModal(overlay) {
    if (typeof CDBVS.finishSelectMenu === "function") CDBVS.finishSelectMenu(true);
    if (modalState.active === overlay) modalState.active = null;
    if (CDBVS.app) CDBVS.app.inert = !!modalState.active;
    if (overlay) {
      if (typeof overlay._cdbvsDispose === "function") overlay._cdbvsDispose();
      overlay.remove();
    }
  }

  function closeAllModals() {
    let parent = modalState.active && modalState.active._cdbvsPrevious;
    closeActiveModal();
    while (parent) {
      if (typeof parent._cdbvsDispose === "function") parent._cdbvsDispose();
      parent.remove();
      parent = parent._cdbvsPrevious;
    }
    const overlay = document.querySelector && document.querySelector(".text-modal-overlay");
    if (overlay) overlay.remove();
    modalState.active = null;
  }

  function setActiveModal(overlay) {
    modalState.active = overlay;
    if (CDBVS.app) CDBVS.app.inert = !!overlay;
    return overlay;
  }

  function modalField(label, control, className) {
    const field = makeElement("label", null, `column-field${className ? ` ${className}` : ""}`);
    field.appendChild(makeElement("span", label));
    field.appendChild(control);
    return field;
  }

  function createModal(options) {
    const config = options || {};
    let launchTarget = document.activeElement;
    if ((!launchTarget || launchTarget === document.body) && typeof CDBVS.findRenderedCell === "function") {
      const selection = CDBVS.selectedCell(CDBVS.services.sheetView.currentSheet());
      if (selection) launchTarget = CDBVS.findRenderedCell(selection.rowIndex, selection.columnIndex);
    }
    if (typeof CDBVS.finishSelectMenu === "function") CDBVS.finishSelectMenu(true);
    const previous = config.restorePrevious ? modalState.active : null;
    if (previous) {
      previous.remove(); // Keep the parent's draft and listeners for restoration.
      modalState.active = null;
    } else closeActiveModal();
    const overlay = makeElement("div", null, "text-modal-overlay");
    overlay._cdbvsPrevious = previous;
    const changedControls = new Set();
    const controlBaselines = new Map();
    const controlText = (control) => control.type === "checkbox" ? String(control.checked) : control.value;
    const captureControlBaselines = () => {
      overlay.querySelectorAll("input, textarea, select").forEach((control) => {
        if (!control._cdbvsDraft && !controlBaselines.has(control)) controlBaselines.set(control, controlText(control));
      });
    };
    overlay._cdbvsDrafts = () => Array.from(overlay.querySelectorAll("input, textarea, select"))
      .map((control) => typeof control._cdbvsDraft === "function" ? control._cdbvsDraft()
        : changedControls.has(control) && (!controlBaselines.has(control) || controlBaselines.get(control) !== controlText(control)) ? {
          label: `${config.title || "Dialog"} / ${control.getAttribute("aria-label") || control.title || control.placeholder
            || (control.closest("label") && control.closest("label").querySelector("span") && control.closest("label").querySelector("span").textContent) || "draft"}`,
          text: controlText(control)
        } : null).filter(Boolean);
    const trackChange = (event) => {
      if (event.target && !event.target.closest(".cell-select-menu") && !event.target._cdbvsDraft) changedControls.add(event.target);
    };
    overlay.addEventListener("input", trackChange);
    overlay.addEventListener("change", trackChange);
    overlay.addEventListener("focusin", captureControlBaselines, true);
    overlay.addEventListener("pointerdown", captureControlBaselines, true);
    overlay.addEventListener("keydown", captureControlBaselines, true);
    let disposed = false;
    overlay._cdbvsDispose = () => {
      if (disposed) return;
      disposed = true;
      if (typeof config.onClose === "function") config.onClose();
    };
    const dialog = makeElement("section", null, `text-modal${config.className ? ` ${config.className}` : ""}`);
    dialog.setAttribute("role", config.role || "dialog");
    dialog.setAttribute("aria-modal", "true");
    const heading = makeElement("div", null, "text-modal-heading");
    const title = makeElement("strong", config.title || "");
    title.id = `cdbvs-dialog-${++modalId}`;
    heading.appendChild(title);
    dialog.setAttribute("aria-labelledby", title.id);
    const footer = makeElement("div", null, "text-modal-footer");
    const restorePrevious = () => {
      if (!previous) return;
      if (!previous.parentNode && document.body) document.body.appendChild(previous);
      if (!previous.parentNode) return;
      setActiveModal(previous);
      if (typeof config.onRestore === "function") config.onRestore();
    };
    const close = () => {
      if (disposed) return;
      closeModal(overlay);
      restorePrevious();
      let focusTarget = launchTarget && launchTarget.parentNode && launchTarget.isConnected !== false ? launchTarget : null;
      if (!focusTarget && previous) {
        const launchLabel = launchTarget && launchTarget.getAttribute("aria-label");
        focusTarget = previous.querySelector(".cell-selected")
          || (launchLabel && Array.from(previous.querySelectorAll("input, select, textarea, button")).find((control) => control.getAttribute("aria-label") === launchLabel))
          || previous.querySelector("input, select, textarea, button");
      }
      if (!focusTarget && !previous) {
        const sheet = CDBVS.services.sheetView.currentSheet();
        const selection = CDBVS.selectedCell(sheet);
        if (selection && typeof CDBVS.findRenderedCell === "function") focusTarget = CDBVS.findRenderedCell(selection.rowIndex, selection.columnIndex);
        else if (typeof CDBVS.findRenderedRow === "function") {
          const row = CDBVS.findRenderedRow(CDBVS.selectedRowIndex(sheet));
          focusTarget = row && row.querySelector(".row-select");
        }
      }
      if (focusTarget && typeof focusTarget.focus === "function") focusTarget.focus({ preventScroll: true });
    };
    close.overlay = overlay;
    let discardPrompt = null;
    let resumeTarget = null;
    const keepEditing = () => {
      if (!discardPrompt) return;
      discardPrompt.remove();
      discardPrompt = null;
      overlay._cdbvsDiscardPrompt = null;
      Array.from(dialog.children).forEach((child) => { child.inert = false; });
      if (resumeTarget && resumeTarget.parentNode) resumeTarget.focus();
    };
    close.requestClose = () => {
      if (disposed || discardPrompt) return;
      if (typeof CDBVS.finishSelectMenu === "function") CDBVS.finishSelectMenu(true);
      if (!overlay._cdbvsDrafts().length) { close(); return; }
      resumeTarget = document.activeElement;
      discardPrompt = makeElement("div", null, "modal-discard-prompt");
      discardPrompt.setAttribute("role", "alert");
      discardPrompt.appendChild(makeElement("p", "This dialog has unapplied changes. Keep editing or discard them?"));
      const keep = makeButton("Keep editing", keepEditing, "button primary");
      discardPrompt.appendChild(keep);
      discardPrompt.appendChild(makeButton("Discard changes", close, "danger-button"));
      Array.from(dialog.children).forEach((child) => { child.inert = true; });
      dialog.appendChild(discardPrompt);
      overlay._cdbvsDiscardPrompt = discardPrompt;
      keep.focus();
    };
    const closeButton = makeButton("x", close.requestClose, "text-modal-close");
    closeButton.setAttribute("aria-label", "Close dialog");
    heading.appendChild(closeButton);
    dialog.appendChild(heading);
    const modalStatus = makeElement("div", null, "modal-status");
    modalStatus.setAttribute("role", "status");
    modalStatus.setAttribute("aria-live", "polite");
    dialog.appendChild(modalStatus);
    overlay.appendChild(dialog);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        CDBVS.setStatus("Use the dialog actions or Escape to close. Changes stay here until you apply or discard them.");
      }
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229 || event.__cdbvsModalHandled) return;
      if (event.key === "Escape" && event.repeat) { event.preventDefault(); return; }
      const inSelectMenu = event.target && event.target.closest
        && event.target.closest(".cell-select-menu");
      const dropdownOpen = typeof CDBVS.hasOpenSelectMenu === "function" && CDBVS.hasOpenSelectMenu();
      if (event.key === "Escape" && !inSelectMenu && !event.__cdbvsSelectHandled && !dropdownOpen) {
        event.preventDefault();
        if (discardPrompt) keepEditing();
        else close.requestClose();
      }
      if (event.key === "Tab" && !event.defaultPrevented) {
        const scope = discardPrompt || dialog;
        const controls = Array.from(scope.querySelectorAll("button, input, select, textarea, [tabindex]"))
          .filter((control) => !control.disabled && !control.hidden && control.tabIndex >= 0
            && (typeof control.getClientRects !== "function" || control.getClientRects().length));
        if (!controls.length) { event.preventDefault(); return; }
        const index = controls.indexOf(document.activeElement);
        if (index < 0 || (event.shiftKey ? index === 0 : index === controls.length - 1)) {
          event.preventDefault();
          controls[event.shiftKey ? controls.length - 1 : 0].focus();
        }
      }
    });
    document.body.appendChild(overlay);
    setActiveModal(overlay);
    return { overlay, dialog, heading, footer, close };
  }

  function appendModalActions(footer, close, save, options) {
    const config = options || {};
    const cancel = makeButton(config.cancelLabel || "Cancel", close.requestClose || close, config.cancelClass || "modal-cancel");
    const primary = makeButton(config.saveLabel || "Save", save, config.saveClass || "button primary");
    if (close.overlay && close.overlay.querySelector("section").getAttribute("role") !== "alertdialog") {
      const action = config.saveLabel || "Save";
      const hint = makeElement("small", config.viewOnly
        ? "Filters change only this view. Ctrl/Cmd+Enter or Ctrl/Cmd+S applies filters."
        : close.overlay._cdbvsPrevious
        ? `${action} updates the parent dialog draft. Ctrl/Cmd+Enter or Ctrl/Cmd+S applies here; apply the parent dialog to update the document.`
        : `${action} applies changes. Ctrl/Cmd+Enter applies; Ctrl/Cmd+S applies and saves the file.`, "modal-action-hint");
      footer.appendChild(hint);
    }
    footer.appendChild(cancel);
    footer.appendChild(primary);
    if (close.overlay) {
      close.overlay._cdbvsConfirmation = close.overlay.querySelector("section").getAttribute("role") === "alertdialog";
      if (!close.overlay._cdbvsConfirmation) close.overlay._cdbvsApply = save;
      close.overlay._cdbvsViewOnly = config.viewOnly === true;
    }
    return { cancel, primary };
  }

  Object.assign(CDBVS, {
    modalState, closeActiveModal, closeModal, closeAllModals, setActiveModal,
    modalField, createModal, appendModalActions
  });
})(window);
