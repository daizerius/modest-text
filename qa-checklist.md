# Modest Text — manual QA checklist

For testers. Work through the sections that apply to your setup. You do **not** need to do every
environment — see §0 for who does what.

**How to report.** For each failure give: your environment line (§0), the section number, what you did, what
you expected, what happened. A screenshot helps for anything visual. If the browser console has an error
(`F12` → Console), paste it — a console error is a bug even if the app looks fine.

**Before you start:** open the file, and in the Help tab read "Where are my notes?". Your notes live only in
that browser on that machine. Use **Export All** before any test that might lose them.

---

## 0. Environments

The app must work in **Chrome, Firefox and Safari, and in Chromium browsers such as Edge and Brave, on
macOS and Windows**, opened two ways. The oldest versions are Chrome/Edge/Brave 103, Firefox 113 and
Safari 16.4. This is a **desktop** application: phones, tablets and touch are out of scope — if you try
them, label the report clearly as out of scope. The supported layout floor is **800 px wide**; narrower windows
should still not break, but they are not a target.

### The two ways of opening it

| # | Setup | How |
|---|---|---|
| **A** | **From disk** (the main case) | Double-click `modest-text.html`, or drag it onto the browser. The address bar starts with `file://`. |
| **B** | **From a web server** | In a terminal, in the folder holding the file: `python3 -m http.server 8000`, then open `http://localhost:8000/modest-text.html`. |

A and B keep **separate notes**. That is correct, not a bug.

### The matrix

Please state your line exactly like this in every report:

> `macOS 15.6 · Firefox 142 · file:// · French AZERTY · dark · FR`

| Slot | Values |
|---|---|
| OS | macOS / Windows 11 / Windows 10 |
| Browser | Chrome / Firefox / Safari / Edge / Brave, with version |
| Setup | `file://` / `http://` |
| Keyboard layout | US QWERTY / French AZERTY / German QWERTZ / Canadian French / other |
| Theme | light / dark |
| Interface language | EN / FR |

**Minimum coverage we need.** Each of these at least once:

- [ ] macOS · Chrome · file://
- [ ] macOS · Chrome · http://
- [ ] macOS · Firefox · file://
- [ ] macOS · Firefox · http://
- [ ] Windows · Chrome · file://
- [ ] Windows · Chrome · http://
- [ ] Windows · Firefox · file://
- [ ] Windows · Firefox · http://
- [ ] macOS · Safari · file://
- [ ] At least one tester on **French AZERTY** (§7 matters most)
- [ ] At least one tester on **German QWERTZ** or **Canadian French**
- [ ] At least one tester with a **Russian or Greek** layout (§7.5.10)

Throughout: `Mod` means **`Cmd`** on macOS and **`Ctrl`** on Windows. On a Mac the app itself writes keys
with the menu symbols — `⌃` Control, `⌥` Option, `⇧` Shift, `⌘` Command, `↩` Return, `⌫` delete — for
example `⇧⌘Z`; on Windows it writes `Ctrl+Shift+Z`.

---

## 1. First launch

Use a browser profile that has never opened the app, or clear its storage first.

- [ ] 1.1 The **Help** tab opens by itself and is the active tab.
- [ ] 1.2 Help is readable: headings, lists, and **small pictures of the app's own buttons** inside the
      text (the import arrow, the theme moon, `B`, `H1`…). Those pictures should match the real buttons.
- [ ] 1.3 The text of Help sits in a **narrow centred column**, not spread across the whole window.
- [ ] 1.4 Help cannot be typed into. The status bar says `Help · read-only`, with no dot and no date.
- [ ] 1.5 No console errors (`F12` → Console) — **check this on every environment**.
- [ ] 1.6 Nothing loads from the network. `F12` → Network → reload: the only entry is the page itself.
      **No** fonts, images, scripts or trackers from anywhere else.
- [ ] 1.7 The **?** button (last in the top bar) reopens Help, then focuses it if it is already open. The
      title **Modest Text** is plain text, not a button — clicking it does nothing.
- [ ] 1.8 Closing Help and reloading does not bring it back. It is not in Export All either.

- [ ] 1.9 Help ends with the version: `Modest Text 1.0.0`.
- [ ] 1.10 **Firefox** asks once whether the page may store data persistently; allow it. Other browsers decide
      without asking.
---

## 2. Top bar

Left to right: title · Font ▾ · Size · **Wrap** · **Reading width** │ Import · Export · Export All │ theme ·
EN|FR │ Help.

- [ ] 2.1 **Font ▾** lists only the fonts that apply to the tab you are in: serif fonts in a Markdown tab,
      monospace fonts in a plain-text tab. The button shows the current one, drawn in that font.
- [ ] 2.2 Each option in the list is previewed **in its own font**.
- [ ] 2.3 Fonts that are not installed are **greyed out and unselectable**, tooltip "Not installed on this
      system". (On Windows, Menlo should be greyed; on macOS, Consolas and Verdana may be.)
