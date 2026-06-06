// popup.js

let allResults = [];
let port = null;

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
    list.innerHTML = '<div class="empty">No results found</div>';
    return;
  }

  // Build DOM nodes directly to safely handle base64 data
  list.innerHTML = '';
  const fragment = document.createDocumentFragment();

  items.forEach(u => {
    const item = document.createElement('div');
    item.className = 'list-item';

    const avatar = document.createElement('div');
    avatar.className = 'avatar';

    if (u.profile_pic) {
      const img = document.createElement('img');
      img.src = u.profile_pic; // base64 data URL
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

    const btn = document.createElement('button');
    btn.className = 'open-btn';
    btn.textContent = 'Open';
    btn.addEventListener('click', () => chrome.tabs.create({ url: `https://www.instagram.com/${u.username}/` }));

    item.appendChild(avatar);
    item.appendChild(info);
    item.appendChild(btn);
    fragment.appendChild(item);
  });

  list.appendChild(fragment);
}

function showResults(data) {
  allResults = data.notFollowingBack;
  $('status-bar').classList.remove('visible');

  $('s-following').textContent = data.followingCount;
  $('s-followers').textContent = data.followersCount;
  $('s-nfb').textContent = data.notFollowingBack.length;
  $('stats').classList.add('visible');

  $('search-wrap').classList.add('visible');
  $('list-header').classList.add('visible');
  $('list').classList.add('visible');
  $('count-label').textContent = `${allResults.length} accounts`;

  renderList(allResults);
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
    setTimeout(() => { $('copy-all').textContent = 'Copy usernames'; }, 2000);
  });
});

$('check-btn').addEventListener('click', async () => {
  const username = $('username-input').value.trim().replace('@', '');
  if (!username) { showError('Please enter a username.'); return; }

  // Reset UI
  $('error-box').classList.remove('visible');
  $('stats').classList.remove('visible');
  $('search-wrap').classList.remove('visible');
  $('list-header').classList.remove('visible');
  $('list').classList.remove('visible');
  $('list').innerHTML = '';
  $('check-btn').disabled = true;
  allResults = [];

  setStatus('Connecting to Instagram…');

  // Connect port to background
  if (port) { try { port.disconnect(); } catch {} }
  port = chrome.runtime.connect({ name: 'popup' });
  port.onMessage.addListener(msg => {
    if (msg.type === 'STATUS') setStatus(msg.payload.text);
    if (msg.type === 'PROGRESS') {
      setStatus(`Fetching ${msg.payload.type}… (${msg.payload.count} loaded)`);
    }
    if (msg.type === 'DONE') showResults(msg.payload);
    if (msg.type === 'ERROR') { showError(msg.payload.message); $('check-btn').disabled = false; }
  });

  // Find the Instagram tab and send the message
  const tabs = await chrome.tabs.query({ url: 'https://www.instagram.com/*' });
  if (!tabs.length) {
    showError('Please open Instagram in a tab first, then try again.');
    $('check-btn').disabled = false;
    return;
  }

  chrome.tabs.sendMessage(tabs[0].id, { type: 'START_CHECK', username }, res => {
    if (chrome.runtime.lastError) {
      showError('Could not reach Instagram tab. Refresh instagram.com and try again.');
      $('check-btn').disabled = false;
    }
  });
});

// Allow Enter key to trigger check
$('username-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('check-btn').click();
});