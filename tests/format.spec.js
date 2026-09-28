// Review additions: formatting bar, Markdown shortcuts, list continuation on Enter.
import { test, expect, openFresh, addTab, clickTab, docText, setDoc, focusEditorEnd, setLang, cursorPos, setCursor, selectRange, openHelp } from './helpers.js';

const view = (fn) => `(() => { const v = document.getElementById('editor').mtView; ${fn} })()`;
const select = (page, from, to) => page.evaluate(view(`v.focus(); v.dispatch({ selection: { anchor: ${from}, head: ${to} } });`));
const fmt = (page, name) => page.click(`.fmt-btn[data-fmt="${name}"]`);
const pressed = (page) => page.evaluate(() => [...document.querySelectorAll('.fmt-btn[aria-pressed="true"]')].map((b) => b.dataset.fmt));

test('formatting bar: inline marks toggle on and off, blocks and lines, link, rule, code block; undoable', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  // Button faces: the strike line runs a little past the S; link is a line icon like the toolbar's; the rule
  // is a line twice as long as the "―" glyph it replaces.
  const faces = await page.evaluate(() => {
    const strike = document.querySelector('.fmt-btn[data-fmt="strike"] .fmt-strike');
    const line = parseFloat(getComputedStyle(strike, '::after').width);
    const rule = document.querySelector('.fmt-btn[data-fmt="hr"] .fmt-rule').getBoundingClientRect();
    const probe = document.createElement('span');
    probe.textContent = '\u2015';
    probe.style.cssText = 'position:absolute;visibility:hidden;font-size:13px';
    document.querySelector('.fmt-btn[data-fmt="hr"]').append(probe);
    const glyph = probe.getBoundingClientRect().width;
    probe.remove();
    const link = document.querySelector('.fmt-btn[data-fmt="link"] svg.icon');
    return { letter: strike.getBoundingClientRect().width, line, rule: rule.width, glyph, link: link && link.dataset.icon, linkStroke: link && getComputedStyle(link).stroke, text: getComputedStyle(link.closest('button')).color };
  });
  expect(faces.line).toBeGreaterThanOrEqual(faces.letter + 4);
  expect(faces.rule).toBeGreaterThanOrEqual(faces.glyph * 1.8);
  expect(faces.rule).toBeLessThanOrEqual(faces.glyph * 2.2);
  expect(faces.link).toBe('link');
  // B, I and S are drawn in a serif face; the other buttons keep the interface font.
  expect(await page.evaluate(() => ['bold', 'italic', 'strike', 'h1', 'code'].map((f) => /serif/.test(getComputedStyle(document.querySelector(`.fmt-btn[data-fmt="${f}"]`)).fontFamily) && !/sans-serif|monospace/.test(getComputedStyle(document.querySelector(`.fmt-btn[data-fmt="${f}"]`)).fontFamily)))).toEqual([true, true, true, false, false]);
  // Two elongated links hooked in the middle, drawn along the 45° diagonal.
  expect(await page.evaluate(() => { const g = document.querySelector('svg[data-icon="link"] g'); return [g.getAttribute('transform'), g.querySelectorAll('path').length]; })).toEqual(['rotate(-45 12 12)', 2]);
  expect(faces.linkStroke).toBe(faces.text);
  // Usable in plain-text tabs too: the Markdown symbols are inserted, nothing is rendered.
  await expect(page.locator('.fmt-btn[data-fmt="bold"]')).toBeEnabled();
  await expect(page.locator('.fmt-btn[data-fmt="bold"]')).toHaveAttribute('title', /^Bold \((⌘|Ctrl\+)B\)$/);
  await setDoc(page, 'plain words');
  await select(page, 6, 11);
  await fmt(page, 'bold');
  await fmt(page, 'highlight');
  expect(await docText(page)).toBe('plain **==words==**');
  await select(page, 0, 0);
  await fmt(page, 'h2');
  await fmt(page, 'quote');
  expect(await docText(page)).toBe('> ## plain **==words==**');
  await expect(page.locator('.mt-strong, .mt-highlight, .mt-h')).toHaveCount(0); // plain text: no rendering
  await setDoc(page, 'x');
  await select(page, 0, 1);
  await page.keyboard.press('ControlOrMeta+b'); // shortcuts too
  await page.keyboard.press('ControlOrMeta+k');
  expect(await docText(page)).toBe('**[x](https://)**');
  await page.click('#btn-md');
  await expect(page.locator('.fmt-btn[data-fmt="bold"]')).toBeEnabled();

  await setDoc(page, 'hello world');
  await select(page, 6, 11);
  await fmt(page, 'bold');
  expect(await docText(page)).toBe('hello **world**');
  await fmt(page, 'italic'); // bold + italic
  expect(await docText(page)).toBe('hello **_world_**'); // italic is written with underscores
  await fmt(page, 'bold'); // removes only the bold
  expect(await docText(page)).toBe('hello _world_');
  await fmt(page, 'italic');
  expect(await docText(page)).toBe('hello world');
  await fmt(page, 'strike');
  expect(await docText(page)).toBe('hello ~~world~~');
  await fmt(page, 'strike');
  await fmt(page, 'highlight');
  expect(await docText(page)).toBe('hello ==world==');
  await fmt(page, 'highlight');
  expect(await docText(page)).toBe('hello world');
  await page.keyboard.press('ControlOrMeta+Shift+KeyH');
  expect(await docText(page)).toBe('hello ==world==');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await docText(page)).toBe('hello world');
  await fmt(page, 'code');
  expect(await docText(page)).toBe('hello `world`');
  // The editor keeps focus and the selection after a click.
  expect(await page.evaluate(() => document.activeElement.classList.contains('cm-content'))).toBe(true);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await docText(page)).toBe('hello world');

  // Headings on the current line: H2, then H3 replaces it, then H3 again removes it.
  await select(page, 2, 2);
  await fmt(page, 'h2');
  expect(await docText(page)).toBe('## hello world');
  await fmt(page, 'h3');
  expect(await docText(page)).toBe('### hello world');
  await fmt(page, 'h3');
  expect(await docText(page)).toBe('hello world');
  await fmt(page, 'h1');
  expect(await docText(page)).toBe('# hello world');

  // Lists and quotes on several lines.
  await setDoc(page, 'one\ntwo\nthree');
  await select(page, 0, 13);
  await fmt(page, 'ul');
  expect(await docText(page)).toBe('- one\n- two\n- three');
  await fmt(page, 'ol'); // numbered replaces bullets
  expect(await docText(page)).toBe('1. one\n2. two\n3. three');
  await fmt(page, 'ol');
  expect(await docText(page)).toBe('one\ntwo\nthree');
  await select(page, 0, 7);
  await fmt(page, 'quote');
  expect(await docText(page)).toBe('> one\n> two\nthree');
  await fmt(page, 'quote');
  expect(await docText(page)).toBe('one\ntwo\nthree');

  // Code block around lines, link around a word, rule after a line.
  await select(page, 0, 7);
  await fmt(page, 'codeblock');
  expect(await docText(page)).toBe('```\none\ntwo\n```\nthree');
  await setDoc(page, 'see site');
  await select(page, 4, 8);
  await fmt(page, 'link');
  expect(await docText(page)).toBe('see [site](https://)');
  expect(await page.evaluate(view('return v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to);'))).toBe('https://');
  await page.keyboard.type('example.com');
  expect(await docText(page)).toBe('see [site](example.com)');
  await select(page, 2, 2);
  await fmt(page, 'hr');
  expect(await docText(page)).toBe('see [site](example.com)\n\n---\n');

  // Keyboard shortcuts in Markdown mode.
  await setDoc(page, 'word');
  await select(page, 0, 4);
  await page.keyboard.press('ControlOrMeta+b');
  expect(await docText(page)).toBe('**word**');
  await page.keyboard.press('ControlOrMeta+i');
  expect(await docText(page)).toBe('**_word_**');
  await setDoc(page, 'x');
  await select(page, 0, 1);
  await page.keyboard.press('ControlOrMeta+k');
  expect(await docText(page)).toBe('[x](https://)');

  // Tooltips are translated.
  await setLang(page, 'fr');
  await expect(page.locator('.fmt-btn[data-fmt="bold"]')).toHaveAttribute('title', /^Gras \((⌘|Ctrl\+)B\)$/);
  await expect(page.locator('.fmt-btn[data-fmt="highlight"]')).toHaveAttribute('title', /^Surligner \((⇧⌘|Ctrl\+Maj\+)H\)$/);
  await expect(page.locator('#formatbar')).toHaveAttribute('aria-label', 'Onglet actif\u00A0: mode, annulation et mise en forme');
});

