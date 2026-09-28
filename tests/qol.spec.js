// Quality-of-life features: numbered lists kept in order, list items moved with their sub-items, tasks toggled
// from the keyboard, find in the active tab, the shortcut sheet, spell check, reading width.
import { test, expect, openFresh, openApp, setDoc, docText, setCursor, selectRange, setLang, clickTab, addTab, closeTabByName } from './helpers.js';

const M = 'ControlOrMeta';
const cur = (page) => page.evaluate(() => { const r = document.getElementById('editor').mtView.state.selection.main; return [r.from, r.to]; });

test('numbered lists are renumbered after every edit (insert, delete, move, nested, quoted); one undo step', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  for (const mode of ['plain', 'md']) {
    if (mode === 'md') await page.click('#btn-md');
    await setDoc(page, '1. one\n2. two\n3. three');
    await setCursor(page, 6);
    await page.keyboard.press('Enter');
    await page.keyboard.type('new');
    expect(await docText(page), mode).toBe('1. one\n2. new\n3. two\n4. three');
    await page.keyboard.press(`${M}+z`);
    expect(await docText(page)).toBe('1. one\n2. two\n3. three');
    // Deleting a line (also the first one: the list still starts at 1).
    await setDoc(page, '1. a\n2. b\n3. c\n4. d');
    await setCursor(page, 5);
    await page.keyboard.press(`Shift+${M}+KeyK`);
    expect(await docText(page)).toBe('1. a\n2. c\n3. d');
    await setCursor(page, 0);
    await page.keyboard.press(`Shift+${M}+KeyK`);
    expect(await docText(page)).toBe('1. c\n2. d');
    // Nested and quoted lists are numbered on their own; a list started at 3 keeps 3.
    await setDoc(page, '1. a\n   1. x\n   2. y\n2. b');
    await setCursor(page, 4);
    await page.keyboard.press('Enter');
    await page.keyboard.type('n');
    expect(await docText(page)).toBe('1. a\n2. n\n   1. x\n   2. y\n3. b');
    await setDoc(page, '> 1. a\n> 2. b');
    await setCursor(page, 6);
    await page.keyboard.press('Enter');
    await page.keyboard.type('q');
    expect(await docText(page)).toBe('> 1. a\n> 2. q\n> 3. b');
    await setDoc(page, '');
    await setCursor(page, 0);
    await page.keyboard.type('3. x');
    await page.keyboard.press('Enter');
    await page.keyboard.type('y');
    expect(await docText(page)).toBe('3. x\n4. y');
    // Lines that are not numbered items are left alone.
    await setDoc(page, 'intro 5. text\n1. a\n1. b');
    await setCursor(page, 0);
    await page.keyboard.type('x');
    expect(await docText(page)).toBe('xintro 5. text\n1. a\n1. b');
    if (mode === 'md') await page.click('#btn-md');
  }
});

test('Option/Alt+↑ ↓ on a list item moves it with its sub-items; elsewhere the line moves as usual', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  for (const mode of ['plain', 'md']) {
    if (mode === 'md') await page.click('#btn-md');
    const doc = '- a\n  - a1\n  - a2\n- b\n  - b1\n- c';
    await setDoc(page, doc);
    await setCursor(page, doc.indexOf('- b') + 2);
    await page.keyboard.press('Alt+ArrowUp');
    expect(await docText(page), mode).toBe('- b\n  - b1\n- a\n  - a1\n  - a2\n- c');
    expect(await page.evaluate(() => { const v = document.getElementById('editor').mtView; return v.state.doc.lineAt(v.state.selection.main.head).text; })).toBe('- b');
    await page.keyboard.press('Alt+ArrowDown');
    expect(await docText(page)).toBe(doc);
    await page.keyboard.press('Alt+ArrowDown');
    expect(await docText(page)).toBe('- a\n  - a1\n  - a2\n- c\n- b\n  - b1');
    // A numbered item: moved and renumbered.
    await setDoc(page, '1. one\n   - sub\n2. two\n3. three');
    await setCursor(page, 17);
    await page.keyboard.press('Alt+ArrowUp');
    expect(await docText(page)).toBe('1. two\n2. one\n   - sub\n3. three');
    // Not a list item: CodeMirror's line move.
    await setDoc(page, 'x\ny');
    await setCursor(page, 3);
    await page.keyboard.press('Alt+ArrowUp');
    expect(await docText(page)).toBe('y\nx');
    if (mode === 'md') await page.click('#btn-md');
  }
});

