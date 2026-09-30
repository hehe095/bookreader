# BookReader PWA

Photograph a book spread → automatic page split → PP-OCRv6 OCR → furniture
cleanup (running heads, page numbers, title/author) → adaptive RSVP reader.
Everything runs **on the phone**, in the browser. No Mac, no server, no fees.

## Files

- `index.html` — the whole app with the tiny models inlined (8.5 MB). This is
  the single file that gets deployed.
- `index.src.html` — the same app without inlined models (nicer to edit).
- `build.py` — regenerates `index.html` from `index.src.html` + `models/`.
- `models/` — the tiny detector and recogniser inlined into `index.html`.
- `models/small/` — the better recogniser (21 MB), fetched at runtime.
- `sw.js`, `manifest.webmanifest`, `icon-*.png` — installable/offline support.

After the first visit the service worker caches everything (including the
onnxruntime-web CDN files), so the app opens with **no network at all** —
camera, OCR and reader all work offline. The better recogniser is cached the
first time it is used and is never re-fetched (the tier name means one exact
file, so there is nothing to revalidate — and revalidating it used to pull
21 MB again on every launch).

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
own buttons are the navigation.- **Scan**: point the camera (either orientation — landscape works) at the
  page and tap Capture, or upload one or more photos. "Auto" looks for a spine
  and only splits when it finds one; "Two pages" forces a split down the
  middle; "One page" skips splitting.

  **Capture stays armed.** A tap only queues the frame; the reading happens one
  shot at a time behind the camera, so you can page through a whole book
  without waiting for it. The run stays in the camera until you leave it — the
  counter under the progress bar (`3 shots · 6 pages · 1104 words · reading 2
  more…`) and **Read**, which becomes the primary button as soon as there is
  anything to read. Editing a run is deliberate: shoot, then leave. Tapping fast
  can neither start two wasm runs at once nor leave the button dead.
- **Read**: opening the reader on a fresh run starts playing by itself; a
  reader who was paused mid-stream stays where they were. Leaving the reader
  pauses it rather than letting the stream run on behind another screen. Big button to pause,
  `Restart`, `+10 words`, a speed slider (100–900 wpm), a text size slider, an
  **Adaptive timing** switch and a **Variation** slider.
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

- OCR = PP-OCRv6 via onnxruntime-web (WASM), so it works on any iPhone, no
  server. The detector is always the tiny one (1.7 MB); the recogniser is the
  better `small` one (21 MB) when the network has it, tiny (4.3 MB, inlined)
  when it does not. The status line says which is live.
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
edges. This was the biggest win of the lot: **8.7% → 1.1%** word error with the
tiny model (and 2.7% → 0.0% with the small one). At 5% it starts welding words
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

The sample spread is a flat, evenly lit render, and on input like that the tiny
recogniser sits at 1.6% word error — near its floor, which is why an earlier
comparison on clean crops concluded the bigger model bought nothing. A phone
photo is not a flat render. Scoring both recognisers against the known text of
the same page, under the degradations a real photo actually has:

| degradation | tiny | small |
|---|---|---|
| straight on | 1.1% | **0.0%** |
| uneven light | 2.2% | **0.5%** |
| hand shadow across the page | 3.3% | **0.0%** |
| out of focus | 5.5% | **0.5%** |
| jpeg artefacts (q35) | 5.4% | **0.0%** |
| low resolution | 4.4% | **0.5%** |
| all four at once | 52.8% | **32.6%** |

One wrong word in twenty against one in two hundred is the difference between
"the OCR is bad" and not noticing it, so `small` is what the app wants. Three
things keep it from costing anything: the **detector** stays tiny, because the
small detector finds the same boxes for 2.7× the price, so only the recogniser
is upgraded; the **queue** means the reading happens behind the camera rather
than in front of the reader; and the app **starts on tiny and upgrades in the
background**, so a phone on cellular never stares at "loading" for half a minute
and a network hiccup cannot look like a broken app — the inlined weights are
already on the device and already work. The status line always says which one is
live. If the fetch fails, or the dict does not match the model, the app keeps
tiny (a working app, just a less accurate one) and logs why to the console.

The two recognisers do **not** share a vocabulary (6,904 characters against
18,708), so each tier carries its own dict and the character count is checked
before use. A mismatched pair decodes as fluent-looking nonsense, which is worse
than failing — so the recogniser is a single `{ tier, session, chars }` object
that `readLines` snapshots per line, and an upgrade mid-document swaps all three
at once. Verified by swapping engines in the middle of a page and checking every
decoded line still comes out as real words.

Flat-field illumination correction was tried and **rejected**. It helps in three
of the seven degradations (tiny on a hand shadow 3.3% → 1.1%, small on all four
at once 32.6% → 24.5%) and hurts in three (low-res 4.4% → 5.5%, and the tiny
clean case 1.1% → 1.6%), because dividing out the background also divides in the
noise. No variant beat leaving the pixels alone on average, so it is not in the
code.

Two URL switches, both for comparing models on the same photo:

- `?tier=tiny` — pin the small recogniser off.
- `?models=https://…/` — load the model files from somewhere else.

### Recognising a paragraph, not just a spread

**Structure first, shadow second.** The gutter is the column a page opens at,
and the first thing asked of it is whether it is a run of columns that no text
row crosses, with page-like text on both sides. That is what a gutter *is*, with
or without a binding shadow. Only when there is no such channel does the search
fall back to the darkest column — the curved-spine case, where the dark band
still has text bled into it.

The order matters, and getting it backwards was a real split failure. Judging on
darkness first means ranking columns by brightness, and on a page photographed
flat the darkest columns are *inside the text columns*, because the ink itself
pulls down their average. The argmax then lands in the middle of a word, the
empty-channel test finds nothing there, and the spread goes to the recogniser as
one page — two columns interleaved. Two columns with a white gutter and no
shadow at all used to come out as **one page**; it now comes out as two.

Both paths still demand text on both sides that is dense enough and wide enough
to be pages — and the shadow path also that most rows do **not** run straight
through the candidate column. That is exactly what a spine is and what
everything else is not. A paragraph scanned on its own is one column: its ragged
right edge is empty in most rows but crossed by the long ones, and a shadow
falling across it is crossed by *every* row. Neither is a spine, so neither
splits.

Verified both ways. One page, unchanged: a rendered paragraph filling the frame,
the same paragraph lying on a dark desk, and a single column with a wide empty
right margin. Two pages: two columns with a white gutter and no shadow, a
spread with a spine shadow lying on a desk, and all five sample spreads at
exactly the same columns as before — 368 words each (330 vs 332 on the
asymmetric one), same reading order, running heads and every folio dropped.
Whole spread — split, deskew, detect and recognise both pages — takes about
2.6s with the tiny recogniser on an M3.
