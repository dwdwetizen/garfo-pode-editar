// ===================== SINCRONIZAÇÃO DE DADOS DO TIME =====================
// Faz leads, CRM, análises e propostas ficarem iguais em qualquer computador/celular,
// em vez de presos no navegador de cada aparelho.

const TEAM_DATA_KEYS = {
  leadsProsp: 'leads_prosp',
  crmLeads: 'crm',
  analyses: 'analyses',
  proposals: 'proposals',
  services: 'services'
};

// Busca tudo do Supabase e substitui os dados locais, depois re-renderiza as telas.
async function carregarDadosDoTime() {
  try {
    const { data: rows, error } = await sb.from('team_data').select('id, data');
    if (error) { console.warn('Não foi possível carregar dados do time:', error.message); return; }

    const byId = {};
    rows.forEach(r => byId[r.id] = r.data);

    if (byId.leads_prosp) { leadsProsp = byId.leads_prosp; localStorage.setItem('localway_leads_prosp', JSON.stringify(leadsProsp)); }
    if (byId.crm) { crmLeads = byId.crm; localStorage.setItem('gbp_crm', JSON.stringify(crmLeads)); }
    if (byId.analyses) { analyses = byId.analyses; localStorage.setItem('gbp_analyses', JSON.stringify(analyses)); }
    if (byId.proposals) { proposals = byId.proposals; localStorage.setItem('gbp_proposals', JSON.stringify(proposals)); }
    if (byId.services) { services = byId.services || getDefaultServices(); localStorage.setItem('gbp_services', JSON.stringify(services)); }

    // Re-renderiza as telas que já tiverem sido carregadas na página
    if (typeof renderLeadsProsp === 'function') renderLeadsProsp();
    if (typeof renderKanban === 'function') renderKanban();
    if (typeof updateCrmMetrics === 'function') updateCrmMetrics();
    if (typeof atualizarStatsProsp === 'function') atualizarStatsProsp();
  } catch (e) {
    console.warn('Erro ao sincronizar dados do time:', e);
  }
}

// Envia uma coleção inteira pro Supabase (chamado depois de qualquer alteração local)
async function enviarParaSupabase(chaveLocal) {
  const id = TEAM_DATA_KEYS[chaveLocal];
  if (!id) return;
  const dataMap = { leadsProsp, crmLeads, analyses, proposals, services };
  const value = dataMap[chaveLocal];
  const { data: { user } } = await sb.auth.getUser();

  try {
    await sb.from('team_data').upsert({
      id, data: value, updated_at: new Date().toISOString(), updated_by: user ? user.id : null
    });
  } catch (e) {
    console.warn('Erro ao enviar "' + id + '" pro Supabase (ficou salvo só localmente por enquanto):', e);
  }
}

// Atualiza a cada 20 segundos pra pegar o que outros colegas foram fazendo,
// sem precisar recarregar a página.
setInterval(() => {
  if (window.currentProfile) carregarDadosDoTime();
}, 20000);