// Option/Alt+↑ ↓ in a list moves the block the cursor is in, at its level. Next to a sibling the two items
// change places with their sub-items; next to something shallower (leaving the parent) the block keeps its
// indentation; next to a blank line it changes places with that blank line alone, staying whole.
test('Option/Alt+↑ ↓ moves the list block at its level: siblings, leaving the parent, blank lines, continuation lines', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  const run = async (doc, line, key) => {
    await page.evaluate(([d, n]) => {
      const v = document.getElementById('editor').mtView;
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: d } });
      v.focus();
      const l = v.state.doc.line(n);
      v.dispatch({ selection: { anchor: Math.min(l.from + 3, l.to) } });
    }, [doc, line]);
    await page.keyboard.press(key);
    const [text, cursorLine] = await page.evaluate(() => {
      const v = document.getElementById('editor').mtView;
      return [v.state.doc.toString(), v.state.doc.lineAt(v.state.selection.main.head).text];
    });
    return { text, cursorLine };
  };
  for (const mode of ['plain', 'md']) {
    if (mode === 'md') await page.click('#btn-md');
    // Siblings: each travels with its sub-items.
    let r = await run('- a\n  - a1\n- b\n  - b1', 1, 'Alt+ArrowDown');
    expect(r.text, mode).toBe('- b\n  - b1\n- a\n  - a1');
    expect(r.cursorLine).toBe('- a');
    // Leaving the parent downward: the last child keeps its level, and becomes the next item's first child.
    r = await run('- a\n  - a1\n  - a2\n- b\n  - b1', 3, 'Alt+ArrowDown');
    expect(r.text, mode).toBe('- a\n  - a1\n- b\n  - a2\n  - b1');
    // Leaving the parent upward: the block keeps its levels (its own sub-item included).
    r = await run('- x\n- a\n  - a1\n    - a11', 3, 'Alt+ArrowUp');
    expect(r.text, mode).toBe('- x\n  - a1\n    - a11\n- a');
    // A blank line below: the block changes places with the blank line only, and stays whole — not with
    // "outro" on the far side of it, and not split from its sub-item.
    r = await run('- a\n  - a1\n\noutro', 1, 'Alt+ArrowDown');
    expect(r.text, mode).toBe('\n- a\n  - a1\noutro');
    // A blank line above: likewise.
    r = await run('intro\n\n- a\n  - a1\n- b', 3, 'Alt+ArrowUp');
    expect(r.text, mode).toBe('intro\n- a\n  - a1\n\n- b');
    // Two presses across a double gap: one blank line at a time.
    r = await run('- a\n\n\nend', 1, 'Alt+ArrowDown');
    expect(r.text, mode).toBe('\n- a\n\nend');
    // A cursor on a continuation line moves the item that line belongs to.
    r = await run('- a\n  more about a\n- b', 2, 'Alt+ArrowDown');
    expect(r.text, mode).toBe('- b\n- a\n  more about a');
    expect(r.cursorLine).toBe('  more about a');
    // The first and last lines of the document: nothing happens.
    expect((await run('- a\n\n- b', 1, 'Alt+ArrowUp')).text, mode).toBe('- a\n\n- b');
    expect((await run('- a\n\n- b', 3, 'Alt+ArrowDown')).text, mode).toBe('- a\n\n- b');
    // Not in a list: CodeMirror's ordinary line move.
    expect((await run('one\ntwo', 1, 'Alt+ArrowDown')).text, mode).toBe('two\none');
    if (mode === 'md') await page.click('#btn-md');
  }
});

