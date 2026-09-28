// Done when #1: loads from disk and from a local web server, no console errors, no network
// requests beyond the page itself; CSP and single-file constraints.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { test, expect, openApp, setDoc, docText, stored, download, closeTabByName, setLang, openHelp } from './helpers.js';
const PY = process.platform === 'win32' ? 'python' : 'python3'; // the Python 3 command

const HTML = readFileSync(new URL('../modest-text.html', import.meta.url), 'utf8');

test.describe('1. loading', () => {
  test('opens with no console errors and makes no request beyond loading the page', async ({ page, appURL }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await openApp(page, appURL);
    // Exercise features that could fetch something: images, links, raw HTML, fonts, help, themes.
    await page.click('#btn-new');
    await setDoc(page, '# T\n![img](http://127.0.0.1:9/x.png)\n<img src="http://127.0.0.1:9/z.png">\n[l](https://example.com)\n<link rel="stylesheet" href="http://127.0.0.1:9/s.css">');
    await page.click('#btn-md');
    await page.click('#font-btn');
    await page.keyboard.press('Escape');
    await page.click('#btn-theme');
    await setLang(page, 'fr');
    await openHelp(page);
    await page.reload();
    await expect(page.locator('html[data-ready="1"]')).toHaveCount(1);
    await page.waitForTimeout(500);
    const external = requests.filter((u) => !/^(data|blob|about):/.test(u) && u.split('#')[0] !== appURL);
    expect(external).toEqual([]);
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => !/^(data|blob):/.test(n)));
    expect(resources).toEqual([]);
  });

  test('also works when served by python3 -m http.server', async ({ page }, testInfo) => {
    const port = 8800 + testInfo.workerIndex; // one server per worker
    const root = fileURLToPath(new URL('..', import.meta.url));
    const server = spawn(PY, ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
    // On the macOS runner this server once never answered, and with its output discarded nothing said
    // why: keep what it writes, and stop waiting as soon as it exits.
    let stderr = '', exited = null;
    server.stderr.on('data', (d) => { stderr += d; });
    server.on('exit', (code, signal) => { exited = signal || code; });
    server.on('error', (e) => { exited = e.message; });
    try {
      const url = `http://127.0.0.1:${port}/modest-text.html`;
      await expect.poll(async () => {
        if (exited !== null) return `exited (${exited})`;
        try { return (await fetch(url, { method: 'HEAD' })).status; } catch { return 0; }
      }, { timeout: 30000 }).toBe(200).catch((e) => {
        throw new Error(`${PY} -m http.server ${port} said: ${stderr.trim() || '(nothing)'}\n${e.message}`);
      });
      const requests = [];
      page.on('request', (r) => requests.push(r.url()));
      await page.goto(url);
      await expect(page.locator('html[data-ready="1"][data-role="editor"]')).toHaveCount(1);
      await page.click('#btn-new');
      await setDoc(page, 'served by python');
      await page.reload();
      await expect(page.locator('html[data-ready="1"][data-role="editor"]')).toHaveCount(1);
      expect(await docText(page)).toBe('served by python');
      expect(requests.filter((u) => !/^(data|blob|about):/.test(u) && u !== url)).toEqual([]);
    } finally {
      server.kill();
    }
  });

  test('first launch opens the Help tab (a read-only page), not stored', async ({ page, appURL }) => {
    await openApp(page, appURL);
    await expect(page.locator('.tab')).toHaveCount(1);
    await expect(page.locator('.tab.active .tab-name')).toHaveText('Help');
    await expect(page.locator('#help-view')).toBeVisible();
    await expect(page.locator('#editor')).toBeHidden();
    await expect(page.locator('#btn-md')).toBeDisabled();
    await expect(page.locator('#st-status')).toHaveText('Help · read-only');
    await expect(page.locator('#st-time')).toBeHidden();
    await expect(page.locator('#st-dot')).toBeHidden();
    await expect(page.locator('#st-counts')).toHaveText('');
    const text = await docText(page);
    for (const s of ['only in this browser, on this computer', 'moving or renaming it', 'other local HTML files', '~5 MB',
      'web-hosted copy', 'Private windows', 'clear data on exit', 'unzip it, then import all the files at once', 'Amber', 'Red', process.platform === 'darwin' ? '⌘S' : 'Ctrl+S']) {
      expect(text).toContain(s);
    }
    // Explanations Help must give: save / undo / redo, keyboard use of tabs, read-only windows,
    // where storage alerts appear, every part of the status bar.
    for (const s of ['**Saving** copies your text', '**Undo**', '**Redo**', '`F2` or `R` renames it', 'Edit here instead', 'status says `Read-only`',
      'an amber `Storage 4.3 / ~5 MB` item appears in the status bar', 'a red banner appears under the tabs', '`Saved`', '`Unsaved`', '`Saving…`',
      '`Save failed`', '`Read-only`', 'The dot `●` is green', '`Last full export: 2026-09-16 ∙ 14:03:22 EDT`', '## Formatting bar', process.platform === 'darwin' ? '`↩` on a list item' : '`Enter` on a list item']) {
      expect(text).toContain(s);
    }
    // UI glyphs are only ever mentioned inside code spans.
    const outsideCode = text.replace(/`[^`\n]*`/g, '');
    for (const g of ['💾', '📦', '📥', '↩️', '📄', '📝', '💡', '🌙', 'ℹ️', '×', '▾', '●', '←', '→', '❝', '🔗', '―']) expect(outsideCode, g).not.toContain(g);
    // Read-only: typing does nothing (the page is not editable).
    const shown = await page.locator('#help-view').textContent();
    await page.locator('#help-view').click();
    await page.keyboard.type('zzz');
    expect(await docText(page)).toBe(text);
    await expect(page.locator('#help-view')).toHaveText(shown);
    expect(await page.locator('#help-view [contenteditable], #help-view input, #help-view textarea').count()).toBe(0);
    // Not stored anywhere.
    const s = await stored(page);
    expect(JSON.stringify(s)).not.toContain('Where are my notes');
    expect(s['modest-text:v1:index'].order).toEqual([]);
    // Closing it leaves one fresh empty tab and does not feed the undo-close stack.
    await closeTabByName(page, 'Help');
    await expect(page.locator('.tab .tab-name')).toHaveText(['Untitled 1']);
    await expect(page.locator('#btn-undo-close')).toBeDisabled();
    // The ℹ️ button reopens it, then focuses it; the title itself is plain text.
    expect(await page.locator('#app-title').evaluate((e) => e.tagName)).toBe('SPAN');
    await openHelp(page);
    await expect(page.locator('.tab.active .tab-name')).toHaveText('Help');
    await page.locator('.tab', { hasText: 'Untitled 1' }).click();
    await openHelp(page);
    await expect(page.locator('.tab .tab-name')).toHaveText(['Untitled 1', 'Help']);
    await expect(page.locator('.tab.active .tab-name')).toHaveText('Help');
    // Not reopened after a reload (not a first launch any more).
    await page.reload();
    await expect(page.locator('html[data-ready="1"][data-role="editor"]')).toHaveCount(1);
    await expect(page.locator('.tab .tab-name')).toHaveText(['Untitled 1']);
  });

  for (const [platform, mac] of [['MacIntel', true], ['Win32', false]]) {
    test(`the Help page: copies of the real icons and buttons, a formatting table in ${mac ? 'Mac' : 'Windows'} keys; Find, Export, status bar, scroll, focus, fonts, language`, async ({ page, appURL }) => {
      await page.addInitScript((p) => Object.defineProperty(Navigator.prototype, 'platform', { get: () => p }), platform);
      await openApp(page, appURL); // first launch: Help
      const view = page.locator('#help-view');
      await expect(view.locator('h1')).toHaveText('Modest Text — Help');
      await expect(view).toHaveAttribute('aria-label', 'Help');
      // Icons in the text are copies of the interface's own (same drawing), each named for screen readers.
      const same = await page.evaluate(() => ['import', 'export', 'export-all', 'reopen', 'undo', 'redo', 'tasklist', 'link', 'help'].map((n) => {
        const copy = document.querySelector(`#help-view svg[data-icon="${n}"]`), real = document.querySelector(`#topbar svg[data-icon="${n}"], #tabbar svg[data-icon="${n}"], #formatbar svg[data-icon="${n}"]`);
        return !!copy && copy.innerHTML === real.innerHTML;
      }));
      expect(same).toEqual(Array(9).fill(true));
      await expect(view.locator('li', { hasText: 'Import opens .txt and .md files as new tabs.' }).locator('.help-ui svg[data-icon="import"]')).toHaveCount(1);
      // The shortcut sheet's key, right under the title.
      await expect(view.locator('.help-page > p').nth(1)).toHaveText(`${mac ? '⌘/' : 'Ctrl+/'} shows every keyboard shortcut.`);
      await expect(view.locator('.help-ui[aria-label="Import"]').first()).toBeVisible();
      await expect(view.locator('.help-ui[aria-label="Bold"]')).toHaveText('B');
      expect(await view.locator('.help-ui').evaluateAll((els) => els.every((e) => e.getAttribute('role') === 'img' && e.getAttribute('aria-label')))).toBe(true);
      // In the running text, every icon and face (+ and EN|FR included) is centred on the text next to it.
      // (The nearest character before or after it, whichever is on the same line: a line may wrap next to an icon.)
      const offsets = await page.evaluate(() => [...document.querySelectorAll('#help-view li .help-ui, #help-view p .help-ui')].map((u) => {
        const block = u.closest('li, p'), ur = u.getBoundingClientRect();
        const texts = [];
        for (const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT); w.nextNode();) if (!w.currentNode.parentElement.closest('.help-ui') && w.currentNode.textContent.trim()) texts.push(w.currentNode);
        const before = texts.filter((t) => t.compareDocumentPosition(u) & Node.DOCUMENT_POSITION_FOLLOWING).pop();
        const after = texts.find((t) => t.compareDocumentPosition(u) & Node.DOCUMENT_POSITION_PRECEDING);
        const off = (t, i) => {
          const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 1);
          const tr = r.getBoundingClientRect();
          return Math.abs((ur.top + ur.bottom) / 2 - (tr.top + tr.bottom) / 2);
        };
        return Math.min(before ? off(before, before.textContent.search(/\S\s*$/)) : Infinity, after ? off(after, after.textContent.search(/\S/)) : Infinity);
      }));
      expect(Math.max(...offsets)).toBeLessThanOrEqual(1);
      // The formatting table: a face, an action and the shortcut in the platform's own key names.
      const row = (action) => view.locator('tr', { has: page.locator('td', { hasText: new RegExp(`^${action}$`) }) });
      await expect(row('Bold').locator('code')).toHaveText(mac ? '⌘B' : 'Ctrl+B');
      await expect(row('Headings').locator('code')).toHaveText(mac ? ['⌥⌘1', '⌥⌘2', '⌥⌘3'] : ['Ctrl+Shift+1', 'Ctrl+Shift+2', 'Ctrl+Shift+3']);
      await expect(row('Undo, redo').locator('code')).toHaveText(mac ? ['⌘Z', '⇧⌘Z'] : ['Ctrl+Z', 'Ctrl+Y', 'Ctrl+Shift+Z']);
      expect(await view.locator('table tr').count()).toBe(16); // header + 15 rows
      expect(await view.textContent()).not.toMatch(/\{ui:|\{key:|\|---/); // every marker replaced, the table rendered
      // Status bar: just "Help · read-only". Export: not for Help. Find: the browser's own (the app's bar stays closed).
      await expect(page.locator('#st-status')).toHaveText('Help · read-only');
      await expect(page.locator('#btn-export')).toBeDisabled();
      await page.evaluate(() => { window.__findPrevented = null; window.addEventListener('keydown', (e) => { if (e.key === 'f') window.__findPrevented = e.defaultPrevented; }); });
      await view.focus();
      await page.keyboard.press(mac ? 'Meta+f' : 'Control+f');
      expect(await page.evaluate(() => window.__findPrevented)).toBe(false);
      await expect(page.locator('#findbar')).toBeHidden();
      // A note: the app's find bar; back on Help it closes.
      await page.click('#btn-new');
      await setDoc(page, 'note text');
      await expect(page.locator('#btn-export')).toBeEnabled();
      await page.keyboard.press(mac ? 'Meta+f' : 'Control+f');
      await expect(page.locator('#findbar')).toBeVisible();
      await openHelp(page);
      await expect(page.locator('#findbar')).toBeHidden();
      // Its scroll position is kept when switching tabs; Esc from a bar and Cmd/Ctrl+J come back to the page.
      // Until the page is laid out there is nothing to scroll (seen on the macOS runner): set it until it holds.
      await expect.poll(() => view.evaluate((e) => { e.scrollTop = 900; return e.scrollTop; })).toBe(900);
      await page.locator('.tab', { hasText: 'Untitled 1' }).click();
      await openHelp(page);
      await expect.poll(() => view.evaluate((e) => e.scrollTop)).toBe(900);
      await page.locator('#btn-help').focus();
      await page.keyboard.press('Escape');
      expect(await page.evaluate(() => document.activeElement.id)).toBe('help-view');
      // The font size setting applies; the language switch rebuilds it in French.
      await page.selectOption('#size-select', '24');
      expect(await view.evaluate((e) => getComputedStyle(e).fontSize)).toBe('24px');
      await setLang(page, 'fr');
      await expect(view.locator('h1')).toHaveText('Modest Text — Aide');
      await expect(view.locator('.help-ui[aria-label="Gras"]')).toHaveText('B');
      await expect(page.locator('#st-status')).toHaveText('Aide · lecture seule');
    });
  }

  test('the Help page is built with DOM calls only (no HTML strings)', async () => {
    const src = readFileSync(new URL('../src/helpview.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|DOMParser|createContextualFragment/);
  });

  test('Help is excluded from Export All', async ({ page, appURL }) => {
    await openApp(page, appURL);
    await page.click('#btn-new');
    await setDoc(page, 'note');
    await openHelp(page);
    const dl = await download(page, () => page.click('#btn-export-all'));
    const names = dl.bytes.toString('latin1').match(/[\w .-]+\.(txt|md)/g);
    expect([...new Set(names)]).toEqual(['Untitled 1.txt']);
  });
});