test('current-tab bar order: mode │ undo redo │ inline marks and link │ headings │ lists and quote │ code block and rule', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  const items = await page.evaluate(() => [...document.querySelectorAll('#formatbar .fmt-part')].map((p) => [...p.querySelectorAll('.fmt-group')]
    .map((g) => [...g.querySelectorAll('button')].map((e) => e.dataset.fmt || e.dataset.hist || (e.id === 'btn-md' ? 'mode' : '?')).join(' ')).join(' | ')));
  // Two halves: the second one (headings onwards) moves to a new row as a whole in narrow windows.
  expect(items).toEqual(['mode | undo redo | bold italic strike highlight code link', 'h1 h2 h3 | ul ol tasklist quote | codeblock hr']);
});

test('undo and redo buttons: per tab, in both modes, enabled only when there is something to undo or redo; keep the editor focused', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  const undoBtn = page.locator('#btn-undo'), redoBtn = page.locator('#btn-redo');
  // Line icons like the link icon: curved arrows, text colour, 16px, no fill.
  const icons = await page.evaluate(() => ['undo', 'redo'].map((n) => {
    const svg = document.querySelector(`#btn-${n} svg.icon`);
    const r = svg.getBoundingClientRect();
    return { name: svg.dataset.icon, size: [r.width, r.height], stroke: getComputedStyle(svg).stroke, fill: getComputedStyle(svg).fill, text: getComputedStyle(document.body).color };
  }));
  for (const [i, n] of [[0, 'undo'], [1, 'redo']]) {
    expect(icons[i].name).toBe(n);
    expect(icons[i].size).toEqual([16, 16]);
    expect(icons[i].stroke).toBe(icons[i].text);
    expect(icons[i].fill).toBe('none');
  }
  // Nothing to undo in a fresh tab.
  await expect(undoBtn).toBeDisabled();
  await expect(redoBtn).toBeDisabled();
  await expect(undoBtn).toHaveAttribute('title', /^Undo \((⌘|Ctrl\+)Z\)$/);
  await expect(redoBtn).toHaveAttribute('aria-label', process.platform === 'darwin' ? 'Redo (⇧⌘Z)' : 'Redo (Ctrl+Y)'); // each platform's own
  // Plain-text tab: undo / redo work (like the formatting buttons).
  await focusEditorEnd(page);
  await page.keyboard.type('one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('two');
  await expect(page.locator('.fmt-btn[data-fmt="bold"]')).toBeEnabled();
  await expect(undoBtn).toBeEnabled();
  await expect(redoBtn).toBeDisabled();
  await undoBtn.click();
  expect(await docText(page)).not.toBe('one\ntwo');
  expect(await page.evaluate(() => document.activeElement.classList.contains('cm-content'))).toBe(true); // focus stays in the editor
  await expect(redoBtn).toBeEnabled();
  while (await undoBtn.isEnabled()) await undoBtn.click();
  expect(await docText(page)).toBe('');
  await expect(undoBtn).toBeDisabled();
  while (await redoBtn.isEnabled()) await redoBtn.click();
  expect(await docText(page)).toBe('one\ntwo');
  await expect(redoBtn).toBeDisabled();
  // Keyboard undo updates the buttons too.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(redoBtn).toBeEnabled();
  await page.keyboard.press('ControlOrMeta+Shift+KeyZ');
  await expect(redoBtn).toBeDisabled();
  // Per tab: a new tab has no history; going back restores the first tab's state.
  await page.click('#btn-new');
  await expect(undoBtn).toBeDisabled();
  await expect(redoBtn).toBeDisabled();
  await clickTab(page, 'Untitled 1');
  await expect(undoBtn).toBeEnabled();
  // Markdown tab: undoes a formatting click, and the mode toggle keeps the history.
  await page.click('#btn-md');
  await expect(undoBtn).toBeEnabled();
  await select(page, 0, 3);
  await fmt(page, 'bold');
  expect(await docText(page)).toBe('**one**\ntwo');
  await undoBtn.click();
  expect(await docText(page)).toBe('one\ntwo');
  await redoBtn.click();
  expect(await docText(page)).toBe('**one**\ntwo');
  // The Help tab never offers undo.
  await page.evaluate(() => document.getElementById('btn-help').click());
  await expect(page.locator('.tab.active .tab-name')).toHaveText('Help');
  await expect(undoBtn).toBeDisabled();
  await expect(redoBtn).toBeDisabled();
  // Translated.
  await clickTab(page, 'Untitled 1');
  await setLang(page, 'fr');
  await expect(undoBtn).toHaveAttribute('title', /^Annuler \((⌘|Ctrl\+)Z\)$/);
  await expect(redoBtn).toHaveAttribute('title', process.platform === 'darwin' ? 'Rétablir (⇧⌘Z)' : 'Rétablir (Ctrl+Y)');
});