// Making a list item from a line of a paragraph gives an item of that line only. In Markdown the next
// paragraph line would otherwise be a "lazy continuation" of the item — the whole paragraph would become the
// item — so a blank line ends it. In a plain-text tab nothing renders, and nothing is added.
test('a list item made from one line of a paragraph is that line only, in Markdown as in plain text', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  const make = async (doc, anchor, head, fmt) => {
    await page.evaluate(([d, a, h]) => {
      const v = document.getElementById('editor').mtView;
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: d } });
      v.focus();
      v.dispatch({ selection: { anchor: a, head: h } });
    }, [doc, anchor, head]);
    await page.click(`.fmt-btn[data-fmt="${fmt}"]`);
    return page.evaluate(() => {
      const v = document.getElementById('editor').mtView;
      return [v.state.doc.toString(), v.state.doc.lineAt(v.state.selection.main.head).text];
    });
  };
  // Plain text: only the marker.
  expect(await make('first\nsecond\nthird', 3, 3, 'ul')).toEqual(['- first\nsecond\nthird', '- first']);
  await page.click('#btn-md');
  // Markdown: the item ends at the line, and the cursor stays on the item, also from the end of the line.
  expect(await make('first\nsecond\nthird', 3, 3, 'ul')).toEqual(['- first\n\nsecond\nthird', '- first']);
  expect(await make('first\nsecond', 5, 5, 'ul')).toEqual(['- first\n\nsecond', '- first']);
  expect((await make('aaa\nbbb\nccc', 0, 5, 'ol'))[0]).toBe('1. aaa\n2. bbb\n\nccc'); // two lines selected: those two
  expect((await make('aaa\nbbb\nccc', 5, 5, 'tasklist'))[0]).toBe('aaa\n- [ ] bbb\n\nccc');
  // Nothing added where the next line could not be swallowed: blank, a heading, an item, or no next line.
  expect((await make('aaa\n\nccc', 1, 1, 'ul'))[0]).toBe('- aaa\n\nccc');
  expect((await make('aaa\n# h', 1, 1, 'ul'))[0]).toBe('- aaa\n# h');
  expect((await make('aaa\n- b', 1, 1, 'ul'))[0]).toBe('- aaa\n- b');
  expect((await make('aaa', 1, 1, 'ul'))[0]).toBe('- aaa');
  // Removing a list is not affected.
  expect((await make('- aaa\nbbb', 1, 1, 'ul'))[0]).toBe('aaa\nbbb');
  // The live preview agrees: the paragraph after the item is at the page margin, not under the bullet.
  await make('first\nsecond\nthird', 3, 3, 'ul');
  await page.evaluate(() => { const v = document.getElementById('editor').mtView; v.dispatch({ selection: { anchor: v.state.doc.length } }); });
  const pads = await page.evaluate(() => [...document.querySelectorAll('#editor .cm-line')].map((l) => parseFloat(getComputedStyle(l).paddingLeft)));
  expect(pads[0]).toBeGreaterThan(pads[2]); // the item is indented
  expect(pads[2]).toBe(pads[3]); // "second" and "third" are ordinary paragraph lines
});


