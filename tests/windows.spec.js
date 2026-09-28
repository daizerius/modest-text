// Done when #13: one editing window; read-only second window; handover; conflict tab.
// Every test runs twice: through the Web Lock path and through the forced lease fallback.
import { test, expect, openFresh, openApp, addTab, docText, setDoc, focusEditorEnd, saveNow, tabNames, storedTabs, clickTab, status } from './helpers.js';

for (const path of ['weblock', 'lease']) {
  test.describe(`13. multiple windows — ${path} path`, () => {
    test.beforeEach(async ({ context }) => {
      if (path === 'lease') {
        await context.addInitScript(() => {
          Object.defineProperty(Navigator.prototype, 'locks', { get() { return undefined; }, configurable: true });
        });
      }
    });

    test('a second window opens read-only with a banner and live-updates', async ({ page, context, appURL }) => {
      await openFresh(page, appURL);
      await expect(page.locator('html')).toHaveAttribute('data-lock', path);
      await setDoc(page, 'first');
      await saveNow(page);
      const b = await context.newPage();
      await openApp(b, appURL, { role: 'readonly' });
      await expect(b.locator('html')).toHaveAttribute('data-lock', path);
      await expect(b.locator('#banner-ro')).toBeVisible();
      await expect(b.locator('#banner-ro .banner-text')).toHaveText('Open in another window');
      await expect(b.locator('#btn-edit-here')).toHaveText('Edit here instead');
      await expect(status(b)).toHaveText('Read-only');
      await expect(b.locator('#btn-new')).toBeDisabled();
      await expect(b.locator('#btn-import')).toBeDisabled();
      await expect(b.locator('#btn-md')).toBeDisabled();
      await expect(b.locator('#btn-undo')).toBeDisabled();
      await expect(b.locator('#btn-redo')).toBeDisabled();
      expect(await docText(b)).toBe('first');
      await b.locator('.cm-content').click();
      await b.keyboard.type('nope');
      expect(await docText(b)).toBe('first');
      // Live updates from the editing window. The user clicks back into it first: after another window had the
      // focus, Playwright's own Firefox ignores a script focus() there, so keystrokes would go nowhere.
      await page.locator('.cm-content').click();
      await focusEditorEnd(page);
      await page.keyboard.type(' second');
      await saveNow(page);
      await expect.poll(() => docText(b)).toBe('first second');
      await addTab(page, 'Another', 'more');
      await expect.poll(() => tabNames(b)).toEqual(['Untitled 1', 'Another']);
      await expect(page.locator('#banner-ro')).toBeHidden();
    });

    test('"Edit here instead" hands over without losing the last keystrokes', async ({ page, context, appURL }) => {
      await openFresh(page, appURL);
      const b = await context.newPage();
      await openApp(b, appURL, { role: 'readonly' });
      await focusEditorEnd(page);
      await page.keyboard.type('last keystrokes');
      await expect(page.locator('#btn-undo')).toBeEnabled();
      // No save trigger in A: the takeover itself must flush A's pending save.
      await b.click('#btn-edit-here');
      await expect(b.locator('html')).toHaveAttribute('data-role', 'editor', { timeout: 2500 });
      await expect(b.locator('#banner-ro')).toBeHidden();
      expect(await docText(b)).toBe('last keystrokes');
      await expect(page.locator('html')).toHaveAttribute('data-role', 'readonly');
      await expect(page.locator('#banner-ro')).toBeVisible();
      await expect(page.locator('#btn-undo')).toBeDisabled(); // A still has its history, but a read-only window cannot undo
      await expect(page.locator('.toast-text').last()).toHaveText('Editing continues in another window. This window is now read-only.');
      // B edits, A follows; and A can take over again.
      await focusEditorEnd(b);
      await b.keyboard.type(' + B');
      await saveNow(b);
      await expect.poll(() => docText(page)).toBe('last keystrokes + B');
      await b.keyboard.type(' again');
      await page.click('#btn-edit-here');
      await expect(page.locator('html')).toHaveAttribute('data-role', 'editor', { timeout: 2500 });
      expect(await docText(page)).toBe('last keystrokes + B again');
      await expect(b.locator('html')).toHaveAttribute('data-role', 'readonly');
    });

    test("just after taking over, the previous editor's late final save is still applied", async ({ page, context, appURL }) => {
      await openFresh(page, appURL);
      await setDoc(page, 'v1');
      await saveNow(page);
      const b = await context.newPage();
      await openApp(b, appURL, { role: 'readonly' });
      await b.click('#btn-edit-here');
      await expect(b.locator('html')).toHaveAttribute('data-role', 'editor', { timeout: 2500 });
      // The old editor's final save arrives late (Firefox can grant the lock before another window's writes are
      // visible): simulated by writing the next revision from that window directly.
      const lateWrite = (content) => page.evaluate((c) => {
        const k = Object.keys(localStorage).find((x) => x.startsWith('modest-text:v1:tab:'));
        const r = JSON.parse(localStorage.getItem(k));
        localStorage.setItem(k, JSON.stringify({ ...r, rev: r.rev + 1, content: c }));
      }, content);
      await lateWrite('v1 late');
      await expect.poll(() => docText(b)).toBe('v1 late');
      // Typing here afterwards works normally (and is saved).
      await b.locator('.cm-content').click();
      await focusEditorEnd(b);
      await b.keyboard.type('!');
      await saveNow(b);
      await expect.poll(async () => (await storedTabs(b))[0].content).toBe('v1 late!');
    });

    test('closing the editing window lets the read-only window take over', async ({ page, context, appURL }) => {
      await openFresh(page, appURL);
      await setDoc(page, 'from A');
      const b = await context.newPage();
      await openApp(b, appURL, { role: 'readonly' });
      await page.close(); // plain close: see the note in autosave.spec.js (WebKit)
      // Web Lock: immediate. Lease: immediate when the closing page removes its lease, otherwise
      // after the 10 s abandonment delay of the spec (+ one 2 s renewal tick).
      await expect(b.locator('html')).toHaveAttribute('data-role', 'editor', { timeout: path === 'lease' ? 13000 : 5000 });
      expect(await docText(b)).toBe('from A');
      await focusEditorEnd(b);
      await b.keyboard.type('!');
      await saveNow(b);
      expect((await storedTabs(b))[0].content).toBe('from A!');
    });

    test('a simulated simultaneous save produces a "(conflict)" tab instead of lost text', async ({ page, appURL }) => {
      await openFresh(page, appURL);
      await setDoc(page, 'base');
      await saveNow(page);
      // Another writer saves the same tab behind this window's back (new revision).
      await page.evaluate(() => {
        const idx = JSON.parse(localStorage.getItem('modest-text:v1:index'));
        const key = 'modest-text:v1:tab:' + idx.order[0];
        const rec = JSON.parse(localStorage.getItem(key));
        localStorage.setItem(key, JSON.stringify({ rev: rec.rev + 1, name: rec.name, mode: rec.mode, saved: Date.now(), content: 'theirs' }));
      });
      await focusEditorEnd(page);
      await page.keyboard.type(' mine');
      await saveNow(page);
      expect(await tabNames(page)).toEqual(['Untitled 1', 'Untitled 1 (conflict)']);
      await clickTab(page, 'Untitled 1');
      expect(await docText(page)).toBe('theirs');
      await clickTab(page, 'Untitled 1 (conflict)');
      expect(await docText(page)).toBe('base mine');
      const saved = await storedTabs(page);
      expect(saved.map((t) => [t.name, t.content])).toEqual([['Untitled 1', 'theirs'], ['Untitled 1 (conflict)', 'base mine']]);
      await expect(page.locator('.toast-text').last()).toContainText('(conflict)');
    });
  });
}
