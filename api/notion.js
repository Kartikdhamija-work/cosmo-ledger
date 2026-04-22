export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, action, databaseId, schemaProps, pageProps } = req.body;
  if (!token || !databaseId) return res.status(400).json({ error: 'Missing token or databaseId' });

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28'
  };

  try {
    if (action === 'setup') {
      const r = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ properties: schemaProps })
      });
      return res.status(r.status).json(await r.json());
    }
    if (action === 'insert') {
      const r = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST', headers,
        body: JSON.stringify({ parent: { database_id: databaseId }, properties: pageProps })
      });
      return res.status(r.status).json(await r.json());
    }
    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
