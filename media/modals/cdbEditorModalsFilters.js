(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const setStatus = (message, error) => CDBVS.setStatus(message, error);
  const typeOf = CDBVS.typeOf;
  const typeLabel = CDBVS.typeLabel;
  const viewForSheet = CDBVS.viewForSheet;
  const referenceOptions = CDBVS.referenceOptions;
  const closeActiveModal = CDBVS.closeActiveModal;
  const modalState = CDBVS.modalState;

  function openFilterModal(sheet) {
    if (!sheet) {
      setStatus("Select a sheet before configuring filters.", true);
      return;
    }
    closeActiveModal();
    const overlay = makeElement("div", null, "text-modal-overlay");
    const dialog = makeElement("section", null, "text-modal filter-modal");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const heading = makeElement("div", null, "text-modal-heading");
    heading.appendChild(makeElement("strong", `Filter: ${sheet.name}`));
    const view = viewForSheet(sheet);
    const draftFilters = JSON.parse(JSON.stringify(view.filters));
    const form = makeElement("div", null, "filter-form");
    form.appendChild(makeElement("h3", "Column filters", "filter-section-heading"));
    const controls = makeElement("div", null, "filter-controls");
    (sheet.columns || []).forEach((column) => {
      const type = typeOf(column);
      const rule = draftFilters[column.name] || {};
      const field = makeElement("div", null, "filter-field");
      const label = makeElement("div", null, "filter-field-label");
      label.appendChild(makeElement("strong", column.name || "?"));
      label.appendChild(makeElement("small", typeLabel(column), "filter-type"));
      field.appendChild(label);
      if (type.code === 2) {
        const select = document.createElement("select");
        select.add(new Option("Any", "any"));
        select.add(new Option("True", "true"));
        select.add(new Option("False", "false"));
        select.value = rule.value || "any";
        select.addEventListener("change", () => {
          if (select.value === "any") delete draftFilters[column.name];
          else draftFilters[column.name] = { value: select.value };
        });
        field.appendChild(select);
      } else if (type.code === 3 || type.code === 4) {
        const range = makeElement("div", null, "filter-range");
        const min = document.createElement("input");
        min.type = "number";
        min.step = type.code === 3 ? "1" : "any";
        min.placeholder = "Minimum";
        min.value = rule.min === undefined ? "" : rule.min;
        const max = document.createElement("input");
        max.type = "number";
        max.step = type.code === 3 ? "1" : "any";
        max.placeholder = "Maximum";
        max.value = rule.max === undefined ? "" : rule.max;
        const updateRange = () => {
          if (min.value === "" && max.value === "") delete draftFilters[column.name];
          else draftFilters[column.name] = { min: min.value, max: max.value };
        };
        min.addEventListener("input", updateRange);
        max.addEventListener("input", updateRange);
        range.appendChild(min);
        range.appendChild(max);
        field.appendChild(range);
      } else if (type.code === 11) {
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "Color hex or decimal...";
        input.value = rule.value === undefined ? "" : String(rule.value);
        input.addEventListener("input", () => {
          if (input.value.trim() === "") delete draftFilters[column.name];
          else draftFilters[column.name] = { value: input.value };
        });
        field.appendChild(input);
      } else if (type.code === 5) {
        const select = document.createElement("select");
        select.add(new Option("Any", ""));
        type.values.forEach((value, index) => select.add(new Option(value, String(index))));
        select.value = rule.value === undefined ? "" : String(rule.value);
        select.addEventListener("change", () => {
          if (select.value === "") delete draftFilters[column.name];
          else draftFilters[column.name] = { value: select.value };
        });
        field.appendChild(select);
      } else if (type.code === 6 && referenceOptions(column)) {
        const select = document.createElement("select");
        select.add(new Option("Any", ""));
        referenceOptions(column).forEach((value) => select.add(new Option(String(value), String(value))));
        select.value = rule.value === undefined ? "" : String(rule.value);
        select.addEventListener("change", () => {
          if (select.value === "") delete draftFilters[column.name];
          else draftFilters[column.name] = { value: select.value };
        });
        field.appendChild(select);
      } else if (type.code === 10 && type.values.length) {
        const checks = makeElement("div", null, "filter-checks");
        let mask = Number(rule.mask) || 0;
        type.values.forEach((value, index) => {
          const checkLabel = makeElement("label", null, "filter-check");
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = (mask & (1 << index)) !== 0;
          checkbox.addEventListener("change", () => {
            if (checkbox.checked) mask |= 1 << index;
            else mask &= ~(1 << index);
            if (mask) draftFilters[column.name] = { mask };
            else delete draftFilters[column.name];
          });
          checkLabel.appendChild(checkbox);
          checkLabel.appendChild(makeElement("span", value));
          checks.appendChild(checkLabel);
        });
        field.appendChild(checks);
      } else {
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = type.code === 8 || type.code === 17 ? "Contains JSON text..." : "Contains...";
        input.value = rule.value === undefined ? "" : String(rule.value);
        input.addEventListener("input", () => {
          if (input.value.trim() === "") delete draftFilters[column.name];
          else draftFilters[column.name] = { value: input.value };
        });
        field.appendChild(input);
      }
      controls.appendChild(field);
    });
    form.appendChild(controls);
    const footer = makeElement("div", null, "text-modal-footer");
    const close = () => {
      if (modalState.active === overlay) modalState.active = null;
      overlay.remove();
    };
    const apply = () => {
      state.columnFilters[sheet.name] = draftFilters;
      close();
      CDBVS.render();
    };
    heading.appendChild(makeButton("x", close, "text-modal-close"));
    footer.appendChild(makeButton("Cancel", close, "modal-cancel"));
    footer.appendChild(makeButton("Apply", apply, "button primary"));
    dialog.appendChild(heading);
    dialog.appendChild(form);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
    document.body.appendChild(overlay);
    modalState.active = overlay;
    const firstControl = controls.querySelector("input, select");
    if (firstControl) firstControl.focus();
  }

  Object.assign(CDBVS, { openFilterModal });
})(window);
