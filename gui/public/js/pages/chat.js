// ══════════════════════════════════════════════════════════════════
// Chat Page — Interactive Sandbox Communication
// ══════════════════════════════════════════════════════════════════

window.ChatPage = {
  async sendMessage(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('chat-input');
    const sandbox = document.getElementById('chat-sandbox').value;
    const msgList = document.getElementById('chat-messages');
    const submitBtn = document.getElementById('chat-submit');
    
    if (!sandbox) return NemoClaw.toast('Please select a sandbox', 'error');
    if (!input.value.trim()) return;
    
    const message = input.value.trim();
    input.value = '';
    
    // Clear placeholder if it's the first message
    if (msgList.querySelector('div[style*="text-align:center"]')) {
      msgList.innerHTML = '';
    }

    // append user message
    msgList.innerHTML += `
      <div style="align-self:flex-end; max-width:80%; background:var(--nc-bg-secondary); padding:var(--nc-space-sm) var(--nc-space-md); border-radius:12px 12px 0 12px;">
        <div style="font-weight:var(--nc-weight-bold); font-size:var(--nc-text-sm); color:var(--nc-text-muted); margin-bottom:4px">You</div>
        <div>${escapeHtml(message)}</div>
      </div>
    `;
    msgList.scrollTop = msgList.scrollHeight;
    
    submitBtn.disabled = true;
    submitBtn.textContent = '...';
    
    // add typing indicator
    const typingId = 'typing-' + Date.now();
    msgList.innerHTML += `
      <div id="${typingId}" style="align-self:flex-start; max-width:80%; padding:var(--nc-space-sm) var(--nc-space-md); border-radius:12px 12px 12px 0; border:1px solid rgba(71,85,105,0.15);">
        <div style="font-weight:var(--nc-weight-bold); font-size:var(--nc-text-sm); color:var(--nc-text-muted); margin-bottom:4px">Agent</div>
        <div style="display:flex; gap:8px; align-items:center; color:var(--nc-text-muted);">
          <span class="status-dot-inline running"></span> Thinking...
        </div>
      </div>
    `;
    msgList.scrollTop = msgList.scrollHeight;

    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(sandbox)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      const data = await res.json();
      
      document.getElementById(typingId)?.remove();
      
      if (data.error) throw new Error(data.error);
      
      // Strip ANSI reset codes
      let rawOutput = (data.response || data.output || "No response").replace(/\x1B\[[0-9;]*m/g, '').trim();
      
      msgList.innerHTML += `
        <div style="align-self:flex-start; max-width:80%; padding:var(--nc-space-sm) var(--nc-space-md); border-radius:12px 12px 12px 0; border:1px solid rgba(71,85,105,0.15); background:rgba(0,0,0,0.2);">
          <div style="font-weight:var(--nc-weight-bold); font-size:var(--nc-text-sm); color:var(--nc-primary); margin-bottom:4px">Agent</div>
          <div style="white-space:pre-wrap; font-family:var(--nc-font-base); line-height:1.5;">${escapeHtml(rawOutput)}</div>
        </div>
      `;
    } catch (err) {
      document.getElementById(typingId)?.remove();
      msgList.innerHTML += `
        <div style="align-self:flex-start; max-width:80%; background:rgba(239, 68, 68, 0.1); padding:var(--nc-space-sm) var(--nc-space-md); border-radius:12px 12px 12px 0; border:1px solid rgba(239, 68, 68, 0.3);">
          <div style="font-weight:var(--nc-weight-bold); font-size:var(--nc-text-sm); color:var(--nc-status-error); margin-bottom:4px">System Error</div>
          <div style="white-space:pre-wrap; font-family:var(--nc-font-mono); font-size:var(--nc-text-sm);">${escapeHtml(err.message)}</div>
        </div>
      `;
    } finally {
      msgList.scrollTop = msgList.scrollHeight;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send';
      input.focus();
    }
  }
};

NemoClaw.registerPage("chat", async () => {
  let sandboxes = [];
  try {
    const d = await NemoClaw.api.get('/api/sandboxes');
    sandboxes = d.sandboxes || [];
  } catch {}

  const sbOptions = sandboxes.map(s => `<option value="${s.name}">${s.name} (${s.running ? 'Running' : 'Stopped'})</option>`).join('');

  return `
    <div class="page-header animate-fade">
      <div>
        <h1>Interactive Chat</h1>
        <div class="page-header__subtitle">Communicate directly with your sandboxed agents</div>
      </div>
    </div>
    <div class="glass-card-flat animate-fade" style="display:flex; flex-direction:column; height: calc(100vh - 220px); padding:0; overflow:hidden;">
      <div style="flex-shrink:0; padding:var(--nc-space-md); border-bottom:1px solid rgba(71,85,105,0.15); display:flex; gap:var(--nc-space-md); align-items:center;">
        <select id="chat-sandbox" class="input-modern" style="width:250px;">
          ${sbOptions || '<option value="">No sandboxes available</option>'}
        </select>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('chat-messages').innerHTML=''">Clear History</button>
      </div>
      <div id="chat-messages" style="flex:1; overflow-y:auto; padding:var(--nc-space-lg); display:flex; flex-direction:column; gap:var(--nc-space-md);">
        <div style="text-align:center; color:var(--nc-text-muted); padding:var(--nc-space-xl)">Select a sandbox and send a message.</div>
      </div>
      <div style="flex-shrink:0; padding:var(--nc-space-md); border-top:1px solid rgba(71,85,105,0.15); background:rgba(0,0,0,0.1);">
        <form id="chat-form" style="display:flex; gap:var(--nc-space-sm);" onsubmit="ChatPage.sendMessage(event)">
          <input type="text" id="chat-input" class="input-modern" placeholder="Send a message to the agent..." style="flex:1" autocomplete="off">
          <button type="submit" class="btn btn-primary" id="chat-submit" style="padding: 0 24px;">Send</button>
        </form>
      </div>
    </div>
  `;
});