// The bundle is stored compressed in a data block; a small inline loader unpacks it and runs it from a blob: URL
// with an integrity attribute. The CSP allows exactly these two scripts, by hash.
const scriptTags = () => [...HTML.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
const bundle = () => inflateRawSync(Buffer.from(scriptTags().find((m) => /id="mt-code"/.test(m[1]))[2], 'base64')).toString('utf8');

test.describe('single self-contained file', () => {
  test('CSP meta: default-src none, two hashed scripts only (the loader and the bundle), inline styles, data:/blob: images, base-uri/form-action none', async () => {
    const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(HTML);
    expect(m).not.toBeNull();
    const dirs = Object.fromEntries(m[1].split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
    expect(dirs['default-src']).toEqual(["'none'"]);
    expect(dirs['script-src']).toHaveLength(2);
    for (const src of dirs['script-src']) expect(src).toMatch(/^'sha256-[A-Za-z0-9+/=]+'$/);
    expect(m[1]).not.toMatch(/unsafe-eval|strict-dynamic/);
    expect(dirs['script-src'].join(' ')).not.toContain('unsafe-inline');
    expect(dirs['style-src']).toEqual(["'unsafe-inline'"]);
    expect(dirs['img-src']).toEqual(['data:', 'blob:']);
    expect(dirs['base-uri']).toEqual(["'none'"]);
    expect(dirs['form-action']).toEqual(["'none'"]);
    // Two script elements: the data block (never run: not a script type) and the inline loader.
    const scripts = scriptTags();
    expect(scripts.map((x) => x[1].trim())).toEqual(['type="application/octet-stream" id="mt-code"', '']);
    expect(scripts[0][2]).toMatch(/^[A-Za-z0-9+/=]+$/);
    const sha = (text) => `sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`;
    const loaderHash = sha(scripts[1][2]), bundleHash = sha(bundle());
    expect(dirs['script-src']).toEqual([`'${loaderHash}'`, `'${bundleHash}'`]);
    // The loader runs the unpacked bundle only under that hash.
    expect(scripts[1][2]).toContain(`integrity="${bundleHash}"`);
    expect(scripts[1][2]).toContain('DecompressionStream("deflate-raw")');
  });

  test('no external resources, runtime fetches or eval; license notices kept; under 240,000 bytes', async () => {
    expect(HTML).not.toMatch(/<(script|img|iframe|link)[^>]+(src|href)=["']?(https?:)?\/\//i);
    expect(HTML).not.toMatch(/@import|url\(\s*["']?https?:/i);
    for (const js of [bundle(), scriptTags()[1][2]]) {
      expect(js).not.toMatch(/\bfetch\(|XMLHttpRequest|new WebSocket|sendBeacon|importScripts|\beval\(|new Function\(/);
    }
    // Size guard: raise it knowingly. The bundle is stored compressed; the largest single items are the
    // time-zone table (57 names, the only way to say "CET" rather than "GMT+1") and the Help text.
    expect(Buffer.byteLength(HTML)).toBeLessThan(240000);
    // Every bundled package with its copyright line, and the MIT permission text (once: it is the same for all).
    for (const p of ['@codemirror/view', '@codemirror/state', '@codemirror/commands', '@codemirror/language', '@lezer/markdown', '@lezer/common', 'style-mod', 'w3c-keyname', 'crelt']) expect(HTML).toContain(p);
    expect(HTML.match(/Copyright \(C\) \d{4}(-\d{4})? by Marijn Haverbeke/g).length).toBe(11);
    expect(HTML.match(/Permission is hereby granted/g)).toHaveLength(1);
  });

  test('a browser that cannot unpack the bundle shows a message instead of an empty page', async ({ page, appURL }) => {
    await page.addInitScript(() => { delete window.DecompressionStream; });
    await page.goto(appURL);
    await expect(page.locator('.mt-fail')).toContainText('use a current version of Chrome, Edge, Firefox or Safari');
    await expect(page.locator('.mt-fail')).toContainText('utilisez une version récente de Chrome, Edge, Firefox ou Safari');
    await expect(page.locator('html[data-ready]')).toHaveCount(0);
  });
});

test('Help ends with the version (from package.json), the license, the author\'s handle and a link to the repository', async ({ page, appURL }) => {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  await openApp(page, appURL); // first launch: Help is open
  const last = page.locator('#help-view .help-page > p').last();
  await expect(last).toHaveText(`Modest Text ${version} · MIT License · by daizerius · github.com/daizerius/modest-text`);
  const link = last.locator('a');
  await expect(link).toHaveAttribute('href', 'https://github.com/daizerius/modest-text');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await setLang(page, 'fr');
  await expect(page.locator('#help-view .help-page > p').last()).toHaveText(`Modest Text ${version} · licence MIT · par daizerius · github.com/daizerius/modest-text`);
});

test('the app asks the browser to keep its storage (the notes) persistently, once not already kept', async ({ page, appURL }) => {
  await page.addInitScript(() => {
    window.__persistCalls = 0;
    const storage = { persisted: () => Promise.resolve(false), persist: () => { window.__persistCalls++; return Promise.resolve(true); } };
    Object.defineProperty(navigator, 'storage', { configurable: true, get: () => storage });
  });
  await openApp(page, appURL);
  await expect.poll(() => page.evaluate(() => window.__persistCalls)).toBe(1);
});