// Moving must never copy: the lines are rearranged, so the text that comes out is exactly the text that went
// in. Shift+Option/Alt+↑ ↓ is the shortcut that does duplicate, and it sits one modifier away.
test('Option/Alt+↑ ↓ moves without ever duplicating, whatever the shape of the list; Shift+Option/Alt+↑ ↓ duplicates', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  const DOCS = [
    '- alpha\n- beta\n- gamma',
    '- alpha\n  - a1\n  - a2\n- beta\n- gamma',
    '- alpha\n\n- beta\n\n- gamma',
    '- alpha\n  continuation\n- beta',
    '1. one\n2. two\n3. three',
    '1. one\n   1. sub\n2. two',
    '- [ ] a\n- [x] b\n- [ ] c',
    'para\n\n- alpha\n- beta\n\npara2',
    '> - q1\n> - q2\n> - q3',
    '- a\n- b\n  - b1\n    - b11\n- c',
    '# head\n- alpha\n- beta\n# tail',
    '- only',
  ];
  // The same multiset of lines, ignoring the numbers a numbered list renumbers itself with.
  const shape = (s) => s.split('\n').map((l) => l.replace(/^(\s*)\d+([.)])/, '$1#$2')).sort().join('|');
  for (const mode of ['plain', 'md']) {
    if (mode === 'md') await page.click('#btn-md');
    for (const doc of DOCS) {
      const lines = doc.split('\n').length;
      for (let n = 1; n <= lines; n++) {
        for (const key of ['Alt+ArrowUp', 'Alt+ArrowDown']) {
          await page.evaluate(([t, ln]) => {
            const v = document.getElementById('editor').mtView;
            v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t } });
            v.focus();
            const l = v.state.doc.line(ln);
            v.dispatch({ selection: { anchor: Math.min(l.from + 2, l.to) } });
          }, [doc, n]);
          await page.keyboard.press(key);
          const after = await docText(page);
          const where = `${mode} ${JSON.stringify(doc)} line ${n} ${key}`;
          expect(after.length, `${where}: nothing added`).toBe(doc.length);
          expect(shape(after), `${where}: the same lines, reordered`).toBe(shape(doc));
        }
      }
    }
    // The neighbouring shortcut is the one that duplicates.
    await setDoc(page, '- alpha\n- beta');
    await setCursor(page, 2);
    await page.keyboard.press('Shift+Alt+ArrowDown');
    expect(await docText(page), mode).toBe('- alpha\n- alpha\n- beta');
    if (mode === 'md') await page.click('#btn-md');
  }
});

test('Cmd/Ctrl+Enter checks or unchecks the tasks on the selected lines; elsewhere it keeps its usual meaning', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  for (const mode of ['plain', 'md']) {
    if (mode === 'md') await page.click('#btn-md');
    await setDoc(page, '- [ ] a\n- [x] b\n1. [X] c\ntext');
    await setCursor(page, 3);
    await page.keyboard.press(`${M}+Enter`);
    expect(await docText(page), mode).toBe('- [x] a\n- [x] b\n1. [X] c\ntext');
    await selectRange(page, 0, 25);
    await page.keyboard.press(`${M}+Enter`);
    expect(await docText(page)).toBe('- [ ] a\n- [ ] b\n1. [ ] c\ntext');
    expect(await cur(page)).toEqual([0, 25]); // the selection stays
    await setDoc(page, 'plain');
    await setCursor(page, 5);
    await page.keyboard.press(`${M}+Enter`); // CodeMirror: a new line below
    expect(await docText(page)).toBe('plain\n');
    if (mode === 'md') await page.click('#btn-md');
  }
});

test('find (Cmd/Ctrl+F): matches counted and highlighted, next / previous with wrap-around, Esc keeps the match selected', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  const lines = Array.from({ length: 300 }, (_, i) => `line ${i} Apple apple${i === 250 ? ' zebra' : ''}`);
  await setDoc(page, lines.join('\n'));
  await setCursor(page, 0);
  await page.keyboard.press(`${M}+KeyF`);
  await expect(page.locator('#findbar')).toBeVisible();
  expect(await page.evaluate(() => document.activeElement.id)).toBe('find-input');
  await page.keyboard.type('APPLE'); // case-insensitive
  await expect(page.locator('#find-count')).toHaveText('1 of 600');
  expect(await cur(page)).toEqual([7, 12]);
  await expect(page.locator('.mt-find-current')).toHaveCount(1);
  expect(await page.locator('.mt-find').count()).toBeGreaterThan(4); // the visible ones are highlighted
  await page.keyboard.press('Enter');
  await expect(page.locator('#find-count')).toHaveText('2 of 600');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.press('Shift+Enter'); // wraps to the last match
  await expect(page.locator('#find-count')).toHaveText('600 of 600');
  await page.keyboard.press(`${M}+KeyG`); // and forward again to the first
  await expect(page.locator('#find-count')).toHaveText('1 of 600');
  // A match far down is scrolled into view.
  await page.fill('#find-input', 'zebra');
  await expect(page.locator('#find-count')).toHaveText('1 of 1');
  await expect(page.locator('.mt-find-current')).toBeInViewport();
  await page.fill('#find-input', 'nothing here');
  await expect(page.locator('#find-count')).toHaveText('No results');
  await expect(page.locator('#find-input')).toHaveClass(/no-match/);
  await page.fill('#find-input', 'zebra');
  await page.keyboard.press('Escape');
  await expect(page.locator('#findbar')).toBeHidden();
  await expect(page.locator('.mt-find')).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement.classList.contains('cm-content'))).toBe(true);
  const [a, b] = await cur(page);
  expect((await docText(page)).slice(a, b)).toBe('zebra');
  // Selected text fills the field; the search follows the active tab; French texts.
  await addTab(page, 'Other', 'one apple, two apples');
  await selectRange(page, 4, 9);
  await page.keyboard.press(`${M}+KeyF`);
  await expect(page.locator('#find-input')).toHaveValue('apple');
  await expect(page.locator('#find-count')).toHaveText('1 of 2');
  await clickTab(page, 'Untitled 1');
  await expect(page.locator('#find-count')).toContainText('of 600');
  await setLang(page, 'fr');
  await expect(page.locator('#find-count')).toContainText('sur 600');
  await expect(page.locator('#find-next')).toHaveAttribute('title', /^Occurrence suivante \(/);
});

