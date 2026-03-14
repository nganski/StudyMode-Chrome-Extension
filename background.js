// StudyMode - Background Service Worker

const SOCIAL_SITES = ['instagram.com', 'tiktok.com', 'twitter.com', 'x.com', 'reddit.com', 'facebook.com', 'snapchat.com', 'pinterest.com'];
const GAMING_SITES = ['twitch.tv', 'netflix.com', 'hulu.com', 'discord.com'];
const AI_SITES = ['chatgpt.com', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com']

let settings = null;

// Startup 
chrome.storage.local.get('studymodeSettings', (data) => {
  settings = data.studymodeSettings || getDefaults();
  applyAllRules();
  restoreAudioIfNeeded();
});

// Messages 
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'SETTINGS_UPDATED':
      settings = msg.settings;
      applyAllRules();
      break;

    case 'APPLY_RULES':
      settings = msg.settings;
      applyAllRules();
      break;

    case 'GET_SETTINGS':
      sendResponse(settings || getDefaults());
      return false;

    case 'SITE_BLOCKED':
      incrementBlockCount();
      break;

    case 'PLAY_SOUND':
      ensureOffscreen().then(() => {
        chrome.runtime.sendMessage({
          target: 'offscreen',
          action: 'play',
          sound: msg.sound,
          volume: msg.volume
        }).catch(() => {});
      });
      break;

    case 'STOP_SOUND':
      ensureOffscreen().then(() => {
        chrome.runtime.sendMessage({ target: 'offscreen', action: 'stop' }).catch(() => {});
      });
      break;

    case 'SET_VOLUME':
      ensureOffscreen().then(() => {
        chrome.runtime.sendMessage({ target: 'offscreen', action: 'volume', volume: msg.volume }).catch(() => {});
      });
      break;

    case 'GET_AUDIO_STATE':
      ensureOffscreen().then(() => {
        chrome.runtime.sendMessage({ target: 'offscreen', action: 'ping' }).catch(() => {});
      });
      break;

    case 'AUDIO_STATE':
      // Forward from offscreen back to popup
      chrome.runtime.sendMessage({
        type: 'AUDIO_STATE_UPDATE',
        isPlaying: msg.isPlaying,
        currentSound: msg.currentSound
      }).catch(() => {});
      break;

    case 'TIMER_START':
      startTimerAlarm(msg.totalSeconds);
      break;

    case 'TIMER_PAUSE':
    case 'TIMER_RESET':
      clearTimerAlarm();
      break;


    case 'OPEN_LOFI':
      chrome.tabs.query({ url: '*://www.youtube.com/watch?v=jfKfPfyJRdk*' }, (tabs) => {
        if (tabs.length > 0) {
          chrome.tabs.update(tabs[0].id, { active: true });
        } else {
          chrome.tabs.create({ url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk', active: false });
        }
      });
      break;
  }
  return false;
});

// Offscreen document
let offscreenCreating = null;

async function ensureOffscreen() {
  const existing = await chrome.offscreen.hasDocument();
  if (existing) return;
  if (offscreenCreating) { await offscreenCreating; return; }
  offscreenCreating = chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Background ambient music and white noise for study sessions'
  });
  await offscreenCreating;
  offscreenCreating = null;
}

async function restoreAudioIfNeeded() {
  if (!settings || !settings.audioPlaying || !settings.selectedSound) return;
  if (settings.selectedSound === 'lofi') return; // lofi lives in a tab, never auto-reopen
  await ensureOffscreen();
  // Small delay to let offscreen doc initialise
  setTimeout(() => {
    chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'play',
      sound: settings.selectedSound,
      volume: (settings.volume || 50) / 100
    }).catch(() => {});
  }, 300);
}

