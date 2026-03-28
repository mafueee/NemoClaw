// ══════════════════════════════════════════════════════════════════
// Sandbox Detail Page — Full sandbox management view
// ══════════════════════════════════════════════════════════════════

NemoClaw.registerPage("sandbox-detail", async (params) => {
  let sb = {};
  try { sb = await NemoClaw.api.get(`/api/sandboxes/${params.name}`); } catch {}

  const statusBadge = sb.running
    ? '<span class="status-badge status-badge--running"><span class="status-dot-inline running"></span> Running</span>'
    : '<span class="status-badge status-badge--stopped"><span class="status-dot-inline stopped"></span> Stopped</span>';

  const policyTags = (sb.policies || []).map(p =>
    `<span class="status-badge status-badge--info">${p}</span>`
  ).join(' ') || '<span style="color:var(--nc-text-muted)">No presets applied</span>';

  const policyYaml = sb.activePolicy
    ? `<pre class="code-block">${escapeHtml(JSON.stringify(sb.activePolicy, null, 2))}</pre>`
    : '<div style="color:var(--nc-text-muted)">No active policy data available</div>';

  return `
    <div class="page-header animate-fade">
      <div>
        <div style="display:flex;align-items:center;gap:var(--nc-space-md)">
          <button class="btn btn-ghost" onclick="location.hash='#/'" style="padding:6px 10px">←</button>
          <h1>${params.name}</h1>
          ${statusBadge}
        </div>
        <div class="page-header__subtitle">Sandbox detail and management</div>
      </div>
      <div style="display:flex;gap:var(--nc-space-sm)">
        <button class="btn btn-secondary" onclick="SandboxDetail.refresh('${params.name}')">↻ Refresh</button>
        <button class="btn btn-danger" onclick="SandboxDetail.confirmDestroy('${params.name}')">🗑 Destroy</button>
      </div>
    </div>

    <div class="tab-bar" id="sandbox-tabs">
      <button class="tab-btn active" onclick="SandboxDetail.showTab('overview')">Overview</button>
      <button class="tab-btn" onclick="SandboxDetail.showTab('logs')">Logs</button>
      <button class="tab-btn" onclick="SandboxDetail.showTab('policy')">Policy</button>
      <button class="tab-btn" onclick="SandboxDetail.showTab('workspace')">Workspace</button>
    </div>

    <!-- Overview Tab -->
    <div id="tab-overview" class="animate-fade">
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-card__value" style="font-size:var(--nc-text-lg)">${sb.providerLabel || '—'}</div>
          <div class="stat-card__label">Provider</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value" style="font-size:var(--nc-text-sm);word-break:break-all;line-height:2">${sb.model || '—'}</div>
          <div class="stat-card__label">Model</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value" style="font-size:var(--nc-text-lg)">${sb.policyGroupCount ?? '—'}</div>
          <div class="stat-card__label">Policy Groups</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value" style="font-size:var(--nc-text-sm);line-height:2">${sb.createdAt ? new Date(sb.createdAt).toLocaleString() : '—'}</div>
          <div class="stat-card__label">Created</div>
        </div>
      </div>

      <div class="glass-card-flat" style="margin-top:var(--nc-space-lg)">
        <h3 style="margin-bottom:var(--nc-space-md)">Inference Configuration</h3>
        <dl class="sandbox-card__meta">
          <dt>Provider</dt><dd>${sb.inference?.provider || sb.providerLabel || '—'}</dd>
          <dt>Model</dt><dd>${sb.inference?.model || sb.model || '—'}</dd>
          <dt>Endpoint</dt><dd style="word-break:break-all">${sb.inference?.endpoint || '—'}</dd>
        </dl>
        <div style="margin-top:var(--nc-space-md)">
          <button class="btn btn-sm btn-secondary" onclick="location.hash='#/inference'">Switch Provider →</button>
        </div>
      </div>

      <div class="glass-card-flat" style="margin-top:var(--nc-space-lg)">
        <h3 style="margin-bottom:var(--nc-space-md)">Applied Policy Presets</h3>
        <div>${policyTags}</div>
        <div style="margin-top:var(--nc-space-md)">
          <button class="btn btn-sm btn-secondary" onclick="location.hash='#/policies'">Manage Policies →</button>
        </div>
      </div>

      <div class="glass-card-flat" style="margin-top:var(--nc-space-lg)">
        <h3 style="margin-bottom:var(--nc-space-md)">Quick Actions</h3>
        <div style="display:flex;gap:var(--nc-space-sm);flex-wrap:wrap">
          <button class="btn btn-secondary" onclick="SandboxDetail.copyConnectCmd('${params.name}')">📋 Copy Connect Command</button>
          <button class="btn btn-secondary" onclick="location.hash='#/workspace'">📝 Edit Workspace Files</button>
          <button class="btn btn-secondary" onclick="SandboxDetail.backup('${params.name}')">💾 Backup Workspace</button>
        </div>
      </div>
    </div>

    <!-- Logs Tab -->
    <div id="tab-logs" style="display:none">
      <div class="glass-card-flat">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--nc-space-md)">
          <h3>Real-Time Logs</h3>
          <button class="btn btn-sm btn-secondary" id="log-toggle" onclick="SandboxDetail.toggleLogs('${params.name}')">▶ Start Streaming</button>
        </div>
        <div class="log-stream" id="log-output">
          <div style="color:var(--nc-text-muted);padding:var(--nc-space-lg);text-align:center">
            Click "Start Streaming" to begin tailing sandbox logs
          </div>
        </div>
      </div>
    </div>

    <!-- Policy Tab -->
    <div id="tab-policy" style="display:none">
      <div class="glass-card-flat">
        <h3 style="margin-bottom:var(--nc-space-md)">Active Network Policy</h3>
        ${policyYaml}
      </div>
    </div>

    <!-- Workspace Tab -->
    <div id="tab-workspace" style="display:none">
      <div class="glass-card-flat" id="workspace-panel">
        <h3 style="margin-bottom:var(--nc-space-md)">Workspace Files</h3>
        <div id="workspace-files-list" style="color:var(--nc-text-muted)">Loading...</div>
      </div>
    </div>
  `;
});

