// ===================== CONFIGURAÇÃO SUPABASE =====================
// Preencha com os dados do seu projeto (Project Settings > API no Supabase)
const SUPABASE_URL = 'https://efvsbvlttangoxegbkpb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmdnNidmx0dGFuZ294ZWdia3BiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMTAyODUsImV4cCI6MjA5ODc4NjI4NX0.D-01ltdicgr515ewUQcdPVmdhy1JHMf4qqI71ZXJYlg';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Todas as seções que podem ser liberadas/bloqueadas por funcionário.
// 'admin' é especial: só aparece pra quem tem role = 'admin'.
const ALL_PERMS = ['dashboard','nova-analise','analises','geogrid','raiox','servicos','propostas','prospeccao','crm','metas'];

window.currentProfile = null; // { id, email, nome, role, permissions: [...] }

// ===================== BOOT =====================
document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await loadProfileAndEnter(session.user);
  } else {
    showLogin();
  }
});

sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    window.currentProfile = null;
    showLogin();
  }
});

// ===================== LOGIN =====================
async function handleLogin(evt) {
  evt.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  const errBox = document.getElementById('loginError');
  errBox.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Entrando...';

  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    errBox.textContent = traduzErroLogin(error.message);
    errBox.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Entrar';
    return;
  }

  await loadProfileAndEnter(data.user);
}

function traduzErroLogin(msg) {
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('Email not confirmed')) return 'E-mail ainda não confirmado.';
  return 'Não foi possível entrar. Tente novamente.';
}

async function handleLogout() {
  await sb.auth.signOut();
}

// ===================== PERFIL + PERMISSÕES =====================
async function loadProfileAndEnter(user) {
  const { data: profile, error } = await sb
    .from('profiles')
    .select('id, email, nome, role, permissions')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    document.getElementById('loginError').textContent = 'Sua conta não tem um perfil configurado. Peça pro administrador liberar seu acesso.';
    document.getElementById('loginError').style.display = 'block';
    await sb.auth.signOut();
    return;
  }

  window.currentProfile = profile;
  applyPermissions(profile);
  enterApp(profile);
}

function applyPermissions(profile) {
  const isAdmin = profile.role === 'admin';
  const allowed = isAdmin ? ALL_PERMS : (profile.permissions || []);

  document.querySelectorAll('.nav-item[data-perm]').forEach(item => {
    const perm = item.getAttribute('data-perm');
    if (perm === 'admin') {
      item.style.display = isAdmin ? 'flex' : 'none';
    } else {
      item.style.display = allowed.includes(perm) ? 'flex' : 'none';
    }
  });

  // Se a página ativa no momento não é permitida, manda pro dashboard (ou 1ª liberada)
  const active = document.querySelector('.page.active');
  const activeId = active ? active.id.replace('page-', '') : null;
  if (activeId && activeId !== 'admin' && !allowed.includes(activeId)) {
    const fallback = allowed[0] || 'dashboard';
    if (typeof goTo === 'function') goTo(fallback);
  }
}

function enterApp(profile) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appRoot').style.display = 'flex';

  document.getElementById('userNameSidebar').textContent = profile.nome || profile.email;
  document.getElementById('userEmailSidebar').textContent = profile.email;
  document.getElementById('userAvatarSidebar').textContent = (profile.nome || profile.email || '?').charAt(0).toUpperCase();
  document.getElementById('userBadgeSidebar').textContent = profile.role === 'admin' ? 'Administrador' : 'Funcionário';

  // Puxa as chaves/config do painel do admin automaticamente — ninguém mais
  // precisa configurar nada na mão em cada computador.
  sb.from('settings').select('*').eq('id', 1).single().then(({ data }) => {
    if (data) {
      if (data.google_key) localStorage.setItem('prosp_google_key', data.google_key);
      if (data.groq_key) localStorage.setItem('prosp_groq_key', data.groq_key);
      if (data.calendar_id) localStorage.setItem('prosp_calendar_id', data.calendar_id);
      window.followUpConfig = {
        diasPadrao: data.dias_followup || 3,
        diasAlerta: data.dias_alerta_followup ?? 1
      };
    }
  });

  // Puxa leads, CRM, análises e propostas — iguais em qualquer aparelho.
  if (typeof carregarDadosDoTime === 'function') carregarDadosDoTime();
}

function showLogin() {
  document.getElementById('appRoot').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
}