test('Enter continues Markdown lists; an empty item ends the list or moves a nested item up; plain mode is untouched', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await page.click('#btn-md');
  await focusEditorEnd(page);
  await page.keyboard.type('- one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('two');
  expect(await docText(page)).toBe('- one\n- two');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab'); // nest the new item
  await page.keyboard.type('nested');
  expect(await docText(page)).toBe('- one\n- two\n  - nested');
  await page.keyboard.press('Enter');
  expect(await docText(page)).toBe('- one\n- two\n  - nested\n  - ');
  await page.keyboard.press('Enter'); // empty nested item: back one level
  expect(await docText(page)).toBe('- one\n- two\n  - nested\n- ');
  await page.keyboard.press('Enter'); // empty top-level item: the list ends
  expect(await docText(page)).toBe('- one\n- two\n  - nested\n');
  await page.keyboard.type('1. first');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second');
  await page.keyboard.press('Enter');
  expect(await docText(page)).toBe('- one\n- two\n  - nested\n1. first\n2. second\n3. ');
  // Enter in the middle of an item splits it into two items.
  await setDoc(page, '- alpha beta');
  await page.evaluate(view('v.focus(); v.dispatch({ selection: { anchor: 8 } });'));
  await page.keyboard.press('Enter');
  expect(await docText(page)).toBe('- alpha \n- beta');
  // Inside a code block, Enter is a plain line break.
  await setDoc(page, '```\n- code');
  await focusEditorEnd(page);
  await page.keyboard.press('Enter');
  expect(await docText(page)).toBe('```\n- code\n');
  // Quotes continue too; an empty quote line leaves one level; a list inside a quote continues inside it.
  await setDoc(page, '> first');
  await focusEditorEnd(page);
  await page.keyboard.press('Enter');
  await page.keyboard.type('second');
  expect(await docText(page)).toBe('> first\n> second');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  expect(await docText(page)).toBe('> first\n> second\n');
  await setDoc(page, '> > deep');
  await focusEditorEnd(page);
  await page.keyboard.press('Enter');
  expect(await docText(page)).toBe('> > deep\n> > ');
  await page.keyboard.press('Enter');
  expect(await docText(page)).toBe('> > deep\n> ');
  await setDoc(page, '> - a');
  await focusEditorEnd(page);
  await page.keyboard.press('Enter');
  await page.keyboard.type('b');
  expect(await docText(page)).toBe('> - a\n> - b');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // empty item in a quote: the list ends, the quote goes on
  expect(await docText(page)).toBe('> - a\n> - b\n> ');
  // Task items continue unchecked; Backspace right after a marker removes it.
  await setDoc(page, '- [x] done');
  await focusEditorEnd(page);
  await page.keyboard.press('Enter');
  expect(await docText(page)).toBe('- [x] done\n- [ ] ');
  await page.keyboard.press('Backspace');
  expect(await docText(page)).toBe('- [x] done\n');
  await setDoc(page, '1. one\n   2. two');
  await page.evaluate(view('v.focus(); v.dispatch({ selection: { anchor: 13 } });')); // after "   2. "
  await page.keyboard.press('Backspace');
  expect(await docText(page)).toBe('1. one\n   two');
  await setDoc(page, '> > quoted');
  await page.evaluate(view('v.focus(); v.dispatch({ selection: { anchor: 4 } });'));
  await page.keyboard.press('Backspace');
  expect(await docText(page)).toBe('> quoted');
});

