// ===================== METAS =====================
// Mesma matemática já corrigida na planilha (Matemática do Faturamento):
// Fechamentos = ROUNDUP(Meta / Ticket)
// Reuniões    = ROUNDUP(Fechamentos / ConvReuniaoFechamento)
// Contatos    = ROUNDUP(Reuniões / ConvContatoReuniao)
// Ligações    = ROUNDUP(Contatos / ConvLigacaoContato)
// Ligações/dia= ROUNDUP(Ligações / DiasUteis)
// Nenhuma fórmula divide/multiplica por 100 de novo — os campos de conversão
// já vêm em decimal (0.20 = 20%).

function calcularMetas(perfil) {
  const meta = Number(perfil.meta_faturamento) || 5000;
  const ticket = Number(perfil.ticket_medio) || 497;
  const convLC = Number(perfil.conv_ligacao_contato) || 0.20;
  const convCR = Number(perfil.conv_contato_reuniao) || 0.15;
  const convRF = Number(perfil.conv_reuniao_fechamento) || 0.25;
  const diasUteis = Number(perfil.dias_uteis_semana) || 6;

  const fechamentos = Math.ceil(meta / ticket);
  const reunioes = Math.ceil(fechamentos / convRF);
  const contatos = Math.ceil(reunioes / convCR);
  const ligacoesSemana = Math.ceil(contatos / convLC);
  const ligacoesDia = Math.ceil(ligacoesSemana / diasUteis);

  return { meta, ticket, convLC, convCR, convRF, diasUteis, fechamentos, reunioes, contatos, ligacoesSemana, ligacoesDia };
}

// Segunda-feira (00h) da semana atual, pra recortar "essa semana" nos dados.
function inicioDaSemana() {
  const hoje = new Date();
  const dia = hoje.getDay(); // 0=domingo
  const diff = (dia === 0 ? -6 : 1) - dia; // volta pra segunda
  const seg = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + diff);
  seg.setHours(0,0,0,0);
  return seg;
}

function dentroDaSemana(dataISOouBR) {
  if (!dataISOouBR) return false;
  let d;
  if (typeof dataISOouBR === 'string' && dataISOouBR.includes('/')) {
    const [dd, mm, yy] = dataISOouBR.split(' ')[0].split('/').map(Number);
    d = new Date(yy, mm - 1, dd);
  } else {
    d = new Date(dataISOouBR);
  }
  return d >= inicioDaSemana();
}

// Progresso real da semana, puxado do que já acontece no app — ninguém
// precisa digitar número nenhum manualmente.
function calcularProgressoSemana(userId) {
  const meusLeads = leadsProsp.filter(l => l.donoId === userId);
  const meuCrm = crmLeads.filter(c => {
    // crmLeads não guarda donoId ainda (ver limitação registrada na Etapa 1);
    // então ligamos pelo prospId até o lead de prospecção do funcionário.
    if (c.prospId === undefined) return false;
    const leadOrigem = leadsProsp[c.prospId];
    return leadOrigem && leadOrigem.donoId === userId;
  });

  const ligacoesFeitas = meusLeads.filter(l => l.dataContato && dentroDaSemana(l.dataContato)).length;
  const reunioesMarcadas = meusLeads.filter(l => l.status === 'Reunião marcada' && l.dataReuniao && dentroDaSemana(l.dataReuniao)).length;
  const fechamentos = meuCrm.filter(c => c.stage === 'fechado_ganho' && c.dataFechamento && dentroDaSemana(c.dataFechamento)).length;

  return { ligacoesFeitas, reunioesMarcadas, fechamentos };
}

function ritmoEsperadoHoje(diasUteis) {
  const hoje = new Date().getDay(); // 0=domingo .. 6=sábado
  // segunda=1 ... sábado=6 contam como dia útil, domingo=0 não conta
  const diaUtilHoje = hoje === 0 ? diasUteis : Math.min(hoje, diasUteis);
  return diaUtilHoje / diasUteis;
}

