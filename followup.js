// ===================== FOLLOW-UP (Ligação + Presencial numa lista só) =====================
// Cada lead tem NO MÁXIMO um registro de follow-up. Quando você marca "Retornar"
// ou "Reunião marcada" de novo pro mesmo lead, em vez de criar linha nova, o
// contador "tentativas" sobe e a data/observação são atualizadas — assim dá
// pra ver o histórico acumulado daquele cliente (ex: "4ª tentativa").

// Config padrão. O admin pode sobrescrever em Settings (adm-dias-followup /
// adm-dias-alerta) — ver applyFollowUpSettings() em admin.js.
window.followUpConfig = {
  diasPadrao: 3, // daqui a quantos dias sugerir o próximo follow-up
  diasAlerta: 1  // quando faltar esse tanto de dias (ou menos), fica amarelo
};

function salvarFollowUps() {
  localStorage.setItem('localway_followups', JSON.stringify(followUps));
  if (typeof enviarParaSupabase === 'function') enviarParaSupabase('followUps');
}

// Chamada pelo dropdown de Status na Prospecção (alterarStatusProsp) e pela
// confirmação de reunião (calendar.js), então cobre os dois fluxos: ligação
// (Retornar / Não atendeu / Sem interesse) e reunião marcada.
function registrarFollowUp(lead, { origem, resultado, statusGeral, prioridade }) {
  if (!lead) return;
  const leadKey = lead.id || lead.empresa; // place_id quando existir, senão empresa
  let fu = followUps.find(f => f.leadId === leadKey);

  const hoje = new Date();
  const proximo = new Date();
  proximo.setDate(hoje.getDate() + (window.followUpConfig.diasPadrao || 3));

  if (fu) {
    // Já existe follow-up desse lead: soma tentativa, não duplica linha.
    fu.tentativas = (fu.tentativas || 1) + 1;
    fu.dataUltimaAcao = hoje.toISOString();
    fu.resultado = resultado || fu.resultado;
    fu.statusGeral = statusGeral || fu.statusGeral;
    fu.origem = origem || fu.origem;
    fu.proximoFollowup = proximo.toISOString();
    if (prioridade) fu.prioridade = prioridade;
  } else {
    fu = {
      id: Date.now(),
      leadId: leadKey,
      empresa: lead.empresa || '',
      telefone: lead.telefone || '',
      endereco: lead.endereco || '',
      segmento: lead.segmento || lead.categoria || '',
      origem: origem || 'Ligação',
      data1Contato: hoje.toISOString(),
      dataUltimaAcao: hoje.toISOString(),
      resultado: resultado || '',
      statusGeral: statusGeral || 'Novo lead',
      proximoFollowup: proximo.toISOString(),
      tentativas: 1,
      prioridade: prioridade || 'Média',
      observacoes: '',
      donoId: window.currentProfile ? window.currentProfile.id : null,
      donoNome: window.currentProfile ? (window.currentProfile.nome || window.currentProfile.email) : ''
    };
    followUps.push(fu);
  }
  salvarFollowUps();
  if (document.getElementById('page-followup')?.classList.contains('active')) renderFollowUps();
}

// ===================== FORMULÁRIO (Novo / Editar) =====================
// Substitui os antigos prompt() por um formulário de verdade, com todos os
// dados da empresa e um campo de data explícito pro lembrete de retorno.
// Chame sem argumento pra criar um novo, ou com o id pra editar um existente.
function abrirModalFollowUp(id) {
  const modal = document.getElementById('modal-followup');
  if (!modal) return;
  const fu = id ? followUps.find(f => f.id === id) : null;

  document.getElementById('fu-modal-titulo').textContent = fu ? '📋 Editar Follow-up' : '📋 Novo Follow-up';
  document.getElementById('fu-form-id').value = fu ? fu.id : '';
  document.getElementById('fu-form-empresa').value = fu ? (fu.empresa || '') : '';
  document.getElementById('fu-form-telefone').value = fu ? (fu.telefone || '') : '';
  document.getElementById('fu-form-endereco').value = fu ? (fu.endereco || '') : '';
  document.getElementById('fu-form-segmento').value = fu ? (fu.segmento || '') : '';
  document.getElementById('fu-form-origem').value = fu ? (fu.origem || 'Ligação') : 'Presencial';
  document.getElementById('fu-form-obs').value = fu ? (fu.observacoes || '') : '';

  // Data do lembrete: usa a que já existe, ou sugere "daqui a X dias" (config do admin)
  const dataBase = fu ? new Date(fu.proximoFollowup) : (() => {
    const d = new Date(); d.setDate(d.getDate() + (window.followUpConfig.diasPadrao || 3)); return d;
  })();
  document.getElementById('fu-form-data').value = dataBase.toISOString().split('T')[0];

  modal.style.display = 'flex';
}

