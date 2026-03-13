// StudyMode Content Script
// Runs on every page at document_start

(function() {
  const DARK_STYLE_ID = 'studymode-dark';
  const YT_STYLE_ID = 'studymode-yt';

  // Native dark: forces the browser's built-in dark rendering on every element.
  // This works by setting color-scheme to "dark" on the root, which tells the
  // browser to apply its own dark defaults (dark scrollbars, dark form controls,
  // dark default backgrounds) without inverting anything. For sites that don't
  // support prefers-color-scheme natively, we also nudge their backgrounds and
  // text colors using CSS variable overrides so they actually go dark.
  const DARK_CSS = `
    :root, html {
      color-scheme: dark !important;
    }

    /* For sites that don't honour color-scheme, force backgrounds + text */
    html, body {
      background-color: #111111 !important;
      color: #e8e6e3 !important;
    }

    /* Nudge common light-background containers */
    *:not(img):not(video):not(canvas):not(iframe):not(svg):not(picture):not([style*="background-image"]) {
      background-color: inherit;
      border-color: rgba(255,255,255,0.08) !important;
    }

    /* Invert only as a last resort for elements that explicitly set white/near-white backgrounds */
    [style*="background:#fff"],
    [style*="background: #fff"],
    [style*="background:#ffffff"],
    [style*="background: #ffffff"],
    [style*="background-color:#fff"],
    [style*="background-color: #fff"],
    [style*="background-color:#ffffff"],
    [style*="background-color: #ffffff"],
    [style*="background-color: white"],
    [style*="background-color:white"],
    [style*="background: white"],
    [style*="background:white"] {
      background-color: #1e1e1e !important;
      color: #e8e6e3 !important;
    }
  `;

  let darkObserver = null;
  let darkEnabled = false;

  function injectDarkStyle() {
    if (document.getElementById(DARK_STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = DARK_STYLE_ID;
    el.textContent = DARK_CSS;
    (document.head || document.documentElement).appendChild(el);

    // Also set color-scheme directly on the html element as an attribute
    // so it takes effect even before CSS is parsed
    document.documentElement.style.setProperty('color-scheme', 'dark', 'important');
  }

  function removeDarkStyle() {
    const el = document.getElementById(DARK_STYLE_ID);
    if (el) el.remove();
    document.documentElement.style.removeProperty('color-scheme');
  }

  function startObserver() {
    if (darkObserver) return;
    darkObserver = new MutationObserver(() => {
      if (darkEnabled && !document.getElementById(DARK_STYLE_ID)) {
        injectDarkStyle();
      }
    });
    darkObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function stopObserver() {
    if (darkObserver) {
      darkObserver.disconnect();
      darkObserver = null;
    }
  }

  function applyDarkMode(enabled) {
    darkEnabled = enabled;
    if (!enabled) {
      stopObserver();
      removeDarkStyle();
      return;
    }

    function go() {
      injectDarkStyle();
      startObserver();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', go, { once: true });
    } else {
      go();
    }
  }

  function applyYouTubeClean(enabled) {
    const isYoutube = window.location.hostname.includes('youtube.com');
    if (!isYoutube) return;
    let el = document.getElementById(YT_STYLE_ID);
    if (enabled) {
      if (!el) {
        el = document.createElement('style');
        el.id = YT_STYLE_ID;
        (document.head || document.documentElement).appendChild(el);
      }
      el.textContent = `
        ytd-reel-shelf-renderer,
        ytd-rich-shelf-renderer[is-shorts],
        a[href*="/shorts"],
        [aria-label*="Shorts"],
        #shorts-container,
        ytd-guide-entry-renderer a[href="/shorts"] { display: none !important; }
        ytd-browse[page-subtype="home"] ytd-rich-grid-renderer,
        #secondary ytd-watch-next-secondary-results-renderer,
        ytd-compact-video-renderer,
        #related { display: none !important; }
        ytd-comments, #comments { display: none !important; }
        .ytp-endscreen-content,
        .ytp-ce-element,
        .ytp-cards-teaser { display: none !important; }
        ytd-notification-topbar-button-renderer { display: none !important; }
        #masthead-ad { display: none !important; }
      `;
    } else {
      if (el) el.remove();
    }
  }

  function loadAndApply() {
    chrome.storage.local.get('studymodeSettings', (data) => {
      const s = data.studymodeSettings;
      if (!s) return;
      applyDarkMode(s.studyModeOn && s.darkMode);
      applyYouTubeClean(s.studyModeOn && s.blockYouTube);
    });
  }

  loadAndApply();

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.studymodeSettings) {
      const s = changes.studymodeSettings.newValue;
      if (!s) return;
      applyDarkMode(s.studyModeOn && s.darkMode);
      applyYouTubeClean(s.studyModeOn && s.blockYouTube);
    }
  });
})();
