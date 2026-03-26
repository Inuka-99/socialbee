// Disconnect a platform by clearing its token cookie
const { clearTokenCookie, corsHeaders } = require('./_utils');

module.exports = (req, res) => {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const platform = req.query.platform;
  const validPlatforms = ['instagram', 'twitter', 'facebook', 'tiktok'];

  if (!platform || !validPlatforms.includes(platform)) {
    return res.status(400).json({ error: 'Invalid platform. Use: instagram, twitter, facebook, tiktok' });
  }

  clearTokenCookie(res, platform);
  res.json({ success: true, message: platform + ' disconnected' });
};