test('Cmd/Ctrl+G with no search running opens the find bar, and never reaches the browser', async ({ page, appURL }) => {
  await openApp(page, appURL);
  await page.click('#btn-new');
  await setDoc(page, 'alpha beta alpha gamma');
  // What the browser would see: whether the page had already claimed the key by the time it bubbled out.
  await page.evaluate(() => {
    window.__seen = [];
    window.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'g') window.__seen.push(e.defaultPrevented); });
  });
  await setCursor(page, 0);
  // Closed: the key starts a search rather than falling through to the browser's Find Again.
  await page.keyboard.press(`${M}+KeyG`);
  await expect(page.locator('#findbar')).toBeVisible();
  expect(await page.evaluate(() => document.activeElement.id)).toBe('find-input');
  // Open: it walks the matches, as before.
  await page.keyboard.type('alpha');
  await expect(page.locator('#find-count')).toHaveText('1 of 2');
  await page.keyboard.press(`${M}+KeyG`);
  await expect(page.locator('#find-count')).toHaveText('2 of 2');
  await page.keyboard.press(`Shift+${M}+KeyG`);
  await expect(page.locator('#find-count')).toHaveText('1 of 2');
  // Closed again, with text selected: the selection fills the field, as Cmd/Ctrl+F does.
  await page.keyboard.press('Escape');
  await expect(page.locator('#findbar')).toBeHidden();
  await selectRange(page, 6, 10);
  await page.keyboard.press(`${M}+KeyG`);
  await expect(page.locator('#find-input')).toHaveValue('beta');
  await expect(page.locator('#find-count')).toHaveText('1 of 1');
  expect(await page.evaluate(() => window.__seen)).toEqual([true, true, true, true]);
  // On Help the key is left alone: that page is plain HTML, so the browser's own find works on it.
  await page.keyboard.press('Escape');
  await clickTab(page, 'Help');
  await page.keyboard.press(`${M}+KeyG`);
  await expect(page.locator('#findbar')).toBeHidden();
  expect((await page.evaluate(() => window.__seen)).at(-1)).toBe(false);
});

test('a search that finds nothing comes back as it was typed, not as its last matching prefix', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, 'what a day it is today');
  await setCursor(page, 0);
  await page.keyboard.press(`${M}+KeyF`);
  await page.keyboard.type('whatever');
  await expect(page.locator('#find-count')).toHaveText('No results');
  // The search is still sitting on "what", the last query that did match.
  expect(await cur(page)).toEqual([0, 4]);
  await page.keyboard.press('Escape');
  await page.keyboard.press(`${M}+KeyF`);
  await expect(page.locator('#find-input')).toHaveValue('whatever');
  await expect(page.locator('#find-count')).toHaveText('No results');
  // A selection the user made themselves still fills the field.
  await page.keyboard.press('Escape');
  await selectRange(page, 7, 10);
  await page.keyboard.press(`${M}+KeyF`);
  await expect(page.locator('#find-input')).toHaveValue('day');
});

