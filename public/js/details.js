(() => {
const items = Array.from(document.querySelectorAll('.photo-item'));
const lightbox = document.querySelector('.lightbox');
const lightboxImg = document.querySelector('.lightbox-img');
const btnPrev = document.querySelector('.lightbox-nav.prev');
const btnNext = document.querySelector('.lightbox-nav.next');
const btnClose = document.querySelector('.lightbox-close');
const chatToggle = document.querySelector('.chat-toggle');
const chatModal = document.querySelector('.chat-modal');
const chatClose = document.querySelector('.chat-close');
const chatForm = document.querySelector('.chat-input');
const chatBody = document.querySelector('.chat-body');
const reserveToggle = document.querySelector('.reserve-toggle');
const reserveModal = document.querySelector('.reserve-modal');
const reserveClose = document.querySelector('.reserve-close');
const reserveForm = document.querySelector('.reserve-form');
const reserveNotice = document.querySelector('.reserve-notice');
const reserveNoticeText = reserveNotice?.querySelector('.reserve-notice__text');
const reserveNoticeIcon = reserveNotice?.querySelector('.reserve-notice__icon');
const reserveNoticeClose = reserveNotice?.querySelector('.reserve-notice__close');
const userOrderToggle = document.querySelector('.user-menu .user-toggle');
const socket = typeof io !== 'undefined' ? io() : null;
let activeConversationId = chatForm?.dataset.conversationId || '';
const scrollChatToBottom = () => {
  if (!chatBody) return;
  chatBody.scrollTop = chatBody.scrollHeight;
};
let typingTimer = null;
let typingActive = false;
let typingEl = null;
const showTyping = () => {
  if (!chatBody) return;
  if (!typingEl) {
    typingEl = document.createElement('div');
    typingEl.className = 'chat-msg from typing-indicator';
    typingEl.innerHTML = '<span></span><span></span><span></span>';
  }
  if (!typingEl.isConnected) {
    chatBody.appendChild(typingEl);
  }
  scrollChatToBottom();
};
const hideTyping = () => {
  if (typingEl && typingEl.isConnected) typingEl.remove();
};

let reserveNoticeTimer = null;
const hideReserveNotice = () => {
  if (!reserveNotice) return;
  reserveNotice.classList.remove('show');
  setTimeout(() => {
    if (!reserveNotice.classList.contains('show')) {
      reserveNotice.hidden = true;
    }
  }, 220);
};

const showReserveNotice = (message, type = 'success') => {
  if (!reserveNotice || !reserveNoticeText || !reserveNoticeIcon) return;
  reserveNotice.hidden = false;
  reserveNoticeText.textContent = message;
  reserveNotice.classList.remove('is-success', 'is-error');
  reserveNotice.classList.add(type === 'error' ? 'is-error' : 'is-success');
  reserveNoticeIcon.className =
    type === 'error'
      ? 'bx bx-error-circle reserve-notice__icon'
      : 'bx bx-check-circle reserve-notice__icon';
  requestAnimationFrame(() => reserveNotice.classList.add('show'));
  if (reserveNoticeTimer) clearTimeout(reserveNoticeTimer);
  reserveNoticeTimer = setTimeout(hideReserveNotice, 3500);
};

const highlightOrderToggle = () => {
  if (!userOrderToggle) return;
  userOrderToggle.classList.add('order-attention');
};

const stopHighlightOrderToggle = () => {
  if (!userOrderToggle) return;
  userOrderToggle.classList.remove('order-attention');
};

if (userOrderToggle) {
  userOrderToggle.addEventListener('click', stopHighlightOrderToggle);
}

const copyToClipboard = async (text) => {
  const value = String(text || '').trim();
  if (!value) return false;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const temp = document.createElement('textarea');
  temp.value = value;
  temp.setAttribute('readonly', '');
  temp.style.position = 'absolute';
  temp.style.left = '-9999px';
  document.body.appendChild(temp);
  temp.select();
  const ok = document.execCommand('copy');
  temp.remove();
  return ok;
};

if (reserveNoticeClose) {
  reserveNoticeClose.addEventListener('click', hideReserveNotice);
}

const params = new URLSearchParams(window.location.search);
if (params.get('reservation_success') === '1') {
  showReserveNotice(
    "Reservation enregistrée. Appuyez sur l'icone profil pour voir la commande en cours.",
    'success',
  );
  highlightOrderToggle();
  params.delete('reservation_success');
  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
  window.history.replaceState({}, '', nextUrl);
}

document.addEventListener('click', async (event) => {
  const copyBtn = event.target.closest('.copy-bank-btn');
  if (!copyBtn) return;

  const value = copyBtn.dataset.copyValue || '';
  const label = copyBtn.dataset.copyLabel || 'Valeur';

  try {
    const ok = await copyToClipboard(value);
    if (!ok) throw new Error('copy_failed');

    const oldText = copyBtn.textContent;
    copyBtn.textContent = 'Copie';
    copyBtn.classList.add('is-copied');
    showReserveNotice(`${label} copie dans le presse-papiers`, 'success');

    setTimeout(() => {
      copyBtn.textContent = oldText || 'Copier';
      copyBtn.classList.remove('is-copied');
    }, 1200);
  } catch {
    showReserveNotice(`Impossible de copier ${label.toLowerCase()}`, 'error');
  }
});

if (items.length && lightbox && lightboxImg && btnPrev && btnNext && btnClose) {
  const sources = items.map((item) => item.dataset.full || item.querySelector('img')?.src);
  let current = 0;
  let lightboxReturnFocusEl = null;

  lightbox.setAttribute('inert', '');

  const open = (index, triggerEl = null) => {
    current = index;
    lightboxImg.src = sources[current];
    if (triggerEl instanceof HTMLElement) {
      lightboxReturnFocusEl = triggerEl;
    } else if (document.activeElement instanceof HTMLElement) {
      lightboxReturnFocusEl = document.activeElement;
    } else {
      lightboxReturnFocusEl = null;
    }
    lightbox.removeAttribute('inert');
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      btnClose.focus();
    });
  };

  const close = () => {
    if (document.activeElement instanceof HTMLElement && lightbox.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
    lightbox.setAttribute('inert', '');
    if (lightboxReturnFocusEl && typeof lightboxReturnFocusEl.focus === 'function') {
      requestAnimationFrame(() => {
        lightboxReturnFocusEl.focus();
      });
    }
    lightboxReturnFocusEl = null;
  };

  const show = (dir) => {
    current = (current + dir + sources.length) % sources.length;
    lightboxImg.src = sources[current];
  };

  items.forEach((item, index) => {
    item.addEventListener('click', () => open(index, item));
  });

  btnPrev.addEventListener('click', () => show(-1));
  btnNext.addEventListener('click', () => show(1));
  btnClose.addEventListener('click', close);

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) close();
  });

  document.addEventListener('keydown', (e) => {
    if (lightbox.classList.contains('open')) {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(-1);
      if (e.key === 'ArrowRight') show(1);
    }
  });
}

