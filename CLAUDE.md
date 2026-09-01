# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start                      # dev server (CRA, localhost:3000)
npm run build                  # production build to ./build
CI=true npm test               # run all tests once (non-watch)
npm test                       # watch mode
CI=true npm test -- -t "wraps around to the first contact from the last"   # single test by name
npm run build                  # MUST use npm run, not npx react-scripts build:
                               # the npm scripts inject REACT_APP_VERSION/COMMIT/BUILD_TIME
CI=true npm test -- src/App.test.js                                        # single test file
npm run yaml-to-json           # ./data/qrdata.yaml -> src/data/qrdata.js
node yaml-to-json.js ./data/qrdata-test.yaml   # convert a different YAML file
npm run predeploy && npm run deploy            # build + push ./build to gh-pages branch
```

No linter script; ESLint runs via `react-app` config inside `react-scripts` during start/build.

## Architecture

Create React App SPA. No router, no state library, no backend. `src/index.js` renders `src/App.js`.

```
App.js                  owns mode ('view' | 'edit') and the in-progress draft
├── useContactsFile.js  committed contacts, file handle, load/save, localStorage
│   └── fileFallback.js       file input + download, for browsers with no FSA
├── ContactCarousel.js  viewer: QR generation, navigation, gestures
│   ├── QrContentsDialog.js   reveal-the-contents popup
│   ├── HelpDialog.js
│   └── VersionFooter.js
├── ContactEditor.js    presentational list editor
│   └── QrContentsHelp.js     what may be typed into the contents field
└── OverwriteWarning.js
```

`Modal.js` supplies backdrop, heading, Escape, and backdrop-click for all three dialogs.

**Data flow is runtime-only.** Nothing bundles contact data. `useContactsFile` hydrates from `localStorage.contactsData` on mount and otherwise loads a file the user picks. A deployed instance is empty until they do.

**Two ways in and out, chosen by capability.** `isFileSystemAccessSupported()` requires *both* pickers, and every branch is decided by calling it - never by module-load detection, so tests can delete `window.showOpenFilePicker` and get the other path. With the API: `showOpenFilePicker`/`showSaveFilePicker`, a `FileSystemFileHandle`, and in-place `Save`. Without it (Firefox, Safari): `fileFallback.js` supplies a `<input type="file">` to read with and an `<a download>` to write with. Neither yields a handle, so `canSaveInPlace` stays false and `Save` is never rendered - `App` swaps in a different `saveDisabledReason`, because "the link to the file was lost" is not why.

Consequences worth knowing before touching this: a dismissed file input resolves `null` and returns `{reason:'cancelled'}`, which must leave *every* piece of state alone; a download reports nothing back, so `saveAs` returns `{ok:true, via:'download'}` and the status must not say "Saved."; the name the app asked the browser to use is adopted as `fileName`, which is a guess if the user renamed it in the download dialog. `readFileText` goes through `FileReader` rather than `Blob.text()` - Safari lacks the latter before 14, and jsdom lacks it entirely, so tests read real bytes.

Each entry is `{ url, description, background? }`. `url` is any QR payload, not just a web address - `mailto:`, `tel:`, `WIFI:S=...;`, plain text - so the only validation is that it is non-empty. It becomes a PNG data URL via `qrcode` at 1024px (`QR_PIXEL_SIZE`); `description` becomes HTML via `marked`, injected with `dangerouslySetInnerHTML` and **not sanitized**.

**Ownership is split deliberately.** The hook holds what has been *saved*; `App` holds the draft. There is no `setContacts` - `save(draft)`/`saveAs(draft)` commit only after the write succeeds, so a denied permission or failed write cannot leave half-saved data in localStorage. Adopting a file (`rememberFile`) sets handle, `canSaveInPlace`, and name together, so partial adoption is impossible.

The `FileSystemFileHandle` is session-only (not serializable), so after a reload Save is not offered and Save As is the only way to write; the *name* is persisted separately under `contactsFileName` so the UI can still say where the data came from. Reading a file does not grant writing it - `save` upgrades via `queryPermission`/`requestPermission({ mode: 'readwrite' })`, with the Save click as the required user gesture. The first in-place save of a file the app did not write raises `OverwriteWarning`, because `yaml.load`→`yaml.dump` silently drops comments, blank lines, and quoting style (extra keys survive).

Effects in `ContactCarousel.js`, in order - changing one usually means checking the next:
1. `contacts` → regenerate all `qrCodes` (a failure falls back to `/placeholder.png`, which does not exist in `public/`)
2. `currentIndex`/`contacts` → re-render `descriptionHtml`
3. `currentIndex`/`contacts` → (re)bind touchstart/touchend swipe handlers on `carouselRef`
4. mount → cleanup for pending long-press timers
5. `currentIndex` → close the QR dialog, so it can never show a URL that disagrees with the code behind it

`showSlide` wraps at both ends. `App` has four render branches: editor, error, empty, carousel; error and empty both offer Select **and** Create-new, so neither is a dead end.

**Per-entry background.** `background.js` is the only place a value becomes a colour. `normalizeHex` accepts `#rgb`/`#rrggbb` and nothing else - not because names are unsafe but because the colour has to be *measurable*: `textColorFor` picks black or white by WCAG relative luminance (flipping at ~0.179, not 0.5), and `canTintQr` decides whether the QR may be generated with `color.light` set to the page colour rather than white. That tint threshold (luminance 0.5, ~11:1 against black) is deliberately far stricter than text needs - a code a camera cannot read still looks perfectly fine on screen. The hex shape also admits no `;`, quote or bracket, which is what makes it safe to interpolate into a style. An unrecognised value styles *nothing*; there is no half-applied state.