- [ ] 2.4 **Size** changes the text size in both modes, and in Help too.
- [ ] 2.5 **Wrap** (the icon with the wrapping arrow) is **on** at first. Turn it off in a plain-text tab
      with a very long line: the line runs off to the right and the editor scrolls sideways.
- [ ] 2.6 In a **Markdown** tab, Wrap is **greyed out and shown as on**; the tooltip says Markdown always
      wraps.
- [ ] 2.7 **Reading width** (the icon with two rails) is **off** at first. Turn it on: the text becomes a
      **centred column**, with equal space left and right. Turn it off: full width again.
- [ ] 2.8 In a plain-text tab with **Wrap off**, Reading width is **greyed out**, tooltip "needs Wrap".
      Turn Wrap back on and it becomes available again.
- [ ] 2.9 Reading width in a Markdown tab gives roughly the same column as the Help page.
- [ ] 2.10 Font, Size, Wrap and Reading width are **global**: they apply to every tab, and survive a reload.
- [ ] 2.11 There is **no "Spelling" setting**: spell check is the browser's (see §5.6).
- [ ] 2.12 Every control has a tooltip (hover) and the tooltip is in the interface language.

---

## 3. Tabs

- [ ] 3.1 `+` adds a tab at the end, activates it and puts the cursor in the text.
- [ ] 3.2 New tabs are named `Untitled 1`, `Untitled 2`… (`Sans titre 1`… in French), reusing the smallest
      free number.
- [ ] 3.3 Single click shows a tab; **double-click** opens the rename box, centred, with the name selected.
- [ ] 3.4 In the rename box, typing shows a **live preview** of the cleaned name. `Enter` confirms, `Esc`
      and clicking the backdrop cancel.
- [ ] 3.5 Rename cleaning: try `  a / b : c  `, `CON`, `name...`, a 200-character name, and an emoji name.
      Slashes and colons disappear, spaces collapse, `CON` becomes `_CON`, trailing dots go, long names are
      cut. An empty result is refused with a message.
- [ ] 3.6 Two tabs cannot share a name, ignoring case: renaming one to another's name gives ` (2)`.
- [ ] 3.7 **Drag** a tab to reorder. The `+` stays last. A drag must **not** activate or rename the tab.
- [ ] 3.8 `×` closes without asking. Closing the active tab activates its **right** neighbour, or its left
      if there is none. Closing the last one leaves one fresh empty tab.
- [ ] 3.9 The reopen button (↺, left of the tabs) brings back the last closed tab with its **text, name,
      mode and position**. Its tooltip names the tab it would reopen. It remembers **3** tabs. It is
      greyed out when there is nothing to reopen, and it never offers an empty tab or Help.
- [ ] 3.10 With many tabs, the strip **scrolls sideways**; the active tab scrolls into view; long names are
      cut with `…` and the full name is in the tooltip.
- [ ] 3.12 **Name from the first heading.** In a new tab (still called `Untitled 1`), type `# Project plan`
      then some text. Within about a second the tab renames itself to **Project plan**. Edit the heading and
      the name follows. Delete the heading and it goes back to `Untitled 1`. Now rename the tab by hand —
      from then on the heading must **not** change it again.
- [ ] 3.13 A heading further down the note (say line 30) must **not** rename anything. Only the first
      non-blank line, within the first 20, can.
- [ ] 3.14 An **imported** file keeps its filename as the tab name, whatever heading its text starts with.
- [ ] 3.15 **Reopens where you left it.** Scroll a long note to the middle, switch to another tab and back —
      same place. Reload the page — still the same place.
- [ ] 3.16 **All tabs in one menu.** Open enough tabs that the strip scrolls: a `⌄` button appears at its
      right. It lists every tab in order, ticks the active one, marks Markdown tabs `.md`, and shows a red
      dot on any tab with unsaved changes. Click one to open it. `↑` `↓` `Home` `End` then `Enter` do the
      same from the keyboard; `Esc` closes. Widen the window until the strip no longer scrolls — the button
      disappears.
- [ ] 3.11 The active tab is **unmistakable in both themes** — background, accent bar and bolder text, not
      colour alone.

---

## 4. Plain-text tabs

- [ ] 4.1 Typing, selecting, `Home` / `End` / `PageUp` / `PageDown`, and mouse selection all behave normally.
- [ ] 4.2 `Tab` inserts a real tab character.
- [ ] 4.3 **Paste is always plain text.** Copy a styled paragraph from a web page or Word and paste: you get
      the text only, no fonts, no colours, no HTML.
- [ ] 4.4 Paste something with Windows line endings and with a leading invisible BOM: the text is clean, no
      stray characters, no doubled blank lines.
- [ ] 4.5 Paste text containing a non-breaking space (French typography) and an emoji with a skin tone: both
      **survive intact**.
- [ ] 4.6 Undo / redo work per tab: change tab A, change tab B, go back to A, `Mod+Z` — it undoes **A's**
      change, not B's.
