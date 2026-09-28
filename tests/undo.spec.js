// Done when #4 (per-tab undo history) and #5 (undo close stack).
import { test, expect, openFresh, openApp, addTab, rename, clickTab, docText, setDoc, focusEditorEnd, tabNames, closeTabByName, tabByName, openHelp } from './helpers.js';

test('4. undo acts only on the active tab; history survives tab switches, .md toggles and close/reopen', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await rename(page, 'Untitled 1', 'A');
  await focusEditorEnd(page);
  await page.keyboard.type('alpha');
  await page.waitForTimeout(700); // separate undo groups
  await page.keyboard.type(' beta');
  await addTab(page, 'B');
  await focusEditorEnd(page);
  await page.keyboard.type('bee');
  for (let i = 0; i < 6; i++) await page.keyboard.press('ControlOrMeta+z');
  expect(await docText(page)).toBe('');
  // Undo with focus outside the editor (on the tab itself) still only targets the active tab.
  await tabByName(page, 'B').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ControlOrMeta+z');
  await clickTab(page, 'A');
  expect(await docText(page)).toBe('alpha beta');
  await focusEditorEnd(page);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await docText(page)).toBe('alpha');
  await page.keyboard.press('ControlOrMeta+Shift+KeyZ');
  expect(await docText(page)).toBe('alpha beta');
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('Control+y');
  expect(await docText(page)).toBe('alpha beta');
  // Toggling .md keeps the text and the history.
  await page.click('#btn-md');
  await expect(page.locator('#btn-md')).toHaveAttribute('aria-pressed', 'true');
  expect(await docText(page)).toBe('alpha beta');
  await page.locator('.cm-content').focus();
  await page.keyboard.press('ControlOrMeta+z');
  expect(await docText(page)).toBe('alpha');
  await page.click('#btn-md');
  await page.locator('.cm-content').focus();
  await page.keyboard.press('ControlOrMeta+Shift+KeyZ');
  expect(await docText(page)).toBe('alpha beta');
  // B was never touched by all of this.
  await clickTab(page, 'B');
  expect(await docText(page)).toBe('');
  await page.locator('.cm-content').focus();
  await page.keyboard.press('ControlOrMeta+Shift+KeyZ');
  expect(await docText(page)).toBe('bee');
  // Close A and reopen it with ↩️: history is still there.
  await closeTabByName(page, 'A');
  await page.click('#btn-undo-close');
  await expect(page.locator('.tab.active .tab-name')).toHaveText('A');
  await page.locator('.cm-content').focus();
  await page.keyboard.press('ControlOrMeta+z');
  expect(await docText(page)).toBe('alpha');
});

test('5. after closing 4 non-empty tabs, ↩️ reopens the last 3 in reverse order at their original positions, then disables', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, 't1');
  await rename(page, 'Untitled 1', 'T1');
  await addTab(page, 'T2', 't2');
  await addTab(page, 'T3', 't3');
  await addTab(page, 'T4', '# t4', { md: true });
  await addTab(page, 'T5', 't5');
  const undoBtn = page.locator('#btn-undo-close');
  await expect(undoBtn).toBeDisabled();
  // The icon: the hand-drawn "undo" line icon (arrow pointing left, curve below), in the text colour,
  // centred in a button of the usual size; faded while disabled.
  const icon = await undoBtn.evaluate((btn) => {
    const svg = btn.querySelector('svg.icon');
    const b = btn.getBoundingClientRect(), r = svg.getBoundingClientRect();
    return { name: svg.dataset.icon, size: [r.width, r.height], dx: (r.left + r.right) / 2 - (b.left + b.right) / 2, dy: (r.top + r.bottom) / 2 - (b.top + b.bottom) / 2,
      stroke: getComputedStyle(svg).stroke, color: getComputedStyle(btn).color, opacity: getComputedStyle(btn).opacity };
  });
  expect(icon.name).toBe('reopen'); // clock arrow: "reopen closed tab", not text undo
  expect(icon.size).toEqual([20, 20]);
  expect(Math.abs(icon.dx)).toBeLessThanOrEqual(1);
  expect(Math.abs(icon.dy)).toBeLessThanOrEqual(1);
  expect(icon.stroke).toBe(icon.color);
  expect(Number(icon.opacity)).toBeLessThan(0.6); // disabled: nothing to reopen yet
  expect(await undoBtn.evaluate((e) => [e.offsetWidth, e.offsetHeight])).toEqual(await page.locator('#btn-new').evaluate((e) => [e.offsetWidth, e.offsetHeight])); // same size as + next to it
  for (const n of ['T2', 'T4', 'T1', 'T5']) await closeTabByName(page, n);
  expect(await tabNames(page)).toEqual(['T3']);
  await expect(undoBtn).toBeEnabled();
  await expect(undoBtn).toHaveAttribute('title', 'Reopen “T5”');
  await expect(undoBtn).toHaveAttribute('aria-label', 'Reopen “T5”');

  await undoBtn.click();
  expect(await tabNames(page)).toEqual(['T3', 'T5']);
  await expect(page.locator('.tab.active .tab-name')).toHaveText('T5');
  expect(await docText(page)).toBe('t5');
  await expect(undoBtn).toHaveAttribute('title', 'Reopen “T1”');
  await undoBtn.click();
  expect(await tabNames(page)).toEqual(['T1', 'T3', 'T5']);
  expect(await docText(page)).toBe('t1');
  await undoBtn.click();
  expect(await tabNames(page)).toEqual(['T1', 'T3', 'T4', 'T5']);
  expect(await docText(page)).toBe('# t4');
  await expect(page.locator('#btn-md')).toHaveAttribute('aria-pressed', 'true');
  await expect(undoBtn).toBeDisabled();
  await expect(undoBtn).toHaveAttribute('title', 'No closed tab to reopen');

  // Empty tabs and the Help tab are never added.
  await page.click('#btn-new');
  await closeTabByName(page, 'Untitled 1');
  await openHelp(page);
  await closeTabByName(page, 'Help');
  await expect(undoBtn).toBeDisabled();

  // The stack is persisted.
  await closeTabByName(page, 'T3');
  await page.reload();
  await expect(page.locator('html[data-ready="1"][data-role="editor"]')).toHaveCount(1);
  await expect(undoBtn).toHaveAttribute('title', 'Reopen “T3”');
  await undoBtn.click();
  expect(await tabNames(page)).toEqual(['T1', 'T3', 'T4', 'T5']);
  expect(await docText(page)).toBe('t3');
});

test('reopening clamps the position when tabs moved and keeps names unique', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, 'x');
  await rename(page, 'Untitled 1', 'X');
  await addTab(page, 'Y', 'y');
  await addTab(page, 'Z', 'z');
  await closeTabByName(page, 'Z'); // position 2
  await closeTabByName(page, 'Y');
  await page.click('#btn-new');
  await rename(page, 'Untitled 1', 'Z');
  await closeTabByName(page, 'X');
  // Stack now: Z(pos 2), Y(pos 1), X(pos 0) -> reopen X, then Y, then Z (name clash -> "Z (2)").
  await page.click('#btn-undo-close');
  await page.click('#btn-undo-close');
  await page.click('#btn-undo-close');
  expect(await tabNames(page)).toEqual(['X', 'Y', 'Z (2)', 'Z']);
});
