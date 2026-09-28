// Done when #2 (reload keeps everything) and #17 (drag-reordered tabs keep their order).
import { test, expect, openFresh, addTab, rename, clickTab, docText, setDoc, tabNames, tabByName, saveNow, stored, setLang, toggleTheme } from './helpers.js';

const ready = (page) => expect(page.locator('html[data-ready="1"][data-role="editor"]')).toHaveCount(1);

test('2. three tabs survive a reload with content, names, order, modes, active tab and all settings', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, 'Alpha content\nline 2');
  await rename(page, 'Untitled 1', 'Alpha');
  await addTab(page, 'Beta', '# Beta\n\n*md*', { md: true });
  await addTab(page, 'Gamma', 'Gamma text');
  // Settings (wrap is changed on a plain tab).
  await page.click('#font-btn');
  await page.click('.font-opt[data-font="Courier New"]'); // Source and code (listed in a plain-text tab)
  await clickTab(page, 'Beta');
  await page.click('#font-btn');
  await page.click('.font-opt[data-font="Verdana"]'); // Markdown text (listed in a Markdown tab)
  await clickTab(page, 'Gamma');
  await page.selectOption('#size-select', '24');
  await page.click('#btn-readwidth'); // reading width on (while this tab still wraps)
  await page.click('#btn-wrap'); // wrap off
  const theme = await toggleTheme(page);
  await setLang(page, 'fr');
  await clickTab(page, 'Beta');

  await page.reload();
  await ready(page);
  expect(await tabNames(page)).toEqual(['Alpha', 'Beta', 'Gamma']);
  await expect(page.locator('.tab.active .tab-name')).toHaveText('Beta');
  expect(await docText(page)).toBe('# Beta\n\n*md*');
  await expect(page.locator('#btn-md')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('#btn-export')).toHaveAttribute('aria-label', /^Exporter/);
  await expect(page.locator('#font-label')).toHaveText('Verdana'); // Markdown tab: Markdown text font
  await expect(page.locator('#size-select')).toHaveValue('24');
  expect(await page.locator('.cm-editor').evaluate((e) => getComputedStyle(e).fontSize)).toBe('24px');
  await clickTab(page, 'Alpha');
  expect(await docText(page)).toBe('Alpha content\nline 2');
  await expect(page.locator('#btn-md')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#btn-wrap')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.cm-content')).not.toHaveClass(/cm-lineWrapping/);
  // Reading width was kept too, and shows as unavailable while this tab does not wrap.
  await expect(page.locator('#btn-readwidth')).toBeDisabled();
  await page.click('#btn-wrap');
  await expect(page.locator('#btn-readwidth')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#editor')).toHaveAttribute('data-read', '1');
  await expect(page.locator('#font-label')).toHaveText('Courier New'); // plain tab: monospace font
  expect(await page.locator('.cm-scroller').evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/^"?Courier New/);
  await clickTab(page, 'Gamma');
  expect(await docText(page)).toBe('Gamma text');
});

test('storage keys: every key is prefixed modest-text:v1:, one key per tab, other keys never touched', async ({ page, appURL }) => {
  await page.addInitScript(() => {
    window.__writes = [];
    const set = Storage.prototype.setItem, rm = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (k, v) { window.__writes.push(k); return set.call(this, k, v); };
    Storage.prototype.removeItem = function (k) { window.__writes.push('rm:' + k); return rm.call(this, k); };
  });
  await page.goto(appURL);
  await ready(page); // the app starts just after the page's load event (it unpacks its code first)
  await page.evaluate(() => { localStorage.setItem('other-app', 'keep me'); localStorage.setItem('mt-lookalike', 'x'); });
  await page.reload();
  await ready(page);
  await page.click('#btn-new');
  await setDoc(page, 'one');
  await addTab(page, 'Two', 'two');
  await saveNow(page);
  const writes = await page.evaluate(() => window.__writes);
  expect(writes.filter((k) => !k.replace(/^rm:/, '').startsWith('modest-text:v1:'))).toEqual([]);
  const s = await stored(page);
  expect(Object.keys(s).sort()).toEqual(expect.arrayContaining(['modest-text:v1:index', 'modest-text:v1:settings'].filter((k) => k in s)));
  expect(Object.keys(s).filter((k) => k.startsWith('modest-text:v1:tab:'))).toHaveLength((await tabNames(page)).length);
  expect(await page.evaluate(() => [localStorage.getItem('other-app'), localStorage.getItem('mt-lookalike')])).toEqual(['keep me', 'x']);
});

test('a corrupt tab key affects only that tab and is never overwritten', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, 'good one');
  await addTab(page, 'Bad', 'will be corrupted');
  await addTab(page, 'Fine', 'good two');
  await saveNow(page);
  const badKey = await page.evaluate(() => {
    const idx = JSON.parse(localStorage.getItem('modest-text:v1:index'));
    const key = 'modest-text:v1:tab:' + idx.order[1];
    localStorage.setItem(key, '{corrupt');
    return key;
  });
  await page.reload();
  await ready(page);
  expect(await tabNames(page)).toEqual(['Untitled 1', 'Fine']);
  await setDoc(page, 'edited');
  await saveNow(page);
  expect(await page.evaluate((k) => localStorage.getItem(k), badKey)).toBe('{corrupt');
  expect((await stored(page))['modest-text:v1:index'].order).toContain(badKey.slice('modest-text:v1:tab:'.length));
  // A corrupt index does not lose the tabs either.
  await page.evaluate(() => localStorage.setItem('modest-text:v1:index', 'nope'));
  await page.reload();
  await ready(page);
  expect((await tabNames(page)).sort()).toEqual(['Fine', 'Untitled 1']);
});

test('17. drag-reordered tabs keep their order after a reload; a drag neither activates nor renames', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, 'a');
  await rename(page, 'Untitled 1', 'A');
  await addTab(page, 'B', 'b');
  await addTab(page, 'C', 'c');
  await clickTab(page, 'A');
  const src = await tabByName(page, 'C').locator('.tab-name').boundingBox();
  const dst = await tabByName(page, 'A').boundingBox();
  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
  await page.mouse.down();
  await page.mouse.move(src.x - 10, src.y + src.height / 2, { steps: 4 });
  await page.mouse.move(dst.x + 4, dst.y + dst.height / 2, { steps: 12 });
  await page.mouse.up();
  expect(await tabNames(page)).toEqual(['C', 'A', 'B']);
  await expect(page.locator('.tab.active .tab-name')).toHaveText('A');
  await expect(page.locator('#modal')).toBeHidden();
  expect(await page.evaluate(() => document.querySelector('#tabs').nextElementSibling.id)).toBe('btn-new'); // + right after the last tab
  // Drag the active tab to the end.
  const a = await tabByName(page, 'A').locator('.tab-name').boundingBox();
  const b = await tabByName(page, 'B').boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 3, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  expect(await tabNames(page)).toEqual(['C', 'B', 'A']);
  await page.reload();
  await ready(page);
  expect(await tabNames(page)).toEqual(['C', 'B', 'A']);
  await expect(page.locator('.tab.active .tab-name')).toHaveText('A');
});
