// OAuth callback handler for all platforms — dynamic route
const { getBaseUrl, setTokenCookie, parseCookies, decrypt } = require('../../_utils');

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

async function handleInstagram(code, baseUrl, req, res) {
  const clientId = getConfigValue(req, 'INSTAGRAM_CLIENT_ID');
  const clientSecret = getConfigValue(req, 'INSTAGRAM_CLIENT_SECRET');
  const redirectUri = `${baseUrl}/api/auth/callback/instagram`;
  const tokenRes = await fetch('https://graph.facebook.com/v19.0/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code, grant_type: 'authorization_code' })
  });
  const tokenData = await tokenRes.json();
  if (tokenData.error) throw new Error(tokenData.error.message || 'Token exchange failed');
  const longRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${tokenData.access_token}`);
  const longData = await longRes.json();
  const accessToken = longData.access_token || tokenData.access_token;
  const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`);
  const pagesData = await pagesRes.json();
  if (!pagesData.data?.length) throw new Error('No Facebook Pages found. Link a Page to your Instagram Business account.');
  const page = pagesData.data[0];
  const igRes = await fetch(`https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account,name&access_token=${page.access_token}`);
  const igData = await igRes.json();
  return { access_token: page.access_token, page_id: page.id, page_name: page.name, ig_user_id: igData.instagram_business_account?.id || null, connected_at: new Date().toISOString() };
}

async function handleTwitter(code, baseUrl, req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const codeVerifier = cookies.sb_tw_v;
  if (!codeVerifier) throw new Error('Missing PKCE verifier');
  const clientId = getConfigValue(req, 'TWITTER_CLIENT_ID');
  const clientSecret = getConfigValue(req, 'TWITTER_CLIENT_SECRET');
  const redirectUri = `${baseUrl}/api/auth/callback/twitter`;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${basicAuth}` },
    body: new URLSearchParams({ code, grant_type: 'authorization_code', redirect_uri: redirectUri, code_verifier: codeVerifier })
  });
  const tokenData = await tokenRes.json();
  if (tokenData.error) throw new Error(tokenData.error_description || 'Token exchange failed');
  const userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=username', { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } });
  const userData = await userRes.json();
  res.setHeader('Set-Cookie', [`sb_tw_v=; Path=/; Max-Age=0`, `sb_tw_s=; Path=/; Max-Age=0`]);
  return { access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, username: userData.data?.username || 'unknown', user_id: userData.data?.id, connected_at: new Date().toISOString() };
}

async function handleFacebook(code, baseUrl, req, res) {
  const clientId = getConfigValue(req, 'FACEBOOK_APP_ID');
  const clientSecret = getConfigValue(req, 'FACEBOOK_APP_SECRET');
  const redirectUri = `${baseUrl}/api/auth/callback/facebook`;
  const tokenRes = await fetch('https://graph.facebook.com/v19.0/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code, grant_type: 'authorization_code' })
  });
  const tokenData = await tokenRes.json();
  if (tokenData.error) throw new Error(tokenData.error.message || 'Token exchange failed');
  const longRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${tokenData.access_token}`);
  const longData = await longRes.json();
  const accessToken = longData.access_token || tokenData.access_token;
  const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`);
  const pagesData = await pagesRes.json();
  if (!pagesData.data?.length) throw new Error('No Facebook Pages found.');
  const page = pagesData.data[0];
  return { access_token: page.access_token, page_id: page.id, page_name: page.name, connected_at: new Date().toISOString() };
}

async function handleTiktok(code, baseUrl, req, res) {
  const clientKey = getConfigValue(req, 'TIKTOK_CLIENT_KEY');
  const clientSecret = getConfigValue(req, 'TIKTOK_CLIENT_SECRET');
  const redirectUri = `${baseUrl}/api/auth/callback/tiktok`;
  const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, code, grant_type: 'authorization_code', redirect_uri: redirectUri })
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('TikTok token exchange failed');
  const userRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } });
  const userData = await userRes.json();
  res.setHeader('Set-Cookie', `sb_tt_s=; Path=/; Max-Age=0`);
  return { access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, open_id: tokenData.open_id, display_name: userData.data?.user?.display_name || 'TikTok User', connected_at: new Date().toISOString() };
}

const handlers = { instagram: handleInstagram, twitter: handleTwitter, facebook: handleFacebook, tiktok: handleTiktok };
const nameFields = { instagram: 'page_name', twitter: 'username', facebook: 'page_name', tiktok: 'display_name' };

module.exports = async (req, res) => {
  const { platform, code, error } = req.query;
  const baseUrl = getBaseUrl();
  if (error || !code) return res.redirect(302, `${baseUrl}/#/connect?error=${platform}_denied`);
  const handler = handlers[platform];
  if (!handler) return res.redirect(302, `${baseUrl}/#/connect?error=unknown_platform`);
  try {
    const tokenInfo = await handler(code, baseUrl, req, res);
    setTokenCookie(res, platform, tokenInfo);
    const name = tokenInfo[nameFields[platform]] || 'Connected';
    const displayName = platform === 'twitter' ? '@' + name : name;
    res.redirect(302, `${baseUrl}/#/connect?success=${platform}&name=${encodeURIComponent(displayName)}`);
  } catch (err) {
    console.error(`${platform} callback error:`, err.message);
    res.redirect(302, `${baseUrl}/#/connect?error=${platform}_failed`);
  }
};
