// StudyMode Content Script
// Runs on every page at document_start

(function() {
  const DARK_STYLE_ID = 'studymode-dark';
  const YT_STYLE_ID = 'studymode-yt';

  function applyDarkMode(enabled) {
    let el = document.getElementById(DARK_STYLE_ID);
    if (enabled) {
      if (!el) {
        el = document.createElement('style');
        el.id = DARK_STYLE_ID;
        (document.head || document.documentElement).appendChild(el);
      }
      // Only force dark on sites that haven't already declared a dark color scheme.
      // We target the :root and body when they have a light background, leaving
      // sites that are already dark untouched.
      el.textContent = `
        @media (prefers-color-scheme: light), (prefers-color-scheme: no-preference) {
          html:not([data-theme="dark"]):not([class*="dark"]):not([class*="night"]) body:not([class*="dark"]):not([class*="night"]) {
            background-color: #1a1a1a !important;
            color: #e0e0e0 !important;
          }
        }

        /* Universal dark override — only applied when StudyMode dark is active.
           We check the page's own background-color and only invert if it's light. */
        .studymode-dark-active {
          background-color: #1a1a1a !important;
          color: #e0e0e0 !important;
        }
      `;

      // Check the page's actual computed background. If it's already dark, do nothing.
      // We do this after a tiny delay to let the page render its own styles first.
      setTimeout(() => {
        const bg = window.getComputedStyle(document.documentElement).backgroundColor;
        const isDark = isColorDark(bg);
        if (!isDark) {
          // Page is light — apply full dark override via invert on html only
          el.textContent = `
            html { filter: invert(1) hue-rotate(180deg) !important; }
            img, video, canvas, iframe, picture,
            [style*="background-image"] { filter: invert(1) hue-rotate(180deg) !important; }
          `;
        } else {
          // Already dark — remove our style entirely, don't touch it
          el.remove();
        }
      }, 150);
    } else {
      if (el) el.remove();
    }
  }

  // Returns true if an rgb(...) color string is perceptually dark
  function isColorDark(color) {
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return false; // transparent / unknown — assume light, apply dark mode
    const [r, g, b] = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
    // Perceived luminance (ITU-R BT.709)
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance < 100; // threshold: dark if luminance < ~40% of 255
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
        /* Shorts */
        ytd-reel-shelf-renderer,
        ytd-rich-shelf-renderer[is-shorts],
        a[href*="/shorts"],
        [aria-label*="Shorts"],
        #shorts-container,
        ytd-guide-entry-renderer a[href="/shorts"] { display: none !important; }

        /* Home feed recommendations */
        ytd-browse[page-subtype="home"] ytd-rich-grid-renderer,
        #secondary ytd-watch-next-secondary-results-renderer,
        ytd-compact-video-renderer,
        #related { display: none !important; }

        /* Comments */
        ytd-comments, #comments { display: none !important; }

        /* End cards & autoplay cards */
        .ytp-endscreen-content,
        .ytp-ce-element,
        .ytp-cards-teaser { display: none !important; }

        /* Notification bell */
        ytd-notification-topbar-button-renderer { display: none !important; }

        /* Masthead ad */
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
      const active = s.studyModeOn;
      applyDarkMode(active && s.darkMode);
      applyYouTubeClean(active && s.blockYouTube);
    });
  }

  // Apply immediately and on DOM ready
  loadAndApply();
  document.addEventListener('DOMContentLoaded', loadAndApply);

  // Listen for settings changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.studymodeSettings) {
      const s = changes.studymodeSettings.newValue;
      if (!s) return;
      const active = s.studyModeOn;
      applyDarkMode(active && s.darkMode);
      applyYouTubeClean(active && s.blockYouTube);
    }
  });
})();