if (chatToggle && chatModal && chatClose && chatForm) {
  const openChat = () => {
    chatModal.classList.add('open');
    chatModal.setAttribute('aria-hidden', 'false');
    chatForm.querySelector('input')?.focus();
  };

  const closeChat = () => {
    chatModal.classList.remove('open');
    chatModal.setAttribute('aria-hidden', 'true');
  };

  chatToggle.addEventListener('click', openChat);
  chatClose.addEventListener('click', closeChat);

  chatModal.addEventListener('click', (e) => {
    if (e.target === chatModal) closeChat();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeChat();
  });

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = chatForm.querySelector('input');
    const message = input?.value?.trim();
    if (!message) return;

    const userName = chatForm.dataset.userName || 'Visiteur';
    const userEmail = chatForm.dataset.userEmail || '';
    const carId = chatForm.dataset.carId;
    const vendorId = chatForm.dataset.vendorId;

    if (socket) {
      socket.emit('user:message', {
        from: userName,
        email: userEmail,
        carId,
        vendorId,
        message,
      });
    }

    const bubble = document.createElement('div');
    bubble.className = 'chat-msg to';
    bubble.textContent = message;
    chatBody?.appendChild(bubble);
    scrollChatToBottom();
    input.value = '';
    if (socket) {
      socket.emit('user:typing', { carId, typing: false });
    }
    typingActive = false;
  });

  const inputEl = chatForm.querySelector('input');
  if (inputEl && socket) {
    const carId = chatForm.dataset.carId;
    inputEl.addEventListener('input', () => {
      if (!typingActive) {
        socket.emit('user:typing', { carId, typing: true });
        typingActive = true;
      }
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        socket.emit('user:typing', { carId, typing: false });
        typingActive = false;
      }, 900);
    });
    inputEl.addEventListener('blur', () => {
      if (typingActive) {
        socket.emit('user:typing', { carId, typing: false });
        typingActive = false;
      }
    });
  }
}

if (socket && chatBody) {
  socket.on('user:message:ack', (payload) => {
    if (!payload?.conversationId) return;
    activeConversationId = payload.conversationId;
    if (chatForm) chatForm.dataset.conversationId = activeConversationId;
  });

  socket.on('vendor:message', (payload) => {
    if (!payload?.message) return;
    if (!payload?.conversationId) return;
    if (activeConversationId && payload.conversationId !== activeConversationId) return;
    if (!activeConversationId) {
      activeConversationId = payload.conversationId;
      if (chatForm) chatForm.dataset.conversationId = activeConversationId;
    }
    const bubble = document.createElement('div');
    bubble.className = 'chat-msg from';
    bubble.textContent = payload.message;
    chatBody.appendChild(bubble);
    scrollChatToBottom();
    hideTyping();
  });

  socket.on('vendor:typing', (payload) => {
    if (!payload?.conversationId) return;
    if (!activeConversationId || payload.conversationId !== activeConversationId) return;
    if (payload?.typing) {
      showTyping();
    } else {
      hideTyping();
    }
  });
}

