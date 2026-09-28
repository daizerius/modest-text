// Shared fixtures and helpers for the Modest Text suite.
import { test as base, expect } from '@playwright/test';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export { expect };

export const test = base.extend({
  appURL: ['', { option: true }],
  // Every page of every test is watched: any console error or uncaught exception fails the test.
  consoleErrors: [async ({ context, appURL }, use) => {
    const errors = [];
    const isApp = (p) => p.url().split(/[?#]/)[0] === appURL || p.url() === 'about:blank';
    const hook = (p) => {
      p.on('console', (m) => { if (m.type() === 'error' && isApp(p)) errors.push(`console: ${m.text()}`); });
      p.on('pageerror', (e) => { if (isApp(p)) errors.push(`pageerror: ${e.message}`); });
    };
    context.pages().forEach(hook);
    context.on('page', hook);
    await use(errors);
    expect(errors, 'console errors').toEqual([]);
  }, { auto: true }],
  // Shortcut labels follow the keyboard layout (src/keys.js), and the machine running the tests has a
  // layout of its own (French AZERTY, say), which would make every assertion about a key
  // name depend on whose machine ran it. Every test therefore gets a browser with no layout information,
  // so the US names stand; the test that covers the adaptation stubs a layout of its own on the page,
  // which runs after this and wins.
  // Leaving a page with notes changed since the last Export All shows the browser's "Leave site?" box
  // (windows.js). Tests leave and reload pages all the time: answer it as a user choosing to leave.
  // A test that checks the box listens for it itself. Other dialogs are dismissed, as by default.
  leaveAnyway: [async ({ context }, use) => {
    const hook = (p) => p.on('dialog', (d) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {}));
    context.pages().forEach(hook);
    context.on('page', hook);
    await use();
  }, { auto: true }],
  usKeyLayout: [async ({ context }, use) => {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'keyboard', { configurable: true, get: () => undefined });
    });
    await use();
  }, { auto: true }],
});

export const isFirefox = (testInfo) => testInfo.project.name.startsWith('firefox');
export const isFile = (testInfo) => testInfo.project.name.endsWith('file');

export async function openApp(page, appURL, { role = 'editor' } = {}) {
  await page.goto(appURL);
  await expect(page.locator(`html[data-ready="1"][data-role="${role}"]`)).toHaveCount(1);
}

// Open the app and leave one fresh empty tab ("Untitled 1") active; Help is closed.
export async function openFresh(page, appURL) {
  await openApp(page, appURL);
  await page.click('#btn-new');
  await closeTabByName(page, 'Help');
  await expect(page.locator('.tab')).toHaveCount(1);
}

export const tabNames = (page) => page.locator('.tab .tab-name').allTextContents();
export const activeName = (page) => page.locator('.tab.active .tab-name').textContent();
export const tabByName = (page, name) => page.locator('.tab').filter({ has: page.locator('.tab-name', { hasText: new RegExp(`^${escapeRe(name)}$`) }) });
export const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function closeTabByName(page, name) {
  await tabByName(page, name).locator('.tab-close').click();
}

export async function clickTab(page, name) {
  await tabByName(page, name).locator('.tab-name').click();
  await expect(page.locator('.tab.active .tab-name')).toHaveText(name);
}

// Read / drive the CodeMirror view of the active tab (test-only access through CM's DOM link).
export function docText(page) {
  return page.evaluate(() => document.getElementById('editor').mtView.state.doc.toString());
}
export function setDoc(page, text) {
  return page.evaluate((t) => {
    const v = document.getElementById('editor').mtView;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t } });
  }, text);
}
export function setCursor(page, pos) {
  return page.evaluate((p) => {
    const v = document.getElementById('editor').mtView;
    v.focus();
    v.dispatch({ selection: { anchor: Math.min(p, v.state.doc.length) } });
  }, pos);
}

export function selectRange(page, from, to) {
  return page.evaluate(([f, t]) => {
    const v = document.getElementById('editor').mtView;
    v.focus();
    v.dispatch({ selection: { anchor: f, head: t } });
  }, [from, to]);
}
export const cursorPos = (page) => page.evaluate(() => document.getElementById('editor').mtView.state.selection.main.head);

