// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;

  // The sheet-state model is the only public owner of sheet-scoped interaction
  // state. It contains no DOM references and does not persist document data.
  const sheetState = {
    map: CDBVS.ensureStateMap,
    forSheet: CDBVS.ensureSheetState,
    clearSheet: CDBVS.clearSheetState,
    clearMap: CDBVS.clearStateMap,
    filters(sheetName) {
      return CDBVS.ensureSheetState("columnFilters", sheetName, () => ({}));
    },
    readFilters(sheetName) {
      return this.map("columnFilters")[sheetName] || {};
    },
    sort(sheetName) {
      return CDBVS.ensureSheetState("sorts", sheetName, () => ({ column: "", direction: "asc" }));
    },
    readSort(sheetName) {
      return this.map("sorts")[sheetName] || { column: "", direction: "asc" };
    },
    removeFilter(sheetName, columnName) {
      delete this.filters(sheetName)[columnName];
    },
    clearSort(sheetName) {
      const sort = this.sort(sheetName);
      sort.column = "";
      sort.direction = "asc";
    },
    cycleSort(sheetName, columnName) {
      const sort = this.sort(sheetName);
      if (sort.column !== columnName) {
        sort.column = columnName;
        sort.direction = "desc";
      } else if (sort.direction === "desc") {
        sort.direction = "asc";
      } else {
        this.clearSort(sheetName);
      }
      return sort;
    },
    collapsedSeparators(sheetName) {
      return this.forSheet("collapsedSeparators", sheetName, () => ({}));
    },
    isSeparatorCollapsed(sheetName, index) {
      const collapsed = this.readCollapsedSeparators(sheetName);
      return !!(collapsed && collapsed[String(index)] === true);
    },
    readCollapsedSeparators(sheetName) {
      return this.map("collapsedSeparators")[sheetName] || null;
    },
    toggleSeparatorCollapsed(sheetName, index) {
      const collapsed = this.collapsedSeparators(sheetName);
      const key = String(index);
      collapsed[key] = !this.isSeparatorCollapsed(sheetName, index);
      return collapsed[key];
    },
    shiftCollapsedSeparators(sheetName, change) {
      const collapsed = this.readCollapsedSeparators(sheetName);
      if (!collapsed || typeof change !== "function") return;
      const shifted = {};
      Object.keys(collapsed).forEach((key) => {
        const next = change(Number.parseInt(key, 10));
        if (next !== null && next !== undefined) shifted[String(next)] = collapsed[key];
      });
      this.map("collapsedSeparators")[sheetName] = shifted;
    },
    removeCollapsedSeparator(sheetName, index) {
      const collapsed = this.readCollapsedSeparators(sheetName);
      if (collapsed) delete collapsed[String(index)];
    },
    setFilters: CDBVS.setColumnFilters,
    renameColumn: CDBVS.renameViewColumn,
    removeColumn: CDBVS.removeViewColumn,
    renameSheet: CDBVS.renameSheetState,
    removeSheet: CDBVS.removeSheetState,
    clearList: CDBVS.clearListState,
    errors(sheetName) {
      const errors = this.map("cellErrors");
      if (!errors[sheetName] || typeof errors[sheetName] !== "object") errors[sheetName] = {};
      return errors[sheetName];
    },
    readErrors(sheetName) {
      return this.map("cellErrors")[sheetName] || null;
    },
    clearErrors(sheetName) {
      delete this.map("cellErrors")[sheetName];
    },
    adjustSelectionAfterColumnRemoval: CDBVS.adjustCellSelectionAfterColumnRemoval,
    swapSelectionColumns: CDBVS.swapCellSelectionColumns,
    getActiveIndex() {
      return Number.isInteger(state.sheetIndex) ? state.sheetIndex : 0;
    },
    setActiveIndex(index) {
      state.sheetIndex = Number.isInteger(index) ? index : 0;
      return state.sheetIndex;
    },
    isListExpanded: CDBVS.isListExpanded,
    setListExpanded: CDBVS.setListExpanded,
    selectedListItems: CDBVS.selectedListItems,
    selectedListCell: CDBVS.selectedListCell,
    listSelectionAnchor: CDBVS.listSelectionAnchor,
    setSelectedListItems: CDBVS.setSelectedListItems,
    selectListItems: CDBVS.selectListItems,
    setSelectedListCell: CDBVS.setSelectedListCell,
    clearSelectedListCell: CDBVS.clearSelectedListCell,
    clearSelectedListItems: CDBVS.clearSelectedListItems,
    clearSelectedListSelection: CDBVS.clearSelectedListSelection
  };

  CDBVS.sheetState = sheetState;
  Object.assign(CDBVS, {
    isSeparatorCollapsed: (sheet, index) => sheetState.isSeparatorCollapsed(sheet && sheet.name, index),
    toggleSeparatorCollapsed: (sheet, index) => sheetState.toggleSeparatorCollapsed(sheet && sheet.name, index)
  });
})(window);
