const DEFAULT_SETTINGS = {
    studyModeOn: false,
    blockSocial: true,
    blockYouTube: true,
    blockGaming: false,
    blockAI: false,
    darkMode: true,
    adBlock: true,
    customerSites: [],
    timerMinutes: 25,
    timerMode: 'pomodoro'
};

let settings = { ...DEFAULT_SETTINGS };
let timerInterval = null;   // updates display every second
let timerRunning = false;
let timerEndTime = null;    // ms timestamp when timer will end
let timerTotalSeconds = 1500;

document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get('studymodeSettings');
  if (stored.studymodeSettings) {
    settings = { ...DEFAULT_SETTINGS, ...stored.studymodeSettings };
    settings.stats = { ...DEFAULT_SETTINGS.stats, ...(stored.studymodeSettings.stats || {}) };
  }

  currentSound = settings.selectedSound || null;
  isPlaying = settings.audioPlaying || false;

  // Restore timer state from storage
  const ts = settings.timerState || {};
  timerTotalSeconds = ts.totalSeconds || (settings.timerMinutes * 60) || 1500;
  if (ts.running && ts.endTime && ts.endTime > Date.now()) {
    timerEndTime = ts.endTime;
    timerRunning = true;
  } else {
    timerEndTime = null;
    timerRunning = false;
    // If it finished while popup was closed, endTime may be stale — leave at 0
  }
  sessionsCompleted = settings.stats?.sessionsCompleted || 0;

  initUI();
  initTabs();
  initTimer();
  initMusic();
  initStats();
  initBlocker();

  // Sync audio state from offscreen
  chrome.runtime.sendMessage({ type: 'GET_AUDIO_STATE' });

  // Listen for background messages — registered here so DOM is guaranteed ready
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'AUDIO_STATE_UPDATE') {
      isPlaying = msg.isPlaying;
      currentSound = msg.currentSound;
      syncMusicUI();
    }
    if (msg.type === 'TIMER_DONE') {
      timerRunning = false;
      timerEndTime = null;
      stopUITick();
      const startBtn = document.getElementById('timerStart');
      if (startBtn) startBtn.textContent = '▶ START';
      renderTimerDisplay(0, timerTotalSeconds);
      // Small delay to ensure background has finished writing stats to storage
      setTimeout(() => {
        chrome.storage.local.get('studymodeSettings', (data) => {
          if (data.studymodeSettings) {
            settings = { ...settings, stats: data.studymodeSettings.stats };
          }
          sessionsCompleted = settings.stats?.sessionsCompleted || 0;
          updateSessionDots();
          updateStatsUI();
        });
      }, 200);
    }
  });
});


function saveSettings(){
  chrome.storage.local.set({ studymodeSettings: settings });
  chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', settings });
}

// UI
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
const AI_SITES = ['chatgpt.com', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com']

function renderBlockedTags(){
  const list = document.getElementById('blockedSitesList');
  const active = [];

  if (settings.blockSocial) active.push(...SOCIAL_SITES.slice(0,4));
  if (settings.blockGaming) active.push(...GAMING_SITES.slice(0,3));
  if (settings.blockAI) active.push(...AI_SITES.slice(0,2));
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
function initTimer(){
  // mode buttons
  document.querySelectorAll('.timer-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (timerRunning) return;
      document.querySelectorAll('.timer-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      settings.timerMode = btn.dataset.mode;
      const mins = parseInt(btn.dataset.minutes);
      settings.timerMinutes = mins;
      timerTotalSeconds = mins * 60;
      settings.timerState = { running: false, endTime: null, totalSeconds: timerTotalSeconds };
      document.getElementById('timerModeLabel').textContent = btn.dataset.mode.toUpperCase();
      document.getElementById('customMinutes').value = mins;
      renderTimerDisplay(timerTotalSeconds, timerTotalSeconds);
      saveSettings();
    })
  })

  document.getElementById('timerStart').addEventListener('click', toggleTimer);
  document.getElementById('timerReset').addEventListener('click', resetTimer);

  document.getElementById('setCustomTimer').addEventListener('click', () => {
    if (timerRunning) return;
    const mins = Math.min(Math.max(parseInt(document.getElementById('customMinutes').value) || 25, 1), 120);
    settings.timerMinutes = mins;
    timerTotalSeconds = mins * 60;
    settings.timerState = { running: false, endTime: null, totalSeconds: timerTotalSeconds };
    renderTimerDisplay(timerTotalSeconds, timerTotalSeconds);
    saveSettings();
  });

  // ── Restore persisted mode selection ──
  const savedMode = settings.timerMode || 'pomodoro';
  document.querySelectorAll('.timer-mode-btn').forEach(btn => {
    const isActive = btn.dataset.mode === savedMode;
    btn.classList.toggle('active', isActive);
  });
  const modeLabel = document.getElementById('timerModeLabel');
  if (modeLabel) modeLabel.textContent = savedMode.toUpperCase();

  // ── Restore display from persisted state ──
  const remaining = timerRunning ? Math.max(0, Math.round((timerEndTime - Date.now()) / 1000)) : timerTotalSeconds;
  renderTimerDisplay(remaining, timerTotalSeconds);
  document.getElementById('timerStart').textContent = timerRunning ? '⏸ PAUSE' : '▶ START';
  updateSessionDots();

  if (timerRunning) startUITick();
}

