module.exports = async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let GOOGLE_KEY = process.env.GOOGLE_API_KEY || '';
  if (SUPABASE_URL && SERVICE_KEY) {
    try {
      const settingsResp = await fetch(`${SUPABASE_URL}/rest/v1/settings?id=eq.1&select=google_key`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      const settingsData = await settingsResp.json();
      if (settingsData && settingsData[0] && settingsData[0].google_key) {
        GOOGLE_KEY = settingsData[0].google_key;
      }
    } catch (e) { /* se falhar, segue com a env var como fallback */ }
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!GOOGLE_KEY) {
    return res.status(500).json({ error: 'API key não configurada' });
  }

  const params = req.query;
  const action = params.action;

  try {
    let url = '';

    if (action === 'search') {
      const query = params.query || '';
      url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_KEY}&language=pt-BR`;

    } else if (action === 'details') {
      const placeId = params.place_id || '';
      const fields = 'place_id,name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,opening_hours,photos,types,business_status,geometry,reviews,price_level,url,editorial_summary';
      url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_KEY}&language=pt-BR`;

    } else if (action === 'nearby') {
      const location = params.location || '';
      const radius = params.radius || '3000';
      const keyword = params.keyword || '';
      url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location}&radius=${radius}&keyword=${encodeURIComponent(keyword)}&key=${GOOGLE_KEY}&language=pt-BR`;

    } else if (action === 'photo') {
      const ref = params.ref || '';
      const maxwidth = params.maxwidth || '600';
      url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxwidth}&photoreference=${ref}&key=${GOOGLE_KEY}`;
      return res.redirect(302, url);

    } else if (action === 'resolve_url') {
      const mapsUrl = params.url || '';
      let query = '';

      const placeMatch = mapsUrl.match(/\/maps\/place\/([^/@]+)/);
      if (placeMatch) {
        query = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
      }

      const qMatch = mapsUrl.match(/[?&]q=([^&]+)/);
      if (!query && qMatch) {
        query = decodeURIComponent(qMatch[1].replace(/\+/g, ' '));
      }

      const coordMatch = mapsUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      let searchUrl = '';

      if (coordMatch && query) {
        searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${coordMatch[1]},${coordMatch[2]}&radius=500&key=${GOOGLE_KEY}&language=pt-BR`;
      } else if (query) {
        searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_KEY}&language=pt-BR`;
      } else {
        return res.status(400).json({ error: 'Não foi possível extrair informações da URL' });
      }

      const response = await fetch(searchUrl);
      const data = await response.json();
      return res.status(200).json(data);

    } else {
      return res.status(400).json({ error: 'Ação inválida' });
    }

    const response = await fetch(url);
    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
