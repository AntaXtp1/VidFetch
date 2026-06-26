// ========================================================================
// VidFetch — Config & Constants
// ========================================================================
const VidFetchConfig = {
  // Endpoint all-platform (locked to YouTube via input validation)
  endpoint: (rawUrl) =>
    `https://api.synoxcloud.xyz/download/all-in-one?url=${encodeURIComponent(rawUrl)}`,

  requestTimeoutMs: 30000,

  // YouTube URL validation
  youtubeUrlPattern:
    /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch|shorts|embed)|youtu\.be\/).+/i,

  // Cloudflare Worker proxy URL
  workerUrl: 'https://autumn-recipe-e193.antarahimmuhammad.workers.dev',

  // Proxy URL builder: kirim googlevideo URL ke Worker
  proxyDownloadUrl: (directUrl) =>
    `https://autumn-recipe-e193.antarahimmuhammad.workers.dev/dl?url=${encodeURIComponent(directUrl)}`,

  // History auto-cleanup after 7 days
  historyMaxAgeMs: 7 * 24 * 60 * 60 * 1000,

  // localStorage key
  historyKey: 'vidfetch_history',
};

window.VidFetchConfig = VidFetchConfig;
