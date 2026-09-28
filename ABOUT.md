# About Modest Text

What the app is and how to start are in the [README](README.md). This page is the why: what it
holds to, how it is built, where it stops, and who and what it builds on.

It is a small tool that tries to do a few things well, which is where the name comes from. It is not
a document manager, a sync service, a word processor or a code editor.

---

## Philosophy

**Plain text is the source of truth.** Markdown mode renders headings, emphasis, lists, quotes,
code and links as you write, and reveals the syntax only on the line the cursor is on. The text itself
is never rewritten: an exported `.md` file is byte for byte what you typed.

**Never lose text.**

- The app saves by itself: half a second after you stop typing, and whenever you switch tabs, windows
  or apps, or close the page. `⌘S` / `Ctrl+S` saves at once and confirms it.
- A failed save is shown (a red dot and a red banner) and tried again. Export All always has your
  latest text, saved or not.
- The status bar shows when you last used Export All. Closing the page with notes changed since then
  asks first, in the browser's own "Leave site?" box.
- A failed load never overwrites what is stored.
- Two windows never overwrite each other: one edits, the others are read-only and follow along. If
  two saves ever collide, the other text is kept in a new "(conflict)" tab.

**The keyboard reaches everything.** Every button has a shortcut or is reachable with arrows from the
text (`⌘J` / `Ctrl+J`), and every shortcut is listed in one sheet (`⌘/` / `Ctrl+/`). Shortcuts follow
four rules, in this order of priority:

1. *Physical keys.* Punctuation and digit shortcuts go by the key's position, so they are the same
   keys on every keyboard layout, and their labels show what the key prints on your keyboard. Letters
   are the exception: `⌘Z` is wherever Z is printed, as in every app. On a layout without Latin letters
   (Russian, Greek), letters go by position too.
2. *The same on every system.* An action has the same keys on a Mac and on Windows, changed only where
   the system differs (`⌘` for `Ctrl`, `⌥` for `Alt`, `Ctrl+Y` for redo on Windows). Each system's own
   names are shown: `⇧⌘Z` on a Mac, `Ctrl+Shift+Z` on Windows.
3. *Logical.* Related actions share a key, and `Shift` reverses or extends: `⌘E` is inline code and
   `⇧⌘E` a code block; `⌘↩` adds a line below and `⇧⌘↩` one above.
4. *Familiar.* Where a widely used app already has a key for the same action, it is used — unless the
   browser keeps that key for itself.

The full list, and the reason for each key, is in [keyboard-shortcuts.md](keyboard-shortcuts.md).

**Bilingual.** Every word of the interface, the Help page and the shortcut sheet exists in English and
French.

**Accessible.** Text meets WCAG AA contrast in both themes; every control has a tooltip and a name
for screen readers, a visible keyboard focus, and states that do not rely on colour alone.

**Quiet.** Flat surfaces, thin borders, small radii, the Nord palette in a light and a dark theme.
The interface tries to stay out of the text's way.

---

## Design decisions

- **One self-contained file.** `modest-text.html` holds the whole app. It works opened straight
  from disk (`file://`) or served from any web server, in current Chrome, Edge, Brave, Firefox and
  Safari.
- **No network, enforced.** A Content-Security-Policy in the page forbids every request: no CDN, no
  web font, no analytics, no remote image. The only scripts allowed to run are identified by hash —
  a small loader and the app itself — so nothing else can run in the page, not even something pasted
  into it.
- **Compressed, and still checked.** The app's code is stored compressed inside the page (about
  225 KB for the whole file). The loader unpacks it with the browser's own decompression and runs it
  only if its hash matches the one in the policy.
- **Browser storage, not files.** Notes live in the browser's `localStorage`. It works on `file://`
  in every browser, and it saves at once, even while the page is closing. Each tab has its own entry,
  so a damaged entry affects only that tab, and a save never rewrites everything.
- **CodeMirror 6 for editing**, one editor state per tab: each tab keeps its own undo history, cursor,
  selection and scroll position.
