// Done when #6 (rename cleaning) plus the other tab behaviours of the spec.
import { test, expect, openFresh, addTab, rename, clickTab, docText, setDoc, setCursor, tabNames, tabByName, closeTabByName, stored, dblclickTab, openHelp } from './helpers.js';

const openRenameModal = (page, name) => dblclickTab(page, name);

test('6. rename cleans names, de-duplicates, Esc/backdrop cancel, empty names are rejected', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, 'x');
  await openRenameModal(page, 'Untitled 1');
  // Centred, prefilled and selected.
  const box = await page.locator('.modal').boundingBox();
  const vp = page.viewportSize();
  expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThan(3);
  expect(Math.abs(box.y + box.height / 2 - vp.height / 2)).toBeLessThan(3);
  expect(await page.$eval('#rename-input', (i) => [i.value, i.selectionStart, i.selectionEnd, document.activeElement === i])).toEqual(['Untitled 1', 0, 10, true]);
  // Live preview of the cleaned name.
  await page.fill('#rename-input', 'CON');
  await expect(page.locator('#rename-preview')).toHaveText('Will be named: _CON');
  await page.keyboard.press('Enter');
  await expect(page.locator('#modal')).toBeHidden();
  expect(await tabNames(page)).toEqual(['_CON']);

  await rename(page, '_CON', 'a/b:c');
  expect(await tabNames(page)).toEqual(['abc']);
  await rename(page, 'abc', '  x..  ');
  expect(await tabNames(page)).toEqual(['x']);
  await rename(page, 'x', 'lpt1');
  expect(await tabNames(page)).toEqual(['_lpt1']);
  await rename(page, '_lpt1', 'tab\u0007 with \t  spaces * ? " < > | \\ end. . ');
  expect(await tabNames(page)).toEqual(['tab with spaces end']);
  await rename(page, 'tab with spaces end', 'y'.repeat(150));
  expect(await tabNames(page)).toEqual(['y'.repeat(100)]);
  await rename(page, 'y'.repeat(100), 'Notes');

  // Duplicate (case-insensitive) gets " (2)", then " (3)".
  await addTab(page, 'notes');
  expect(await tabNames(page)).toEqual(['Notes', 'notes (2)']);
  await addTab(page, 'NOTES');
  expect(await tabNames(page)).toEqual(['Notes', 'notes (2)', 'NOTES (3)']);
  // Renaming a tab to its own name in another case is allowed.
  await rename(page, 'Notes', 'NoTeS');
  expect(await tabNames(page)).toEqual(['NoTeS', 'notes (2)', 'NOTES (3)']);

  // Esc cancels.
  await openRenameModal(page, 'NoTeS');
  await page.fill('#rename-input', 'changed');
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).toBeHidden();
  // Clicking the backdrop cancels.
  await openRenameModal(page, 'NoTeS');
  await page.fill('#rename-input', 'changed');
  await page.mouse.click(5, 5);
  await expect(page.locator('#modal')).toBeHidden();
  expect(await tabNames(page)).toEqual(['NoTeS', 'notes (2)', 'NOTES (3)']);

  // An empty result is rejected: the modal stays open with a message.
  await openRenameModal(page, 'NoTeS');
  for (const empty of ['', '   ', ' / : * ', '...']) {
    await page.fill('#rename-input', empty);
    await expect(page.locator('#rename-error')).toBeVisible();
    await expect(page.locator('#rename-error')).toHaveText('The name cannot be empty.');
    await expect(page.locator('#rename-ok')).toBeDisabled();
    await page.keyboard.press('Enter');
    await expect(page.locator('#modal')).toBeVisible();
  }
  await page.keyboard.press('Escape');
  expect(await tabNames(page)).toEqual(['NoTeS', 'notes (2)', 'NOTES (3)']);
  // Names are stored.
  await page.keyboard.press('ControlOrMeta+s');
  const s = await stored(page);
  const storedNames = s['modest-text:v1:index'].order.map((id) => s['modest-text:v1:tab:' + id].name);
  expect(storedNames).toEqual(['NoTeS', 'notes (2)', 'NOTES (3)']);
});