// Put text on the real clipboard (a genuine click lets the async Clipboard API write), for a later Cmd/Ctrl+V.
export async function writeClipboard(page, { plain, html }) {
  await page.evaluate(({ plain, html }) => {
    const btn = document.createElement('button');
    btn.id = 'mt-test-copy';
    btn.textContent = 'copy';
    btn.style.cssText = 'position:fixed;left:0;bottom:0;z-index:99';
    btn.addEventListener('click', () => {
      const items = {};
      if (html !== undefined) items['text/html'] = new Blob([html], { type: 'text/html' });
      if (plain !== undefined) items['text/plain'] = new Blob([plain], { type: 'text/plain' });
      window.__copied = navigator.clipboard.write([new ClipboardItem(items)]).then(() => 'ok', (e) => String(e));
      btn.remove();
    });
    document.body.append(btn);
  }, { plain, html });
  await page.click('#mt-test-copy');
  await expect.poll(() => page.evaluate(() => window.__copied)).toBe('ok');
}

export async function focusEditorEnd(page) {
  await page.evaluate(() => {
    const v = document.getElementById('editor').mtView;
    v.focus();
    v.dispatch({ selection: { anchor: v.state.doc.length } });
  });
}

// Create a tab with a given name / content / mode.
// The name comes before the content. A new tab takes its name from its first heading 400 ms after its text
// changes (see autoName in tabs.js), so setting a "# heading" first and renaming second raced that timer: on a
// slow run the tab was renamed to its heading between reading its name and double-clicking it by that name.
// Renaming first settles the name, and the heading no longer decides it.
export async function addTab(page, name, content = '', { md = false } = {}) {
  await page.click('#btn-new');
  if (name) await rename(page, await activeName(page), name);
  if (content) { await setDoc(page, content); }
  if (md) await page.click('#btn-md');
}

// Double-click a tab to open the rename modal. Firefox driven over WebDriver BiDi never reports a click
// count of 2 (verified on a bare page), so there the app's own "two clicks within 500 ms" rule is what
// fires; under load the driver can space its two clicks further apart, so the double-click is retried.
export async function dblclickTab(page, name) {
  for (let attempt = 1; ; attempt++) {
    await tabByName(page, name).dblclick();
    try {
      await expect(page.locator('#modal')).toBeVisible({ timeout: attempt < 3 ? 2000 : 8000 });
      return;
    } catch (e) {
      if (attempt >= 3) throw e;
      await page.waitForTimeout(600); // let the app's double-click window expire before retrying
    }
  }
}

export async function rename(page, from, to) {
  await dblclickTab(page, from);
  await page.fill('#rename-input', to);
  await page.keyboard.press('Enter');
  await expect(page.locator('#modal')).toBeHidden();
}

export const saveNow = (page) => page.keyboard.press('ControlOrMeta+s');

// All modest-text: keys, parsed when JSON.
export function stored(page) {
  return page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k.startsWith('modest-text:')) continue;
      const v = localStorage.getItem(k);
      try { out[k] = JSON.parse(v); } catch { out[k] = v; }
    }
    return out;
  });
}
export async function storedTabs(page) {
  const s = await stored(page);
  const order = s['modest-text:v1:index']?.order || [];
  return order.map((id) => ({ id, ...s['modest-text:v1:tab:' + id] }));
}

export async function importFiles(page, files) {
  await page.setInputFiles('#file-input', files.map((f) => ({
    name: f.name, mimeType: f.mimeType || 'text/plain', buffer: Buffer.isBuffer(f.buffer) ? f.buffer : Buffer.from(f.buffer ?? f.text ?? '', 'utf8'),
  })));
}

