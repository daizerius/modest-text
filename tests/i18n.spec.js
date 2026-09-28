// Done when #15: every UI string switches between FR and EN.
import { STRINGS, helpText } from '../src/i18n.js';
import { test, expect, openFresh, openApp, addTab, docText, setDoc, importFiles, fillStorage, saveNow, focusEditorEnd, tabNames, setLang, openHelp, dblclickTab } from './helpers.js';

test('15a. both dictionaries have the same keys and every string is translated', async () => {
  const en = STRINGS.en, fr = STRINGS.fr;
  expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  for (const k of Object.keys(en)) {
    expect(JSON.stringify(fr[k]), k).not.toBe(JSON.stringify(en[k]));
    // Same placeholders on both sides.
    const ph = (s) => JSON.stringify(s).match(/\{\w+\}/g)?.sort() ?? [];
    expect(ph(fr[k]), k).toEqual(ph(en[k]));
  }
  const mac = { mod: 'Cmd', alt: 'Option', mac: true };
  expect(helpText('fr', mac)).not.toBe(helpText('en', mac));
  expect(helpText('fr', mac)).toContain('Où sont vos notes');
});

// Tooltips and Help name the keys of the platform the page runs on: the menu symbols ⌘ ⌥ ⇧ ⌃ on a Mac
// ("⇧⌘Z"), Ctrl / Alt / Shift elsewhere ("Ctrl+Shift+Z").
for (const [platform, mod, alt, other] of [['MacIntel', '⌘', '⌥', /\bCtrl\b|\bAlt\b|\bCmd\b|\bOption\b|\bShift\+|\bMaj\+/], ['Win32', 'Ctrl+', 'Alt+', /[⌘⌥⇧⌃]|\bCmd\b|\bOption\b|Cmd\/Ctrl/]]) {
  test(`key names follow the platform in tooltips and Help prose (${platform})`, async ({ page, appURL }) => {
    await page.addInitScript((p) => Object.defineProperty(Navigator.prototype, 'platform', { get: () => p }), platform);
    await openApp(page, appURL); // first launch: Help is open
    for (const lang of ['en', 'fr']) {
      await setLang(page, lang);
      const help = await docText(page);
      const mac = mod === '⌘';
      expect(help).toContain(`${mod}S`);
      expect(help).toContain(`${alt}↑`);
      expect(help, `${lang}: no other platform's key names`).not.toMatch(other);
      expect(help).toContain(mac ? '`⇧⌘Z`' : '`Ctrl+Y`');
      // Shortcuts in the platform's order: ⌥⌘1 / Ctrl+Shift+1, ⇧⌘X / Ctrl+Shift+X, ⌘J / Ctrl+J.
      const sh = lang === 'fr' ? 'Maj' : 'Shift';
      for (const k of mac ? ['⌥⌘1', '⇧⌘X', '⌘J', '⌥⇧↑', '⇧⌘↩'] : [`Ctrl+${sh}+1`, `Ctrl+${sh}+X`, 'Ctrl+J', `Alt+${sh}+↑`, `Ctrl+${sh}+${lang === 'fr' ? 'Entrée' : 'Enter'}`]) expect(help, `${lang} ${k}`).toContain('`' + k + '`');
      await expect(page.locator('.fmt-btn[data-fmt="bold"]')).toHaveAttribute('title', mac ? /\(⌘B\)$/ : /\(Ctrl\+B\)$/);
      await expect(page.locator('#btn-undo')).toHaveAttribute('aria-label', mac ? /\(⌘Z\)$/ : /\(Ctrl\+Z\)$/);
      const tips = await page.evaluate(() => [...document.querySelectorAll('[title], [aria-label]')].flatMap((e) => [e.title, e.getAttribute('aria-label')]).filter(Boolean).join('\n'));
      expect(tips, `${lang} tooltips`).not.toMatch(other);
    }
    // The link tooltip in Markdown text too.
    await page.click('#btn-new');
    await page.click('#btn-md');
    await setDoc(page, 'see [site](https://example.com)\n\nx');
    await expect(page.locator('.mt-link')).toHaveAttribute('title', new RegExp(`^https://example.com\\n${mod === '⌘' ? '⌘\\+' : 'Ctrl\\+'}clic`));
  });
}