test('plain-text tabs auto-complete bullets, numbers and quotes too; Tab indents list items; line shortcuts', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await focusEditorEnd(page);
  await page.keyboard.type('- one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('two');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('nested');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // empty nested item: one level up
  await page.keyboard.press('Enter'); // empty item: the list ends
  expect(await docText(page)).toBe('- one\n- two\n  - nested\n');
  await page.keyboard.type('> quote');
  await page.keyboard.press('Enter');
  await page.keyboard.type('more');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('9. nine');
  await page.keyboard.press('Enter');
  expect(await docText(page)).toBe('- one\n- two\n  - nested\n> quote\n> more\n9. nine\n10. ');
  // Outside lists, Tab still inserts a tab character and Enter a plain line break.
  await setDoc(page, 'plain');
  await focusEditorEnd(page);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  expect(await docText(page)).toBe('plain\t\n');
  // Line shortcuts: move, duplicate, delete.
  await setDoc(page, 'a\nb\nc');
  await page.evaluate(view('v.focus(); v.dispatch({ selection: { anchor: 0 } });'));
  await page.keyboard.press('Alt+ArrowDown');
  expect(await docText(page)).toBe('b\na\nc');
  await page.keyboard.press('Shift+Alt+ArrowDown');
  expect(await docText(page)).toBe('b\na\na\nc');
  await page.keyboard.press('Shift+ControlOrMeta+KeyK');
  expect(await docText(page)).toBe('b\na\nc');
  // Indent / outdent, select the line, Cmd/Ctrl+Enter (a new line below, outside tasks).
  await setCursor(page, 2); // on "a"
  await page.keyboard.press('ControlOrMeta+BracketRight');
  expect(await docText(page)).toBe('b\n\ta\nc');
  await page.keyboard.press('ControlOrMeta+BracketLeft');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+l' : 'Alt+l');
  expect(await page.evaluate(view('return v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to);'))).toBe('a\n');
  await setCursor(page, 2);
  await page.keyboard.press('ControlOrMeta+Enter');
  expect(await docText(page)).toBe('b\na\n\nc');
  // No extra cursors (multiple cursors are out of scope): CodeMirror's Cmd/Ctrl+Option/Alt+↑ ↓ are not bound.
  await setCursor(page, 2);
  await page.keyboard.press('ControlOrMeta+Alt+ArrowDown');
  await page.keyboard.press('ControlOrMeta+Alt+ArrowUp');
  expect(await page.evaluate(view('return v.state.selection.ranges.length;'))).toBe(1);
});

