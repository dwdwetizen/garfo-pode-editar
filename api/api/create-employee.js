// api/create-employee.js
// Cria um usuário novo (funcionário) com segurança, sem expor a service_role key no navegador.
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: 'Configuração do servidor incompleta' });

  const authHeader = req.headers.authorization || '';
  const callerToken = authHeader.replace('Bearer ', '');
  if (!callerToken) return res.status(401).json({ error: 'Não autenticado' });

  try {
    // 1) Identifica quem está chamando
    const meResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${callerToken}` }
    });
    const me = await meResp.json();
    if (!meResp.ok || !me.id) return res.status(401).json({ error: 'Sessão inválida' });

    // 2) Confirma que quem chamou é admin
    const profResp = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${me.id}&select=role`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const profs = await profResp.json();
    if (!profs || !profs[0] || profs[0].role !== 'admin') {
      return res.status(403).json({ error: 'Só administradores podem criar funcionários' });
    }

    // 3) Cria o usuário no Auth
    const { nome, email, senha, permissions } = req.body;
    if (!email || !senha) return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });

    const createResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha, email_confirm: true })
    });
    const created = await createResp.json();
    if (!createResp.ok) return res.status(400).json({ error: created.msg || created.error_description || 'Erro ao criar usuário' });

    // 4) Cria o perfil (role/permissões) desse novo usuário
    const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal'
      },
      body: JSON.stringify({ id: created.id, email, nome: nome || '', role: 'funcionario', permissions: permissions || [] })
    });
    if (!insertResp.ok) {
      const errBody = await insertResp.text();
      return res.status(400).json({ error: 'Usuário criado, mas erro ao salvar perfil: ' + errBody });
    }

    return res.status(200).json({ success: true, id: created.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
