
document.addEventListener('DOMContentLoaded', () => {
// Try query param first, fall back to referrer hostname
const params = new URLSearchParams(window.location.search);
let site = params.get('site');
if (!site && document.referrer) {
    try { site = new URL(document.referrer).hostname.replace(/^www\./, ''); } catch (e) {}
}
site = site || 'this site';

const siteEl = document.getElementById('siteName');
if (siteEl) siteEl.textContent = site;

// Random motivational quote
const quotes = [
    { text: "The secret of getting ahead is getting started.", author: "MARK TWAIN" },
    { text: "It always seems impossible until it's done.", author: "NELSON MANDELA" },
    { text: "Don't watch the clock; do what it does. Keep going.", author: "SAM LEVENSON" },
    { text: "Success is the sum of small efforts repeated day in and day out.", author: "ROBERT COLLIER" },
    { text: "You don't have to be great to start, but you have to start to be great.", author: "ZIG ZIGLAR" },
    { text: "The future depends on what you do today.", author: "MAHATMA GANDHI" },
    { text: "Concentrate all your thoughts upon the work at hand.", author: "ALEXANDER GRAHAM BELL" },
    { text: "Push yourself, because no one else is going to do it for you.", author: "UNKNOWN" },
    { text: "Energy and persistence conquer all things.", author: "BENJAMIN FRANKLIN" },
    { text: "Believe you can and you're halfway there.", author: "THEODORE ROOSEVELT" },
    { text: "Nah, I'd win.", author: "You"},
    { text: "Nah, I'd win.", author: "You"}
];

const q = quotes[Math.floor(Math.random() * quotes.length)];
const quoteBox = document.getElementById('quoteBox');
if (quoteBox) {
    quoteBox.textContent = `"${q.text}" `;
    const strong = document.createElement('strong');
    strong.textContent = `— ${q.author}`;
    quoteBox.appendChild(strong);
}

// Timer badge
chrome.storage.local.get('studymodeSettings', (data) => {
    const s = data?.studymodeSettings;
    const badge = document.getElementById('timerBadge');
    if (badge && s && s.timerMinutes) {
    badge.textContent = 'Keep going — your study session is active';
    }
});
});


