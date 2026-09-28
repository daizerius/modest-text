// Done when #12 (uninstalled fonts greyed out), and the font rules:
// plain-text tabs always use a monospace font ("Source and code"), the "Markdown text" font applies to
// every Markdown tab; one menu with the two sections.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { test, expect, openFresh, addTab, clickTab, setDoc } from './helpers.js';

// Ground truth from the OS font folders (macOS or Windows).
const WIN = process.platform === 'win32';
const FONT_DIRS = WIN
  ? [join(process.env.WINDIR || 'C:\\Windows', 'Fonts'), join(process.env.LOCALAPPDATA || homedir(), 'Microsoft', 'Windows', 'Fonts')]
  : ['/System/Library/Fonts', '/System/Library/Fonts/Supplemental', '/Library/Fonts', join(homedir(), 'Library/Fonts')];
const allFontFiles = FONT_DIRS.filter(existsSync).flatMap((d) => readdirSync(d)).map((f) => f.toLowerCase());
// Windows file names of the regular faces.
const WIN_FILES = { Georgia: 'georgia', 'Times New Roman': 'times', Arial: 'arial', Verdana: 'verdana', 'Cascadia Mono': 'cascadiamono', Consolas: 'consola', 'Courier New': 'cour', Menlo: 'menlo' };
const osHas = (font) => allFontFiles.some((f) => {
  const base = f.replace(/\.(ttf|ttc|otf|dfont)$/, '');
  return WIN ? base === WIN_FILES[font] : base.replace(/[ _-]/g, '') === font.toLowerCase().replace(/ /g, '');
});
const FONTS = ['Georgia', 'Times New Roman', 'Arial', 'Verdana', 'Cascadia Mono', 'Consolas', 'Courier New', 'Menlo'];
const family = (page, sel = '.cm-scroller') => page.locator(sel).first().evaluate((e) => getComputedStyle(e).fontFamily);

test('12. uninstalled fonts are greyed out and unselectable; each option is previewed in its own font', async ({ page, appURL }) => {
  test.skip(!['darwin', 'win32'].includes(process.platform), 'font ground truth is read from the macOS or Windows font folders');
  await openFresh(page, appURL);
  const monoDefault = ['Consolas', 'Menlo', 'Courier New'].find(osHas);
  await expect(page.locator('#font-label')).toHaveText(monoDefault);
  expect(await family(page)).toMatch(new RegExp(`^"?${monoDefault}"?, monospace$`));

  // Each mode lists only its own fonts: monospace in a plain-text tab, Markdown text fonts in a Markdown tab.
  await page.click('#font-btn');
  await expect(page.locator('#font-list')).toBeVisible();
  expect(await page.locator('.font-group').allTextContents()).toEqual(['Source and code (monospace)']);
  const monoOpts = await page.locator('.font-opt').allTextContents();
  expect(monoOpts).toEqual(FONTS.slice(4));
  await expect(page.locator('.font-opt[aria-checked="true"]')).toHaveText([monoDefault]);
  await page.keyboard.press('Escape');
  await addTab(page, 'Md', '# md', { md: true });
  await page.click('#font-btn');
  expect(await page.locator('.font-group').allTextContents()).toEqual(['Markdown text']);
  expect(await page.locator('.font-opt').allTextContents()).toEqual(FONTS.slice(0, 4));
  await expect(page.locator('.font-opt[aria-checked="true"]')).toHaveText(['Georgia']);
  for (const f of FONTS) {
    if (FONTS.indexOf(f) === 4) { await page.keyboard.press('Escape'); await clickTab(page, 'Untitled 1'); await page.click('#font-btn'); }
    const opt = page.locator(`.font-opt[data-font="${f}"]`);
    const installed = osHas(f);
    await expect(opt, f).toHaveAttribute('aria-disabled', String(!installed));
    expect(await opt.evaluate((e) => e.style.fontFamily)).toMatch(new RegExp(`^"?${f}"?,`));
    if (!installed) {
      await expect(opt).toHaveAttribute('title', 'Not installed on this system');
      expect(Number(await opt.evaluate((e) => getComputedStyle(e).opacity))).toBeLessThan(0.6);
    }
  }
  // Consolas is missing on a Mac: greyed out and unselectable (on Windows it is installed and is the default).
  if (!osHas('Consolas')) {
    await page.locator('.font-opt[data-font="Consolas"]').click({ force: true });
    await expect(page.locator('#font-label')).toHaveText(monoDefault);
  }
  await page.click('.font-opt[data-font="Courier New"]');
  await expect(page.locator('#font-list')).toBeHidden();
  await expect(page.locator('#font-label')).toHaveText('Courier New');
  expect(await family(page)).toMatch(/^"?Courier New"?, monospace$/);

  // Keyboard: open, move, choose (disabled fonts are skipped).
  await page.locator('#font-btn').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(page.locator('#font-label')).toHaveText(FONTS.slice(4).filter(osHas).pop()); // Menlo on a Mac, Courier New on Windows
});

