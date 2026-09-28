// Keyboard access to the controls: Esc then Shift+Tab leaves the text, the bar under the tabs is one Tab stop
// with arrow keys inside, Esc in any bar returns to the text, and keyboard focus is clearly visible.
import { test, expect, openFresh, setDoc, focusEditorEnd, docText } from './helpers.js';

const active = (page) => page.evaluate(() => {
  const e = document.activeElement;
  return e.classList.contains('cm-content') ? 'text' : e.id || e.dataset.fmt || e.dataset.hist || e.className;
});

test('Esc then Shift+Tab goes from the text to the bar under the tabs; the bar is one Tab stop; Tab goes back', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, 'hello');
  await focusEditorEnd(page);
  // Without Esc, Shift+Tab stays in the text (it outdents).
  await page.keyboard.press('Shift+Tab');
  expect(await active(page)).toBe('text');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+Tab');
  expect(await active(page)).toBe('btn-md');
  // One stop for the whole bar: the next Shift+Tab leaves it for the tab strip, then the top bar.
  const seen = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Shift+Tab');
    seen.push(await page.evaluate(() => {
      const e = document.activeElement;
      return { bar: e.closest('#topbar, #tabbar, #formatbar, #statusbar')?.id || 'other', id: e.id || e.className };
    }));
  }
  expect(seen.filter((s) => s.bar === 'formatbar')).toEqual([]);
  expect(seen[0].bar).toBe('tabbar');
  expect(seen.map((s) => s.bar)).toContain('topbar');
  // In the bar, Tab jumps from group to group; past the last group it goes into the text.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+Tab');
  expect(await active(page)).toBe('btn-md');
  await page.keyboard.press('End');
  await page.keyboard.press('Tab');
  expect(await active(page)).toBe('text');
});

test('in the bar under the tabs, arrow keys / Home / End move between enabled buttons; Enter presses one', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, 'word');
  await page.evaluate(() => { const v = document.getElementById('editor').mtView; v.dispatch({ selection: { anchor: 0, head: 4 } }); });
  await page.locator('#btn-md').focus();
  await page.keyboard.press('ArrowRight');
  expect(await active(page)).toBe('btn-undo'); // redo is disabled (nothing to redo): skipped
  await page.keyboard.press('ArrowRight');
  expect(await active(page)).toBe('bold');
  await page.keyboard.press('End');
  expect(await active(page)).toBe('hr');
  await page.keyboard.press('ArrowRight'); // wraps
  expect(await active(page)).toBe('btn-md');
  await page.keyboard.press('ArrowLeft');
  expect(await active(page)).toBe('hr');
  await page.keyboard.press('Home');
  expect(await active(page)).toBe('btn-md');
  // The button that had the focus is the bar's Tab stop.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => [...document.querySelectorAll('#formatbar button')].filter((b) => b.tabIndex === 0).map((b) => b.dataset.fmt))).toEqual(['bold']);
  // Enter presses it and returns to the text.
  await page.keyboard.press('Enter');
  expect(await docText(page)).toBe('**word**');
  expect(await active(page)).toBe('text');
});

test('Esc in any bar returns to the text; Esc in the open font menu only closes the menu', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  for (const sel of ['#btn-md', '.fmt-btn[data-fmt="h1"]', '.tab.active', '#btn-new', '#font-btn', '#size-select', '#btn-help']) {
    await page.locator(sel).first().focus();
    await page.keyboard.press('Escape');
    expect(await active(page), sel).toBe('text');
  }
  await page.locator('#font-btn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#font-list')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#font-list')).toBeHidden();
  expect(await active(page)).toBe('font-btn');
  await page.keyboard.press('Escape');
  expect(await active(page)).toBe('text');
});

