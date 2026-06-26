# VidFetch — Design Specification (Adapted)
> YouTube Downloader + MP4 Fixer · Web App

**Date:** 2026-06-25
**Status:** Awaiting user approval
**Original spec:** `C:\Users\ThinkPad\Downloads\vidfetch_design_spec.md` (adapted)

---

## 1. Overview

VidFetch adalah aplikasi web yang:
- **Mengambil (download) video/audio YouTube** lewat 2 API provider pihak ketiga
- **Memperbaiki (repair) file MP4 yang korup** (container rusak tapi video data utuh) — client-side via ffmpeg.wasm

**Target deploy:** Cloudflare Pages (static) + 1 Cloudflare Worker (proxy untuk solve CORS)

**Theme:** Dark metallic silver — dari design spec asli, dipertahankan.

---

## 2. Goals & Non-Goals

### Goals
- Download video YouTube lewat URL paste
- Tampilkan preview (thumbnail + title + views) sebelum download
- Auto-fallback ke provider kedua kalau yang utama down
- Audio-only download (mp3) sebagai bonus
- Repair file MP4 yang gak bisa dibuka di HP/editing app (format unsupported)
- 100% free, deploy di Cloudflare (free tier)
- Responsive: jalan baik di desktop & mobile

### Non-Goals (out of scope untuk v1)
- Batch download / queue management (butuh backend)
- History / library / persistent storage (butuh backend/DB)
- Format selection (2160p/1080p/720p) — provider API cuma kasih 1 kualitas
- Audio format lain selain MP3 (FLAC, AAC, dll) — provider gak support
- Account system, login
- Video editing / transcoding
- Download dari platform lain (Instagram, TikTok, dll)
- Mobile native app

---

## 3. Architecture

### 3.1 High-Level

```
┌────────────────────────────────────────────────────────┐
│                    User Browser                        │
│  ┌──────────────────────────────────────────────┐    │
│  │  Static Frontend (HTML/CSS/JS)                │    │
│  │  - UI components (sidebar, cards, buttons)     │    │
│  │  - fetch() ke Worker                          │    │
│  │  - ffmpeg.wasm (MP4 fix)                      │    │
│  └──────────────────────────────────────────────┘    │
│         │                │                            │
│         │ download API   │ MP4 fix (client-side)     │
│         │                │                            │
└─────────┼────────────────┼────────────────────────────┘
          ▼                ▼
  ┌──────────────┐   File stays in browser
  │  Cloudflare  │   (zero upload)
  │   Worker     │
  │  /api/proxy  │
  └──────┬───────┘
         │ server-to-server (no CORS)
         ▼
  ┌──────────────────────────────┐
  │ Provider 2 (primary)         │
  │ api.synoxcloud.xyz           │
  │ /download/youtube?url=...    │
  └──────────────────────────────┘
         │ (if timeout/error)
         ▼ fallback
  ┌──────────────────────────────┐
  │ Provider 1 (fallback)        │
  │ api-faa.my.id                │
  │ /faa/ytmp4?url=...           │
  └──────────────────────────────┘
```

### 3.2 Tech Stack

| Layer | Technology | Alasan |
|-------|-----------|--------|
| Frontend | Vanilla HTML + CSS + JS | Spec asli, simpel, no build step |
| Icons | Tabler Icons webfont (CDN) | Sesuai spec, gratis |
| Font | System UI (Inter/Segoe UI) | Sesuai spec |
| MP4 Fix | ffmpeg.wasm (CDN: unpkg) | Solusi client-side, no server needed |
| Deploy frontend | Cloudflare Pages | Static hosting, free, fast |
| Proxy backend | Cloudflare Workers | Free 100K req/day, 10ms CPU, I/O free |
| Versioning | Git + GitHub (or local git) | Untuk trigger deploy otomatis |

**TIDAK pakai:** React, Vue, build tools, npm install, Webpack, Vite. Semua static, langsung deploy.

---

## 4. Features

### 4.1 Feature: YouTube Downloader

#### 4.1.1 Flow

