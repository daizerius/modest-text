// Done when #9 (plain-text paste) plus editor / status bar behaviours.
import { test, expect, openFresh, openApp, addTab, clickTab, docText, setDoc, focusEditorEnd, status, saveNow, setCursor, setLang, rename } from './helpers.js';

// Real clipboard round trip: a genuine click writes HTML + plain flavours with the async Clipboard API
// (as copying from a web page does), then Cmd/Ctrl+V produces a trusted paste event.
async function clipboardPaste(page, { plain, html }) {
  await page.evaluate(({ plain, html }) => {
    const btn = document.createElement('button');
    btn.id = 'mt-test-copy';
    btn.textContent = 'copy';
    btn.style.cssText = 'position:fixed;left:0;bottom:0;z-index:99';
    btn.addEventListener('click', () => {
      const items = {};
      if (html !== undefined) items['text/html'] = new Blob([html], { type: 'text/html' });
      if (plain !== undefined) items['text/plain'] = new Blob([plain], { type: 'text/plain' });
      window.__copied = navigator.clipboard.write([new ClipboardItem(items)]).then(() => 'ok', (e) => String(e));
      btn.remove();
    });
    document.body.append(btn);
  }, { plain, html });
  await page.click('#mt-test-copy');
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe('ok');
  await focusEditorEnd(page);
  await page.keyboard.press('ControlOrMeta+v');
}

const ch = (...codes) => String.fromCharCode(...codes);

test('9. pasting formatted web content inserts plain text only; control characters removed, NBSP and ZWJ kept', async ({ page, appURL }) => {
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  const NBSP = ch(0xa0), ZWJ = ch(0x200d), ZWSP = ch(0x200b);
  await openFresh(page, appURL);
  await clipboardPaste(page, {
    html: '<meta charset="utf-8"><h1 style="color:red">Title</h1><p><b>Bold</b> <i>it</i><img src="http://127.0.0.1:9/x.png"> <a href="https://example.com">link</a></p>',
    plain: `Title${ch(13, 10)}Bold${ch(7)} it link${NBSP}!${ch(0xfeff)}${ch(0x1b)}[0m${ch(13)}👨${ZWJ}👩${ZWJ}👧 end${ch(0x85)}${ZWSP}`,
  });
  await expect.poll(() => docText(page)).toBe(`Title\nBold it link${NBSP}![0m\n👨${ZWJ}👩${ZWJ}👧 end${ZWSP}`);
  expect(await page.locator('.cm-content b, .cm-content i, .cm-content img, .cm-content a, .cm-content h1').count()).toBe(0);
  // HTML-only clipboard data still becomes plain text.
  await clipboardPaste(page, { html: '<p>only <b>html</b></p>' });
  await expect.poll(() => docText(page)).toContain('only html');
  // Same in Markdown mode.
  await page.click('#btn-md');
  await clipboardPaste(page, { html: '<b>x</b>', plain: `\n**md**${ch(2)}` });
  await expect.poll(() => docText(page)).toMatch(/\n\*\*md\*\*$/);
  expect(requests.filter((u) => u.includes('127.0.0.1:9'))).toEqual([]);
});

test('Tab inserts a tab character; in a Markdown list it indents the item; spell check is left to the browser', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  // CodeMirror turns spell check off by default; the app hands it back to the browser, whose own
  // setting (and context menu) then decides. `lang` picks the dictionary.
  await expect(page.locator('.cm-content')).toHaveAttribute('spellcheck', 'true');
  await focusEditorEnd(page);
  await page.keyboard.type('a');
  await page.keyboard.press('Tab');
  await page.keyboard.type('b');
  expect(await docText(page)).toBe('a\tb');
  // Focus stays in the editor.
  expect(await page.evaluate(() => document.activeElement.classList.contains('cm-content'))).toBe(true);
  await addTab(page, 'List', '- one\n- two\n1. first\n2. second', { md: true });
  await setCursor(page, '- one\n- two'.length);
  await page.keyboard.press('Tab');
  expect(await docText(page)).toBe('- one\n  - two\n1. first\n2. second');
  await setCursor(page, '- one\n  - two\n1. first\n2. sec'.length);
  await page.keyboard.press('Tab');
  expect(await docText(page)).toBe('- one\n  - two\n1. first\n   2. second');
  await page.keyboard.press('Shift+Tab');
  expect(await docText(page)).toBe('- one\n  - two\n1. first\n2. second');
  // Outside a list, Markdown mode inserts a tab character too (Enter twice: the first one continues the list).
  await focusEditorEnd(page);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('para');
  await page.keyboard.press('Tab');
  expect((await docText(page)).endsWith('\npara\t')).toBe(true);
});