test('keyboard focus is clearly visible: a 2px ring off the control and a tinted face, never clipped by its bar', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, 'x');
  for (const theme of ['light', 'dark']) {
    if ((await page.getAttribute('html', 'data-theme')) !== theme) await page.click('#btn-theme');
    await page.mouse.move(5, 500);
    for (const sel of ['#btn-md', '.fmt-btn[data-fmt="bold"]', '.fmt-btn[data-fmt="hr"]', '#btn-import', '#btn-help', '#font-btn', '.tab.active', '#btn-new']) {
      const el = page.locator(sel).first();
      const before = await el.evaluate((e) => getComputedStyle(e).backgroundColor);
      await page.keyboard.press('Shift'); // keyboard modality, so that script focus shows :focus-visible (Chromium)
      await el.evaluate((e) => e.focus({ focusVisible: true })); // (Firefox)
      const r = await el.evaluate((e) => {
        const c = getComputedStyle(e);
        const rect = e.getBoundingClientRect();
        const off = parseFloat(c.outlineOffset), w = parseFloat(c.outlineWidth);
        const ring = { l: rect.left - off - w, r: rect.right + off + w, t: rect.top - off - w, b: rect.bottom + off + w };
        // The ring must be inside every clipping ancestor.
        let clipped = false;
        for (let p = e.parentElement; p; p = p.parentElement) {
          const pc = getComputedStyle(p);
          if (pc.overflowX !== 'visible' || pc.overflowY !== 'visible') {
            const pr = p.getBoundingClientRect();
            if (ring.l < pr.left - 0.5 || ring.r > pr.right + 0.5 || ring.t < pr.top - 0.5 || ring.b > pr.bottom + 0.5) clipped = p.id || p.className;
          }
        }
        return { matches: e.matches(':focus-visible'), style: c.outlineStyle, width: w, off, bg: c.backgroundColor, clipped };
      });
      expect(r.matches, sel).toBe(true);
      expect(r.style, sel).toBe('solid');
      expect(r.width, sel).toBe(2);
      expect(Math.abs(r.off), sel).toBeGreaterThanOrEqual(2);
      expect(r.bg, `${theme} ${sel} tinted`).not.toBe(before);
      expect(r.clipped, `${theme} ${sel} ring not clipped`).toBe(false);
    }
  }
});

test('Cmd/Ctrl+J: to the bar under the tabs and back; ↑ to the tabs, ↓ back; Enter opens a tab in its text; on the Help tab: the tabs', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await page.click('#btn-new');
  await setDoc(page, 'second');
  await focusEditorEnd(page);
  await page.keyboard.press('ControlOrMeta+j');
  expect(await active(page)).toBe('btn-md');
  await page.keyboard.press('ControlOrMeta+j'); // again: back to the text
  expect(await active(page)).toBe('text');
  await page.keyboard.press('ControlOrMeta+j');
  await page.keyboard.press('ArrowRight');
  expect(await active(page)).toBe('btn-undo');
  await page.keyboard.press('ArrowUp'); // to the tabs: the active one
  expect(await page.evaluate(() => document.activeElement.classList.contains('tab') && document.activeElement.classList.contains('active'))).toBe(true);
  await page.keyboard.press('ArrowDown'); // back to the bar, where it was
  expect(await active(page)).toBe('btn-undo');
  await page.keyboard.press('ArrowDown'); // down again: the text
  expect(await active(page)).toBe('text');
  // Tabs: ← → move, Enter opens the tab and puts the cursor in its text.
  await page.keyboard.press('ControlOrMeta+j');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tab.active .tab-name')).toHaveText('Untitled 1');
  expect(await active(page)).toBe('text');
  await page.keyboard.press('ControlOrMeta+j');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ControlOrMeta+j'); // from the tabs too
  expect(await active(page)).toBe('text');
  // From the top bar, Cmd/Ctrl+J returns to the text; on the Help tab (nothing enabled in the bar) it goes to the tabs.
  await page.locator('#font-btn').focus();
  await page.keyboard.press('ControlOrMeta+j'); // from the top bar too: back to the text
  expect(await active(page)).toBe('text');
  await page.click('#btn-help');
  await expect(page.locator('.tab.active .tab-name')).toHaveText('Help');
  await page.locator('#help-view').focus(); // the Help tab's "text" is its page
  await page.keyboard.press('ControlOrMeta+j');
  expect(await page.evaluate(() => document.activeElement.closest('#tabbar, #formatbar')?.id)).toBe('tabbar');
  await page.keyboard.press('ControlOrMeta+j'); // and back to the page
  expect(await page.evaluate(() => document.activeElement.id)).toBe('help-view');
});

