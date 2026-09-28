# Keyboard shortcuts

Every shortcut in Modest Text, and why it is on the key it is on. The shortcut sheet in the app
(`⌘/` on a Mac, `Ctrl+/` on Windows) is always the complete, current list.

On a Mac the app writes keys with the menu symbols: `⌃` Control, `⌥` Option, `⇧` Shift, `⌘` Command,
`↩` Return, `⌫` delete. On Windows it writes `Ctrl`, `Alt`, `Shift`. The tables below give both.

## The rules

In order of priority:

1. **Physical keys.** Punctuation and digit shortcuts go by the key's position, so they are the same
   keys on every keyboard layout. Their labels show what that key prints on the user's keyboard.
2. **The same on every system.** An action has the same keys on a Mac and on Windows, changed only
   where the system itself differs (`⌘` for `Ctrl`, `⌥` for `Alt`, `Ctrl+Y` for redo on Windows).
3. **Logical.** Related actions share a key, and `Shift` reverses or extends: `⌘E` is inline code,
   `⇧⌘E` a code block; `⌘G` is the next match, `⇧⌘G` the previous one; `⌘↩` adds a line below, `⇧⌘↩`
   one above.
4. **Familiar.** Where a widely used app already has a key for the same action, it is used — unless
   the browser keeps that key for itself.

**One deliberate exception to rule 1: letters.** Letter shortcuts follow the letter printed on the key
(`⌘Z` is wherever Z is), as in every app. On a layout without Latin letters (Russian, Greek, Hebrew),
they fall back to the key's position, so they still work.

## How the app recognises a key

A key press tells the page three things:

| Field | What it is | Example: the key right of `P` |
|---|---|---|
| `event.code` | The physical key, named after its US position. The same on every layout. | `BracketLeft` |
| `event.key` | The character the layout prints, after modifiers. | `[` on US, `^` on French, `ü` on German |
| `event.keyCode` | Legacy; on macOS and Windows it usually follows the US position. | `219` |

- **Punctuation and digits** (`,` `.` `/` `[` `]` `-`, and `1`–`9` for headings and lists) are matched on
  `event.code`, in a handler that runs before the editor's keymap (`src/editor.js`, `src/main.js`,
  `src/keys.js`). A dead key — French `^`, for example — reports `event.key` as `"Dead"`, and only
  `event.code` still says which key it was.
- **Letters** are matched on `event.key`, falling back to the key's position when `event.key` is not a
  Latin letter (`charKey` in `src/keys.js`). CodeMirror's keymap, used for formatting, has the same
  fallback.
- **Caps Lock**: with Shift and Caps Lock both on, a letter arrives in lower case. The editor treats it
  as the capital letter Shift alone sends, so `⇧⌘Z` stays redo.
- **Labels** follow the keyboard: Chrome, Edge and Brave report the layout
  (`navigator.keyboard.getLayoutMap()`), and the punctuation keys are named as they print — `⌘$` and
  `⌘^` for indent and outdent on French AZERTY. Firefox and Safari do not report it, and show the US
  names.
- **Dvorak and Colemak** users find the punctuation shortcuts where the US characters would be, not
  where their own layout prints them. VS Code and other editors make the same choice.

## The shortcuts

### Reaching the controls and the tabs

| Action | Mac | Windows | Why these keys |
|---|---|---|---|
| To the bar under the tabs, and back | `⌘J` | `Ctrl+J` | "Jump"; on Windows it overrides the browser's Downloads |
| Between the bars | `↑` `↓` | `↑` `↓` | Toolbar convention (WAI-ARIA) |
| Within a bar | `←` `→`, `Home` `End` | the same | Toolbar convention |
| Next / previous group (bar under the tabs) | `Tab` / `⇧Tab` | `Tab` / `Shift+Tab` | Toolbar convention |
| Back to the text | `Esc` | `Esc` | |
| On a tab: open, rename, close, move | `↩`, `F2` or `R`, `X` or `⌫`, `V` | `Enter`, `F2` or `R`, `X` or `Delete`, `V` | `F2` renames in Windows and VS Code; `⌫` is the Mac's delete key |
| New tab, reopen the last closed tab (in the tabs) | `N`, `U` | `N`, `U` | Single letters where typing does not go |
| Close the tab you are in | `⌃⌘W` | `Alt+W` | `⌘W` / `Ctrl+W` belong to the browser |
| Reopen the last closed tab | `⌃⌘U` | `Alt+U` | `⇧⌘T` / `Ctrl+Shift+T` belong to the browser |
| Previous / next tab | `⇧⌘,` `⇧⌘.` or `⌃⌘,` `⌃⌘.` | `Ctrl+Shift+,` `.`, `Ctrl+,` `.`, or `Ctrl+PageUp` `PageDown` | `⇧⌘[` `]` would clash with indent; `Ctrl+PageUp` / `PageDown` is the Windows habit |

### Formatting (plain-text and Markdown tabs)