- [ ] 4.7 History survives switching tabs, switching mode, and close-then-reopen (↺). It does **not**
      survive a reload — that is expected.
- [ ] 4.8 Each tab keeps its own **cursor, selection and scroll position** when you come back to it.

---

## 5. Markdown tabs

Turn a tab to Markdown with the `.md` button in the bar under the tabs, or `Shift+Mod+M`.

- [ ] 5.1 The text renders **in place** as you type. The raw symbols appear only on the line (or block) the
      cursor is on, and hide again when you move away.
- [ ] 5.2 Supported and rendering: headings, **bold**, *italic*, ~~strikethrough~~, ==highlight==,
      `inline code`, fenced code blocks, quotes, nested bullet and numbered lists, links, horizontal rules,
      task boxes.
- [ ] 5.3 Toggling to plain text and back keeps the **text, the cursor and the undo history**.
- [ ] 5.4 **Security — raw HTML.** Type `<b>bold?</b>` and `<script>alert(1)</script>` and
      `<img src=x onerror=alert(1)>`. All three must appear as **literal text**. Nothing bold, no alert box,
      no image request.
- [ ] 5.5 **Security — links.** `[ok](https://example.com)` is a link; `Mod+click` opens it in a new browser
      tab, a plain click just moves the cursor. `[bad](javascript:alert(1))` must **not** be clickable.
- [ ] 5.6 **Spell check is the browser's.** Type `teh cat sat on teh mat`. Whether you see red squiggles
      depends on your browser's own setting: right-click in the text and use
      *Check Spelling While Typing* (Firefox) / *Check spelling while typing* (Chrome) to turn it on and off.
      Both states must work, and the setting must stick across a reload.
- [ ] 5.7 With a mostly **French** tab and a mostly **English** tab, the browser's suggestions should use the
      right dictionary for each. (Needs both dictionaries installed.)
- [ ] 5.8 Images: `![alt text](x.png)` shows a **placeholder with the alt text** and loads nothing. Confirm
      in the Network tab.
- [ ] 5.9 Task boxes: `- [ ] thing` shows a checkbox; clicking it toggles `[ ]` ⇄ `[x]` in the source, keeps
      the cursor, and one `Mod+Z` undoes it.
- [ ] 5.10 Typing `- []` or `- [  ]` is corrected to the standard `- [ ]`.
- [ ] 5.11 On a task with **no text yet** (just the box), the cursor stands a small gap after the box,
      exactly where the first character will appear — not against the box.

---

## 6. Formatting bar (under the tabs)

Every button works in **both** modes — in a plain-text tab it inserts the Markdown symbols, in a Markdown tab
you see the result.

- [ ] 6.1 Each of `B` `I` `S` `ab` `</>` link `H1` `H2` `H3` `•` `1.` task `❝` `{ }` rule does what its
      tooltip says, on a selection.
- [ ] 6.2 **With no selection**, an inline format wraps the **word at the cursor** and leaves the cursor
      inside it. Check at the start, the middle and the end of a word.
- [ ] 6.3 Pressing the same button again **removes** the format. A button shows as **pressed** when the
      cursor is inside that format.
- [ ] 6.4 `H1` on an `H1` line removes it; `H2` on an `H1` line changes it.
- [ ] 6.5 The three lists **replace** each other; making a task out of a numbered item keeps the number.
- [ ] 6.6 Quote and code block, with no selection, take the **whole paragraph** around the cursor.
- [ ] 6.7 `{ }` inside a code block **removes** the block.
- [ ] 6.8 Undo / redo buttons are greyed out when there is nothing to undo / redo, and act on the active tab.
- [ ] 6.9 Clicking a formatting button does **not** move the focus out of the text or lose the selection.
- [ ] 6.10 **A list item is only the line you chose.** In a **Markdown** tab, write three lines of a paragraph,
      put the cursor on the first and press the bullet button. Only that line becomes a bullet: the next two
      stay ordinary text at the page margin, and a **blank line appears** after the new item. That blank line
      is on purpose — without it, Markdown would read the rest of the paragraph as part of the item. The
      cursor stays on the item. In a **plain-text** tab no blank line is added.

---

## 7. Keyboard shortcuts

`Mod` = `Cmd` on macOS, `Ctrl` on Windows. Press `Mod+/` at any time for the in-app list.

**If you are on a non-US keyboard layout, §7.5 is the most valuable part of this whole document.**

### 7.1 Formatting — try each in both modes

- [ ] `Mod+B` bold  · [ ] `Mod+I` italic · [ ] `Shift+Mod+X` strikethrough · [ ] `Shift+Mod+H` highlight
- [ ] `Mod+E` inline code · [ ] `Mod+K` link
- [ ] headings: macOS `Option+Mod+1` … `6` — Windows `Ctrl+Shift+1` … `6` (4 to 6 have no button)
- [ ] `Shift+Mod+L` bullets · [ ] `Shift+Mod+O` numbers · [ ] `Shift+Mod+A` tasks · [ ] `Shift+Mod+C` quote
- [ ] the same lists on the digit keys, as in Word and Google Docs: `Shift+Mod+8` bullets, `Shift+Mod+7`
      numbers, `Shift+Mod+9` tasks (on AZERTY too: the digit keys, whatever they print unshifted)
