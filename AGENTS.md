# Modest Text — notes for contributors and coding agents

A single-file text editor. `src/` is the source; `build.mjs` bundles it into one
self-contained `modest-text.html`, which is committed. Notes live in the browser's
localStorage under `modest-text:v1:`; there is no server and no build step for the user.

## Working on it

```sh
node build.mjs     # writes modest-text.html
npm test           # build, then the whole Playwright suite
```

The built file is committed, so **rebuild before committing** and expect the rebuild to be
byte-identical when the sources have not changed. `build.mjs` prints the size and the bundle's
sha256 — an unchanged hash after an unrelated edit means nothing was rebuilt.

## Tests

Six functional projects: Chromium, Firefox and **WebKit**, each over `file://` and over a local
http server. WebKit is required, not optional: Safari's engine has bugs the other two do not (it
ignores `border-radius` on a `<select>`, and can put a non-breaking space into pasted text). Install
the three once:

```sh
npx playwright install chromium firefox webkit
```

Four perf projects run afterwards, one at a time, one worker each: `perf.spec.js` measures
event-loop gaps, so leave the machine alone while it runs. `tests/global-setup.mjs` takes a lock,
so a second `playwright test` stops rather than sharing the server and the CPU.

Useful variables: `MT_WORKERS` (default 4; `1` for a fully sequential run), `MT_PORT` (default
8765), `MT_CHROME`, `MT_FIREFOX_CHANNEL`.

Run one project or one test while working, but run all six before committing.

## Traps

- **A stale test server blocks every run.** The config sets `reuseExistingServer: true`. A server left
  on port 8765 by another run, even from another folder, answers the readiness check with a 404;
  Playwright then tries to start its own and fails with `EADDRINUSE`, naming neither the port nor the
  process. Check with `lsof -nP -i :8765`.
- **Write test output to a file, not through `tail`.** A pipe hides Playwright's exit code, so "no
  failures" looks the same as "the suite never started".