function toggleTimer() {
  const btn = document.getElementById('timerStart');
  if (timerRunning) {
    // Pause: save remaining seconds so we can resume
    const remaining = Math.max(0, Math.round((timerEndTime - Date.now()) / 1000));
    timerRunning = false;
    timerEndTime = null;
    stopUITick();
    btn.textContent = '▶ START';
    // Store remaining so we can resume from here
    timerTotalSeconds = remaining; // treat remaining as the new "total" for resume
    settings.timerState = { running: false, endTime: null, totalSeconds: remaining };
    saveSettings();
    chrome.runtime.sendMessage({ type: 'TIMER_PAUSE' });
    renderTimerDisplay(remaining, settings.timerMinutes * 60);
  } else {
    // Start / resume from timerTotalSeconds
    timerEndTime = Date.now() + timerTotalSeconds * 1000;
    timerRunning = true;
    btn.textContent = '⏸ PAUSE';
    settings.timerState = { running: true, endTime: timerEndTime, totalSeconds: timerTotalSeconds };
    saveSettings();
    chrome.runtime.sendMessage({ type: 'TIMER_START', totalSeconds: timerTotalSeconds });
    startUITick();
  }
}

function resetTimer() {
  timerRunning = false;
  timerEndTime = null;
  stopUITick();
  timerTotalSeconds = settings.timerMinutes * 60;
  settings.timerState = { running: false, endTime: null, totalSeconds: timerTotalSeconds };
  saveSettings();
  chrome.runtime.sendMessage({ type: 'TIMER_RESET' });
  document.getElementById('timerStart').textContent = '▶ START';
  renderTimerDisplay(timerTotalSeconds, timerTotalSeconds);
}

function startUITick() {
  stopUITick();
  const originalTotal = settings.timerMinutes * 60; // for ring progress
  timerInterval = setInterval(() => {
    const remaining = Math.max(0, Math.round((timerEndTime - Date.now()) / 1000));
    renderTimerDisplay(remaining, originalTotal);
    if (remaining <= 0) {
      stopUITick();
      timerRunning = false;
      document.getElementById('timerStart').textContent = '▶ START';
      // Stats/notification handled by background alarm — just update UI
    }
  }, 500); // 500ms for snappier updates
}

function stopUITick() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function renderTimerDisplay(remainingSeconds, totalSeconds) {
  const s = Math.max(0, remainingSeconds);
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  const el = document.getElementById('timerDisplay');
  if (el) el.textContent = `${m}:${sec}`;
  // Ring — r=82, circumference = 2π×82 ≈ 515.2
  const ring = document.getElementById('timerRing');
  if (ring) {
    const progress = totalSeconds > 0 ? s / totalSeconds : 0;
    ring.style.strokeDashoffset = 515.2 * (1 - progress);
  }
  // Running indicator dots
  const d1 = document.getElementById('timerRunningDot');
  const d2 = document.getElementById('timerRunningDot2');
  if (d1) d1.classList.toggle('active', timerRunning);
  if (d2) d2.classList.toggle('active', timerRunning);
}

function updateSessionDots() {
  document.querySelectorAll('.session-dot').forEach((dot, i) => {
    dot.classList.toggle('done', i < sessionsCompleted);
  });
}