// ══════════════════════════════════════════════════════════════════
// Policies Page — Visual policy editor with toggles, YAML editor,
// preset removal, and baseline reset
// ══════════════════════════════════════════════════════════════════

NemoClaw.registerPage("policies", async () => {
  let presets = [];
  let baseline = {};
  let sandboxes = { sandboxes: [] };

  try { const d = await NemoClaw.api.get("/api/policies/presets"); presets = d.presets; } catch {}
  try { baseline = await NemoClaw.api.get("/api/policies/baseline"); } catch {}
  try { sandboxes = await NemoClaw.api.get("/api/sandboxes"); } catch {}

  const presetIcons = {
    discord: '💬', telegram: '✈️', slack: '💼', docker: '🐳',
    pypi: '🐍', npm: '📦', jira: '📋', outlook: '📧', huggingface: '🤗',
  };

  const presetCards = presets.map(p => `
    <div class="preset-card" id="preset-${p.name}">
      <span class="preset-card__icon">${presetIcons[p.name] || '🔌'}</span>
      <div class="preset-card__info">
        <div class="preset-card__name">${p.name}</div>
        <div class="preset-card__desc">${p.description}</div>
      </div>
      <label class="toggle-preset">
        <input type="checkbox" data-preset="${p.name}" onchange="PolicyManager.togglePreset('${p.name}', this.checked)">
        <span class="toggle-slider"></span>
      </label>
    </div>
  `).join("");

  const sandboxOptions = sandboxes.sandboxes.map(s =>
    `<option value="${s.name}">${s.name}</option>`
  ).join("");

  // Build applied presets for each sandbox
  const sandboxPresetCards = sandboxes.sandboxes
    .filter(s => (s.policies || []).length > 0)
    .map(s => {
      const presetBadges = s.policies.map(p => `
        <span class="status-badge status-badge--info" style="display:inline-flex;align-items:center;gap:var(--nc-space-xs)">
          ${presetIcons[p] || '🔌'} ${p}
          <button class="btn-remove-preset" onclick="PolicyManager.removePreset('${s.name}', '${p}')" title="Remove preset">✕</button>
        </span>
      `).join(" ");
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--nc-space-sm) 0;border-bottom:1px solid var(--nc-glass-border)">
          <div>
            <span style="font-weight:var(--nc-weight-semibold);color:var(--nc-text-primary)">${s.name}</span>
            <div style="margin-top:var(--nc-space-xs)">${presetBadges}</div>
          </div>
          <button class="btn btn-sm btn-ghost" onclick="PolicyManager.resetToBaseline('${s.name}')" title="Reset to baseline">↺ Reset</button>
        </div>`;
    }).join("");

  return `
    <div class="page-header animate-fade">
      <div>
        <h1>Policy Management</h1>
        <div class="page-header__subtitle">Configure network policies for sandboxed agents</div>
      </div>
      <button class="btn btn-secondary" onclick="PolicyManager.validate()">✓ Validate All</button>
    </div>

    <div class="tab-bar">
      <button class="tab-btn active" onclick="PolicyManager.showTab('presets')">Presets</button>
      <button class="tab-btn" onclick="PolicyManager.showTab('baseline')">Baseline</button>
      <button class="tab-btn" onclick="PolicyManager.showTab('custom')">Custom YAML</button>
      <button class="tab-btn" onclick="PolicyManager.showTab('merge')">Merge Preview</button>
    </div>

    <!-- Presets Tab -->
    <div id="policy-tab-presets">
      <div class="split-pane">
        <div>
          <div class="section-header">
            <h3 class="section-title">Available Presets</h3>
            <span class="status-badge status-badge--info">${presets.length} available</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:var(--nc-space-sm)">
            ${presetCards}
          </div>
        </div>

        <div>
          <div class="glass-card-flat">
            <h3 style="margin-bottom:var(--nc-space-md)">Apply to Sandbox</h3>
            <div class="form-group">
              <label class="form-label">Target Sandbox</label>
              <select class="form-select" id="policy-target">
                <option value="">Select a sandbox...</option>
                ${sandboxOptions}
              </select>
            </div>
            <div id="selected-presets" style="margin-bottom:var(--nc-space-md);color:var(--nc-text-muted);font-size:var(--nc-text-sm)">
              No presets selected
            </div>
            <button class="btn btn-primary" id="apply-btn" disabled onclick="PolicyManager.apply()">
              Apply Selected Presets
            </button>
            <div id="apply-result" style="margin-top:var(--nc-space-md)"></div>
          </div>

          ${sandboxPresetCards ? `
          <div class="glass-card-flat" style="margin-top:var(--nc-space-lg)">
            <h3 style="margin-bottom:var(--nc-space-md)">Applied Presets</h3>
            <p style="color:var(--nc-text-secondary);font-size:var(--nc-text-xs);margin-bottom:var(--nc-space-sm)">Click ✕ to remove a preset or ↺ to reset to baseline.</p>
            ${sandboxPresetCards || '<div style="color:var(--nc-text-muted);font-size:var(--nc-text-sm)">No presets applied to any sandbox</div>'}
          </div>` : ''}

          <div class="glass-card-flat" style="margin-top:var(--nc-space-lg)">
            <h3 style="margin-bottom:var(--nc-space-md)">Preset Detail</h3>
            <div id="preset-detail" style="color:var(--nc-text-muted);font-size:var(--nc-text-sm)">
              Toggle a preset to see its details
            </div>
          </div>

          <div id="validate-result" style="margin-top:var(--nc-space-lg)"></div>
        </div>
      </div>
    </div>

    <!-- Baseline Tab -->
    <div id="policy-tab-baseline" style="display:none">
      <div class="glass-card-flat">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--nc-space-md)">
          <h3>Baseline Policy</h3>
          <div style="display:flex;gap:var(--nc-space-md)">
            <span class="status-badge status-badge--info">${baseline.groupCount || 0} groups</span>
            <span class="status-badge status-badge--info">${baseline.endpointCount || 0} endpoints</span>
          </div>
        </div>
        <pre class="code-block">${baseline.yaml ? escapeHtml(baseline.yaml) : 'No baseline loaded'}</pre>
      </div>
    </div>

    <!-- Custom YAML Tab -->
    <div id="policy-tab-custom" style="display:none">
      <div class="glass-card-flat">
        <h3 style="margin-bottom:var(--nc-space-md)">Custom Policy Editor</h3>
        <p style="color:var(--nc-text-secondary);font-size:var(--nc-text-sm);margin-bottom:var(--nc-space-lg)">
          Write or paste a YAML policy file to apply directly to a running sandbox. This uses <code>openshell policy set</code> and the change takes effect immediately. Dynamic changes reset when the sandbox restarts.
        </p>
        <div class="form-group">
          <label class="form-label">Target Sandbox</label>
          <select class="form-select" id="custom-policy-target">
            <option value="">Select a sandbox...</option>
            ${sandboxOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Policy YAML</label>
          <textarea class="form-input yaml-editor" id="custom-policy-yaml" rows="18" placeholder="network_policies:
  my-custom-rule:
    name: Custom Endpoints
    endpoints:
      - host: api.example.com
        port: 443
        protocol: rest
        access: full
    binaries:
      - path: /usr/bin/curl
      - path: /usr/bin/python3"
            spellcheck="false"
          ></textarea>
        </div>
        <div style="display:flex;gap:var(--nc-space-md)">
          <button class="btn btn-primary" onclick="PolicyManager.applyCustom()">🚀 Apply Custom Policy</button>
          <button class="btn btn-secondary" onclick="PolicyManager.loadBaselineIntoEditor()">📋 Load Baseline Template</button>
        </div>
        <div id="custom-policy-result" style="margin-top:var(--nc-space-md)"></div>
      </div>
    </div>

    <!-- Merge Preview Tab -->
    <div id="policy-tab-merge" style="display:none">
      <div class="glass-card-flat">
        <h3 style="margin-bottom:var(--nc-space-md)">Merge Preview</h3>
        <p style="color:var(--nc-text-secondary);font-size:var(--nc-text-sm);margin-bottom:var(--nc-space-md)">
          Select presets above and view the merged result here.
        </p>
        <button class="btn btn-secondary" onclick="PolicyManager.previewMerge()">Generate Merge Preview</button>
        <div id="merge-preview" style="margin-top:var(--nc-space-lg)"></div>
      </div>
    </div>
  `;
});

const PolicyManager = {
  selectedPresets: new Set(),

  showTab(name) {
    ['presets', 'baseline', 'custom', 'merge'].forEach(t => {
      const el = document.getElementById(`policy-tab-${t}`);
      if (el) el.style.display = t === name ? 'block' : 'none';
    });
    document.querySelectorAll('.tab-bar .tab-btn').forEach(btn => {
      const btnText = btn.textContent.toLowerCase().replace(/\s+/g, '');
      const tabLabel = name === 'custom' ? 'customyaml' : name === 'merge' ? 'mergepreview' : name;
      btn.classList.toggle('active', btnText.includes(tabLabel) || btnText === name);
    });
  },

  togglePreset(name, checked) {
    if (checked) this.selectedPresets.add(name);
    else this.selectedPresets.delete(name);

    const el = document.getElementById('selected-presets');
    const btn = document.getElementById('apply-btn');
    if (this.selectedPresets.size > 0) {
      el.innerHTML = [...this.selectedPresets].map(p =>
        `<span class="status-badge status-badge--info">${p}</span>`
      ).join(' ');
      btn.disabled = false;
    } else {
      el.textContent = 'No presets selected';
      btn.disabled = true;
    }

    // Show preset detail
    if (checked) this.showPresetDetail(name);

    // Mark card
    const card = document.getElementById(`preset-${name}`);
    if (card) card.classList.toggle('active', checked);
  },

  async showPresetDetail(name) {
    const detail = document.getElementById('preset-detail');
    try {
      const preset = await NemoClaw.api.get(`/api/policies/presets/${name}`);
      const netPols = preset.network_policies || {};
      let html = '';
      for (const [key, pol] of Object.entries(netPols)) {
        html += `<div style="margin-bottom:var(--nc-space-md)">`;
        html += `<div style="font-weight:var(--nc-weight-semibold);color:var(--nc-text-primary)">${pol.name || key}</div>`;
        for (const ep of pol.endpoints || []) {
          const mode = ep.access === 'full' ? '🔗 CONNECT' : ep.protocol === 'rest' ? '📡 L7 REST' : '⬡ Passthrough';
          html += `<div style="margin-left:var(--nc-space-md);font-family:var(--nc-font-mono);font-size:var(--nc-text-xs)">→ ${ep.host}:${ep.port} ${mode}</div>`;
        }
        html += '</div>';
      }
      detail.innerHTML = html || 'No network policies defined';
    } catch {
      detail.textContent = 'Failed to load detail';
    }
  },

  async apply() {
    const sandbox = document.getElementById('policy-target').value;
    const result = document.getElementById('apply-result');
    if (!sandbox) {
      NemoClaw.toast('Select a target sandbox first', 'warning');
      return;
    }
    const presets = [...this.selectedPresets];
    try {
      const d = await NemoClaw.api.post('/api/policies/apply', { sandbox, presets });
      result.innerHTML = d.success
        ? `<span style="color:var(--nc-status-running)">✓ Applied ${presets.join(', ')} to ${sandbox}</span>`
        : `<span style="color:var(--nc-status-error)">✗ Failed to apply</span>`;
      if (d.success) NemoClaw.toast(`Policies applied to '${sandbox}'`, 'success');
    } catch (err) {
      result.innerHTML = `<span style="color:var(--nc-status-error)">✗ ${err.message}</span>`;
    }
  },

  async applyCustom() {
    const sandbox = document.getElementById('custom-policy-target').value;
    const yaml = document.getElementById('custom-policy-yaml').value;
    const result = document.getElementById('custom-policy-result');

    if (!sandbox) {
      NemoClaw.toast('Select a target sandbox first', 'warning');
      return;
    }
    if (!yaml.trim()) {
      NemoClaw.toast('Enter YAML policy content', 'warning');
      return;
    }

    result.innerHTML = '<div class="loading-state"><div class="spinner spinner-sm"></div> Applying...</div>';

    try {
      const d = await NemoClaw.api.post('/api/policies/custom', { sandbox, yaml });
      result.innerHTML = `<span style="color:var(--nc-status-running)">✓ ${d.message}</span>`;
      NemoClaw.toast(`Custom policy applied to '${sandbox}'`, 'success');
    } catch (err) {
      result.innerHTML = `<span style="color:var(--nc-status-error)">✗ ${err.message}</span>`;
      NemoClaw.toast('Failed to apply custom policy', 'error');
    }
  },

  async loadBaselineIntoEditor() {
    try {
      const d = await NemoClaw.api.get('/api/policies/baseline');
      const editor = document.getElementById('custom-policy-yaml');
      if (editor && d.yaml) {
        editor.value = d.yaml;
        NemoClaw.toast('Baseline template loaded into editor', 'info');
      }
    } catch (err) {
      NemoClaw.toast('Failed to load baseline', 'error');
    }
  },

  async removePreset(sandbox, preset) {
    if (!confirm(`Remove preset '${preset}' from sandbox '${sandbox}'?\n\nThis will recompute the policy from remaining presets.`)) return;

    try {
      const d = await NemoClaw.api.del(`/api/policies/${sandbox}/presets/${preset}`);
      if (d.success) {
        NemoClaw.toast(`Preset '${preset}' removed from '${sandbox}'`, 'success');
        NemoClaw.route(); // refresh page
      } else {
        NemoClaw.toast('Failed to remove preset', 'error');
      }
    } catch (err) {
      NemoClaw.toast(`Error: ${err.message}`, 'error');
    }
  },

  async resetToBaseline(sandbox) {
    if (!confirm(`Reset sandbox '${sandbox}' to baseline policy?\n\nAll preset policies will be removed.`)) return;

    try {
      const d = await NemoClaw.api.post(`/api/policies/${sandbox}/reset`);
      if (d.success) {
        NemoClaw.toast(`Sandbox '${sandbox}' reset to baseline policy`, 'success');
        NemoClaw.route(); // refresh page
      } else {
        NemoClaw.toast('Failed to reset policy', 'error');
      }
    } catch (err) {
      NemoClaw.toast(`Error: ${err.message}`, 'error');
    }
  },

  async previewMerge() {
    const presets = [...this.selectedPresets];
    if (presets.length === 0) {
      NemoClaw.toast('Select at least one preset', 'warning');
      return;
    }
    const preview = document.getElementById('merge-preview');
    try {
      const d = await NemoClaw.api.post('/api/policies/merge', { presets });
      preview.innerHTML = `
        <div style="display:flex;gap:var(--nc-space-md);margin-bottom:var(--nc-space-md)">
          <span class="status-badge status-badge--info">${d.policyCount} groups</span>
          <span class="status-badge status-badge--info">${d.endpointCount} endpoints</span>
        </div>
        <pre class="code-block">${escapeHtml(d.yaml)}</pre>`;
    } catch (err) {
      preview.innerHTML = `<span style="color:var(--nc-status-error)">✗ ${err.message}</span>`;
    }
  },

  async validate() {
    const result = document.getElementById('validate-result');
    result.innerHTML = '<div class="loading-state"><div class="spinner spinner-sm"></div> Validating...</div>';
    try {
      const d = await NemoClaw.api.post('/api/policies/validate');
      let html = `<div class="glass-card-flat"><h3 style="margin-bottom:var(--nc-space-md)">${d.valid ? '✓' : '✗'} Validation Results</h3>`;
      for (const r of d.results) {
        const icon = r.valid ? '✅' : '❌';
        html += `<div style="padding:var(--nc-space-xs) 0">${icon} ${r.type}${r.name ? ': ' + r.name : ''} — ${r.groups ? r.groups + ' groups' : r.error || ''}</div>`;
      }
      html += '</div>';
      result.innerHTML = html;
      NemoClaw.toast(d.valid ? 'All policies valid' : `${d.errors} error(s) found`, d.valid ? 'success' : 'error');
    } catch (err) {
      result.innerHTML = `<span style="color:var(--nc-status-error)">✗ ${err.message}</span>`;
    }
  },
};

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
