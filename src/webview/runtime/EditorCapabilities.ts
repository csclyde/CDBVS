// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;

  // Registries are the narrow composition seam between feature modules. A
  // renderer may be implemented by a leaf module without making its callers
  // depend on the ambient CDBVS namespace.
  CDBVS.capabilities = {
    cells: {},
    table: {},
    views: {}
  };
})(window);
