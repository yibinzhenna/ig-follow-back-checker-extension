// popup.js

let allResults = [];
let port = null;
let igTabId = null;
let isUnfollowingAll = false;

function $(id) { return document.getElementById(id); }

function showError(msg) {
  const box = $('error-box');
  box.textContent = msg;
  box.classList.add('visible');
  $('status-bar').classList.remove('visible');
}

function setStatus(text) {
  $('status-bar').classList.add('visible');
  $('error-box').classList.remove('visible');
  $('status-text').textContent = text;
}

function renderList(items) {
  const list = $('list');
  if (!items.length) {
    list.innerHTML = '<div class="empty">Everyone follows you back 🎉</div>';
    return;
  }

  list.innerHTML = '';
  const fragment = document.createDocumentFragment();

  items.forEach(u => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.dataset.id = u.id;
    item.dataset.username = u.username;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';

    if (u.profile_pic) {
      const img = document.createElement('img');
      img.src = u.profile_pic;
      img.alt = '';
      img.onerror = () => {
        avatar.removeChild(img);
        avatar.textContent = u.username.slice(0, 2).toUpperCase();
      };
      avatar.appendChild(img);
    } else {
      avatar.textContent = u.username.slice(0, 2).toUpperCase();
    }

    const info = document.createElement('div');
    info.className = 'item-info';

    const uname = document.createElement('div');
    uname.className = 'item-username';
    uname.textContent = `@${u.username}`;
    info.appendChild(uname);

    if (u.full_name) {
      const name = document.createElement('div');
      name.className = 'item-name';
      name.textContent = u.full_name;
      info.appendChild(name);
    }

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const openBtn = document.createElement('button');
    openBtn.className = 'open-btn';
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', () => chrome.tabs.create({ url: `https://www.instagram.com/${u.username}/` }));

    const unfollowBtn = document.createElement('button');
    unfollowBtn.className = 'unfollow-btn';
    unfollowBtn.textContent = 'Unfollow';
    unfollowBtn.addEventListener('click', () => unfollowOne(u.id, u.username, item, unfollowBtn));

    actions.appendChild(openBtn);
    actions.appendChild(unfollowBtn);

    item.appendChild(avatar);
    item.appendChild(info);
    item.appendChild(actions);
    fragment.appendChild(item);
  });

  list.appendChild(fragment);
}

async function unfollowOne(userId, username, itemEl, btn) {
  btn.disabled = true;
  btn.textContent = '…';

  chrome.tabs.sendMessage(igTabId, { type: 'UNFOLLOW_ONE', userId }, res => {
    if (chrome.runtime.lastError || !res?.success) {
      btn.textContent = 'Failed';
      btn.style.color = 'var(--danger)';
      setTimeout(() => { btn.textContent = 'Unfollow'; btn.disabled = false; btn.style.color = ''; }, 2000);
      return;
    }
    allResults = allResults.filter(u => u.id !== userId);
    itemEl.style.opacity = '0';
    itemEl.style.transform = 'translateX(10px)';
    itemEl.style.transition = 'opacity .2s, transform .2s';
    setTimeout(() => itemEl.remove(), 200);
    $('s-nfb').textContent = allResults.length;
    $('count-label').textContent = `${allResults.length} accounts`;
    updateUnfollowAllBtn();
  });
}

function updateUnfollowAllBtn() {
  const btn = $('unfollow-all-btn');
  if (!btn) return;
  btn.textContent = `Unfollow all (${allResults.length})`;
  if (allResults.length === 0) btn.disabled = true;
}

function showDiscrepancy(discrepancy, displayedFollowersCount, displayedFollowingCount, fetchedFollowers, fetchedFollowing) {
  const box = $('discrepancy-box');
  if (!box) return;

  const hasGap = (discrepancy.followers !== null && discrepancy.followers > 0) ||
                 (discrepancy.following !== null && discrepancy.following > 0);

  if (!hasGap) { box.style.display = 'none'; return; }

  let msg = '⚠️ Instagram\'s displayed count differs from fetched results — ';
  const parts = [];
  if (discrepancy.followers > 0)
    parts.push(`${displayedFollowersCount} followers shown vs ${fetchedFollowers} fetched`);
  if (discrepancy.following > 0)
    parts.push(`${displayedFollowingCount} following shown vs ${fetchedFollowing} fetched`);
  msg += parts.join(', ') + '. The gap is usually ghost/deactivated accounts Instagram can\'t return via API.';

  box.textContent = msg;
  box.style.display = 'block';
}

