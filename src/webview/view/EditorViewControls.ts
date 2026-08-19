// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const makeElement = CDBVS.makeElement;
  const makeButton = CDBVS.makeButton;
  const typeOf = CDBVS.typeOf;
  const viewForSheet = CDBVS.viewForSheet;
  const renderNow = CDBVS.renderNow;

  function activeViewItems(sheet) {
    if (!sheet) return [];
    const view = viewForSheet(sheet);
    const items = [];
    if (state.filter.trim()) {
      items.push({
        label: `Search: "${state.filter.trim()}"`,
        remove: () => { state.filter = ""; renderNow(); }
      });
    }
    Object.keys(view.filters).forEach((columnName) => {
      const rule = view.filters[columnName];
      const column = (sheet.columns || []).find((item) => item.name === columnName);
      if (!column || !rule) return;
      const type = typeOf(column);
      let label = "";
      if (rule.min !== undefined || rule.max !== undefined) {
        const bounds = [];
        if (rule.min !== "" && rule.min !== undefined) bounds.push(`>= ${rule.min}`);
        if (rule.max !== "" && rule.max !== undefined) bounds.push(`<= ${rule.max}`);
        label = `${columnName} ${bounds.join(" and ")}`;
      } else if (type.code === 2) {
        label = `${columnName} = ${rule.value === "true" ? "True" : "False"}`;
      } else if (type.code === 5 && rule.value !== undefined) {
        label = `${columnName} = ${type.values[Number(rule.value)] || rule.value}`;
      } else if (type.code === 10 && rule.mask !== undefined) {
        label = `${columnName} flags mask ${rule.mask}`;
      } else if (rule.value !== undefined && String(rule.value) !== "") {
        label = `${columnName} contains "${rule.value}"`;
      }
      if (label) items.push({
        label,
        remove: () => {
          delete view.filters[columnName];
          renderNow();
        }
      });
    });
    if (view.sort.column) items.push({
      label: `Sort: ${view.sort.column} (${view.sort.direction})`,
      remove: () => {
        view.sort.column = "";
        view.sort.direction = "asc";
        renderNow();
      }
    });
    return items;
  }

  function renderViewSummary(container, sheet) {
    container.replaceChildren();
    const items = activeViewItems(sheet);
    if (!items.length) {
      container.appendChild(makeElement("span", "No search, filters, or sorting applied.", "view-summary-empty"));
      return;
    }
    items.forEach((item) => {
      const pill = makeElement("span", null, "view-pill");
      pill.appendChild(makeElement("span", item.label));
      const remove = makeButton("x", item.remove, "view-pill-remove");
      remove.title = `Remove ${item.label}`;
      remove.setAttribute("aria-label", `Remove ${item.label}`);
      pill.appendChild(remove);
      container.appendChild(pill);
    });
  }

  function cycleColumnSort(sheet, columnName) {
    const sort = viewForSheet(sheet).sort;
    if (sort.column !== columnName) {
      sort.column = columnName;
      sort.direction = "desc";
    } else if (sort.direction === "desc") {
      sort.direction = "asc";
    } else {
      sort.column = "";
      sort.direction = "asc";
    }
    renderNow();
  }

  Object.assign(CDBVS, { activeViewItems, renderViewSummary, cycleColumnSort });
})(window);
