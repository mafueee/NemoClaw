// ══════════════════════════════════════════════════════════════════
// Workspace Page — Agent identity file browser and editor
// ══════════════════════════════════════════════════════════════════

NemoClaw.registerPage("workspace", async () => {
  let sandboxes = { sandboxes: [] };
  try { sandboxes = await NemoClaw.api.get("/api/sandboxes"); } catch {}

  const sandboxOptions = sandboxes.sandboxes.map(s =>
    `<option value="${s.name}">${s.name}</option>`
  ).join("");

  return `
    <div class="page-header animate-fade">
      <div>
        <h1>Workspace Files</h1>
        <div class="page-header__subtitle">Edit agent identity, memory, and configuration files</div>
      </div>
    </div>

    <div class="form-group" style="max-width:400px;margin-bottom:var(--nc-space-xl)">
      <label class="form-label">Sandbox</label>
      <select class="form-select" id="ws-sandbox" onchange="WorkspaceManager.loadFiles()">
        <option value="">Select a sandbox...</option>
        ${sandboxOptions}
      </select>
    </div>

    <div class="split-pane-sidebar" id="ws-layout" style="display:none">
      <!-- File list -->
      <div>
        <div class="glass-card-flat">
          <h3 style="margin-bottom:var(--nc-space-md)">Files</h3>
          <div id="ws-file-list">
            <div class="loading-state"><div class="spinner spinner-sm"></div></div>
          </div>
        </div>

        <div class="glass-card-flat" style="margin-top:var(--nc-space-lg)">
          <h3 style="margin-bottom:var(--nc-space-md)">Backups</h3>
          <button class="btn btn-sm btn-secondary" onclick="WorkspaceManager.createBackup()" style="margin-bottom:var(--nc-space-md)">💾 Create Backup</button>
          <div id="ws-backups" style="font-size:var(--nc-text-sm);color:var(--nc-text-muted)">
            Select a sandbox to view backups
          </div>
        </div>
      </div>

      <!-- Editor -->
      <div>
        <div class="glass-card-flat" id="ws-editor-panel">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--nc-space-md)">
            <h3 id="ws-editor-title">Select a file to edit</h3>
            <button class="btn btn-sm btn-primary" id="ws-save-btn" style="display:none" onclick="WorkspaceManager.saveFile()">💾 Save</button>
          </div>
          <div id="ws-editor-desc" style="font-size:var(--nc-text-sm);color:var(--nc-text-secondary);margin-bottom:var(--nc-space-md)"></div>
          <textarea class="form-textarea" id="ws-editor" style="min-height:500px;display:none"></textarea>
          <div id="ws-editor-empty" style="color:var(--nc-text-muted);text-align:center;padding:var(--nc-space-3xl)">
            Select a file from the file list to open the editor
          </div>
        </div>
      </div>
    </div>
  `;
});

const WorkspaceManager = {
  currentFile: null,
  currentSandbox: null,

  async loadFiles() {
    const sandbox = document.getElementById('ws-sandbox').value;
    if (!sandbox) return;
    this.currentSandbox = sandbox;
    document.getElementById('ws-layout').style.display = 'grid';

    // Load files
    try {
      const d = await NemoClaw.api.get(`/api/workspace/${sandbox}/files`);
      const list = document.getElementById('ws-file-list');
      list.innerHTML = d.files.map(f => `
        <div class="preset-card" style="cursor:pointer;margin-bottom:var(--nc-space-xs)" onclick="WorkspaceManager.openFile('${f.name}', '${f.description}')">
          <span class="preset-card__icon">${f.name.endsWith('.md') ? '📄' : '📁'}</span>
          <div class="preset-card__info">
            <div class="preset-card__name">${f.name}</div>
            <div class="preset-card__desc">${f.description}</div>
          </div>
          <span class="status-badge ${f.exists ? 'status-badge--running' : 'status-badge--stopped'}">${f.exists ? '✓' : '—'}</span>
        </div>
      `).join('');
    } catch (err) {
      document.getElementById('ws-file-list').innerHTML =
        `<div style="color:var(--nc-status-error)">${err.message}</div>`;
    }

    // Load backups
    try {
      const d = await NemoClaw.api.get(`/api/workspace/${sandbox}/backups`);
      const el = document.getElementById('ws-backups');
      if (d.backups.length === 0) {
        el.innerHTML = 'No backups found';
      } else {
        el.innerHTML = d.backups.map(b => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--nc-space-sm) 0;border-bottom:1px solid rgba(71,85,105,0.15)">
            <div>
              <div style="font-weight:var(--nc-weight-medium);color:var(--nc-text-primary)">${b.timestamp}</div>
              <div style="font-size:var(--nc-text-xs)">${b.files.length} file(s)</div>
            </div>
            <button class="btn btn-sm btn-ghost" onclick="WorkspaceManager.restore('${b.timestamp}')">Restore</button>
          </div>
        `).join('');
      }
    } catch {
      document.getElementById('ws-backups').textContent = 'Could not load backups';
    }
  },

  async openFile(name, desc) {
    this.currentFile = name;
    document.getElementById('ws-editor-title').textContent = name;
    document.getElementById('ws-editor-desc').textContent = desc;
    document.getElementById('ws-editor-empty').style.display = 'none';
    document.getElementById('ws-editor').style.display = 'block';
    document.getElementById('ws-save-btn').style.display = 'inline-flex';

    try {
      const d = await NemoClaw.api.get(`/api/workspace/${this.currentSandbox}/files/${name}`);
      document.getElementById('ws-editor').value = d.content;
    } catch {
      document.getElementById('ws-editor').value = '# File not found or sandbox not running';
    }
  },

  async saveFile() {
    if (!this.currentFile || !this.currentSandbox) return;
    const content = document.getElementById('ws-editor').value;
    try {
      await NemoClaw.api.put(
        `/api/workspace/${this.currentSandbox}/files/${this.currentFile}`,
        { content }
      );
      NemoClaw.toast(`Saved ${this.currentFile}`, 'success');
    } catch (err) {
      NemoClaw.toast(`Save failed: ${err.message}`, 'error');
    }
  },

  async createBackup() {
    if (!this.currentSandbox) return;
    try {
      const d = await NemoClaw.api.post(`/api/workspace/${this.currentSandbox}/backup`);
      NemoClaw.toast(`Backup created: ${d.files.length} files`, 'success');
      this.loadFiles(); // Refresh backup list
    } catch (err) {
      NemoClaw.toast(`Backup failed: ${err.message}`, 'error');
    }
  },

  async restore(timestamp) {
    if (!this.currentSandbox) return;
    NemoClaw.showModal(`
      <h2>Restore Backup</h2>
      <p style="color:var(--nc-text-secondary);margin:var(--nc-space-md) 0">
        Restore workspace files from backup <strong>${timestamp}</strong> to sandbox <strong>${this.currentSandbox}</strong>?
      </p>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="NemoClaw.hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="WorkspaceManager.doRestore('${timestamp}')">Restore</button>
      </div>
    `);
  },

  async doRestore(timestamp) {
    try {
      const d = await NemoClaw.api.post(`/api/workspace/${this.currentSandbox}/restore`, { timestamp });
      NemoClaw.hideModal();
      NemoClaw.toast(`Restored ${d.restored.length} files`, 'success');
    } catch (err) {
      NemoClaw.toast(`Restore failed: ${err.message}`, 'error');
    }
  },
};