function fecharModalFollowUp() { document.getElementById('modal-followup').style.display = 'none'; }

function salvarModalFollowUp() {
  const id        = document.getElementById('fu-form-id').value;
  const empresa   = document.getElementById('fu-form-empresa').value.trim();
  const telefone  = document.getElementById('fu-form-telefone').value.trim();
  const endereco  = document.getElementById('fu-form-endereco').value.trim();
  const segmento  = document.getElementById('fu-form-segmento').value.trim();
  const origem    = document.getElementById('fu-form-origem').value;
  const dataStr   = document.getElementById('fu-form-data').value;
  const obs       = document.getElementById('fu-form-obs').value.trim();

  if (!empresa) { alert('Preencha o nome da empresa.'); return; }
  if (!dataStr) { alert('Escolha a data do lembrete de retorno.'); return; }

  const proximoFollowup = new Date(dataStr + 'T09:00:00').toISOString();
  const hoje = new Date().toISOString();

  if (id) {
    // Editando um follow-up existente
    const fu = followUps.find(f => f.id === parseInt(id));
    if (fu) {
      fu.empresa = empresa;
      fu.telefone = telefone;
      fu.endereco = endereco;
      fu.segmento = segmento;
      fu.origem = origem;
      fu.proximoFollowup = proximoFollowup;
      fu.observacoes = obs;
      fu.dataUltimaAcao = hoje;
    }
  } else {
    // Criando um novo follow-up manual, com a data escolhida por você
    // (não usa o padrão automático de "+3 dias")
    followUps.push({
      id: Date.now(),
      leadId: 'manual_' + Date.now(),
      empresa, telefone, endereco, segmento,
      origem,
      data1Contato: hoje,
      dataUltimaAcao: hoje,
      resultado: 'Retornar depois',
      statusGeral: 'Novo lead',
      proximoFollowup,
      tentativas: 1,
      prioridade: 'Média',
      observacoes: obs,
      donoId: window.currentProfile ? window.currentProfile.id : null,
      donoNome: window.currentProfile ? (window.currentProfile.nome || window.currentProfile.email) : ''
    });
  }

  salvarFollowUps();
  fecharModalFollowUp();
  renderFollowUps();
}

