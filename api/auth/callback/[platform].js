// OAuth callback handler for all platforms - dynamic route
const { getBaseUrl, setTokenCookie, parseCookies } = require('../../_utils');

async function handleInstagram(code, baseUrl, req, res) {
  const redirectUri = baseUrl + '/api/auth/callback/instagram';
  const tokenRes = await fetch('https://graph.facebook.com/v19.0/oauth/access_token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.INSTAGRAM_CLIENT_ID, client_secret: process.env.INSTAGRAM_CLIENT_SECRET, redirect_uri: redirectUri, code: code, grant_type: 'authorization_code' })
  });
  const tokenData = await tokenRes.json();
  if (tokenData.error) throw new Error(tokenData.error.message || 'Token exchange failed');
  const longRes = await fetch('https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=' + process.env.INSTAGRAM_CLIENT_ID + '&client_secret=' + process.env.INSTAGRAM_CLIENT_SECRET + '&fb_exchange_token=' + tokenData.access_token);
  const longData = await longRes.json();
  const accessToken = longData.access_token || tokenData.access_token;
  const pagesRes = await fetch('https://graph.facebook.com/v19.0/me/accounts?access_token=' + accessToken);
  const pagesData = await pagesRes.json();
  if (!pagesData.data || !pagesData.data.length) throw new Error('No Facebook Pages found.');
  const page = pagesData.data[0];
  const igRes = await fetch('https://graph.facebook.com/v19.0/' + page.id + '?fields=instagram_business_account,name&access_token=' + page.access_token);
  const igData = await igRes.json();
  return { access_token: page.access_token, page_id: page.id, page_name: page.name, ig_user_id: igData.instagram_business_account ? igData.instagram_business_account.id : null, connected_at: new Date().toISOString() };
}

async function handleTwitter(code, baseUrl, req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const codeVerifier = cookies.sb_tw_v;
  if (!codeVerifier) throw new Error('Missing PKCE verifier');
  const redirectUri = baseUrl + '/api/auth/callback/twitter';
  const basicAuth = Buffer.from(process.env.TWITTER_CLIENT_ID + ':' + process.env.TWITTER_CLIENT_SECRET).toString('base64');
  const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + basicAuth },
    body: new URLSearchParams({ code: code, grant_type: 'authorization_code', redirect_uri: redirectUri, code_verifier: codeVerifier })
  });
  const tokenData = await tokenRes.json();
  if (tokenData.error) throw new Error(tokenData.error_description || 'Token exchange failed');
  const userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=username', { headers: { 'Authorization': 'Bearer ' + tokenData.access_token } });
  const userData = await userRes.json();
  res.setHeader('Set-Cookie', ['sb_tw_v=; Path=/; Max-Age=0', 'sb_tw_s=; Path=/; Max-Age=0']);
  return { access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, username: userData.data ? userData.data.username : 'unknown', user_id: userData.data ? userData.data.id : null, connected_at: new Date().toISOString() };
}

async function handleFacebook(code, baseUrl, req, res) {
  const redirectUri = baseUrl + '/api/auth/callback/facebook';
  const tokenRes = await fetch('https://graph.facebook.com/v19.0/oauth/access_token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.FACEBOOK_APP_ID, client_secret: process.env.FACEBOOK_APP_SECRET, redirect_uri: redirectUri, code: code, grant_type: 'authorization_code' })
  });
  const tokenData = await tokenRes.json();
  if (tokenData.error) throw new Error(tokenData.error.message || 'Token exchange failed');
  const longRes = await fetch('https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=' + process.env.FACEBOOK_APP_ID + '&client_secret=' + process.env.FACEBOOK_APP_SECRET + '&fb_exchange_token=' + tokenData.access_token);
  const longData = await longRes.json();
  const accessToken = longData.access_token || tokenData.access_token;
  const pagesRes = await fetch('https://graph.facebook.com/v19.0/me/accounts?access_token=' + accessToken);
  const pagesData = await pagesRes.json();
  if (!pagesData.data || !pagesData.data.length) throw new Error('No Facebook Pages found.');
  const page = pagesData.data[0];
  return { access_token: page.access_token, page_id: page.id, page_name: page.name, connected_at: new Date().toISOString() };
}

async function handleTiktok(code, baseUrl, req, res) {
  const redirectUri = baseUrl + '/api/auth/callback/tiktok';
  const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY, client_secret: process.env.TIKTOK_CLIENT_SECRET, code: code, grant_type: 'authorization_code', redirect_uri: redirectUri })
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('TikTok token exchange failed');
  const userRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', { headers: { 'Authorization': 'Bearer ' + tokenData.access_token } });
  const userData = await userRes.json();
  res.setHeader('Set-Cookie', 'sb_tt_s=; Path=/; Max-Age=0');
  return { access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, open_id: tokenData.open_id, display_name: userData.data && userData.data.user ? userData.data.user.display_name : 'TikTok User', connected_at: new Date().toISOString() };
}

var handlers = { instagram: handleInstagram, twitter: handleTwitter, facebook: handleFacebook, tiktok: handleTiktok };
var nameFields = { instagram: 'page_name', twitter: 'username', facebook: 'page_name', tiktok: 'display_name' };

module.exports = async function(req, res) {
  var platform = req.query.platform;
  var code = req.query.code;
  var error = req.query.error;
  var baseUrl = getBaseUrl();

  if (error || !code) return res.redirect(302, baseUrl + '/#/connect?error=' + platform + '_denied');

  var handler = handlers[platform];
  if (!handler) return res.redirect(302, baseUrl + '/#/connect?error=unknown_platform');

  try {
    var tokenInfo = handler(code, baseUrl, req, res);
    if (tokenInfo && typeof tokenInfo.then === 'function') tokenInfo = await tokenInfo;
    setTokenCookie(res, platform, tokenInfo);
    var name = tokenInfo[nameFields[platform]] || 'Connected';
    var displayName = platform === 'twitter' ? '@' + name : name;
    res.redirect(302, baseUrl + '/#/connect?success=' + platform + '&name=' + encodeURIComponent(displayName));
  } catch (err) {
    console.error(platform + ' callback error:', err.message);
    res.redirect(302, baseUrl + '/#/connect?error=' + platform + '_failed');
  }
};
