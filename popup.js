const DEFAULT_SETTINGS = {
    studyModeOn: false,
    blockSocial: true,
    blockYouTube: true,
    blockGaming: false,
    darkMode: true,
    adBlock: true,
    customerSites: []
}

let settings = { ...DEFAULT_SETTINGS};

document.addEventListener('DOMContentLoaded', async() => {
    const stored = await chrome.storage.local.get('studymodeSettings');
    if (stored.studymodeSettings){
        settings = { ...DEFAULT_SETTINGS, ...stored.studymodeSettings};
    }

    initUI();
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

