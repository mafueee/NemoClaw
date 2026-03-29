// ══════════════════════════════════════════════════════════════════
// Onboard Page — Multi-step sandbox creation wizard
// ══════════════════════════════════════════════════════════════════

NemoClaw.registerPage("onboard", async () => {
  let providers = [];
  let system = {};
  try { const d = await NemoClaw.api.get("/api/inference/providers"); providers = d.providers; } catch {}
  try { system = await NemoClaw.api.get("/api/system/preflight"); } catch {}

  const providerCards = providers
    .filter((p) => !p.custom)
    .map((p) => `
      <div class="provider-card" data-key="${p.key}" onclick="OnboardWizard.selectProvider('${p.key}')">
        <div class="provider-card__icon">${getProviderIcon(p.key)}</div>
        <div class="provider-card__name">${p.label}</div>
        <div class="provider-card__type">${p.type} · ${p.local ? 'Local' : 'Cloud'}</div>
        ${p.hasCredential ? '<div style="color:var(--nc-status-running);font-size:var(--nc-text-xs);margin-top:4px">✓ Key stored</div>' : ''}
      </div>
    `).join("");

  const customCards = providers
    .filter((p) => p.custom)
    .map((p) => `
      <div class="provider-card" data-key="${p.key}" onclick="OnboardWizard.selectProvider('${p.key}')">
        <div class="provider-card__icon">🔌</div>
        <div class="provider-card__name">${p.label}</div>
        <div class="provider-card__type">${p.compatible}-compatible</div>
      </div>
    `).join("");

  return `
    <div class="page-header animate-fade">
      <div>
        <h1>Onboarding Wizard</h1>
        <div class="page-header__subtitle">Set up a new sandboxed AI agent in 5 steps</div>
      </div>
    </div>

    <div class="wizard-steps" id="wizard-steps">
      <div class="wizard-step active" data-step="1"><span class="wizard-step__number">1</span><span>Preflight</span></div>
      <div class="wizard-step" data-step="2"><span class="wizard-step__number">2</span><span>Provider</span></div>
      <div class="wizard-step" data-step="3"><span class="wizard-step__number">3</span><span>Credentials</span></div>
      <div class="wizard-step" data-step="4"><span class="wizard-step__number">4</span><span>Model</span></div>
      <div class="wizard-step" data-step="5"><span class="wizard-step__number">5</span><span>Create</span></div>
    </div>

    <div class="glass-card-flat animate-slide" id="wizard-content">
      <!-- Step 1: Preflight -->
      <div id="step-1">
        <h3 style="margin-bottom: var(--nc-space-lg)">Preflight Checks</h3>
        <div style="display: flex; flex-direction: column; gap: var(--nc-space-md)">
          <div class="preflight-item" style="display:flex;align-items:center;gap:var(--nc-space-md);padding:var(--nc-space-md);background:var(--nc-bg-secondary);border-radius:var(--nc-radius-md)">
            <span style="font-size:1.5rem">${system.checks?.docker?.available ? '✅' : '❌'}</span>
            <div>
              <div style="font-weight:var(--nc-weight-semibold)">Docker</div>
              <div style="font-size:var(--nc-text-sm);color:var(--nc-text-secondary)">${system.checks?.docker?.message || 'Checking...'}</div>
            </div>
          </div>
          <div class="preflight-item" style="display:flex;align-items:center;gap:var(--nc-space-md);padding:var(--nc-space-md);background:var(--nc-bg-secondary);border-radius:var(--nc-radius-md)">
            <span style="font-size:1.5rem">${system.checks?.openshell?.available ? '✅' : '⚠️'}</span>
            <div>
              <div style="font-weight:var(--nc-weight-semibold)">OpenShell CLI</div>
              <div style="font-size:var(--nc-text-sm);color:var(--nc-text-secondary)">${system.checks?.openshell?.message || 'Checking...'}</div>
            </div>
          </div>
          <div class="preflight-item" style="display:flex;align-items:center;gap:var(--nc-space-md);padding:var(--nc-space-md);background:var(--nc-bg-secondary);border-radius:var(--nc-radius-md)">
            <span style="font-size:1.5rem">${system.checks?.port?.available ? '✅' : '⚠️'}</span>
            <div>
              <div style="font-weight:var(--nc-weight-semibold)">Port 18789</div>
              <div style="font-size:var(--nc-text-sm);color:var(--nc-text-secondary)">${system.checks?.port?.available ? 'Available' : 'In use by PID(s): ' + (system.checks?.port?.conflicting || []).join(', ')}</div>
            </div>
          </div>
        </div>
        <div style="margin-top:var(--nc-space-xl);display:flex;justify-content:flex-end">
          <button class="btn btn-primary" onclick="OnboardWizard.goStep(2)">Continue →</button>
        </div>
      </div>

      <!-- Step 2: Provider -->
      <div id="step-2" style="display:none">
        <h3 style="margin-bottom: var(--nc-space-lg)">Select Inference Provider</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:var(--nc-space-md)">
          ${providerCards}
        </div>
        <div style="margin-top:var(--nc-space-lg)">
          <h4 style="color:var(--nc-text-secondary);font-size:var(--nc-text-sm);margin-bottom:var(--nc-space-sm)">Custom Endpoints</h4>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:var(--nc-space-md)">
            ${customCards}
          </div>
        </div>
        <div style="margin-top:var(--nc-space-xl);display:flex;justify-content:space-between">
          <button class="btn btn-ghost" onclick="OnboardWizard.goStep(1)">← Back</button>
          <button class="btn btn-primary" id="step2-next" disabled onclick="OnboardWizard.goStep(3)">Continue →</button>
        </div>
      </div>

      <!-- Step 3: Credentials -->
      <div id="step-3" style="display:none">
        <h3 style="margin-bottom: var(--nc-space-lg)">Configure Credentials</h3>
        <div id="cred-form">
          <div class="form-group" id="endpoint-group" style="display:none">
            <label class="form-label">Endpoint URL</label>
            <input class="form-input" id="cred-endpoint" placeholder="https://your-endpoint.com/v1">
          </div>
          <div class="form-group">
            <label class="form-label" id="cred-label">API Key</label>
            <input class="form-input" id="cred-apikey" type="password" placeholder="sk-...">
          </div>
          <button class="btn btn-secondary" onclick="OnboardWizard.validateCreds()" id="validate-btn">Validate Credentials</button>
          <div id="validate-result" style="margin-top:var(--nc-space-md)"></div>
        </div>
        <div style="margin-top:var(--nc-space-xl);display:flex;justify-content:space-between">
          <button class="btn btn-ghost" onclick="OnboardWizard.goStep(2)">← Back</button>
          <button class="btn btn-primary" onclick="OnboardWizard.goStep(4)">Continue →</button>
        </div>
      </div>

      <!-- Step 4: Model -->
      <div id="step-4" style="display:none">
        <h3 style="margin-bottom: var(--nc-space-lg)">Select Model</h3>
        <div class="form-group">
          <label class="form-label">Model Name</label>
          <input class="form-input" id="model-input" placeholder="e.g. nvidia/nemotron-3-super-120b-a12b">
          <div style="font-size:var(--nc-text-xs);color:var(--nc-text-muted);margin-top:var(--nc-space-sm)" id="model-hint"></div>
        </div>
        <div style="margin-top:var(--nc-space-xl);display:flex;justify-content:space-between">
          <button class="btn btn-ghost" onclick="OnboardWizard.goStep(3)">← Back</button>
          <button class="btn btn-primary" onclick="OnboardWizard.goStep(5)">Continue →</button>
        </div>
      </div>

      <!-- Step 5: Create -->
      <div id="step-5" style="display:none">
        <h3 style="margin-bottom: var(--nc-space-lg)">Create Sandbox</h3>
        <div class="form-group">
          <label class="form-label">Sandbox Name</label>
          <input class="form-input" id="sandbox-name" placeholder="my-assistant" value="my-assistant">
          <div style="font-size:var(--nc-text-xs);color:var(--nc-text-muted);margin-top:var(--nc-space-sm)">Lowercase, alphanumeric with hyphens</div>
        </div>
        <div class="glass-card" style="margin:var(--nc-space-lg) 0" id="summary-card">
          <!-- Filled by JS -->
        </div>
        <div style="display:flex;justify-content:space-between">
          <button class="btn btn-ghost" onclick="OnboardWizard.goStep(4)">← Back</button>
          <button class="btn btn-primary" id="create-btn" onclick="OnboardWizard.create()">🚀 Create Sandbox</button>
        </div>
        <div id="create-result" style="margin-top:var(--nc-space-lg)"></div>
      </div>
    </div>
  `;
});