test('status bar: lines, words and code points, formatted per UI language', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  const counts = page.locator('#st-counts');
  await expect(counts).toHaveText('1 line · 0 words · 0 characters');
  await setDoc(page, 'a b\nc 😀\n');
  await expect(counts).toHaveText('3 lines · 4 words · 8 characters');
  await setDoc(page, 'word '.repeat(260) + 'xx');
  await expect(counts).toHaveText('1 line · 261 words · 1,302 characters');
  await setLang(page, 'fr');
  await expect(counts).toHaveText(/^1 ligne · 261 mots · 1\s302 caractères$/);
  await setDoc(page, 'un\u00A0deux\ttrois\n\nquatre');
  await expect(counts).toHaveText('3 lignes · 4 mots · 21 caractères'); // NBSP separates words
});

test('selection counts follow the document counts while text is selected, in both languages', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, 'one two three\nfour five');
  const sel = page.locator('#st-sel');
  await expect(sel).toBeHidden();
  await page.evaluate(() => { const v = document.getElementById('editor').mtView; v.focus(); v.dispatch({ selection: { anchor: 4, head: 18 } }); });
  await expect(sel).toBeVisible();
  await expect(sel).toHaveText('Selection: 2 lines · 3 words · 14 characters');
  await expect(page.locator('#st-counts')).toHaveText('2 lines · 5 words · 23 characters');
  await page.keyboard.press('ControlOrMeta+a');
  await expect(sel).toHaveText('Selection: 2 lines · 5 words · 23 characters');
  await setLang(page, 'fr');
  await expect(sel).toHaveText('Sélection\u00A0: 2 lignes · 5 mots · 23 caractères');
  await page.evaluate(() => { const v = document.getElementById('editor').mtView; v.dispatch({ selection: { anchor: 3 } }); });
  await expect(sel).toBeHidden();
});

test('inactive tabs with unsaved changes show a red dot (tooltip and accessible name too); the active tab never does', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await addTab(page, 'Other', 'other text');
  await saveNow(page);
  await clickTab(page, 'Untitled 1');
  const tab = page.locator('.tab', { hasText: 'Untitled 1' });
  const other = page.locator('.tab', { hasText: 'Other' });
  // Typing in the active tab: the status bar says Unsaved, the tab itself stays unmarked.
  await focusEditorEnd(page);
  let seen = null;
  for (let i = 0; i < 10 && !seen; i++) {
    await page.keyboard.type('x');
    const r = await page.evaluate(() => [document.getElementById('st-status').textContent, document.querySelector('.tab.active').classList.contains('unsaved')]);
    if (r[0] !== 'Saved') seen = r;
  }
  expect(seen).toEqual(['Unsaved', false]);
  // Make every tab save fail (as when storage is full), then leave the tab: it is marked.
  await page.evaluate(() => {
    window.__setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k.startsWith('modest-text:v1:tab:')) throw new DOMException('full', 'QuotaExceededError');
      return window.__setItem.call(this, k, v);
    };
  });
  await page.keyboard.type('y');
  await clickTab(page, 'Other');
  await expect(tab).toHaveClass(/unsaved/);
  await expect(tab).toHaveAttribute('aria-label', 'Untitled 1 (unsaved changes)');
  await expect(tab).toHaveAttribute('title', /^unsaved changes\n/);
  expect(await tab.locator('.tab-name').evaluate((e) => getComputedStyle(e, '::before').backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await expect(other).not.toHaveClass(/unsaved/);
  // Back in it: no dot on the active tab, the status bar says Save failed.
  await clickTab(page, 'Untitled 1');
  await expect(tab).not.toHaveClass(/unsaved/);
  await expect(status(page)).toHaveText('Save failed');
  // Saving works again: nothing is marked any more.
  await page.evaluate(() => { Storage.prototype.setItem = window.__setItem; });
  await clickTab(page, 'Other');
  await saveNow(page);
  await expect(page.locator('.tab.unsaved')).toHaveCount(0);
  await expect(tab).toHaveAttribute('aria-label', 'Untitled 1');
});