- [ ] `Shift+Mod+E` code block · [ ] `Shift+Mod+-` horizontal rule (the key right of `0`) — a rule, and
      **not** the browser zooming out
- [ ] `Mod+Return` on a task checks / unchecks the tasks on the selected lines
- [ ] `Shift+Mod+M` plain text ⇄ Markdown

### 7.2 Editing

- [ ] `Mod+Z` undo · [ ] `Shift+Mod+Z` redo · [ ] Windows also `Ctrl+Y` redo
- [ ] `Mod+S` saves at once **and does not open the browser's Save Page dialog**. A message appears in the
      middle of the window for about a second: "✓ Saved in this browser — To get a file, use Export".
- [ ] With storage **full** (§12), `Mod+S` shows **no** such message — it must never claim a save that
      failed. In a read-only window (§13) it says nothing is saved there.
- [ ] With **Caps Lock on**: `Shift+Mod+Z` still redoes, `Shift+Mod+K` still deletes the line,
      `Shift+Mod+E` still makes a code block — not undo, a link or inline code.
- [ ] `Mod+F` find · [ ] `Mod+G` next match · [ ] `Shift+Mod+G` previous match
- [ ] **Windows only:** `F3` next match, `Shift+F3` previous. With the find bar closed, `F3` opens it.
- [ ] `Option/Alt+↑` `↓` **moves** the line. On a list item it takes the item **with its sub-items**.
      → **It must never leave a copy behind.** If you ever see the line duplicated instead of moved, that is
      a bug we are hunting: report the exact text, which line the cursor was on, and the mode.
- [ ] `Shift+Option/Alt+↑` `↓` **duplicates** the line — this one is *meant* to copy.
- [ ] **In a list, the item moves as a block, at its level.** In `- a` / `  - a1` / `- b` / `  - b1`, cursor
      on `- a`, `Option/Alt+↓`: `a` and `b` change places, **each keeping its sub-item**.
- [ ] **Leaving its parent, an item keeps its level.** In `- a` / `  - a1` / `  - a2` / `- b`, cursor on
      `a2`, `Option/Alt+↓`: `a2` stays indented and becomes the **first child of `b`**. Going up past a parent
      works the same way.
- [ ] **Across a blank line, the block moves one line at a time and stays whole.** In `- a` / `  - a1` /
      blank / `outro`, cursor on `- a`, `Option/Alt+↓`: `a` **and its sub-item** swap with the **blank line
      only** — they do not jump past `outro`, and `a1` is not left behind.
- [ ] A cursor on an indented continuation line (the second line of a long item) moves the **whole item**.
- [ ] `Cmd+L` (macOS) / `Alt+L` (Windows) selects the line. On macOS, `Cmd+L` must **never** reach the
      address bar, even with the focus on a button.
- [ ] `Mod+Return` (not on a task) adds a new line **below**, leaving the line whole — unlike `Return`, which
      splits it at the cursor. `Shift+Mod+Return` adds a new line **above**, with the line's indentation.
