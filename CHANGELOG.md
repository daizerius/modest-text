# Changelog

All notable changes to Modest Text are listed here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-09-29

The first public release: a text and Markdown editor in one HTML file, with nothing to install and
nothing sent anywhere.

### Notes and tabs

- Each note is a tab, in plain text or in Markdown; switch a tab between the two at any time without
  losing its text, cursor or undo history.
- New tabs are named "Untitled 1", "Untitled 2"…; a tab that still has that name takes its name from
  its first heading (`# Project plan` → "Project plan"), until you rename it yourself.
- Rename by double-click or `F2`, reorder by drag or from the keyboard, close with `×`; names are
  cleaned (no `/ : * ? " < > |`, no reserved Windows names) and kept unique.
- Reopen the last closed tab, with its text, mode and place (the last three are kept).
- Each tab keeps its own cursor, selection, scroll position and undo history; scroll positions survive
  a reload.
- A menu lists every tab once the tab strip overflows.

### Writing

- Lists and quotes continue on `Enter` (bullets, numbers, tasks, `>`), in both modes; an empty item
  ends the list or moves a nested item up; `Backspace` after a marker removes it whole; `Tab` /
  `Shift+Tab` indent and outdent list items.
- Numbered lists renumber themselves after every edit that touches them.
- Moving a line (`Alt+↑` / `Alt+↓`) moves a list item with its sub-items, keeping its level.
- Duplicate, delete and select a line; a new line below or above without splitting the current one.
- Typing a quote or bracket over selected text encloses it; pasting a web address over selected text
  makes a link.
- Paste is always plain text: invisible control characters are removed; non-breaking spaces and
  emoji are kept.
- `- []` and `- [  ]` are corrected to the standard task mark `- [ ]`.

### Markdown

- Renders in place as you type (headings 1–6, bold, italic, strikethrough, highlight, inline code,
  code blocks, quotes, nested lists, task lists, links, rules), and shows the syntax only on the line
  you are editing. The text itself is never rewritten.
- Click a task box to check or uncheck it (undoable). On an empty task, the cursor sits where the text
  will go.
- List items keep a hanging indent: every line of an item starts where its text starts.
- Links open in a new browser tab with `Cmd`/`Ctrl`+click; images are never loaded; raw HTML is shown
  as text, never run.
- Stays fast with a 1 MB note.

### Formatting

- A formatting bar under the tabs: bold, italic, strikethrough, highlight, inline code, link, headings
  1–3, bullet, numbered and task lists, quote, code block and horizontal rule, in both modes. Buttons
  show which formats apply at the cursor, and pressing one again removes it.
- Without a selection, inline formats and links take the word at the cursor.
- A keyboard shortcut for every format, including headings 4–6 and lists on `Shift+Cmd`/`Ctrl` with
  `8`, `7`, `9` as in Word and Google Docs.

### Find

- Find in the current tab (`Cmd`/`Ctrl+F`), with every match highlighted, a count ("3 of 12"),
  next / previous (`Cmd`/`Ctrl+G`, `Enter`, and `F3` on Windows).

### Saving and backup

- Every change is saved in the browser by itself: half a second after typing stops, and on switching
  tabs, windows or apps, and closing the page. `Cmd`/`Ctrl+S` saves at once and shows a short
  confirmation, after checking that the save worked.
- The status bar shows the save state (with a green or red dot) and when the last full export ran.
- **Export** downloads a tab as a `.txt` or `.md` file (UTF-8, LF); **Export All** downloads every tab
  in one ZIP, the backup; **Import** opens `.txt` and `.md` files as new tabs (by button or by dropping
  them on the window), converting older encodings (UTF-16, Windows-1252) to UTF-8.
- Closing the page with notes changed since the last full export asks first, with the browser's own
  "Leave site?" box.
- Storage alerts: amber when nearly full; a red banner with Export All when full. While storage is
  full, your text stays in the page, and Export All still has it.
- Several windows: one edits, the others are read-only and follow along live; one click hands over
  editing. If two saves ever collide, both texts are kept (a "(conflict)" tab).
- The app asks the browser to keep its storage persistently.

### Keyboard

- Every control can be reached from the keyboard, and every shortcut is listed in one sheet
  (`Cmd`/`Ctrl+/`), grouped, in the platform's own key names (`⇧⌘Z` on a Mac, `Ctrl+Shift+Z` on
  Windows).
- Shortcuts to import, export, export all, close the current tab and reopen the last one, switch
  tabs, and jump to the bar under the tabs (`Cmd`/`Ctrl+J`).
- Works on every keyboard layout. Punctuation and digit shortcuts go by the key's position, so they
  are the same keys on AZERTY, QWERTZ or Canadian French, labelled with what your keyboard prints.
- Letter shortcuts follow the letter; on layouts without Latin letters (Russian, Greek) they go by the
  key's position. Caps Lock does not change what a shortcut does.

### Interface

- Light and dark themes (Nord), following the system until you choose.
- English and French throughout, including Help and the shortcut sheet.
- Fonts: one for Markdown text and one monospace for plain text and code, each previewed in its own
  font; fonts that are not installed are greyed out. Six text sizes, word wrap, and a centred reading
  width.
- A Help tab, opened at first launch, showing the app's own buttons and icons.
- Fits one row from 800 px wide, and stays usable down to 500 px.
- Accessible: WCAG AA contrast in both themes, a tooltip and a screen-reader name on every control,
  a visible keyboard focus, and states that do not rely on colour alone.

### Privacy and security

- One self-contained file that makes no network request: a Content-Security-Policy forbids them, and
  only the page's own two scripts, identified by hash, may run.
- Notes stay in the browser, on the computer.

### Compatibility

- Chrome, Edge or Brave 103 or newer, Firefox 113 or newer, Safari 16.4 or newer, on macOS and
  Windows; opened from disk or from any web server.

[1.0.0]: https://github.com/daizerius/modest-text/releases/tag/v1.0.0
