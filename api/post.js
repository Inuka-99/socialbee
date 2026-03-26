// Post content to connected social media platforms
const { getTokenFromCookies, corsHeaders } = require('./_utils');

async function postToTwitter(token, content) {
  const res = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: content.text })
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message || 'Twitter post failed');
  return { success: true, id: data.data?.id, url: 'https://x.com/' + token.username + '/status/' + data.data?.id };
}

async function postToFacebook(token, content) {
  const params = new URLSearchParams({ message: content.text, access_token: token.access_token });
  const endpoint = content.image_url
    ? 'https://graph.facebook.com/v19.0/' + token.page_id + '/photos'
    : 'https://graph.facebook.com/v19.0/' + token.page_id + '/feed';
  if (content.image_url) params.append('url', content.image_url);
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Facebook post failed');
  return { success: true, id: data.id };
}

async function postToInstagram(token, content) {
  if (!token.ig_user_id) throw new Error('No Instagram Business account linked');
  if (!content.image_url) throw new Error('Instagram requires an image URL');
  const containerRes = await fetch('https://graph.facebook.com/v19.0/' + token.ig_user_id + '/media', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ image_url: content.image_url, caption: content.text, access_token: token.access_token })
  });
  const containerData = await containerRes.json();
  if (containerData.error) throw new Error(containerData.error.message);
  const publishRes = await fetch('https://graph.facebook.com/v19.0/' + token.ig_user_id + '/media_publish', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: containerData.id, access_token: token.access_token })
  });
  const publishData = await publishRes.json();
  if (publishData.error) throw new Error(publishData.error.message);
  return { success: true, id: publishData.id };
}

async function postToTikTok(token, content) {
  if (!content.image_url && !content.video_url) throw new Error('TikTok requires a photo or video URL');
  const postInfo = {
    post_info: { title: (content.text || '').substring(0, 150), privacy_level: 'PUBLIC_TO_EVERYONE' },
    source_info: { source: 'PULL_FROM_URL' },
    post_mode: 'DIRECT_POST',
    media_type: content.video_url ? 'VIDEO' : 'PHOTO'
  };
  if (content.video_url) postInfo.source_info.video_url = content.video_url;
  else postInfo.source_info.photo_images = [content.image_url];
  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/', {
    method: 'POST', headers: { 'Authorization': 'Bearer ' + token.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify(postInfo)
  });
  const data = await res.json();
  if (data.error && data.error.code !== 'ok') throw new Error(data.error?.message || 'TikTok post failed');
  return { success: true, publish_id: data.data?.publish_id };
}

const postFns = { twitter: postToTwitter, facebook: postToFacebook, instagram: postToInstagram, tiktok: postToTikTok };

module.exports = async (req, res) => {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Invalid JSON body' }); }

  const { text, image_url, video_url, platforms } = body;
  if (!text && !image_url) return res.status(400).json({ error: 'Provide at least text or image_url' });
  if (!platforms || !Array.isArray(platforms) || !platforms.length) return res.status(400).json({ error: 'Specify at least one platform' });

  const contentObj = { text, image_url, video_url };
  const results = {};

  for (const platform of platforms) {
    const token = getTokenFromCookies(req, platform);
    if (!token) { results[platform] = { success: false, error: platform + ' not connected' }; continue; }
    try { results[platform] = await postFns[platform](token, contentObj); }
    catch (err) { results[platform] = { success: false, error: err.message }; }
  }

  const allSuccess = Object.values(results).every(r => r.success);
  res.status(allSuccess ? 200 : 207).json({ results });
};
