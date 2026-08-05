(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const sendUpdate = () => CDBVS.sendUpdate();
  const setStatus = (message, error) => CDBVS.setStatus(message, error);
  const selectedRowIndex = CDBVS.selectedRowIndex;
  const selectRow = CDBVS.selectRow;
  const insertRowAt = CDBVS.insertRow;
  const deleteRowAt = CDBVS.deleteRowAt;

  function addSheet() {
    const name = window.prompt("New sheet name:", "newSheet");
    if (!name) return;
    if (!state.data || typeof state.data !== "object" || Array.isArray(state.data)) state.data = { customTypes: [], sheets: [] };
    if (!Array.isArray(state.data.sheets)) state.data.sheets = [];
    if (state.data.sheets.some((sheet) => sheet.name === name)) {
      setStatus(`Sheet '${name}' already exists.`, true);
      return;
    }
    state.data.sheets.push({ name, columns: [], lines: [], separators: [], props: {} });
    state.sheetIndex = CDBVS.visibleSheets().length - 1;
    sendUpdate();
  }

  function addColumn(sheet) {
    if (!sheet) return;
    const name = window.prompt("Column name:", "newColumn");
    if (!name) return;
    const type = window.prompt("CastleDB type string (0=id, 1=text, 2=bool, 3=int, 4=float, 5:a,b=enum, 6:sheet=ref, 8=list, 17=properties):", "1");
    if (type === null || type === "") return;
    if (!Array.isArray(sheet.columns)) sheet.columns = [];
    if (sheet.columns.some((column) => column.name === name)) {
      setStatus(`Column '${name}' already exists.`, true);
      return;
    }
    sheet.columns.push({ name, typeStr: type, opt: true });
    sendUpdate();
  }

  function deleteColumn(sheet, index) {
    const column = sheet.columns[index];
    if (!column || !window.confirm(`Delete column '${column.name}' and its values?`)) return;
    sheet.columns.splice(index, 1);
    (sheet.lines || []).forEach((line) => { if (line) delete line[column.name]; });
    CDBVS.removeViewColumn(sheet.name, column.name);
    sendUpdate();
  }

  function addRow(sheet) {
    if (!sheet) return;
    if (!Array.isArray(sheet.lines)) sheet.lines = [];
    sheet.lines.push(CDBVS.createRowForSchema(sheet, sheet.lines));
    sendUpdate();
  }

  function deleteRow(sheet, index) {
    if (!sheet || !window.confirm(`Delete row ${index + 1}?`)) return;
    CDBVS.deleteRowAt(sheet, index);
    sendUpdate();
  }

  function insertSelectedRow(sheet) {
    if (!sheet) return;
    const selected = selectedRowIndex(sheet);
    const index = selected === null ? (Array.isArray(sheet.lines) ? sheet.lines.length : 0) : selected + 1;
    insertRowAt(sheet, index);
    selectRow(sheet, index);
    if (typeof CDBVS.render === "function") CDBVS.render();
  }

  function deleteSelectedRow(sheet) {
    if (!sheet) return;
    const selected = selectedRowIndex(sheet);
    if (selected === null) {
      setStatus("Select a row before deleting it.", true);
      return;
    }
    if (!window.confirm(`Delete row ${selected + 1}?`)) return;
    deleteRowAt(sheet, selected);
    const remaining = Array.isArray(sheet.lines) ? sheet.lines.length : 0;
    selectRow(sheet, remaining ? Math.min(selected, remaining - 1) : null);
    sendUpdate();
    if (typeof CDBVS.render === "function") CDBVS.render();
  }

  Object.assign(CDBVS, { addSheet, addColumn, deleteColumn, addRow, deleteRow, insertSelectedRow, deleteSelectedRow });
})(window);
