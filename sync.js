// ===================== SINCRONIZAÇÃO DE DADOS DO TIME =====================
// Faz leads, CRM, análises e propostas ficarem iguais em qualquer computador/celular,
// em vez de presos no navegador de cada aparelho.
//
// CORREÇÃO (leads "voltando" depois de apagar):
// Antes, salvarLeadsProsp() disparava enviarParaSupabase() sem esperar (fire-and-forget).
// Se a pessoa atualizasse a página ou trocasse de aba antes desse envio terminar,
// ou se o polling automático de 20s rodasse no meio do caminho, o app buscava de
// volta a versão ANTIGA que ainda estava no Supabase e sobrescrevia o que acabou
// de ser apagado localmente.
//
// Agora: (1) toda gravação é enfileirada por chave, então duas gravações da mesma
// coleção nunca rodam ao mesmo tempo por cima uma da outra; (2) o polling automático
// não roda enquanto qualquer gravação estiver pendente; (3) as funções que chamam
// enviarParaSupabase devem usar "await" (isso foi ajustado no index.html).

const TEAM_DATA_KEYS = {
  leadsProsp: 'leads_prosp',
  leadsLixeira: 'leads_lixeira',
  crmLeads: 'crm',
  analyses: 'analyses',
  proposals: 'proposals',
  services: 'services',
  followUps: 'follow_ups'
};

// Quantas gravações estão pendentes (em fila ou em andamento) neste momento.
// Enquanto for > 0, o polling automático não busca dados do Supabase, pra não
// sobrescrever algo que ainda está sendo salvo.
let savesPendentes = 0;

// Uma fila (lock) por chave, pra garantir que duas gravações da MESMA coleção
// (ex: duas chamadas seguidas de enviarParaSupabase('leadsProsp')) rodem uma
// depois da outra, nunca ao mesmo tempo. Isso evita o clássico problema de
// "ler o dado antigo, misturar, e gravar por cima" (read-modify-write) dar
// conflito quando duas ações acontecem em sequência rápida (ex: apagar e,
// logo em seguida, gerar leads novos).
const _filaPorChave = {};

function _enfileirar(chave, tarefa) {
  const anterior = _filaPorChave[chave] || Promise.resolve();
  const atual = anterior.then(tarefa, tarefa);
  // Guarda a promise "silenciada" (sem travar a fila se der erro)
  _filaPorChave[chave] = atual.catch(() => {});
  return atual;
}

// Busca tudo do Supabase e substitui os dados locais, depois re-renderiza as telas.
async function carregarDadosDoTime() {
  if (savesPendentes > 0) {
    // Existe alguma gravação em andamento (ex: acabou de apagar ou gerar leads).
    // Não busca agora pra não trazer de volta uma versão desatualizada.
    return;
  }
  try {
    const { data: rows, error } = await sb.from('team_data').select('id, data');
    if (error) { console.warn('Não foi possível carregar dados do time:', error.message); return; }

    // Confere de novo depois do fetch: se uma gravação começou durante essa
    // busca (ela demora um pouco), descarta o resultado pra não sobrescrever
    // o que está sendo salvo agora.
    if (savesPendentes > 0) return;

    const byId = {};
    rows.forEach(r => byId[r.id] = r.data);

    if (byId.leads_prosp) {
      leadsProsp = byId.leads_prosp;
      localStorage.setItem('localway_leads_prosp', JSON.stringify(leadsProsp));
    }
    if (byId.leads_lixeira) {
      leadsLixeira = byId.leads_lixeira;
      localStorage.setItem('localway_leads_lixeira', JSON.stringify(leadsLixeira));
    }
    if (byId.crm) { crmLeads = byId.crm; localStorage.setItem('gbp_crm', JSON.stringify(crmLeads)); }
    if (byId.follow_ups) { followUps = byId.follow_ups; localStorage.setItem('localway_followups', JSON.stringify(followUps)); }
    if (byId.analyses) { analyses = byId.analyses; localStorage.setItem('gbp_analyses', JSON.stringify(analyses)); }
    if (byId.proposals) { proposals = byId.proposals; localStorage.setItem('gbp_proposals', JSON.stringify(proposals)); }
    if (byId.services) { services = byId.services || getDefaultServices(); localStorage.setItem('gbp_services', JSON.stringify(services)); }

    // Re-renderiza as telas que já tiverem sido carregadas na página
    if (typeof renderLeadsProsp === 'function') renderLeadsProsp();
    if (typeof atualizarContadorLixeira === 'function') atualizarContadorLixeira();
    if (typeof renderKanban === 'function') renderKanban();
    if (typeof renderFollowUps === 'function' && document.getElementById('page-followup')?.classList.contains('active')) renderFollowUps();
    if (typeof updateCrmMetrics === 'function') updateCrmMetrics();
    if (typeof atualizarStatsProsp === 'function') atualizarStatsProsp();
  } catch (e) {
    console.warn('Erro ao sincronizar dados do time:', e);
  }
}