```
1. User navigasi ke "Download" page
2. User paste URL YouTube ke input
3. User klik "Fetch"
4. Frontend GET /api/proxy?url={YT_URL}
5. Worker: GET https://api.synoxcloud.xyz/download/youtube?url={YT_URL}
   (8 second timeout)
6a. IF success: return JSON ke frontend
    Frontend render Video Preview Card
6b. IF timeout/error: Worker fall back ke
    GET https://api-faa.my.id/faa/ytmp4?url={YT_URL}
    IF success: return simpler JSON (no metadata)
    IF fail: return error ke frontend
7. User pilih format (MP4 / MP3)
8. User klik "Download"
9. Browser navigate ke download URL (CDN)
10. Download Queue Card track progress
```

#### 4.1.2 Response Normalization (Adapter Pattern)

Worker menormalisasi 2 format response jadi 1 format internal:

**Provider 2 (rich):**
```json
{
  "status": true,
  "provider": "synoxcloud",
  "data": {
    "title": "...",
    "thumbnail": "https://...",
    "views": 12345,
    "video_url": "https://...mp4",
    "audio_url": "https://...mp3"
  }
}
```

**Provider 1 (simple):**
```json
{
  "status": true,
  "provider": "faa",
  "data": {
    "title": null,
    "thumbnail": null,
    "views": null,
    "video_url": "https://...mp4",
    "audio_url": null
  }
}
```

Frontend cuma tau 1 format ini — gak peduli provider mana.

#### 4.1.3 UI Components (Download Page)

- **URL Input Card** (sesuai spec)
- **Video Preview Card** (adaptasi):
  - Header: thumbnail (96×54) + title + views
  - Format toggle: [MP4 Video] [MP3 Audio] (radio-style buttons, 2 kolom)
  - Action row: [📥 Download {format}] [🔗 Copy Link]
- **Download Queue Card** (sesuai spec):
  - Item: thumbnail 42×28 + title + progress bar + status badge
  - Status: Queued / Progress / Done / Error
  - Tombol pause + clear

#### 4.1.4 Error Handling

| Skenario | UX |
|----------|-----|
| URL invalid (bukan YouTube) | Input border merah + "URL tidak valid" |
| Provider 2 timeout 8s | Auto-switch ke faa, show "Mode fallback" badge |
| Provider 1 juga fail | Error message: "Gagal download. Coba lagi nanti." |
| Video private/region-locked | Error message dari provider diteruskan |
| Network offline | "Tidak ada koneksi internet" |

### 4.2 Feature: MP4 Fixer

#### 4.2.1 Flow

```
1. User navigasi ke "Fix MP4" page
2. Drag & drop zone tampil
3. User drop file .mp4 / .mov / .mkv
4. Frontend baca file ke ArrayBuffer
5. ffmpeg.wasm load (jika belum, ~30MB WASM)
6. Run ffmpeg probe untuk diagnosis:
   - Check moov atom presence
   - Check stts entries
   - Check mdat structure
7. Tampilkan diagnosis ringkas (severity badge)
8. User klik "Fix File"
9. ffmpeg.wasm remux: -c copy -movflags +faststart
10. Progress bar update
11. Output: Blob URL untuk download
12. Tombol "Download Fixed File" enabled
```

#### 4.2.2 Diagnosis Output

```
┌──────────────────────────────────────┐
│  File: Anby Character Demo.mp4      │
│  Size: 30 MB                        │
│  Duration: 2:58                     │
│                                      │
│  ⚠️ Issues found:                    │
│  [CRITICAL] Moov atom missing       │
│  [WARN]     STTS table empty        │
│  [OK]       Codec H.264 valid       │
│                                      │
│  [🔧 Fix File]                      │
└──────────────────────────────────────┘
```

**Severity levels:**
- OK (green `#6b8f6b`): no issue
- WARN (amber `#9a8e6a`): minor issue, file may play
- CRITICAL (red `#8f5050`): major issue, file probably broken

#### 4.2.3 Fix Output

```
┌──────────────────────────────────────┐
│  ✅ File berhasil di-repair          │
│  Size: 30.5 MB (+0.5%)              │
│  Duration: 2:58 (preserved)         │
│  Time taken: 1.2s                   │
│                                      │
│  [📥 Download Fixed File]           │
└──────────────────────────────────────┘
```

#### 4.2.4 Constraints

- File size: limited by browser memory (~2GB typical, document 500MB soft limit)
- Browser support: Modern browsers with SharedArrayBuffer (Chrome 92+, Firefox 89+, Safari 15.2+)
- File types: .mp4, .mov, .mkv (yang underlying-nya MP4 container)
- Non-MP4 files (WebM, AVI) akan show "Unsupported container"