const at = (page) => page.evaluate(() => {
  const e = document.activeElement;
  if (e.classList.contains('cm-content')) return 'text';
  if (e.classList.contains('tab')) return 'tab:' + e.querySelector('.tab-name').textContent;
  return e.id || e.dataset.fmt || e.dataset.hist || e.className;
});
const names = (page) => page.locator('.tab .tab-name').allTextContents();

// Punctuation shortcuts are matched by physical key position, and named by what this keyboard prints on
// that key. The layout is stubbed, because the machine running the tests has a layout of its own.
const LAYOUTS = {
  us: { Comma: ',', Period: '.', Slash: '/', BracketLeft: '[', BracketRight: ']' },
  azerty: { Comma: ';', Period: ':', Slash: '!', BracketLeft: '^', BracketRight: '$' },
};
async function stubLayout(page, map) {
  await page.addInitScript((m) => {
    Object.defineProperty(navigator, 'keyboard', {
      configurable: true,
      get: () => ({ getLayoutMap: () => Promise.resolve(new Map(Object.entries(m))) }),
    });
  }, map);
}

test('punctuation shortcuts are named as this keyboard prints them, and fall back to the US names', async ({ page, appURL }) => {
  const sheet = async () => {
    await page.keyboard.press('ControlOrMeta+Slash');
    await expect(page.locator('#keys-dialog')).toBeVisible();
    const rows = await page.evaluate(() => {
      const out = {};
      for (const tr of document.querySelectorAll('#keys-body tr')) {
        const td = tr.querySelectorAll('td');
        if (td.length === 2) out[td[1].textContent] = [...td[0].querySelectorAll('kbd')].map((k) => k.textContent).join(' ');
      }
      return out;
    });
    await page.keyboard.press('Escape');
    return rows;
  };
  const withLayout = async (map) => {
    if (map) await stubLayout(page, map);
    await page.goto(appURL);
    await expect(page.locator('html[data-ready="1"]')).toHaveCount(1);
    return sheet();
  };

  let r = await withLayout(LAYOUTS.us);
  expect(r['Indent / outdent the line']).toMatch(/\]/);
  expect(r['Indent / outdent the line']).toMatch(/\[/);
  expect(r['This list']).toMatch(/\/$/);
  expect(r['Previous / next tab']).toContain(',');

  // A French AZERTY keyboard prints other characters on those same physical keys, and is told so.
  r = await withLayout(LAYOUTS.azerty);
  expect(r['Indent / outdent the line'], 'the two keys right of P print $ and ^').toMatch(/\$/);
  expect(r['Indent / outdent the line']).toMatch(/\^/);
  expect(r['Indent / outdent the line']).not.toMatch(/[[\]]/);
  expect(r['This list'], 'the key right of them prints !').toMatch(/!$/);
  expect(r['Previous / next tab'], 'the two keys right of M print ; and :').toMatch(/;/);
  expect(r['Previous / next tab']).toMatch(/:/);

  // No Keyboard Map API (Firefox): the US names stand.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'keyboard', { configurable: true, get: () => undefined });
  });
  r = await withLayout(null);
  expect(r['Indent / outdent the line']).toMatch(/\]/);
  expect(r['This list']).toMatch(/\/$/);
});