function getProviderIcon(key) {
  const icons = { nvidia: '🟢', openai: '🤖', anthropic: '🧬', gemini: '💎', ollama: '🦙' };
  return icons[key] || '🔌';
}

// ── Wizard State Machine ─────────────────────────────────────────
const OnboardWizard = {
  state: { step: 1, provider: null, apiKey: '', endpoint: '', model: '' },

  goStep(n) {
    // Hide all steps
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById(`step-${i}`);
      if (el) el.style.display = i === n ? 'block' : 'none';
    }
    // Update step indicators
    document.querySelectorAll('.wizard-step').forEach((s) => {
      const sn = parseInt(s.dataset.step);
      s.classList.remove('active', 'completed');
      if (sn === n) s.classList.add('active');
      else if (sn < n) s.classList.add('completed');
    });
    this.state.step = n;

    // Step-specific logic
    if (n === 3 && this.state.provider) {
      const p = this.state.provider;
      document.getElementById('cred-label').textContent = p.credentialEnv || 'API Key';
      document.getElementById('endpoint-group').style.display = p.custom ? 'block' : 'none';
      if (p.hasCredential) {
        document.getElementById('validate-result').innerHTML =
          '<span style="color:var(--nc-status-running)">✓ Existing key found</span>';
      }
    }
    if (n === 4 && this.state.provider) {
      const modelInput = document.getElementById('model-input');
      if (this.state.provider.defaultModel && !modelInput.value) {
        modelInput.value = this.state.provider.defaultModel;
      }
      document.getElementById('model-hint').textContent =
        `Default: ${this.state.provider.defaultModel || 'none'}`;
    }
    if (n === 5) {
      this.updateSummary();
    }
  },

  selectProvider(key) {
    NemoClaw.api.get('/api/inference/providers')
      .then(d => {
        this.state.provider = d.providers.find(p => p.key === key);
        document.querySelectorAll('.provider-card').forEach(c => {
          c.classList.toggle('selected', c.dataset.key === key);
        });
        document.getElementById('step2-next').disabled = false;
      })
      .catch(err => {
        NemoClaw.toast("Failed to load providers: " + err.message, "error");
      });
  },

  async validateCreds() {
    const btn = document.getElementById('validate-btn');
    const result = document.getElementById('validate-result');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-sm" style="display:inline-block"></span> Validating...';
    result.innerHTML = '';

    try {
      const data = await NemoClaw.api.post('/api/inference/validate', {
        providerKey: this.state.provider.key,
        apiKey: document.getElementById('cred-apikey').value,
        endpoint: document.getElementById('cred-endpoint').value,
      });
      result.innerHTML = data.valid
        ? '<span style="color:var(--nc-status-running)">✓ Credentials validated</span>'
        : `<span style="color:var(--nc-status-error)">✗ ${data.error}</span>`;
    } catch (err) {
      result.innerHTML = `<span style="color:var(--nc-status-error)">✗ ${err.message}</span>`;
    }
    btn.disabled = false;
    btn.textContent = 'Validate Credentials';
  },

  updateSummary() {
    const p = this.state.provider;
    const model = document.getElementById('model-input')?.value || p?.defaultModel || '—';
    const name = document.getElementById('sandbox-name')?.value || 'my-assistant';
    document.getElementById('summary-card').innerHTML = `
      <h4 style="margin-bottom:var(--nc-space-md);color:var(--nc-accent)">Summary</h4>
      <dl class="sandbox-card__meta">
        <dt>Provider</dt><dd>${p?.label || '—'}</dd>
        <dt>Model</dt><dd>${model}</dd>
        <dt>Sandbox</dt><dd>${name}</dd>
        <dt>Endpoint</dt><dd style="word-break:break-all">${p?.endpoint || document.getElementById('cred-endpoint')?.value || '—'}</dd>
        <dt>Policy</dt><dd>Baseline (openclaw-sandbox.yaml)</dd>
      </dl>
    `;
  },

  async create() {
    const btn = document.getElementById('create-btn');
    const result = document.getElementById('create-result');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-sm" style="display:inline-block"></span> Creating...';

    try {
      const data = await NemoClaw.api.post('/api/sandboxes', {
        name: document.getElementById('sandbox-name').value || 'my-assistant',
        provider: this.state.provider.key,
        model: document.getElementById('model-input').value || this.state.provider.defaultModel,
        apiKey: document.getElementById('cred-apikey')?.value || '',
        endpoint: document.getElementById('cred-endpoint')?.value || '',
      });
      result.innerHTML = `
        <div class="glass-card" style="border-color:var(--nc-status-running)">
          <h4 style="color:var(--nc-status-running);margin-bottom:var(--nc-space-md)">✓ Sandbox Created</h4>
          <p style="color:var(--nc-text-secondary);margin-bottom:var(--nc-space-md)">${data.openshell?.message || 'Registered successfully'}</p>
          <button class="btn btn-primary" onclick="location.hash='#/sandbox/${data.name}'">View Sandbox →</button>
        </div>`;
      NemoClaw.toast(`Sandbox '${data.name}' created!`, 'success');
    } catch (err) {
      result.innerHTML = `<div style="color:var(--nc-status-error)">✗ ${err.message}</div>`;
      btn.disabled = false;
      btn.textContent = '🚀 Create Sandbox';
    }
  },
};
