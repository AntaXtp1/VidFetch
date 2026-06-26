// ========================================================================
// VidFetch — App Init
// ========================================================================

// PWA install prompt (captured before user gesture needed)
let _pwaInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _pwaInstallPrompt = e;
  // Show install button in sidebar
  const wrap = document.getElementById('installWrap');
  if (wrap) wrap.style.display = '';
  // Show PWA hint in splash
  const hint = document.getElementById('splashPwaHint');
  if (hint) hint.style.display = '';
});

document.addEventListener('DOMContentLoaded', () => {

  // ── Service Worker ───────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // ── Splash Screen ────────────────────────────────────────────────────
  const splash      = document.getElementById('splash');
  const splashSkip  = document.getElementById('splashSkip');
  const timerBar    = document.getElementById('splashTimerBar');
  const splashPwa   = document.getElementById('splashPwaHint');

  // Hide PWA hint by default — shown only if installable
  if (splashPwa) splashPwa.style.display = 'none';

  function closeSplash() {
    splash.classList.add('hidden');
    setTimeout(() => splash.remove(), 400);
  }

  // Start countdown bar after a short delay (so transition fires)
  setTimeout(() => {
    if (timerBar) timerBar.classList.add('running');
  }, 80);

  // Auto-close after 3s
  const splashTimer = setTimeout(closeSplash, 3000);

  // Skip button
  splashSkip.addEventListener('click', () => {
    clearTimeout(splashTimer);
    closeSplash();
  });

  // ── PWA Install Button (sidebar) ─────────────────────────────────────
  const installBtn  = document.getElementById('installBtn');
  const installWrap = document.getElementById('installWrap');
  if (installWrap) installWrap.style.display = 'none'; // hidden until prompt ready

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!_pwaInstallPrompt) return;
      _pwaInstallPrompt.prompt();
      const { outcome } = await _pwaInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        installWrap.style.display = 'none';
        _pwaInstallPrompt = null;
      }
    });
  }

  // ── Main App ─────────────────────────────────────────────────────────
  HistoryView.renderList();

  const fetchBtn = document.getElementById('fetchBtn');
  const clearBtn = document.getElementById('clearBtn');
  const input    = document.getElementById('ytUrl');
  const msg      = document.getElementById('urlMsg');
  const preview  = document.getElementById('previewArea');

  // Tombol X hanya muncul kalau input ada isi
  clearBtn.style.display = 'none';
  input.addEventListener('input', () => {
    clearBtn.style.display = input.value.length > 0 ? '' : 'none';
  });

  fetchBtn.addEventListener('click', () => doFetch());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doFetch(); });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    msg.textContent = '';
    msg.className = 'url-card__msg';
    preview.innerHTML = '';
  });

  // Paste URL (topbar)
  document.getElementById('pasteBtn').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        input.value = text.trim();
        clearBtn.style.display = input.value.length > 0 ? '' : 'none';
        input.focus();
      }
    } catch { input.focus(); }
  });

  // Clear history
  document.getElementById('clearHistoryBtn').addEventListener('click', () => {
    if (confirm('Hapus semua history?')) HistoryView.clear();
  });

  // Mobile sidebar
  const hamburger = document.getElementById('hamburger');
  const sidebar   = document.getElementById('sidebar');
  hamburger.addEventListener('click', () => sidebar.classList.toggle('sidebar--open'));
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 760 &&
        sidebar.classList.contains('sidebar--open') &&
        !sidebar.contains(e.target)) {
      sidebar.classList.remove('sidebar--open');
    }
  });

  // ── Core fetch logic ─────────────────────────────────────────────────
  async function doFetch() {
    const raw = input.value.trim();
    if (!raw) { showMsg('Isi link YouTube dulu.', 'error'); return; }
    if (!VidFetchConfig.youtubeUrlPattern.test(raw)) {
      showMsg('Link tidak valid. Hanya YouTube (youtube.com / youtu.be).', 'error');
      return;
    }

    setLoading(true);
    showMsg('');
    preview.innerHTML = `<div class="preview-loading"><i class="ti ti-loader ti-spin"></i> Mengambil metadata…</div>`;

    try {
      const video = await VidFetchAPI.fetchMetadata(raw);
      video.inputUrl = raw; // simpan URL asli untuk history copy link
      DownloadView.renderPreview(video);
      showMsg('');
    } catch (err) {
      preview.innerHTML = `
        <div class="card preview-error">
          <span class="preview-error__icon"><i class="ti ti-alert-triangle"></i></span>
          <span class="preview-error__text">${err.message}</span>
        </div>`;
    } finally {
      setLoading(false);
    }
  }

  function showMsg(text, type) {
    msg.textContent = text || '';
    msg.className = 'url-card__msg' + (type ? ` url-card__msg--${type}` : '');
  }

  function setLoading(on) {
    fetchBtn.disabled = on;
    input.disabled    = on;
    fetchBtn.innerHTML = on
      ? '<i class="ti ti-loader ti-spin"></i>'
      : '<i class="ti ti-search"></i> Fetch';
  }
});