- **Never overlap a build and a test run.** A run loads `modest-text.html` for every test, so a
  rebuild in the middle tests two builds at once. Finish every edit, build once, then run. A second
  `playwright test` is refused as soon as it starts, before Playwright empties `test-results/` (which
  would delete the running suite's traces). Run long suites in the background, writing to a file in
  `.tmp/`, and read it when it ends.
- **Run the timing tests one project at a time**, or as part of the full run. With `--no-deps` on the
  four `*-perf` projects together, they run at the same time and fail for no reason.
- **`page.close()` is not a tab close.** It destroys the page before the browser has stored its last
  localStorage writes. Under load, WebKit then lost the page's last half-second of writes in 4 runs out
  of 40, against 0 in 40 when the page was left first (`page.goto('about:blank')`), which is what
  closing a real tab does. Tests leave the page before closing it. A page cannot force its writes to
  disk, so only a browser crash or force-quit can still cost that half-second.
- **Test the explanation of a flaky test before writing it down.** Reproduce the failure under load
  (`--repeat-each`, next to the heavy `storage.spec.js`, four workers), then run the change that would
  tell the explanations apart.
- **Toasts disappear after 7 s**, and a heavy import can block WebKit for longer. Use `watchToasts` /
  `toastLog` from `tests/helpers.js` instead of waiting for the element.
- **Do not edit tests with a global search-and-replace.** Some assertion lines appear, identical, in
  more than one test.
- **Write a shifted letter as its key code: `ControlOrMeta+Shift+KeyZ`, never `...+Shift+z`.** With a
  lower-case letter Playwright sends `key: "z"` with Shift down, which a real keyboard only does with
  Caps Lock on. Off a Mac, CodeMirror then runs the shortcut without Shift (undo instead of redo).
- **Build with Node 24, as CI does.** Node 24's zlib compresses the bundle to different bytes than
  Node 20's: the same code gives a different `modest-text.html`.
- **Node 20.20 decodes `windows-1252` as Latin-1** (`€œ` come out as control characters); Node 22 and
  24 do not. Only `unit.spec.js` decodes under Node.
- **`:focus-visible` differs by engine.** Firefox and WebKit show an autofocused dialog button as
  keyboard-focused at once; Chromium only after a key moves the focus. Check focus styles in all three.

## Conventions

- **Every shortcut goes in three places**, or users cannot find it: `SHORTCUTS` in `src/i18n.js`, the
  table in `src/keysheet.js` (the shortcut sheet), and the Keyboard section of Help, in both languages.
  A key that exists on one system only is marked there with `only(mac, …)` or `only(!mac, …)`.
- **A shortcut the page claims only sometimes is worse than one it never claims.** If a binding
  calls `preventDefault()` only in some states, the browser's own command answers the first press
  and nothing answers the rest. Claim the key in every state, or leave it alone.
- **Comments say why, not what**, and name the measurement when there was one.
- **Every fix gets a test that fails without it.** Check that it does.
- **No links to AI chat sessions,** anywhere: files, commit messages, tags, releases, issues or pull
  requests. A co-author trailer is fine; a session URL is not.
- The interface is English and French throughout; user-visible strings live in `src/i18n.js`.
- Help is a plain HTML page (`#help-view`), not a CodeMirror document, so the browser's own find
  works there and the app's find bar deliberately stays out of it.

## CI

`.github/workflows/tests.yml` runs the suite on **Windows** for every push and pull request to
`master`, unless only Markdown files changed. A new push cancels the run in progress.

macOS runs on request: *Actions → tests → Run workflow → "Also run on macOS"*. Its runner is Apple
Silicon; run it before a release. It has one open question (Known issues).

CI installs Chromium and Firefox but not WebKit, so run all six projects locally before committing.
CI adds Windows and is a safety net.

## Releasing

A release is a signed tag `vX.Y.Z` and a GitHub Release with `modest-text.html` attached; the README's
download link always points at the latest one.

1. Put the changes under a new `## [X.Y.Z] — YYYY-MM-DD` heading in `CHANGELOG.md`, and the same
   version in `package.json` (`npm version X.Y.Z --no-git-tag-version` updates the lock file too).
2. `npm test`: the whole suite, all six projects and the timing tests. It must pass.
3. Commit (the build included) and push to `master`; wait for CI to pass.
4. `npm run release` checks that the tree is clean and on `master`, that the version is in
   `CHANGELOG.md`, that the tag is new, and that a fresh build equals the committed file. It then prints
   what it would do.
5. `npm run release -- --publish` does it: a signed tag (`git tag -s vX.Y.Z`), pushed, and a GitHub
   Release (`gh release create`) with the file attached and that version's changelog section as notes.

The version shows in the app at the end of the Help tab; `build.mjs` takes it from `package.json`.

Repository settings that the files rely on: **private vulnerability reporting** on (SECURITY.md points
to it: `gh api -X PUT repos/daizerius/modest-text/private-vulnerability-reporting`), Issues on, and the
description and topics as in `package.json`.

## Compatibility

The oldest browsers are set by the page's loader, which unpacks the bundle with
`DecompressionStream('deflate-raw')`: **Chrome/Edge/Brave 103, Firefox 113, Safari 16.4**. Anything
newer the code uses is checked before use (`showPicker`, `requestIdleCallback`, Web Locks, the Keyboard
Map API). `build.mjs` targets exactly those three versions.

- **Oldest systems:** Windows 7 and 8.1 and macOS 10.12 to 10.14, with Firefox 115 ESR (or the last
  Chrome they ran: 109 on Windows, 116 on macOS 10.13 and later; neither is updated any more).
  Safari 16.4 needs macOS 11 or later.
- **Apple Silicon and Intel:** nothing in the page depends on the processor. Only speed can differ,
  and only `perf.spec.js` measures it; its limits were set on an Intel Mac. The macOS CI runner is
  Apple Silicon.
- **Not checked by hand:** Windows (CI only), Linux (not in CI), and browsers older than current.

## Known issues

- **`tests/autosave.spec.js` (3d) sometimes loses the text in Firefox on the Windows runner**
  (`firefox-file`); it passes there too, and has never failed locally. When it fails, the test says
  whether the text arrives late or never (it reopens the page for 10 s): read that before guessing.
  Leaving the page before closing it, which fixed the same failure in WebKit, did not fix it here.
  A `pagehide` marker written from an init script is no help in Firefox: it is missing even when the
  text is kept.
- **`tests/editor.spec.js` (each tab keeps its cursor) sometimes finds the cursor one character short**
  of the end after a tab switch made right after typing: twice, both in a full run in `chromium-http`.
  Unexplained. A guess to test: CodeMirror read the last keystroke before the browser moved the
  selection, and the tab kept that state.
- **Firefox over http once did not become ready within 8 s** at the start of a test (export 7a), in a
  full run; it did not happen again in 172 page opens (40 alone, 132 under load). Unexplained. If it
  recurs, test the persistent-storage request first (`navigator.storage.persist()`, which Firefox turns
  into a question to the user): compare runs with the call stubbed out and with it.
- **On the macOS runner, `python3 -m http.server` once never answered** in `load.spec.js` ("also works
  when served by python3"). The test reports what the server printed; read that on the next macOS run.
- **Safari may erase the notes** of a site not opened for 7 days of Safari use (part of its tracking
  prevention). Not verified for a copy opened from disk (`file://`). The app asks for persistent
  storage, and Help, README and ABOUT tell Safari users to open it weekly and keep Export All current.

## Planned work

Ideas and planned features are tracked as [GitHub Issues](https://github.com/daizerius/modest-text/issues),
not in this file. This file keeps what a contributor needs while working: traps, conventions and known
issues with the tests.
