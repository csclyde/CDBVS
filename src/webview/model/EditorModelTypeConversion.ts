// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;

  function integerValue(value) {
    if (typeof value === "number") return Number.isInteger(value) ? value : null;
    if (typeof value === "string" && /^[-+]?\d+$/.test(value.trim())) return Number(value);
    return null;
  }

  function numericValue(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
    return null;
  }

  function convertColumnValue(value, fromType, toType) {
    if (value === undefined || value === null) return { ok: true, value };
    if (fromType.code === toType.code) return { ok: true, value };
    if ([0, 1, 6, 7, 9, 12, 13, 20].includes(toType.code)) {
      if (toType.code === 1 && fromType.code === 5 && Number.isInteger(value) && fromType.values[value] !== undefined) {
        return { ok: true, value: fromType.values[value] };
      }
      if (["string", "number", "boolean"].includes(typeof value)) return { ok: true, value: String(value) };
      return { ok: false };
    }
    if (toType.code === 2) {
      if (typeof value === "boolean") return { ok: true, value };
      if (typeof value === "number" && Number.isFinite(value)) return { ok: true, value: value !== 0 };
      if (value === "true" || value === "false") return { ok: true, value: value === "true" };
      return { ok: false };
    }
    if ([3, 4].includes(toType.code)) {
      const number = typeof value === "boolean" ? (value ? 1 : 0) : numericValue(value);
      if (number === null || (toType.code === 3 && !Number.isInteger(number))) return { ok: false };
      return { ok: true, value: toType.code === 3 ? Math.trunc(number) : number };
    }
    if ([5, 10, 11].includes(toType.code)) {
      if (toType.code === 5 && fromType.code === 5 && Number.isInteger(value)) {
        const label = fromType.values[value];
        const mapped = toType.values.findIndex((item) => item === label);
        return { ok: mapped >= 0, value: mapped >= 0 ? mapped : undefined };
      }
      if (toType.code === 10 && fromType.code === 10 && Number.isInteger(value) && fromType.values.length && toType.values.length) {
        let mapped = 0;
        fromType.values.forEach((label, index) => {
          const targetIndex = toType.values.indexOf(label);
          if ((value & (1 << index)) !== 0 && targetIndex >= 0) mapped |= 1 << targetIndex;
        });
        return { ok: true, value: mapped };
      }
      if (toType.code === 10 && fromType.code === 5 && fromType.values.join(",") === toType.values.join(",") && Number.isInteger(value)) {
        return { ok: value >= 0 && value < toType.values.length, value: value >= 0 ? 1 << value : undefined };
      }
      const number = integerValue(value);
      if (number === null || (toType.code === 5 && toType.values.length && (number < 0 || number >= toType.values.length))) return { ok: false };
      return { ok: true, value: number };
    }
    if (toType.code === 8 && fromType.code === 17) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false };
      return { ok: true, value: Object.keys(value).length ? [value] : [] };
    }
    if (toType.code === 17 && fromType.code === 8) {
      if (!Array.isArray(value)) return { ok: false };
      return { ok: true, value: value[0] && typeof value[0] === "object" && !Array.isArray(value[0]) ? value[0] : {} };
    }
    return { ok: false };
  }

  function prepareColumnTypeChange(sheet, column, typeString) {
    const fromType = CDBVS.typeOf(column);
    const toType = CDBVS.typeOf({ typeStr: typeString });
    if (toType.code < 0) {
      if (CDBVS.getTypeString(column) === typeString) return { ok: true, type: toType, columnName: column.name, values: [] };
      return { ok: false, message: `Unknown type '${typeString}'.` };
    }
    const values = [];
    if (fromType.code === toType.code) {
      if (fromType.code === 5 && fromType.argument !== toType.argument) {
        for (const line of (sheet.lines || [])) {
          if (!line || !Object.prototype.hasOwnProperty.call(line, column.name)) continue;
          const value = line[column.name];
          if (value === undefined || value === null) continue;
          if (!Number.isInteger(value) || fromType.values[value] === undefined) return { ok: false, message: `Cannot safely remap enum values for '${column.name}'.` };
          const next = toType.values.indexOf(fromType.values[value]);
          if (next < 0) return { ok: false, message: `Enum value '${fromType.values[value]}' is not defined by the new type.` };
          values.push({ line, value: next });
        }
      } else if (fromType.code === 10 && fromType.argument !== toType.argument) {
        for (const line of (sheet.lines || [])) {
          if (!line || !Object.prototype.hasOwnProperty.call(line, column.name)) continue;
          const value = line[column.name];
          if (value === undefined || value === null) continue;
          if (!Number.isInteger(value)) return { ok: false, message: `Cannot safely remap flags for '${column.name}'.` };
          let mapped = 0;
          let lost = false;
          for (let index = 0; index < fromType.values.length; index += 1) {
            const label = fromType.values[index];
            const next = toType.values.indexOf(label);
            if ((value & (1 << index)) !== 0) {
              if (next < 0) lost = true;
              else mapped |= 1 << next;
            }
          }
          if (lost) return { ok: false, message: `The new flags type removes a value used by '${column.name}'.` };
          values.push({ line, value: mapped });
        }
      }
      return { ok: true, type: toType, columnName: column.name, values };
    }
    for (const line of (sheet.lines || [])) {
      if (!line || !Object.prototype.hasOwnProperty.call(line, column.name)) continue;
      const converted = convertColumnValue(line[column.name], fromType, toType);
      if (!converted.ok) return { ok: false, message: `Cannot safely convert '${column.name}' from ${fromType.name} to ${toType.name}.` };
      values.push({ line, value: converted.value });
    }
    return { ok: true, type: toType, columnName: column.name, values };
  }

  Object.assign(CDBVS, { convertColumnValue, prepareColumnTypeChange });
})(window);
