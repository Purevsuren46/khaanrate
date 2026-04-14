const axios = require('axios');

// Buffer API — free plan supports 3 social accounts, 10 posts/channel
// Sign up at buffer.com, get access token from https://buffer.com/developers/api

const BUFFER_API = 'https://api.bufferapp.com/1';

// Post to Buffer (which posts to Facebook/IG/Twitter)
async function postToBuffer(accessToken, profileIds, text) {
  try {
    const res = await axios.post(`${BUFFER_API}/updates/create.json`, {
      access_token: accessToken,
      profile_ids: profileIds,
      text: text,
      // scheduled_at: auto (Buffer schedules optimally)
    });
    return { success: true, id: res.data?.success };
  } catch (err) {
    console.error('Buffer error:', err.response?.data?.error || err.message);
    return { success: false, error: err.response?.data?.error || err.message };
  }
}

// List connected profiles
async function getProfiles(accessToken) {
  try {
    const { data } = await axios.get(`${BUFFER_API}/profiles.json?access_token=${accessToken}`);
    return data.map(p => ({ id: p.id, service: p.service, username: p.service_username }));
  } catch (err) {
    console.error('Buffer profiles error:', err.message);
    return [];
  }
}

// Make.com webhook alternative (simpler, no Buffer account needed)
async function postToMake(webhookUrl, content) {
  try {
    await axios.post(webhookUrl, content);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { postToBuffer, getProfiles, postToMake };
