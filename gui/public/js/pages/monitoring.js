// ══════════════════════════════════════════════════════════════════
// Monitoring Page — Real-time logs, network activity, operator approval
// ══════════════════════════════════════════════════════════════════

NemoClaw.registerPage("monitoring", async () => {
  let sandboxes = { sandboxes: [] };
  try { sandboxes = await NemoClaw.api.get("/api/sandboxes"); } catch {}
  const sandboxOptions = sandboxes.sandboxes.map(s =>
    `<option value="${s.name}">${s.name}${s.running ? ' (running)' : ''}</option>`
  ).join("");

  return `
    <div class="page-header animate-fade">
      <div>
        <h1>Monitoring & Approval</h1>
        <div class="page-header__subtitle">Real-time log streaming, network activity, and operator approval queue</div>
      </div>
    </div>
    <div class="tab-bar">
      <button class="tab-btn active" onclick="MonitorManager.showTab('logs')">Live Logs</button>
      <button class="tab-btn" onclick="MonitorManager.showTab('network')">Network Activity</button>
      <button class="tab-btn" onclick="MonitorManager.showTab('approval')">Approval Queue</button>
      <button class="tab-btn" onclick="MonitorManager.showTab('lifecycle')">Lifecycle</button>
    </div>

    <div id="mon-tab-logs">
      <div class="glass-card-flat">
        <div style="display:flex;gap:var(--nc-space-md);align-items:flex-end;margin-bottom:var(--nc-space-lg)">
          <div class="form-group" style="margin-bottom:0;flex:1;max-width:300px">
            <label class="form-label">Sandbox</label>
            <select class="form-select" id="mon-sandbox"><option value="">Select sandbox...</option>${sandboxOptions}</select>
          </div>
          <button class="btn btn-primary" id="mon-log-toggle" onclick="MonitorManager.toggleLogs()">▶ Start</button>
          <button class="btn btn-ghost" onclick="document.getElementById('mon-log-output').innerHTML=''">Clear</button>
        </div>
        <div class="log-stream" id="mon-log-output" style="min-height:400px">
          <div style="color:var(--nc-text-muted);padding:var(--nc-space-lg);text-align:center">Select a sandbox and start streaming</div>
        </div>
      </div>
    </div>

    <div id="mon-tab-network" style="display:none">
      <div class="glass-card-flat">
        <h3 style="margin-bottom:var(--nc-space-md)">Network Connections</h3>
        <p style="color:var(--nc-text-secondary);font-size:var(--nc-text-sm);margin-bottom:var(--nc-space-lg)">
          All outbound connections are intercepted by the policy engine:
          <span style="color:var(--nc-status-running)">Allowed</span>,
          <span style="color:var(--nc-status-blue)">Routed</span> (inference), or
          <span style="color:var(--nc-status-error)">Denied</span>.
        </p>
        <table class="data-table">
          <thead><tr><th>Destination</th><th>Port</th><th>Binary</th><th>Decision</th><th>Time</th></tr></thead>
          <tbody><tr><td colspan="5" style="text-align:center;color:var(--nc-text-muted);padding:var(--nc-space-xl)">
            Requires active OpenShell cluster. Run <code>openshell term</code> for live monitoring.
          </td></tr></tbody>
        </table>
      </div>
    </div>

    <div id="mon-tab-approval" style="display:none">
      <div class="glass-card-flat">
        <h3 style="margin-bottom:var(--nc-space-md)">Operator Approval Queue</h3>
        <p style="color:var(--nc-text-secondary);font-size:var(--nc-text-sm);margin-bottom:var(--nc-space-lg)">
          Blocked network requests appear here for operator approval, mirroring <code>openshell term</code>.
        </p>
        <div class="empty-state">
          <div class="empty-state__icon">✅</div>
          <div class="empty-state__title">No Pending Approvals</div>
          <div class="empty-state__desc">All requests covered by current policies. Blocked requests appear here.</div>
        </div>
        <div style="margin-top:var(--nc-space-lg);display:flex;gap:var(--nc-space-sm)">
          <button class="btn btn-sm btn-secondary" onclick="location.hash='#/policies'">🛡️ Manage Policies</button>
          <button class="btn btn-sm btn-ghost" onclick="navigator.clipboard.writeText('openshell term');NemoClaw.toast('Copied','success')">📋 Copy TUI Command</button>
        </div>
      </div>
    </div>

    <div id="mon-tab-lifecycle" style="display:none">
      <div class="glass-card-flat">
        <h3 style="margin-bottom:var(--nc-space-lg)">Blueprint Lifecycle</h3>
        <div style="display:flex;gap:var(--nc-space-sm);flex-wrap:wrap;margin-bottom:var(--nc-space-xl)">
          ${['Resolve','Verify','Plan','Apply','Status'].map((s,i) =>
            `<div class="wizard-step completed" style="flex:none;padding:8px 16px"><span class="wizard-step__number">${i+1}</span><span>${s}</span></div>
            ${i<4?'<span style="color:var(--nc-text-muted)">→</span>':''}`
          ).join('')}
        </div>
        <h4 style="margin-bottom:var(--nc-space-sm)">Security Layers</h4>
        <table class="data-table">
          <thead><tr><th>Layer</th><th>Protection</th><th>Reload</th></tr></thead>
          <tbody>
            <tr><td>Filesystem (Landlock)</td><td>Prevents reads/writes outside /sandbox, /tmp</td><td>Locked at creation</td></tr>
            <tr><td>Network (Policy Engine)</td><td>Blocks unauthorized outbound connections</td><td>Hot-reloadable</td></tr>
            <tr><td>Process (seccomp)</td><td>Blocks privilege escalation, dangerous syscalls</td><td>Locked at creation</td></tr>
            <tr><td>Inference (Router)</td><td>Routes model API calls to controlled backends</td><td>Hot-reloadable</td></tr>
          </tbody>
        </table>
      </div>
    </div>`;
});

const MonitorManager = {
  logSource: null,
  showTab(name) {
    ['logs','network','approval','lifecycle'].forEach(t => {
      const el = document.getElementById(`mon-tab-${t}`);
      if (el) el.style.display = t === name ? 'block' : 'none';
    });
    document.querySelectorAll('.tab-bar .tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.toLowerCase().includes(name));
    });
  },
  toggleLogs() {
    const btn = document.getElementById('mon-log-toggle');
    const output = document.getElementById('mon-log-output');
    const sandbox = document.getElementById('mon-sandbox').value;
    if (this.logSource) { this.logSource.close(); this.logSource = null; btn.textContent = '▶ Start'; return; }
    if (!sandbox) { NemoClaw.toast('Select a sandbox', 'warning'); return; }
    btn.textContent = '⏸ Stop'; output.innerHTML = '';
    this.logSource = new EventSource(`/api/sandboxes/${sandbox}/logs`);
    this.logSource.onmessage = (e) => {
      const d = JSON.parse(e.data);
      output.innerHTML += `<div class="log-line"><span class="log-ts">${new Date(d.ts).toLocaleTimeString()}</span><span class="log-msg">${d.line.replace(/</g,'&lt;')}</span></div>`;
      output.scrollTop = output.scrollHeight;
    };
    this.logSource.onerror = () => { this.logSource.close(); this.logSource = null; btn.textContent = '▶ Start'; };
  }
};