test('status: Unsaved → Saving… → Saved, dot colours, the save time in the dot\'s tooltip, "Last full export: YYYY-MM-DD ∙ hh:mm:ss" beside it', async ({ page, appURL }) => {
  await openApp(page, appURL);
  // Help is not a note: no dot, no export stamp.
  await expect(page.locator('#st-time')).toBeHidden();
  await page.click('#btn-new');
  await expect(status(page)).toHaveText('Saved');
  await focusEditorEnd(page);
  // Status text and dot are read together; retype until the unsaved state is caught (slow drivers).
  let seen = null;
  for (let i = 0; i < 10 && !seen; i++) {
    await page.keyboard.type('x');
    const r = await page.evaluate(() => [document.getElementById('st-status').textContent, document.getElementById('st-dot').className]);
    if (r[0] !== 'Saved') seen = r;
  }
  expect(seen).toEqual(['Unsaved', 'dot dot-red']);
  await expect(status(page)).toHaveText('Saved', { timeout: 3000 });
  await expect(page.locator('#st-dot')).toHaveClass(/dot-green/);
  // Beside the dot: the backup, not the note. Never exported yet.
  await expect(page.locator('#st-export-label')).toHaveText('Last full export:');
  await expect(page.locator('#st-time')).toHaveText('never');
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const dot = page.locator('#st-dot');
  await expect(dot).toHaveAttribute('title', new RegExp(`^Save status: All changes saved to browser storage\\. Last saved: ${today} ∙ `));
  // Export All: the stamp is its time.
  const dl = page.waitForEvent('download');
  await page.click('#btn-export-all');
  await dl;
  const stamp = await page.locator('#st-time').textContent();
  expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2} ∙ \d{2}:\d{2}:\d{2}( \S+)?$/); // the time zone only where Intl has a name for it
  expect(stamp.slice(0, 10)).toBe(today);
  await expect(page.locator('#st-export')).toHaveAttribute('title', /^Last full export: \d{4}-/);
  await expect(page.locator('#st-export')).toHaveAttribute('aria-label', /^Last full export: \d{4}-/);
  await expect(page.locator('#st-export svg[data-icon="export-all"]')).toBeVisible(); // the Export All icon
  await expect(dot).toHaveAttribute('aria-label', /^Save status: /);
  await setLang(page, 'fr');
  await expect(dot).toHaveAttribute('title', /^État de l’enregistrement/);
  await expect(status(page)).toHaveText('Enregistré');
});