Every preset clears the tint threshold, so the one-tap path never leaves a code on a white square. An earlier all-pale set did that too and was wrong for a different reason - those colours were near-whites, the palest at 1.08:1 against a white page, so tapping one appeared to do nothing. The fix was not darker presets but better-chosen ones: luminance weights green at 0.72 and blue at 0.07, so yellows and greens clear 0.5 while still looking saturated, where a blue or a red must be a genuine pastel. `background.test.js` holds them to a perceptual distance in OKLab rather than a contrast ratio, because contrast measures lightness alone and would call a green and a blue of equal lightness identical. A custom colour may still fall below the threshold, so the editor shows its luminance and says what will happen rather than letting a white square look like a bug. The swatches carry no visible text, so `backgroundLabel` names the current choice under the row - a preset's name, the hex for a picked colour, or `none`.

Two failure modes look identical from the value alone, so `backgroundProblem` reads the entry rather than the value: a key holding a string that is not a colour, versus a key present with a null value - which is what `background: #1d3557` *unquoted* parses to, since `#` starts a YAML comment. The editor distinguishes them because "not a colour" sends someone to stare at a line that reads perfectly well. `yaml.dump` quotes it correctly, so only hand-edited files hit this.

An entry that names a background overrides both colour schemes inline, because the colour is the owner's choice about their card, not a theme for the viewer's phone. Only entries with no colour follow `prefers-color-scheme`.

**One place for colour.** Every colour is a custom property in `index.css`, declared twice - once on `:root`, once under `prefers-color-scheme: dark` - and **no other stylesheet may name a colour**. `theme.test.js` enforces that by reading the CSS files, because the failure is silent: a stray `color: #333` looks right while you work and becomes grey on near-black for everyone reading at night, and jsdom cannot render a page to catch it. The same test asserts every light token has a dark counterpart and vice versa, since a half-declared token reads as themed and is not.

The pairs are **not inversions**. Inverting an accent changes its hue into a different colour; inverting `--danger` turns red into cyan, which stops meaning danger. Each token keeps hue and meaning and moves lightness to the other end while shedding saturation. Two asymmetries are worth knowing: `--surface-raised` is *equal* to `--surface` in light (a white dialog on a scrim) but *lighter* than it in dark, because elevation reads as lightness there rather than shadow - the pair moves in the opposite direction to everything else. And neither end reaches `#000`/`#fff`; the extremes are where text shimmers against its background.

Each set exists twice: as the scheme default on `:root`, and as a forcible class (`.theme-light`/`.theme-dark`). An entry that names a background decides its page's lightness, so `ContactCarousel` forces the matching class - custom properties inherit, so that re-themes the whole subtree, and the dialogs and footer rendered inside it follow the page rather than the phone. Without it a pale entry on a dark phone puts `--text-muted` (`#a0a0a0`) on a light page at **2.4:1**. The forced classes also declare their own `color-scheme`, because native buttons and scrollbars are painted from that rather than from tokens.

`.modal-backdrop` appears in both scheme selector lists to opt back *out* of the page theme. A dialog is about the app, not about the entry, so the help should not change appearance depending on which code is behind it - and the contrast argument for matching the page does not survive checking: a dialog is always seen through the scrim, which takes a cream page down to `#6d675a`, making the dark-dialog case 2.97:1 rather than the 13:1 it looks like against the bare page. What genuinely needed the forced theme is what sits on the bare page with no scrim - the version footer, at 2.4:1. `theme.test.js` compares the forced dark set to the scheme dark set *by value*, since the risk in a duplicated set is that one side gets tuned and the other does not.

