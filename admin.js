// ===================== PAINEL DE ADMINISTRAÇÃO =====================
// Tudo aqui roda dentro do próprio app. O admin nunca precisa mexer na Vercel.

const PERM_LABELS = {
  'dashboard': 'Dashboard', 'nova-analise': 'Nova Análise', 'analises': 'Análises',
  'geogrid': 'Mapa de Calor', 'raiox': 'Raio-X Local', 'servicos': 'Serviços',
  'propostas': 'Propostas', 'prospeccao': 'Prospecção', 'crm': 'CRM / Vendas'
};

async function loadAdminPanel() {
  if (!window.currentProfile || window.currentProfile.role !== 'admin') return;

  // Carrega configurações (settings)
  const { data: settings } = await sb.from('settings').select('*').eq('id', 1).single();
  if (settings) {
    document.getElementById('adm-google-key').value = settings.google_key || '';
    document.getElementById('adm-groq-key').value = settings.groq_key || '';
    document.getElementById('adm-calendar-id').value = settings.calendar_id || '';

    const statusBox = document.getElementById('adm-calendar-status');
    if (settings.google_refresh_token) {
      statusBox.textContent = '✅ Conectada — os agendamentos vão direto pra sua agenda.';
      statusBox.style.color = 'var(--green2)';
    } else {
      statusBox.textContent = '⚠️ Ainda não conectada — clique no botão abaixo pra autorizar.';
      statusBox.style.color = 'var(--yellow2)';
    }
  }

  // Monta checkboxes de permissão do form "novo funcionário"
  const permsBox = document.getElementById('adm-new-perms');
  permsBox.innerHTML = Object.keys(PERM_LABELS).map(p => `
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);background:var(--bg3);padding:6px 10px;border-radius:6px;cursor:pointer;">
      <input type="checkbox" class="adm-new-perm-cb" value="${p}"> ${PERM_LABELS[p]}
    </label>
  `).join('');

  await renderEmployeesList();
}

async function salvarConfigAdmin() {
  const msg = document.getElementById('adm-config-msg');
  const payload = {
    id: 1,
    google_key: document.getElementById('adm-google-key').value.trim(),
    groq_key: document.getElementById('adm-groq-key').value.trim(),
    calendar_id: document.getElementById('adm-calendar-id').value.trim()
  };
  const { error } = await sb.from('settings').upsert(payload);
  if (error) {
    msg.style.color = 'var(--red2)';
    msg.textContent = 'Erro ao salvar: ' + error.message;
  } else {
    msg.style.color = 'var(--green2)';
    msg.textContent = 'Configurações salvas com sucesso!';
    syncSettingsToLocalStorage(payload);
  }
}

// Copia as chaves pro localStorage, no formato que o app já usa, pra
// nenhum funcionário precisar configurar nada na mão.
function syncSettingsToLocalStorage(settings) {
  if (!settings) return;
  if (settings.google_key) localStorage.setItem('prosp_google_key', settings.google_key);
  if (settings.groq_key) localStorage.setItem('prosp_groq_key', settings.groq_key);
  if (settings.calendar_id) localStorage.setItem('prosp_calendar_id', settings.calendar_id);
}

async function renderEmployeesList() {
  const box = document.getElementById('adm-employees-list');
  const { data: profiles, error } = await sb.from('profiles').select('*').order('created_at');
  if (error) { box.innerHTML = '<div style="color:var(--red2);font-size:13px;">Erro ao carregar: '+error.message+'</div>'; return; }

  box.innerHTML = profiles.map(p => `
    <div class="card" style="padding:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div>
          <div style="font-weight:600;font-size:13px;">${p.nome || p.email}</div>
          <div style="font-size:12px;color:var(--text2);">${p.email}</div>
        </div>
        <select id="role-${p.id}" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:12px;" ${p.id===window.currentProfile.id ? 'disabled' : ''}>
          <option value="funcionario" ${p.role==='funcionario'?'selected':''}>Funcionário</option>
          <option value="admin" ${p.role==='admin'?'selected':''}>Admin</option>
        </select>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
        ${Object.keys(PERM_LABELS).map(perm => `
          <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2);background:var(--bg3);padding:5px 9px;border-radius:6px;cursor:pointer;">
            <input type="checkbox" class="perm-cb-${p.id}" value="${perm}" ${(p.permissions||[]).includes(perm)?'checked':''}> ${PERM_LABELS[perm]}
          </label>
        `).join('')}
      </div>
      <button class="login-btn" style="width:auto;padding:6px 14px;font-size:12px;" onclick="salvarPermissoes('${p.id}')">Salvar</button>
      <span id="emp-msg-${p.id}" style="font-size:11px;margin-left:10px;"></span>
    </div>
  `).join('');
}

