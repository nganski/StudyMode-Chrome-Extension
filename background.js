chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if(message.type === 'SETTINGS_UPDATED'){
        console.log('Settings updated:', message.settings);
        
    }
});