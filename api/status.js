// Returns connection status for all platforms
const { getTokenFromCookies, corsHeaders } = require('./_utils');

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
    instagram: !!(process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET),
    twitter: !!(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET),
    facebook: !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET),
    tiktok: !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET)
  };

  res.json({ status, configured });
};