`color-scheme: light dark` is what stops Chrome on Android auto-darkening the page (and filtering images), which would recolour a chosen background - it turns itself on when battery saver flips the system to dark. It also themes native inputs, buttons and scrollbars, which is why the editor's form controls need no rules of their own.

The QR code never inverts. Dark modules on a light field is what the spec defines and what finder-pattern detection assumes; support for inverted codes is inconsistent and unknowable from here, since the scanner belongs to whoever is pointing a phone at the screen. On a dark page the code keeps its light plate, which `canTintQr` already produces without a dark-mode branch.

**Untrusted input.** Payloads come from a user-supplied file. `QrContentsDialog.OPEN_LABELS` is an allowlist of five schemes (`http:` `https:` `tel:` `mailto:` `sms:`) mapped to the button's label; anything else renders as text with no button at all. `geo:` was tried and dropped: Android handles it, iOS does not, and nothing can ask which - so prefer an https deep link (`maps.google.com/?q=`, `wa.me/`) over a scheme entry whenever one exists. It must stay an allowlist: `javascript:` handed to `window.open` runs in this page's origin, where `localStorage.contactsData` is readable, and `data:`/`intent:` are the same class of problem. Note that a QR-only convention (`WIFI:S=…;`, `MECARD:`) *parses* as a URL and reports a protocol, so a list built by exclusion would put a dead button on the payloads users most often store. A payload that is not a URL at all gets one more chance: `callableNumber` matches a bare E.164 number (leading `+`, 8-15 digits, visual separators stripped) and builds a `tel:` href for it. That exists because some scanners hand a `tel:` URI to the dialer *without* stripping the scheme, so the number arrives with `tel` keypad-translated onto the front (`835...`) - the bare number is the payload that scans correctly everywhere, and without this it would be the one with no button in the app. The leading `+` is required precisely so that order numbers and serials do not sprout a Call button.

`QrContentsHelp` teaches this same list to the editor and must be changed with it - documenting a scheme the viewer will not act on produces a code with a dead button, which is the failure the allowlist exists to prevent. Web addresses go to `window.open` with `noopener,noreferrer`; the other four are handed to the OS through a link click, since a new tab for a `tel:` is either left blank or torn down the moment the dialer takes over. Long-press on the QR is suppressed for touch only (`handleQrContextMenu`), so Chrome's image menu cannot cover the dialog while desktop right-click still offers Save image as.

**Logo in the middle of a code.** `logo.js` holds the mark, the rules for choosing one, and the two numbers the feature rests on. A logo is deliberate damage - the modules under it are gone, and the code reads only because Reed-Solomon rebuilds them - so `QR_ERROR_CORRECTION` is `H` for every code, carrying a real cost: a long URL goes from 37 modules to 49, and each module is smaller on screen for it. `LOGO_WIDTH_RATIO` is 0.2 and was **measured, not chosen**: at H a short URL survives 30% and a long one 35%, but a bare phone number makes a 21-module code whose centre reaches the timing patterns, which no error correction covers. 20% is what every payload tolerated.

`logoScannability.test.js` is the only test here that can tell you the app still works when the app is a camera. It rasterises the module matrix, whites out the plate, and decodes with `jsQR` - and its negative half matters as much as its positive: without asserting that 45% *fails*, the whole thing would pass just as happily if the punch never landed. jsQR is not a phone and a phone is usually more forgiving, so passing is evidence, not proof; failing means it is broken everywhere.

`resolveLogo` reads entry → file default → the bundled QRousel mark, and either level may write `none` to opt out, an entry beating the file. Only `data:image/*` is accepted: an `https:` logo would tell someone else's server every time a card is looked at. The mark is drawn in `logo.js` as an SVG data URI and is deliberately **not concentric** - QR detection hunts for the finder patterns' 1:1:3:1:1 ratio, and rings or nested squares in the middle of a code invite a fourth match.

`qrLogo.js` composites. `logoPlacement` is pure because the numbers it returns are the ones that decide whether the code scans: the **plate** is held to the ratio, and the mark sits smaller inside it - sizing the mark at the ratio and adding a plate around it would put real occlusion at 25%. Every failure falls back to the plain code: no canvas (jsdom, so tests exercise this path constantly), a mark that will not load, a `SecurityError` from exporting a tainted canvas. A missing logo is a blemish; a missing QR code is the whole app.