function getFollowUpsFiltrados() {
  const isAdmin = window.currentProfile && window.currentProfile.role === 'admin';
  const meuId   = window.currentProfile ? window.currentProfile.id : null;
  const origem  = document.getElementById('fu-filter-origem')?.value || '';
  const q       = (document.getElementById('fu-search')?.value || '').toLowerCase();

  return followUps.filter(f => {
    if (!isAdmin && f.donoId && f.donoId !== meuId) return false;
    if (origem && f.origem !== origem) return false;
    if (q && !f.empresa.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => new Date(a.proximoFollowup) - new Date(b.proximoFollowup));
}

function diasRestantes(dataISO) {
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const alvo = new Date(dataISO); alvo.setHours(0,0,0,0);
  return Math.round((alvo - hoje) / 86400000);
}

function corPrazo(dias) {
  if (dias < 0) return { bg: 'rgba(248,81,73,.15)', fg: 'var(--red2)', label: `⚠️ Atrasado (${Math.abs(dias)}d)` };
  if (dias <= (window.followUpConfig.diasAlerta || 1)) return { bg: 'rgba(210,153,34,.15)', fg: 'var(--yellow2)', label: dias === 0 ? '🟡 Hoje' : `🟡 Em ${dias}d` };
  return { bg: 'rgba(63,185,80,.12)', fg: 'var(--green2)', label: `🟢 Em ${dias}d` };
}

function renderFollowUps() {
  const cont = document.getElementById('fu-lista');
  const empty = document.getElementById('fu-empty');
  if (!cont) return;
  const lista = getFollowUpsFiltrados();

  document.getElementById('fu-total').textContent = lista.length;
  document.getElementById('fu-atrasados').textContent = lista.filter(f => diasRestantes(f.proximoFollowup) < 0).length;
  document.getElementById('fu-hoje').textContent = lista.filter(f => diasRestantes(f.proximoFollowup) === 0).length;

  if (lista.length === 0) { empty.style.display = 'block'; cont.innerHTML = ''; return; }
  empty.style.display = 'none';

  const isMobile = window.innerWidth < 768;
  const resultadoOpts = ['Sem resposta','Vai pensar','Não tem interesse','Interessado','Reunião marcada','Proposta enviada','Fechado - Ganhou','Fechado - Perdeu','Não atendido','Retornar depois'];
  const statusOpts = ['Novo lead','Em negociação','Follow-up agendado','Proposta enviada','Cliente fechado','Perdido','Pausado'];

  cont.innerHTML = `<div style="overflow-x:auto;">
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:var(--bg2);border-bottom:1px solid var(--border);">
        <th style="text-align:left;padding:10px 12px;font-weight:600;color:var(--text2);font-size:11px;">Empresa</th>
        <th style="text-align:left;padding:10px 12px;font-weight:600;color:var(--text2);font-size:11px;">Origem</th>
        <th style="text-align:center;padding:10px 12px;font-weight:600;color:var(--text2);font-size:11px;">Tentativas</th>
        <th style="text-align:left;padding:10px 12px;font-weight:600;color:var(--text2);font-size:11px;">Resultado</th>
        <th style="text-align:left;padding:10px 12px;font-weight:600;color:var(--text2);font-size:11px;">Status Geral</th>
        <th style="text-align:left;padding:10px 12px;font-weight:600;color:var(--text2);font-size:11px;">Próximo Follow-up</th>
        <th style="text-align:center;padding:10px 12px;font-weight:600;color:var(--text2);font-size:11px;">Ações</th>
      </tr>
    </thead>
    <tbody>
      ${lista.map(f => {
        const dias = diasRestantes(f.proximoFollowup);
        const cor = corPrazo(dias);
        const dataFmt = new Date(f.proximoFollowup).toLocaleDateString('pt-BR');
        return `<tr style="border-bottom:1px solid var(--border);">
          <td style="padding:10px 12px;">
            <div style="font-weight:500;">${f.empresa}</div>
            <div style="font-size:11px;color:var(--text2);">${f.telefone ? '📞 '+f.telefone : ''}</div>
          </td>
          <td style="padding:10px 12px;">
            <span style="background:var(--bg3);padding:2px 8px;border-radius:10px;font-size:11px;">${f.origem === 'Presencial' ? '🚶 Presencial' : '📞 Ligação'}</span>
          </td>
          <td style="padding:10px 12px;text-align:center;font-weight:600;">${f.tentativas}ª</td>
          <td style="padding:10px 12px;">
            <select class="input" style="font-size:12px;padding:5px 8px;" onchange="atualizarFollowUp(${f.id},'resultado',this.value)">
              ${resultadoOpts.map(o => `<option ${f.resultado===o?'selected':''}>${o}</option>`).join('')}
            </select>
          </td>
          <td style="padding:10px 12px;">
            <select class="input" style="font-size:12px;padding:5px 8px;" onchange="atualizarFollowUp(${f.id},'statusGeral',this.value)">
              ${statusOpts.map(o => `<option ${f.statusGeral===o?'selected':''}>${o}</option>`).join('')}
            </select>
          </td>
          <td style="padding:10px 12px;">
            <span style="background:${cor.bg};color:${cor.fg};padding:3px 9px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap;">${cor.label}</span>
            <div style="font-size:10px;color:var(--text2);margin-top:3px;">${dataFmt}</div>
          </td>
          <td style="padding:10px 12px;text-align:center;">
            <div style="display:flex;gap:4px;justify-content:center;">
              <button onclick="abrirModalFollowUp(${f.id})" class="btn btn-secondary" style="font-size:11px;padding:5px 8px;" title="Editar dados da empresa e lembrete">✏️</button>
              <button onclick="adiarFollowUp(${f.id})" class="btn btn-secondary" style="font-size:11px;padding:5px 8px;" title="Adiar follow-up">📅</button>
              <button onclick="concluirFollowUp(${f.id})" class="btn btn-primary" style="font-size:11px;padding:5px 8px;" title="Marcar como concluído/fechado">✓</button>
            </div>
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;
}

function atualizarFollowUp(id, campo, valor) {
  const f = followUps.find(x => x.id === id);
  if (!f) return;
  f[campo] = valor;
  f.dataUltimaAcao = new Date().toISOString();
  salvarFollowUps();
}

function adiarFollowUp(id) {
  const f = followUps.find(x => x.id === id);
  if (!f) return;
  const dias = prompt('Adiar por quantos dias?', String(window.followUpConfig.diasPadrao || 3));
  const n = parseInt(dias, 10);
  if (isNaN(n) || n <= 0) return;
  const nova = new Date();
  nova.setDate(nova.getDate() + n);
  f.proximoFollowup = nova.toISOString();
  salvarFollowUps();
  renderFollowUps();
}

function concluirFollowUp(id) {
  if (!confirm('Marcar este follow-up como concluído e removê-lo da lista?')) return;
  followUps = followUps.filter(x => x.id !== id);
  salvarFollowUps();
  renderFollowUps();
}

function filtrarFollowUps() { renderFollowUps(); }
