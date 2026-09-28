// Done when #7 (export / Export All / round trip) and #8 (import rules).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const PY = process.platform === 'win32' ? 'python' : 'python3'; // the Python 3 command
import {
  test, expect, openFresh, openApp, addTab, rename, clickTab, docText, setDoc, tabNames, download, importFiles, stored,
  watchToasts, toastLog,
} from './helpers.js';

const PY_CHECK = `
import sys, zipfile, json
z = zipfile.ZipFile(sys.argv[1])
bad = z.testzip()
print(json.dumps({"bad": bad, "files": [[i.filename, i.flag_bits & 0x800, i.compress_type] for i in z.infolist()]}))
z.extractall(sys.argv[2])
`;

// Minimal Windows-1252 encoder for the test text.
const CP1252 = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97, 'œ': 0x9c, 'Œ': 0x8c };
const enc1252 = (s) => Buffer.from([...s].map((c) => CP1252[c] ?? (c.charCodeAt(0) < 256 ? c.charCodeAt(0) : 0x3f)));

test('7a. Export: the tab name plus the right extension, UTF-8 without BOM, LF, content exactly as held', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  const text = 'Crème brûlée\n« déjà vu »\u00A0!\n😀 👨\u200D👩\u200D👧\n\ttab\n';
  await setDoc(page, text);
  await rename(page, 'Untitled 1', 'Café notes');
  let dl = await download(page, () => page.click('#btn-export'));
  expect(dl.name).toBe('Café notes.txt');
  expect(dl.bytes.equals(Buffer.from(text, 'utf8'))).toBe(true);
  expect(dl.bytes[0]).not.toBe(0xef);
  expect(dl.bytes.includes(0x0d)).toBe(false);

  await addTab(page, 'Doc', '# Title\n\n*x*', { md: true });
  dl = await download(page, () => page.click('#btn-export'));
  expect(dl.name).toBe('Doc.md');
  expect(dl.bytes.toString('utf8')).toBe('# Title\n\n*x*');

  await addTab(page, 'readme.md', 'plain but named .md');
  dl = await download(page, () => page.click('#btn-export'));
  expect(dl.name).toBe('readme.md');

  await addTab(page, 'list.txt', '- a', { md: true });
  dl = await download(page, () => page.click('#btn-export'));
  expect(dl.name).toBe('list.txt');
});

test('7a2. Export right after typing a first heading names the file from it (no waiting for the tab to rename itself)', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await page.click('#btn-md');
  await setDoc(page, '# Fresh heading\n\nbody'); // the tab renames itself only once typing pauses (400 ms)
  const dl = await download(page, () => page.click('#btn-export'));
  expect(dl.name).toBe('Fresh heading.md');
  await expect(page.locator('.tab.active .tab-name')).toHaveText('Fresh heading');
});

test('7b. Export All: ZIP passes unzip -t and zipfile.testzip, keeps accented names, and round-trips through Import', async ({ page, browser, appURL }) => {
  await openFresh(page, appURL);
  const tabs = [
    { name: 'Café crème', text: 'Crème\nbrûlée — «\u00A0ok\u00A0»', md: false },
    { name: 'Résumé', text: '# Résumé\n\n- **gras**\n- *italique*\n', md: true },
    { name: 'naïve', text: 'naïveté\n', md: false },
    { name: 'Vide', text: '', md: false },
    { name: 'Ünïcödé ñ 日本', text: '日本語のテキスト', md: false },
    { name: 'Liste.md', text: '1. un\n2. deux', md: true },
  ];
  await setDoc(page, tabs[0].text);
  await rename(page, 'Untitled 1', tabs[0].name);
  for (const t of tabs.slice(1)) await addTab(page, t.name, t.text, { md: t.md });
  const dl = await download(page, () => page.click('#btn-export-all'));
  expect(dl.name).toMatch(/^modest-text_\d{8}_\d{6}\.zip$/);

  const unzip = execFileSync('unzip', ['-t', dl.path], { encoding: 'utf8' });
  expect(unzip).toContain('No errors detected');
  const out = mkdtempSync(join(tmpdir(), 'mt-unzip-'));
  const py = JSON.parse(execFileSync(PY, ['-c', PY_CHECK, dl.path, out], { encoding: 'utf8' }));
  expect(py.bad).toBeNull();
  const names = py.files.map((f) => f[0]).sort();
  expect(names).toEqual(['Café crème.txt', 'Liste.md', 'Résumé.md', 'naïve.txt', 'Ünïcödé ñ 日本.txt'].sort());
  expect(py.files.every((f) => f[1] === 0x800)).toBe(true);
  for (const t of tabs.filter((x) => x.text)) {
    const file = /\.(txt|md)$/.test(t.name) ? t.name : t.name + (t.md ? '.md' : '.txt');
    expect(readFileSync(join(out, file), 'utf8')).toBe(t.text);
  }
  // macOS: ditto -x -k uses the same Apple archive code as Archive Utility.
  if (process.platform === 'darwin') {
    const out2 = mkdtempSync(join(tmpdir(), 'mt-ditto-'));
    execFileSync('ditto', ['-x', '-k', dl.path, out2]);
    expect(readdirSync(out2).map((f) => f.normalize('NFC')).sort()).toEqual(names.map((f) => f.normalize('NFC')).sort());
    expect(readFileSync(join(out2, 'Café crème.txt'), 'utf8')).toBe(tabs[0].text);
  }

  // Restore into a brand-new workspace: import all files at once.
  const ctx2 = await browser.newContext();
  const errors = [];
  const page2 = await ctx2.newPage();
  page2.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page2.on('pageerror', (e) => errors.push(e.message));
  await openApp(page2, appURL);
  await page2.setInputFiles('#file-input', readdirSync(out).map((f) => join(out, f)));
  await expect(page2.locator('.toast-text').last()).toHaveText('Imported 5 tabs');
  // Imported tabs keep the full file name: a name that already had its extension comes back exactly,
  // an extension-less name comes back with the extension it was exported with.
  const restored = (await tabNames(page2)).filter((n) => n !== 'Help');
  expect(restored).toEqual(['Café crème.txt', 'Liste.md', 'naïve.txt', 'Résumé.md', 'Ünïcödé ñ 日本.txt']);
  for (const t of tabs.filter((x) => x.text)) {
    await clickTab(page2, /\.(txt|md)$/.test(t.name) ? t.name : t.name + (t.md ? '.md' : '.txt'));
    expect(await docText(page2)).toBe(t.text);
    await expect(page2.locator('#btn-md')).toHaveAttribute('aria-pressed', String(t.md));
  }
  expect(errors).toEqual([]);
  await ctx2.close();
});