`logoImport.readLogoFile` is the only way a picture enters the file, and it never stores what was picked: it draws down to 256px and re-encodes as PNG, stepping to 160 then 96 if the data URL is still over 60KB, and refusing outright rather than storing a photograph if there is no canvas to resize with. PNG rather than JPEG because a mark that cannot be transparent arrives with a white box around it - exactly the hole the plate exists to avoid.

The editor needs *two* controls per entry, not one: `logo: none` and no `logo` key look the same to a picker but mean opposite things, so "No mark on this code" and "Use the default" are separate buttons, and `logoSource` reports which of the four cases is in effect. Logos are also the first thing this app stores that is big enough to exhaust `localStorage`, so `remember` catches the quota error, reports it, and lets the save stand - the file was written; only surviving a reload is lost.

**Two file shapes.** `readContactsFile` accepts a bare list *or* a mapping with an `entries` key and an optional `logo`, so every file written before logos existed keeps working with nothing to migrate and no version field. `serializeContacts` emits the wrapper only when there is a default worth carrying, so a plain list is written back as a plain list.

**Printing.** `@media print` in `ContactCarousel.css` undoes the screen layout rather than adjusting it - the root is sized to the viewport and hides its overflow, which on paper would clip everything to one screenful. Colour literals are allowed there and `theme.test.js` skips the block: a token exists to carry two values so it can follow a scheme, and the point of these rules is that nothing follows anything. Browsers already omit backgrounds, but the text colour is set *inline* from the entry's colour, so white-on-dark would otherwise print white on white.

A tinted code cannot be un-tinted by CSS, since the colour is in the PNG. So a second, always-plain code is generated for tinted entries only (`printCodes`) and rendered into a `.qr-code-print` image that is hidden on screen and swapped in for print. An untinted entry reuses its one code rather than generating an identical second. This also means Ctrl+P prints correctly without going near the button.

**Gesture split on the QR image.** A mouse click opens the dialog; on touch only a 500ms press does. A tap must not open it, because the carousel swipes on touch and a swipe still emits a trailing `click`. `isTouchInteractionRef` suppresses that click for 600ms, which is also why a real mouse click on a hybrid device still works once the touch has settled.

**Layout is height-constrained, not scrolling.** The root is `100dvh` (with `100vh` fallback) and `overflow: hidden`; `min-height: 0` at every flex level lets the QR shrink instead of overflowing. The description takes the leftover space and scrolls in place - deliberately *not* a reserved height, since a `min-height` overrides flex sizing and pushes controls off a short screen. Primary target is mobile portrait.

**Legacy build-time path - dead.** `yaml-to-json.js` and `src/data/qrdata.js` predate the runtime loader (commit 75d8134). Nothing imports `qrdata.js` any more. Both are dead weight; deleting them is a pending cleanup. `.gitignore` still lists the pre-rename `src/data/contacts.js`, so the generated `qrdata.js` is committed.

## Tests

Eight suites, ~142 tests. Loading, saving, permissions, and unsaved-change guards live in `App.test.js` against the real component; the carousel suite covers viewing, navigation, gestures, and the actions band. File pickers, `createWritable`, and the permission methods are faked; `js-yaml` is used for real so serialization is genuinely exercised. The fallback path is *not* faked at the module boundary - `App.test.js` deletes both pickers and drives the real `<input>` and `<a download>`, stubbing only `URL.createObjectURL` (jsdom has none) and `HTMLAnchorElement.click`.

Two async traps specific to the fallback: `FileReader` settles *after* `act()` has flushed, so an assertion on state that came from a file read needs `waitFor`/`findBy`, not a bare `getBy`. And `git checkout --` cannot restore an untracked file - during mutation testing of a *new* module, a crashed run leaves the mutation in place and every later result is a lie. Restore from a copy.

Every guard is expected to be **mutation-checked**: break the guard, confirm exactly the test that covers it fails. Two real gaps in this codebase were found that way and by nothing else - a handle adopted before its write landed, and a mock that had never returned a value.

Two traps this suite has already fallen into once — check both when adding tests:

