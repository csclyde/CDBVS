// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;

  if (typeof CDBVS.setStatus !== "function") {
    CDBVS.setStatus = function (message, error) {
      const status = document.getElementById("status");
      if (!status) return;
      status.textContent = message || "";
      status.className = error ? "status error" : "status";
    };
  }
})(window);
