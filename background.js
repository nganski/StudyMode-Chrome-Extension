// background service worker
// does the site blocking , dark mode

const SOCIAL_SITES = ['instagram.com', 'tiktok.com', 'twitter.com', 'x.com', 'reddit.com', 'facebook.com', 'snapchat.com', 'pinterest.com'];
const GAMING_SITES = ['twitch.tv', 'netflix.com', 'hulu.com', 'discord.com'];

let settings = null;

// startup

// messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type){
        case 'SETTINGS_UPDATED':
            settings = msg.settings;
            applyAllRules();
            break;

        case 'APPLY_RULES':
            settings = msg.settings;
            applyAllRules();
            break;

        case 'TIMER_START':
            startTimerAlarm(msg.totalSeconds);
            break;

        case 'TIMER_PAUSE':
        case 'TIMER_RESET':
            clearTimerAlarm();
            break;
    }

    return true;
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

// Timer alarm 
// The alarm fires when the timer reaches zero, even if the popup is closed.
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

  // Fire notification
  chrome.notifications.create('timer-done', {
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: '⏰ StudyMode — Session Complete!',
    message: s.timerMode === 'pomodoro'
      ? `Great work! Pomodoro #${s.stats.pomodoros} done. Take a short break.`
      : 'Break over — time to get back to studying!',
    priority: 2
  });

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

// ── Timer control messages ────────────────────────────────
async function startTimerAlarm(totalSeconds) {
  await chrome.alarms.clear('studymode-timer');
  chrome.alarms.create('studymode-timer', {
    when: Date.now() + totalSeconds * 1000
  });
}

async function clearTimerAlarm() {
  await chrome.alarms.clear('studymode-timer');
}
