// ========================================================================
// VidFetch — App Init
// ========================================================================
document.addEventListener('DOMContentLoaded', () => {
  HistoryView.renderList();

  const fetchBtn  = document.getElementById('fetchBtn');
  const clearBtn  = document.getElementById('clearBtn');
  const input     = document.getElementById('ytUrl');
  const msg       = document.getElementById('urlMsg');
  const preview   = document.getElementById('previewArea');

  // Tombol X hanya muncul kalau input ada isi
  clearBtn.style.display = 'none';
  input.addEventListener('input', () => {
    clearBtn.style.display = input.value.length > 0 ? '' : 'none';
  });

  // Fetch on button click
  fetchBtn.addEventListener('click', () => doFetch());

  // Fetch on Enter
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doFetch();
  });

  // Clear button
  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    msg.textContent = '';
    msg.className = 'url-card__msg';
    preview.innerHTML = '';
  });

  // Paste URL (topbar button)
  document.getElementById('pasteBtn').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        input.value = text.trim();
        clearBtn.style.display = input.value.length > 0 ? '' : 'none';
        input.focus();
      }
    } catch {
      input.focus();
    }
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

  // ── Core fetch logic ──────────────────────────────────────────────────
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

      // Simpan URL asli yang user ketik — ini yang di-copy di history
      video.inputUrl = raw;

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
