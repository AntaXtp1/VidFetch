# VidFetch

Web app statis untuk download video YouTube. Dark metallic silver theme.

## Jalankan lokal
Buka `index.html` langsung di browser (file://) — tidak butuh server.

## Deploy ke Cloudflare Pages
1. Upload folder ini ke repo Git, atau pilih "Direct Upload" di Cloudflare Pages.
2. Build command: *(kosong)*
3. Output directory: `/` (root)

## Fitur
- **Download** — Paste link YouTube → fetch metadata → preview thumbnail + pilih format → buka link download
- **History** — Tersimpan otomatis di localStorage, auto-hapus setelah 7 hari, ada tombol copy link

## Endpoint
`GET https://api.synoxcloud.xyz/download/all-in-one?url=...`
- Input divalidasi hanya menerima link YouTube
- Tombol Download membuka URL di tab baru (cross-origin googlevideo)
