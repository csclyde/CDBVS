// @ts-nocheck
(function (global) {
  const CDBVS = global.CDBVS;

  if (typeof CDBVS.setStatus !== "function") {
    CDBVS.setStatus = function (message, error) {
      const modal = CDBVS.modalState && CDBVS.modalState.active;
      const status = modal && modal.querySelector(".modal-status") || document.getElementById("status");
      if (!status) return;
      status.textContent = message || "";
      const isModal = status.classList.contains("modal-status");
      status.className = `${isModal ? "modal-status" : "status"}${error ? " error" : ""}`;
    };
  }
})(window);