test('↑ from the tabs reaches the top bar: ← → go through its controls, ↓ back to the tabs; the size field opens with Enter', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await focusEditorEnd(page);
  await page.keyboard.press('ControlOrMeta+j');
  await page.keyboard.press('ArrowUp');
  expect(await at(page)).toBe('tab:Untitled 1');
  await page.keyboard.press('ArrowUp');
  expect(await at(page)).toBe('font-btn');
  const seen = [];
  for (let i = 0; i < 10; i++) { seen.push(await at(page)); await page.keyboard.press('ArrowRight'); }
  expect(seen).toEqual(['font-btn', 'size-select', 'btn-wrap', 'btn-readwidth', 'btn-import', 'btn-export', 'btn-export-all', 'btn-theme', 'btn-lang', 'btn-help']);
  expect(await at(page)).toBe('font-btn'); // wraps around
  await page.keyboard.press('ArrowLeft');
  expect(await at(page)).toBe('btn-help');
  // The arrows move between controls on the size field too (its value does not change).
  const size = await page.locator('#size-select').inputValue();
  await page.locator('#size-select').focus();
  await page.keyboard.press('ArrowDown');
  expect(await at(page)).toBe('tab:Untitled 1');
  expect(await page.locator('#size-select').inputValue()).toBe(size);
  await page.keyboard.press('ArrowUp'); // back where the top bar was left
  expect(await at(page)).toBe('size-select');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  expect(await at(page)).toBe('btn-md');
  // Controls still work from the keyboard: Space toggles wrap, Enter opens the font menu.
  await page.locator('#btn-wrap').focus();
  const wrap = await page.locator('#btn-wrap').getAttribute('aria-pressed');
  await page.keyboard.press('Space');
  await expect(page.locator('#btn-wrap')).toHaveAttribute('aria-pressed', wrap === 'true' ? 'false' : 'true');
  await page.locator('#font-btn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#font-list')).toBeVisible();
  await page.keyboard.press('ArrowDown'); // inside the menu the arrows are the menu's
  await expect(page.locator('#font-list')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('in the tabs, ← → also reach + and Reopen; x closes the tab; v lifts it: ← → move it, Enter drops it (kept after a reload), Esc puts it back', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await page.click('#btn-new');
  await page.click('#btn-new');
  await setDoc(page, 'three'); // a tab with text can be reopened after closing it
  expect(await names(page)).toEqual(['Untitled 1', 'Untitled 2', 'Untitled 3']);
  await focusEditorEnd(page);
  await page.keyboard.press('ControlOrMeta+j');
  await page.keyboard.press('ArrowUp');
  expect(await at(page)).toBe('tab:Untitled 3');
  await page.keyboard.press('ArrowRight');
  expect(await at(page)).toBe('btn-new'); // Reopen is disabled (nothing closed yet): skipped
  await page.keyboard.press('ArrowRight');
  expect(await at(page)).toBe('tab:Untitled 1');
  // v: lift "Untitled 1", move it two places right, drop it.
  await page.keyboard.press('v');
  await expect(page.locator('.tab.floating')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect(await names(page)).toEqual(['Untitled 2', 'Untitled 3', 'Untitled 1']);
  expect(await at(page)).toBe('tab:Untitled 1');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tab.floating')).toHaveCount(0);
  expect(await at(page)).toBe('tab:Untitled 1');
  // Esc puts a lifted tab back where it was.
  await page.keyboard.press('v');
  await page.keyboard.press('Home');
  expect(await names(page)).toEqual(['Untitled 1', 'Untitled 2', 'Untitled 3']);
  await page.keyboard.press('Escape');
  expect(await names(page)).toEqual(['Untitled 2', 'Untitled 3', 'Untitled 1']);
  expect(await at(page)).toBe('tab:Untitled 1'); // Esc ended the move, and stayed in the tabs
  // x closes the outlined tab; then Reopen can be reached and pressed.
  await page.keyboard.press('ArrowLeft');
  expect(await at(page)).toBe('tab:Untitled 3');
  await page.keyboard.press('x');
  expect(await names(page)).toEqual(['Untitled 2', 'Untitled 1']);
  await page.keyboard.press('End');
  expect(await at(page)).toBe('btn-undo-close');
  await page.keyboard.press('Enter');
  expect(await names(page)).toEqual(['Untitled 2', 'Untitled 3', 'Untitled 1']);
  // The order made with v is stored.
  await page.reload();
  await expect(page.locator('html[data-ready="1"]')).toHaveCount(1);
  expect(await names(page)).toEqual(['Untitled 2', 'Untitled 3', 'Untitled 1']);
});

// A key as a layout that does not print Latin letters sends it: here Russian ЙЦУКЕН, where the F key prints
// "а" and the N key "т". Playwright cannot switch layouts, so the event is dispatched as the browser would.
const layoutKey = (page, sel, { key, code, keyCode, mod = false, shift = false }) => page.evaluate(([sel, key, code, keyCode, mod, shift]) => {
  const mac = /Mac/.test(navigator.platform);
  const e = new KeyboardEvent('keydown', { key, code, metaKey: mod && mac, ctrlKey: mod && !mac, shiftKey: shift, bubbles: true, cancelable: true });
  Object.defineProperty(e, 'keyCode', { get: () => keyCode });
  (sel === 'text' ? document.getElementById('editor').mtView.contentDOM : document.querySelector(sel)).dispatchEvent(e);
  return e.defaultPrevented;
}, [sel, key, code, keyCode, mod, shift]);

test('on a layout that prints no Latin letters, every shortcut answers by the key\'s position', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, 'abc');
  await focusEditorEnd(page);
  // Cmd/Ctrl+F on the key that prints "а": the app's find bar, not the browser's.
  expect(await layoutKey(page, 'text', { key: 'а', code: 'KeyF', keyCode: 70, mod: true })).toBe(true);
  await expect(page.locator('#findbar')).toBeVisible();
  await page.keyboard.press('Escape');
  // Shift+Cmd/Ctrl+M ("Ь"): plain text <-> Markdown.
  expect(await layoutKey(page, 'text', { key: 'Ь', code: 'KeyM', keyCode: 77, mod: true, shift: true })).toBe(true);
  await expect(page.locator('#btn-md')).toHaveAttribute('aria-pressed', 'true');
  // A letter key in the tabs: "т" is on the N key, which adds a tab.
  await page.locator('.tab.active').focus();
  await layoutKey(page, '.tab.active', { key: 'т', code: 'KeyN', keyCode: 78 });
  await expect(page.locator('.tab')).toHaveCount(2);
});