- [ ] `Shift+Mod+K` deletes the line
- [ ] `Mod+]` indent · [ ] `Mod+[` outdent  ← **see §7.5**
- [ ] `Tab` / `Shift+Tab` indent / outdent a list item
- [ ] `Return` continues a list or a quote; on an empty item it ends the list
- [ ] `Backspace` right after a list marker or `>` removes the whole marker
- [ ] `Mod+P` shows the "printing is not available" message
- [ ] `Mod+U` does nothing (it must **not** open the browser's View Source)

### 7.3 Tabs and moving around

- [ ] `Shift+Mod+,` previous tab · [ ] `Shift+Mod+.` next tab — from anywhere, wrapping around
- [ ] alternate: macOS `Ctrl+Mod+,` `.` — Windows `Ctrl+,` `.`
- [ ] **Windows only:** `Ctrl+PageUp` / `Ctrl+PageDown` for previous / next tab.
- [ ] `Mod+J` jumps from the text to the bar under the tabs; `Mod+J` again or `Esc` comes back
- [ ] `↑` `↓` move between top bar → tabs → bar under the tabs → text
- [ ] `←` `→` move between the controls of a bar; `Enter` / `Space` presses one
- [ ] In the bar under the tabs, `Tab` / `Shift+Tab` jump to the next / previous **group**
- [ ] In the tabs or the bar under them: `N` new tab, `U` reopen the last closed tab
- [ ] From anywhere: macOS `Control+Cmd+W` closes the tab you are in, `Control+Cmd+U` reopens it — Windows
      `Alt+W` / `Alt+U`. The browser must not close its own tab or open a menu.
- [ ] On a tab: `Enter` opens · `F2` or `R` renames · `x` closes, and so does `Delete` on Windows and the
      Mac's **delete** key (`⌫`) · `v` lifts it, then `←` `→` move it, `Enter` puts it down, `Esc` puts it back
- [ ] In **every** bar — the top bar included — `Home` / `End` go to the first / last control
- [ ] `Mod+/` opens the shortcut list; `Esc` closes it. One row per action; paired keys read `⌘G / ⇧⌘G`
      as the label reads "Next / previous", and alternatives are joined by "or".
- [ ] `F1` and `Shift+Mod+I` open the Help tab. **Windows:** note whether the browser opens its developer
      tools instead of Help on `Ctrl+Shift+I` (see §7.6).
- [ ] `Esc` from any bar returns to the text

### 7.4 The active-tab rule

- [ ] 7.4.1 Focus the tab strip and **arrow to a different tab without pressing Enter**. Now press
      `Shift+Mod+M`, `Mod+S`, `Mod+F` and a formatting combo. Every one of them must act on the tab that is
      **open in the editor**, not on the one you arrowed to.
- [ ] 7.4.2 In the same state, `x` / `R` / `v` **do** act on the tab you arrowed to. That difference is
      intended.

### 7.5 Non-US keyboard layouts — please be precise here

Shortcuts on punctuation keys are matched by the key's **physical position**, so they are the same keys on
every layout, whatever those keys print. Six keys are involved: the two right of `M`, the one right of
those, the two right of `P`, and the one right of `0`; the digit keys work the same way. Letters follow
the letter printed on the key (`Mod+Z` is wherever `Z` is), as in every app.

Give your exact layout (for example "French AZERTY, macOS"). For each line say **which physical key** you
pressed and **what happened**. These were checked only with simulated key events, so a real keyboard
matters here.

- [ ] 7.5.1 **Outdent.** `Mod` + the **first key right of `P`** (French AZERTY: the dead `^` key; Canadian
      French: `^`; German: `ü`) outdents the line. This is the one that was completely dead on AZERTY.
- [ ] 7.5.2 **Indent.** `Mod` + the **second key right of `P`** (AZERTY `$`, Canadian French `ç`, German `+`)
      indents the line.
- [ ] 7.5.3 **Previous tab.** `Shift+Mod` + the **first key right of `M`** (AZERTY `;`, US `,`).
- [ ] 7.5.4 **Next tab.** `Shift+Mod` + the **second key right of `M`** (AZERTY `:`, US `.`).
- [ ] 7.5.5 **Shortcut list.** `Mod` + the **third key right of `M`** (AZERTY `!`, US `/`).
- [ ] 7.5.6 On AZERTY, the key that *prints* `,` sits where `M` is on a US keyboard. `Shift+Mod` with it must
      do **nothing** — in particular it must **not** open the shortcut list.
- [ ] 7.5.7 **The shortcut list names your keys.** Open it with the key from 7.5.5 and read the "Indent /
      outdent the line" row: in **Chrome** it should name the characters *your* keyboard prints (AZERTY:
      `⌘$` and `⌘^`), not `]` and `[`. In **Firefox** it will say `]` and `[` — Firefox has no way to
      report the layout, and that is expected, not a bug.
- [ ] 7.5.8 **Headings** (`Option+Mod+1…3` / `Ctrl+Shift+1…3`) work on AZERTY and QWERTZ, even though digits
      need `Shift` there.
- [ ] 7.5.9 **Horizontal rule.** `Shift+Mod` + the **key right of `0`** (AZERTY `)`, US `-`) inserts a rule.
- [ ] 7.5.10 **A layout without Latin letters** (Russian, Greek, Hebrew…): `Mod+F`, `Mod+S`, `Mod+J`,
      `Shift+Mod+M`, `Mod+B`, and `N` in the tabs all answer, on the key where the Latin letter would be.
- [ ] 7.5.11 Anything else on the wrong key, or doing nothing: tell us the physical key and what it prints.

### 7.6 Known and accepted — do not report these

- The OS or the browser may take a combo before the page sees it (for example `Ctrl+Shift+N`). A page
  cannot take a key the browser handles first. Note it, but it is usually not ours to fix.
- **Windows, developer-tools keys:** the app claims `Ctrl+Shift+C` (quote), `Ctrl+Shift+I` (Help), and in
  Firefox `Ctrl+Shift+K`, `E`, `M`. Please **do** report each one where the browser acts instead — which
  key, which browser: that list decides whether those shortcuts need other keys.

---

## 8. Find

- [ ] 8.1 `Mod+F` opens the find bar; the match count reads `3 of 12`; every match is highlighted; the
      current one stands out.
