(() => {
  const loader = document.getElementById("site-loader");
  if (!loader) return;

  let isHiding = false;

  const hideLoader = () => {
    if (isHiding) return;
    isHiding = true;
    loader.classList.add("is-hidden");
  };

  const showLoader = () => {
    if (!document.body.contains(loader)) return;
    isHiding = false;
    loader.classList.remove("is-hidden");
  };

  // Expose loader controls for page-specific async flows (e.g. step validation).
  window.__siteLoader = {
    show: showLoader,
    hide: hideLoader,
  };

  if (document.readyState === "complete") {
    hideLoader();
  } else {
    window.addEventListener("load", hideLoader, { once: true });
  }

  window.addEventListener("pageshow", hideLoader);

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    if (event.defaultPrevented) return;
    if (link.target === "_blank") return;
    if (link.hasAttribute("download")) return;
    if (link.origin !== window.location.origin) return;
    if (link.hash && link.pathname === window.location.pathname) return;

    showLoader();
  });

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (event.defaultPrevented) return;
    showLoader();
  });
})();
