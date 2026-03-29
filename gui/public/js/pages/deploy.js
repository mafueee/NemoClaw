// ══════════════════════════════════════════════════════════════════
// Deploy Page — Remote GPU deployment, Telegram bridge config,
// and auxiliary services management
// ══════════════════════════════════════════════════════════════════

NemoClaw.registerPage("deploy", async () => {
  // Fetch service status
  let serviceStatus = { services: { telegram: {}, cloudflared: {} } };
  try { serviceStatus = await NemoClaw.api.get("/api/system/services/status"); } catch {}

  const tgSvc = serviceStatus.services.telegram || {};
  const cfSvc = serviceStatus.services.cloudflared || {};

  return `
    <div class="page-header animate-fade">
      <div>
        <h1>Deployment</h1>
        <div class="page-header__subtitle">Remote GPU deployment, service bridges, and auxiliary services</div>
      </div>
    </div>

    <!-- Auxiliary Services Panel -->
    <div class="glass-card-flat animate-slide stagger-1" style="margin-bottom:var(--nc-space-xl)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--nc-space-lg)">
        <h3>⚡ Auxiliary Services</h3>
        <div style="display:flex;gap:var(--nc-space-sm)">
          <button class="btn btn-primary btn-sm" onclick="DeployManager.startServices()">▶ Start</button>
          <button class="btn btn-ghost btn-sm" onclick="DeployManager.stopServices()">■ Stop</button>
          <button class="btn btn-secondary btn-sm" onclick="DeployManager.refreshServiceStatus()">↻ Refresh</button>
        </div>
      </div>
      <p style="color:var(--nc-text-secondary);font-size:var(--nc-text-sm);margin-bottom:var(--nc-space-lg)">
        Start and stop the Telegram bridge and Cloudflared tunnel — equivalent to <code>nemoclaw start</code> / <code>nemoclaw stop</code>.
      </p>
      <div id="services-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--nc-space-md)">
        <div class="glass-card-flat" style="padding:var(--nc-space-md)">
          <div style="display:flex;align-items:center;gap:var(--nc-space-sm);margin-bottom:var(--nc-space-sm)">
            <span class="status-dot-inline ${tgSvc.running ? 'running' : 'stopped'}"></span>
            <span style="font-weight:var(--nc-weight-semibold)">✈️ Telegram Bridge</span>
          </div>
          <div style="font-size:var(--nc-text-xs);color:var(--nc-text-muted)">${tgSvc.details || 'Unknown'}</div>
          <div style="font-size:var(--nc-text-xs);color:var(--nc-text-muted);margin-top:var(--nc-space-xs)">
            Configured: ${tgSvc.configured ? '✓ Yes' : '✗ No'}
          </div>
        </div>
        <div class="glass-card-flat" style="padding:var(--nc-space-md)">
          <div style="display:flex;align-items:center;gap:var(--nc-space-sm);margin-bottom:var(--nc-space-sm)">
            <span class="status-dot-inline ${cfSvc.running ? 'running' : 'stopped'}"></span>
            <span style="font-weight:var(--nc-weight-semibold)">☁️ Cloudflared Tunnel</span>
          </div>
          <div style="font-size:var(--nc-text-xs);color:var(--nc-text-muted)">${cfSvc.details || 'Unknown'}</div>
        </div>
      </div>
      <div id="services-output" style="margin-top:var(--nc-space-md)"></div>
    </div>

    <div class="split-pane">
      <div class="glass-card-flat animate-slide stagger-2">
        <h3 style="margin-bottom:var(--nc-space-md)">☁️ Remote GPU Deployment</h3>
        <p style="color:var(--nc-text-secondary);font-size:var(--nc-text-sm);margin-bottom:var(--nc-space-lg)">
          Deploy NemoClaw to a remote GPU instance via SSH. The deployment script installs Docker, 
          OpenShell, and configures the sandbox environment on the target host.
        </p>
        <div class="form-group">
          <label class="form-label">SSH Target</label>
          <input class="form-input" id="deploy-instance" placeholder="user@hostname or instance name">
        </div>
        <button class="btn btn-primary" onclick="DeployManager.deploy()">🚀 Deploy</button>
        <div id="deploy-output" style="margin-top:var(--nc-space-lg)"></div>

        <div style="margin-top:var(--nc-space-xl);padding-top:var(--nc-space-md);border-top:1px solid var(--nc-glass-border)">
          <h4 style="margin-bottom:var(--nc-space-sm)">Manual CLI Deploy</h4>
          <div class="code-block">nemoclaw deploy my-gpu-box</div>
        </div>
      </div>

      <div class="glass-card-flat animate-slide stagger-3">
        <h3 style="margin-bottom:var(--nc-space-md)">✈️ Telegram Bridge</h3>
        <p style="color:var(--nc-text-secondary);font-size:var(--nc-text-sm);margin-bottom:var(--nc-space-lg)">
          Connect your agent to Telegram via the bridge service. Requires a Telegram Bot Token from @BotFather.
        </p>
        <div class="form-group">
          <label class="form-label">Bot Token</label>
          <input class="form-input" id="tg-token" type="password" placeholder="123456:ABC-DEF...">
        </div>
        <div class="form-group">
          <label class="form-label">Sandbox</label>
          <input class="form-input" id="tg-sandbox" placeholder="Sandbox name">
        </div>
        <div class="form-group">
          <label class="form-label">Allowed Chat IDs <span style="color:var(--nc-text-muted);font-weight:normal">(optional, comma-separated)</span></label>
          <input class="form-input" id="tg-chat-ids" placeholder="123456789, 987654321">
          <div style="font-size:var(--nc-text-xs);color:var(--nc-text-muted);margin-top:var(--nc-space-xs)">
            Restrict the bridge to specific Telegram chat IDs. Leave empty to allow all chats.
            Equivalent to <code>ALLOWED_CHAT_IDS</code> environment variable.
          </div>
        </div>
        <button class="btn btn-secondary" onclick="DeployManager.saveTelegram()">Save Config</button>
        <div id="tg-status" style="margin-top:var(--nc-space-md)"></div>

        <div style="margin-top:var(--nc-space-xl);padding-top:var(--nc-space-md);border-top:1px solid var(--nc-glass-border)">
          <h4 style="margin-bottom:var(--nc-space-sm)">Setup Steps</h4>
          <ol style="color:var(--nc-text-secondary);font-size:var(--nc-text-sm);padding-left:var(--nc-space-xl);line-height:2">
            <li>Create a bot with <code>@BotFather</code></li>
            <li>Copy the bot token above</li>
            <li>Optionally restrict with Allowed Chat IDs</li>
            <li>Apply the <code>telegram</code> policy preset to your sandbox</li>
            <li>Start the bridge using the ▶ Start button above</li>
          </ol>
        </div>
      </div>
    </div>

    <div class="glass-card-flat animate-slide stagger-4" style="margin-top:var(--nc-space-xl)">
      <h3 style="margin-bottom:var(--nc-space-md)">🔧 Experimental Features</h3>
      <p style="color:var(--nc-text-secondary);font-size:var(--nc-text-sm);margin-bottom:var(--nc-space-md)">
        Some providers require the experimental flag. Set <code>NEMOCLAW_EXPERIMENTAL=1</code> to enable.
      </p>
      <table class="data-table">
        <thead><tr><th>Feature</th><th>Requires</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>Local NIM inference</td><td>NEMOCLAW_EXPERIMENTAL=1</td><td><span class="status-badge status-badge--stopped">Experimental</span></td></tr>
          <tr><td>vLLM local inference</td><td>NEMOCLAW_EXPERIMENTAL=1</td><td><span class="status-badge status-badge--stopped">Experimental</span></td></tr>
          <tr><td>GPU passthrough</td><td>NVIDIA drivers + Container Toolkit</td><td><span class="status-badge status-badge--stopped">Experimental</span></td></tr>
        </tbody>
      </table>
    </div>
  `;
});

