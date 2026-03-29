// ══════════════════════════════════════════════════════════════════
// Dashboard Page — Sandbox overview with live status cards and
// auxiliary service health
// ══════════════════════════════════════════════════════════════════

NemoClaw.registerPage("dashboard", async () => {
  let data = { sandboxes: [], unregistered: [], total: 0 };
  let system = { healthy: false, checks: {} };
  let version = {};
  let serviceStatus = { services: { telegram: {}, cloudflared: {} } };

  try { data = await NemoClaw.api.get("/api/sandboxes"); } catch {}
  try { system = await NemoClaw.api.get("/api/system/preflight"); } catch {}
  try { version = await NemoClaw.api.get("/api/system/version"); } catch {}
  try { serviceStatus = await NemoClaw.api.get("/api/system/services/status"); } catch {}

  const allSandboxes = [...data.sandboxes, ...data.unregistered];
  const running = allSandboxes.filter((s) => s.running).length;
  const stopped = allSandboxes.length - running;

  const tgSvc = serviceStatus.services?.telegram || {};
  const cfSvc = serviceStatus.services?.cloudflared || {};
  const auxRunning = (tgSvc.running ? 1 : 0) + (cfSvc.running ? 1 : 0);
  const auxTotal = 2;

  const sandboxCards = allSandboxes.length > 0
    ? allSandboxes.map((sb, i) => `
        <div class="sandbox-card animate-fade stagger-${(i % 6) + 1}" onclick="location.hash='#/sandbox/${sb.name}'">
          <div class="sandbox-card__header">
            <div class="sandbox-card__name">${sb.name}</div>
            <span class="status-badge status-badge--${sb.running ? 'running' : 'stopped'}">
              <span class="status-dot-inline ${sb.running ? 'running' : 'stopped'}"></span>
              ${sb.running ? 'Running' : 'Stopped'}
            </span>
          </div>
          <dl class="sandbox-card__meta">
            <dt>Provider</dt><dd>${sb.providerLabel || '—'}</dd>
            <dt>Model</dt><dd>${sb.model || '—'}</dd>
            <dt>Policies</dt><dd>${(sb.policies || []).length > 0 ? sb.policies.join(', ') : 'none'}</dd>
            <dt>Created</dt><dd>${sb.createdAt ? new Date(sb.createdAt).toLocaleDateString() : '—'}</dd>
          </dl>
          <div class="sandbox-card__actions">
            <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); location.hash='#/sandbox/${sb.name}'">Details</button>
            <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); NemoClaw.navigateTo('#/monitoring?sandbox=${sb.name}')">Logs</button>
          </div>
        </div>
      `).join("")
    : `<div class="empty-state" style="grid-column: 1/-1">
        <div class="empty-state__icon">🦖</div>
        <div class="empty-state__title">No Sandboxes Yet</div>
        <div class="empty-state__desc">Create your first sandboxed AI agent with the Onboarding Wizard. Configure provider, model, and policy in minutes.</div>
        <button class="btn btn-primary" onclick="location.hash='#/onboard'">🚀 Create Sandbox</button>
      </div>`;

  const dockerStatus = system.checks?.docker?.available ? '✓' : '✗';
  const osStatus = system.checks?.openshell?.available ? '✓' : '✗';
  const portStatus = system.checks?.port?.available ? '✓' : '✗';

  return `
    <div class="page-header animate-fade">
      <div>
        <h1>Dashboard</h1>
        <div class="page-header__subtitle">Sandbox lifecycle management and system overview</div>
      </div>
      <button class="btn btn-primary" onclick="location.hash='#/onboard'">🚀 New Sandbox</button>
    </div>

    <div class="stat-grid">
      <div class="stat-card animate-fade stagger-1">
        <div class="stat-card__value">${allSandboxes.length}</div>
        <div class="stat-card__label">Total Sandboxes</div>
      </div>
      <div class="stat-card animate-fade stagger-2">
        <div class="stat-card__value" style="color: var(--nc-status-running)">${running}</div>
        <div class="stat-card__label">Running</div>
      </div>
      <div class="stat-card animate-fade stagger-3">
        <div class="stat-card__value" style="color: var(--nc-status-stopped)">${stopped}</div>
        <div class="stat-card__label">Stopped</div>
      </div>
      <div class="stat-card animate-fade stagger-4">
        <div class="stat-card__value" style="font-size: var(--nc-text-sm); line-height: 2.4">
          Docker ${dockerStatus} &nbsp; OpenShell ${osStatus} &nbsp; Port ${portStatus}
        </div>
        <div class="stat-card__label">System Health</div>
      </div>
    </div>

    <!-- Auxiliary Services Status -->
    <div class="glass-card-flat animate-slide stagger-5" style="margin-top:var(--nc-space-lg);margin-bottom:var(--nc-space-lg)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--nc-space-md)">
        <h3>⚡ Auxiliary Services</h3>
        <div style="display:flex;gap:var(--nc-space-md);align-items:center">
          <span class="status-badge status-badge--${auxRunning > 0 ? 'running' : 'stopped'}">${auxRunning}/${auxTotal} active</span>
          <a href="#/deploy" class="btn btn-sm btn-ghost" style="text-decoration:none">Manage →</a>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--nc-space-md)">
        <div style="display:flex;align-items:center;gap:var(--nc-space-sm);padding:var(--nc-space-sm) var(--nc-space-md);border-radius:var(--nc-radius-md);background:var(--nc-surface-secondary)">
          <span class="status-dot-inline ${tgSvc.running ? 'running' : 'stopped'}"></span>
          <span style="font-size:var(--nc-text-sm)">✈️ Telegram Bridge</span>
          <span style="margin-left:auto;font-size:var(--nc-text-xs);color:var(--nc-text-muted)">${tgSvc.running ? 'Active' : tgSvc.configured ? 'Configured' : 'Not configured'}</span>
        </div>
        <div style="display:flex;align-items:center;gap:var(--nc-space-sm);padding:var(--nc-space-sm) var(--nc-space-md);border-radius:var(--nc-radius-md);background:var(--nc-surface-secondary)">
          <span class="status-dot-inline ${cfSvc.running ? 'running' : 'stopped'}"></span>
          <span style="font-size:var(--nc-text-sm)">☁️ Cloudflared Tunnel</span>
          <span style="margin-left:auto;font-size:var(--nc-text-xs);color:var(--nc-text-muted)">${cfSvc.running ? 'Active' : 'Inactive'}</span>
        </div>
      </div>
    </div>

    <div class="section-header">
      <h2 class="section-title">Sandboxes</h2>
    </div>
    <div class="card-grid">${sandboxCards}</div>

    <div style="margin-top: var(--nc-space-2xl); padding-top: var(--nc-space-lg); border-top: 1px solid var(--nc-glass-border)">
      <div style="font-size: var(--nc-text-xs); color: var(--nc-text-muted); display: flex; gap: var(--nc-space-xl)">
        <span>GUI v${version.gui || '1.0.0'}</span>
        <span>Blueprint v${version.blueprint || '?'}</span>
        <span>Node ${version.node || '?'}</span>
        <span>${version.platform || '?'}/${version.arch || '?'}</span>
      </div>
    </div>
  `;
});
