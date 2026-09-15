// Initialize icons
lucide.createIcons();

// Load Portal Cards from Firestore
document.addEventListener('DOMContentLoaded', () => {
    const portalGrid = document.getElementById('portal-grid');
    if (!portalGrid) return;

    // Default configuration mapping for color themes to tailwind classes
    // Some cards use -700, others use -800, we map them as best effort
    const themeMap = {
        'cyan': { text: 'text-cyan-400', grad: 'from-cyan-500 to-cyan-700' },
        'emerald': { text: 'text-emerald-400', grad: 'from-emerald-500 to-emerald-800' },
        'yellow': { text: 'text-yellow-400', grad: 'from-yellow-400 to-yellow-600' },
        'fuchsia': { text: 'text-fuchsia-400', grad: 'from-fuchsia-500 to-purple-700' },
        'rose': { text: 'text-rose-500', grad: 'from-rose-500 to-rose-800' },
        'orange': { text: 'text-orange-500', grad: 'from-orange-500 to-orange-700' },
        'blue': { text: 'text-blue-500', grad: 'from-blue-500 to-blue-800' },
        'indigo': { text: 'text-indigo-400', grad: 'from-indigo-500 to-indigo-800' }
    };

    // Pre-calculate possible classes to remove to avoid expensive Array.from().filter() in loops
    const textClassesToRemove = ['text-slate-500', ...Object.values(themeMap).map(t => t.text)];
    const gradClassesToRemove = ['bg-slate-500', 'bg-gradient-to-br', ...Object.values(themeMap).flatMap(t => t.grad.split(' '))];

    const defaultIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white icon-glow"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
    const defaultPortalCards = [
        { position: 1, title: 'えひめ連携企業紹介', url: '/renkei/' },
        { position: 2, title: '松山ミュージアム<br>ストリート', url: '/museum-street/' },
        { position: 3, title: '愛媛大学<br>ミュージアム', url: '#' },
        { position: 4, title: 'イマジン・デッキ', url: '#' },
        { position: 5, title: '学生生活<br>サポート', url: '#' },
        { position: 6, title: '大学生協<br>サイト', url: '#' },
        { position: 7, title: '修学支援<br>システム', url: '#' },
        { position: 8, title: '問い合わせ先', url: '#' }
    ];

    function resetSlot(slotElement) {
        slotElement.classList.add('invisible');
        slotElement.classList.remove('visible');
        slotElement.classList.add('default-text-color');

        const iconContainer = slotElement.querySelector('.plasma-sphere');
        if (iconContainer) {
            iconContainer.classList.remove(...textClassesToRemove);
            iconContainer.classList.add('text-slate-500');

            iconContainer.classList.remove(...gradClassesToRemove);
            iconContainer.classList.add('bg-slate-500');
            iconContainer.innerHTML = defaultIconSvg;
        }

        const spanElement = slotElement.querySelector('span');
        if (spanElement) {
            spanElement.classList.remove('text-slate-500');
            spanElement.classList.add('text-slate-200');
            spanElement.innerHTML = '';
        }

        slotElement.href = '#';
    }

    function resetAllSlots() {
        for (let slot = 1; slot <= 8; slot++) {
            const slotElement = portalGrid.querySelector(`[data-slot="${slot}"]`);
            if (slotElement) {
                resetSlot(slotElement);
            }
        }
    }

    function renderDefaultPortalCards() {
        resetAllSlots();
        defaultPortalCards.forEach((defaultCard) => {
            const slotElement = portalGrid.querySelector(`[data-slot="${defaultCard.position}"]`);
            if (!slotElement) return;

            slotElement.classList.remove('invisible');
            slotElement.classList.add('visible');
            slotElement.href = defaultCard.url;

            const spanElement = slotElement.querySelector('span');
            if (spanElement) {
                spanElement.innerHTML = defaultCard.title;
            }
        });

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    renderDefaultPortalCards();

    if (typeof firebase === 'undefined') return;
    const db = firebase.firestore();

    // Try to get data from cache first for fast loading
    db.collection("portalCards").get({ source: 'cache' }).then((querySnapshot) => {
        if (!querySnapshot.empty) {
            renderPortalCards(querySnapshot);
        }
    }).catch((error) => {
        console.log("Failed to load from cache:", error);
    });

    // Then try to get fresh data from server
    db.collection("portalCards").get({ source: 'server' }).then((querySnapshot) => {
        if (!querySnapshot.empty) {
            renderPortalCards(querySnapshot);
        } else {
            renderDefaultPortalCards();
        }
    }).catch((error) => {
        console.log("Failed to load from server:", error);
    });

    function renderPortalCards(querySnapshot) {
        resetAllSlots();

        querySnapshot.forEach((doc) => {
            const cardData = doc.data();
            const docId = doc.id;

            // Determine position. Backward compatibility: if no position is set, try to infer from ID (e.g. "card1" -> 1)
            // Note: position === null means it was explicitly set to hidden, so only fallback if undefined.
            let position = cardData.position;
            if (position === undefined) {
                const match = docId.match(/^card(\d+)$/);
                if (match) {
                    position = parseInt(match[1], 10);
                }
            }

            if (!position || position < 1 || position > 8) {
                return; // Do not render if position is not between 1 and 8
            }

            const existingLink = portalGrid.querySelector(`[data-slot="${position}"]`);

            if (existingLink) {
                // Make the slot visible since it has data
                existingLink.classList.remove('invisible');
                existingLink.classList.add('visible');

                // Update link
                if (cardData.url) {
                    existingLink.href = cardData.url;
                }

                // Update title
                if (cardData.title) {
                    const spanElement = existingLink.querySelector('span');
                    if (spanElement) {
                        // The original HTML has <br> tags in some titles for wrapping,
                        // If firestore doesn't have it, we just set the text.
                        // Ideally firestore title doesn't break UI layout.
                        spanElement.innerHTML = cardData.title;
                    }
                }

                // Update icon
                const iconContainer = existingLink.querySelector('.plasma-sphere');
                if (iconContainer && cardData.svgCode) {
                    iconContainer.innerHTML = cardData.svgCode;

                    // Add 'text-white icon-glow' to the svg if not present to match styling
                    const svgElement = iconContainer.querySelector('svg');
                    if (svgElement) {
                        svgElement.classList.add('text-white', 'icon-glow');
                    }
                }

                // Update theme color
                if (cardData.colorTheme && themeMap[cardData.colorTheme]) {
                    const theme = themeMap[cardData.colorTheme];

                    // Remove default-text-color to show data is loaded
                    existingLink.classList.remove('default-text-color');

                    // Apply theme text color to the plasma sphere to ensure currentColor glow works properly
                    if (iconContainer) {
                        iconContainer.classList.remove(...textClassesToRemove);
                        iconContainer.classList.add(theme.text);
                    }

                    // Ensure title text remains white/slate-200
                    const spanElement = existingLink.querySelector('span');
                    if (spanElement) {
                        spanElement.classList.remove('text-slate-500'); // If there were any fallback
                        spanElement.classList.add('text-slate-200'); // Explicitly set to light color
                    }

                    // Update the gradient on the .plasma-sphere
                    if (iconContainer) {
                        // Remove existing gradients and backgrounds
                        iconContainer.classList.remove(...gradClassesToRemove);

                        // Add new gradients
                        iconContainer.classList.add('bg-gradient-to-br');
                        theme.grad.split(' ').forEach(cls => iconContainer.classList.add(cls));
                    }
                }
            }
        });

        // Re-initialize any lucide icons that might have been loaded
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
});

/**
 * Log the current orientation to the console for debugging
 */
const checkOrientation = () => {
  const isLandscape = window.matchMedia("(orientation: landscape)").matches;
  console.log(`[DEBUG] Current Orientation: ${isLandscape ? "Landscape" : "Portrait"} (Viewport: ${window.innerWidth}x${window.innerHeight})`);
};

// Initial check and listen for resize
checkOrientation();
window.addEventListener("resize", checkOrientation);

// Service Worker Registration
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then((reg) => console.log("Service worker registered.", reg))
      .catch((err) => console.log("Service worker registration failed: ", err));
  });
}

