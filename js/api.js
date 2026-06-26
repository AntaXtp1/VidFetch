// ========================================================================
// VidFetch — API Layer (only file that talks to the network)
// ========================================================================
const VidFetchAPI = {
  /**
   * Fetch metadata for a YouTube URL.
   * @param {string} rawUrl
   * @returns {Promise<object>} normalized video object
   * @throws {Error} with user-friendly .message
   */
  async fetchMetadata(rawUrl) {
    let res;
    try {
      res = await fetch(VidFetchConfig.endpoint(rawUrl), {
        method: 'GET',
        signal: AbortSignal.timeout(VidFetchConfig.requestTimeoutMs),
      });
    } catch (err) {
      if (err.name === 'TimeoutError')
        throw new Error('Server tidak merespon (timeout >30s). Coba lagi.');
      throw new Error('Gagal terhubung ke server. Mungkin koneksi atau server sedang bermasalah.');
    }

    let body;
    try {
      body = await res.json();
    } catch {
      throw new Error('Respon server bukan JSON valid.');
    }

    if (!res.ok) throw new Error(`Server error: HTTP ${res.status}`);
    return this.mapResponse(body);
  },

  /** Map raw API response → normalized object */
  mapResponse(body) {
    const d = body?.result?.data;
    if (!d || d.error)
      throw new Error(d ? 'Endpoint melaporkan error.' : 'Struktur respon tidak dikenali.');

    const formats = (d.medias || []).map((m) => ({
      formatId: m.formatId,
      label: m.label || '',
      type: m.type || '',
      ext: m.ext || '',
      url: m.url || '',
      bitrate: m.bitrate || 0,
      width: m.width || null,
      height: m.height || null,
      isAudio: !!m.is_audio,
    }));

    return {
      title: d.title || '(tanpa judul)',
      thumbnail: d.thumbnail || '',
      author: d.author || '',
      durationSec: Number(d.duration) || 0,
      durationLabel: this.formatDuration(Number(d.duration) || 0),
      source: d.source || 'youtube',
      inputUrl: d.url || '',
      formats,
    };
  },

  /** seconds → "M:SS" or "H:MM:SS" */
  formatDuration(totalSec) {
    if (!totalSec || totalSec < 0) return '--:--';
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  },
};

window.VidFetchAPI = VidFetchAPI;