// Shortcuts (both modes), with the platform's own keys: run as a Mac and as Windows (navigator.platform).
for (const [platform, mac] of [['MacIntel', true], ['Win32', false]]) {
  test(`formatting shortcuts and their tooltips (${mac ? 'Mac' : 'Windows'} keys)`, async ({ page, appURL }) => {
    await page.addInitScript((p) => Object.defineProperty(Navigator.prototype, 'platform', { get: () => p }), platform);
    await openFresh(page, appURL);
    const M = mac ? 'Meta' : 'Control';
    const press = (k) => page.keyboard.press(k);
    const check = async (doc, from, to, keys, want) => {
      await setDoc(page, doc);
      await select(page, from, to);
      await press(keys);
      expect(await docText(page), `${keys} on "${doc}"`).toBe(want);
    };
    for (const mode of ['plain', 'md']) {
      if (mode === 'md') await page.click('#btn-md');
      await check('abc', 0, 3, `${M}+Shift+KeyX`, '~~abc~~');
      await check('abc', 0, 3, `${M}+KeyE`, '`abc`');
      await check('`abc`', 1, 4, `${M}+KeyE`, 'abc'); // again: removed
      await check('title', 2, 2, mac ? 'Meta+Alt+Digit1' : 'Control+Shift+Digit1', '# title');
      await check('title', 2, 2, mac ? 'Meta+Alt+Digit2' : 'Control+Shift+Digit2', '## title');
      await check('## title', 4, 4, mac ? 'Meta+Alt+Digit3' : 'Control+Shift+Digit3', '### title');
      // 4 to 6: shortcuts only (no buttons).
      await check('title', 2, 2, mac ? 'Meta+Alt+Digit4' : 'Control+Shift+Digit4', '#### title');
      await check('title', 2, 2, mac ? 'Meta+Alt+Digit5' : 'Control+Shift+Digit5', '##### title');
      await check('###### title', 8, 8, mac ? 'Meta+Alt+Digit6' : 'Control+Shift+Digit6', 'title'); // again: removed
      await check('x', 1, 1, `${M}+Shift+Minus`, 'x\n\n---\n'); // the key right of 0, by position
      // Word and Google Docs' list keys, by position: 8 bullets, 7 numbers, 9 tasks.
      await check('item', 0, 0, `${M}+Shift+Digit8`, '- item');
      await check('item', 0, 0, `${M}+Shift+Digit7`, '1. item');
      await check('item', 0, 0, `${M}+Shift+Digit9`, '- [ ] item');
      // A new line above, with the line's indentation (Cmd/Ctrl+Enter makes one below).
      await check('\tx\ny', 2, 2, `${M}+Shift+Enter`, '\t\n\tx\ny');
      // Caps Lock with Shift: the letter arrives in lower case. It must still be the shifted shortcut
      // (off a Mac, CodeMirror would otherwise match the unshifted one: a link instead of delete line,
      // inline code instead of a code block).
      await check('a\nb', 0, 0, `${M}+Shift+k`, 'b');
      await check('solo', 0, 0, `${M}+Shift+e`, '```\nsolo\n```');
      // Lists, quote: the selected lines, or the line the cursor is in. In a Markdown tab a blank line ends a
      // new item that paragraph text follows, which Markdown would otherwise swallow into it.
      const sep = mode === 'md' ? '\n' : '';
      await check('one\ntwo', 2, 2, `${M}+Shift+KeyL`, `- one\n${sep}two`);
      await check('- one\ntwo', 3, 3, `${M}+Shift+KeyL`, 'one\ntwo');
      await check('one\ntwo', 5, 5, `${M}+Shift+KeyO`, 'one\n1. two');
      await check('one\ntwo', 0, 7, `${M}+Shift+KeyL`, '- one\n- two');
      await check('- one\n- two', 0, 11, `${M}+Shift+KeyL`, 'one\ntwo');
      await check('one\ntwo', 0, 7, `${M}+Shift+KeyO`, '1. one\n2. two');
      await check('one', 2, 2, `${M}+Shift+KeyC`, '> one');
      await check('one', 0, 3, `${M}+Shift+KeyC`, '> one');
      // Task list: on the selected lines or the cursor's line; again, removed.
      await check('one\ntwo', 0, 7, `${M}+Shift+KeyA`, '- [ ] one\n- [ ] two');
      await check('- [ ] one\n- [x] two', 0, 15, `${M}+Shift+KeyA`, 'one\ntwo');
      await check('one', 1, 1, `${M}+Shift+KeyA`, '- [ ] one');
      // Code block, like the button: the selected lines, the block around the cursor, or inside a block (removes it).
      await check('a\nb', 1, 1, `${M}+Shift+KeyE`, '```\na\nb\n```');
      await check('a\nb', 0, 3, `${M}+Shift+KeyE`, '```\na\nb\n```');
      await check('x\n```\na\nb\n```\ny', 7, 7, `${M}+Shift+KeyE`, 'x\na\nb\ny');
      // On an empty line the cursor ends up after the mark (in the new block for a code block), ready to type.
      for (const [keys, want] of [
        [mac ? 'Meta+Alt+Digit1' : 'Control+Shift+Digit1', '# '], [mac ? 'Meta+Alt+Digit3' : 'Control+Shift+Digit3', '### '],
        [`${M}+Shift+KeyL`, '- '], [`${M}+Shift+KeyO`, '1. '], [`${M}+Shift+KeyA`, '- [ ] '], [`${M}+Shift+KeyC`, '> '], [`${M}+Shift+KeyE`, '```\n\n```'],
      ]) {
        // A list item there, in a Markdown tab, keeps "b" apart with a blank line of its own (see the list rule).
        const gap = sep && /^(- |1\. )/.test(want) ? '\n' : '';
        await check('a\n\nb', 2, 2, keys, `a\n${want}\n${gap}b`);
        expect(await cursorPos(page), `${keys} cursor`).toBe(2 + (want.startsWith('```') ? 4 : want.length));
        await page.keyboard.type('x');
        expect(await docText(page), `${keys} then typing`).toBe(`a\n${want.startsWith('```') ? '```\nx\n```' : want + 'x'}\n${gap}b`);
      }
      if (mode === 'md') await page.click('#btn-md');
    }
    // Tooltips name the keys in the platform's order.
    const tip = (f) => page.locator(`.fmt-btn[data-fmt="${f}"]`).getAttribute('title');
    const want = mac
      ? { bold: 'Bold (⌘B)', italic: 'Italic (⌘I)', strike: 'Strikethrough (⇧⌘X)', code: 'Inline code (⌘E)', h1: 'Heading 1 (⌥⌘1)', ul: 'Bullet list (⇧⌘L)', ol: 'Numbered list (⇧⌘O)', tasklist: 'Task list (⇧⌘A)', quote: 'Quote (⇧⌘C)', codeblock: 'Code block (⇧⌘E)', hr: 'Horizontal rule (⇧⌘-)' }
      : { bold: 'Bold (Ctrl+B)', italic: 'Italic (Ctrl+I)', strike: 'Strikethrough (Ctrl+Shift+X)', code: 'Inline code (Ctrl+E)', h1: 'Heading 1 (Ctrl+Shift+1)', ul: 'Bullet list (Ctrl+Shift+L)', ol: 'Numbered list (Ctrl+Shift+O)', tasklist: 'Task list (Ctrl+Shift+A)', quote: 'Quote (Ctrl+Shift+C)', codeblock: 'Code block (Ctrl+Shift+E)', hr: 'Horizontal rule (Ctrl+Shift+-)' };
    for (const [f, w] of Object.entries(want)) expect(await tip(f)).toBe(w);
    await expect(page.locator('#btn-redo')).toHaveAttribute('title', mac ? 'Redo (⇧⌘Z)' : 'Redo (Ctrl+Y)');
    // Shift+Cmd/Ctrl+M switches the active tab between plain text and Markdown, from the text or from a bar.
    await expect(page.locator('#btn-md')).toHaveAttribute('title', mac ? 'This tab is plain text: click for Markdown (⇧⌘M)' : 'This tab is plain text: click for Markdown (Ctrl+Shift+M)');
    await setDoc(page, 'x');
    await select(page, 1, 1);
    await press(`${M}+Shift+KeyM`);
    await expect(page.locator('#btn-md')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#btn-help').focus();
    await press(`${M}+Shift+KeyM`);
    await expect(page.locator('#btn-md')).toHaveAttribute('aria-pressed', 'false');
    expect(await docText(page)).toBe('x');
    await setLang(page, 'fr');
    expect(await tip('strike')).toBe(mac ? 'Barré (⇧⌘X)' : 'Barré (Ctrl+Maj+X)');
    expect(await tip('hr')).toBe(mac ? 'Ligne horizontale (⇧⌘-)' : 'Ligne horizontale (Ctrl+Maj+-)');
    expect(await tip('tasklist')).toBe(mac ? 'Liste de tâches (⇧⌘A)' : 'Liste de tâches (Ctrl+Maj+A)');
  });
}

test('italic is written with underscores (asterisks inside a word); either mark is recognised and removed', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  for (const mode of ['plain', 'md']) {
    if (mode === 'md') await page.click('#btn-md');
    for (const [doc, from, to, want] of [
      ['hello world', 6, 11, 'hello _world_'], ['bold', 1, 3, 'b*ol*d'], ['a _it_ b', 3, 5, 'a it b'], ['a *it* b', 3, 5, 'a it b'],
      ['a _it_ b', 2, 6, 'a it b'], ['a *it* b', 2, 6, 'a it b'], ['a __b__ c', 4, 5, 'a __*b*__ c'],
    ]) {
      await setDoc(page, doc);
      await select(page, from, to);
      await fmt(page, 'italic');
      expect(await docText(page), `${mode} "${doc}"`).toBe(want);
    }
    if (mode === 'md') await page.click('#btn-md');
  }
  // Rendered as italic in Markdown tabs, both ways; __x__ is bold.
  await page.click('#btn-md');
  await setDoc(page, 'a _one_ b *two* c __three__\n\nx');
  await page.evaluate(() => document.getElementById('editor').mtView.contentDOM.blur());
  await expect(page.locator('.mt-em')).toHaveCount(2);
  await expect(page.locator('.mt-strong')).toHaveCount(1);
});

test('code block button: fences the selection, removes the block around the cursor, shows as pressed inside a block', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await page.click('#btn-md');
  await setDoc(page, 'before\n```js\ncode\n```\nafter');
  await select(page, 13, 13); // in "code"
  await expect(page.locator('.fmt-btn[data-fmt="codeblock"]')).toHaveAttribute('aria-pressed', 'true');
  await fmt(page, 'codeblock');
  expect(await docText(page)).toBe('before\ncode\nafter');
  await expect(page.locator('.fmt-btn[data-fmt="codeblock"]')).toHaveAttribute('aria-pressed', 'false');
  // An unterminated block (to the end of the text) loses its opening fence.
  await setDoc(page, 'x\n```\nopen');
  await select(page, 8, 8);
  await fmt(page, 'codeblock');
  expect(await docText(page)).toBe('x\nopen');
  // No selection on an empty line: an empty block, the cursor inside.
  await setDoc(page, '');
  await fmt(page, 'codeblock');
  expect(await docText(page)).toBe('```\n\n```');
});

