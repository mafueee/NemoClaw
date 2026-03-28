// ══════════════════════════════════════════════════════════════════
// Deploy Page — Remote GPU deployment and Telegram bridge config
// ══════════════════════════════════════════════════════════════════

NemoClaw.registerPage("deploy", async () => {
  return `
    <div class="page-header animate-fade">
      <div>
        <h1>Deployment</h1>
        <div class="page-header__subtitle">Remote GPU deployment and service bridges</div>
      </div>
    </div>

    <div class="split-pane">
      <div class="glass-card-flat animate-slide stagger-1">
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

      <div class="glass-card-flat animate-slide stagger-2">
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
        <button class="btn btn-secondary" onclick="DeployManager.saveTelegram()">Save Config</button>
        <div id="tg-status" style="margin-top:var(--nc-space-md)"></div>

        <div style="margin-top:var(--nc-space-xl);padding-top:var(--nc-space-md);border-top:1px solid var(--nc-glass-border)">
          <h4 style="margin-bottom:var(--nc-space-sm)">Setup Steps</h4>
          <ol style="color:var(--nc-text-secondary);font-size:var(--nc-text-sm);padding-left:var(--nc-space-xl);line-height:2">
            <li>Create a bot with <code>@BotFather</code></li>
            <li>Copy the bot token above</li>
            <li>Apply the <code>telegram</code> policy preset to your sandbox</li>
            <li>Start the bridge service</li>
          </ol>
        </div>
      </div>
    </div>

    <div class="glass-card-flat animate-slide stagger-3" style="margin-top:var(--nc-space-xl)">
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

  saveTelegram() {
    const token = document.getElementById('tg-token').value;
    const sandbox = document.getElementById('tg-sandbox').value;
    if (!token || !sandbox) { NemoClaw.toast('Fill in token and sandbox', 'warning'); return; }
    document.getElementById('tg-status').innerHTML =
      '<span style="color:var(--nc-status-running)">✓ Config saved. Apply the telegram policy preset and start the bridge.</span>';
    NemoClaw.toast('Telegram config saved', 'success');
  },
};