const DeployManager = {
  async deploy() {
    const instance = document.getElementById('deploy-instance').value;
    if (!instance) { NemoClaw.toast('Enter SSH target', 'warning'); return; }
    const output = document.getElementById('deploy-output');
    output.innerHTML = '<div class="loading-state"><div class="spinner spinner-sm"></div> Deploying...</div>';
    try {
      const d = await NemoClaw.api.post('/api/system/deploy', { instance });
      output.innerHTML = `<span style="color:var(--nc-status-running)">✓ ${d.message}</span>`;
    } catch (err) {
      output.innerHTML = `<span style="color:var(--nc-status-error)">✗ ${err.message}</span>`;
    }
  },

  async saveTelegram() {
    const token = document.getElementById('tg-token').value;
    const sandbox = document.getElementById('tg-sandbox').value;
    const chatIdsRaw = document.getElementById('tg-chat-ids').value;

    if (!token || !sandbox) { NemoClaw.toast('Fill in token and sandbox', 'warning'); return; }

    // Parse chat IDs
    const allowedChatIds = chatIdsRaw
      ? chatIdsRaw.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    
    try {
      const d = await NemoClaw.api.post('/api/system/telegram', { token, sandbox, allowedChatIds });
      document.getElementById('tg-status').innerHTML =
        '<span style="color:var(--nc-status-success)">✓ Config saved. Appended to global credentials.</span>';
      NemoClaw.toast('Telegram config saved', 'success');
      document.getElementById('tg-token').value = '';
    } catch (err) {
      document.getElementById('tg-status').innerHTML =
        `<span style="color:var(--nc-status-error)">✗ Error: ${err.message}</span>`;
      NemoClaw.toast('Failed to save config', 'error');
    }
  },

  async startServices() {
    const output = document.getElementById('services-output');
    output.innerHTML = '<div class="loading-state"><div class="spinner spinner-sm"></div> Starting auxiliary services...</div>';
    try {
      const d = await NemoClaw.api.post('/api/system/services/start');
      output.innerHTML = `<span style="color:var(--nc-status-running)">✓ ${d.message}</span>`;
      NemoClaw.toast('Auxiliary services starting', 'success');
      // Refresh status after a short delay
      setTimeout(() => this.refreshServiceStatus(), 3000);
    } catch (err) {
      output.innerHTML = `<span style="color:var(--nc-status-error)">✗ ${err.message}</span>`;
      NemoClaw.toast('Failed to start services', 'error');
    }
  },

  async stopServices() {
    const output = document.getElementById('services-output');
    output.innerHTML = '<div class="loading-state"><div class="spinner spinner-sm"></div> Stopping auxiliary services...</div>';
    try {
      const d = await NemoClaw.api.post('/api/system/services/stop');
      output.innerHTML = `<span style="color:var(--nc-status-running)">✓ ${d.message}</span>`;
      NemoClaw.toast('Auxiliary services stopped', 'info');
      setTimeout(() => this.refreshServiceStatus(), 1000);
    } catch (err) {
      output.innerHTML = `<span style="color:var(--nc-status-error)">✗ ${err.message}</span>`;
      NemoClaw.toast('Failed to stop services', 'error');
    }
  },

  async refreshServiceStatus() {
    try {
      const d = await NemoClaw.api.get('/api/system/services/status');
      const grid = document.getElementById('services-grid');
      if (!grid) return;

      const tgSvc = d.services.telegram || {};
      const cfSvc = d.services.cloudflared || {};

      grid.innerHTML = `
        <div class="glass-card-flat" style="padding:var(--nc-space-md)">
          <div style="display:flex;align-items:center;gap:var(--nc-space-sm);margin-bottom:var(--nc-space-sm)">
            <span class="status-dot-inline ${tgSvc.running ? 'running' : 'stopped'}"></span>
            <span style="font-weight:var(--nc-weight-semibold)">✈️ Telegram Bridge</span>
          </div>
          <div style="font-size:var(--nc-text-xs);color:var(--nc-text-muted)">${tgSvc.details || 'Unknown'}</div>
          <div style="font-size:var(--nc-text-xs);color:var(--nc-text-muted);margin-top:var(--nc-space-xs)">
            Configured: ${tgSvc.configured ? '✓ Yes' : '✗ No'}
          </div>
        </div>
        <div class="glass-card-flat" style="padding:var(--nc-space-md)">
          <div style="display:flex;align-items:center;gap:var(--nc-space-sm);margin-bottom:var(--nc-space-sm)">
            <span class="status-dot-inline ${cfSvc.running ? 'running' : 'stopped'}"></span>
            <span style="font-weight:var(--nc-weight-semibold)">☁️ Cloudflared Tunnel</span>
          </div>
          <div style="font-size:var(--nc-text-xs);color:var(--nc-text-muted)">${cfSvc.details || 'Unknown'}</div>
        </div>`;
    } catch { /* silently fail */ }
  },
};