- [ ] 8.2 `Enter` / `Mod+G` next, `Shift+Enter` / `Shift+Mod+G` previous, both wrapping around.
- [ ] 8.3 `Esc` closes the find bar and leaves the current match **selected** in the text.
- [ ] 8.4 Search for something absent: "No results", nothing highlighted.
- [ ] 8.5 Find searches **only the active tab**.
- [ ] 8.6 On the **Help** tab, `Mod+F` opens the **browser's own** find, not the app's.
- [ ] 8.7 Search for an accented word and for an emoji.

---

## 9. Import and export

- [ ] 9.1 **Export** downloads the active tab. The filename is the tab name, with `.md` added in Markdown
      mode or `.txt` otherwise, unless it already ends in one of those.
- [ ] 9.0 **From the keyboard:** `Mod+O` opens the file picker (Import), `Shift+Mod+S` exports the tab,
      macOS `Option+Cmd+S` / Windows `Alt+Shift+S` exports all. The browser must not open its own Open
      dialog, Save Page, or (Firefox) screenshot tool.
- [ ] 9.1b In a new tab, type `# Report` and click **Export at once**, before the tab has renamed itself:
      the file is still named `Report.md`.
- [ ] 9.2 The exported file is **UTF-8, no BOM, LF line endings**, and its content matches the editor
      exactly. Check an accented file in a text editor.
- [ ] 9.3 **Export All** downloads `modest-text_YYYYMMDD_hhmmss.zip` — for example
      `modest-text_20260916_140322.zip`. **The date is year-first.**
- [ ] 9.4 The ZIP opens in **macOS Archive Utility** and in **Windows Explorer** (double-click, no tool).
- [ ] 9.5 Accented and non-Latin tab names survive in the ZIP: `Café crème.txt`, `日本.txt`.
- [ ] 9.6 Empty tabs are left out. Duplicate names get ` (2)`.
- [ ] 9.7 Export All includes changes that have **not** been saved yet: type something and export
      immediately.
- [ ] 9.8 **Import** by button and by **dragging files onto the window**. A drop overlay appears while
      dragging.
- [ ] 9.9 Several files at once: each becomes a tab, `.md` files open in Markdown mode, and they are added
      **sorted by filename**, after the existing tabs. Nothing is ever replaced.
- [ ] 9.10 Rejections, each with a message: a `.pdf`, a `.zip`, a file over 1 MB, and a binary file renamed
      to `.txt`.
- [ ] 9.11 A summary appears: `Imported 5 tabs · skipped 2 (1 too large, 1 wrong type)`.
- [ ] 9.12 **Encodings.** Import a UTF-8 file with a BOM, a UTF-16 file, and an old Windows-1252 French file
      (`é à ç`). All three must read correctly, with no `Ã©`-style mangling.
- [ ] 9.12b **Last full export.** The Export All tooltip ends with "Last full export: never", then with the date
      and time of the last Export All, also after a reload. Exporting one tab does not change it.
- [ ] 9.12c **Leaving asks first.** Change a note, then close or reload the page: the browser asks "Leave
      site?" (its own box and wording). Choose to leave: the note is still saved. Now Export All and close
      again: no question.
- [ ] 9.13 Round trip: Export All, close every tab, then import all the files from the ZIP — everything
      comes back.

---

## 10. Saving and persistence

Saving is automatic. You should never need to save by hand.

- [ ] 10.1 Stop typing: within about a second the status goes `Unsaved` → `Saving…` → `Saved` and the dot
      turns green.
- [ ] 10.2 It also saves when you **switch tab**, **switch window or app**, **minimize**, and **close or
      reload** the page.
- [ ] 10.3 Type and immediately reload (before the second is up): **your text is still there**.
- [ ] 10.4 Three tabs with different names, order, modes and content survive a reload, and so do theme,
      language, font, size, Wrap and Reading width, and which tab was active.
- [ ] 10.4b Scroll a long note, switch tabs, reload — it comes back at the same place (see 3.15).
- [ ] 10.5 Typing in a 1 MB tab stays **smooth** — no stutter every time it saves.
- [ ] 10.6 Open the app in a **private / incognito** window: it works, and the notes are gone when you close
      it. That is expected, and Help says so.

---

## 11. Status bar

- [ ] 11.1 Left: `12 lines · 240 words · 1,302 characters`, then the save state.
- [ ] 11.2 Numbers follow the language: `1,302` in English, `1 302` in French.
- [ ] 11.3 Select some text: the **selection counts** appear and the document counts give way first.
- [ ] 11.4 **Right: the date is year-first ISO** — `2026-09-16 ∙ 14:03:22` — followed by your **time zone
      abbreviation**, the one the tz database uses. Check it is right for where you are:
      France / Germany / Italy `CET` in winter, `CEST` in summer · UK `GMT` / `BST` · Greece and Finland
      `EET` / `EEST` · Portugal `WET` / `WEST` · New York and Toronto `EST` / `EDT` · Vancouver `PST` /
      `PDT` · Japan `JST` · India `IST` · Sydney `AEST` / `AEDT`. A `GMT+4`-style offset is only correct
      where the tz database itself has no abbreviation (Dubai, São Paulo, Santiago). **`GMT+1` in Berlin or
      Paris would be a bug.**