test('word wrap: on by default, applies to plain mode, disabled in Markdown mode which always wraps; size applies to both modes', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await expect(page.locator('#btn-wrap')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.cm-content')).toHaveClass(/cm-lineWrapping/);
  await page.click('#btn-wrap');
  await expect(page.locator('.cm-content')).not.toHaveClass(/cm-lineWrapping/);
  await addTab(page, 'M', '# md', { md: true });
  await expect(page.locator('#btn-wrap')).toBeDisabled();
  await expect(page.locator('#btn-wrap')).toHaveAttribute('aria-pressed', 'true'); // Markdown always wraps
  await expect(page.locator('.cm-content')).toHaveClass(/cm-lineWrapping/);
  await page.selectOption('#size-select', '32');
  expect(await page.locator('.cm-editor').evaluate((e) => getComputedStyle(e).fontSize)).toBe('32px');
  await clickTab(page, 'Untitled 1');
  await expect(page.locator('#btn-wrap')).toBeEnabled();
  await expect(page.locator('#btn-wrap')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.cm-content')).not.toHaveClass(/cm-lineWrapping/);
  expect(await page.locator('.cm-editor').evaluate((e) => getComputedStyle(e).fontSize)).toBe('32px');
  const sizes = await page.locator('#size-select option').evaluateAll((os) => os.map((o) => [o.value, o.textContent]));
  expect(sizes).toEqual([['10', '10px · x-small'], ['13', '13px · small'], ['16', '16px · normal'], ['18', '18px · large'], ['24', '24px · x-large'], ['32', '32px · xx-large']]);
});

test('each tab keeps its own cursor, selection and scroll position; switching tabs or renaming never jumps', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, Array.from({ length: 400 }, (_, i) => `line ${i + 1}`).join('\n'));
  // Cursor at the very end, view scrolled back up with the mouse wheel (the cursor is off-screen).
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' end');
  await page.mouse.move(500, 400);
  await page.mouse.wheel(0, -3000);
  const scrollTop = () => page.locator('.cm-scroller').evaluate((e) => Math.round(e.scrollTop));
  await expect.poll(scrollTop).toBeGreaterThan(1000);
  // Under parallel workers the wheel scroll can still be moving; take the position once it holds still.
  let top = -1;
  await expect.poll(async () => { const prev = top; top = await scrollTop(); return top === prev; }, { intervals: [150] }).toBe(true);
  const maxTop = await page.locator('.cm-scroller').evaluate((e) => e.scrollHeight - e.clientHeight);
  expect(top).toBeLessThan(maxTop - 500); // really away from the end
  await addTab(page, 'Other', 'short');
  await clickTab(page, 'Untitled 1');
  await page.waitForTimeout(300); // time for a late jump to show
  await expect.poll(async () => Math.abs((await scrollTop()) - top)).toBeLessThan(5);
  const sel = await page.evaluate(() => document.getElementById('editor').mtView.state.selection.main.head);
  expect(sel).toBe((await docText(page)).length); // the cursor is still at the end
  // Renaming (double-click, Enter) keeps the position too.
  await rename(page, 'Untitled 1', 'Long');
  await page.waitForTimeout(300); // time for a late jump to show
  await expect.poll(async () => Math.abs((await scrollTop()) - top)).toBeLessThan(5);
  // Clicking the active tab again: still no jump.
  await page.locator('.tab.active .tab-name').click();
  await page.waitForTimeout(300); // time for a late jump to show
  await expect.poll(async () => Math.abs((await scrollTop()) - top)).toBeLessThan(5);
});

test('printing: Cmd/Ctrl+P explains in a dialog instead of printing; a print from the menu shows only that message', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, 'some text');
  await focusEditorEnd(page);
  await page.keyboard.press('ControlOrMeta+p');
  const dlg = page.locator('#print-dialog');
  await expect(dlg).toBeVisible();
  expect(await dlg.evaluate((d) => d.open)).toBe(true);
  await expect(page.locator('#print-title')).toHaveText('Printing is not available');
  await expect(page.locator('#print-text')).toContainText('To print a tab, export it with Export');
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  expect(await page.evaluate(() => document.activeElement.classList.contains('cm-content'))).toBe(true);
  expect(await docText(page)).toBe('some text');
  await page.keyboard.press('ControlOrMeta+p');
  await page.click('#print-ok');
  await expect(dlg).toBeHidden();
  // The browser's own print (menu): the page prints only the message, in the UI language.
  await setLang(page, 'fr');
  await page.emulateMedia({ media: 'print' });
  if (await page.evaluate(() => matchMedia('print').matches)) {
    const printed = await page.evaluate(() => ({
      editor: getComputedStyle(document.getElementById('editor')).display,
      topbar: getComputedStyle(document.getElementById('topbar')).display,
      msg: getComputedStyle(document.body, '::after').content,
    }));
    expect(printed.editor).toBe('none');
    expect(printed.topbar).toBe('none');
    expect(printed.msg).toContain('pas pour imprimer');
  } else {
    // Firefox driven over BiDi ignores print-media emulation: check the print rules and the message instead.
    const css = await page.evaluate(() => [...document.styleSheets].flatMap((s) => [...s.cssRules]).filter((r) => r.media && r.media.mediaText === 'print').map((r) => r.cssText).join('\n'));
    expect(css).toMatch(/body > \* \{ display: none !important; \}/);
    expect(css).toMatch(/body::after \{[^}]*content: attr\(data-print-msg\)/);
    expect(await page.evaluate(() => document.body.dataset.printMsg)).toContain('pas pour imprimer');
  }
  await page.emulateMedia({ media: 'screen' });
});