// Long Press for Admin Access
const footerTrigger = document.getElementById('footer-trigger');
if (footerTrigger) {
  let longPressTimer;
  const pressDuration = 2000; // 2 seconds

  const startPress = () => {
    longPressTimer = setTimeout(() => {
      window.location.href = '/admin/';
    }, pressDuration);
  };

  const cancelPress = () => {
    clearTimeout(longPressTimer);
  };

  // Mouse events
  footerTrigger.addEventListener('mousedown', startPress);
  footerTrigger.addEventListener('mouseup', cancelPress);
  footerTrigger.addEventListener('mouseleave', cancelPress);

  // Touch events
  footerTrigger.addEventListener('touchstart', (e) => {
    // Prevent default context menu on mobiles
    // e.preventDefault(); 
    startPress();
  });
  footerTrigger.addEventListener('touchend', cancelPress);
  footerTrigger.addEventListener('touchcancel', cancelPress);
}


// --- PWA Install Button Logic ---
function initPwaInstallButton() {
  const installBtn = document.getElementById('pwa-install-button');
  if (!installBtn) return;

  let deferredInstallPrompt = null;

  function isStandaloneMode() {
    return ('standalone' in window.navigator && window.navigator.standalone) ||
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches;
  }

  // If already running as PWA, keep hidden
  if (isStandaloneMode()) {
    installBtn.hidden = true;
    return;
  }

  // Listen for the beforeinstallprompt event
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredInstallPrompt = e;

    // Only show the install button if not already in standalone mode
    if (!isStandaloneMode()) {
      installBtn.hidden = false;
    }
  });

  // Handle click on the install button
  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;

    // Show the install prompt
    deferredInstallPrompt.prompt();

    try {
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredInstallPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
    } catch (err) {
      console.log("Install prompt error:", err);
    }

    // We've used the prompt, and can't use it again, discard it
    deferredInstallPrompt = null;
    // Hide the button
    installBtn.hidden = true;
  });

  // Listen for the appinstalled event
  window.addEventListener('appinstalled', () => {
    // Hide the button after successful installation
    installBtn.hidden = true;
    deferredInstallPrompt = null;
    console.log('PWA was installed');
  });
}

