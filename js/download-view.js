// ========================================================================
// VidFetch — Download View (v5: enhanced overlay speed + ETA)
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

  /** Download via Worker proxy dengan real progress + speed + ETA */
  async startDownload() {
    const directUrl = this.state.selectedUrl;
    const label     = this.state.selectedLabel || 'video';
    if (!directUrl) return;

    const proxyUrl     = VidFetchConfig.proxyDownloadUrl(directUrl);
    const overlay      = document.getElementById('downloadOverlay');
    const overlayMsg   = document.getElementById('dlOverlayMsg');
    const overlayBar   = document.getElementById('dlOverlayBar');
    const overlayPct   = document.getElementById('dlOverlayPct');
    const overlaySize  = document.getElementById('dlOverlaySize');
    const overlaySpeed = document.getElementById('dlOverlaySpeed');
    const overlayEta   = document.getElementById('dlOverlayEta');
    const overlayDetail= document.getElementById('dlOverlayDetail');
    const overlayCancel= document.getElementById('dlOverlayCancel');

    // Reset overlay
    overlay.classList.add('active');
    overlayBar.style.width = '0%';
    overlayBar.style.background = '#5a6070';
    overlayMsg.textContent   = 'Menghubungi server…';
    overlayDetail.textContent = label;
    overlayPct.textContent   = '';
    overlaySize.textContent  = '';
    overlaySpeed.textContent = '';
    overlayEta.textContent   = '';

    const controller = new AbortController();
    overlayCancel.textContent = 'Batalkan';
    overlayCancel.onclick = () => {
      controller.abort();
      overlay.classList.remove('active');
    };

    // Rolling speed tracking
    const speedWindow = []; // [{ts, bytes}]
    let lastUpdateTs = Date.now();

    function updateStats(received, contentLength) {
      const now = Date.now();

      // Tambah ke window
      speedWindow.push({ ts: now, bytes: received });
      // Buang data > 3 detik lalu
      const cutoff = now - 3000;
      while (speedWindow.length > 1 && speedWindow[0].ts < cutoff) speedWindow.shift();

      // Hitung speed dari rolling window
      let speedBps = 0;
      if (speedWindow.length >= 2) {
        const oldest  = speedWindow[0];
        const newest  = speedWindow[speedWindow.length - 1];
        const elapsed = (newest.ts - oldest.ts) / 1000;
        const bytes   = newest.bytes - oldest.bytes;
        speedBps = elapsed > 0 ? bytes / elapsed : 0;
      }

      // Update setiap 500ms biar gak flicker
      if (now - lastUpdateTs < 500) return;
      lastUpdateTs = now;

      const speedMB = speedBps / 1024 / 1024;
      const recvMB  = received / 1024 / 1024;

      if (contentLength > 0) {
        const totalMB = contentLength / 1024 / 1024;
        const pct     = Math.round((received / contentLength) * 100);
        overlayBar.style.width   = pct + '%';
        overlayPct.textContent   = pct + '%';
        overlaySize.textContent  = `${recvMB.toFixed(1)} MB / ${totalMB.toFixed(1)} MB`;
        overlayMsg.textContent   = 'Mengunduh…';

        if (speedBps > 0) {
          overlaySpeed.textContent = `${speedMB.toFixed(1)} MB/s`;
          const etaSec = (contentLength - received) / speedBps;
          overlayEta.textContent = etaSec > 0 ? `Sisa ~${_fmtEta(etaSec)}` : '';
        }
      } else {
        // Tanpa content-length: tampilkan MB downloaded + speed, ETA gak bisa dihitung
        overlayMsg.textContent  = 'Mengunduh…';
        overlaySize.textContent = `${recvMB.toFixed(1)} MB`;
        overlayPct.textContent  = '';
        if (speedBps > 0) {
          overlaySpeed.textContent = `${speedMB.toFixed(1)} MB/s`;
        }
        overlayEta.textContent = '';
        // Fake progress bar tanpa total
        const fakeP = Math.min(90, (received / (50 * 1024 * 1024)) * 100);
        overlayBar.style.width = fakeP + '%';
      }
    }

    function _fmtEta(sec) {
      if (sec < 60) return `${Math.ceil(sec)}s`;
      const m = Math.floor(sec / 60), s = Math.ceil(sec % 60);
      return `${m}m ${s}s`;
    }

    try {
      const res = await fetch(proxyUrl, { signal: controller.signal });

      // Cek kalau URL expired / IP-bound
      if (res.status === 403 || res.status === 401) {
        let errMsg = 'URL expired. Klik Fetch ulang untuk refresh URL, lalu coba download lagi.';
        try {
          const json = await res.json();
          if (json.error === 'URL_EXPIRED_OR_BOUND') errMsg = json.message;
        } catch {}
        throw new Error(errMsg);
      }

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
      const reader  = res.body.getReader();
      const chunks  = [];
      let received  = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        updateStats(received, contentLength);
      }

      // Build blob → trigger download
      const blob    = new Blob(chunks);
      const blobUrl = URL.createObjectURL(blob);
      const a       = document.createElement('a');
      a.href        = blobUrl;
      const ext     = label.includes('m4a') ? 'm4a' : label.includes('webm') ? 'webm' : 'mp4';
      const safeTitle = (this.state.video?.title || 'video')
        .replace(/[^\w\s\-]/g, '').trim().replace(/\s+/g, '_').slice(0, 60);
      a.download = `${safeTitle}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

      // Success state
      overlayBar.style.width    = '100%';
      overlayBar.style.background = 'var(--done-text)';
      overlayMsg.textContent    = 'Download selesai! ✓';
      overlayPct.textContent    = '100%';
      overlaySpeed.textContent  = '';
      overlayEta.textContent    = '';
      overlayDetail.textContent = a.download;
      setTimeout(() => overlay.classList.remove('active'), 2000);

    } catch (err) {
      if (err.name === 'AbortError') return;
      overlayBar.style.width      = '100%';
      overlayBar.style.background = 'var(--error-text)';
      overlayMsg.textContent      = 'Gagal mengunduh';
      overlaySpeed.textContent    = '';
      overlayEta.textContent      = '';
      overlayDetail.textContent   = err.message;
      overlayCancel.textContent   = 'Tutup';
    }
  },

  _fmtCell(f) {
    const resMatch = (f.label || '').match(/\((\d+p)\)/i);
    const quality  = resMatch ? resMatch[1] : (f.type === 'audio' ? f.ext.toUpperCase() : f.label);
    const sub      = f.type === 'audio' ? 'Audio' : 'MP4';
    return `<button class="format-cell" data-id="${f.formatId}" data-url="${this._attr(f.url)}" data-label="${this._attr(f.label)}">
      <span class="format-cell__q">${this._esc(quality)}</span>
      <span class="format-cell__sub">${this._esc(sub)}</span>
    </button>`;
  },

  _esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; },
  _attr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); },
};

window.DownloadView = DownloadView;