- **localStorage leaks between tests.** The component persists loaded contacts to `localStorage.contactsData` and rehydrates from it on mount, and jsdom keeps that store for the whole file. `beforeEach` clears it; without that, a test that declares a fixture but never clicks "Select qrdata.yaml" silently renders the *previous* test's data and asserts against it.
- **Batched clicks read a stale index.** `showSlide` closes over `currentIndex`, so several `fireEvent.click` calls inside one `act()` all compute from the same pre-click index. Use one `await act()` per click (the `clickNext`/`clickPrevious` helpers) whenever a test walks through more than one slide.

- **CRA sets `resetMocks: true`** (`react-scripts/scripts/utils/createJestConfig.js:68`), which strips the implementation given in a `jest.mock` factory before every test. `jest.mock('qrcode', () => ({ toDataURL: jest.fn(() => Promise.resolve(...)) }))` therefore resolves `undefined` at test time, and every QR code silently falls back to `/placeholder.png`. Reinstate the implementation in `beforeEach` (`QRCode.toDataURL.mockResolvedValue(...)`). This went unnoticed for a long time because no test asserted on the generated image.
- **jsdom has no `PointerEvent`.** `fireEvent.pointerDown(el, { pointerType: 'touch', clientX: 10 })` silently drops every property - the handler receives an empty event. This is why the long-press uses touch events rather than pointer events. Do not reach for pointer events in this suite without polyfilling first.
- **Touch fixtures need `changedTouches` and screen coordinates.** The swipe handler reads `e.changedTouches[0].screenX`, so a fixture supplying only `touches` throws inside a handler you were not even testing. The `touchEvent(x, y)` helper populates `touches`, `changedTouches`, `clientX/Y`, and `screenX/Y` together.

- **A fake `FileSystemFileHandle` must not resolve `requestPermission` to `'prompt'`.** The real API only ever answers `granted` or `denied`; a fake that echoes `prompt` back makes the permission upgrade look broken when it is not.
- **A guard behind a disabled button is unreachable, so its mutation survives.** `moveEntryAt` is exported from `ContactEditor` as a pure function for exactly this reason - the end-of-list guard cannot be reached by clicking, so it is unit-tested directly.

Navigation tests use `renderWithContacts` (renders *and* loads the fixture through the picker) and `expectSlide(data, index)`, which asserts the expected description is present and every other slide's description is absent. The negative half is what makes these tests fail when navigation breaks. Verified by mutation: a no-op `showSlide` fails 4 tests, and clamping either wrap direction fails exactly the matching wrap test.

`CI=true npx react-scripts build` fails on three pre-existing lint warnings (a missing `showSlide` dependency in the swipe effect, and two redundant `role="button"` attributes). Plain `npm run build` compiles with those as warnings. This is unrelated to any recent change - do not treat a red `CI=true` build as a regression without checking these three first.

**Not a PWA.** `public/manifest.json` exists and is linked, so the app is installable, but there is no service worker anywhere - CRA 5 dropped the default one and this project never added `cra-template-pwa` or workbox. Nothing caches the app shell, so a redeploy reaches users on their next load and there is no update prompt to build. `public/index.html` nevertheless carries a meta tag describing the app as "A PWA", with `name` set to the app title rather than `description`; both are wrong and neither has been changed.

**Version footer.** `src/VersionFooter.js` renders `REACT_APP_VERSION`, `REACT_APP_COMMIT`, and `REACT_APP_BUILD_TIME` as `v0.1.0+349650f · built ...`. The version itself is inert - `0.1.0` is the only value that has ever been in `package.json` and nothing bumps it - so the commit and the build time are what actually identify a build. Values are read at render (not module load) so tests can set them and a missing value degrades to `vdev`. Note `process.env.X = undefined` stores the string `"undefined"`, so test teardown must `delete` instead. The npm `start`, `build`, and `build-gh-pages` scripts inject both; running `npx react-scripts start` directly bypasses that and shows `vdev`.

**`homepage` changes the asset path.** `package.json` sets `homepage` to the GitHub Pages URL, so `PUBLIC_URL` is `/qrousel` and the dev server serves assets at `/qrousel/static/js/bundle.js`. Requesting `/static/js/bundle.js` returns `index.html` via the SPA fallback with a 200 - a smoke test that curls that path proves nothing.

## Deployment

GitHub Pages via `gh-pages`. `homepage` is hardcoded in `package.json` (`https://reachpersona.github.io/qrousel/`) — change it there when deploying to a different repo. Note the README describes a `REACT_APP_GH_PAGES` env var and a `build-gh-pages` script that rewrites `homepage`; neither exists in the current code (`build-gh-pages` is a plain `react-scripts build`, and the URL argument `predeploy` passes it is ignored).