document.addEventListener('DOMContentLoaded', initPwaInstallButton);


// --- iOS PWA Install Prompt Logic ---
function initIosPwaPrompt() {
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function isStandaloneMode() {
    return ('standalone' in window.navigator && window.navigator.standalone) ||
      window.matchMedia('(display-mode: standalone)').matches;
  }

  function trackIosInstallPromptEvent(eventName, payload = {}) {
    // Placeholder for future gtag integration
    // console.log(`[Analytics Placeholder] Event: ${eventName}`, payload);
    if (typeof gtag === 'function') {
      gtag('event', eventName, payload);
    }
  }

  function updateVisitCount() {
    // Increment only once per session
    if (!sessionStorage.getItem('iosPwaSessionVisited')) {
      const rawCount = localStorage.getItem('iosInstallPromptVisitCount');
      const count = rawCount ? Number(rawCount) : 0;
      const nextCount = count + 1;
      localStorage.setItem('iosInstallPromptVisitCount', String(nextCount));
      sessionStorage.setItem('iosPwaSessionVisited', 'true');
      return nextCount;
    }
    return Number(localStorage.getItem('iosInstallPromptVisitCount') || 1);
  }

  function shouldShowPrompt() {
    if (!isIOS()) return false;
    if (isStandaloneMode()) {
      trackIosInstallPromptEvent('ios_install_prompt_standalone_detected');
      return false;
    }

    const dontShowUntil = Number(localStorage.getItem('iosInstallPromptDontShowUntil') || 0);
    if (Date.now() < dontShowUntil) return false;

    const visitCount = updateVisitCount();
    if (visitCount < 2) return false;

    return true;
  }

  if (shouldShowPrompt()) {
    // Delay prompt by 3 seconds
    setTimeout(() => {
      // Double check standalone mode just in case
      if (isStandaloneMode()) return;

      const promptHtml = `
        <div id="ios-pwa-prompt" class="ios-pwa-prompt" role="dialog" aria-label="ホーム画面追加案内">
            <div class="ios-pwa-prompt-header">
                <h2 class="ios-pwa-prompt-title">ホーム画面に追加してすばやく開く</h2>
                <button id="ios-pwa-prompt-close" class="ios-pwa-prompt-close" aria-label="閉じる">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
            </div>
            <p class="ios-pwa-prompt-body">
                Safari の共有メニュー
                <span class="ios-pwa-prompt-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/></svg>
                </span>
                から「ホーム画面に追加」を選択してください。
            </p>
            <div class="ios-pwa-prompt-footer">
                <input type="checkbox" id="ios-pwa-prompt-checkbox" class="ios-pwa-prompt-checkbox">
                <label for="ios-pwa-prompt-checkbox">このお知らせを1ヶ月間表示しない</label>
            </div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', promptHtml);
      const promptEl = document.getElementById('ios-pwa-prompt');

      // Trigger slide up
      // requestAnimationFrame is used to ensure the element is in the DOM before applying the class
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          promptEl.classList.add('show');
        });
      });

      trackIosInstallPromptEvent('ios_install_prompt_impression', {
        page_path: window.location.pathname,
        visit_count: Number(localStorage.getItem('iosInstallPromptVisitCount') || 1)
      });

      document.getElementById('ios-pwa-prompt-close').addEventListener('click', () => {
        promptEl.classList.remove('show');

        const isChecked = document.getElementById('ios-pwa-prompt-checkbox').checked;
        const cooldownDays = isChecked ? 30 : 3;
        const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
        localStorage.setItem('iosInstallPromptDontShowUntil', String(Date.now() + cooldownMs));

        trackIosInstallPromptEvent('ios_install_prompt_close', {
          dont_show_checked: isChecked,
          cooldown_days: cooldownDays
        });

        // Wait for transition before removing
        setTimeout(() => {
          promptEl.remove();
        }, 500);
      });

    }, 3000);
  } else {
    // Even if not showing, we should update visit count in background
    updateVisitCount();
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initIosPwaPrompt);