test('quote and code block take the block around the cursor; task list button; the cursor follows a mark inserted on an empty line', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  const doc = 'x\n\none\ntwo\n\ny';
  for (const mode of ['plain', 'md']) {
    if (mode === 'md') await page.click('#btn-md');
    // Quote: every line of the paragraph gets "> " (not only the first), the cursor stays in its text; again, removed.
    await setDoc(page, doc);
    await setCursor(page, 10); // end of "two"
    await fmt(page, 'quote');
    expect(await docText(page), mode).toBe('x\n\n> one\n> two\n\ny');
    expect(await cursorPos(page)).toBe(14);
    await fmt(page, 'quote');
    expect(await docText(page), mode).toBe(doc);
    // A paragraph quoted on its first line only (the rest follows it, "lazily"): the other lines get their mark.
    await setDoc(page, '> one\ntwo\nthree');
    await setCursor(page, 8);
    await fmt(page, 'quote');
    expect(await docText(page), mode).toBe('> one\n> two\n> three');
    // A selection: only the selected lines, as before.
    await setDoc(page, doc);
    await selectRange(page, 3, 4);
    await fmt(page, 'quote');
    expect(await docText(page), mode).toBe('x\n\n> one\ntwo\n\ny');
    // Code block: fences around the paragraph, the cursor where it was in the text; at the start of a line too.
    await setDoc(page, doc);
    await setCursor(page, 4);
    await fmt(page, 'codeblock');
    expect(await docText(page), mode).toBe('x\n\n```\none\ntwo\n```\n\ny');
    expect(await cursorPos(page)).toBe(8);
    await fmt(page, 'codeblock'); // pressed inside: removed
    expect(await docText(page), mode).toBe(doc);
    await setDoc(page, 'solo');
    await setCursor(page, 0);
    await page.keyboard.press('ControlOrMeta+Shift+KeyE');
    expect(await docText(page), mode).toBe('```\nsolo\n```');
    // Buttons on an empty line: the cursor after the mark, like the shortcuts. A list item made there in a
    // Markdown tab takes the place of the blank line that kept "b" apart, so a new blank line keeps it apart.
    for (const [f, mark] of [['h2', '## '], ['ul', '- '], ['ol', '1. '], ['tasklist', '- [ ] '], ['quote', '> ']]) {
      await setDoc(page, 'a\n\nb');
      await setCursor(page, 2);
      await fmt(page, f);
      await page.keyboard.type('z');
      const list = ['ul', 'ol', 'tasklist'].includes(f) && mode === 'md';
      expect(await docText(page), `${mode} ${f}`).toBe(`a\n${mark}z\n${list ? '\n' : ''}b`);
    }
    await setDoc(page, 'a\n\nb');
    await setCursor(page, 2);
    await fmt(page, 'codeblock');
    await page.keyboard.type('z');
    expect(await docText(page), `${mode} codeblock`).toBe('a\n```\nz\n```\nb');
    // Task list: a bullet or a number keeps its marker; bullet and numbered lists replace a task; pressed on a task.
    for (const [src, f, want] of [
      ['one', 'tasklist', '- [ ] one'], ['- one', 'tasklist', '- [ ] one'], ['* one', 'tasklist', '* [ ] one'], ['1. one', 'tasklist', '1. [ ] one'],
      ['- [x] one', 'tasklist', 'one'], ['1. [ ] one', 'tasklist', 'one'], ['- [ ] one', 'ul', '- one'], ['- [x] one', 'ol', '1. one'],
      ['  - one', 'tasklist', '  - [ ] one'],
    ]) {
      await setDoc(page, src);
      await setCursor(page, src.length);
      await fmt(page, f);
      expect(await docText(page), `${mode} ${f} on "${src}"`).toBe(want);
    }
    await setDoc(page, '- [ ] todo\n- [x] done\n1. [ ] first\n- [ ]\n- item');
    for (const [pos, want] of [[3, ['tasklist']], [15, ['tasklist']], [27, ['tasklist']], [36, ['tasklist']], [41, ['ul']]]) {
      await setCursor(page, pos);
      expect(await pressed(page), `${mode} @${pos}`).toEqual(want);
    }
    if (mode === 'md') await page.click('#btn-md');
  }
  // A check mark in a box, a line icon like the link's.
  const icon = await page.evaluate(() => {
    const svg = document.querySelector('.fmt-btn[data-fmt="tasklist"] svg.icon');
    const r = svg.getBoundingClientRect();
    return [svg.dataset.icon, svg.querySelectorAll('rect').length, svg.querySelectorAll('path').length, r.width, r.height, getComputedStyle(svg).fill];
  });
  expect(icon).toEqual(['tasklist', 1, 1, 16, 16, 'none']);
  // Undo reverts a formatting in one step; Help and the shortcut sheet list the new key.
  await setDoc(page, 'a');
  await setCursor(page, 1);
  await fmt(page, 'tasklist');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await docText(page)).toBe('a');
  await page.keyboard.press('ControlOrMeta+/');
  await expect(page.locator('#keys-body')).toContainText('Task list');
  await page.keyboard.press('Escape');
  await openHelp(page);
  expect(await docText(page)).toMatch(/Task list \| `(⇧⌘|Ctrl\+Shift\+)A`, `(⇧⌘|Ctrl\+Shift\+)9`/);
  await expect(page.locator('#help-view tr', { hasText: 'Task list' }).locator('svg[data-icon="tasklist"]')).toHaveCount(1);
});