// ===================== TELA DO COLABORADOR =====================
async function renderMetasColaborador() {
  const box = document.getElementById('metas-colaborador-box');
  if (!box || !window.currentProfile) return;

  const { data: perfil } = await sb.from('profiles').select('*').eq('id', window.currentProfile.id).single();
  if (!perfil) { box.innerHTML = '<div style="color:var(--text2);">Não foi possível carregar sua meta ainda.</div>'; return; }

  const m = calcularMetas(perfil);
  const prog = calcularProgressoSemana(window.currentProfile.id);
  const ritmo = ritmoEsperadoHoje(m.diasUteis);
  const pctLigacoes = m.ligacoesSemana > 0 ? prog.ligacoesFeitas / m.ligacoesSemana : 0;
  const noRitmo = pctLigacoes >= ritmo;

  box.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
      <div class="card" style="padding:16px;">
        <div style="font-size:12px;color:var(--text2);margin-bottom:4px;">Meta de ligações/semana</div>
        <div style="font-size:26px;font-weight:700;">${m.ligacoesSemana}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div style="font-size:12px;color:var(--text2);margin-bottom:4px;">Meta de ligações/dia</div>
        <div style="font-size:26px;font-weight:700;">${m.ligacoesDia}</div>
      </div>
      <div class="card" style="padding:16px;">
        <div style="font-size:12px;color:var(--text2);margin-bottom:4px;">Dias úteis/semana</div>
        <div style="font-size:26px;font-weight:700;">${m.diasUteis}</div>
      </div>
    </div>

    <div class="card" style="padding:20px;margin-bottom:20px;">
      <div style="font-weight:600;margin-bottom:14px;">📈 Progresso desta semana</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:14px;">
        <div>
          <div style="font-size:12px;color:var(--text2);">Ligações feitas</div>
          <div style="font-size:20px;font-weight:700;">${prog.ligacoesFeitas} <span style="font-size:13px;color:var(--text2);font-weight:400;">/ ${m.ligacoesSemana}</span></div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--text2);">Reuniões marcadas</div>
          <div style="font-size:20px;font-weight:700;">${prog.reunioesMarcadas} <span style="font-size:13px;color:var(--text2);font-weight:400;">/ ${m.reunioes}</span></div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--text2);">Fechamentos</div>
          <div style="font-size:20px;font-weight:700;">${prog.fechamentos} <span style="font-size:13px;color:var(--text2);font-weight:400;">/ ${m.fechamentos}</span></div>
        </div>
      </div>
      <div style="background:var(--bg3);border-radius:8px;height:10px;overflow:hidden;margin-bottom:14px;">
        <div style="background:${noRitmo?'var(--green2)':'var(--red2)'};height:100%;width:${Math.min(pctLigacoes*100,100)}%;transition:width .3s;"></div>
      </div>
      <div style="background:${noRitmo?'rgba(63,185,80,.12)':'rgba(248,81,73,.15)'};color:${noRitmo?'var(--green2)':'var(--red2)'};padding:10px 14px;border-radius:8px;font-size:13px;font-weight:600;">
        ${noRitmo ? '🟢 No ritmo ou acima da meta — continue assim!' : '🔴 Abaixo do ritmo esperado até hoje — precisa acelerar!'}
      </div>
    </div>
  `;
}

// ===================== CONFIGURAÇÃO PELO ADMIN (por colaborador) =====================
async function renderMetasAdmin() {
  const box = document.getElementById('metas-admin-box');
  if (!box || !window.currentProfile || window.currentProfile.role !== 'admin') return;

  const { data: profiles, error } = await sb.from('profiles').select('*').order('created_at');
  if (error) { box.innerHTML = '<div style="color:var(--red2);">Erro ao carregar: ' + error.message + '</div>'; return; }

  box.innerHTML = profiles.map(p => {
    const m = calcularMetas(p);
    return `
    <div class="card" style="padding:16px;margin-bottom:14px;">
      <div style="font-weight:600;margin-bottom:12px;">${p.nome || p.email}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px;">
        <div>
          <label style="display:block;font-size:11px;color:var(--text2);margin-bottom:3px;">Meta de faturamento/semana (R$)</label>
          <input type="number" id="meta-fat-${p.id}" value="${p.meta_faturamento || 5000}" style="width:100%;padding:7px 9px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:13px;">
        </div>
        <div>
          <label style="display:block;font-size:11px;color:var(--text2);margin-bottom:3px;">Ticket médio (R$)</label>
          <input type="number" id="meta-ticket-${p.id}" value="${p.ticket_medio || 497}" style="width:100%;padding:7px 9px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:13px;">
        </div>
        <div>
          <label style="display:block;font-size:11px;color:var(--text2);margin-bottom:3px;">Dias úteis/semana</label>
          <input type="number" id="meta-dias-${p.id}" value="${p.dias_uteis_semana || 6}" style="width:100%;padding:7px 9px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:13px;">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px;">
        <div>
          <label style="display:block;font-size:11px;color:var(--text2);margin-bottom:3px;">Conv. Ligação → Contato (%)</label>
          <input type="number" step="1" id="meta-convlc-${p.id}" value="${Math.round((p.conv_ligacao_contato||0.20)*100)}" style="width:100%;padding:7px 9px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:13px;">
        </div>
        <div>
          <label style="display:block;font-size:11px;color:var(--text2);margin-bottom:3px;">Conv. Contato → Reunião (%)</label>
          <input type="number" step="1" id="meta-convcr-${p.id}" value="${Math.round((p.conv_contato_reuniao||0.15)*100)}" style="width:100%;padding:7px 9px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:13px;">
        </div>
        <div>
          <label style="display:block;font-size:11px;color:var(--text2);margin-bottom:3px;">Conv. Reunião → Fechamento (%)</label>
          <input type="number" step="1" id="meta-convrf-${p.id}" value="${Math.round((p.conv_reuniao_fechamento||0.25)*100)}" style="width:100%;padding:7px 9px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-size:13px;">
        </div>
      </div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px;">
        📊 Isso equivale a <b style="color:var(--text);">${m.ligacoesSemana} ligações/semana</b> (${m.ligacoesDia}/dia) para bater ${m.fechamentos} fechamento(s).
      </div>
      <button class="login-btn" style="width:auto;padding:7px 16px;font-size:12px;" onclick="salvarMetaColaborador('${p.id}')">Salvar meta</button>
      <span id="meta-msg-${p.id}" style="font-size:11px;margin-left:10px;"></span>
    </div>`;
  }).join('');
}

async function salvarMetaColaborador(userId) {
  const payload = {
    meta_faturamento: parseFloat(document.getElementById('meta-fat-' + userId).value) || 5000,
    ticket_medio: parseFloat(document.getElementById('meta-ticket-' + userId).value) || 497,
    dias_uteis_semana: parseInt(document.getElementById('meta-dias-' + userId).value, 10) || 6,
    conv_ligacao_contato: (parseFloat(document.getElementById('meta-convlc-' + userId).value) || 20) / 100,
    conv_contato_reuniao: (parseFloat(document.getElementById('meta-convcr-' + userId).value) || 15) / 100,
    conv_reuniao_fechamento: (parseFloat(document.getElementById('meta-convrf-' + userId).value) || 25) / 100
  };
  const { error } = await sb.from('profiles').update(payload).eq('id', userId);
  const msg = document.getElementById('meta-msg-' + userId);
  if (error) { msg.style.color = 'var(--red2)'; msg.textContent = 'Erro: ' + error.message; }
  else {
    msg.style.color = 'var(--green2)'; msg.textContent = 'Salvo!';
    renderMetasAdmin();
    setTimeout(() => { if (msg) msg.textContent = ''; }, 2000);
  }
}
