// ========================================================================
// VidFetch — History View (v2: single copy link button, no format pills)
// ========================================================================
const HistoryView = {
  /** Get all history entries (after 7-day cleanup) */
  getAll() {
    const raw = localStorage.getItem(VidFetchConfig.historyKey);
    let list = [];
    try { list = JSON.parse(raw); } catch { list = []; }
    if (!Array.isArray(list)) list = [];

    // Auto-cleanup: remove entries older than 7 days
    const now = Date.now();
    const cleaned = list.filter((e) => now - e.ts < VidFetchConfig.historyMaxAgeMs);
    if (cleaned.length !== list.length) {
      localStorage.setItem(VidFetchConfig.historyKey, JSON.stringify(cleaned));
    }
    return cleaned;
  },

  /** Add a new entry (deduplicate by title) */
  addItem(video) {
    if (!video || !video.title) return;
    const list = this.getAll();

    // Remove duplicate by title
    const filtered = list.filter((e) => e.title !== video.title);

    filtered.unshift({
      title: video.title,
      thumbnail: video.thumbnail,
      author: video.author,
      durationLabel: video.durationLabel,
      // Simpan YouTube URL asli yang user paste — bukan googlevideo URL
      youtubeUrl: video.inputUrl || '',
      ts: Date.now(),
    });

    // Keep max 50 entries
    const trimmed = filtered.slice(0, 50);
    localStorage.setItem(VidFetchConfig.historyKey, JSON.stringify(trimmed));
    this.renderList();
  },

  /** Render history list */
  renderList() {
    const container = document.getElementById('historyList');
    if (!container) return;
    const entries = this.getAll();

    if (entries.length === 0) {
      container.innerHTML = '<div class="history__empty">Belum ada history download.</div>';
      return;
    }

    container.innerHTML = entries.map((e) => this._itemHTML(e)).join('');

    // Lazy-load thumbnails
    entries.forEach((e) => {
      if (!e.thumbnail) return;
      const thumbId = 'hthumb_' + e.title.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
      const el = document.getElementById(thumbId);
      if (!el) return;
      const img = new Image();
      img.onload = () => {
        el.style.backgroundImage = `url("${e.thumbnail}")`;
        el.classList.add('history__item-thumb--loaded');
      };
      img.src = e.thumbnail;
    });

    // Wire copy buttons
    container.querySelectorAll('.btn--copy').forEach((btn) => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        navigator.clipboard.writeText(url).then(() => {
          btn.classList.add('copied');
          btn.innerHTML = '<i class="ti ti-check"></i> Tersalin';
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = '<i class="ti ti-clipboard"></i> Copy Link';
          }, 1500);
        }).catch(() => {
          // Fallback
          const ta = document.createElement('textarea');
          ta.value = url;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          btn.classList.add('copied');
          btn.innerHTML = '<i class="ti ti-check"></i> Tersalin';
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = '<i class="ti ti-clipboard"></i> Copy Link';
          }, 1500);
        });
      });
    });
  },

  /** Clear all history */
  clear() {
    localStorage.removeItem(VidFetchConfig.historyKey);
    this.renderList();
  },

  /** Single history item HTML */
  _itemHTML(e) {
    const thumbId = 'hthumb_' + e.title.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
    const timeAgo = this._timeAgo(e.ts);
    // Copy YouTube URL yang user tempel — bukan link download
    const copyUrl = e.youtubeUrl || e.downloadUrl || '';

    return `<div class="history__item">
      <div class="history__item-thumb" id="${thumbId}">
        <i class="ti ti-player-play"></i>
      </div>
      <div class="history__item-info">
        <div class="history__item-title">${this._esc(e.title)}</div>
        <div class="history__item-meta">
          <span><i class="ti ti-clock"></i> ${this._esc(e.durationLabel || '--:--')}</span>
          ${e.author ? `<span><i class="ti ti-user"></i> ${this._esc(e.author)}</span>` : ''}
          <span>${timeAgo}</span>
        </div>
      </div>
      <div class="history__item-actions">
        <button class="btn--copy" data-url="${this._attr(copyUrl)}">
          <i class="ti ti-clipboard"></i> Copy Link
        </button>
      </div>
    </div>`;
  },

  /** Time ago string */
  _timeAgo(ts) {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'Baru saja';
    if (min < 60) return `${min}m lalu`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}j lalu`;
    const day = Math.floor(hr / 24);
    return `${day}h lalu`;
  },

  _esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  },
  _attr(s) {
    return String(s == null ? '' : s).replace(/"/g, '&quot;');
  },
};

window.HistoryView = HistoryView;
