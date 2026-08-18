(function (global) {
  const CDBVS = global.CDBVS;
  // Modal implementations live in focused modules. Keep this entry point so
  // older loaders and extensions can continue to include the modal namespace.
  if (!CDBVS.modalState) CDBVS.modalState = { active: null };
})(window);
