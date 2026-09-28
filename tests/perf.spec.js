// Done when #3 (second half): typing in a 1 MB tab never stutters during autosave.
// Runs in the *-perf projects, one at a time after the main suite, so other browsers do not
// compete for the CPU while event-loop gaps are measured.
import { test, expect, openFresh, focusEditorEnd, status, importFiles, storedTabs } from './helpers.js';

const contentOf = async (page, name) => (await storedTabs(page)).find((t) => t.name === name)?.content;

test('3g. typing in a 1 MB tab never stutters during autosave', async ({ page, appURL }) => {
  test.setTimeout(120000);
  await openFresh(page, appURL);
  const line = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labo\n';
  const big = line.repeat(Math.floor(1000000 / line.length));
  await importFiles(page, [{ name: 'big.txt', text: big }]);
  await expect(page.locator('.tab.active .tab-name')).toHaveText('big.txt');
  await focusEditorEnd(page);
  for (const mode of ['plain', 'md']) {
    if (mode === 'md') { await page.click('#btn-md'); await focusEditorEnd(page); await page.waitForTimeout(300); }
    await page.evaluate(() => {
      window.__gaps = [];
      let last = performance.now();
      window.__mon = setInterval(() => { const n = performance.now(); window.__gaps.push(n - last); last = n; }, 10);
    });
    const typed = mode === 'plain' ? 'typing without stutter ' : 'and in markdown mode too';
    await page.keyboard.type(typed, { delay: 30 });
    await expect(status(page)).toHaveText('Saved', { timeout: 5000 });
    const gaps = await page.evaluate(() => { clearInterval(window.__mon); return window.__gaps; });
    const max = Math.max(...gaps);
    console.log(`[${test.info().project.name}] 1 MB ${mode}: ${gaps.length} samples, max event-loop gap ${max.toFixed(1)} ms`);
    expect(max).toBeLessThan(100);
    expect((await contentOf(page, 'big.txt')).endsWith(typed)).toBe(true);
  }
});
