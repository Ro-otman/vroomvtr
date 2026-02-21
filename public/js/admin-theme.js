(() => {
  const STORAGE_KEY = "admin_theme";
  const DARK_CLASS = "admin-theme-dark";
  const toggleBtn = document.querySelector("[data-admin-theme-toggle]");
  if (!toggleBtn) return;

  const applyTheme = (mode) => {
    const darkMode = mode !== "light";
    document.body.classList.toggle(DARK_CLASS, darkMode);
    toggleBtn.setAttribute("aria-pressed", darkMode ? "true" : "false");
    toggleBtn.setAttribute(
      "title",
      darkMode ? "Passer en mode clair" : "Passer en mode sombre",
    );
    const icon = toggleBtn.querySelector(".bx");
    if (icon) {
      icon.className = darkMode ? "bx bx-sun" : "bx bx-moon";
    }
  };

  const savedTheme = localStorage.getItem(STORAGE_KEY);
  applyTheme(savedTheme === "dark" ? "dark" : "light");

  toggleBtn.addEventListener("click", () => {
    const isDark = document.body.classList.contains(DARK_CLASS);
    const nextTheme = isDark ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  });
})();
