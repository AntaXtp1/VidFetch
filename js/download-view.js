// ========================================================================
// VidFetch — Download View (v4: Worker proxy + real progress bar)
// ========================================================================
const DownloadView = {
  state: { video: null, selectedUrl: null, selectedLabel: null },

  targetResolutions: ['1080p', '720p', '480p', '360p'],

  renderPreview(video) {
    this.state = { video, selectedUrl: null, selectedLabel: null };
    const root = document.getElementById('previewArea');
    if (!root) return;

    // Filter: MP4 target resolutions only
    const mp4Videos = video.formats.filter((f) => f.type === 'video' && f.ext === 'mp4');
    const filteredVideos = [];
    for (const target of this.targetResolutions) {
      const match = mp4Videos.find((f) => f.label && f.label.includes(target));
      if (match) filteredVideos.push(match);
    }

    // Best m4a audio
    const bestAudio = video.formats
      .filter((f) => f.type === 'audio' && f.ext === 'm4a')
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

    const allFormats = bestAudio ? [...filteredVideos, bestAudio] : filteredVideos;

    // Default: 720p or first
    const defaultFmt =
      filteredVideos.find((f) => f.label.includes('720p')) ||
      filteredVideos[0] ||
      bestAudio;
    if (defaultFmt) {
      this.state.selectedUrl = defaultFmt.url;
      this.state.selectedLabel = defaultFmt.label;
    }

    root.innerHTML = `
      <div class="card preview-card">
        <div class="preview-card__head">
          <div class="preview-card__thumb" id="prevThumb">
            <i class="ti ti-player-play"></i>
          </div>
          <div class="preview-card__meta">
            <div class="preview-card__title">${this._esc(video.title)}</div>
            <div class="preview-card__detail">
              <span><i class="ti ti-clock"></i> ${video.durationLabel}</span>
              ${video.author ? `<span><i class="ti ti-user"></i> ${this._esc(video.author)}</span>` : ''}
              <span><i class="ti ti-brand-youtube"></i> YouTube</span>
            </div>
          </div>
        </div>

        <div class="preview-card__body">
          <span class="section-label">PILIH FORMAT</span>
          <div class="format-grid" id="formatGrid">
            ${allFormats.map((f) => this._fmtCell(f)).join('')}
          </div>
        </div>

        <div class="preview-card__actions">
          <button class="btn btn--download" id="dlBtn">
            <i class="ti ti-download"></i>
            <span>Download</span>
          </button>
        </div>
      </div>`;

    // Lazy-load thumbnail
    if (video.thumbnail) {
      const img = new Image();
      img.onload = () => {
        const t = document.getElementById('prevThumb');
        if (t) { t.style.backgroundImage = `url("${video.thumbnail}")`; t.classList.add('preview-card__thumb--loaded'); }
      };
      img.src = video.thumbnail;
    }

    // Format selection
    document.querySelectorAll('.format-cell').forEach((cell) => {
      cell.addEventListener('click', () => {
        document.querySelectorAll('.format-cell').forEach((c) => c.classList.remove('selected'));
        cell.classList.add('selected');
        this.state.selectedUrl = cell.dataset.url;
        this.state.selectedLabel = cell.dataset.label;
      });
    });

    // Mark default
    if (defaultFmt) {
      const sel = document.querySelector(`.format-cell[data-id="${defaultFmt.formatId}"]`);
      if (sel) sel.classList.add('selected');
    }

    document.getElementById('dlBtn').addEventListener('click', () => this.startDownload());

    HistoryView.addItem(video);
  },

  /** Download via Worker proxy — real fetch+blob+progress */
  async startDownload() {
    const directUrl = this.state.selectedUrl;
    const label = this.state.selectedLabel || 'video';
    if (!directUrl) return;

    // Build proxy URL through our Worker
    const proxyUrl = VidFetchConfig.proxyDownloadUrl(directUrl);

    const overlay = document.getElementById('downloadOverlay');
    const overlayMsg = document.getElementById('dlOverlayMsg');
    const overlayBar = document.getElementById('dlOverlayBar');
    const overlayDetail = document.getElementById('dlOverlayDetail');
    const overlayCancel = document.getElementById('dlOverlayCancel');

    overlay.classList.add('active');
    overlayMsg.textContent = 'Menghubungi server…';
    overlayDetail.textContent = label;
    overlayBar.style.width = '0%';
    overlayBar.style.background = '#5a6070';

    let controller = new AbortController();
    overlayCancel.onclick = () => {
      controller.abort();
      overlay.classList.remove('active');
    };

    try {
      const res = await fetch(proxyUrl, {
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
      const reader = res.body.getReader();
      const chunks = [];
      let received = 0;

      overlayMsg.textContent = 'Mengunduh…';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;

        if (contentLength > 0) {
          const pct = Math.round((received / contentLength) * 100);
          overlayBar.style.width = pct + '%';
          overlayMsg.textContent = `Mengunduh… ${pct}%`;
          overlayDetail.textContent = `${(received / 1024 / 1024).toFixed(1)} / ${(contentLength / 1024 / 1024).toFixed(1)} MB`;
        } else {
          // No content-length, just show MB downloaded
          const mb = (received / 1024 / 1024).toFixed(1);
          overlayMsg.textContent = `Mengunduh… ${mb} MB`;
          // Animate bar without knowing total
          const fakeP = Math.min(95, (received / (5 * 1024 * 1024)) * 100);
          overlayBar.style.width = fakeP + '%';
        }
      }

      // Build blob → trigger save
      const blob = new Blob(chunks);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      // Determine extension from label
      const ext = label.includes('m4a') ? 'm4a' : label.includes('webm') ? 'webm' : 'mp4';
      const safeTitle = (this.state.video?.title || 'video')
        .replace(/[^\w\s\-]/g, '').trim().replace(/\s+/g, '_').slice(0, 60);
      a.download = `${safeTitle}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

      // Success
      overlayBar.style.width = '100%';
      overlayBar.style.background = 'var(--done-text)';
      overlayMsg.textContent = 'Download selesai! ✓';
      overlayDetail.textContent = a.download;
      setTimeout(() => overlay.classList.remove('active'), 2000);

    } catch (err) {
      if (err.name === 'AbortError') return;
      // Show error in overlay
      overlayBar.style.width = '100%';
      overlayBar.style.background = 'var(--error-text)';
      overlayMsg.textContent = 'Gagal mengunduh';
      overlayDetail.textContent = err.message + ' — Coba format lain atau coba lagi.';
      overlayCancel.textContent = 'Tutup';
    }
  },

  _fmtCell(f) {
    const resMatch = (f.label || '').match(/\((\d+p)\)/i);
    const quality = resMatch ? resMatch[1] : (f.type === 'audio' ? f.ext.toUpperCase() : f.label);
    const sub = f.type === 'audio' ? 'Audio' : 'MP4';
    return `<button class="format-cell" data-id="${f.formatId}" data-url="${this._attr(f.url)}" data-label="${this._attr(f.label)}">
      <span class="format-cell__q">${this._esc(quality)}</span>
      <span class="format-cell__sub">${this._esc(sub)}</span>
    </button>`;
  },

  _esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; },
  _attr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); },
};

window.DownloadView = DownloadView;