// Timer alarm 
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'studymode-timer') return;

  // Mark timer as done in storage
  const data = await chrome.storage.local.get('studymodeSettings');
  const s = data.studymodeSettings;
  if (!s) return;

  // Capture totalSeconds BEFORE resetting timerState
  const completedTotalSeconds = s.timerState?.totalSeconds || 1500;

  s.timerState = { running: false, endTime: null, totalSeconds: completedTotalSeconds };

  // Update stats for pomodoro sessions
  if (s.timerMode === 'pomodoro') {
    s.stats = s.stats || {};
    s.stats.pomodoros = (s.stats.pomodoros || 0) + 1;
    s.stats.minutesToday = (s.stats.minutesToday || 0) + Math.round(completedTotalSeconds / 60);
    s.stats.weekSessions = (s.stats.weekSessions || 0) + 1;
    s.stats.sessionsCompleted = ((s.stats.sessionsCompleted || 0) + 1) % 4;
    // Streak logic: update if first session today
    const today = new Date().toDateString();
    if (s.stats.lastDate !== today) {
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      s.stats.streak = s.stats.lastDate === yesterday ? (s.stats.streak || 0) + 1 : 1;
      s.stats.lastDate = today;
    }
  }

  await chrome.storage.local.set({ studymodeSettings: s });

  // Play completion chime via offscreen audio engine
  ensureOffscreen().then(() => {
    chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'chime'
    }).catch(() => {});
  });

  // Tell popup to refresh if it's open
  chrome.runtime.sendMessage({ type: 'TIMER_DONE' }).catch(() => {});
});

// Timer control messages
async function startTimerAlarm(totalSeconds) {
  await chrome.alarms.clear('studymode-timer');
  chrome.alarms.create('studymode-timer', {
    when: Date.now() + totalSeconds * 1000
  });
}

async function clearTimerAlarm() {
  await chrome.alarms.clear('studymode-timer');
}

// site blocking 
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!settings || !settings.studyModeOn) return;
  if (changeInfo.status !== 'loading') return;
  if (!tab.url) return;

  const url = tab.url.toLowerCase();
  if (url.includes(chrome.runtime.id)) return; // don't redirect our own pages

  const blocked = getBlockedSites();
  for (const site of blocked) {
    if (url.includes(site)) {
      let displayName = site;
      try { displayName = new URL(tab.url).hostname.replace(/^www\./, ''); } catch (e) {}
      chrome.tabs.update(tabId, {
        url: chrome.runtime.getURL('blocked.html') + '?site=' + encodeURIComponent(displayName)
      });
      incrementBlockCount();
      break;
    }
  }
});

function getBlockedSites() {
  if (!settings) return [];
  const sites = [];
  if (settings.blockSocial) sites.push(...SOCIAL_SITES);
  if (settings.blockGaming) sites.push(...GAMING_SITES);
  if (settings.blockAI) sites.push(...AI_SITES);
  if (settings.customSites) sites.push(...settings.customSites);
  return sites;
}

// Ad block rules 
function applyAllRules() {
  if (!settings) return;
  chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: settings.adBlock ? ['ad_block_rules'] : [],
    disableRulesetIds: settings.adBlock ? [] : ['ad_block_rules']
  }).catch(() => {});
}

async function incrementBlockCount() {
  const data = await chrome.storage.local.get('studymodeSettings');
  const s = data.studymodeSettings;
  if (!s) return;
  s.stats = s.stats || {};
  s.stats.blocksToday = (s.stats.blocksToday || 0) + 1;
  await chrome.storage.local.set({ studymodeSettings: s });
}

function getDefaults() {
  return {
    studyModeOn: false,
    blockSocial: true,
    blockYouTube: true,
    blockGaming: false,
    blockAI: false,
    darkMode: true,
    adBlock: true,
    customSites: [],
    timerMinutes: 25,
    timerMode: 'pomodoro',
    volume: 50,
    selectedSound: null,
    audioPlaying: false,
    timerState: { running: false, endTime: null, totalSeconds: 1500 },
    stats: {
      pomodoros: 0, minutesToday: 0, streak: 0,
      lastDate: null, weekSessions: 0, weekStart: null, blocksToday: 0
    }
  };
}