### 4.3 Feature: Audio Only (Bonus)

Sama dengan download tapi default format = MP3, audio_url dipakai.

---

## 5. Navigation & Layout

### 5.1 Desktop Layout (≥768px)

```
┌──────────────┬──────────────────────────────────────┐
│  [Sidebar    │  [Main Content Area]                │
│   210px]     │                                      │
│              │  ┌──────────────────────────────┐   │
│  Logo        │  │ URL Input Card               │   │
│  ─────────   │  └──────────────────────────────┘   │
│  🔍 Download │  ┌──────────────────────────────┐   │
│  🔧 Fix MP4  │  │ Video Preview Card           │   │
│  🎵 Audio    │  └──────────────────────────────┘   │
│              │  ┌──────────────────────────────┐   │
│  ─────────   │  │ Download Queue Card          │   │
│              │  └──────────────────────────────┘   │
│              │                                      │
└──────────────┴──────────────────────────────────────┘
```

### 5.2 Mobile Layout (<768px)

```
┌──────────────────────────────────────┐
│  [Header: Logo + hamburger? no]      │
│  ┌──────────────────────────────┐    │
│  │ URL Input Card               │    │
│  └──────────────────────────────┘    │
│  ┌──────────────────────────────┐    │
│  │ Video Preview Card           │    │
│  └──────────────────────────────┘    │
│  ┌──────────────────────────────┐    │
│  │ Download Queue Card          │    │
│  └──────────────────────────────┘    │
├──────────────────────────────────────┤
│  [🔍 Download │ 🔧 Fix │ 🎵 Audio]  │  ← bottom nav
└──────────────────────────────────────┘
```

**Mobile nav:** Bottom bar, 3 item sama-rata. Active item pakai `border-top: 2px solid` accent. Background `#17191c`.

### 5.3 Page Routing

Single Page Application sederhana, hash-based routing:
- `#/download` → Download page (default)
- `#/fixer` → Fix MP4 page
- `#/audio` → Audio Only page

Tidak pakai library routing — manual, ~20 baris JS.

---

## 6. Visual Design

### 6.1 Color Palette (dari spec asli, dipertahankan)

```
Sidebar bg      #17191c   (paling gelap)
Main bg         #1e2124   (base)
Card bg         #1c1f23   (surface)
Input bg        #141618
Active nav      #252930
Border default  #2e3136
Border hover    #4a505a
Text primary    #d0d5de
Text secondary  #7e8694
Text muted      #4a505a
Placeholder     #3d4249
Btn download    #38404a
Btn fix         #2a2518
Status done     #1e2c1e / #6b8f6b
Status progress #1e2228 / #6070a0
Status error    #2a1e1e / #8f5050
```

### 6.2 Typography

- Font: `system-ui, -apple-system, "Segoe UI", Inter, sans-serif`
- Base: 13px
- Title: 14px, weight 500
- Section label: 10px uppercase, letter-spacing 0.8px
- Body/meta: 11-12px
- **Max weight: 500** (no bold)

### 6.3 Icons

- Library: Tabler Icons (outline) via CDN
- Usage: `<i class="ti ti-download"></i>`
- **No emoji** untuk icon

### 6.4 What to Avoid (dari spec)

- ❌ Gradients
- ❌ Drop shadows / box-shadow dekoratif
- ❌ Glow / neon effects
- ❌ Emoji sebagai icon
- ❌ High saturation colors
- ❌ Font weight > 500
- ❌ Border-radius > 10px (kecuali pill badge)
- ❌ Background brighter than `#252930`

---

## 7. Cloudflare Worker (Proxy)

### 7.1 Endpoint

```
GET /api/proxy?url={URL_YOUTUBE_ENCODED}
```

### 7.2 Logic

