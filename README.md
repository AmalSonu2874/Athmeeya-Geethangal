# Athmeeya Geethangal — v17

Navigation-focused release. Index and search navigation use deterministic, layout-safe direct scrolling to the exact song card.

# Athmeeya Geethangal

A lightweight, GitHub Pages-ready Malayalam hymn application for Android, iOS and desktop. The interface is designed around one primary task: **find the exact song quickly and read it comfortably**.

## Song data

Edit **`songs-data.js`** for normal song updates:

```js
{
  num: 63,
  title: "ഗീതത്തിന്റെ പേര്",
  tags: [],
  lyrics: `...`
}
```

The UI reads the data file at runtime, so the visible count updates automatically. With the current library it displays **62 / 500**. Add song 63 and it becomes **63 / 500** without editing the HTML. If a song numbered above 500 is added, the index expands automatically.

## Exact navigation

- Search a song number and press **Enter** → opens that exact song.
- Search an exact title and press **Enter** → opens that exact song.
- Tap a live number in the Index → opens that exact song.
- Search suggestions are directly tappable.
- Hash links such as `#song-41` open the precise song.
- Previous / Next in Reading Mode follows the actual numeric order of the available songs.

## PWA / install flow

The app is installable as a Progressive Web App when the browser supports installation. The header/About/footer **Install app** actions open a dedicated install sheet.

- **Android / Chrome:** uses the browser's native install prompt when available.
- **iPhone / iPad:** because iOS does not expose the same web install prompt, the sheet gives the Safari **Share → Add to Home Screen** steps.
- The install sheet includes an **Install Now** state with a progress bar and a clear internet-connection reminder.
- The top **×** / **Open in Chrome** action opens the live GitHub Pages website in an external browser context; on Android it attempts a Chrome hand-off and falls back safely.

## GitHub updates

Push updated `songs-data.js` to your GitHub Pages repository as usual. The service worker uses network-first revalidation for the HTML, CSS, JavaScript, manifest and song data files, and the app asks the service worker to check for updates on page load, when the app becomes visible again and when the device returns online.

This keeps the installed app connected to the latest GitHub Pages version while retaining a cached copy for offline reading.

## Song image download

Each song can be exported as a PNG. The generated image uses `download-bg.jpg`, keeps the Malayalam line structure and stanza numbering, and calculates the canvas height from the song content so the poster is not unnecessarily cropped or padded. On supported mobile browsers the image can be sent through the native share sheet; otherwise it downloads directly.

## GitHub Pages

Upload the files to the repository root and enable GitHub Pages. No backend is required.


## v13 navigation + installation
- Song index buttons and search suggestions use explicit song-target navigation.
- Direct navigation waits for the final Home layout and scrolls using the real sticky-header height, avoiding content-visibility and search-debounce races.
- Numeric search is exact (for example, `41` opens Song 41).
- Exact/unique title search opens the matching song; ambiguous searches remain selectable.
- Install is available in the desktop nav and mobile app nav. Compatible Chrome/Edge browsers use the native PWA install prompt; iPhone/iPad receives the Safari Add to Home Screen flow.


## v14 polish
- Slightly larger default/readability-focused typography.
- Song index uses larger 44–47px touch targets with stronger focus/active behavior for easier selection on phones and tablets.
- Cache version bumped to v14.


## v15 polish
- Larger default reading typography without a bulky layout.
- Reworked index into 50-song ranges with larger touch targets.
- Numeric index selection uses a single exact target and never falls through to broad matches.
- Added a full ministry information footer with trustee, publisher, India representative and evangelist contact details.


## v16
- Removed the 1–50 / 51–100 range controls. The index is now one continuous 1–500 sequence.
- Enlarged index targets for comfortable touch selection.
- Install sheet auto-opens for normal browser visits and stays out of standalone app launches.
- Install remains available in navigation/footer.
- Cache version bumped to v16.


## Installation prompt behavior

The app shows the install dialog automatically only on the first browser visit for that browser profile. Closing it with **×** permanently suppresses the automatic dialog for that profile. There are no install-related redirects, new tabs, or forced navigation actions. The **Install** item in the navigation remains available for manually reopening the dialog. Browsers that support `beforeinstallprompt` use the native installation prompt; iOS/Safari shows the platform's Add to Home Screen steps in the same dialog.
