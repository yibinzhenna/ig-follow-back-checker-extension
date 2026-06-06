// content.js — runs in the context of instagram.com

async function getCSRFToken() {
  const cookies = document.cookie.split(';');
  for (const c of cookies) {
    const [key, val] = c.trim().split('=');
    if (key === 'csrftoken') return val;
  }
  return null;
}

async function getUserId(username) {
  const res = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
    headers: { 'x-ig-app-id': '936619743392459' }
  });
  if (!res.ok) throw new Error('Could not fetch profile. Make sure you are logged in to Instagram.');
  const data = await res.json();
  return data?.data?.user?.id;
}

async function fetchAll(userId, type) {
  const endpoint = type === 'followers'
    ? `https://www.instagram.com/api/v1/friendships/${userId}/followers/`
    : `https://www.instagram.com/api/v1/friendships/${userId}/following/`;

  const users = [];
  let nextMaxId = null;

  while (true) {
    const url = nextMaxId ? `${endpoint}?max_id=${nextMaxId}&count=200` : `${endpoint}?count=200`;
    const res = await fetch(url, {
      headers: { 'x-ig-app-id': '936619743392459' }
    });

    if (res.status === 401) throw new Error('Not logged in to Instagram. Please log in and try again.');
    if (res.status === 429) throw new Error('Instagram rate-limited this request. Wait a few minutes and try again.');
    if (!res.ok) throw new Error(`Instagram returned an error (${res.status}). Try again.`);

    const data = await res.json();
    const batch = data.users || [];
    users.push(...batch);

    chrome.runtime.sendMessage({
      type: 'PROGRESS',
      payload: { type, count: users.length }
    });

    nextMaxId = data.next_max_id;
    if (!nextMaxId || batch.length === 0) break;

    await new Promise(r => setTimeout(r, 800));
  }

  return users;
}

async function unfollowUser(userId) {
  const csrf = await getCSRFToken();
  const res = await fetch(`https://www.instagram.com/api/v1/friendships/destroy/${userId}/`, {
    method: 'POST',
    headers: {
      'x-ig-app-id': '936619743392459',
      'x-csrftoken': csrf,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: `user_id=${userId}`
  });
  if (res.status === 429) throw new Error('rate_limited');
  if (!res.ok) throw new Error(`failed_${res.status}`);
  return true;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // --- Start full check ---
  if (msg.type === 'START_CHECK') {
    (async () => {
      try {
        const username = msg.username.trim().replace('@', '');
        if (!username) throw new Error('Please enter a username.');

        sendResponse({ status: 'started' });

        chrome.runtime.sendMessage({ type: 'STATUS', payload: { text: 'Looking up account…' } });
        const userId = await getUserId(username);
        if (!userId) throw new Error('Account not found. Check the username and try again.');

        chrome.runtime.sendMessage({ type: 'STATUS', payload: { text: 'Fetching following list…' } });
        const following = await fetchAll(userId, 'following');

        chrome.runtime.sendMessage({ type: 'STATUS', payload: { text: 'Fetching followers list…' } });
        const followers = await fetchAll(userId, 'followers');

        const followerSet = new Set(followers.map(u => u.username));
        const notFollowingBack = following
          .filter(u => !followerSet.has(u.username))
          .map(u => ({ username: u.username, full_name: u.full_name, profile_pic_url: u.profile_pic_url, id: u.pk }))
          .sort((a, b) => a.username.localeCompare(b.username));

        chrome.runtime.sendMessage({ type: 'STATUS', payload: { text: 'Loading profile pictures…' } });

        const withPics = await Promise.all(notFollowingBack.map(async (u) => {
          try {
            const res = await fetch(u.profile_pic_url);
            const blob = await res.blob();
            const base64 = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
            return { ...u, profile_pic: base64 };
          } catch {
            return { ...u, profile_pic: null };
          }
        }));

        chrome.runtime.sendMessage({
          type: 'DONE',
          payload: {
            notFollowingBack: withPics,
            followingCount: following.length,
            followersCount: followers.length
          }
        });

      } catch (err) {
        chrome.runtime.sendMessage({ type: 'ERROR', payload: { message: err.message } });
      }
    })();
    return true;
  }

  // --- Unfollow a single user ---
  if (msg.type === 'UNFOLLOW_ONE') {
    (async () => {
      try {
        await unfollowUser(msg.userId);
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, reason: err.message });
      }
    })();
    return true;
  }

  // --- Unfollow all (with delays) ---
  if (msg.type === 'UNFOLLOW_ALL') {
    (async () => {
      sendResponse({ status: 'started' });
      const users = msg.users; // array of { id, username }
      let done = 0;
      let failed = 0;

      for (const u of users) {
        try {
          await unfollowUser(u.id);
          done++;
          chrome.runtime.sendMessage({
            type: 'UNFOLLOW_PROGRESS',
            payload: { done, failed, total: users.length, username: u.username }
          });
        } catch (err) {
          if (err.message === 'rate_limited') {
            // Back off and retry once after 60s
            chrome.runtime.sendMessage({
              type: 'UNFOLLOW_PROGRESS',
              payload: { done, failed, total: users.length, username: u.username, rateLimited: true }
            });
            await new Promise(r => setTimeout(r, 60000));
            try {
              await unfollowUser(u.id);
              done++;
            } catch {
              failed++;
            }
          } else {
            failed++;
          }
        }
        // 2–4s random delay between each unfollow to mimic human behavior
        const delay = 2000 + Math.random() * 2000;
        await new Promise(r => setTimeout(r, delay));
      }

      chrome.runtime.sendMessage({
        type: 'UNFOLLOW_DONE',
        payload: { done, failed, total: users.length }
      });
    })();
    return true;
  }
});