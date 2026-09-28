// Done when #14: amber (headroom probe / >4 MB) and red (quota) storage alerts.
import { execFileSync } from 'node:child_process';
import { test, expect, openFresh, addTab, clickTab, docText, setDoc, focusEditorEnd, saveNow, status, stored, storedTabs, download, fillStorage, clearFiller, closeTabByName, importFiles, rename, watchToasts, toastLog } from './helpers.js';

const ready = (page, timeout) => expect(page.locator('html[data-ready="1"][data-role="editor"]')).toHaveCount(1, { timeout });

test('14a. filling localStorage with other keys makes the headroom probe show amber (once-only message)', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, 'hello');
  await saveNow(page);
  await expect(page.locator('#st-storage')).toBeHidden();
  const n = await fillStorage(page, 100 * 1024); // leave ~100 KB: less than the 256 KB probe
  expect(n).toBeGreaterThan(3);
  const fillerBefore = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('filler_')).map((k) => [k, localStorage.getItem(k).length]).sort());
  await page.reload();
  await ready(page);
  const item = page.locator('#st-storage');
  await expect(item).toBeVisible();
  await expect(item).toHaveText(/^Storage \d\.\d \/ ~5 MB$/);
  await expect(item).toHaveAttribute('title', 'Browser storage is nearly full. Click to Export All (your backup), then close unused tabs.');
  // The item is a shortcut: clicking it runs Export All.
  expect(await item.evaluate((e) => e.tagName)).toBe('BUTTON');
  const dl = await download(page, () => item.click());
  expect(dl.name).toMatch(/^modest-text_\d{8}_\d{6}\.zip$/);
  await expect(page.locator('.toast-text', { hasText: 'Storage is nearly full' })).toHaveCount(1);
  await expect(page.locator('#banner-full')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-storage', 'amber');
  // Saving still works in the remaining space, and nothing else was touched.
  await focusEditorEnd(page);
  await page.keyboard.type(' world');
  await saveNow(page);
  await expect(status(page)).toHaveText('Saved');
  expect((await storedTabs(page))[0].content).toBe('hello world');
  await expect(page.locator('.toast-text', { hasText: 'Storage is nearly full' })).toHaveCount(1);
  const fillerAfter = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('filler_')).map((k) => [k, localStorage.getItem(k).length]).sort());
  expect(fillerAfter).toEqual(fillerBefore);
});

test('14b. usage above 4 MB shows amber, and Import warns when it crosses 4 MB', async ({ page, appURL }) => {
  test.setTimeout(120000);
  await openFresh(page, appURL);
  const files = ['a', 'b', 'c', 'd', 'e'].map((x) => ({ name: `${x}.txt`, text: x.repeat(880 * 1024) }));
  // Each file is one 880 K-character line, which WebKit spends about 8 s laying out with the page
  // blocked, so both toasts can be gone before anything can read the DOM: see watchToasts.
  await watchToasts(page);
  await importFiles(page, files);
  await expect.poll(() => toastLog(page), { timeout: 60000 }).toContain('Imported 5 tabs');
  await expect.poll(() => toastLog(page), { timeout: 60000 })
    .toContain('Storage is above 4 MB of ~5 MB. Consider Export All and closing unused tabs.');
  await expect(page.locator('#st-storage')).toHaveText(/^Storage 4\.\d \/ ~5 MB$/);
  // Closing tabs brings it back under the threshold.
  await closeTabByName(page, 'a.txt');
  await closeTabByName(page, 'b.txt');
  await saveNow(page);
  // The closed-tab stack is stored (not full), so re-probe after a reload.
  await page.reload();
  // The reopened tab is one 880 K-character line: WebKit lays it out for about 8 s before the page
  // is ready, which is the whole of the default expect timeout.
  await ready(page, 30000);
  const s = await stored(page);
  const usage = Object.entries(s).reduce((n, [k, v]) => n + k.length + (typeof v === 'string' ? v.length : JSON.stringify(v).length), 0);
  if (usage <= 4194304) await expect(page.locator('#st-storage')).toBeHidden();
  else await expect(page.locator('#st-storage')).toBeVisible();
});

test('14c. full storage: red banner and "Save failed"; Export All has the unsaved text; closing a tab frees space and clears the banner', async ({ page, appURL }) => {
  test.setTimeout(120000);
  await openFresh(page, appURL);
  await setDoc(page, 'x'.repeat(400000));
  await rename(page, 'Untitled 1', 'Big');
  await addTab(page, 'Work', 'draft');
  await saveNow(page);
  await expect(status(page)).toHaveText('Saved');
  await fillStorage(page, 0);

  await focusEditorEnd(page);
  await page.keyboard.type(' more text');
  await saveNow(page);
  const banner = page.locator('#banner-full');
  await expect(banner).toBeVisible();
  await expect(banner.locator('.banner-text')).toHaveText('Storage full: recent changes are not saved.');
  await expect(banner.locator('button')).toHaveText(['Export All']);
  await expect(status(page)).toHaveText('Save failed');
  await expect(page.locator('#save-flash')).toBeHidden(); // Cmd/Ctrl+S never claims a save that failed
  await expect(page.locator('#st-dot')).toHaveClass(/dot-red/);
  await expect(page.locator('.tab', { hasText: 'Work' })).not.toHaveClass(/unsaved/); // active: shown in the status bar
  await expect(page.locator('html')).toHaveAttribute('data-storage', 'full');
  // Saves keep retrying on every trigger; text stays in memory.
  await page.keyboard.type(' again');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(banner).toBeVisible();
  expect(await docText(page)).toBe('draft more text again');
  expect((await storedTabs(page)).find((t) => t.name === 'Work').content).toBe('draft');

  // Leaving the tab whose save failed: it is marked with a red dot; the other tab is not.
  await clickTab(page, 'Big');
  await expect(page.locator('.tab', { hasText: 'Work' })).toHaveClass(/unsaved/);
  await expect(page.locator('.tab', { hasText: 'Big' })).not.toHaveClass(/unsaved/);
  await clickTab(page, 'Work');

  // Export All from the banner contains the unsaved text.
  const dl = await download(page, () => banner.locator('button').click());
  expect(execFileSync('unzip', ['-p', dl.path, 'Work.txt'], { encoding: 'utf8' })).toBe('draft more text again');

  // Closing the big tab frees space: saves succeed and the banner clears by itself.
  await closeTabByName(page, 'Big');
  await expect(banner).toBeHidden();
  await expect(page.locator('.toast-text', { hasText: 'Storage available again: all changes saved' })).toHaveCount(1);
  await expect(status(page)).toHaveText('Saved');
  await expect(page.locator('#st-dot')).toHaveClass(/dot-green/);
  await expect(page.locator('.tab.unsaved')).toHaveCount(0);
  expect((await storedTabs(page)).find((t) => t.name === 'Work').content).toBe('draft more text again');
  // While full, the closed tab went to the in-memory stack only (not stored).
  const closed = (await stored(page))['modest-text:v1:closed'];
  expect(JSON.stringify(closed ?? []).includes('xxxxxxxxxx')).toBe(false);
  await expect(page.locator('#btn-undo-close')).toHaveAttribute('title', 'Reopen “Big”');
  await clearFiller(page);
  await clickTab(page, 'Work');
});
