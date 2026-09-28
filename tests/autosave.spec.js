// Done when #3: typing then switching tab / window / closing never loses keystrokes;
// a 1 MB tab never stutters during autosave.
import { test, expect, openFresh, openApp, addTab, clickTab, focusEditorEnd, storedTabs, saveNow, status, importFiles, docText } from './helpers.js';

const contentOf = async (page, name) => (await storedTabs(page)).find((t) => t.name === name)?.content;

// Proves that `trigger` itself saves pending keystrokes: in one synchronous page call it checks that the
// last keystrokes are not stored yet, fires the trigger, and reads storage again. If the debounced
// autosave already ran (slow test driver), another key is typed and the check is repeated.
async function expectTriggerSaves(page, trigger) {
  for (let attempt = 0; attempt < 10; attempt++) {
    await page.keyboard.type(String.fromCharCode(97 + attempt));
    const r = await page.evaluate((trigger) => {
      const v = document.getElementById('editor').mtView;
      const text = v.state.doc.toString();
      const idx = JSON.parse(localStorage.getItem('modest-text:v1:index'));
      const key = 'modest-text:v1:tab:' + idx.active;
      const stored = () => JSON.parse(localStorage.getItem(key)).content;
      if (stored() === text) return { raced: true };
      if (trigger.type === 'blur') window.dispatchEvent(new Event('blur'));
      if (trigger.type === 'hidden') {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        delete document.visibilityState;
      }
      if (trigger.type === 'tab') document.querySelector(`.tab[data-id="${trigger.id}"] .tab-name`).click();
      if (trigger.type === 'keys') {
        const mac = /Mac/.test(navigator.platform);
        const ev = new KeyboardEvent('keydown', { key: 's', code: 'KeyS', metaKey: mac, ctrlKey: !mac, bubbles: true, cancelable: true });
        v.contentDOM.dispatchEvent(ev);
        if (!ev.defaultPrevented) return { error: 'Save Page not suppressed' };
      }
      return { raced: false, text, after: stored() };
    }, trigger);
    if (r.raced) continue;
    expect(r.error).toBeUndefined();
    expect(r.after).toBe(r.text);
    return r.text;
  }
  throw new Error('the debounced autosave always ran first');
}

test('3a. typing then immediately switching tab saves the last keystrokes', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await addTab(page, 'B');
  const bId = await page.locator('.tab', { hasText: 'B' }).getAttribute('data-id');
  await clickTab(page, 'Untitled 1');
  await focusEditorEnd(page);
  await page.keyboard.type('hello ');
  const text = await expectTriggerSaves(page, { type: 'tab', id: bId });
  await expect(page.locator('.tab.active .tab-name')).toHaveText('B');
  expect(await contentOf(page, 'Untitled 1')).toBe(text);
  // And with a real mouse click right after typing.
  await clickTab(page, 'Untitled 1');
  await focusEditorEnd(page);
  await page.keyboard.type('world');
  await page.locator('.tab', { hasText: 'B' }).click();
  expect(await contentOf(page, 'Untitled 1')).toBe(text + 'world');
});

test('3b. typing then the window losing focus or being hidden saves the last keystrokes', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await focusEditorEnd(page);
  await expectTriggerSaves(page, { type: 'blur' });
  await expectTriggerSaves(page, { type: 'hidden' });
});

test('3c. typing then reloading keeps the last keystrokes', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await focusEditorEnd(page);
  await page.keyboard.type('before reload');
  await page.reload();
  await expect(page.locator('html[data-ready="1"]')).toHaveCount(1);
  expect(await docText(page)).toBe('before reload');
});

