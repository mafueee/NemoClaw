// ══════════════════════════════════════════════════════════════════
// Monitoring Page — Real-time logs, network activity, operator approval
// ══════════════════════════════════════════════════════════════════

NemoClaw.registerPage("monitoring", async () => {
  let sandboxes = { sandboxes: [] };
  try { sandboxes = await NemoClaw.api.get("/api/sandboxes"); } catch {}
  const sandboxOptions = sandboxes.sandboxes.map(s =>
    `<option value="${s.name}">${s.name}${s.running ? ' (running)' : ''}</option>`
  ).join("");

  // Sandbox Selection UI used across tabs
  const sandboxSelector = `
    <div class="form-group" style="margin-bottom:0;flex:1;max-width:300px">
      <label class="form-label">Sandbox</label>
      <select class="form-select mon-sandbox" onchange="MonitorManager.onSandboxChange()"><option value="">Select sandbox...</option>${sandboxOptions}</select>
    </div>
  `;

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

    <!-- Logs Tab -->
    <div id="mon-tab-logs">
      <div class="glass-card-flat">
        <div style="display:flex;gap:var(--nc-space-md);align-items:flex-end;margin-bottom:var(--nc-space-lg)">
          ${sandboxSelector}
          <button class="btn btn-primary" id="mon-log-toggle" onclick="MonitorManager.toggleLogs()">▶ Start</button>
          <button class="btn btn-ghost" onclick="document.getElementById('mon-log-output').innerHTML=''">Clear</button>
        </div>
        <div class="log-stream" id="mon-log-output" style="min-height:400px">
          <div style="color:var(--nc-text-muted);padding:var(--nc-space-lg);text-align:center">Select a sandbox and start streaming</div>
        </div>
      </div>
    </div>

    <!-- Network Activity Tab -->
    <div id="mon-tab-network" style="display:none">
      <div class="glass-card-flat">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:var(--nc-space-md)">
          <div>
            <h3 style="margin-bottom:var(--nc-space-xs)">Network Connections</h3>
            <p style="color:var(--nc-text-secondary);font-size:var(--nc-text-sm);margin-bottom:0">All outbound connections are intercepted by the policy engine.</p>
          </div>
          <div style="display:flex;gap:var(--nc-space-md);align-items:flex-end;">
            ${sandboxSelector}
            <button class="btn btn-primary" id="mon-net-toggle" onclick="MonitorManager.toggleNetwork()">▶ Stream Network</button>
          </div>
        </div>
        
        <table class="data-table" style="margin-top:var(--nc-space-lg)">
          <thead><tr><th>Destination</th><th>Decision</th><th>Time</th><th>Raw Log</th></tr></thead>
          <tbody id="mon-network-table"><tr><td colspan="4" style="text-align:center;color:var(--nc-text-muted);padding:var(--nc-space-xl)">
            Select a sandbox and start streaming network logs.
          </td></tr></tbody>
        </table>
      </div>
    </div>

    <!-- Approval Queue Tab -->
    <div id="mon-tab-approval" style="display:none">
      <div class="glass-card-flat">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:var(--nc-space-md)">
          <div>
            <h3 style="margin-bottom:var(--nc-space-xs)">Operator Approval Queue</h3>
            <p style="color:var(--nc-text-secondary);font-size:var(--nc-text-sm);margin-bottom:var(--nc-space-lg)">
              Blocked network requests appear here for operator approval.
            </p>
          </div>
          <div style="display:flex;gap:var(--nc-space-md);align-items:flex-end;margin-bottom:var(--nc-space-lg)">
            ${sandboxSelector}
            <button class="btn btn-secondary" onclick="MonitorManager.refreshApprovals()">↻ Refresh</button>
          </div>
        </div>

        <div class="empty-state" id="mon-approval-empty">
          <div class="empty-state__icon">✅</div>
          <div class="empty-state__title">No Pending Approvals</div>
          <div class="empty-state__desc">All requests covered by current policies. Pending approvals will appear here.</div>
        </div>
        <table class="data-table" id="mon-approval-table" style="display:none;">
           <thead><tr><th>Destination</th><th>Binary</th><th>Time</th><th>Action</th></tr></thead>
           <tbody id="mon-approval-body"></tbody>
        </table>

        <div style="margin-top:var(--nc-space-lg);display:flex;gap:var(--nc-space-sm)">
          <button class="btn btn-sm btn-secondary" onclick="location.hash='#/policies'">🛡️ Manage Policies</button>
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
  netSource: null,
  
  onSandboxChange() {
    // Sync all selects
    const val = event.target.value;
    document.querySelectorAll('.mon-sandbox').forEach(el => el.value = val);
  },

  showTab(name) {
    ['logs','network','approval','lifecycle'].forEach(t => {
      const el = document.getElementById(`mon-tab-${t}`);
      if (el) el.style.display = t === name ? 'block' : 'none';
    });
    document.querySelectorAll('.tab-bar .tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.toLowerCase().includes(name));
    });
    
    // Auto-refresh approvals if switching to it
    if (name === 'approval') {
      this.refreshApprovals();
    }
  },

  toggleLogs() {
    const btn = document.getElementById('mon-log-toggle');
    const output = document.getElementById('mon-log-output');
    const sandbox = document.querySelector('.mon-sandbox').value;
    
    if (this.logSource) { 
      this.logSource.close(); 
      this.logSource = null; 
      btn.textContent = '▶ Start'; 
      return; 
    }
    
    if (!sandbox) { NemoClaw.toast('Select a sandbox', 'warning'); return; }
    
    btn.textContent = '⏸ Stop'; 
    output.innerHTML = '';
    
    this.logSource = new EventSource(`/api/sandboxes/${sandbox}/logs`);
    this.logSource.onmessage = (e) => {
      const d = JSON.parse(e.data);
      output.innerHTML += `<div class="log-line"><span class="log-ts">${new Date(d.ts).toLocaleTimeString()}</span><span class="log-msg">${escapeHtml(d.line)}</span></div>`;
      output.scrollTop = output.scrollHeight;
    };
    this.logSource.onerror = () => { 
      this.logSource.close(); 
      this.logSource = null; 
      btn.textContent = '▶ Start'; 
    };
  },

  toggleNetwork() {
    const btn = document.getElementById('mon-net-toggle');
    const tbody = document.getElementById('mon-network-table');
    const sandbox = document.querySelector('.mon-sandbox').value;
    
    if (this.netSource) { 
      this.netSource.close(); 
      this.netSource = null; 
      btn.textContent = '▶ Stream Network'; 
      return; 
    }
    
    if (!sandbox) { NemoClaw.toast('Select a sandbox', 'warning'); return; }
    
    btn.textContent = '⏸ Stop Streaming'; 
    tbody.innerHTML = '';
    
    this.netSource = new EventSource(`/api/monitoring/${sandbox}/network`);
    this.netSource.onmessage = (e) => {
      const d = JSON.parse(e.data);
      let badgeClass = 'status-badge--stopped'; // Denied
      if (d.decision === 'Allowed') badgeClass = 'status-badge--success';
      if (d.decision === 'Routed') badgeClass = 'status-badge--running';

      tbody.innerHTML += `
        <tr>
          <td><div style="font-family:var(--nc-font-mono); font-size:var(--nc-text-sm);">${escapeHtml(d.destination)}</div></td>
          <td><span class="status-badge ${badgeClass}">${d.decision}</span></td>
          <td style="color:var(--nc-text-muted); font-size:var(--nc-text-sm);">${d.ts}</td>
          <td><div style="max-width:300px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-family:var(--nc-font-mono); font-size:11px; color:var(--nc-text-muted);">${escapeHtml(d.raw)}</div></td>
        </tr>
      `;
    };
    this.netSource.onerror = () => { 
      this.netSource.close(); 
      this.netSource = null; 
      btn.textContent = '▶ Stream Network'; 
      if (tbody.innerHTML === '') {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--nc-status-error);padding:var(--nc-space-xl)">Connection to network stream lost or sandbox stopped.</td></tr>';
      }
    };
  },

  async refreshApprovals() {
    const sandbox = document.querySelector('.mon-sandbox').value;
    if (!sandbox) return;

    try {
      const res = await fetch(`/api/monitoring/${sandbox}/approvals`);
      const data = await res.json();
      
      const emptyState = document.getElementById('mon-approval-empty');
      const table = document.getElementById('mon-approval-table');
      const tbody = document.getElementById('mon-approval-body');
      
      if (data.approvals.length === 0) {
        emptyState.style.display = 'block';
        table.style.display = 'none';
      } else {
        emptyState.style.display = 'none';
        table.style.display = 'table';
        tbody.innerHTML = data.approvals.map(req => `
          <tr>
            <td>${escapeHtml(req.destination)}</td>
            <td>${escapeHtml(req.binary)}</td>
            <td>${req.ts}</td>
            <td><button class="btn btn-sm btn-primary">Approve</button> <button class="btn btn-sm btn-danger">Deny</button></td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error(err);
    }
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