// Collect every user-visible string of the chrome: texts, tooltips and aria-labels.
function collect(page) {
  return page.evaluate(() => {
    const out = [];
    const skip = (el) => el.closest('.cm-editor, .tab-name, #help-view'); // the Help page is compared by its prose below
    let i = 0; // position among the collected elements only (editor content varies with the language)
    document.querySelectorAll('body *:not(script):not(style)').forEach((el) => {
      if (skip(el)) return;
      i++;
      for (const attr of ['title', 'aria-label']) {
        const v = el.getAttribute(attr);
        if (v) out.push([`${el.id || el.className || el.tagName}#${i}@${attr}`, v]);
      }
      if (el.children.length === 0 && el.textContent.trim()) out.push([`${el.id || el.className || el.tagName}#${i}@text`, el.textContent.trim()]);
    });
    return out;
  });
}
// Language-neutral strings that legitimately stay the same.
const NEUTRAL = /^(Modest Text|FR|EN|💾|📦|📥|📄|📝|💡|ℹ️|B|I|S|ab|<\/>|H1|H2|H3|•|1\.|❝|\{ \}|🔗|―|\+|×|↩️|🌙|·|\||—|▾|●|Menlo|Consolas|Courier New|Cascadia Mono|Georgia|Times New Roman|Arial|Verdana|\d{2}-\d{2}-\d{4} ∙ \d{2}:\d{2}:\d{2}|Untitled 1|Notes)$/;

