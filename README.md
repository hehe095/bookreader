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

Anything printed works — a book spread, a letter, a receipt, or just the one
paragraph you point at. There are three screens and no tab bar: each screen's
own buttons are the navigation.

- **Scan**: point the camera (either orientation — landscape works) at the
  page and tap Capture, or upload one or more photos. "Auto" looks for a spine
  and only splits when it finds one; "Two pages" forces a split down the
  middle; "One page" skips splitting. Captures stack into one stream.
- **Read**: the text starts playing by itself after a capture, no extra taps.
  Big button to pause, `Restart`, `+10 words`, a speed slider (100–900 wpm), a
  text size slider, an **Adaptive timing** switch and a **Variation** slider.
  Under the stage, **Text read from your photos** drops down the whole thing as
  prose — tap any paragraph to start reading there.
- **Pages**: each capture becomes one or two pages here, with what was read
  from it. Move or remove a page if a photo came out wrong.

### Pacing

The pivot letter of each word is parked on a fixed column (never coloured or
highlighted), so the eye has a stable landing point and the word slides around
it rather than the other way round.

Timing is weighted per word — 30 + 50 per letter, ×1.5 for `,;:` and dashes,
×2.1 for `.!?`, ×1.35 at a paragraph end — and then re-normalised so the mean
interval lands **exactly** on the chosen wpm. Slow down for long words, speed up
for short ones, same average speed. The **Variation** slider scales each
weight's distance from the mean before normalising: 0% is dead-steady RSVP,
100% is the tuned curve, 200% is dramatic — and the average never moves.

The pause is looked up past a closing quote or bracket, so `"he said."` ends a
sentence and `word,"` is a comma. Em and en dashes are folded to a dash, *not*
to a hyphen: as a hyphen they look exactly like a hyphenated line break and the
joiner would glue the next word on (`said—quietly` became `saidquietly`).

A slash is a word boundary when it is really joining two words: `huge/playtest`
reads as two words (as one token it flashed as a single gigantic word with
nothing to anchor the eye). Short slash-words — `and/or`, `3/4`, `km/h` — are
left whole, because splitting them only buys flicker.

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

What stands between this and nonsense is all in the crops and the inputs. Each
was found the hard way, and measured against the known text of the sample spread
(word error rate against its 184-word reference, page 1):

- **Give the recogniser a 2% margin around the line.** The detector's box hugs
the dark core of a line, and a crop with no margin loses the glyphs at its
edges. This was the biggest win of the lot: **8.7% → 1.6%** word error with the
tiny model (and 2.7% → 0.5% with the small one). At 5% it starts welding words
together (`and it` → `andit`), so 2% is what ships. It is also what "missing
letters, mis-spelled" was: the letters were being cut off before the recogniser
ever saw them.
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
a whole-page photo cannot blow up the phone's wasm heap), and both the detector
and the recogniser resample with `imageSmoothingQuality = 'high'` — text is
exactly the case where the browser's cheapest filter costs the strokes that tell
one letter from another. Duplicate detector boxes are dropped, which is what
used to duplicate lines of text in the stream.

### Which model

Both PP-OCRv6 sizes were measured on the same crops, same code, only the model
swapped (word error against the reference, 2% crop margin):

| recogniser | size | pad 0% | pad 2% |
|---|---|---|---|
| tiny (ships) | 4.3 MB | 8.70% | **1.63%** |
| small | 20 MB | 2.72% | **0.54%** |

Small is better (one wrong word per page instead of three) but it is 25 MB more
to download, roughly 3× the recognition time on every single capture, and it
would take the single-file build from 8.4 MB to about 30 MB. The crop margin got
5× for nothing, which is where the win was. So: tiny stays, and the Mac pipeline
in `../bookreader/` remains the high-accuracy path (it uses the small models,
with 48 tests behind it).

### Recognising a paragraph, not just a spread

Splitting needs positive evidence, in either of two forms: a brightness dip (the
binding shadow) or a genuinely empty vertical channel with text on both sides.
Both then require text on both sides that is dense enough and wide enough to be
pages — and, in the shadow case, that most rows of text do **not** run straight
through the candidate column.

That is exactly what a spine is and what everything else is not. A paragraph
scanned on its own is one column: its ragged right edge is empty in most rows
but crossed by the long ones, and a shadow falling across it is crossed by
*every* row. Neither is a spine, so neither splits — verified on a rendered
paragraph filling the frame and on one lying on a dark desk (which the Otsu
trim also crops to the paper). Verified the other way too: all five sample
spreads still split at exactly the same columns as before, and yield 368 words
each (330 vs 332 on the asymmetric one), same reading order, running heads and
every folio dropped. Whole spread — split, deskew, detect and recognise both
pages — takes about 3s on an M3.