test('Caps Lock with Shift: the letter arrives in lower case and is still the shifted shortcut (Windows keys)', async ({ page, appURL }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'Win32' }));
  await openFresh(page, appURL);
  await focusEditorEnd(page);
  await page.keyboard.type('alpha');
  await page.keyboard.press('Control+z');
  expect(await docText(page)).toBe('');
  await page.keyboard.press('Control+Shift+z'); // key "z" with Shift down: what Caps Lock + Shift sends
  expect(await docText(page)).toBe('alpha'); // redo, not a second undo
});

test('the top bar takes Home / End like every other bar', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await page.locator('#btn-import').focus();
  await page.keyboard.press('End');
  expect(await active(page)).toBe('btn-help');
  await page.keyboard.press('Home');
  expect(await active(page)).toBe('font-btn');
});

// On a Mac, the key labelled "delete" sends Backspace: in the tabs it closes the tab, like Delete elsewhere.
// Cmd+L selects the line; outside the text it is claimed all the same (no address bar).
test('Mac keys: delete closes the focused tab; Cmd+L is the app\'s everywhere', async ({ page, appURL }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' }));
  await openFresh(page, appURL);
  await page.click('#btn-new');
  await expect(page.locator('.tab')).toHaveCount(2);
  await page.locator('.tab.active').focus();
  await page.keyboard.press('Backspace');
  await expect(page.locator('.tab')).toHaveCount(1);
  expect(await layoutKey(page, '#btn-help', { key: 'l', code: 'KeyL', keyCode: 76, mod: true })).toBe(true);
});

test('Backspace does not close a tab off a Mac, where the keyboard has a Delete key', async ({ page, appURL }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'Win32' }));
  await openFresh(page, appURL);
  await page.click('#btn-new');
  await page.locator('.tab.active').focus();
  await page.keyboard.press('Backspace');
  await expect(page.locator('.tab')).toHaveCount(2);
  await page.keyboard.press('Delete');
  await expect(page.locator('.tab')).toHaveCount(1);
});

