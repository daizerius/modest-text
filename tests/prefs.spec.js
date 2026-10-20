// Done when #6: the settings panel. Every setting in one place, applied and saved at once, in every window.
import { test, expect, download, openFresh, openApp, setDoc, saveNow, stored } from './helpers.js';

const settingsOf = async (page) => (await stored(page))['modest-text:v1:settings'] || {};
const prefsKey = process.platform === 'darwin' ? 'Alt+Meta+Comma' : 'Alt+Comma';

test('the settings panel opens from the top bar and with its key, and closes with Esc', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  const dlg = page.locator('#prefs-dialog');
  await expect(page.locator('#btn-prefs')).toHaveAttribute('aria-label', /Settings$/);
  await page.click('#btn-prefs');
  await expect(dlg).toBeVisible();
  await expect(page.locator('#prefs-theme')).toBeFocused();
  await expect(dlg.locator('h3')).toHaveText(['Appearance', 'Text', 'Links', 'Files', 'Your data']);
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await page.keyboard.press(prefsKey);
  await expect(dlg).toBeVisible();
  await page.keyboard.press(prefsKey); // the same key closes it
  await expect(dlg).toBeHidden();
  if (process.platform === 'darwin') { // Cmd+, alone is left to the browser (Safari's own settings)
    await page.keyboard.press('Meta+Comma');
    await expect(dlg).toBeHidden();
  }
  // Listed with the other shortcuts.
  await page.keyboard.press('ControlOrMeta+Slash');
  await expect(page.locator('#keys-body tr', { hasText: 'Settings' })).toHaveCount(1);
});

test('each setting in the panel applies at once and survives a reload', async ({ page, appURL }) => {
  await openFresh(page, appURL); // a plain-text tab
  await page.click('#btn-prefs');
  await page.selectOption('#prefs-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.selectOption('#prefs-size', '24');
  await expect(page.locator('#size-select')).toHaveValue('24');
  await page.click('#prefs-dialog [data-toggle="wrap"] [data-value="off"]');
  await expect(page.locator('#btn-wrap')).toHaveAttribute('aria-pressed', 'false');
  await page.click('#prefs-dialog [data-toggle="links"] [data-value="off"]');
  await expect(page.locator('#prefs-dialog [data-toggle="mail"]')).toBeDisabled(); // e-mail links need links
  await page.locator('#prefs-lang').focus();
  await page.selectOption('#prefs-lang', 'fr');
  // Rebuilt in French, the focus still on the language.
  await expect(page.locator('#prefs-dialog h3').first()).toHaveText('Apparence');
  await expect(page.locator('#prefs-lang')).toBeFocused();
  expect(await settingsOf(page)).toMatchObject({ theme: 'dark', lang: 'fr', size: 24, wrap: false, links: false });
  await page.reload();
  await expect(page.locator('html[data-ready="1"]')).toHaveCount(1);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.click('#btn-prefs');
  await expect(page.locator('#prefs-size')).toHaveValue('24');
  await expect(page.locator('#prefs-dialog [data-toggle="wrap"]')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#prefs-dialog [data-toggle="links"]')).toHaveAttribute('aria-checked', 'false');
});

test('"Same as the system" follows the system again after the theme button was used', async ({ page, appURL }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openFresh(page, appURL);
  await page.click('#btn-theme'); // dark, chosen: the system no longer counts
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.click('#btn-prefs');
  await expect(page.locator('#prefs-theme')).toHaveValue('dark');
  await page.selectOption('#prefs-theme', '');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect((await settingsOf(page)).theme).toBeNull();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('your data: the space used, the last Export All, and Erase', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, 'some text');
  await saveNow(page);
  await page.click('#btn-prefs');
  await expect(page.locator('#prefs-used')).toHaveText(/^\d\.\d \/ ~5 MB$/);
  await expect(page.locator('#prefs-last')).toHaveText('Last full export: never');
  await download(page, () => page.click('#prefs-export-all'));
  await expect(page.locator('#prefs-last')).toHaveText(/^Last full export: \d/);
  await page.click('#prefs-erase');
  await expect(page.locator('#prefs-dialog')).toBeHidden();
  await expect(page.locator('#erase-dialog')).toBeVisible();
  await page.click('#erase-cancel');
});

// A read-only window may change the settings: the editing window takes the change up, instead of writing its
// own copy back over it the next time it saves one.
test('a setting changed in a read-only window reaches the editing window and sticks', async ({ page, context, appURL }) => {
  await openFresh(page, appURL);
  const b = await context.newPage();
  await openApp(b, appURL, { role: 'readonly' });
  await b.click('#btn-prefs');
  await expect(b.locator('#prefs-erase')).toBeDisabled(); // only the editing window erases
  await b.selectOption('#prefs-theme', 'dark');
  await b.selectOption('#prefs-size', '13');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#size-select')).toHaveValue('13');
  // The editing window changes another setting: the read-only window's choices stay.
  await page.click('#btn-wrap');
  await expect.poll(() => settingsOf(page)).toMatchObject({ theme: 'dark', size: 13, wrap: false });
  // And the open panel in the read-only window shows the editing window's change.
  await expect(b.locator('#prefs-dialog [data-toggle="wrap"]')).toHaveAttribute('aria-checked', 'false');
  await b.goto('about:blank');
  await b.close();
});
