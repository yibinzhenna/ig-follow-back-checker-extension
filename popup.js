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
  list.innerHTML = items.map(u => `
    <div class="list-item">
      <div class="avatar" data-user="${u.username}">
        ${u.profile_pic
          ? `<img src="${u.profile_pic}" alt="" onerror="this.parentElement.textContent='${u.username.slice(0,2).toUpperCase()}'">`
          : u.username.slice(0,2).toUpperCase()}
      </div>
      <div class="item-info">
        <div class="item-username">@${u.username}</div>
        ${u.full_name ? `<div class="item-name">${u.full_name}</div>` : ''}
      </div>
      <button class="open-btn" data-url="https://www.instagram.com/${u.username}/">Open</button>
    </div>
  `).join('');

  list.querySelectorAll('.open-btn').forEach(btn => {
    btn.addEventListener('click', () => chrome.tabs.create({ url: btn.dataset.url }));
  });
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
    // Open Instagram first, then retry
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
