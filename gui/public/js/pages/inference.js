// ══════════════════════════════════════════════════════════════════
// Inference Page — Provider switching and credential management
// ══════════════════════════════════════════════════════════════════

NemoClaw.registerPage("inference", async () => {
  let providers = [];
  let status = {};
  let creds = [];

  try { const d = await NemoClaw.api.get("/api/inference/providers"); providers = d.providers; } catch {}
  try { status = await NemoClaw.api.get("/api/inference/status"); } catch {}
  try { const d = await NemoClaw.api.get("/api/inference/credentials"); creds = d.credentials; } catch {}

  const providerIcons = {
    nvidia: '🟢', openai: '🤖', anthropic: '🧬', gemini: '💎',
    ollama: '🦙', 'compatible-openai': '🔌', 'compatible-anthropic': '🔌',
  };

  const providerCards = providers.map(p => `
    <div class="provider-card" data-key="${p.key}" onclick="InferenceManager.selectProvider('${p.key}')">
      <div class="provider-card__icon">${providerIcons[p.key] || '🔌'}</div>
      <div class="provider-card__name">${p.label}</div>
      <div class="provider-card__type">${p.compatible} · ${p.local ? 'Local' : 'Cloud'}</div>
      ${p.hasCredential ? '<div style="color:var(--nc-status-running);font-size:var(--nc-text-xs);margin-top:4px">✓ Key stored</div>' : ''}
    </div>
  `).join("");

  const credRows = creds.map(c => `
    <tr>
      <td><strong>${c.label}</strong></td>
      <td><code style="font-size:var(--nc-text-xs)">${c.credentialEnv}</code></td>
      <td>
        ${c.hasKey
          ? `<span class="status-badge status-badge--running">✓ Set</span> <code style="font-size:var(--nc-text-xs)">${c.mask}</code>`
          : '<span class="status-badge status-badge--stopped">Missing</span>'}
      </td>
      <td><button class="btn btn-sm btn-ghost" onclick="InferenceManager.editCred('${c.key}', '${c.label}')">Edit</button></td>
    </tr>
  `).join("");

  const ollamaSection = status.ollama?.running
    ? `<div class="glass-card" style="border-color:var(--nc-status-running);margin-top:var(--nc-space-lg)">
        <h3 style="color:var(--nc-status-running);margin-bottom:var(--nc-space-md)">🦙 Ollama Detected</h3>
        <p style="color:var(--nc-text-secondary);font-size:var(--nc-text-sm);margin-bottom:var(--nc-space-sm)">${status.ollama.modelCount} model(s) available</p>
        <div style="display:flex;gap:var(--nc-space-sm);flex-wrap:wrap">
          ${status.ollama.models.map(m => `<span class="status-badge status-badge--info">${m}</span>`).join('')}
        </div>
      </div>`
    : '';

  return `
    <div class="page-header animate-fade">
      <div>
        <h1>Inference Configuration</h1>
        <div class="page-header__subtitle">Manage providers, credentials, and model routing</div>
      </div>
    </div>

    <div class="tab-bar">
      <button class="tab-btn active" onclick="InferenceManager.showTab('providers')">Providers</button>
      <button class="tab-btn" onclick="InferenceManager.showTab('credentials')">Credentials</button>
      <button class="tab-btn" onclick="InferenceManager.showTab('status')">Current Status</button>
    </div>

    <!-- Providers Tab -->
    <div id="inf-tab-providers">
      <div class="split-pane">
        <div>
          <h3 class="section-title" style="margin-bottom:var(--nc-space-md)">Provider Catalogue</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:var(--nc-space-md)">
            ${providerCards}
          </div>
          ${ollamaSection}
        </div>
        <div>
          <div class="glass-card-flat">
            <h3 style="margin-bottom:var(--nc-space-md)">Switch Active Provider</h3>
            <div class="form-group">
              <label class="form-label">Provider</label>
              <select class="form-select" id="switch-provider">
                <option value="">Select provider...</option>
                ${providers.map(p => `<option value="${p.key}">${p.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Model</label>
              <input class="form-input" id="switch-model" placeholder="Model name">
            </div>
            <button class="btn btn-primary" onclick="InferenceManager.switchProvider()">Switch Provider</button>
            <div id="switch-result" style="margin-top:var(--nc-space-md)"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Credentials Tab -->
    <div id="inf-tab-credentials" style="display:none">
      <div class="glass-card-flat">
        <h3 style="margin-bottom:var(--nc-space-md)">Credential Vault</h3>
        <p style="color:var(--nc-text-secondary);font-size:var(--nc-text-sm);margin-bottom:var(--nc-space-lg)">
          Credentials are stored on the host at <code>~/.nemoclaw/credentials.json</code> with mode 0600. They are never injected into the sandbox filesystem.
        </p>
        <table class="data-table">
          <thead><tr><th>Provider</th><th>Env Variable</th><th>Status</th><th></th></tr></thead>
          <tbody>${credRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Status Tab -->
    <div id="inf-tab-status" style="display:none">
      <div class="glass-card-flat">
        <h3 style="margin-bottom:var(--nc-space-md)">Active Inference Configuration</h3>
        ${status.inference
          ? `<dl class="sandbox-card__meta">
              <dt>Provider</dt><dd>${status.inference.provider || '—'}</dd>
              <dt>Model</dt><dd>${status.inference.model || '—'}</dd>
              <dt>Endpoint</dt><dd style="word-break:break-all">${status.inference.endpoint || '—'}</dd>
            </dl>`
          : '<div style="color:var(--nc-text-muted)">No active inference configuration detected. OpenShell may not be running.</div>'}
        <div style="margin-top:var(--nc-space-lg)">
          <h4 style="margin-bottom:var(--nc-space-sm)">Inference Routing</h4>
          <p style="color:var(--nc-text-secondary);font-size:var(--nc-text-sm)">
            All inference traffic from the sandbox is routed through <code>inference.local</code> — the OpenShell gateway.
            Credentials remain on the host and are never exposed inside the sandbox.
          </p>
        </div>
      </div>
    </div>
  `;
});

const InferenceManager = {
  showTab(name) {
    ['providers', 'credentials', 'status'].forEach(t => {
      const el = document.getElementById(`inf-tab-${t}`);
      if (el) el.style.display = t === name ? 'block' : 'none';
    });
    document.querySelectorAll('.tab-bar .tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.toLowerCase().includes(name));
    });
  },

  selectProvider(key) {
    document.querySelectorAll('.provider-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.key === key);
    });
    const sel = document.getElementById('switch-provider');
    if (sel) sel.value = key;
    // Auto-fill default model
    NemoClaw.api.get('/api/inference/providers').then(d => {
      const p = d.providers.find(p => p.key === key);
      const modelInput = document.getElementById('switch-model');
      if (p && modelInput && !modelInput.value) {
        modelInput.value = p.defaultModel || '';
      }
    });
  },

  async switchProvider() {
    const providerKey = document.getElementById('switch-provider').value;
    const model = document.getElementById('switch-model').value;
    const result = document.getElementById('switch-result');
    if (!providerKey) {
      NemoClaw.toast('Select a provider', 'warning');
      return;
    }
    try {
      const d = await NemoClaw.api.post('/api/inference/switch', { providerKey, model });
      result.innerHTML = d.success
        ? `<span style="color:var(--nc-status-running)">✓ Switched to ${d.model}</span>`
        : `<span style="color:var(--nc-status-error)">✗ ${d.output}</span>`;
    } catch (err) {
      result.innerHTML = `<span style="color:var(--nc-status-error)">✗ ${err.message}</span>`;
    }
  },

  editCred(key, label) {
    NemoClaw.showModal(`
      <h2>Update ${label} Credential</h2>
      <div class="form-group" style="margin-top:var(--nc-space-lg)">
        <label class="form-label">API Key</label>
        <input class="form-input" id="modal-apikey" type="password" placeholder="Enter new API key">
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="NemoClaw.hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="InferenceManager.saveCred('${key}')">Save</button>
      </div>
    `);
  },

  async saveCred(key) {
    const apiKey = document.getElementById('modal-apikey').value;
    if (!apiKey) return;
    try {
      await NemoClaw.api.post('/api/inference/credentials', { providerKey: key, apiKey });
      NemoClaw.hideModal();
      NemoClaw.toast('Credential updated', 'success');
      NemoClaw.route(); // Refresh page
    } catch (err) {
      NemoClaw.toast(`Failed: ${err.message}`, 'error');
    }
  },
};