test('F1 and Shift+Cmd/Ctrl+I open the Help tab', async ({ page, appURL }) => {
  await openFresh(page, appURL); // Help is closed
  await expect(page.locator('.tab', { hasText: 'Help' })).toHaveCount(0);
  await page.keyboard.press('F1');
  await expect(page.locator('.tab.active', { hasText: 'Help' })).toHaveCount(1);
  // Already open and active: the key is harmless.
  await page.keyboard.press('F1');
  await expect(page.locator('.tab', { hasText: 'Help' })).toHaveCount(1);
  await closeTabByName(page, 'Help');
  await expect(page.locator('.tab', { hasText: 'Help' })).toHaveCount(0);
  await page.keyboard.press(`Shift+${M}+KeyI`);
  await expect(page.locator('.tab.active', { hasText: 'Help' })).toHaveCount(1);
  // Neither key reaches past an open dialog.
  await closeTabByName(page, 'Help');
  await page.keyboard.press(`${M}+KeyP`);
  await expect(page.locator('#print-dialog')).toBeVisible();
  await page.keyboard.press('F1');
  await page.keyboard.press(`Shift+${M}+KeyI`);
  await expect(page.locator('.tab', { hasText: 'Help' })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('Cmd/Ctrl+/ shows every shortcut in the platform\'s key names and the interface language; Esc closes it', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await page.keyboard.press(`${M}+Slash`);
  const dlg = page.locator('#keys-dialog');
  await expect(dlg).toBeVisible();
  const text = await page.locator('#keys-body').textContent();
  const mac = process.platform === 'darwin';
  for (const s of mac ? ['⌘J', '⇧⌘X', '⌥⌘1', '⌘↩', '⌘F', '⇧⌘M', '⌘/'] : ['Ctrl+J', 'Ctrl+Shift+X', 'Ctrl+Shift+1', 'Ctrl+Enter', 'Ctrl+F', 'Ctrl+Shift+M', 'Ctrl+/']) expect(text).toContain(s);
  for (const s of ['Reaching the controls', 'Formatting', 'Editing', 'On a task: check / uncheck it', 'A new line below, without splitting the line', 'Find in this tab']) expect(text).toContain(s);
  // One row per action, one <kbd> per key: " / " pairs keys with the label's "previous / next", and the
  // alternatives are joined by the language's "or".
  const row = (label) => page.locator('#keys-body tr', { has: page.locator('td', { hasText: new RegExp(`^${label}$`) }) }).locator('td').first();
  await expect(row('On a tab: rename it')).toHaveText('F2 or R');
  await expect(row('On a tab: rename it').locator('kbd')).toHaveText(['F2', 'R']);
  await expect(row('Next \\/ previous match')).toHaveText(mac ? '⌘G / ⇧⌘G' : 'Ctrl+G / Ctrl+Shift+G or F3 / Shift+F3');
  await expect(row('With text selected: put the pair around it').locator('kbd')).toHaveText(['"', '\u2018', '(', '[', '{']);
  expect(await page.evaluate(() => document.activeElement.id)).toBe('keys-ok');
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await setLang(page, 'fr');
  await page.keyboard.press(`${M}+Slash`);
  expect(await page.locator('#keys-body').textContent()).toContain('Mise en forme');
  await expect(row('Sur un onglet\u00a0: le renommer')).toHaveText('F2 ou R');
  await page.click('#keys-ok');
  await expect(dlg).toBeHidden();
});

test('the editor lets the system do its own text substitutions', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  // On a Mac this attribute gates Text Replacement (System Settings -> Keyboard). Measured in a plain
  // contenteditable: Chromium and Firefox expand a replacement only with it on, and Firefox needs it
  // stated rather than left out. No headless browser has the system behind it, so the attribute is
  // what can be checked here; the expansion itself has to be tried in a real browser.
  const attrs = await page.evaluate(() => {
    const c = document.querySelector('.cm-content');
    return { autocorrect: c.getAttribute('autocorrect'), autocapitalize: c.getAttribute('autocapitalize') };
  });
  expect(attrs.autocorrect).toBe('on');
  expect(attrs.autocapitalize).toBe('off'); // its own switch: an editor should not capitalise for you
});

test('spell check is the browser\u2019s: the app only marks the language of each tab (guessed from its text)', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  const attrs = () => page.evaluate(() => { const c = document.querySelector('.cm-content'); return [c.getAttribute('spellcheck'), c.getAttribute('lang')]; });
  // There is no Spelling setting: CodeMirror's spellcheck="false" is turned back on and the
  // browser's own setting (and its context menu) decides whether to check.
  await expect(page.locator('#spell-cb')).toHaveCount(0);
  await setDoc(page, 'The cat is on the mat and it is happy.');
  await expect.poll(attrs).toEqual(['true', 'en']);
  await addTab(page, 'Note', 'Le chat est sur le tapis et il est content dans la maison.');
  await expect.poll(attrs).toEqual(['true', 'fr']);
  // It follows the text as it is typed, not only when the tab is switched or renamed: a new tab written in
  // French becomes French once typing pauses (the language picks the browser's dictionary).
  await addTab(page, 'Typed');
  await page.locator('.cm-content').click();
  await page.keyboard.type('Nous avons une maison dans la ville et elle est grande pour les enfants.');
  await expect.poll(attrs, { timeout: 4000 }).toEqual(['true', 'fr']);
  await clickTab(page, 'Note');
  await page.reload();
  await expect(page.locator('html[data-ready="1"]')).toHaveCount(1);
  expect(await attrs()).toEqual(['true', 'fr']);
});