- **One editing window at a time.** The browser's Web Locks decide which window edits (with a
  fallback where they are missing), and every note carries a revision number, so that no save can
  overwrite a newer one.
- **Help is a page, not a note.** It is generated in the interface language, shows copies of the real
  buttons, and is searched with the browser's own find.
- **Tested in three engines.** The Playwright suite runs in Chromium, Firefox and WebKit (Safari's
  engine), each from disk and over HTTP: over 900 test runs in a full pass. Continuous integration
  adds Windows.

---

## Limits

Some are deliberate, some come with the browser. Know them before you rely on the app.

- **Your notes live in one browser on one computer.** They are not synced. Another browser, another
  computer, a private window, or a "clear browsing data on exit" setting will not show them. Opened
  from disk, moving or renaming the HTML file can show an empty workspace (the notes are still stored
  under the old location). **Export All is the backup**: import its files to restore them.
- **About 5 MB of browser storage for all your notes.** That is the browser's allowance for a page's
  storage (`localStorage`); the app itself is a 225 KB file and takes none of it. Opened from disk in
  Chrome, the 5 MB are shared with every other local HTML file you open. The app warns at 4 MB (amber)
  and when storage is full (red).
- **Imports up to 1 MB per file**, `.txt` and `.md` only. Other encodings are converted to UTF-8.
- **No printing.** The editor lays out only the visible part of a note, so a print would be a
  fragment; `⌘P` / `Ctrl+P` explains this and suggests exporting and printing from another app.
- **Out of scope:** replace (find is there), line numbers, syntax highlighting, multiple cursors,
  tables, images, raw HTML, cloud sync.
- **Browsers:** Chrome, Edge or Brave 103 or newer, Firefox 113 or newer, Safari 16.4 or newer. On
  older systems: Firefox 115 ESR runs on Windows 7 and 8.1 and on macOS 10.12 to 10.14; Safari 16.4
  needs macOS 11 or later.
- **Not yet tested:** phones and tablets; Windows by hand (automated tests cover it); keyboard layouts
  in non-Latin scripts on a real keyboard (simulated in the tests).
- **Safari may erase the notes of a page left unopened for 7 days of Safari use** (part of its
  tracking prevention). It is not known yet whether this also applies to a copy opened from disk. In
  Safari, open the app at least once a week, and keep Export All current. The app asks every browser
  to keep its storage; Firefox may ask you to allow it.
- **A crash can cost the last half-second of typing.** The browser writes a page's changes to disk a
  moment later, and a page cannot hurry it. A normal close always leaves time; a crash or a force-quit
  may not.

---

## Credits

**Inspiration.** [Sublime Text](https://www.sublimetext.com/) for the feel of a fast, quiet editor
with tabs, and [Typora](https://typora.io/) for Markdown that renders in place and shows its syntax
only where you are writing.

**Code in the app.** Every bundled library is by **Marijn Haverbeke** and MIT-licensed:
[CodeMirror 6](https://codemirror.net/) (`@codemirror/view`, `state`, `commands`, `language`),
[Lezer](https://lezer.codemirror.net/) (`@lezer/common`, `highlight`, `markdown`), and the small
helpers `style-mod`, `w3c-keyname`, `crelt` and `@marijn/find-cluster-break`. Their license notices
are kept, readable, inside the HTML file.

**Colours.** The [Nord](https://www.nordtheme.com/) palette by Arctic Ice Studio and Sven Greb.

**Tools.** [esbuild](https://esbuild.github.io/) bundles the app; [Playwright](https://playwright.dev/)
runs the tests in three browser engines; [Node.js](https://nodejs.org/) runs both.

**Making of.** Designed and directed by Desa Phanalasy ([daizerius](https://github.com/daizerius)), who
set the requirements, reviewed every change and tested it by hand. Written with
[Claude](https://www.anthropic.com/claude) (Anthropic) in Claude Code as the programming partner.

**License.** Modest Text is under the [MIT License](LICENSE), the license of every library it
bundles.
