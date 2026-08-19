  // @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;

  function separatorIndex(separator) {
    return typeof separator === "number" ? separator : separator && separator.index;
  }

  function moveSeparators(sheet, change) {
    if (!Array.isArray(sheet.separators)) return;
    sheet.separators = sheet.separators.map((separator) => {
      const index = separatorIndex(separator);
      if (index === undefined) return separator;
      const next = change(index);
      if (next === null) return null;
      if (typeof separator === "number") return next;
      return Object.assign({}, separator, { index: next });
    }).filter((separator) => separator !== null);
  }

  function removeSeparatorTitles(sheet, positions) {
    if (!sheet || !sheet.props || !Array.isArray(sheet.props.separatorTitles) || !Array.isArray(positions)) return;
    positions.slice().sort((left, right) => right - left).forEach((position) => {
      if (position >= 0 && position < sheet.props.separatorTitles.length) sheet.props.separatorTitles.splice(position, 1);
    });
    if (!sheet.props.separatorTitles.some((title) => title !== undefined && title !== null)) delete sheet.props.separatorTitles;
  }

  function updateSeparatorTitle(sheet, position, title) {
    if (!sheet || !Array.isArray(sheet.separators) || !Number.isInteger(position)) return false;
    const separator = sheet.separators[position];
    if (separator && typeof separator === "object") separator.title = title;
    else {
      if (!sheet.props || typeof sheet.props !== "object") sheet.props = {};
      if (!Array.isArray(sheet.props.separatorTitles)) sheet.props.separatorTitles = [];
      sheet.props.separatorTitles[position] = title;
    }
    return true;
  }

  function insertRow(sheet, index, row) {
    if (!sheet) return;
    if (!Array.isArray(sheet.lines)) sheet.lines = [];
    const insertionIndex = Number.isInteger(index) ? Math.max(0, Math.min(index, sheet.lines.length)) : sheet.lines.length;
    const nextRow = row && typeof row === "object" && !Array.isArray(row) ? row : CDBVS.createRowForSchema(sheet, sheet.lines);
    sheet.lines.splice(insertionIndex, 0, nextRow);
    moveSeparators(sheet, (separatorIndexValue) => separatorIndexValue >= insertionIndex ? separatorIndexValue + 1 : separatorIndexValue);
    return true;
  }

  function appendRow(sheet) {
    if (!sheet) return false;
    const index = Array.isArray(sheet.lines) ? sheet.lines.length : 0;
    return insertRow(sheet, index);
  }

  function updateRow(sheet, rowIndex, draft) {
    if (!sheet || !Array.isArray(sheet.lines) || !sheet.lines[rowIndex] || !draft || typeof draft !== "object" || Array.isArray(draft)) return false;
    const row = sheet.lines[rowIndex];
    Object.keys(row).forEach((key) => delete row[key]);
    Object.assign(row, draft);
    return true;
  }

  function moveRow(sheet, index, delta) {
    if (!sheet || !Array.isArray(sheet.lines) || !Number.isInteger(index) || !Number.isInteger(delta)) return;
    const target = index + delta;
    if (target < 0 || target >= sheet.lines.length) return;
    [sheet.lines[index], sheet.lines[target]] = [sheet.lines[target], sheet.lines[index]];
  }

  function toggleSeparator(sheet, index) {
    if (!sheet) return;
    if (!Array.isArray(sheet.separators)) sheet.separators = [];
    const existing = sheet.separators.findIndex((separator) => separatorIndex(separator) === index);
    if (existing >= 0) {
      sheet.separators.splice(existing, 1);
      removeSeparatorTitles(sheet, [existing]);
    } else {
      sheet.separators.push(index);
      sheet.separators.sort((a, b) => separatorIndex(a) - separatorIndex(b));
    }
    return true;
  }

  function addSeparator(sheet, index) {
    if (!sheet || !Number.isInteger(index)) return false;
    if (!Array.isArray(sheet.separators)) sheet.separators = [];
    if (sheet.separators.some((separator) => separatorIndex(separator) === index)) return false;
    sheet.separators.push({ index, title: "Section" });
    sheet.separators.sort((left, right) => separatorIndex(left) - separatorIndex(right));
    return true;
  }

  function removeSeparator(sheet, index) {
    if (!sheet || !Array.isArray(sheet.separators)) return false;
    const position = sheet.separators.findIndex((separator) => separatorIndex(separator) === index);
    if (position < 0) return false;
    sheet.separators.splice(position, 1);
    if (sheet.props && Array.isArray(sheet.props.separatorTitles)) sheet.props.separatorTitles.splice(position, 1);
    return true;
  }

  function deleteRowAt(sheet, index) {
    if (!sheet || !Array.isArray(sheet.lines) || !Number.isInteger(index) || index < 0 || index >= sheet.lines.length) return false;
    const removedSeparatorPositions = (sheet.separators || []).reduce((positions, separator, position) => {
      if (separatorIndex(separator) === index) positions.push(position);
      return positions;
    }, []);
    sheet.lines.splice(index, 1);
    removeSeparatorTitles(sheet, removedSeparatorPositions);
    moveSeparators(sheet, (separatorIndexValue) => {
      if (separatorIndexValue === index) return null;
      return separatorIndexValue > index ? separatorIndexValue - 1 : separatorIndexValue;
    });
    return true;
  }

  Object.assign(CDBVS, {
    separatorIndex,
    moveSeparators, insertRow, appendRow, updateRow, moveRow, toggleSeparator, addSeparatorAt: addSeparator, removeSeparatorAt: removeSeparator, deleteRowAt,
    updateSeparatorTitle
  });
})(window);
