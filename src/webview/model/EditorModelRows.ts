// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;
  const commitMutation = CDBVS.commitMutation;
  const persistMutation = CDBVS.persistMutation;
  const ensureSheetState = CDBVS.ensureSheetState;

  function isSeparatorCollapsed(sheet, index) {
    if (!sheet) return false;
    const collapsed = ensureSheetState("collapsedSeparators", sheet.name, () => ({}));
    return collapsed[String(index)] === true;
  }

  function toggleSeparatorCollapsed(sheet, index) {
    if (!sheet) return false;
    const collapsed = ensureSheetState("collapsedSeparators", sheet.name, () => ({}));
    const key = String(index);
    collapsed[key] = !isSeparatorCollapsed(sheet, index);
    return collapsed[key];
  }

  function shiftCollapsedSeparators(sheet, change) {
    if (!sheet || !state.collapsedSeparators || !state.collapsedSeparators[sheet.name]) return;
    const shifted = {};
    Object.keys(state.collapsedSeparators[sheet.name]).forEach((key) => {
      const next = change(Number.parseInt(key, 10));
      if (next !== null && next !== undefined) shifted[String(next)] = state.collapsedSeparators[sheet.name][key];
    });
    state.collapsedSeparators[sheet.name] = shifted;
  }

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

  function insertRow(sheet, index, row, notify = true) {
    if (!sheet) return;
    const mutate = () => {
      if (!Array.isArray(sheet.lines)) sheet.lines = [];
      const insertionIndex = Number.isInteger(index) ? Math.max(0, Math.min(index, sheet.lines.length)) : sheet.lines.length;
      const nextRow = row && typeof row === "object" && !Array.isArray(row) ? row : CDBVS.createRowForSchema(sheet, sheet.lines);
      sheet.lines.splice(insertionIndex, 0, nextRow);
      moveSeparators(sheet, (separatorIndexValue) => separatorIndexValue >= insertionIndex ? separatorIndexValue + 1 : separatorIndexValue);
      shiftCollapsedSeparators(sheet, (separatorIndexValue) => separatorIndexValue >= insertionIndex ? separatorIndexValue + 1 : separatorIndexValue);
    };
    if (notify) persistMutation(mutate);
    else mutate();
  }

  function moveRow(sheet, index, delta, notify = true) {
    if (!sheet || !Array.isArray(sheet.lines) || !Number.isInteger(index) || !Number.isInteger(delta)) return;
    const target = index + delta;
    if (target < 0 || target >= sheet.lines.length) return;
    const mutate = () => {
      [sheet.lines[index], sheet.lines[target]] = [sheet.lines[target], sheet.lines[index]];
    };
    if (notify) persistMutation(mutate);
    else mutate();
  }

  function toggleSeparator(sheet, index) {
    if (!sheet) return;
    persistMutation(() => {
      if (!Array.isArray(sheet.separators)) sheet.separators = [];
      const existing = sheet.separators.findIndex((separator) => separatorIndex(separator) === index);
      if (existing >= 0) {
        sheet.separators.splice(existing, 1);
        removeSeparatorTitles(sheet, [existing]);
      } else {
        sheet.separators.push(index);
        sheet.separators.sort((a, b) => separatorIndex(a) - separatorIndex(b));
      }
    });
  }

  function addSeparator(sheet, index) {
    if (!sheet || !Number.isInteger(index)) return false;
    if (!Array.isArray(sheet.separators)) sheet.separators = [];
    if (sheet.separators.some((separator) => separatorIndex(separator) === index)) return false;
    return commitMutation(() => {
      sheet.separators.push({ index, title: "Section" });
      sheet.separators.sort((left, right) => separatorIndex(left) - separatorIndex(right));
      return true;
    }) === true;
  }

  function removeSeparator(sheet, index) {
    if (!sheet || !Array.isArray(sheet.separators)) return false;
    const position = sheet.separators.findIndex((separator) => separatorIndex(separator) === index);
    if (position < 0) return false;
    return commitMutation(() => {
      sheet.separators.splice(position, 1);
      if (sheet.props && Array.isArray(sheet.props.separatorTitles)) sheet.props.separatorTitles.splice(position, 1);
      if (state.collapsedSeparators && state.collapsedSeparators[sheet.name]) delete state.collapsedSeparators[sheet.name][String(index)];
      return true;
    }) === true;
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
    shiftCollapsedSeparators(sheet, (separatorIndexValue) => {
      if (separatorIndexValue === index) return null;
      return separatorIndexValue > index ? separatorIndexValue - 1 : separatorIndexValue;
    });
    return true;
  }

  Object.assign(CDBVS, {
    isSeparatorCollapsed, toggleSeparatorCollapsed, shiftCollapsedSeparators, separatorIndex,
    moveSeparators, insertRow, moveRow, toggleSeparator, addSeparator, removeSeparator, deleteRowAt
  });
})(window);