| Action | Mac | Windows | Why these keys |
|---|---|---|---|
| Bold, italic, link | `⌘B`, `⌘I`, `⌘K` | `Ctrl+B`, `Ctrl+I`, `Ctrl+K` | Used everywhere |
| Strikethrough | `⇧⌘X` | `Ctrl+Shift+X` | As in Typora and Obsidian |
| Highlight | `⇧⌘H` | `Ctrl+Shift+H` | `⌘H` hides the app on a Mac |
| Inline code, code block | `⌘E`, `⇧⌘E` | `Ctrl+E`, `Ctrl+Shift+E` | A pair: `Shift` makes it a block |
| Headings 1 to 6 | `⌥⌘1` to `⌥⌘6` | `Ctrl+Shift+1` to `Ctrl+Shift+6` | As in Google Docs (Mac); `Ctrl+Alt` is AltGr on Windows; by position |
| Bullet, numbered, task list | `⇧⌘L`, `⇧⌘O`, `⇧⌘A`, or `⇧⌘8`, `⇧⌘7`, `⇧⌘9` | `Ctrl+Shift+` the same letters and digits | The digits as in Word and Google Docs, by position |
| Quote | `⇧⌘C` | `Ctrl+Shift+C` | |
| Horizontal rule | `⇧⌘-` | `Ctrl+Shift+-` | The key that types `---`, by position |
| Check / uncheck a task | `⌘↩` | `Ctrl+Enter` | As in Obsidian and Typora |
| Plain text / Markdown | `⇧⌘M` | `Ctrl+Shift+M` | "Markdown" |

### Files

| Action | Mac | Windows | Why these keys |
|---|---|---|---|
| Import | `⌘O` | `Ctrl+O` | Open |
| Export the tab | `⇧⌘S` | `Ctrl+Shift+S` | Save As |
| Export All | `⌥⌘S` | `Alt+Shift+S` | Save All; `Ctrl+Alt+S` types a letter on some Windows layouts (AltGr) |

### Editing

| Action | Mac | Windows | Why these keys |
|---|---|---|---|
| Undo, redo | `⌘Z`, `⇧⌘Z` | `Ctrl+Z`, `Ctrl+Y` or `Ctrl+Shift+Z` | Each system's own |
| Save now | `⌘S` | `Ctrl+S` | Saving is automatic; this saves at once and says so |
| Find, next / previous match | `⌘F`, `⌘G` / `⇧⌘G` | `Ctrl+F`, `Ctrl+G` / `Ctrl+Shift+G` or `F3` / `Shift+F3` | Each system's own |
| Move, duplicate the line | `⌥↑` `⌥↓`, `⌥⇧↑` `⌥⇧↓` | `Alt+↑` `↓`, `Alt+Shift+↑` `↓` | As in VS Code |
| New line below, above | `⌘↩`, `⇧⌘↩` | `Ctrl+Enter`, `Ctrl+Shift+Enter` | As in VS Code and Sublime Text |
| Delete the line | `⇧⌘K` | `Ctrl+Shift+K` | As in VS Code |
| Select the line | `⌘L` | `Alt+L` | `⌘L` as in VS Code; on Windows `Ctrl+L` stays the address bar |
| Indent, outdent the line | `⌘]`, `⌘[` | `Ctrl+]`, `Ctrl+[` | As in VS Code and Xcode, by position |
| Printing (explains why it is not available) | `⌘P` | `Ctrl+P` | |
| The shortcut sheet | `⌘/` | `Ctrl+/` | As in Google Docs and Slack, by position |
| Help | `F1` or `⇧⌘I` | `F1` or `Ctrl+Shift+I` | |

### Writing

| Action | Keys |
|---|---|
| Indent / outdent a list item; elsewhere, insert a tab | `Tab` / `Shift+Tab` |
| Continue a list or a quote; end it on an empty item | `Return` / `Enter` |
| Remove a list mark or `>` at once | `Backspace` right after it |
| Put a pair of quotes or brackets around the selection | `"` `‘` `(` `[` `{` with text selected |

## Keys the app cannot have

The browsers keep these for themselves, whatever a page does: `⌘W` / `Ctrl+W`, `⇧⌘T` / `Ctrl+Shift+T`,
`⌘T`, `⌘N`, `⌘1`–`⌘9`, `Ctrl+Tab`. On Windows, `Ctrl+L` is left to the address bar.

## Browser commands the app overrides

While the app has the focus, its shortcuts win over these browser commands: tab search (`⇧⌘A`, Chrome),
the Add-ons manager (`Ctrl+Shift+A`, Firefox), the bookmark manager (`Ctrl+Shift+O`), Downloads
(`Ctrl+J`, Windows), the address bar (`⌘L`, Mac), Open (`⌘O` / `Ctrl+O`), Save Page (`⌘S` / `Ctrl+S`),
the screenshot tool (`Ctrl+Shift+S`, Firefox) and View Source (`⌘U` / `Ctrl+U`, which does nothing
here).

On Windows, the developer-tools keys — `Ctrl+Shift+I`, `Ctrl+Shift+C`, and in Firefox `Ctrl+Shift+K`,
`Ctrl+Shift+E`, `Ctrl+Shift+M` — are claimed too, but a browser may handle them before the page sees
them. [QA-CHECKLIST.md](QA-CHECKLIST.md) (§7.6) asks testers to note which.

Every key the app binds is claimed in every state: a shortcut that works only sometimes lets the
browser's own command answer the other times, which is worse than never taking the key.