test('new tabs: "Untitled N" with the next unused number; + appends, activates and focuses', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await page.click('#btn-new');
  await page.click('#btn-new');
  expect(await tabNames(page)).toEqual(['Untitled 1', 'Untitled 2', 'Untitled 3']);
  await expect(page.locator('.tab.active .tab-name')).toHaveText('Untitled 3');
  expect(await page.evaluate(() => document.activeElement.classList.contains('cm-content'))).toBe(true);
  await closeTabByName(page, 'Untitled 2');
  await page.click('#btn-new');
  expect(await tabNames(page)).toEqual(['Untitled 1', 'Untitled 3', 'Untitled 2']);
  await page.keyboard.type('typed right away');
  expect(await docText(page)).toBe('typed right away');
});

test('closing: no confirmation; the active tab passes to its right neighbour, else its left; the last tab leaves a fresh one', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, 'a');
  await rename(page, 'Untitled 1', 'A');
  await addTab(page, 'B', 'b');
  await addTab(page, 'C', 'c');
  await clickTab(page, 'B');
  await closeTabByName(page, 'B');
  await expect(page.locator('.tab.active .tab-name')).toHaveText('C');
  await closeTabByName(page, 'C');
  await expect(page.locator('.tab.active .tab-name')).toHaveText('A');
  // Closing an inactive tab keeps the active one.
  await addTab(page, 'D', 'd');
  await closeTabByName(page, 'A');
  await expect(page.locator('.tab.active .tab-name')).toHaveText('D');
  await closeTabByName(page, 'D');
  expect(await tabNames(page)).toEqual(['Untitled 1']);
  expect(await docText(page)).toBe('');
  expect((await stored(page))['modest-text:v1:index'].order).toHaveLength(1);
});

test('tabs: activate on click, F2/Enter keyboard access, overflow scrolls, long names truncate with a tooltip', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  const long = 'A very long tab name that certainly does not fit in the maximum width of one tab';
  await rename(page, 'Untitled 1', long);
  const tab = tabByName(page, long);
  expect(await tab.getAttribute('title')).toContain(long);
  expect(await tab.locator('.tab-name').evaluate((e) => [getComputedStyle(e).textOverflow, e.scrollWidth > e.clientWidth])).toEqual(['ellipsis', true]);
  for (let i = 0; i < 14; i++) await page.click('#btn-new');
  const strip = page.locator('#tabstrip');
  expect(await strip.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  // The active (last) tab is scrolled into view, and so is the first one when activated from the keyboard.
  const inView = (loc) => loc.evaluate((el) => {
    const r = el.getBoundingClientRect(), s = document.querySelector('#tabstrip').getBoundingClientRect();
    return r.left >= s.left - 1 && r.right <= s.right + 1;
  });
  expect(await inView(page.locator('.tab.active'))).toBe(true);
  await page.locator('.tab.active').focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tab.active .tab-name')).toHaveText(long);
  expect(await inView(page.locator('.tab.active'))).toBe(true);
  expect(await page.evaluate(() => document.activeElement.classList.contains('cm-content'))).toBe(true); // Enter opens it, in its text
  await page.locator('.tab.active').focus();
  await page.keyboard.press('F2');
  await expect(page.locator('#modal')).toBeVisible();
  await page.keyboard.press('Escape');
  // The + button stays after the last tab.
  expect(await page.evaluate(() => document.querySelector('#tabs').nextElementSibling.id)).toBe('btn-new'); // + right after the last tab
});

test('two clicks on a tab within 500 ms rename it only if no other tab was activated in between', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await addTab(page, 'Two', 'two');
  // All in one task, well within 500 ms: click "Untitled 1", open Help (activates it), click "Untitled 1" again.
  const r = await page.evaluate(() => {
    const name = (n) => [...document.querySelectorAll('.tab')].find((t) => t.querySelector('.tab-name').textContent === n).querySelector('.tab-name');
    name('Untitled 1').click();
    document.getElementById('btn-help').click();
    const between = document.querySelector('.tab.active .tab-name').textContent;
    name('Untitled 1').click();
    return { between, active: document.querySelector('.tab.active .tab-name').textContent, modal: !document.getElementById('modal').hidden };
  });
  expect(r).toEqual({ between: 'Help', active: 'Untitled 1', modal: false });
  // Two quick clicks with nothing in between still rename.
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => {
    const el = document.querySelector('.tab.active .tab-name');
    el.click(); el.click();
    return !document.getElementById('modal').hidden;
  })).toBe(true);
});

