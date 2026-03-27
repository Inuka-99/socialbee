// OAuth initiation for all platforms — dynamic route
const crypto = require('crypto');
const { getBaseUrl, parseCookies, decrypt } = require('../_utils');

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

const oauthConfigs = {
  instagram: (baseUrl, req) => {
    const clientId = getConfigValue(req, 'INSTAGRAM_CLIENT_ID');
    if (!clientId) return null;
    const redirectUri = `${baseUrl}/api/auth/callback/instagram`;
    const scope = 'instagram_basic,instagram_content_publish,instagram_manage_insights,pages_show_list,pages_read_engagement';
    return `https://www.facebook.com/v19.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=code&state=instagram`;
  },
  twitter: (baseUrl, req, res) => {
    const clientId = getConfigValue(req, 'TWITTER_CLIENT_ID');
    if (!clientId) return null;
    const redirectUri = `${baseUrl}/api/auth/callback/twitter`;
    const scope = 'tweet.read tweet.write users.read offline.access';
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');
    res.setHeader('Set-Cookie', [
      `sb_tw_v=${codeVerifier}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      `sb_tw_s=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    ]);
    return `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
  },
  facebook: (baseUrl, req) => {
    const clientId = getConfigValue(req, 'FACEBOOK_APP_ID');
    if (!clientId) return null;
    const redirectUri = `${baseUrl}/api/auth/callback/facebook`;
    const scope = 'pages_manage_posts,pages_read_engagement,pages_show_list,pages_read_user_content';
    return `https://www.facebook.com/v19.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=code&state=facebook`;
  },
  tiktok: (baseUrl, req, res) => {
    const clientKey = getConfigValue(req, 'TIKTOK_CLIENT_KEY');
    if (!clientKey) return null;
    const redirectUri = `${baseUrl}/api/auth/callback/tiktok`;
    const scope = 'user.info.basic,video.publish,video.upload';
    const state = crypto.randomBytes(16).toString('hex');
    res.setHeader('Set-Cookie', `sb_tt_s=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
    return `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  }
};

module.exports = (req, res) => {
  const { platform } = req.query;
  const configFn = oauthConfigs[platform];
  if (!configFn) return res.status(400).json({ error: `Unknown platform: ${platform}` });

  const baseUrl = getBaseUrl();
  const authUrl = configFn(baseUrl, req, res);
  if (!authUrl) return res.status(500).json({ error: `${platform} not configured. Add your API keys on the Connect page.` });

  res.redirect(302, authUrl);
};
