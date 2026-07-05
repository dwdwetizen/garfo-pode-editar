// api/oauth-callback.js
// Recebe a autorização do Google, troca por um "refresh token" e guarda no banco,
// pra nunca mais precisar pedir autorização de novo (só se o admin desconectar).
module.exports = async function handler(req, res) {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const REDIRECT_URI = `https://${req.headers.host}/api/oauth-callback`;

  const code = req.query.code;
  if (!code) return res.status(400).send('Código de autorização não recebido.');

  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI, grant_type: 'authorization_code'
      })
    });
    const tokens = await tokenResp.json();

    if (!tokens.refresh_token) {
      return res.status(400).send(
        'Não recebemos permissão de acesso contínuo do Google. Isso costuma acontecer se você já ' +
        'tinha autorizado antes. Vá em https://myaccount.google.com/permissions, remova o acesso do ' +
        'app "LocalWay Rank" (ou o nome que você deu), e tente conectar de novo.'
      );
    }

    await fetch(`${SUPABASE_URL}/rest/v1/settings?id=eq.1`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal'
      },
      body: JSON.stringify({ google_refresh_token: tokens.refresh_token })
    });

    res.writeHead(302, { Location: '/?agenda_conectada=1' });
    res.end();
  } catch (err) {
    res.status(500).send('Erro ao conectar com o Google: ' + err.message);
  }
};