test('files from the keyboard: Cmd/Ctrl+O imports, Shift+Cmd/Ctrl+S exports the tab, Export All on its own key; the Export All tooltip says when it last ran', async ({ page, appURL }) => {
  const mac = process.platform === 'darwin';
  await openFresh(page, appURL);
  await setDoc(page, 'note');
  await focusEditorEnd(page);
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('ControlOrMeta+KeyO');
  await chooser;
  let dl = page.waitForEvent('download');
  await page.keyboard.press('ControlOrMeta+Shift+KeyS');
  expect((await dl).suggestedFilename()).toBe('Untitled 1.txt');
  await expect(page.locator('#btn-export-all')).toHaveAttribute('title', new RegExp(`\\(${mac ? '⌥⌘S' : 'Alt\\+Shift\\+S'}\\)\\nLast full export: never$`));
  dl = page.waitForEvent('download');
  await page.keyboard.press(mac ? 'Meta+Alt+KeyS' : 'Alt+Shift+KeyS');
  expect((await dl).suggestedFilename()).toMatch(/^modest-text_\d{8}_\d{6}\.zip$/);
  await expect(page.locator('#btn-export-all')).toHaveAttribute('title', /\nLast full export: \d{4}-\d{2}-\d{2} ∙ \d{2}:\d{2}:\d{2}$/);
  // Remembered: still there after a reload.
  await page.reload();
  await expect(page.locator('#btn-export-all')).toHaveAttribute('title', /\nLast full export: \d{4}-/);
});

test('leaving the page asks first ("Leave site?") only when a note changed since the last Export All', async ({ page, appURL }) => {
  const mac = process.platform === 'darwin';
  const asked = [];
  page.on('dialog', (d) => { if (d.type() === 'beforeunload') asked.push(d.type()); });
  await openFresh(page, appURL);
  await focusEditorEnd(page);
  await page.keyboard.type('changed');
  await page.keyboard.press('ControlOrMeta+s');
  await page.reload(); // the fixture answers "Leave"
  await expect(page.locator('html[data-ready="1"]')).toHaveCount(1);
  expect(asked).toEqual(['beforeunload']);
  await expect.poll(() => docText(page)).toBe('changed'); // saved either way
  await focusEditorEnd(page);
  const dl = page.waitForEvent('download');
  await page.keyboard.press(mac ? 'Meta+Alt+KeyS' : 'Alt+Shift+KeyS');
  await dl;
  asked.length = 0;
  await page.reload();
  await expect(page.locator('html[data-ready="1"]')).toHaveCount(1);
  expect(asked).toEqual([]); // backed up: closes without a question
});

test('close the tab in view and reopen it, from anywhere: Control+Cmd+W / U on a Mac, Alt+W / U elsewhere', async ({ page, appURL }) => {
  const mac = process.platform === 'darwin';
  await openFresh(page, appURL);
  await page.click('#btn-new');
  await setDoc(page, 'second');
  await expect(page.locator('.tab')).toHaveCount(2);
  await page.locator('#btn-help').focus(); // from a button too
  await page.keyboard.press(mac ? 'Control+Meta+KeyW' : 'Alt+KeyW');
  await expect(page.locator('.tab')).toHaveCount(1);
  await page.keyboard.press(mac ? 'Control+Meta+KeyU' : 'Alt+KeyU');
  await expect(page.locator('.tab')).toHaveCount(2);
  expect(await docText(page)).toBe('second');
});

// On some Mac layouts Option+6 is a dead key: the browser reports key "Dead" with code Digit6. The headings
// go by the digit key's position, so heading 6 still answers (it did nothing in Firefox on a Mac).
test('headings answer by the digit key, even when Option+digit is a dead key on the layout (Mac keys)', async ({ page, appURL }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' }));
  await openFresh(page, appURL);
  await setDoc(page, 'title');
  for (const [digit, want] of [[6, '###### title'], [1, '# title']]) {
    await page.evaluate(({ digit }) => {
      const v = document.getElementById('editor').mtView;
      v.focus();
      const e = new KeyboardEvent('keydown', { key: 'Dead', code: `Digit${digit}`, metaKey: true, altKey: true, bubbles: true, cancelable: true });
      Object.defineProperty(e, 'keyCode', { get: () => 229 }); // what a dead key reports
      v.contentDOM.dispatchEvent(e);
    }, { digit });
    expect(await docText(page)).toBe(want);
    await setDoc(page, 'title');
  }
});
