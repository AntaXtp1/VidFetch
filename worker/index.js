/**
 * VidFetch Download Proxy — Cloudflare Worker
 * Endpoint: GET /dl?url=<encoded_googlevideo_url>
 */

const ALLOWED_ORIGINS = [
  'https://vidfetch.pages.dev',
  'http://localhost',
  'http://127.0.0.1',
  'null',
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return corsResponse('', 204);
    }

    if (url.pathname === '/') {
      return corsResponse(JSON.stringify({ status: 'ok', service: 'VidFetch Proxy' }), 200, {
        'Content-Type': 'application/json',
      });
    }

    if (url.pathname === '/dl') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) {
        return corsResponse(JSON.stringify({ error: 'Missing url param' }), 400, {
          'Content-Type': 'application/json',
        });
      }

      let parsed;
      try {
        parsed = new URL(decodeURIComponent(targetUrl));
      } catch {
        return corsResponse(JSON.stringify({ error: 'Invalid URL' }), 400, {
          'Content-Type': 'application/json',
        });
      }

      const isAllowed =
        parsed.hostname === 'redirector.googlevideo.com' ||
        parsed.hostname.endsWith('.googlevideo.com');

      if (!isAllowed) {
        return corsResponse(JSON.stringify({ error: 'Host not allowed' }), 403, {
          'Content-Type': 'application/json',
        });
      }

      // Ambil client IP dari request header untuk di-forward ke googlevideo
      const clientIp =
        request.headers.get('cf-connecting-ip') ||
        request.headers.get('x-real-ip') ||
        request.headers.get('x-forwarded-for') ||
        '127.0.0.1';

      let upstream;
      try {
        upstream = await fetch(parsed.toString(), {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
            'Referer': 'https://www.youtube.com/',
            'Origin': 'https://www.youtube.com',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'identity',
            'Range': request.headers.get('range') || 'bytes=0-',
            'X-Forwarded-For': clientIp,
            'X-Real-IP': clientIp,
          },
        });
      } catch (err) {
        return corsResponse(
          JSON.stringify({ error: 'Upstream fetch failed', detail: err.message }),
          502,
          { 'Content-Type': 'application/json' }
        );
      }

      // Kalau masih 403/401 dari googlevideo, return error yang jelas
      if (upstream.status === 403 || upstream.status === 401) {
        return corsResponse(
          JSON.stringify({
            error: 'URL_EXPIRED_OR_BOUND',
            message: 'URL download sudah expired atau terikat ke IP lain. Fetch ulang video untuk mendapat URL baru.',
            status: upstream.status,
          }),
          upstream.status,
          { 'Content-Type': 'application/json' }
        );
      }

      if (!upstream.ok && upstream.status !== 206) {
        return corsResponse(
          JSON.stringify({ error: `Upstream error: ${upstream.status}` }),
          upstream.status,
          { 'Content-Type': 'application/json' }
        );
      }

      const itag    = parsed.searchParams.get('itag') || '0';
      const mime    = upstream.headers.get('content-type') || 'video/mp4';
      const ext     = mime.includes('webm') ? 'webm' : mime.includes('audio') ? 'm4a' : 'mp4';
      const filename = `vidfetch_${itag}.${ext}`;

      const headers = new Headers({
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Disposition,Content-Length,Content-Range',
      });

      const contentLength = upstream.headers.get('content-length');
      const contentRange  = upstream.headers.get('content-range');
      if (contentLength) headers.set('Content-Length', contentLength);
      if (contentRange)  headers.set('Content-Range', contentRange);

      return new Response(upstream.body, {
        status: upstream.status === 206 ? 206 : 200,
        headers,
      });
    }

    return corsResponse('Not found', 404);
  },
};

function corsResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range',
      ...extraHeaders,
    },
  });
}
