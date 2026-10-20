# Changelog

All notable changes to Modest Text are listed here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Erase all local data**, at the end of Help's "Where are my notes?": after a warning, whose
  default is Export All first (never Erase), it deletes every note, closed tab and setting the app
  keeps in this browser, in every open window of it. Only the editing window can do it. Each choice
  ends with a short message saying what happened, in the middle of the window; Erase everything says
  so for a second before it erases. (#2)
- The status bar shows "Modest Text" and the version, centred; it is the first thing to go, whole,
  when the bar runs short. (#3)
- In Markdown tabs, bare addresses are links: `https://…` and `www.…` (opened as https://), ending
  before trailing punctuation. Plain-text tabs keep them as text. (#11)
- Two On/Off buttons in Help, under the line on links. **Links**, on by default: turned off, links in
  Markdown tabs still look like links but do not open. **E-mail addresses as links**, off by default:
  turned on, `name@example.com` is a link too, and `mailto:` links open.

### Changed

- A link around a highlight keeps a readable underline: the highlight draws it in the same blue as a
  link inside one, over the accent colour the yellow hid.
- In Markdown tabs, a link shows its brackets and address only while the cursor is in the link, not
  anywhere on its line, so the line no longer jumps as the cursor moves along it.
- Tooltips start with the shortcut, in this system's key names and as this keyboard prints them
  ("⌘B · Bold"); Help and Reopen closed tab now show theirs too.
- The shortcut sheet opens with Help and the sheet itself, has a Tabs section of its own, lists
  checking a task next to the task list, and ends with Files.
- A link's brackets, parentheses and address each have a colour of their own, in plain-text and
  Markdown tabs.
- Headings, bold and italic are subtly coloured in plain-text and Markdown tabs; in plain-text tabs,
  highlighted text has a soft tint and inline code a colour of its own. In a Markdown highlight, a link
  reads in the dark text colour instead of light blue on yellow, with a saturated blue underline that
  stays on the yellow; code in a highlight keeps dark text.
- The shortcut sheet is a little larger and wider, with every other row shaded; a long description
  breaks between its clauses, and keys named in it (moving a tab with `←` / `→`) look like keys.
- The Help page is centred, as its reading-width tooltip always said.
- The page opens in the dark theme and turns light, with a quick fade, once it has started: a dark
  flash instead of a white one on slow starts. (#1)

### Fixed

- Every combination of formats now reads at WCAG AA in both themes, checked by a test over all of
  them:
  - Find matches have solid tints, one text colour and an outline; the current match is dark text on
    amber (in the dark theme it was 3.6:1).
  - Selected text takes the main text colour (syntax colours fell to 1.7–4.4:1 on the selection).
  - Struck-out text in a highlight, and code inside links, headings or struck-out text, read in full.
  - List bullets are a darker blue in the light theme.
  - With colour blindness too: the colours keep 4.5:1 as protanopia and deuteranopia see them (the
    dark highlight tint is darker), and in the light theme a highlight has an edge, as the yellow and
    the page are close in lightness.
- "Save failed" shows a red cross instead of the red dot, in the status bar and on the tab, so it
  differs from "Unsaved" by shape and not by colour alone.
- A second window opened on a new workspace (or reloaded with the first by Erase all local data) shows
  Help, as the first does, instead of an "Untitled 1" tab of its own. Until a note is written, a reload
  opens on Help again.
- Pasting an address into the `https://` placeholder of `⌘K` / `Ctrl+K` no longer nests a second
  link; the address goes in trimmed and the cursor moves past the link. (#15)

### Documentation

- Help has a short line for Erase all local data: "To delete all your notes and reset the app:"
  and the button.
- Help, in English and French, opens with a short warning: in Chrome, Edge and Brave, any HTML file
  opened from disk can read, change or erase the notes, with a link to "Where are my notes?".
- ABOUT and SECURITY now say that notes are not private from other pages sharing the browser's
  storage: opened from disk in Chrome, Edge or Brave, any local HTML file can read, change or erase
  them. Firefox keeps each file apart. Serving the app from its own address avoids it.

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