test('8a. Import rejects .zip, .pdf, files over 1 MB and binary files renamed .txt, with a message', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await watchToasts(page); // the messages outlive their toasts: see watchToasts
  await importFiles(page, [
    { name: 'archive.zip', mimeType: 'application/zip', buffer: Buffer.from('504b0304', 'hex') },
    { name: 'doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') },
    { name: 'huge.txt', text: 'a'.repeat(1024 * 1024 + 1) },
    { name: 'binary.txt', buffer: Buffer.from([0x48, 0x69, 0x00, 0x01, 0xff, 0x00]) },
  ]);
  await expect.poll(() => toastLog(page), { timeout: 60000 }).toContain('Imported 0 tabs · skipped 4 (1 too large, 2 wrong type, 1 not text)');
  expect(await tabNames(page)).toEqual(['Untitled 1']);
  // Exactly 1 MB is accepted.
  await importFiles(page, [{ name: 'exact.txt', text: 'b'.repeat(1024 * 1024) }, { name: 'z.bin', text: 'x' }]);
  await expect.poll(() => toastLog(page), { timeout: 60000 }).toContain('Imported 1 tab · skipped 1 (1 wrong type)');
  expect(await tabNames(page)).toEqual(['Untitled 1', 'exact.txt']);
});

test('8b. Import converts Windows-1252, honours BOMs, cleans text and names', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  const french = 'Élève à l’école : « déjà vu » — coût 5 € … Œuvre, cœur\r\nFin\r';
  await importFiles(page, [
    { name: 'francais.txt', buffer: enc1252(french) },
    { name: 'utf8bom.txt', buffer: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Bonjour ça va\u0001', 'utf8')]) },
    { name: 'utf16.txt', buffer: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Привет мир\r\n', 'utf16le')]) },
    { name: 'bad:na*me?.md', text: '# ok' },
  ]);
  await expect(page.locator('.toast-text').last()).toHaveText('Imported 4 tabs');
  expect(await tabNames(page)).toEqual(['Untitled 1', 'badname.md', 'francais.txt', 'utf8bom.txt', 'utf16.txt']); // numeric-aware sort
  await clickTab(page, 'francais.txt');
  expect(await docText(page)).toBe('Élève à l’école : « déjà vu » — coût 5 € … Œuvre, cœur\nFin\n');
  const s = await stored(page);
  const rec = Object.values(s).find((v) => v && v.name === 'francais.txt');
  expect(rec.content).toBe('Élève à l’école : « déjà vu » — coût 5 € … Œuvre, cœur\nFin\n');
  await clickTab(page, 'utf8bom.txt');
  expect(await docText(page)).toBe('Bonjour ça va');
  await clickTab(page, 'utf16.txt');
  expect(await docText(page)).toBe('Привет мир\n');
  await clickTab(page, 'badname.md');
  await expect(page.locator('#btn-md')).toHaveAttribute('aria-pressed', 'true');
});

test('8c. several files become tabs sorted by name, appended after existing tabs, never replacing any', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, 'mine');
  await rename(page, 'Untitled 1', 'b.txt');
  await importFiles(page, [{ name: 'c.txt', text: 'C' }, { name: 'b.txt', text: 'B' }, { name: 'a.md', text: '# A' }, { name: 'B10.txt', text: '10' }, { name: 'b2.txt', text: '2' }]);
  await expect(page.locator('.toast-text').last()).toHaveText('Imported 5 tabs');
  expect(await tabNames(page)).toEqual(['b.txt', 'a.md', 'b (2).txt', 'b2.txt', 'B10.txt', 'c.txt']);
  await clickTab(page, 'b.txt');
  expect(await docText(page)).toBe('mine');
  await clickTab(page, 'b (2).txt');
  expect(await docText(page)).toBe('B');
  await clickTab(page, 'a.md');
  await expect(page.locator('#btn-md')).toHaveAttribute('aria-pressed', 'true');
});

test('8d. files dropped onto the window are imported', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await watchToasts(page);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['dropped text'], 'dropped.txt', { type: 'text/plain' }));
    dt.items.add(new File(['x'], 'nope.zip', { type: 'application/zip' }));
    const target = document.querySelector('.cm-content');
    target.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await expect.poll(() => toastLog(page), { timeout: 60000 }).toContain('Imported 1 tab · skipped 1 (1 wrong type)');
  expect(await tabNames(page)).toEqual(['Untitled 1', 'dropped.txt']);
  expect(await docText(page)).toBe('dropped text');
  await clickTab(page, 'Untitled 1');
  expect(await docText(page)).toBe('');
});