test('plain-text tabs always use the monospace font; the Markdown font applies to every Markdown tab; code stays monospace', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, 'plain text');
  await addTab(page, 'M1', '# Title\n\ntext `code`', { md: true });
  await addTab(page, 'M2', 'second *markdown* tab', { md: true });
  // Markdown tabs start in Georgia; the button shows the Markdown font there.
  await expect(page.locator('#font-label')).toHaveText('Georgia');
  expect(await family(page)).toMatch(/^"?Georgia"?, serif$/);
  // Choose Verdana for Markdown text: every Markdown tab changes, plain text does not.
  await page.click('#font-btn');
  await page.click('.font-opt[data-font="Verdana"]');
  expect(await family(page)).toMatch(/^"?Verdana"?, sans-serif$/);
  await clickTab(page, 'M1');
  expect(await family(page)).toMatch(/^"?Verdana"?/);
  expect(await family(page, '.mt-code')).toMatch(/monospace$/); // code keeps the monospace font
  await clickTab(page, 'Untitled 1');
  expect(await family(page)).toMatch(/monospace$/);
  await expect(page.locator('#font-label')).not.toHaveText('Verdana');
  // In a Markdown tab the menu offers no monospace font; the one chosen in a plain-text tab is used for code.
  await clickTab(page, 'M1');
  await page.click('#font-btn');
  await expect(page.locator('.font-opt[data-font="Courier New"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await clickTab(page, 'Untitled 1');
  await page.click('#font-btn');
  await expect(page.locator('.font-opt[data-font="Verdana"]')).toHaveCount(0);
  await page.click('.font-opt[data-font="Courier New"]');
  await expect(page.locator('#font-label')).toHaveText('Courier New');
  expect(await family(page)).toMatch(/^"?Courier New"?, monospace$/);
  await clickTab(page, 'M1');
  await expect(page.locator('#font-label')).toHaveText('Verdana');
  expect(await family(page, '.mt-code')).toMatch(/^"?Courier New"?, monospace$/);
  // Both choices are saved.
  await page.reload();
  await expect(page.locator('html[data-ready="1"]')).toHaveCount(1);
  await clickTab(page, 'Untitled 1');
  await expect(page.locator('#font-label')).toHaveText('Courier New');
  await clickTab(page, 'M2');
  await expect(page.locator('#font-label')).toHaveText('Verdana');
});

test('saved fonts that are missing fall back to the defaults', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await addTab(page, 'M', '# md', { md: true });
  const mdDefault = await page.locator('#font-label').textContent();
  await clickTab(page, 'Untitled 1');
  const monoDefault = await page.locator('#font-label').textContent();
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('modest-text:v1:settings') || '{}');
    Object.assign(s, { mdFont: 'Not-A-Font', monoFont: 'Consolas-Not-Here' });
    localStorage.setItem('modest-text:v1:settings', JSON.stringify(s));
  });
  await page.reload();
  await expect(page.locator('html[data-ready="1"]')).toHaveCount(1);
  await clickTab(page, 'Untitled 1');
  await expect(page.locator('#font-label')).toHaveText(monoDefault);
  await clickTab(page, 'M');
  await expect(page.locator('#font-label')).toHaveText(mdDefault);
});