test('without a selection, the inline formats and the link take the word at the cursor (both modes); the cursor stays in it', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  for (const mode of ['plain', 'md']) {
    if (mode === 'md') await page.click('#btn-md');
    for (const [doc, pos, f, want] of [
      ['hello world', 2, 'bold', '**hello** world'], ['hello world', 5, 'bold', '**hello** world'], ['hello world', 6, 'italic', 'hello _world_'],
      ['re-use it', 3, 'strike', '~~re-use~~ it'], ['snake_case x', 2, 'code', '`snake_case` x'], ['it costs 1,000.50 now', 11, 'bold', 'it costs **1,000.50** now'],
      ['wait... ok', 2, 'bold', '**wait**... ok'], ['end, then', 1, 'bold', '**end**, then'], ['see example.com.', 6, 'bold', 'see **example.com**.'],
      ['#tag and', 2, 'highlight', '==#tag== and'], ['hi @name', 5, 'strike', 'hi ~~@name~~'], ['mail me@example.com', 8, 'bold', 'mail **me@example.com**'],
      ["c'est aujourd'hui", 9, 'bold', "c'est **aujourd'hui**"], ['l’été', 3, 'italic', '_l’été_'], ['(word)', 3, 'bold', '(**word**)'],
      ['x  y', 2, 'bold', 'x **** y'], ['- item', 1, 'bold', '-**** item'], ['a --- b', 3, 'code', 'a -``-- b'],
      ['a **bold** b', 5, 'bold', 'a bold b'], ['word', 2, 'link', '[word](https://)'], ['x  y', 2, 'link', 'x [link](https://) y'],
    ]) {
      await setDoc(page, doc);
      await setCursor(page, pos);
      await fmt(page, f);
      expect(await docText(page), `${mode} ${f} @${pos} "${doc}"`).toBe(want);
    }
    // The cursor stays where it was in the word; one undo step; the shortcut does the same.
    await setDoc(page, 'hello world');
    await setCursor(page, 8);
    await page.keyboard.press('ControlOrMeta+b');
    expect(await docText(page)).toBe('hello **world**');
    expect(await cursorPos(page)).toBe(10);
    await page.keyboard.type('X');
    expect(await docText(page)).toBe('hello **woXrld**');
    await page.keyboard.press('ControlOrMeta+z');
    await page.keyboard.press('ControlOrMeta+z');
    expect(await docText(page)).toBe('hello world');
    await setCursor(page, 2);
    await page.keyboard.press('ControlOrMeta+k');
    expect(await page.evaluate(view('return v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to);'))).toBe('https://');
    expect(await docText(page)).toBe('[hello](https://) world');
    if (mode === 'md') await page.click('#btn-md');
  }
});