test("the editor does not steal Shift+Option+M / Ctrl+M: Tab keeps inserting a tab (Esc then Tab leaves the text)", async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await focusEditorEnd(page);
  await page.keyboard.press('Shift+Alt+KeyM');
  await page.keyboard.press('Control+KeyM');
  await setDoc(page, '');
  await focusEditorEnd(page);
  await page.keyboard.press('Tab');
  expect(await docText(page)).toBe('\t');
  expect(await page.evaluate(() => document.activeElement.classList.contains('cm-content'))).toBe(true);
});

test('Cmd/Ctrl+U does nothing (no page source, no change to the text or the selection)', async ({ page, context, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, 'abc');
  await focusEditorEnd(page);
  const pages = context.pages().length;
  await page.keyboard.press('ControlOrMeta+u');
  await page.keyboard.press('ControlOrMeta+Shift+KeyU');
  await page.waitForTimeout(300);
  expect(context.pages().length).toBe(pages);
  expect(page.url()).toBe(appURL);
  expect(await docText(page)).toBe('abc');
  expect(await page.evaluate(() => document.getElementById('editor').mtView.state.selection.main.head)).toBe(3);
});

test('narrow window: the status bar drops the document counts first during a selection, then abbreviates step by step, never cutting text', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  const text = ('word '.repeat(9) + '\n').repeat(12000);
  await setDoc(page, text);
  await page.keyboard.press('ControlOrMeta+s');
  const dl = page.waitForEvent('download'); // an Export All, so that the status bar has a stamp to shorten
  await page.click('#btn-export-all');
  await dl;
  await expect(page.locator('#st-counts')).toHaveText('12,001 lines · 108,000 words · 552,000 characters'); // large text: counted after 300 ms
  const read = () => page.evaluate(() => {
    const cut = (el) => el.scrollWidth > el.clientWidth + 1;
    const c = document.getElementById('st-counts'), s = document.getElementById('st-sel');
    return { counts: c.textContent, sel: s.hidden ? '' : s.textContent, time: document.getElementById('st-time').textContent,
      cut: cut(document.getElementById('statusbar')) || (!c.hidden && cut(c)) || (!s.hidden && cut(s)), ellipsis: getComputedStyle(c).textOverflow,
      hidden: c.hidden, sepWidth: parseFloat(getComputedStyle(s).borderLeftWidth) };
  });
  // The two ladders of statusbar.js, read back from what the bar shows: [counts level, stamp level].
  const STEPS_DOC = [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2], [3, 3], [3, 4], [3, 5]];
  const countsLevel = (s) => (s.includes('ln.') ? 3 : s.includes('wds.') ? 2 : s.includes('chars.') ? 1 : 0);
  // A runtime without Intl time-zone data renders level 0 exactly like level 1, so level 0 is only
  // claimed when a zone name is actually there.
  const stampLevel = (t) => (/^\d{4}-\d{2}-\d{2} ∙ \d{2}:\d{2}:\d{2} \S+$/.test(t) ? 0 : /^\d{4}-\d{2}-\d{2} ∙ \d{2}:\d{2}:\d{2}$/.test(t) ? 1
    : /^\d{8} ∙ \d{2}:\d{2}:\d{2}$/.test(t) ? 2 : /^\d{8} ∙ \d{2}:\d{2}$/.test(t) ? 3 : /^\d{2}:\d{2}:\d{2}$/.test(t) ? 4 : /^\d{2}:\d{2}$/.test(t) ? 5 : -1);
  const settle = () => page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
  // Without a selection, this long document (six-digit counts) fits at 700 px with at most "chars." and the
  // compact date; at 500 px, where the backup status (a hairline, the Export All icon) takes its room too,
  // any step of the ladder will do — but nothing is ever cut.
  for (const w of [1100, 700, 500]) {
    await page.setViewportSize({ width: w, height: 600 });
    await settle();
    const r = await read();
    expect(r.cut, `${w}px`).toBe(false);
    expect(stampLevel(r.time), `${w}px: a stamp of the ladder`).toBeGreaterThanOrEqual(0);
    if (w >= 700) expect(countsLevel(r.counts), `${w}px`).toBeLessThanOrEqual(1);
  }
  // With a large selection: the document counts go first, then the ladder is walked down in order and
  // "Selection:" shortens last. The step never goes back up, and nothing is ever cut.
  await page.evaluate(() => { const v = document.getElementById('editor').mtView; v.focus(); v.dispatch({ selection: { anchor: 0, head: 400000 } }); });
  const STEPS_SEL = [[0, 0, false, false], ...STEPS_DOC.map(([c, st]) => [c, st, true, false]), [3, 5, true, true]];
  // The first step whose shape matches what is on screen (levels 0 and 1 can render identically).
  const stepOf = (r) => STEPS_SEL.findIndex(([c, st, hidden, short]) =>
    c === countsLevel(r.sel) && st === stampLevel(r.time) && hidden === r.hidden && short === /^Sel\.: /.test(r.sel));
  let prev = -1;
  const seen = new Set();
  for (let w = 1400; w >= 500; w -= 5) {
    await page.setViewportSize({ width: w, height: 600 });
    await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
    const r = await read();
    const step = stepOf(r);
    expect(step, `${w}px: ${JSON.stringify(r)} is a step of the ladder`).toBeGreaterThanOrEqual(0);
    if (!r.hidden) expect(countsLevel(r.sel), `${w}px: no abbreviation while the document counts are shown`).toBe(0);
    seen.add(step);
    expect(step, `${w}px`).toBeGreaterThanOrEqual(prev);
    prev = step;
    expect(r.cut, `${w}px: nothing cut (step ${step})`).toBe(false);
  }
  expect(Math.min(...seen), 'the widest window shows everything').toBeLessThanOrEqual(1);
  expect(Math.max(...seen), 'the narrowest window has given up the document counts').toBeGreaterThan(1);
  let r = await read();
  expect(r.hidden).toBe(true);
  // How far down the ladder 500 px goes depends on the UI font (Windows' is narrower): any step of it.
  expect(r.sel).toMatch(/^Sel(ection|\.): 8,696 (ln\.|lines) · 78,261 (wds\.|words) · 400,000 (chars\.|characters)$/);
  expect(r.sepWidth).toBe(0);
  expect(r.ellipsis).toBe('ellipsis'); // kept as the very last resort
  await page.evaluate(() => { const v = document.getElementById('editor').mtView; v.dispatch({ selection: { anchor: 0 } }); });
  await settle();
  r = await read();
  expect(r.hidden).toBe(false);
  expect(r.sel).toBe('');
  expect(r.cut).toBe(false);
  await page.evaluate(() => { const v = document.getElementById('editor').mtView; v.dispatch({ selection: { anchor: 0, head: 400000 } }); });
  // French abbreviations.
  await setLang(page, 'fr');
  await settle();
  r = await read();
  expect(r.cut).toBe(false); // French, 500 px, large selection: fits (the seconds go)
  expect(r.sel).toMatch(/^Sélection\u00a0: 8\u202f?\s?696 (lgn\.|lignes) · .* (mts\.|mots) · .* (car\.|caractères)$|^Sél\.\u00a0: /);
  await page.evaluate(() => { const v = document.getElementById('editor').mtView; v.dispatch({ selection: { anchor: 0 } }); });
  await settle();
  r = await read();
  expect(r.counts).toMatch(/(lgn\.|lignes) · .* (mts\.|mots) · .* (car\.|caractères)$/);
  // Wide again: full words.
  await page.evaluate(() => { const v = document.getElementById('editor').mtView; v.dispatch({ selection: { anchor: 0 } }); });
  await page.setViewportSize({ width: 1400, height: 600 });
  await settle();
  expect((await read()).counts).toMatch(/lignes · .* mots · .* caractères$/);
});
