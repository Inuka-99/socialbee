// Returns connection status for all platforms
const { getTokenFromCookies, corsHeaders, parseCookies, decrypt } = require('./_utils');

function getConfigValue(req, key) {
  if (process.env[key]) return process.env[key];
  const cookies = parseCookies(req.headers.cookie);
  const encrypted = cookies['sb_api_config'];
  if (!encrypted) return null;
  try {
    const config = JSON.parse(decrypt(encrypted));
    return config[key] || null;
  } catch {
    return null;
  }
}

module.exports = (req, res) => {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const platforms = ['instagram', 'twitter', 'facebook', 'tiktok'];
  const status = {};

  for (const platform of platforms) {
    const token = getTokenFromCookies(req, platform);
    if (token) {
      status[platform] = {
        connected: true,
        name: token.page_name || token.username || token.display_name || 'Connected',
        connected_at: token.connected_at
      };
    } else {
      status[platform] = { connected: false };
    }
  }

  const configured = {
    instagram: !!(getConfigValue(req, 'INSTAGRAM_CLIENT_ID') && getConfigValue(req, 'INSTAGRAM_CLIENT_SECRET')),
    twitter: !!(getConfigValue(req, 'TWITTER_CLIENT_ID') && getConfigValue(req, 'TWITTER_CLIENT_SECRET')),
    facebook: !!(getConfigValue(req, 'FACEBOOK_APP_ID') && getConfigValue(req, 'FACEBOOK_APP_SECRET')),
    tiktok: !!(getConfigValue(req, 'TIKTOK_CLIENT_KEY') && getConfigValue(req, 'TIKTOK_CLIENT_SECRET'))
  };

  res.json({ status, configured });
};