test('15b. every UI string — buttons, tooltips, dropdowns, modal, banners, status bar, messages, Help — switches FR/EN', async ({ page, context, appURL }) => {
  await openFresh(page, appURL);
  await addTab(page, 'Notes', 'one two three');
  await openHelp(page);
  // Show every piece of chrome that is normally hidden so that its strings are compared too.
  const reveal = () => page.evaluate(() => {
    for (const id of ['banner-full', 'banner-ro', 'rename-error', 'st-storage', 'drop-overlay']) document.getElementById(id).hidden = false;
  });
  await page.click('#font-btn');
  await reveal();
  const en = new Map(await collect(page));
  // The Help page: every heading, paragraph and table cell of prose in French too (key names and code are the same).
  const helpProse = () => page.locator('#help-view').locator('h1, h2, p, th').allTextContents();
  const helpEn = await helpProse();
  await page.keyboard.press('Escape');
  await setLang(page, 'fr');
  await page.click('#font-btn');
  await reveal();
  const fr = new Map(await collect(page));
  const helpFr = await helpProse();
  expect(helpFr.length).toBe(helpEn.length);
  expect(helpFr.filter((x, i) => x === helpEn[i] && !/^(Action)$/.test(x))).toEqual([]); // "Action" is French too
  await page.keyboard.press('Escape');
  const untranslated = [];
  for (const [k, v] of en) {
    if (NEUTRAL.test(v)) continue;
    if (!fr.has(k)) { untranslated.push(`${k} missing in FR`); continue; }
    if (fr.get(k) === v) untranslated.push(`${k}: ${v}`);
  }
  expect(untranslated).toEqual([]);
  expect(en.size).toBeGreaterThan(40);

  // Specific spots.
  await expect(page.locator('#app-title')).toHaveText('Modest Text');
  await expect(page.locator('#btn-export')).toHaveAttribute('aria-label', /^Exporter\u00A0: /);
  await expect(page.locator('#btn-export-all')).toHaveAttribute('aria-label', /^Tout exporter\u00A0: /);
  await expect(page.locator('#btn-import')).toHaveAttribute('aria-label', /^Importer\u00A0: /);
  await expect(page.locator('#banner-export-all')).toHaveText('Tout exporter');
  await expect(page.locator('#btn-lang [data-lang="fr"]')).toHaveClass(/active/);
  await expect(page.locator('#btn-lang [data-lang="en"]')).not.toHaveClass(/active/);
  await expect(page.locator('#btn-wrap')).toHaveAttribute('title', /^Renvoi à la ligne/); // either tooltip (plain or Markdown tab)
  await expect(page.locator('#btn-wrap')).toHaveAttribute('aria-label', /^Renvoi à la ligne/);
  await expect(page.locator('#btn-readwidth')).toHaveAttribute('title', /^Largeur de lecture/);
  await expect(page.locator('#banner-full .banner-text')).toHaveText('Stockage plein\u00A0: les dernières modifications ne sont pas enregistrées.');
  await expect(page.locator('#banner-ro .banner-text')).toHaveText('Ouvert dans une autre fenêtre');
  await expect(page.locator('#btn-edit-here')).toHaveText('Modifier plutôt ici');
  // Help tab regenerated in French, name included.
  await expect(page.locator('.tab.active .tab-name')).toHaveText('Aide');
  const help = await docText(page);
  expect(help).toContain('Où sont vos notes');
  expect(help).toContain('uniquement dans ce navigateur, sur cet ordinateur');
  // Status bar.
  await page.locator('.tab', { hasText: 'Notes' }).click();
  await expect(page.locator('#st-counts')).toHaveText('1 ligne · 3 mots · 13 caractères');
  await expect(page.locator('#st-status')).toHaveText('Enregistré');
  // Default names in French for new tabs; existing names are not renamed.
  await page.click('#btn-new');
  expect(await tabNames(page)).toEqual(['Untitled 1', 'Notes', 'Aide', 'Sans titre 1']);
  // Messages.
  await importFiles(page, [{ name: 'a.txt', text: 'a' }, { name: 'b.zip', text: 'b' }]);
  await expect(page.locator('.toast-text').last()).toHaveText('1 onglet importé · 1 ignoré(s) (1 de mauvais type)');
  // Modal.
  await dblclickTab(page, 'Notes');
  await expect(page.locator('#rename-title')).toHaveText('Renommer l’onglet');
  await expect(page.locator('#rename-preview')).toHaveText('Nouveau nom\u00A0: Notes');
  await page.keyboard.press('Escape');
  // Read-only window banner in French.
  const b = await context.newPage();
  await openApp(b, appURL, { role: 'readonly' });
  await expect(b.locator('#banner-ro')).toBeVisible();
  await expect(b.locator('#banner-ro .banner-text')).toHaveText('Ouvert dans une autre fenêtre');
  await expect(b.locator('#st-status')).toHaveText('Lecture seule');
  // And back to English.
  await setLang(page, 'en');
  await expect(page.locator('#btn-export')).toHaveAttribute('title', /^Export: /);
  await expect(page.locator('#st-counts')).toHaveText(/lines? · \d+ words? · \d+ characters?/);
});

test('15c. the red banner and its messages are translated when they appear', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setLang(page, 'fr');
  await setDoc(page, 'x'.repeat(50000));
  await saveNow(page);
  await fillStorage(page, 0);
  await focusEditorEnd(page);
  await page.keyboard.type('y');
  await saveNow(page);
  await expect(page.locator('#banner-full')).toBeVisible();
  await expect(page.locator('#banner-full')).toContainText('Stockage plein');
  await expect(page.locator('#st-status')).toHaveText('Échec de l’enregistrement');
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('filler_')) localStorage.removeItem(k); });
  await saveNow(page);
  await expect(page.locator('.toast-text', { hasText: 'Stockage de nouveau disponible' })).toHaveCount(1);
});

test.describe('default language', () => {
  test.use({ locale: 'fr-FR' });
  test('15d. French when the browser language is French', async ({ page, appURL }) => {
    await openApp(page, appURL);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('.tab.active .tab-name')).toHaveText('Aide');
    await page.click('#btn-new');
    await expect(page.locator('.tab.active .tab-name')).toHaveText('Sans titre 1');
  });
});
