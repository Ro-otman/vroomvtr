const socket = typeof io !== "undefined" ? io() : null;
const list = document.querySelector(".conversation-list");
const chatBody = document.querySelector(".chat-body");
const chatForm = document.querySelector(".chat-input");
const chatHeaderName = document.querySelector(".chat-header .chat-user strong");
const chatHeaderSub = document.querySelector(".chat-header .chat-user .conversation-sub");
const chatHeaderAvatar = document.querySelector(".chat-header .chat-user .conversation-avatar");
const chatHeaderCar = document.querySelector(".chat-header .chat-car-preview");
const messagesPage = document.querySelector(".messages-page");
const chatBack = document.querySelector(".chat-back");

let currentConversationId = chatBody?.dataset.conversationId || null;
let currentCarId = chatBody?.dataset.carId || null;
let currentVendorId = chatBody?.dataset.vendorId || null;

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
    typingEl = document.createElement("div");
    typingEl.className = "chat-msg from typing-indicator";
    typingEl.innerHTML = "<span></span><span></span><span></span>";
  }
  if (!typingEl.isConnected) {
    chatBody.appendChild(typingEl);
  }
  scrollChatToBottom();
};
const hideTyping = () => {
  if (typingEl && typingEl.isConnected) typingEl.remove();
};

const normalizeBadges = () => {
  if (!list) return;
  list.querySelectorAll(".conversation-item").forEach((item) => {
    const badge = item.querySelector(".unread-badge");
    if (!badge) return;
    const countAttr = parseInt(item.dataset.unread || "0", 10) || 0;
    const count = parseInt(badge.textContent || "0", 10) || countAttr;
    badge.textContent = String(count);
    if (count <= 0) {
      badge.textContent = "0";
      badge.hidden = true;
    }
  });
};

const markUnread = (item) => {
  if (!item) return;
  item.classList.add("is-unread");
  const badge = item.querySelector(".unread-badge");
  if (!badge) return;
  const count = parseInt(badge.textContent || "0", 10) || 0;
  const next = count + 1;
  badge.textContent = String(next);
  item.dataset.unread = String(next);
  badge.hidden = count + 1 <= 0;
};

const clearUnread = (item) => {
  if (!item) return;
  item.classList.remove("is-unread");
  const badge = item.querySelector(".unread-badge");
  if (!badge) return;
  badge.textContent = "0";
  badge.hidden = true;
  item.dataset.unread = "0";
};

if (socket && chatBody) {
  socket.on("vendor:message", (payload) => {
    if (!payload?.message) return;
    const bubble = document.createElement("div");
    bubble.className = "chat-msg from";
    bubble.textContent = payload.message;
    if (payload.conversationId && payload.conversationId === currentConversationId) {
      chatBody.appendChild(bubble);
      scrollChatToBottom();
    }
    hideTyping();

    if (list) {
      const item = list.querySelector(
        `[data-conversation-id="${payload.conversationId}"]`,
      );
      if (item && payload.conversationId !== currentConversationId) {
        markUnread(item);
      }
      const last = item?.querySelector(".last-message");
      if (last) last.textContent = payload.message;
    }
  });

  socket.on("vendor:typing", (payload) => {
    if (!payload?.conversationId) return;
    if (payload.conversationId !== currentConversationId) return;
    if (payload?.typing) {
      showTyping();
    } else {
      hideTyping();
    }
  });
}

if (chatForm && socket) {
  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = chatForm.querySelector("input");
    const message = input?.value?.trim();
    if (!message || !currentCarId) return;

    socket.emit("user:message", {
      carId: currentCarId,
      vendorId: currentVendorId,
      message,
    });

    const bubble = document.createElement("div");
    bubble.className = "chat-msg to";
    bubble.textContent = message;
    chatBody?.appendChild(bubble);
    scrollChatToBottom();
    input.value = "";
    if (socket) {
      socket.emit("user:typing", { carId: currentCarId, typing: false });
    }
    typingActive = false;
  });

  const inputEl = chatForm.querySelector("input");
  if (inputEl && socket) {
    inputEl.addEventListener("input", () => {
      if (!currentCarId) return;
      if (!typingActive) {
        socket.emit("user:typing", { carId: currentCarId, typing: true });
        typingActive = true;
      }
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        socket.emit("user:typing", { carId: currentCarId, typing: false });
        typingActive = false;
      }, 900);
    });
    inputEl.addEventListener("blur", () => {
      if (typingActive) {
        socket.emit("user:typing", { carId: currentCarId, typing: false });
        typingActive = false;
      }
    });
  }
}

if (list && chatBody && chatForm) {
  normalizeBadges();
  list.addEventListener("click", (e) => {
    const item = e.target.closest(".conversation-item");
    if (!item || item.classList.contains("empty")) return;
    const convoId = item.dataset.conversationId;
    const carId = item.dataset.carId;
    const vendorId = item.dataset.vendorId;
    const vendorAvatar = item.dataset.vendorAvatar;
    if (!convoId) return;

    currentConversationId = convoId;
    currentCarId = carId || currentCarId;
    currentVendorId = vendorId || currentVendorId;
    chatBody.dataset.conversationId = convoId;
    chatBody.dataset.carId = currentCarId || "";
    chatBody.dataset.vendorId = currentVendorId || "";
    chatForm.dataset.carId = currentCarId || "";
    chatForm.dataset.vendorId = currentVendorId || "";

    list.querySelectorAll(".conversation-item").forEach((li) => {
      li.classList.remove("is-active");
    });
    item.classList.add("is-active");
    clearUnread(item);
    if (messagesPage && window.innerWidth <= 768) {
      messagesPage.classList.add("chat-open");
      document.body.classList.add("messages-chat-open");
    }

    fetch(`/messages/${convoId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data?.ok) return;
        if (chatHeaderName) {
          const name = data.vendor?.name || "Vendeur";
          chatHeaderName.innerHTML = `${name} <i class="bx bxs-badge-check verified"></i>`;
        }
        if (chatHeaderSub) chatHeaderSub.textContent = data.car?.label || "";
        if (chatHeaderAvatar) {
          chatHeaderAvatar.innerHTML = "";
          if (data.vendor?.avatar) {
            const img = document.createElement("img");
            img.src = data.vendor.avatar;
            img.alt = `Avatar ${data.vendor?.name || "Vendeur"}`;
            chatHeaderAvatar.appendChild(img);
          } else {
            chatHeaderAvatar.textContent = (data.vendor?.name || "V")[0].toUpperCase();
          }
        }
        if (chatHeaderCar) {
          chatHeaderCar.innerHTML = "";
          if (data.car?.image) {
            const img = document.createElement("img");
            img.src = data.car.image;
            img.alt = "Photo véhicule";
            chatHeaderCar.appendChild(img);
          }
        }

        if (chatBody) {
          chatBody.innerHTML = "";
          (data.messages || []).forEach((m) => {
            const bubble = document.createElement("div");
            bubble.className = `chat-msg ${m.sender === "user" ? "to" : "from"}`;
            bubble.textContent = m.content;
            chatBody.appendChild(bubble);
          });
          if (!data.messages?.length) {
            const empty = document.createElement("div");
            empty.className = "chat-msg from";
            empty.textContent = "Aucun message pour le moment.";
            chatBody.appendChild(empty);
          }
          scrollChatToBottom();
          hideTyping();
        }
      })
      .catch(() => {});
  });
}

if (chatBack && messagesPage) {
  chatBack.addEventListener("click", () => {
    messagesPage.classList.remove("chat-open");
    document.body.classList.remove("messages-chat-open");
  });
}