async function salvarPermissoes(userId) {
  const role = document.getElementById('role-' + userId).value;
  const checked = Array.from(document.querySelectorAll('.perm-cb-' + userId + ':checked')).map(cb => cb.value);
  const { error } = await sb.from('profiles').update({ role, permissions: checked }).eq('id', userId);
  const msg = document.getElementById('emp-msg-' + userId);
  if (error) { msg.style.color = 'var(--red2)'; msg.textContent = 'Erro: ' + error.message; }
  else { msg.style.color = 'var(--green2)'; msg.textContent = 'Salvo!'; setTimeout(()=>msg.textContent='',2000); }
}

async function criarFuncionario() {
  const msg = document.getElementById('adm-new-msg');
  const nome = document.getElementById('adm-new-nome').value.trim();
  const email = document.getElementById('adm-new-email').value.trim();
  const senha = document.getElementById('adm-new-senha').value;
  const permissions = Array.from(document.querySelectorAll('.adm-new-perm-cb:checked')).map(cb => cb.value);

  if (!nome || !email || !senha) { msg.style.color='var(--red2)'; msg.textContent='Preencha nome, e-mail e senha.'; return; }

  const { data: { session } } = await sb.auth.getSession();
  msg.style.color = 'var(--text2)';
  msg.textContent = 'Criando...';

  try {
    const resp = await fetch('/api/create-employee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({ nome, email, senha, permissions })
    });
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.error || 'Falha ao criar funcionário');

    msg.style.color = 'var(--green2)';
    msg.textContent = 'Funcionário criado com sucesso!';
    document.getElementById('adm-new-nome').value = '';
    document.getElementById('adm-new-email').value = '';
    document.getElementById('adm-new-senha').value = '';
    document.querySelectorAll('.adm-new-perm-cb').forEach(cb => cb.checked = false);
    await renderEmployeesList();
  } catch (err) {
    msg.style.color = 'var(--red2)';
    msg.textContent = 'Erro: ' + err.message;
  }
}

// ===================== VISÃO DA EQUIPE =====================
async function loadTeamViewSelect() {
  if (!window.currentProfile || window.currentProfile.role !== 'admin') return;
  const { data: profiles } = await sb.from('profiles').select('id, nome, email, role').order('created_at');
  const sel = document.getElementById('tv-select-func');
  sel.innerHTML = '<option value="">Selecione...</option>' +
    profiles.filter(p => p.id !== window.currentProfile.id).map(p =>
      `<option value="${p.id}">${p.nome || p.email} ${p.role==='admin' ? '(admin)' : ''}</option>`
    ).join('');
}

async function verFuncionario(userId) {
  const box = document.getElementById('tv-resultado');
  if (!userId) { box.innerHTML = ''; return; }
  box.innerHTML = '<div style="color:var(--text2);font-size:13px;">Carregando...</div>';

  const dados = await buscarDadosDeUsuario(userId);
  const leads = dados.leadsProsp || [];
  const crm = dados.crmLeads || [];

  const crmPorEstagio = {};
  crm.forEach(l => { const s = l.stage || 'sem_estagio'; crmPorEstagio[s] = (crmPorEstagio[s]||0)+1; });

  box.innerHTML = `
    <div class="card" style="padding:16px;margin-bottom:16px;">
      <div style="font-weight:600;margin-bottom:10px;">📊 Resumo</div>
      <div style="display:flex;gap:20px;font-size:13px;">
        <div><b>${leads.length}</b> leads prospectados</div>
        <div><b>${crm.length}</b> no CRM</div>
      </div>
      ${Object.keys(crmPorEstagio).length ? `
        <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;">
          ${Object.entries(crmPorEstagio).map(([k,v]) => `
            <span style="background:var(--bg3);padding:4px 10px;border-radius:6px;font-size:12px;">${k}: <b>${v}</b></span>
          `).join('')}
        </div>` : ''}
    </div>

    <div class="card" style="padding:16px;">
      <div style="font-weight:600;margin-bottom:10px;">📋 Leads no CRM</div>
      ${crm.length === 0 ? '<div style="color:var(--text2);font-size:13px;">Nenhum lead no CRM ainda.</div>' :
        `<div style="display:flex;flex-direction:column;gap:8px;">
          ${crm.map(l => `
            <div style="display:flex;justify-content:space-between;background:var(--bg3);padding:10px 12px;border-radius:8px;font-size:13px;">
              <span>${l.nome || l.name || 'Sem nome'}</span>
              <span style="color:var(--text2);">${l.stage || '—'}</span>
            </div>
          `).join('')}
        </div>`
      }
    </div>
  `;
}