test('3d. typing then closing the page keeps the last keystrokes', async ({ page, context, appURL }) => {
  await openFresh(page, appURL);
  await focusEditorEnd(page);
  await page.keyboard.type('before close');
  // Leave the page first, as closing a tab does, then close it. A bare page.close() tears the page down
  // before the browser has stored its last writes: WebKit lost the page's last half-second of
  // localStorage writes 4 times in 40 that way, the app's save and every other write alike, and lost
  // nothing in 40 when the page was left first (measured with a probe that logged every storage write).
  // No page can flush localStorage, and a real tab close unloads the page as navigating does.
  // (close({ runBeforeUnload: true }) is no alternative: WebKit never closes a page without a
  // beforeunload listener, and the app has none.)
  await page.goto('about:blank');
  await page.close();
  await expect.poll(() => page.isClosed()).toBe(true);
  const page2 = await context.newPage();
  await openApp(page2, appURL);
  const got = await docText(page2);
  if (got !== 'before close') {
    // For the case still open (Firefox on the Windows runner, Known issues in AGENTS.md): say whether
    // the text arrives late or never. (A pagehide marker written from an init script is not reliable
    // in Firefox: it was missing even in runs that kept the text.)
    let late = 'never, within 10 s';
    for (const t0 = Date.now(); Date.now() - t0 < 10000;) {
      await page2.waitForTimeout(500);
      await openApp(page2, appURL);
      if (await docText(page2) === 'before close') { late = `after ${Date.now() - t0} ms`; break; }
    }
    throw new Error(`3d lost the text in ${test.info().project.name}: got ${JSON.stringify(got)}; the text arrived ${late}`);
  }
});

test('3e. Cmd/Ctrl+S saves immediately and suppresses the browser Save Page', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await focusEditorEnd(page);
  await expectTriggerSaves(page, { type: 'keys' });
  // The real key combination too.
  await page.evaluate(() => window.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 's') window.__prevented = e.defaultPrevented; }));
  await page.keyboard.type('q');
  await saveNow(page);
  expect((await contentOf(page, 'Untitled 1')).endsWith('q')).toBe(true);
  await expect(status(page)).toHaveText('Saved');
  expect(await page.evaluate(() => window.__prevented)).toBe(true);
});

test('3f. autosave runs about 500 ms after typing stops, writing only the changed tab', async ({ page, appURL }) => {
  // Timings are taken inside the page, so a slow test driver cannot distort them.
  await page.addInitScript(() => {
    window.__writes = [];
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { window.__writes.push([k, performance.now()]); return set.call(this, k, v); };
    window.addEventListener('keydown', () => { window.__lastKey = performance.now(); }, true);
  });
  await openFresh(page, appURL);
  await addTab(page, 'B', 'bee');
  await addTab(page, 'C', 'sea');
  await saveNow(page);
  await expect(status(page)).toHaveText('Saved');
  await page.evaluate(() => { window.__writes = []; });
  await focusEditorEnd(page);
  await page.keyboard.type('!!');
  await expect(status(page)).toHaveText('Saved', { timeout: 3000 });
  expect(await contentOf(page, 'C')).toBe('sea!!');
  const cId = (await storedTabs(page)).find((t) => t.name === 'C').id;
  const { writes, lastKey } = await page.evaluate(() => ({ writes: window.__writes.filter(([k]) => k !== 'modest-text:v1:probe'), lastKey: window.__lastKey }));
  expect([...new Set(writes.map(([k]) => k))]).toEqual([`modest-text:v1:tab:${cId}`]);
  const delay = writes[0][1] - lastKey;
  console.log(`[${test.info().project.name}] autosave ${delay.toFixed(0)} ms after the last keystroke`);
  expect(delay).toBeGreaterThanOrEqual(450);
  expect(delay).toBeLessThan(2000);
});

// 3g (1 MB tab) lives in perf.spec.js: it runs alone, after the rest of the suite.

test('Cmd/Ctrl+S says, in the middle of the window for a second, that the note is saved in this browser', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await focusEditorEnd(page);
  await page.keyboard.type('note');
  await saveNow(page);
  const flash = page.locator('#save-flash');
  await expect(flash).toBeVisible();
  await expect(flash).toHaveText('✓ Saved in this browserTo get a file, use Export');
  // Checked, not assumed: the text is in storage.
  expect(await contentOf(page, 'Untitled 1')).toBe('note');
  const box = await flash.boundingBox();
  const vp = page.viewportSize();
  expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThan(2); // centred
  await expect(flash).toBeHidden({ timeout: 3000 });
});
