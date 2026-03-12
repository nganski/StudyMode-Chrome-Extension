const DEFAULT_SETTINGS = {
    studyModeOn: false,
    blockSocial: true,
    blockYouTube: true,
    blockGaming: false,
    darkMode: true,
    adBlock: true,
    customerSites: []
}

let settings = { ...DEFAULT_SETTINGS };

document.addEventListener('DOMContentLoaded', async() => {
    const stored = await chrome.storage.local.get('studymodeSettings');
    if (stored.studymodeSettings){
        settings = { ...DEFAULT_SETTINGS, ...stored.studymodeSettings };
    }

    initUI();
    initTabs();
    initBlocker();

    renderTimerDisplay(totalSeconds);
    startTimer();
})


function saveSettings(){
  chrome.storage.local.set({ studymodeSettings: settings });
  chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', settings });
}


function initUI(){
    const masterToggle = document.getElementById('masterToggle');
    const masterLabel = document.getElementById('masterLabel');

    if (masterToggle && masterLabel) {
        masterToggle.classList.toggle('on', settings.studyModeOn);
        masterLabel.textContent = settings.studyModeOn ? 'ON' : 'OFF';
        updateStatusIndicator();

        masterToggle.addEventListener('click', () => {
            settings.studyModeOn = !settings.studyModeOn;
            masterToggle.classList.toggle('on', settings.studyModeOn);
            masterLabel.textContent = settings.studyModeOn ? 'ON' : 'OFF';
            updateStatusIndicator();
            saveSettings();
        });
    }

    document.querySelectorAll('.mini-toggle[data-key]').forEach(btn => {
    const key = btn.dataset.key;
    btn.classList.toggle('on', settings[key] !== false);
    btn.addEventListener('click', () => {
      settings[key] = !settings[key];
      btn.classList.toggle('on', settings[key]);
      saveSettings();
      
    });
  });
}

function updateStatusIndicator(){
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  dot.classList.toggle('active', settings.studyModeOn);
  text.textContent = settings.studyModeOn ? 'StudyMode ACTIVE' : 'StudyMode OFF';
}

// tabs
function initTabs(){
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });
}

// blockers
const SOCIAL_SITES = ['instagram.com', 'tiktok.com', 'twitter.com', 'x.com', 'reddit.com', 'facebook.com', 'snapchat.com', 'pinterest.com'];
const GAMING_SITES = ['twitch.tv', 'netflix.com', 'hulu.com', 'discord.com'];

function renderBlockedTags(){
  const list = document.getElementById('blockedSitesList');
  const active = [];

  if (settings.blockSocial) active.push(...SOCIAL_SITES.slice(0,4));
  if (settings.blockGaming) active.push(...GAMING_SITES.slice(0,2));
  list.innerHTML = active.map(s =>  `<span class="blocked-tag">${s}</span>`).join('');
}

function applyBlockingRules() {
  chrome.runtime.sendMessage({ type: 'APPLY_RULES', settings });
  renderBlockedTags();
}

function renderCustomSites(){
  const list = document.getElementById('customSitesList');
  list.innerHTML = (settings.customSites || []).map(s =>
    `<span class="blocked-tag" style="cursor:pointer" title="Click to remove" data-site="${s}">${s} ✕</span>`
  ).join('');
  list.querySelectorAll('.blocked-tag').forEach(tag => {
      tag.addEventListener('click', () => {
      settings.customSites = settings.customSites.filter(s => s !== tag.dataset.site);
      saveSettings();
      renderCustomSites();
      applyBlockingRules();
    });
  });
}

function initBlocker() {
  renderBlockedTags();
  renderCustomSites();

  document.getElementById('addCustomSite').addEventListener('click', () => {
    const input = document.getElementById('customSiteInput');
    let site = input.value.trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (!site) return;
    if (!settings.customSites.includes(site)) {
      settings.customSites.push(site);
      saveSettings();
      renderCustomSites();
      applyBlockingRules();
    }
    input.value = '';
  });

  document.getElementById('customSiteInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('addCustomSite').click();
  });
}

// Timer tab