- [ ] 11.5 The dot is **green** when saved, **red** when there are unsaved changes or a save failed.
      Hovering it gives the full date, time and zone.
- [ ] 11.6 The stamp is **the last full export** (Export All), not the note's save: `Saved ● Last full export:
      2026-09-16 ∙ 14:03:22 EDT`, `never` before the first Export All. Hover the dot for the note's last save. In a
      It sits after a thin rule and starts with the Export All icon. In a narrow window the label goes and the
      icon stays in front of the stamp (hover it for the full wording).
- [ ] 11.7 **Narrow the window slowly** and watch the right-hand stamp shrink through these steps — it must
      never be cut off or overlap. On a normal desktop window you will only see the first two or three; drag
      it well below 800 px to reach the rest:
      1. `2026-09-16 ∙ 14:03:22 EDT`
      2. `2026-09-16 ∙ 14:03:22`
      3. `20260916 ∙ 14:03:22`
      4. `20260916 ∙ 14:03`
      5. `14:03:22`
      6. `14:03`
- [ ] 11.8 **The year is never shown as two digits** at any width. If you ever see `26-09-16` or `260916`,
      that is a bug.
- [ ] 11.9 The counts shorten too (`ln.` `wds.` `chars.` / `lgn.` `mts.` `car.`) and nothing is ever cut.

---

## 12. Storage alerts

Slow and fiddly — one tester is enough.

- [ ] 12.1 Fill the storage (import large files repeatedly) until usage passes 4 MB: an **amber**
      `Storage 4.3 / ~5 MB` item appears in the status bar, plus a one-time message. Clicking the item runs
      Export All.
- [ ] 12.2 Keep going until a save fails: a **red banner** appears under the tabs, *Storage full: recent
      changes are not saved.* with an **Export All** button. The status says `Save failed`, the dot is red.
- [ ] 12.3 **Your text is not lost.** It is still in the editor, and Export All still produces a complete
      ZIP.
- [ ] 12.4 The banner cannot be dismissed while changes are unsaved.
- [ ] 12.5 Close some tabs to free space: saving resumes and *Storage available again* appears.
- [ ] 12.6 In Chrome from `file://`: other local HTML pages share this storage. Help explains this — confirm
      the text is there and is understandable.

---

## 13. Several windows open at once

- [ ] 13.1 Open the app in a **second tab or window**. The second one is **read-only**, with the banner
      *Open in another window · Edit here instead*. Its status says `Read-only` and its editing buttons are
      greyed out.
- [ ] 13.2 Type in the first window: the second one **updates by itself**.
- [ ] 13.3 **Edit here instead** in the second window: the first becomes read-only, and the last keystrokes
      typed in it are **not lost**.
- [ ] 13.4 Close the editing window: the read-only one takes over within a few seconds.
- [ ] 13.5 Crash test — force-quit the editing window (Force Quit / Task Manager). The other one must take
      over, not stay stuck read-only.
- [ ] 13.6 Do this on **both** `file://` and `http://`, in **both** browsers. The locking uses two different
      mechanisms depending on what the browser allows, so both paths need covering.

---

## 14. Looks

Check in **both themes** and **both languages**.

- [ ] 14.1 The theme button shows the theme it will switch **to**. It switches with a gentle cross-fade.
- [ ] 14.2 With no choice made, the app follows the **OS** theme. Change the OS theme with the app open: it
      follows. Once you pick a theme by hand, it stops following and remembers your choice.
- [ ] 14.3 Flat surfaces, 1 px borders, small radii, no gradients, no heavy shadows.
- [ ] 14.4 **All text is comfortably readable** in both themes, including the red and amber banners.
- [ ] 14.5 Every control shows a **visible focus ring** when reached with `Tab` or the arrows.
- [ ] 14.6 **Resize the window** across the desktop range — full screen, 1280, 1024, 900 and **800 px**
      (the supported floor). At each: nothing overlaps, nothing is cut off, **the page never scrolls
      sideways**, and every button stays on screen.
- [ ] 14.6b *Secondary* — drag it narrower still (600, 420 px). Below 800 px the layout is not a target, so
      cramped is fine; what must not happen is text cut off, controls off-screen, or sideways scrolling.
- [ ] 14.7 As it narrows, the top bar moves Font / Size / Wrap / Reading width **together** to a second row,
      and never jumps back to one row as it gets narrower still.
- [ ] 14.8 The bar under the tabs breaks into rows between groups, never inside a group.
- [ ] 14.9 Zoom the browser to 50 %, 150 % and 200 %: still usable, nothing cut off.
- [ ] 14.10 The two new icons (Wrap, Reading width) are the same size and weight as Import / Export beside
      them, and sit on the same line.
- [ ] 14.11 When Wrap or Reading width is **on**, its button looks pressed (accent bar underneath).

---

## 15. English and French