NemoClaw.registerPage("sandbox-detail:init", (params) => {
  // Load workspace files for the workspace tab
  NemoClaw.api.get(`/api/workspace/${params.name}/files`).then(d => {
    const el = document.getElementById('workspace-files-list');
    if (!el) return;
    el.innerHTML = d.files.map(f => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:var(--nc-space-sm) 0;border-bottom:1px solid rgba(71,85,105,0.15)">
        <div>
          <div style="font-weight:var(--nc-weight-medium);color:var(--nc-text-primary)">${f.name}</div>
          <div style="font-size:var(--nc-text-xs);color:var(--nc-text-muted)">${f.description}</div>
        </div>
        <span class="status-badge ${f.exists ? 'status-badge--running' : 'status-badge--stopped'}">${f.exists ? 'exists' : 'missing'}</span>
      </div>
    `).join('') || '<div>No files found</div>';
  }).catch(() => {});
});

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const SandboxDetail = {
  showTab(name) {
    ['overview', 'logs', 'policy', 'workspace'].forEach(t => {
      const el = document.getElementById(`tab-${t}`);
      if (el) el.style.display = t === name ? 'block' : 'none';
    });
    document.querySelectorAll('#sandbox-tabs .tab-btn').forEach((btn, i) => {
      btn.classList.toggle('active', btn.textContent.toLowerCase() === name);
    });
  },

  copyConnectCmd(name) {
    navigator.clipboard.writeText(`openshell sandbox connect ${name}`);
    NemoClaw.toast('Connect command copied to clipboard', 'success');
  },

  async backup(name) {
    try {
      const d = await NemoClaw.api.post(`/api/workspace/${name}/backup`);
      NemoClaw.toast(`Backup created: ${d.files.length} files saved`, 'success');
    } catch (err) {
      NemoClaw.toast(`Backup failed: ${err.message}`, 'error');
    }
  },

  confirmDestroy(name) {
    NemoClaw.showModal(`
      <h2>⚠️ Destroy Sandbox</h2>
      <p style="color:var(--nc-text-secondary);margin-bottom:var(--nc-space-md)">
        Are you sure you want to destroy <strong>${name}</strong>? This will permanently delete the sandbox container and all workspace files.
      </p>
      <p style="color:var(--nc-status-error);font-size:var(--nc-text-sm)">
        Consider backing up workspace files first.
      </p>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="NemoClaw.hideModal()">Cancel</button>
        <button class="btn btn-danger" onclick="SandboxDetail.destroy('${name}')">Destroy Sandbox</button>
      </div>
    `);
  },

  async destroy(name) {
    try {
      await NemoClaw.api.del(`/api/sandboxes/${name}`);
      NemoClaw.hideModal();
      NemoClaw.toast(`Sandbox '${name}' destroyed`, 'info');
      location.hash = '#/';
    } catch (err) {
      NemoClaw.toast(`Destroy failed: ${err.message}`, 'error');
    }
  },

  logEventSource: null,

  toggleLogs(name) {
    const btn = document.getElementById('log-toggle');
    const output = document.getElementById('log-output');

    if (this.logEventSource) {
      this.logEventSource.close();
      this.logEventSource = null;
      btn.textContent = '▶ Start Streaming';
      return;
    }

    btn.textContent = '⏸ Stop Streaming';
    output.innerHTML = '';

    this.logEventSource = new EventSource(`/api/sandboxes/${name}/logs`);
    this.logEventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const ts = new Date(data.ts).toLocaleTimeString();
      output.innerHTML += `<div class="log-line"><span class="log-ts">${ts}</span><span class="log-msg">${escapeHtml(data.line)}</span></div>`;
      output.scrollTop = output.scrollHeight;
    };
    this.logEventSource.onerror = () => {
      output.innerHTML += '<div class="log-line"><span class="log-msg" style="color:var(--nc-status-error)">[Connection lost]</span></div>';
      this.logEventSource.close();
      this.logEventSource = null;
      btn.textContent = '▶ Start Streaming';
    };
  },

  refresh(name) {
    location.hash = `#/sandbox/${name}`;
    NemoClaw.route();
  },
};