// Envia uma coleção inteira pro Supabase (chamado depois de qualquer alteração local).
// IMPORTANTE: essa função é async e deve sempre ser chamada com "await" por quem
// a invoca (ex: dentro de salvarLeadsProsp()), senão a gente volta a ter a mesma
// corrida que causava os leads "voltando" depois de apagar.
async function enviarParaSupabase(chaveLocal) {
  const id = TEAM_DATA_KEYS[chaveLocal];
  if (!id) return;

  savesPendentes++;
  try {
    // Enfileira por chave: se já existe uma gravação de "leadsProsp" em
    // andamento, essa nova espera a anterior terminar antes de ler o estado
    // remoto — assim nunca lemos um dado "no meio do caminho".
    await _enfileirar(chaveLocal, async () => {
      const dataMap = { leadsProsp, leadsLixeira, crmLeads, analyses, proposals, services, followUps };
      let value = dataMap[chaveLocal];
      const { data: { user } } = await sb.auth.getUser();

      // Para leadsProsp: NÃO sobrescreve a lista inteira do time. Busca o que já
      // está salvo, preserva os leads de outras pessoas, e só substitui os leads
      // que pertencem ao usuário atual (evita que o save de alguém apague os
      // leads gerados por outro colega).
      if (chaveLocal === 'leadsProsp') {
        try {
          const { data: atual } = await sb.from('team_data').select('data').eq('id', id).single();
          const remotos = (atual && atual.data) || [];
          const meuId = user ? user.id : null;
          const remotosDeOutros = remotos.filter(l => l.donoId && l.donoId !== meuId);
          const meusOuSemDono = value.filter(l => !l.donoId || l.donoId === meuId);
          value = [...remotosDeOutros, ...meusOuSemDono];
          leadsProsp = value; // mantém a variável local também mesclada
        } catch (e) {
          console.warn('Não foi possível mesclar leads antes de salvar, enviando só o local:', e);
        }
      }

      // Mesma lógica de leadsProsp: preserva follow-ups de outros colaboradores,
      // só substitui os que pertencem (ou não têm dono ainda) ao usuário atual.
      if (chaveLocal === 'followUps') {
        try {
          const { data: atual } = await sb.from('team_data').select('data').eq('id', id).single();
          const remotos = (atual && atual.data) || [];
          const meuId = user ? user.id : null;
          const remotosDeOutros = remotos.filter(f => f.donoId && f.donoId !== meuId);
          const meusOuSemDono = value.filter(f => !f.donoId || f.donoId === meuId);
          value = [...remotosDeOutros, ...meusOuSemDono];
          followUps = value;
        } catch (e) {
          console.warn('Não foi possível mesclar follow-ups antes de salvar, enviando só o local:', e);
        }
      }

      try {
        await sb.from('team_data').upsert({
          id, data: value, updated_at: new Date().toISOString(), updated_by: user ? user.id : null
        });
      } catch (e) {
        console.warn('Erro ao enviar "' + id + '" pro Supabase (ficou salvo só localmente por enquanto):', e);
      }
    });
  } finally {
    savesPendentes--;
  }
}

// Atualiza a cada 20 segundos pra pegar o que outros colegas foram fazendo,
// sem precisar recarregar a página. (Pula automaticamente se houver uma
// gravação pendente — ver savesPendentes acima.)
setInterval(() => {
  if (window.currentProfile) carregarDadosDoTime();
}, 20000);
