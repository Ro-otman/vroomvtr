const socket = typeof io !== "undefined" ? io() : null;
const userList = document.querySelector(".user-list");
const chatBody = document.querySelector(".chat-body");
const chatForm = document.querySelector(".chat-input");
const chatHeaderName = document.querySelector(".chat-header .chat-user strong");
const chatHeaderEmail = document.querySelector(".chat-header .chat-user span");
const chatHeaderAvatar = document.querySelector(".chat-header .chat-user .user-avatar");
const adminMessages = document.querySelector(".admin-messages");
const chatBack = document.querySelector(".chat-back");
let currentConversationId = chatBody?.dataset.conversationId || null;
let currentUserId =
  chatBody?.dataset.userId || chatForm?.dataset.userId || null;
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
  if (!userList) return;
  userList.querySelectorAll(".user-item").forEach((item) => {
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
  badge.hidden = next <= 0;
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

if (socket) {
  socket.emit("admin:join");

  socket.on("admin:message", (payload) => {
    if (!payload?.message) return;
    currentUserId = payload.userId || currentUserId;

    if (chatBody) {
      const bubble = document.createElement("div");
      bubble.className = "chat-msg from";
      bubble.textContent = payload.message;
      if (payload.conversationId && payload.conversationId === currentConversationId) {
        chatBody.appendChild(bubble);
        scrollChatToBottom();
        hideTyping();
      }
    }

    if (userList) {
      const existing = userList.querySelector(
        `[data-conversation-id="${payload.conversationId}"]`,
      );
      if (!existing) {
        const li = document.createElement("li");
        li.className = "user-item";
        li.dataset.conversationId = payload.conversationId;
        li.dataset.userId = payload.userId;
        li.dataset.unread = "0";
        li.innerHTML = `
          <div class="user-avatar">${(payload.from || "US")
            .split(" ")
            .map((p) => p[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}</div>
          <div>
            <strong>${payload.from || "Utilisateur"}</strong>
            <div class="last-row">
              <span class="last-message">${payload.message}</span>
              <span class="unread-badge" hidden>0</span>
            </div>
          </div>
        `;
        userList.prepend(li);
        if (payload.conversationId !== currentConversationId) {
          markUnread(li);
        }
      } else {
        const span = existing.querySelector(".last-message");
        if (span) span.textContent = payload.message;
        if (payload.conversationId !== currentConversationId) {
          markUnread(existing);
        }
      }
    }
  });

  socket.on("admin:typing", (payload) => {
    if (!payload?.conversationId) return;
    if (payload.conversationId !== currentConversationId) return;
    if (payload.typing) {
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
    if (!message || !currentUserId) return;

    socket.emit("admin:message", {
      userId: currentUserId,
      conversationId: currentConversationId,
      message,
    });

    const bubble = document.createElement("div");
    bubble.className = "chat-msg to";
    bubble.textContent = message;
    chatBody?.appendChild(bubble);
    scrollChatToBottom();
    input.value = "";
    if (socket) {
      socket.emit("admin:typing", {
        userId: currentUserId,
        conversationId: currentConversationId,
        typing: false,
      });
    }
    typingActive = false;
  });

  const inputEl = chatForm.querySelector("input");
  if (inputEl && socket) {
    inputEl.addEventListener("input", () => {
      if (!currentUserId || !currentConversationId) return;
      if (!typingActive) {
        socket.emit("admin:typing", {
          userId: currentUserId,
          conversationId: currentConversationId,
          typing: true,
        });
        typingActive = true;
      }
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        socket.emit("admin:typing", {
          userId: currentUserId,
          conversationId: currentConversationId,
          typing: false,
        });
        typingActive = false;
      }, 900);
    });
    inputEl.addEventListener("blur", () => {
      if (typingActive) {
        socket.emit("admin:typing", {
          userId: currentUserId,
          conversationId: currentConversationId,
          typing: false,
        });
        typingActive = false;
      }
    });
  }
}

if (userList && chatBody && chatForm) {
  normalizeBadges();
  userList.addEventListener("click", (e) => {
    const item = e.target.closest(".user-item");
    if (!item) return;
    const convoId = item.dataset.conversationId;
    const userId = item.dataset.userId;
    if (!convoId) return;
    currentConversationId = convoId;
    currentUserId = userId || currentUserId;
    chatBody.dataset.conversationId = convoId;
    chatForm.dataset.conversationId = convoId;
    chatForm.dataset.userId = userId || "";
    chatBody.dataset.userId = userId || "";

    userList.querySelectorAll(".user-item").forEach((li) => {
      li.classList.remove("is-active");
    });
    item.classList.add("is-active");
    clearUnread(item);
    if (adminMessages && window.innerWidth <= 768) {
      adminMessages.classList.add("chat-open");
      document.body.classList.add("admin-chat-open");
    }

    fetch(`/admin/messages/${convoId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data?.ok) return;
        currentUserId = data.user?.id || currentUserId;
        chatForm.dataset.userId = currentUserId || "";
        chatBody.dataset.userId = currentUserId || "";

        if (chatHeaderName) {
          chatHeaderName.textContent = `${data.user?.first_name || ""} ${data.user?.last_name || ""}`.trim() || "Utilisateur";
        }
        if (chatHeaderEmail) {
          chatHeaderEmail.textContent = data.user?.email || "";
        }
        if (chatHeaderAvatar) {
          const initials = `${(data.user?.first_name || "U")[0]}${(data.user?.last_name || "S")[0]}`
            .toUpperCase();
          chatHeaderAvatar.textContent = initials;
        }

        if (chatBody) {
          chatBody.innerHTML = "";
          (data.messages || []).forEach((m) => {
            const bubble = document.createElement("div");
            bubble.className = `chat-msg ${m.sender === "user" ? "from" : "to"}`;
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

if (chatBack && adminMessages) {
  chatBack.addEventListener("click", () => {
    adminMessages.classList.remove("chat-open");
    document.body.classList.remove("admin-chat-open");
  });
}