// A toast removes itself after 7 s. The import tests feed the app files of one enormous line
// ('a'.repeat(880 * 1024)), and laying a line that long out costs WebKit about 8 s of blocked main
// thread — the same bytes with ordinary line breaks cost 0.2 s — so the toast of the import that just
// finished is gone before anything can read the DOM. These record every toast as it is added, and read
// the record afterwards.
export function watchToasts(page) {
  return page.evaluate(() => {
    if (window.__toastLog) return;
    window.__toastLog = [];
    const seen = (node) => {
      if (node.nodeType !== 1) return;
      const texts = node.matches('.toast-text') ? [node] : [...node.querySelectorAll('.toast-text')];
      for (const el of texts) window.__toastLog.push(el.textContent);
    };
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) seen(n);
    }).observe(document.getElementById('toasts'), { childList: true, subtree: true });
  });
}
export function toastLog(page) {
  return page.evaluate(() => window.__toastLog || []);
}

export async function download(page, action) {
  const [dl] = await Promise.all([page.waitForEvent('download'), action()]);
  const dir = mkdtempSync(join(tmpdir(), 'mt-dl-'));
  const path = join(dir, dl.suggestedFilename());
  await dl.saveAs(path);
  // WebKit hands the name back decomposed (Café → Cafe + combining acute); the app asked for the
  // composed form, and the two are the same name, so compare them composed.
  return { name: dl.suggestedFilename().normalize('NFC'), path, bytes: readFileSync(path) };
}

// Fill localStorage with non-app keys until the quota is reached; then free `leave` characters.
export function fillStorage(page, leave = 0) {
  return page.evaluate((leave) => {
    let i = 0;
    let size = 1 << 20;
    while (size >= 1) {
      try { localStorage.setItem('filler_' + i, 'f'.repeat(size)); i++; } catch { size = Math.floor(size / 2); }
    }
    // Top up the last few characters so that storage is completely full.
    const v0 = localStorage.getItem('filler_0');
    for (let extra = 64; extra >= 1; extra = Math.floor(extra / 2)) {
      try { localStorage.setItem('filler_0', localStorage.getItem('filler_0') + 'f'.repeat(extra)); extra *= 2; } catch { /* smaller */ }
      if (extra > 4096) break;
    }
    void v0;
    if (leave) {
      const v = localStorage.getItem('filler_0');
      localStorage.setItem('filler_0', v.slice(0, Math.max(0, v.length - leave)));
    }
    return i;
  }, leave);
}
export const clearFiller = (page) => page.evaluate(() => {
  for (const k of Object.keys(localStorage)) if (k.startsWith('filler_')) localStorage.removeItem(k);
});

export const status = (page) => page.locator('#st-status');

// EN|FR is one toggle button: click it only when the language must change.
export async function setLang(page, code) {
  if ((await page.getAttribute('html', 'lang')) !== code) await page.click('#btn-lang');
  await expect(page.locator('html')).toHaveAttribute('lang', code);
}

// Theme toggle with its cross-fade: returns the new theme once the fade is over.
export async function toggleTheme(page) {
  const before = await page.getAttribute('html', 'data-theme');
  await page.click('#btn-theme');
  const after = before === 'dark' ? 'light' : 'dark';
  await expect(page.locator('html')).toHaveAttribute('data-theme', after);
  await expect(page.locator('html[data-theme-fading]')).toHaveCount(0);
  return after;
}

export const openHelp = (page) => page.click('#btn-help');

// Type Markdown line by line, accepting the list markers that Enter inserts by itself
// (and removing them when the next line is not a continuation).
export async function typeMarkdown(page, text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (i > 0) {
      await page.keyboard.press('Enter');
      const auto = await page.evaluate(() => {
        const v = document.getElementById('editor').mtView;
        const l = v.state.doc.lineAt(v.state.selection.main.head);
        return l.text.slice(0, v.state.selection.main.head - l.from);
      });
      if (auto && line.startsWith(auto)) line = line.slice(auto.length);
      else if (auto) {
        // Select the inserted marker (as a user would with the mouse); typing then replaces it.
        await page.evaluate(() => {
          const v = document.getElementById('editor').mtView;
          const head = v.state.selection.main.head;
          v.dispatch({ selection: { anchor: v.state.doc.lineAt(head).from, head } });
        });
        if (!line) { await page.keyboard.press('Backspace'); continue; }
      }
    }
    if (line) await page.keyboard.type(line);
  }
}
