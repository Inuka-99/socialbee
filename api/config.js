// Store and retrieve API keys via encrypted cookies
const { encrypt, decrypt, parseCookies, corsHeaders } = require('./_utils');

const PLATFORMS = {
  instagram: ['INSTAGRAM_CLIENT_ID', 'INSTAGRAM_CLIENT_SECRET'],
  twitter: ['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET'],
  facebook: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
  tiktok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET']
};

function getConfigFromCookies(req) {
  const cookies = parseCookies(req.headers.cookie);
  const encrypted = cookies['sb_api_config'];
  if (!encrypted) return {};
  try {
    return JSON.parse(decrypt(encrypted));
  } catch {
    return {};
  }
}

function setConfigCookie(res, config, existingCookies) {
  const encrypted = encrypt(JSON.stringify(config));
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  const existing = res.getHeader('Set-Cookie');
  const cookies = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
  cookies.push(`sb_api_config=${encodeURIComponent(encrypted)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
  res.setHeader('Set-Cookie', cookies);
}

function getConfigValue(req, key) {
  const config = getConfigFromCookies(req);
  return config[key] || process.env[key] || null;
}

module.exports = async (req, res) => {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const config = getConfigFromCookies(req);
    const result = {};
    for (const [platform, keys] of Object.entries(PLATFORMS)) {
      result[platform] = {
        configured: keys.every(k => !!(config[k] || process.env[k])),
        keys: {}
      };
      for (const k of keys) {
        const val = config[k] || process.env[k];
        result[platform].keys[k] = val ? ('*'.repeat(Math.max(0, val.length - 4)) + val.slice(-4)) : null;
      }
    }
    return res.json({ platforms: result, hasEncryptionKey: true });
  }

  if (req.method === 'POST') {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    const { keys } = body;
    if (!keys || typeof keys !== 'object') {
      return res.status(400).json({ error: 'Provide { keys: { KEY_NAME: "value", ... } }' });
    }
    const existing = getConfigFromCookies(req);
    const updated = { ...existing };
    for (const [key, value] of Object.entries(keys)) {
      if (value === null || value === '') {
        delete updated[key];
      } else {
        updated[key] = value.trim();
      }
    }
    setConfigCookie(res, updated);
    return res.json({ success: true, message: 'API keys saved successfully' });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', `sb_api_config=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    return res.json({ success: true, message: 'All stored API keys cleared' });
  }

  res.status(405).json({ error: 'Method not allowed' });
};

module.exports.getConfigValue = getConfigValue;
module.exports.getConfigFromCookies = getConfigFromCookies;
