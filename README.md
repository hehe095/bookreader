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

The app shell itself is **network-first**: it fetches `index.html` when online
and falls back to the cached copy when it is not. A cache-first shell would pin
the installed app to whatever was deployed on the day it was installed, which
is how a shipped fix never reaches the phone. Icons and the ONNX runtime are
cache-first with a background refresh.

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

Anything printed works — a book spread, a letter, a receipt. There are three
screens and no tab bar: each screen's own buttons are the navigation.

- **Scan**: point the camera (either orientation — landscape works) at the
  page and tap Capture, or upload one or more photos. "Auto" looks for a spine
  and only splits when it finds one; "Two pages" forces a split down the
  middle; "One page" skips splitting. Captures stack into one stream.
- **Read**: the text starts playing by itself after a capture, no extra taps.
  Big button to pause, `Restart`, `+10 words`, a speed slider (100–900 wpm), a
  text size slider, an **Adaptive timing** switch and a **Variation** slider.
- **Pages**: each capture becomes one or two pages here, with what was read
  from it. Move or remove a page if a photo came out wrong.

### Pacing

The pivot letter of each word is parked on a fixed column (never coloured or
highlighted), so the eye has a stable landing point and the word slides around
it rather than the other way round.

Timing is weighted per word — 30 + 50 per letter, ×1.5 for `,;:`, ×2.1 for
`.!?`, ×1.35 at a paragraph end — and then re-normalised so the mean interval
lands **exactly** on the chosen wpm. Slow down for long words, speed up for
short ones, same average speed. The **Variation** slider scales each weight's
distance from the mean before normalising: 0% is dead-steady RSVP, 100% is the
tuned curve, 200% is dramatic — and the average never moves.

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

### Getting the OCR right

Three measured settings are what stand between this and nonsense, and each was
found the hard way:

- **The recogniser must see the line's true shape.** The width is
  `round(length * 48 / thickness)`, capped at 3200 — never "fit it into a
  480px box". Squashing a 1152px line into 480 cost it half its characters:
  `places and the birds went quiet all at once` became
  `place an eid h t gt t e oneweretindtin gtesungic`.
- **Recogniser padding is black, not white.** Normalisation is
  `(x/255 - 0.5)/0.5`, so black is the 0.0 the model trained with. White
  padding is +1.0, out of distribution, and the CTC head reads it as glyphs.
- **Deskew each page, after the split.** The gutter test wants a brightness
  dip that is only 0.5% deep locally, and warping the frame destroys it —
  measured: `findGutter` returns the right column on the raw photo and `null`
  after either rotation direction.

Detector input is capped at 2560px on the long side (and 4.2M pixels total, so
a whole-page photo cannot blow up the phone's wasm heap). Duplicate detector
boxes are dropped, which is what used to duplicate lines of text in the stream.

Checked on the five sample spreads against the Mac pipeline: same word counts
(368/368/368/368, and 330 vs 332 on the asymmetric one), same reading order,
both running heads and every folio dropped. The tiny model even beat the small
one on two clipped letters (`flat`, `without`). Whole spread — split, deskew,
detect and recognise both pages — takes about 3s on an M3.
