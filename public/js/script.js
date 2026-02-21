(() => {
const header = document.querySelector("header");
const searchToggle = document.querySelector(".search-toggle");
const searchInput = document.querySelector(".rech input");
const searchOverlay = document.querySelector(".search-overlay");
const filtersToggle = document.querySelector(".filters-toggle");
const filtersOverlay = document.querySelector(".filters-overlay");
const userMenu = document.querySelector(".user-menu");
const userToggle = document.querySelector(".user-toggle");
const msgFab = document.querySelector(".msg-fab");
const chatToggleGlobal = document.querySelector(".chat-toggle");
const hideFab = document.querySelector("[data-hide-fab]");
const msgBadge = document.querySelector(".msg-badge");
const socket = typeof io !== "undefined" ? io() : null;

if (header && searchToggle && searchInput) {
  const openSearch = () => {
    header.classList.add("search-open");
    requestAnimationFrame(() => searchInput.focus());
  };

  const closeSearch = () => {
    header.classList.remove("search-open");
  };

  searchToggle.addEventListener("click", () => {
    if (header.classList.contains("search-open")) {
      closeSearch();
    } else {
      openSearch();
    }
  });

  document.addEventListener("click", (event) => {
    const isClickInside = header.contains(event.target);
    if (!isClickInside) {
      closeSearch();
    }
  });

  if (searchOverlay) {
    searchOverlay.addEventListener("click", () => {
      closeSearch();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSearch();
    }
  });
}

if (filtersToggle && filtersOverlay) {
  const openFilters = () => document.body.classList.add("filters-open");
  const closeFilters = () => document.body.classList.remove("filters-open");

  filtersToggle.addEventListener("click", () => {
    document.body.classList.toggle("filters-open");
  });

  filtersOverlay.addEventListener("click", closeFilters);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeFilters();
  });
}

document.querySelectorAll(".fav").forEach((fav) => {
  fav.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const carId = fav.dataset.carId;
    if (!carId) return;

    const isActive = fav.classList.contains("is-active");
    const method = isActive ? "DELETE" : "POST";

    try {
      const res = await fetch(`/favorites/${carId}`, {
        method,
        credentials: "include",
        headers: { "X-Requested-With": "fetch" },
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      if (data.action === "added") {
        fav.classList.add("is-active");
      } else if (data.action === "removed") {
        fav.classList.remove("is-active");
      } else {
        fav.classList.toggle("is-active");
      }
    } catch {
      // ignore
    }
  });
});

if (userMenu && userToggle) {
  userToggle.addEventListener("click", (event) => {
    event.preventDefault();
    userMenu.classList.toggle("open");
    const expanded = userMenu.classList.contains("open");
    userToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  });

  document.addEventListener("click", (event) => {
    if (!userMenu.contains(event.target)) {
      userMenu.classList.remove("open");
      userToggle.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      userMenu.classList.remove("open");
      userToggle.setAttribute("aria-expanded", "false");
    }
  });
}

if (msgFab && !hideFab) {
  msgFab.addEventListener("click", () => {
    if (chatToggleGlobal) {
      chatToggleGlobal.click();
    } else {
      window.location.href = "/messages";
    }
  });
}

if (socket && msgBadge) {
  socket.on("vendor:message", () => {
    const current = parseInt(msgBadge.textContent || "0", 10) || 0;
    const next = current + 1;
    msgBadge.textContent = String(next);
    msgBadge.hidden = next <= 0;
  });
}
})();

