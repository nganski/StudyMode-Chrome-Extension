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
    }
});