if (reserveToggle && reserveModal && reserveClose && reserveForm) {
  const prevBtn = reserveForm.querySelector('.reserve-prev');
  const nextBtn = reserveForm.querySelector('.reserve-next');
  const submitBtn = reserveForm.querySelector('.reserve-submit');
  const steps = Array.from(reserveForm.querySelectorAll('.reserve-step'));
  const totalSteps = steps.length;
  const paymentRadios = reserveForm.querySelectorAll('input[name="payment_method"]');
  const bankFields = reserveForm.querySelector('.payment-bank');
  const paypalFields = reserveForm.querySelector('.payment-paypal');
  const proofHint = reserveForm.querySelector('[data-proof-hint]');
  let currentStep = 1;

  const openReserve = () => {
    setStep(1);
    updatePaymentFields();
    reserveModal.classList.add('open');
    reserveModal.setAttribute('aria-hidden', 'false');
  };

  const closeReserve = () => {
    reserveModal.classList.remove('open');
    reserveModal.setAttribute('aria-hidden', 'true');
  };

  const setStep = (step) => {
    currentStep = step;
    steps.forEach((pane) => {
      pane.classList.toggle('is-active', Number(pane.dataset.step) === step);
    });
    prevBtn.hidden = step === 1;
    nextBtn.hidden = step === totalSteps;
    submitBtn.hidden = step !== totalSteps;
  };

  const validateStep1 = () => {
    const country = reserveForm.querySelector('select[name="country"]');
    const address = reserveForm.querySelector('input[name="address"]');
    const city = reserveForm.querySelector('input[name="city"]');
    const postalCode = reserveForm.querySelector('input[name="postal_code"]');
    return (
      country.value.trim() &&
      address.value.trim() &&
      city.value.trim() &&
      postalCode.value.trim()
    );
  };

  const updatePaymentFields = () => {
    const selected = reserveForm.querySelector('input[name="payment_method"]:checked')?.value;
    bankFields?.classList.toggle('is-active', selected === 'bank');
    paypalFields?.classList.toggle('is-active', selected === 'paypal');
    if (proofHint) {
      proofHint.textContent =
        selected === 'bank'
          ? 'Ajoutez la capture du virement bancaire realise.'
          : selected === 'paypal'
            ? 'Ajoutez la capture du paiement PayPal realise.'
            : 'Ajoutez la capture de votre preuve de paiement pour continuer.';
    }
  };

  const validateStep2 = () =>
    Boolean(reserveForm.querySelector('input[name="payment_method"]:checked'));

  const validateStep3 = () => {
    const proofInput = reserveForm.querySelector('input[name="payment_proof"]');
    return Boolean(proofInput?.files?.length);
  };

  reserveToggle.addEventListener('click', openReserve);
  reserveClose.addEventListener('click', closeReserve);

  reserveModal.addEventListener('click', (e) => {
    if (e.target === reserveModal) closeReserve();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeReserve();
  });

  nextBtn.addEventListener('click', () => {
    if (currentStep === 1 && !validateStep1()) return;
    if (currentStep === 2 && !validateStep2()) {
      showReserveNotice('Choisissez un moyen de paiement', 'error');
      return;
    }
    setStep(Math.min(totalSteps, currentStep + 1));
  });

  prevBtn.addEventListener('click', () => {
    setStep(Math.max(1, currentStep - 1));
  });

  paymentRadios.forEach((radio) => {
    radio.addEventListener('change', updatePaymentFields);
  });

  reserveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const selected = reserveForm.querySelector('input[name="payment_method"]:checked');
    const proofInput = reserveForm.querySelector('input[name="payment_proof"]');
    const proofFile = proofInput?.files?.[0];

    if (!selected || !validateStep1() || !validateStep2() || !validateStep3()) {
      showReserveNotice('Veuillez completer toutes les étapes avant confirmation', 'error');
      return;
    }

    const payload = new FormData();
    payload.append('car_id', reserveForm.dataset.carId || '');
    payload.append('country', reserveForm.querySelector('select[name="country"]')?.value?.trim() || '');
    payload.append('address', reserveForm.querySelector('input[name="address"]')?.value?.trim() || '');
    payload.append('city', reserveForm.querySelector('input[name="city"]')?.value?.trim() || '');
    payload.append('postal_code', reserveForm.querySelector('input[name="postal_code"]')?.value?.trim() || '');
    payload.append('payment_method', selected.value);
    if (proofFile) payload.append('payment_proof', proofFile);

    try {
      const resp = await fetch('/reservations', {
        method: 'POST',
        credentials: 'same-origin',
        body: payload,
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) {
        showReserveNotice(data.message || 'Impossible d\'enregistrer la reservation', 'error');
        return;
      }

      showReserveNotice('Reservation enregistrée avec succes', 'success');
      closeReserve();
      const url = new URL(window.location.href);
      url.searchParams.set('reservation_success', '1');
      window.location.assign(url.toString());
    } catch {
      showReserveNotice('Erreur reseau, veuillez reessayer', 'error');
    }
  });

  updatePaymentFields();
  setStep(1);
}
})();

