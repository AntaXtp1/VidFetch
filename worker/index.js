/**
 * VidFetch Download Proxy — Cloudflare Worker
 *
 * Endpoint: GET /dl?url=<encoded_googlevideo_url>
 *
 * Worker fetch URL dari server Cloudflare (bypass CORS),
 * stream balik ke browser sebagai file download.
 */

const ALLOWED_ORIGINS = [
  // Ganti dengan domain Cloudflare Pages kamu setelah deploy
  // Contoh: 'https://vidfetch.pages.dev'
  // Untuk development, bisa tambah 'null' (file://)
  'null', // file:// local testing
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse('', 204);
    }

    // Health check
    if (url.pathname === '/') {
      return corsResponse(JSON.stringify({ status: 'ok', service: 'VidFetch Proxy' }), 200, {
        'Content-Type': 'application/json',
      });
    }

    // Main download proxy endpoint
    if (url.pathname === '/dl') {
      const targetUrl = url.searchParams.get('url');

      if (!targetUrl) {
        return corsResponse(JSON.stringify({ error: 'Missing url param' }), 400, {
          'Content-Type': 'application/json',
        });
      }

      // Validate: only allow googlevideo.com URLs (security)
      let parsed;
      try {
        parsed = new URL(decodeURIComponent(targetUrl));
      } catch {
        return corsResponse(JSON.stringify({ error: 'Invalid URL' }), 400, {
          'Content-Type': 'application/json',
        });
      }

      const allowedHosts = ['redirector.googlevideo.com', 'rr1.sn-', 'r1.sn-'];
      const isAllowed =
        parsed.hostname === 'redirector.googlevideo.com' ||
        parsed.hostname.endsWith('.googlevideo.com');

      if (!isAllowed) {
        return corsResponse(JSON.stringify({ error: 'Host not allowed' }), 403, {
          'Content-Type': 'application/json',
        });
      }

      // Fetch from googlevideo (server-side, no CORS issue)
      let upstream;
      try {
        upstream = await fetch(parsed.toString(), {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
            'Referer': 'https://www.youtube.com/',
            'Origin': 'https://www.youtube.com',
          },
        });
      } catch (err) {
        return corsResponse(
          JSON.stringify({ error: 'Upstream fetch failed', detail: err.message }),
          502,
          { 'Content-Type': 'application/json' }
        );
      }

      if (!upstream.ok) {
        return corsResponse(
          JSON.stringify({ error: `Upstream error: ${upstream.status}` }),
          upstream.status,
          { 'Content-Type': 'application/json' }
        );
      }

      // Build filename from URL itag (format id)
      const itag = parsed.searchParams.get('itag') || '0';
      const mime = upstream.headers.get('content-type') || 'video/mp4';
      const ext = mime.includes('webm') ? 'webm' : mime.includes('audio') ? 'm4a' : 'mp4';
      const filename = `vidfetch_${itag}.${ext}`;

      // Stream upstream response to client with download headers
      const headers = new Headers({
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Disposition,Content-Length',
      });

      // Forward Content-Length if present (enables progress bar)
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) headers.set('Content-Length', contentLength);

      return new Response(upstream.body, {
        status: 200,
        headers,
      });
    }

    return corsResponse('Not found', 404);
  },
};

/** Helper: response with CORS headers */
function corsResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      ...extraHeaders,
    },
  });
}
