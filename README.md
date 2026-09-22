# Athmeeya Geethangal

A polished, responsive hymn-library PWA for **Athmeeya Geethangal**.

## Included

- Complete 1–500 continuous song index
- 500 structured song records
- Exact number/title search and direct song navigation
- Mobile-friendly Android/iOS reading experience
- A4 spiritual-hymn cover intro animation from the supplied cover PDF
- Reader, copy, share and song-image download actions
- Dynamic `available / 500` count driven by `songs-data.js`
- PWA manifest + service worker
- GitHub Pages-friendly update strategy
- Ministry footer with the supplied LHMM information
- Reader font controls and accessible touch targets

## Source data

The library is built from the uploaded **Spiritual Hymns - 8-6-26.pdf**.

Songs 001–062 use the previously verified application dataset. Songs 063–500 are extracted from the supplied PDF while preserving the source ordering and visible structure as far as the PDF text layer permits.

The PDF's embedded Malayalam font mapping contains some characters that cannot be decoded reliably by the text layer. Those characters are represented as **``** instead of being silently guessed or replaced with unrelated text. This keeps the digital dataset honest and makes manual source verification possible.

The supplied **Spiritual Hymns Cover A4.pdf** is rendered as `cover-intro.png` and used for the opening animation.

## GitHub updates

For future song additions or corrections:

1. Edit `songs-data.js`.
2. Keep each record's `num` unique.
3. Keep the records sorted by `num`.
4. Push the changes to GitHub.
5. GitHub Pages serves the updated file.
6. The service worker uses `updateViaCache: 'none'` and revalidates on load/visibility/online events.

The application calculates the available count from the dataset, so you do **not** need to manually change `62 / 500`, `500 / 500`, etc.

## Local preview

Because this is a PWA, use a local HTTP server instead of opening `index.html` directly.

```bash
python -m http.server 5500
```

Then open:

`http://127.0.0.1:5500/`

## Deployment

Upload the contents of this folder to a GitHub repository and enable GitHub Pages for the branch/folder containing `index.html`.

The application title is exactly **Athmeeya Geethangal**.


## v20 performance update
- Removed the opening cover intro completely for immediate app access.
- Long song lists use content-visibility for cheaper initial rendering.
- Exact song navigation temporarily enables full layout only during a jump, then releases it.
- Reduced expensive blur/ambient compositing on touch devices.
- Service worker cache bumped to v20.


## v22 cleanup
- Search/index/hash navigation now uses a single-flight navigation token so delayed callbacks cannot switch to a different hymn.
- Search suggestion clicks explicitly cancel default/bubbling behavior.
- Hymn data received conservative OCR cleanup for duplicated Malayalam vowel marks, zero-width artifacts, replacement characters, and a small class of clearly duplicated scan syllables. No broad translation or stylistic rewriting was applied.