```javascript
// Pseudocode
async function handleRequest(request) {
  const url = new URL(request.url);
  const ytUrl = url.searchParams.get('url');

  // Validate YouTube URL
  if (!isValidYouTubeUrl(ytUrl)) {
    return errorResponse('Invalid YouTube URL', 400);
  }

  // Try primary provider
  try {
    const res = await fetchWithTimeout(
      `https://api.synoxcloud.xyz/download/youtube?url=${encodeURIComponent(ytUrl)}`,
      8000
    );
    if (res.ok) {
      const data = await res.json();
      return normalizeAndReturn(data, 'synoxcloud');
    }
  } catch (e) {
    // Fall through to fallback
  }

  // Fallback provider
  try {
    const res = await fetchWithTimeout(
      `https://api-faa.my.id/faa/ytmp4?url=${encodeURIComponent(ytUrl)}`,
      8000
    );
    if (res.ok) {
      const data = await res.json();
      return normalizeAndReturn(data, 'faa');
    }
  } catch (e) {
    return errorResponse('All providers failed', 502);
  }
}
```

### 7.3 Response Normalization

```javascript
function normalizeAndReturn(raw, provider) {
  let normalized;
  if (provider === 'synoxcloud') {
    const r = raw.result[0] || raw.result;
    normalized = {
      status: true,
      provider: 'synoxcloud',
      data: {
        title: r.metadata?.title,
        thumbnail: r.metadata?.thumbnail,
        views: r.metadata?.views,
        video_url: r.video,
        audio_url: r.audio
      }
    };
  } else { // faa
    normalized = {
      status: true,
      provider: 'faa',
      data: {
        title: null,
        thumbnail: null,
        views: null,
        video_url: raw.result?.download_url,
        audio_url: null
      }
    };
  }
  return new Response(JSON.stringify(normalized), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    }
  });
}
```

### 7.4 Limits (Cloudflare Free Tier)

- 100,000 requests/day per Worker
- 10ms CPU time per request (I/O wait excluded)
- Worker size: 1MB max
- Bandwidth: 10MB per response

Plenty untuk personal use / komunitas kecil.

---

## 8. Deployment

### 8.1 Structure

```
vidfetch/
├── index.html
├── css/
│   ├── main.css
│   ├── sidebar.css
│   ├── download.css
│   └── fixer.css
├── js/
│   ├── app.js          (main controller, routing)
│   ├── download.js     (download page logic)
│   ├── fixer.js        (MP4 fixer logic)
│   ├── api.js          (fetch helpers)
│   └── ffmpeg/         (ffmpeg.wasm wrapper)
│       ├── ffmpeg-core.js
│       └── ffmpeg-core.wasm
├── workers/
│   └── proxy.js        (Cloudflare Worker)
├── wrangler.toml       (Cloudflare config)
└── README.md
```

### 8.2 Deploy Steps

1. `git init` di project
2. Push ke GitHub
3. Cloudflare Pages → Connect to Git
4. Build command: (none — static)
5. Build output: `/`
6. Worker: deploy manual via `wrangler deploy` atau wrangler dashboard

### 8.3 Local Dev

```bash
# Frontend: serve static
npx serve .

# Worker: dev mode
npx wrangler dev workers/proxy.js
```

---

## 9. Testing Strategy

### 9.1 Manual Test Cases

**Download feature:**
- [ ] Valid YouTube URL → preview muncul dengan metadata
- [ ] Invalid URL → error message
- [ ] Klik Download → file terdownload
- [ ] Format toggle MP4 ↔ MP3 → link download berubah
- [ ] Provider 2 down → auto-fallback ke faa
- [ ] Mobile: layout responsive, bottom nav visible

**MP4 Fixer:**
- [ ] Drag & drop .mp4 → diagnosis muncul
- [ ] Klik Fix → file remux selesai, download
- [ ] File yang udah sehat → "No issues found"
- [ ] Non-MP4 file → "Unsupported container"
- [ ] Mobile: drag & drop tetap work (atau pakai input browse)

### 9.2 Browser Compatibility

- Chrome 92+ ✅
- Firefox 89+ ✅
- Safari 15.2+ ✅
- Edge 92+ ✅
- Mobile browsers: sama requirement-nya

---

## 10. Open Questions (untuk di-diskusikan dengan user)

1. ~~Struktur web: tab vs routing vs landing~~ → **resolved: routing (hash-based)**
2. ~~Provider: mana primary~~ → **resolved: synoxcloud primary, faa fallback**
3. ~~Deploy target~~ → **resolved: Cloudflare Pages + Worker**
4. ~~Responsive~~ → **resolved: sidebar + bottom nav**
5. ~~Format selection~~ → **simplified: MP4 + MP3 only**
6. ~~Storage/library/history~~ → **removed (out of scope v1)**

---

## 11. Out of Scope / Future

- Account system
- Database-backed history
- Multi-language support
- Subtitle download
- Playlist download
- Browser extension
- Other platforms (Instagram, TikTok, Twitter, etc)
