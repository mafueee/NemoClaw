// ══════════════════════════════════════════════════════════════════
// NemoClaw Dashboard — SPA Router & API Client
// ══════════════════════════════════════════════════════════════════

const NemoClaw = (() => {
  // ── API Client ─────────────────────────────────────────────────
  const api = {
    async get(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
    async post(url, data) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `${res.status} ${res.statusText}`);
      }
      return res.json();
    },
    async put(url, data) {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
    async del(url) {
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
  };

  // ── Socket.IO ──────────────────────────────────────────────────
  let socket = null;
  function connectSocket() {
    if (socket) return socket;
    socket = io();
    socket.on("connect", () => {
      console.log("[ws] Connected");
      socket.emit("subscribe:status");
      updateSystemStatus();
    });
    socket.on("disconnect", () => console.log("[ws] Disconnected"));
    socket.on("sandbox:created", (d) => toast(`Sandbox '${d.name}' created`, "success"));
    socket.on("sandbox:destroyed", (d) => toast(`Sandbox '${d.name}' destroyed`, "info"));
    socket.on("policy:applied", (d) => toast(`Policy applied to '${d.sandbox}'`, "success"));
    socket.on("inference:switched", (d) => toast(`Inference switched to ${d.model}`, "success"));
    return socket;
  }

  // ── Toast Notifications ────────────────────────────────────────
  function toast(message, type = "info") {
    const el = document.createElement("div");
    el.className = `toast toast--${type}`;
    const icons = { success: "✓", error: "✗", info: "ℹ", warning: "⚠" };
    el.innerHTML = `<span>${icons[type] || "ℹ"}</span> <span>${message}</span>`;
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
      } else if (data.checks.docker.available) {
        dot.className = "status-dot degraded";
        text.textContent = "Degraded";
      } else {
        dot.className = "status-dot down";
        text.textContent = "Offline";
      }
    } catch {
      const dot = document.getElementById("status-dot");
      const text = document.getElementById("status-text");
      dot.className = "status-dot healthy";
      text.textContent = "GUI Ready";
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
        container.innerHTML = html;
        // Run post-render hooks
        if (pages[pageName + ":init"]) {
          pages[pageName + ":init"](params);
        }
      } catch (err) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state__icon">❌</div>
            <div class="empty-state__title">Error Loading Page</div>
            <div class="empty-state__desc">${err.message}</div>
          </div>`;
      }
    } else {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">🔍</div>
          <div class="empty-state__title">Page Not Found</div>
          <div class="empty-state__desc">The page "${pageName}" doesn't exist.</div>
          <button class="btn btn-primary" onclick="location.hash='#/'">Go to Dashboard</button>
        </div>`;
    }
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
  };
})();
