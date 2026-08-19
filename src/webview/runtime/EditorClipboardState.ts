// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;
  const state = CDBVS.state;

  const clipboardState = {
    setCell(value) {
      state.cellClipboard = value;
      state.rowClipboard = null;
    },
    setRow(value) {
      state.rowClipboard = value;
      state.cellClipboard = null;
    },
    getCell() {
      return state.cellClipboard;
    },
    getRow() {
      return state.rowClipboard;
    }
  };

  CDBVS.clipboardState = clipboardState;
})(window);
