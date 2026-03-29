// ══════════════════════════════════════════════════════════════════
// NemoClaw Dashboard — SPA Router & API Client
// ══════════════════════════════════════════════════════════════════

const NemoClaw = (() => {
  // ── Auth Token Management ───────────────────────────────────────
  function getToken() {
    // Check URL params first (for initial login)
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get("token");
    if (urlToken) {
      sessionStorage.setItem("nc_token", urlToken);
      // Clean the URL
      const clean = window.location.pathname + window.location.hash;
      window.history.replaceState({}, "", clean);
      return urlToken;
    }
    return sessionStorage.getItem("nc_token") || "";
  }

  function setToken(token) {
    sessionStorage.setItem("nc_token", token);
  }

  function authHeaders() {
    const token = getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  // ── Shared Utilities ────────────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── API Client ─────────────────────────────────────────────────
  const api = {
    async get(url) {
      const res = await fetch(url, { headers: authHeaders() });
      if (res.status === 401) return handleUnauthorised();
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
    async post(url, data) {
      const res = await fetch(url, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      if (res.status === 401) return handleUnauthorised();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || `${res.status} ${res.statusText}`);
      }
      return res.json();
    },
    async put(url, data) {
      const res = await fetch(url, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      if (res.status === 401) return handleUnauthorised();
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
    async del(url) {
      const res = await fetch(url, { method: "DELETE", headers: authHeaders() });
      if (res.status === 401) return handleUnauthorised();
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
  };

  let _isUnauthorized = false;

  function handleUnauthorised() {
    _isUnauthorized = true;
    const token = getToken();
    if (token) {
      sessionStorage.removeItem("nc_token");
      toast("Session expired. Please re-enter your dashboard token.", "error");
    }
    showLoginPrompt();
    throw new Error("Unauthorized");
  }

  function showLoginPrompt() {
    const container = document.getElementById("page-container");
    if (!container) return;
    container.innerHTML = `
      <div class="empty-state" style="margin-top:var(--nc-space-3xl)">
        <div class="empty-state__icon">🔐</div>
        <div class="empty-state__title">Authentication Required</div>
        <div class="empty-state__desc">
          Enter the dashboard token from the server console output to continue.
        </div>
        <div style="margin-top:var(--nc-space-lg);max-width:400px;margin-left:auto;margin-right:auto">
          <div class="form-group">
            <label class="form-label">Dashboard Token</label>
            <input class="form-input" id="login-token" type="password" placeholder="Paste your dashboard token..." autocomplete="off">
          </div>
          <button class="btn btn-primary" onclick="NemoClaw._doLogin()" style="width:100%">Authenticate</button>
        </div>
      </div>
    `;
    setTimeout(() => document.getElementById("login-token")?.focus(), 100);
  }

  function _doLogin() {
    const input = document.getElementById("login-token");
    if (!input || !input.value.trim()) return;
    setToken(input.value.trim());
    toast("Authenticating...", "info");
    route();
  }

  // ── Socket.IO ──────────────────────────────────────────────────
  let socket = null;
  function connectSocket() {
    if (socket) return socket;
    socket = io();
    socket.on("connect", () => {
      console.log("[ws] Connected");
      socket.emit("subscribe:status");
      socket.emit("subscribe:policy");
      socket.emit("subscribe:inference");
      updateSystemStatus();
    });
    socket.on("disconnect", () => console.log("[ws] Disconnected"));
    socket.on("sandbox:created", (d) => toast(`Sandbox '${d.name}' created`, "success"));
    socket.on("sandbox:destroyed", (d) => toast(`Sandbox '${d.name}' destroyed`, "info"));
    socket.on("sandbox:started", (d) => toast(`Sandbox '${d.name}' started`, "success"));
    socket.on("sandbox:stopped", (d) => toast(`Sandbox '${d.name}' stopped`, "info"));
    socket.on("policy:applied", (d) => toast(`Policy applied to '${d.sandbox}'`, "success"));
    socket.on("policy:removed", (d) => toast(`Preset '${d.preset}' removed from '${d.sandbox}'`, "info"));
    socket.on("policy:reset", (d) => toast(`Sandbox '${d.sandbox}' reset to baseline`, "info"));
    socket.on("inference:switched", (d) => toast(`Inference switched to ${d.model}`, "success"));
    socket.on("inference:credential_updated", (d) => toast(`Credential updated for '${d.provider}'`, "success"));
    socket.on("service:started", () => toast("Auxiliary services started", "success"));
    socket.on("service:stopped", () => toast("Auxiliary services stopped", "info"));
    return socket;
  }

  // ── Toast Notifications ────────────────────────────────────────
  function toast(message, type = "info") {
    const el = document.createElement("div");
    el.className = `toast toast--${type}`;
    const icons = { success: "✓", error: "✗", info: "ℹ", warning: "⚠" };
    el.innerHTML = `<span>${icons[type] || "ℹ"}</span> <span>${escapeHtml(message)}</span>`;
    const container = document.getElementById("toast-container");
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateX(20px)";
      setTimeout(() => el.remove(), 300);
    }, 4000);
  }

  // ── Modal ──────────────────────────────────────────────────────
  function showModal(html) {
    const overlay = document.getElementById("modal-overlay");
    const content = document.getElementById("modal-content");
    content.innerHTML = html;
    overlay.style.display = "flex";
    overlay.onclick = (e) => {
      if (e.target === overlay) hideModal();
    };
  }

  function hideModal() {
    document.getElementById("modal-overlay").style.display = "none";
  }

  // ── System Status ──────────────────────────────────────────────
  async function updateSystemStatus() {
    try {
      const data = await api.get("/api/system/preflight");
      const dot = document.getElementById("status-dot");
      const text = document.getElementById("status-text");
      if (data.healthy) {
        dot.className = "status-dot healthy";
        text.textContent = "System OK";
      } else if (data.checks?.docker?.available) {
        dot.className = "status-dot degraded";
        text.textContent = "Degraded";
      } else {
        dot.className = "status-dot down";
        text.textContent = "Offline";
      }
    } catch (err) {
      // If unauthorized, don't show "GUI Ready" — show login
      if (err.message === "Unauthorized") return;
      const dot = document.getElementById("status-dot");
      const text = document.getElementById("status-text");
      if (dot) dot.className = "status-dot healthy";
      if (text) text.textContent = "GUI Ready";
    }
  }

  // ── SPA Router ─────────────────────────────────────────────────
  const pages = {};

  function registerPage(name, renderFn) {
    pages[name] = renderFn;
  }

  function navigateTo(hash) {
    window.location.hash = hash;
  }

  async function route() {
    _isUnauthorized = false;
    const hash = window.location.hash || "#/";
    const path = hash.replace("#", "");
    const segments = path.split("/").filter(Boolean);

    // Map route to page
    let pageName = segments[0] || "dashboard";
    let params = {};

    // Handle /sandbox/:name
    if (pageName === "sandbox" && segments[1]) {
      pageName = "sandbox-detail";
      params.name = segments[1];
    }

    // Update nav
    document.querySelectorAll(".nav-link").forEach((link) => {
      link.classList.toggle(
        "active",
        link.dataset.page === pageName || link.dataset.page === segments[0]
      );
    });

    // Render page
    const container = document.getElementById("page-container");
    if (pages[pageName]) {
      container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
      try {
        const html = await pages[pageName](params);
        if (_isUnauthorized) return; // Login prompt already shown
        container.innerHTML = html;
        // Run post-render hooks
        if (pages[pageName + ":init"]) {
          pages[pageName + ":init"](params);
        }
      } catch (err) {
        if (err.message === "Unauthorized") return; // Login prompt already shown
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state__icon">❌</div>
            <div class="empty-state__title">Error Loading Page</div>
            <div class="empty-state__desc">${escapeHtml(err.message)}</div>
          </div>`;
      }
    } else {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">🔍</div>
          <div class="empty-state__title">Page Not Found</div>
          <div class="empty-state__desc">The page "${escapeHtml(pageName)}" doesn't exist.</div>
          <button class="btn btn-primary" onclick="location.hash='#/'">Go to Dashboard</button>
        </div>`;
    }
  }

  // ── EventSource Helper (authenticated) ─────────────────────────
  function createAuthEventSource(url) {
    const token = getToken();
    const separator = url.includes("?") ? "&" : "?";
    return new EventSource(`${url}${separator}token=${encodeURIComponent(token)}`);
  }

  // ── Initialize ─────────────────────────────────────────────────
  function init() {
    connectSocket();
    window.addEventListener("hashchange", route);
    // Initial route
    setTimeout(route, 50);
    // Periodic status check
    setInterval(updateSystemStatus, 30000);
  }

  document.addEventListener("DOMContentLoaded", init);

  return {
    api,
    socket: () => socket,
    toast,
    showModal,
    hideModal,
    registerPage,
    navigateTo,
    route,
    escapeHtml,
    createAuthEventSource,
    _doLogin,
  };
})();