- [ ] 15.1 `EN|FR` switches **everything**: buttons, tooltips, dropdowns, dialogs, banners, status bar,
      messages, default tab names and the whole Help page.
- [ ] 15.2 Both codes are always visible; the active one is highlighted.
- [ ] 15.3 Existing tabs are **not** renamed when you switch language.
- [ ] 15.4 French typography: `Renvoi à la ligne :` with a space before the colon, `«  »` with inner spaces.
- [ ] 15.5 With the browser set to French, a **first** launch comes up in French.
- [ ] 15.6 No English left over in French mode, and no French left over in English mode. `Modest Text`
      itself is never translated.
- [ ] 15.7 Switch language **with the Help tab open**: it re-renders in the new language at once.

---

## 16. Combinations, adjacencies and nesting

This is where bugs hide. Please spend real time here.

### 16.1 Nested and embedded Markdown

- [ ] A bullet list **inside** a quote: `> - one` / `> - two`
- [ ] A numbered list inside a bullet list, three levels deep
- [ ] A **task list nested** under a bullet item
- [ ] A code block **inside** a list item (indented)
- [ ] A quote inside a list item
- [ ] `**bold with *italic* inside**` and `*italic with **bold** inside*`
- [ ] A link whose text is bold: `[**bold link**](https://example.com)`
- [ ] Inline code containing Markdown symbols: `` `**not bold**` `` — must stay literal
- [ ] A fenced code block containing ``` ``` ``` fences and `# headings` — must stay literal
- [ ] A heading immediately followed by a list, with no blank line between

### 16.2 Adjacencies

- [ ] Two formats touching: `**bold***italic*`
- [ ] Two links side by side with nothing between
- [ ] A horizontal rule directly under a heading (it must not turn the heading into something else)
- [ ] `---` on the line right after text (should not become a heading underline)
- [ ] A list item immediately after a code block
- [ ] Apply bold to a selection that **already starts or ends inside** bold text
- [ ] Apply a heading to a selection spanning a heading and a normal line

### 16.3 Feature combinations

- [ ] Reading width **on** + Markdown + a very long line + a wide window
- [ ] Reading width **on**, then switch a tab to plain text with Wrap **off** — the button greys out and the
      column goes away without the layout jumping
- [ ] Wrap off + a 1 MB single-line file + horizontal scrolling
- [ ] Find open **while** switching tabs, and while switching mode
- [ ] Find open **while** the window is narrow enough to stack the top bar
- [ ] Rename dialog open, then press every global shortcut (`Mod+S`, `Mod+F`, `Shift+Mod+M`, `Mod+J`) —
      none of them should act behind the dialog
- [ ] Shortcut list open, then `Shift+Mod+,` / `.` — must **not** switch tabs behind it
- [ ] Storage **full** + closing tabs + reopening with ↺
- [ ] Read-only second window + trying every formatting shortcut — nothing must change
- [ ] Import files **while** a second window is read-only
- [ ] Undo across a mode switch: format in Markdown, switch to plain, `Mod+Z`
- [ ] Theme switch **during** a save
- [ ] Language switch with text selected — the selection and the counts survive
- [ ] `Option/Alt+↑` `↓` on the **first** and **last** line of the document (nothing should happen, and
      nothing should be duplicated)
- [ ] `Option/Alt+↑` `↓` on a list item whose sub-items are separated by blank lines
- [ ] Type in a tab, switch to another tab, and **immediately** close the browser — reopen and check nothing
      was lost

### 16.4 Awkward content

- [ ] A tab holding **1 MB** of text: opening, typing, searching and switching to it all stay responsive
- [ ] A single line of 100,000 characters with Wrap on and off
- [ ] Text with **right-to-left** content (Arabic or Hebrew) mixed with Latin
- [ ] Text with CJK characters, and with emoji including families and skin tones
- [ ] 50 tabs open at once
- [ ] A tab containing only whitespace
- [ ] Markdown with 10,000 list items

---

## 17. Quick smoke test

If you only have ten minutes, do this.

1. [ ] Open from disk. Help appears. No console errors.
2. [ ] `+`, type a few lines, wait a second — status says `Saved`, dot green, date is `2026-…` year-first.
3. [ ] Reload — the text is still there.
4. [ ] `Shift+Mod+M` to Markdown, type `# Title` and `- [ ] task` — both render; the checkbox clicks.
   `Mod+S` shows "✓ Saved in this browser" in the middle for a second.
5. [ ] Turn **Reading width** on — the text becomes a centred column.
6. [ ] `Mod+B`, `Mod+I`, `Mod+K` on a selection — all three work.
7. [ ] `Option/Alt+↑` `↓` on a list item — it **moves**, it does not duplicate.
8. [ ] Export All — the ZIP is named `modest-text_YYYYMMDD_hhmmss.zip` and opens.
9. [ ] Switch to FR, then to the dark theme — everything translates, everything stays readable.
10. [ ] Resize the window down to 800 px — nothing is cut off and the page does not scroll sideways.