test('lists, tasks and headings go after the quote marks of a quoted line', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  for (const mode of ['plain', 'md']) {
    if (mode === 'md') await page.click('#btn-md');
    for (const [doc, pos, f, want] of [
      ['> one', 3, 'ul', '> - one'], ['> one', 3, 'ol', '> 1. one'], ['> one', 3, 'tasklist', '> - [ ] one'], ['> - one', 4, 'ul', '> one'],
      ['> - one', 4, 'tasklist', '> - [ ] one'], ['> - [ ] one', 8, 'tasklist', '> one'], ['>one', 2, 'ul', '> - one'], ['> > deep', 5, 'ul', '> > - deep'],
      ['> title', 3, 'h2', '> ## title'], ['> ## title', 5, 'h2', '> title'], ['>   - nested', 7, 'ol', '>   1. nested'],
    ]) {
      await setDoc(page, doc);
      await setCursor(page, pos);
      await fmt(page, f);
      expect(await docText(page), `${mode} ${f} on "${doc}"`).toBe(want);
    }
    await setDoc(page, '> quote\n> ');
    await setCursor(page, 10);
    await page.keyboard.press('ControlOrMeta+Shift+KeyL');
    await page.keyboard.type('x');
    expect(await docText(page), mode).toBe('> quote\n> - x');
    if (mode === 'md') await page.click('#btn-md');
  }
});

test('nested lists: the item on the cursor\'s line decides which list button is pressed, anywhere on the line', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  for (const mode of ['plain', 'md']) {
    if (mode === 'md') await page.click('#btn-md');
    for (const [doc, line, want] of [
      ['- [ ] parent\n  - [ ] child', 1, 'tasklist'], ['- [ ] parent\n    - [ ] child', 1, 'tasklist'], ['- plain\n  - [ ] child', 1, 'tasklist'],
      ['1. [ ] one\n   - [ ] child', 1, 'tasklist'], ['- [ ] parent\n  - [ ] child\n  - [x] done', 2, 'tasklist'], ['- [ ] parent\n\t- [ ] child', 1, 'tasklist'],
      ['- [ ] p\n  - [ ] c\n    - [ ] gc', 2, 'tasklist'], ['- a\n  - b\n    - [ ] c', 2, 'tasklist'], ['- [ ] parent\n  - child', 1, 'ul'],
      ['- [ ] parent\n  1. child', 1, 'ol'], ['> - [ ] q\n>   - [ ] child', 1, 'quote,tasklist'], ['> - [ ] q\n>   - plain', 1, 'quote,ul'],
      ['- [ ] task\n  continued', 1, 'tasklist'],
    ]) {
      await setDoc(page, doc);
      const lines = doc.split('\n'), start = lines.slice(0, line).join('\n').length + 1;
      const seen = new Set();
      for (let pos = start; pos <= start + lines[line].length; pos++) { // the indentation and the marker included
        await setCursor(page, pos);
        seen.add((await pressed(page)).sort().join(','));
      }
      expect([...seen], `${mode} ${JSON.stringify(doc)}`).toEqual([want]);
    }
    if (mode === 'md') await page.click('#btn-md');
  }
});