test('Reading width: a centred column, only where the text wraps; off by default and kept after a reload', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  const btn = page.locator('#btn-readwidth');
  const box = () => page.evaluate(() => {
    const c = document.querySelector('.cm-content'), s = document.querySelector('.cm-scroller');
    const cr = c.getBoundingClientRect(), sr = s.getBoundingClientRect();
    return { width: Math.round(cr.width), room: Math.round(sr.width), left: Math.round(cr.left - sr.left), right: Math.round(sr.right - cr.right) };
  });
  await setDoc(page, 'word '.repeat(400));
  await expect(page.locator('#editor')).toHaveAttribute('data-read', '0');
  expect((await box()).width).toBe((await box()).room); // full width at first
  await btn.click();
  await expect(page.locator('#editor')).toHaveAttribute('data-read', '1');
  const on = await box();
  expect(on.width).toBeLessThan(on.room);
  expect(Math.abs(on.left - on.right), 'the column is centred').toBeLessThanOrEqual(1);
  // Markdown wraps always, so it keeps the column; its measure follows the Help page (46em).
  await addTab(page, 'M', '# md\n\n' + 'mot '.repeat(400), { md: true });
  await expect(page.locator('#editor')).toHaveAttribute('data-read', '1');
  expect((await box()).width).toBeLessThan((await box()).room);
  // A plain tab with wrap off cannot have a column (a long line would run outside it): unavailable, not on.
  await clickTab(page, 'Untitled 1');
  await page.click('#btn-wrap');
  await expect(btn).toBeDisabled();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await expect(btn).toHaveAttribute('title', /needs Wrap/);
  await expect(page.locator('#editor')).toHaveAttribute('data-read', '0');
  await page.click('#btn-wrap');
  await expect(btn).toBeEnabled();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  // On the Help tab the button is pressed and disabled: that page is a centred column of its own.
  await page.click('#btn-help');
  await expect(page.locator('.tab.active .tab-name')).toHaveText('Help');
  await expect(btn).toBeDisabled();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(btn).toHaveAttribute('title', /Help page is always/);
  // Kept across a reload, like the other global settings.
  await page.reload();
  await expect(page.locator('html[data-ready="1"]')).toHaveCount(1);
  await expect(page.locator('#btn-readwidth')).toHaveAttribute('aria-pressed', 'true');
});
