(() => {
  const dashboardSocket = typeof io !== "undefined" ? io() : null;

  const formatInt = (value) => Number(value || 0).toLocaleString("fr-FR");
  const formatPercent = (value) => `${Number(value || 0)}%`;
  const esc = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const modalRoot = document.getElementById("dashboard-code-modal");
  const modalSubtitle = document.getElementById("code-modal-subtitle");
  const modalSteps = document.getElementById("code-modal-steps");
  const listRoot = document.getElementById("dashboard-codes-list");

  const closeCodeModal = () => {
    if (!modalRoot) return;
    modalRoot.classList.add("is-hidden");
    modalRoot.setAttribute("aria-hidden", "true");
    if (modalSteps) modalSteps.innerHTML = "";
  };

  const codeStepMarkup = (label, code, pendingText) => {
    const value = String(code || "").trim();
    const isPending = !value;
    const shown = isPending ? pendingText : value;
    return `
      <article class="code-step-item">
        <div>
          <p class="code-step-label">${esc(label)}</p>
          <p class="code-step-value ${isPending ? "is-pending" : ""}">${esc(shown)}</p>
        </div>
        <button
          type="button"
          class="copy-code-btn ${isPending ? "is-disabled" : ""}"
          ${isPending ? "disabled" : ""}
          data-copy-code="${isPending ? "" : esc(value)}"
        >
          ${isPending ? "Indisponible" : "Copier le code"}
        </button>
      </article>
    `;
  };

  const openCodeModalFromItem = (item) => {
    if (!item || !modalRoot || !modalSteps || !modalSubtitle) return;

    const orderShort = item.getAttribute("data-order-short") || "-";
    const user = item.getAttribute("data-user") || "Utilisateur";
    const car = item.getAttribute("data-car") || "";
    const code1 = item.getAttribute("data-code1") || "";
    const code2 = item.getAttribute("data-code2") || "";
    const code3 = item.getAttribute("data-code3") || "";

    modalSubtitle.textContent = `Commande #${orderShort} - ${user} - ${car}`;
    modalSteps.innerHTML = [
      codeStepMarkup("Etape 3 - Code #1", code1, "En attente"),
      codeStepMarkup("Etape 4 - Code #2", code2, "En attente étape 3"),
      codeStepMarkup("Etape 5 - Code #3", code3, "En attente étape 4"),
    ].join("");

    modalRoot.classList.remove("is-hidden");
    modalRoot.setAttribute("aria-hidden", "false");
  };

  const renderTimeline = (items) => {
    const root = document.getElementById("dashboard-timeline");
    if (!root) return;

    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      root.innerHTML = `
        <li>
          <span class="dot"></span>
          <div>
            <p>Aucune activite recente</p>
            <small>En attente d'evenements</small>
          </div>
        </li>
      `;
      return;
    }

    root.innerHTML = list
      .map(
        (item) => `
        <li>
          <span class="dot ${item.tone || ""}"></span>
          <div>
            <p>${item.text || ""}</p>
            <small>${item.time || ""}</small>
          </div>
        </li>
      `,
      )
      .join("");
  };

  const renderVerificationCodes = (items) => {
    const listRoot = document.getElementById("dashboard-codes-list");
    const emptyRoot = document.getElementById("dashboard-codes-empty");
    if (!listRoot || !emptyRoot) return;

    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      listRoot.classList.add("is-hidden");
      emptyRoot.classList.remove("is-hidden");
      listRoot.innerHTML = "";
      return;
    }

    emptyRoot.classList.add("is-hidden");
    listRoot.classList.remove("is-hidden");
    listRoot.innerHTML = list
      .map((row) => {
        const code2 = row.code_step4 || "En attente étape 3";
        const code3 = row.code_step5 || "En attente étape 4";
        const pending2 = row.code_step4 ? "" : "is-pending";
        const pending3 = row.code_step5 ? "" : "is-pending";
        const orderId = esc(String(row.order_id || "").slice(0, 8).toUpperCase());
        const userName = esc(
          `${row.user_first_name || ""} ${row.user_last_name || ""}`.trim() ||
            "Utilisateur",
        );
        const userEmail = esc(row.user_email || "-");
        const carLabel = esc(
          `${row.brand || ""} ${row.model || ""} ${row.year || ""}`.trim(),
        );
        const step1 = esc(row.code_step3 || "");
        return `
          <article
            class="verification-item"
            role="button"
            tabindex="0"
            data-order-short="${orderId}"
            data-user="${userName} (${userEmail})"
            data-car="${carLabel}"
            data-code1="${step1}"
            data-code2="${esc(row.code_step4 || "")}"
            data-code3="${esc(row.code_step5 || "")}"
          >
            <div class="verification-main">
              <p class="verification-order">#${orderId}</p>
              <p class="verification-user">${userName} (${userEmail})</p>
              <p class="verification-car">${carLabel}</p>
            </div>
            <div class="verification-codes">
              <span class="code-pill">#1 <strong>${step1}</strong></span>
              <span class="code-pill">#2 <strong class="${pending2}">${esc(code2)}</strong></span>
              <span class="code-pill">#3 <strong class="${pending3}">${esc(code3)}</strong></span>
            </div>
          </article>
        `;
      })
      .join("");
  };

  const updateDashboard = (payload) => {
    if (!payload || typeof payload !== "object") return;

    const kpi = payload.kpi || {};
    const setText = (key, value) => {
      const el = document.querySelector(`[data-kpi="${key}"]`);
      if (el) el.textContent = value;
    };

    setText("salesToday", formatInt(kpi.salesToday));
    setText("pendingOrders", formatInt(kpi.pendingOrders));
    setText("unreadMessages", formatInt(kpi.unreadMessages));
    setText("activeUsers", formatInt(kpi.activeUsers));
    setText("conversionRate", formatPercent(kpi.conversionRate));
    setText("supportRate", formatPercent(kpi.supportRate));
    setText("uptimeRate", formatPercent(kpi.uptimeRate));

    const pendingMeta = document.querySelector(
      '[data-kpi-meta="pendingOrders"]',
    );
    if (pendingMeta)
      pendingMeta.textContent = `${formatInt(kpi.pendingOrders)} a confirmer`;

    ["conversionRate", "supportRate", "uptimeRate"].forEach((key) => {
      const bar = document.querySelector(`[data-kpi-bar="${key}"]`);
      if (bar) {
        const val = Number(kpi[key] || 0);
        const clamped = Math.max(0, Math.min(100, val));
        bar.style.width = `${clamped}%`;
      }
    });

    renderTimeline(payload.recentActivity);
    renderVerificationCodes(payload.verificationCodes);
  };

  if (dashboardSocket) {
    dashboardSocket.emit("admin:join");
    dashboardSocket.on("dashboard:update", updateDashboard);
  }

  if (listRoot) {
    listRoot.addEventListener("click", (event) => {
      const item = event.target.closest(".verification-item");
      if (!item) return;
      openCodeModalFromItem(item);
    });

    listRoot.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const item = event.target.closest(".verification-item");
      if (!item) return;
      event.preventDefault();
      openCodeModalFromItem(item);
    });
  }

  if (modalRoot) {
    modalRoot.addEventListener("click", async (event) => {
      const closeBtn = event.target.closest("[data-code-modal-close]");
      if (closeBtn) {
        closeCodeModal();
        return;
      }

      const copyBtn = event.target.closest(".copy-code-btn");
      if (!copyBtn || copyBtn.disabled) return;

      const code = copyBtn.getAttribute("data-copy-code") || "";
      if (!code) return;

      try {
        await navigator.clipboard.writeText(code);
        copyBtn.textContent = "Copie";
        setTimeout(() => {
          copyBtn.textContent = "Copier le code";
        }, 1300);
      } catch {
        copyBtn.textContent = "Echec copie";
        setTimeout(() => {
          copyBtn.textContent = "Copier le code";
        }, 1300);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modalRoot.classList.contains("is-hidden")) {
        closeCodeModal();
      }
    });
  }
})();
