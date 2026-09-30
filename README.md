# BookReader PWA

Photograph a book spread → automatic page split → PP-OCRv6 OCR → furniture
cleanup (running heads, page numbers, title/author) → adaptive RSVP reader.
Everything runs **on the phone**, in the browser. No Mac, no server, no fees.

## Files

- `index.html` — the whole app, models inlined (8.4 MB). This is the single
  file that gets deployed.
- `index.src.html` — the same app without inlined models (nicer to edit).
- `build.py` — regenerates `index.html` from `index.src.html` + `models/`.
- `sw.js`, `manifest.webmanifest`, `icon-*.png` — installable/offline support.

After the first visit the service worker caches everything (including the
onnxruntime-web CDN files), so the app opens with **no network at all** —
camera, OCR and reader all work offline.

## Publish to GitHub Pages (5 minutes, free forever)

1. On github.com: **New repository** → e.g. `bookreader` → Public → Create.
2. Upload the *contents* of this folder (`index.html`, `index.src.html`,
   `build.py`, `sw.js`, `manifest.webmanifest`, `icon-180.png`, `icon-512.png`,
   `models/`) — the web UI does this fine: **Add file → Upload files**.
3. Repo **Settings → Pages** → Source: **Deploy from a branch** →
   Branch: `main`, folder: `/root` → Save.
4. Wait ~1 minute. Your permanent URL is
   `https://<your-username>.github.io/bookreader/`.
5. On the iPhone: open that URL in **Safari** → Share button →
   **Add to Home Screen**. It installs as a native-looking app and never
   expires.

If GitHub auth is set up on the Mac instead, the equivalent is:

```bash
cd pwa
git init && git add -A && git commit -m "BookReader PWA"
git remote add origin https://github.com/<you>/bookreader.git
git push -u origin main
```

## Using it

- **Scan**: point the camera (either orientation — landscape works) at the
  two-page spread and tap Capture, or upload multiple photos at once.
  "Auto" finds the gutter and splits the spread into two pages; "Spread"
  forces a split down the middle; "One page" skips splitting.
- **Pages**: every capture becomes one or two pages here. Reorder with the
  arrows, delete mistakes with ✕, add more photos at any time — captures
  stack up into one book.
- **Read**: pick a speed (100–900 wpm) and tap Play. Timing is adaptive —
  longer words and punctuation pauses get more time — but the average lands
  **exactly** on the chosen wpm.

## Rebuilding after edits

Edit `index.src.html`, then:

```bash
python3 build.py
```

## Notes

- OCR = PP-OCRv6 tiny (det 1.7 MB + rec 4.3 MB) run through onnxruntime-web
  (WASM), so it works on any iPhone, no server.
- The Mac pipeline in `../bookreader/` (higher-accuracy small models, 48
  tests) shares the same design: gutter split via darkness+emptiness, oriented
  text-line geometry, body-is-default furniture classifier, descender-safe
  unclip ratio 1.6.
