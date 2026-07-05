// api/create-calendar-event.js
// Cria o evento direto na Google Agenda do dono, usando o refresh token salvo.
// Quem chama isso (admin ou funcionário) só precisa estar logado no LocalWay Rank.
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const authHeader = req.headers.authorization || '';
  const callerToken = authHeader.replace('Bearer ', '');
  if (!callerToken) return res.status(401).json({ error: 'Não autenticado' });

  try {
    // 1) Confirma que quem chamou está logado de verdade
    const meResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${callerToken}` }
    });
    const me = await meResp.json();
    if (!meResp.ok || !me.id) return res.status(401).json({ error: 'Sessão inválida' });

    // 2) Pega o refresh_token e o calendarId salvos nas configurações
    const settingsResp = await fetch(`${SUPABASE_URL}/rest/v1/settings?id=eq.1&select=google_refresh_token,calendar_id`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const settingsRows = await settingsResp.json();
    const settings = settingsRows && settingsRows[0];
    if (!settings || !settings.google_refresh_token) {
      return res.status(400).json({ error: 'Google Agenda ainda não foi conectada. Peça pro admin conectar no painel de Administração.' });
    }
    const calendarId = settings.calendar_id || 'primary';

    // 3) Troca o refresh_token por um access_token novo (válido só por 1 hora, mas isso é transparente)
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: settings.google_refresh_token,
        client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token'
      })
    });
    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) {
      return res.status(400).json({ error: 'Não foi possível renovar o acesso ao Google. Reconecte a Google Agenda no painel.' });
    }

    // 4) Cria o evento de verdade
    const { summary, description, start, end } = req.body;
    const eventResp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenData.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary, description,
        start: { dateTime: start, timeZone: 'America/Fortaleza' },
        end: { dateTime: end, timeZone: 'America/Fortaleza' }
      })
    });
    const eventData = await eventResp.json();
    if (!eventResp.ok) return res.status(400).json({ error: eventData.error?.message || 'Erro ao criar evento na agenda' });

    return res.status(200).json({ success: true, eventId: eventData.id, link: eventData.htmlLink });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