// Shift+Cmd+, / Shift+Cmd+. on a Mac, Ctrl+Shift+, / Ctrl+Shift+. on Windows (navigator.platform), from anywhere.
for (const [platform, mac] of [['MacIntel', true], ['Win32', false]]) {
  test(`previous / next tab with Shift+${mac ? 'Cmd' : 'Ctrl'}+, and . (wrapping, focus kept where it was); R on a tab renames it`, async ({ page, appURL }) => {
    await page.addInitScript((p) => Object.defineProperty(Navigator.prototype, 'platform', { get: () => p }), platform);
    await openFresh(page, appURL);
    await addTab(page, 'Two', 'two');
    await addTab(page, 'Three', 'three');
    const M = mac ? 'Meta' : 'Control';
    const active = () => page.locator('.tab.active .tab-name').textContent();
    const inText = () => page.evaluate(() => document.activeElement.classList.contains('cm-content'));
    // From the text: the new tab's text has the focus, and nothing is typed.
    await setCursor(page, 0);
    await page.keyboard.press(`${M}+Shift+Comma`);
    expect(await active()).toBe('Two');
    expect(await inText()).toBe(true);
    expect(await docText(page)).toBe('two');
    await page.keyboard.press(`${M}+Shift+Period`);
    expect(await active()).toBe('Three');
    await page.keyboard.press(`${M}+Shift+Period`); // past the last tab: the first
    expect(await active()).toBe('Untitled 1');
    await page.keyboard.press(`${M}+Shift+Comma`); // before the first: the last
    expect(await active()).toBe('Three');
    expect(await inText()).toBe(true);
    // The second pair: Ctrl+Cmd+, and . on a Mac, Ctrl+, and . on Windows.
    const C = mac ? 'Control+Meta' : 'Control';
    await page.keyboard.press(`${C}+Comma`);
    expect(await active()).toBe('Two');
    await page.keyboard.press(`${C}+Period`);
    await page.keyboard.press(`${C}+Period`);
    expect(await active()).toBe('Untitled 1');
    expect(await inText()).toBe(true);
    expect(await docText(page)).toBe('');
    // A French AZERTY keyboard, sending the key events it really sends. The shortcuts are matched by the
    // key's physical position, so they are the same two keys as on a US keyboard whatever those keys print:
    // the US "," position prints ";" there, and the US "." position prints ":".
    const azerty = (key, code, shift, ctrl) => page.evaluate(([key, code, shift, ctrl, mac]) => {
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, code, shiftKey: shift, ctrlKey: ctrl || !mac, metaKey: mac, bubbles: true, cancelable: true }));
    }, [key, code, shift, ctrl, mac]);
    // The key that prints "," on AZERTY is the US M position, and it is not one of the two: nothing happens.
    await azerty(',', 'KeyM', false, true);
    expect(await active()).toBe('Untitled 1');
    await azerty('?', 'KeyM', true, false); // Shift on that key gives "?" — it must not open the sheet either
    await expect(page.locator('#keys-dialog')).toBeHidden();
    expect(await active()).toBe('Untitled 1');
    // The US "," position (printing ";", or "." with Shift): previous tab, both pairs.
    await azerty(';', 'Comma', false, true);
    expect(await active()).toBe('Three');
    await azerty('.', 'Comma', true, false);
    expect(await active()).toBe('Two');
    // The US "." position (printing ":", or "/" with Shift): next tab, not the shortcut sheet.
    await azerty('/', 'Period', true, false);
    await expect(page.locator('#keys-dialog')).toBeHidden();
    expect(await active()).toBe('Three');
    // The US "/" position (printing "!") opens the sheet, as it does on a US keyboard.
    await azerty('!', 'Slash', false, false);
    await expect(page.locator('#keys-dialog')).toBeVisible();
    expect(await active()).toBe('Three');
    await page.keyboard.press('Escape');
    await clickTab(page, 'Two');
    await clickTab(page, 'Three');
    await setCursor(page, 0);
    // Option / Alt with them does nothing here (macOS uses Control+Option+Cmd+, and . for the display contrast).
    await page.keyboard.press(mac ? 'Control+Alt+Meta+Comma' : 'Control+Alt+Comma');
    expect(await active()).toBe('Three');
    // From the tabs: the focus follows to the new tab. From another control: it stays there.
    await page.locator('.tab.active').focus();
    await page.keyboard.press(`${M}+Shift+Comma`);
    expect(await active()).toBe('Two');
    expect(await page.evaluate(() => document.activeElement.closest('.tab')?.textContent)).toContain('Two');
    await page.locator('#btn-help').focus();
    await page.keyboard.press(`${M}+Shift+Period`);
    expect(await active()).toBe('Three');
    expect(await page.evaluate(() => document.activeElement.id)).toBe('btn-help');
    // R (or r) on a tab opens the rename modal, without typing the letter.
    await page.locator('.tab.active').focus();
    await page.keyboard.press('r');
    await expect(page.locator('#modal')).toBeVisible();
    await expect(page.locator('#rename-input')).toHaveValue('Three');
    await page.keyboard.type('Drei');
    await page.keyboard.press('Enter');
    expect(await tabNames(page)).toEqual(['Untitled 1', 'Two', 'Drei']);
    await page.locator('.tab.active').focus();
    await page.keyboard.press('Shift+R');
    await expect(page.locator('#modal')).toBeVisible();
    await page.keyboard.press('Escape');
    // N adds a tab and U reopens the last closed one, in the tabs and in the bar under them (Cmd/Ctrl+J, then the key).
    await page.locator('.tab.active').focus();
    await page.keyboard.press('n');
    expect(await tabNames(page)).toEqual(['Untitled 1', 'Two', 'Drei', 'Untitled 2']);
    expect(await inText()).toBe(true); // ready to type in the new tab
    await setDoc(page, 'to close');
    await page.locator('.tab.active .tab-close').click();
    expect(await tabNames(page)).toEqual(['Untitled 1', 'Two', 'Drei']);
    await page.keyboard.press(`${M}+KeyJ`); // the bar under the tabs
    expect(await page.evaluate(() => !!document.activeElement.closest('#formatbar'))).toBe(true);
    await page.keyboard.press('u');
    expect(await tabNames(page)).toEqual(['Untitled 1', 'Two', 'Drei', 'Untitled 2']);
    expect(await docText(page)).toBe('to close');
    expect(await inText()).toBe(true);
    await page.keyboard.press(`${M}+KeyJ`);
    await page.keyboard.press('n');
    expect(await tabNames(page)).toEqual(['Untitled 1', 'Two', 'Drei', 'Untitled 2', 'Untitled 3']);
    await page.locator('#btn-new').focus(); // anywhere in the tab strip, + included
    await page.keyboard.press('u'); // nothing left to reopen: nothing happens
    expect(await tabNames(page)).toHaveLength(5);
    // The keys in the platform's names: shortcut sheet and Help.
    await page.keyboard.press(`${M}+Slash`);
    await expect(page.locator('#keys-body')).toContainText(mac ? '⇧⌘, / ⇧⌘. or ⌃⌘, / ⌃⌘.' : 'Ctrl+Shift+, / Ctrl+Shift+., Ctrl+, / Ctrl+., or Ctrl+PageUp / Ctrl+PageDown');
    const row = (label) => page.locator('#keys-body tr', { has: page.locator('td', { hasText: new RegExp(`^${label}$`) }) }).locator('kbd');
    await expect(row('In the tabs or the bar under them: new tab')).toHaveText(['N']);
    await expect(row('In the tabs or the bar under them: reopen the last closed tab')).toHaveText(['U']);
    await expect(row('Reopen the last closed tab')).toHaveText([mac ? '⌃⌘U' : 'Alt+U']);
    await page.keyboard.press('Escape');
    await openHelp(page);
    expect(await docText(page)).toContain(mac ? '`⇧⌘,` and `⇧⌘.` go to the previous and the next tab, from anywhere; `⌃⌘,` and `⌃⌘.` too' : '`Ctrl+Shift+,` and `Ctrl+Shift+.` go to the previous and the next tab, from anywhere; `Ctrl+,` and `Ctrl+.` too');
    expect(await docText(page)).toContain('`N` adds a tab, `U` reopens the last closed tab');
    expect(await docText(page)).toContain('`F2` or `R` renames it');
  });
}
