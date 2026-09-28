# Modest Text

A text editor in a single HTML file: plain-text notes, or Markdown with a live preview, in tabs that
save themselves as you type. Nothing to install, no account, and nothing sent anywhere.

What the app is, the thinking behind it and where it stops are in **[ABOUT.md](ABOUT.md)**: start
there for the introduction and the philosophy. This page is the practical side.

![Modest Text with three tabs: a Markdown note rendered in place, with headings, a task list, a numbered
list, a quote and inline code; the formatting bar above it and the status bar below.](docs/screenshot.png)

## What it does

- **Notes in tabs.** Each tab is a note, in plain text or in Markdown. Markdown renders headings,
  emphasis, lists, tasks, quotes, code and links as you write, and shows its syntax only on the line
  you are on.
- **Saves by itself.** Half a second after you stop typing, when you switch tab or app, and when you
  close the page. Every tab keeps its cursor, scroll position and undo history.
- **Files in and out.** Export a tab as `.txt` or `.md`, export every tab as one ZIP, import `.txt`
  and `.md` files as new tabs.
- **Keyboard first.** Every control can be reached from the keyboard, and every shortcut is listed in
  one sheet (`⌘/` on a Mac, `Ctrl+/` elsewhere). Shortcuts work on any keyboard layout.
- **English and French**, light and dark themes, and find in a tab. Open it in several windows: one
  edits, the others follow along, and none overwrites another's text.

## Why use it

Private by construction (the page may make no network request), no ceremony (no save dialog, no
folder to choose), hard to lose text, and one file that opens anywhere. The reasons, and what they
cost, are in [ABOUT.md](ABOUT.md#philosophy).

## Getting started

1. Download [`modest-text.html`](https://github.com/daizerius/modest-text/releases/latest/download/modest-text.html)
   from the [latest release](https://github.com/daizerius/modest-text/releases/latest).
2. Open it in your browser: double-click it, or drag it onto a browser window.
3. The first time, the **Help** tab opens. It explains everything, showing the app's own buttons.
4. Close the Help tab, press **+** for a new tab, and write.

**Before you rely on it**, know where your notes are: in this browser, on this computer, tied to the
file's location. Another browser, a private window, "clear data on exit", or moving or renaming the
HTML file will show an empty workspace. The browser keeps about 5 MB for all your notes. **Export
All is your backup**: it downloads every tab in one ZIP, and importing its files brings them back. Its
tooltip and the status bar say when it last ran, and closing the page with notes changed since asks
first. **In Safari**, open the app at least once a week: Safari may erase the storage of a page left
unopened for 7 days of use. The full list of limits is in [ABOUT.md](ABOUT.md#limits).

### Requirements

Chrome, Edge or Brave 103 or newer, Firefox 113 or newer, or Safari 16.4 or newer, on macOS or
Windows. Phones and tablets are not supported yet.

## Getting help

- **In the app:** the Help tab (`F1`) and the shortcut sheet (`⌘/`, `Ctrl+/`).
- **Something wrong, or an idea?** [Open an issue](https://github.com/daizerius/modest-text/issues).

## Development

The app is built from the sources in [`src/`](src) into the one committed file,
`modest-text.html`. You need [Node.js](https://nodejs.org/) 24.

```sh
npm ci                            # once: esbuild and Playwright
npx playwright install chromium firefox webkit
node build.mjs                    # writes modest-text.html
npm test                          # build, then the whole test suite
```

The suite runs in Chromium, Firefox and WebKit, each from disk and over HTTP. Continuous integration
runs it on Windows for every push and pull request to `master` that changes code.

### Documentation

| File | What it is |
|---|---|
| [ABOUT.md](ABOUT.md) | Purpose, philosophy, design decisions, limits and credits |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each version |
| [specs.md](specs.md) | The living specification: what the app does, in detail |
| [keyboard-shortcuts.md](keyboard-shortcuts.md) | Every shortcut, and the reasoning behind each |
| [qa-checklist.md](qa-checklist.md) | What to check by hand before calling a build done |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to report a problem or propose a change |
| [SECURITY.md](SECURITY.md) | How to report a vulnerability privately |
| [AGENTS.md](AGENTS.md) | Working notes for anyone, or any coding agent, changing the code; how to release |

## Who makes it

Designed and maintained by Desa Phanalasy ([daizerius](https://github.com/daizerius)), written with
[Claude](https://www.anthropic.com/claude) in Claude Code. The libraries, inspirations and tools it
owes to are credited in [ABOUT.md](ABOUT.md#credits).

## License

[MIT](LICENSE), like the libraries it bundles.