function showResults(data) {
  allResults = data.notFollowingBack;
  $('status-bar').classList.remove('visible');

  $('s-following').textContent = data.followingCount;
  $('s-followers').textContent = data.followersCount;
  $('s-nfb').textContent = data.notFollowingBack.length;
  $('stats').classList.add('visible');

  showDiscrepancy(
    data.discrepancy,
    data.displayedFollowersCount,
    data.displayedFollowingCount,
    data.followersCount,
    data.followingCount
  );

  $('search-wrap').classList.add('visible');
  $('list-header').classList.add('visible');
  $('list').classList.add('visible');
  $('count-label').textContent = `${allResults.length} accounts`;

  renderList(allResults);
  updateUnfollowAllBtn();
  $('check-btn').disabled = false;
}

$('search-input').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  const filtered = allResults.filter(u =>
    u.username.toLowerCase().includes(q) ||
    (u.full_name || '').toLowerCase().includes(q)
  );
  $('count-label').textContent = `${filtered.length} accounts`;
  renderList(filtered);
});

$('copy-all').addEventListener('click', () => {
  const text = allResults.map(u => `@${u.username}`).join('\n');
  navigator.clipboard.writeText(text).then(() => {
    $('copy-all').textContent = 'Copied!';
    setTimeout(() => { $('copy-all').textContent = 'Copy'; }, 2000);
  });
});

$('unfollow-all-btn').addEventListener('click', () => {
  if (isUnfollowingAll) return;
  if (!allResults.length) return;

  const confirmed = confirm(`Unfollow all ${allResults.length} accounts? This will run slowly to avoid Instagram rate limits.`);
  if (!confirmed) return;

  isUnfollowingAll = true;
  $('unfollow-all-btn').disabled = true;
  $('unfollow-all-btn').textContent = 'Unfollowing…';

  const users = allResults.map(u => ({ id: u.id, username: u.username }));
  chrome.tabs.sendMessage(igTabId, { type: 'UNFOLLOW_ALL', users }, res => {
    if (chrome.runtime.lastError) {
      showError('Could not reach Instagram tab.');
      isUnfollowingAll = false;
      updateUnfollowAllBtn();
    }
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'UNFOLLOW_PROGRESS') {
    const { done, failed, total, username, rateLimited } = msg.payload;
    if (rateLimited) {
      setStatus(`Rate limited — waiting 60s… (${done}/${total})`);
    } else {
      setStatus(`Unfollowed @${username} (${done}/${total}${failed ? `, ${failed} failed` : ''})`);
    }
    allResults = allResults.filter(u => u.username !== username);
    const el = document.querySelector(`.list-item[data-username="${username}"]`);
    if (el) {
      el.style.opacity = '0';
      el.style.transition = 'opacity .2s';
      setTimeout(() => el.remove(), 200);
    }
    $('s-nfb').textContent = allResults.length;
    $('count-label').textContent = `${allResults.length} accounts`;
  }

  if (msg.type === 'UNFOLLOW_DONE') {
    const { done, failed } = msg.payload;
    isUnfollowingAll = false;
    $('status-bar').classList.remove('visible');
    $('unfollow-all-btn').textContent = `Done — ${done} unfollowed${failed ? `, ${failed} failed` : ''}`;
    setTimeout(updateUnfollowAllBtn, 3000);
  }
});

$('check-btn').addEventListener('click', async () => {
  const username = $('username-input').value.trim().replace('@', '');
  if (!username) { showError('Please enter a username.'); return; }

  $('error-box').classList.remove('visible');
  $('stats').classList.remove('visible');
  $('search-wrap').classList.remove('visible');
  $('list-header').classList.remove('visible');
  $('list').classList.remove('visible');
  $('list').innerHTML = '';
  const dbox = $('discrepancy-box');
  if (dbox) dbox.style.display = 'none';
  $('check-btn').disabled = true;
  allResults = [];
  isUnfollowingAll = false;

  setStatus('Connecting to Instagram…');

  if (port) { try { port.disconnect(); } catch {} }
  port = chrome.runtime.connect({ name: 'popup' });
  port.onMessage.addListener(msg => {
    if (msg.type === 'STATUS') setStatus(msg.payload.text);
    if (msg.type === 'PROGRESS') setStatus(`Fetching ${msg.payload.type}… (${msg.payload.count} loaded)`);
    if (msg.type === 'DONE') showResults(msg.payload);
    if (msg.type === 'ERROR') { showError(msg.payload.message); $('check-btn').disabled = false; }
  });

  const tabs = await chrome.tabs.query({ url: 'https://www.instagram.com/*' });
  if (!tabs.length) {
    showError('Please open Instagram in a tab first, then try again.');
    $('check-btn').disabled = false;
    return;
  }

  igTabId = tabs[0].id;

  chrome.tabs.sendMessage(igTabId, { type: 'START_CHECK', username }, res => {
    if (chrome.runtime.lastError) {
      showError('Could not reach Instagram tab. Refresh instagram.com and try again.');
      $('check-btn').disabled = false;
    }
  });
});

$('username-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('check-btn').click();
});