// Done when #10 (Markdown security) and #11 (rendering, reveal on cursor line, byte-identical export).
import { test, expect, openFresh, docText, setDoc, setCursor, download, typeMarkdown } from './helpers.js';

const MD = [
  '# Heading 1',
  '## Heading 2',
  '',
  'Para with **bold**, *italic*, ~~strike~~, `code` and [a link](https://example.com/x).',
  '',
  '> Quote line',
  '',
  '- item one',
  '  - nested item',
  '1. first',
  '2. second',
  '',
  '---',
  '',
  '```',
  'fenced code',
  '```',
  'last paragraph',
].join('\n');

const lineText = (page, n) => page.locator('.cm-line').nth(n).evaluate((e) => e.textContent);
const css = (loc, prop) => loc.first().evaluate((e, p) => getComputedStyle(e)[p], prop);

test('11. Markdown mode renders every supported element in serif and reveals syntax only on the cursor line', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await page.click('#btn-md');
  await page.locator('.cm-content').click();
  await typeMarkdown(page, MD); // Enter continues lists: the helper types around the markers it inserts
  expect(await docText(page)).toBe(MD);

  // Cursor on the last line: everything above is rendered.
  await setCursor(page, MD.length);
  expect(await lineText(page, 0)).toBe('Heading 1');
  expect(await lineText(page, 1)).toBe('Heading 2');
  expect(await lineText(page, 3)).toBe('Para with bold, italic, strike, code and a link.');
  expect(await lineText(page, 5)).toBe('Quote line');
  // Markers sit in a box of the list's marker width, which also stands for the space after them.
  expect(await lineText(page, 7)).toBe('•item one');
  expect(await lineText(page, 8)).toBe('•nested item'); // its source indentation is replaced by the list's own
  expect(await lineText(page, 9)).toBe('1.first');
  expect(await lineText(page, 14)).toBe('');
  expect(await lineText(page, 15)).toBe('fenced code');

  const prose = await css(page.locator('.cm-scroller'), 'fontFamily');
  expect(prose).toMatch(/^"?Georgia"?, serif$/); // default Markdown text font
  const base = parseFloat(await css(page.locator('.cm-editor'), 'fontSize'));
  expect(parseFloat(await css(page.locator('.cm-line.mt-h1'), 'fontSize'))).toBeGreaterThan(base * 1.5);
  expect(parseFloat(await css(page.locator('.cm-line.mt-h2'), 'fontSize'))).toBeGreaterThan(base * 1.2);
  expect(Number(await css(page.locator('.mt-strong'), 'fontWeight'))).toBeGreaterThanOrEqual(700);
  expect(await css(page.locator('.mt-em'), 'fontStyle')).toBe('italic');
  expect(await css(page.locator('.mt-strike'), 'textDecorationLine')).toContain('line-through');
  expect(await css(page.locator('.mt-code'), 'fontFamily')).toMatch(/^"?(Consolas|Menlo|Courier New)/);
  expect(await css(page.locator('.cm-line.mt-codeblock').nth(1), 'fontFamily')).toMatch(/^"?(Consolas|Menlo|Courier New)/);
  await expect(page.locator('.cm-line.mt-quote')).toHaveCount(1);
  await expect(page.locator('.mt-bullet')).toHaveCount(2);
  await expect(page.locator('.mt-hr')).toHaveCount(1);
  await expect(page.locator('.mt-link')).toHaveText('a link');
  expect(await css(page.locator('.mt-link'), 'textDecorationLine')).toContain('underline');
  // Only elements from the supported list are created: no <a>, <img>, <script>, <h1> in the editor
  // (CodeMirror's own empty, src-less cursor buffers next to widgets excepted).
  expect(await page.locator('.cm-content a, .cm-content img:not(.cm-widgetBuffer), .cm-content script, .cm-content h1, .cm-content iframe').count()).toBe(0);
  expect(await page.locator('.cm-content img[src]').count()).toBe(0);

  // Cursor on the paragraph: its syntax is revealed, and only there.
  await setCursor(page, MD.indexOf('Para with') + 3);
  expect(await lineText(page, 3)).toBe('Para with **bold**, *italic*, ~~strike~~, `code` and [a link](https://example.com/x).');
  expect(await lineText(page, 0)).toBe('Heading 1');
  // On a heading.
  await setCursor(page, 2);
  expect(await lineText(page, 0)).toBe('# Heading 1');
  expect(await lineText(page, 1)).toBe('Heading 2');
  expect(await lineText(page, 3)).toBe('Para with bold, italic, strike, code and a link.');
  // Inside the fenced block: the fences are revealed.
  await setCursor(page, MD.indexOf('fenced code') + 2);
  expect(await lineText(page, 14)).toBe('```');
  expect(await lineText(page, 16)).toBe('```');
  // On the quote / list / rule lines.
  await setCursor(page, MD.indexOf('> Quote') + 3);
  expect(await lineText(page, 5)).toBe('> Quote line');
  await setCursor(page, MD.indexOf('- item one') + 3);
  expect(await lineText(page, 7)).toBe('- item one');
  await setCursor(page, MD.indexOf('---') + 1);
  expect(await lineText(page, 12)).toBe('---');

  // The source is never rewritten: exported .md is byte-identical to what was typed.
  const dl = await download(page, () => page.click('#btn-export'));
  expect(dl.name).toBe('Heading 1.md'); // the tab named itself from its first heading
  expect(dl.bytes.equals(Buffer.from(MD, 'utf8'))).toBe(true);
  // Toggling back to plain shows the raw text unchanged.
  await page.click('#btn-md');
  expect(await docText(page)).toBe(MD);
  expect(await lineText(page, 0)).toBe('# Heading 1');
});

test('==highlight== renders as a highlight, marks shown only on the cursor line; "a == b" and "===" are not highlights', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await page.click('#btn-md');
  const src = 'Some ==marked text== here.\n\na == b == c and x=== y\n\n**bold ==and marked==**\n\nend';
  await setDoc(page, src);
  await setCursor(page, src.length); // cursor on the last line
  await expect(page.locator('.mt-highlight')).toHaveText(['marked text', 'and marked']);
  expect(await lineText(page, 0)).toBe('Some marked text here.');
  expect(await lineText(page, 2)).toBe('a == b == c and x=== y');
  expect(await css(page.locator('.mt-highlight'), 'backgroundColor')).toBe('rgb(235, 203, 139)');
  await setCursor(page, 3);
  expect(await lineText(page, 0)).toBe('Some ==marked text== here.');
  const dl = await download(page, () => page.click('#btn-export'));
  expect(dl.bytes.toString('utf8')).toBe(src);
  await page.click('#btn-md'); // plain text: shown as typed
  expect(await lineText(page, 0)).toBe('Some ==marked text== here.');
});

test('quotes: 4px bars, text clearly to the right of the bars at every level (also on wrapped lines)', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await page.click('#btn-md');
  await setDoc(page, 'intro\n\n> level one, a long line that wraps onto a second visual line when the window is not very wide at all, really\n> > level two\n> > > level three\n\nend');
  await setCursor(page, 0);
  await page.locator('#btn-export').focus();
  for (const [sel, bars] of [['.mt-quote-1', 1], ['.mt-quote-2', 2], ['.mt-quote-3', 3]]) {
    const q = await page.locator(`.cm-line${sel}`).first().evaluate((line) => {
      const offsets = getComputedStyle(line).boxShadow.split(/,(?![^(]*\))/).map((x) => parseFloat(x.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/)[0]));
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      const first = walker.nextNode();
      const r = document.createRange();
      r.setStart(first, 0);
      r.setEnd(first, 1);
      const lineBox = line.getBoundingClientRect();
      const rects = [...r.getClientRects()];
      // last visual line of the paragraph too
      const whole = document.createRange();
      whole.selectNodeContents(line);
      const lefts = [...whole.getClientRects()].map((x) => x.left - lineBox.left);
      return { offsets, textLeft: rects[0].left - lineBox.left, lefts };
    });
    expect(q.offsets).toHaveLength(bars * 2);
    for (let i = 0; i < bars; i++) expect(q.offsets[2 * i + 1] - q.offsets[2 * i], `${sel} bar ${i + 1}`).toBeGreaterThanOrEqual(4);
    const lastBar = q.offsets[q.offsets.length - 1];
    expect(q.textLeft, sel).toBeGreaterThanOrEqual(lastBar + 8);
    for (const l of q.lefts) expect(l, `${sel} wrapped`).toBeGreaterThanOrEqual(lastBar + 8);
  }
});

test('10. raw HTML, img onerror and javascript: links stay inert; images are never loaded', async ({ page, context, appURL }) => {
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  const popups = [];
  context.on('page', (p) => popups.push(p));

  const port = process.env.MT_PORT || 8765;
  const safe = `http://127.0.0.1:${port}/package.json`;
  await openFresh(page, appURL);
  await page.click('#btn-md');
  const src = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '[x](javascript:alert(1))',
    '![pic](http://127.0.0.1:9/p.png)',
    '<iframe src="http://127.0.0.1:9/f"></iframe>',
    `[ok](${safe})`,
    '[mail](mailto:someone@example.com)',
    '[data](data:text/html,<b>x</b>)',
    'end',
  ].join('\n\n'); // blank lines: each payload is its own block (an <img> line opens an HTML block)
  await setDoc(page, src);
  await setCursor(page, src.length); // cursor on the last line

  const content = page.locator('.cm-content');
  await expect(content).toContainText('<script>alert(1)</script>');
  await expect(content).toContainText('<img src=x onerror=alert(1)>');
  await expect(content).toContainText('[x](javascript:alert(1))');
  await expect(content).toContainText('[data](data:text/html,<b>x</b>)');
  await expect(content).toContainText('Image (not loaded): pic');
  expect(await page.locator('.cm-content script, .cm-content img:not(.cm-widgetBuffer), .cm-content img[src], .cm-content iframe, .cm-content a, .cm-content b').count()).toBe(0);
  expect(await page.locator('.mt-link').allTextContents()).toEqual(['ok', 'mail']);

  // Cmd/Ctrl+click on the javascript: link: nothing happens.
  const jsLink = page.locator('.cm-line', { hasText: 'javascript:alert(1)' });
  await jsLink.click({ modifiers: ['ControlOrMeta'], position: { x: 8, y: 5 } });
  // A plain click on a safe link only places the cursor.
  await page.locator('.mt-link', { hasText: 'ok' }).click();
  await page.waitForTimeout(800);
  expect(popups).toHaveLength(0);
  expect(dialogs).toEqual([]);

  // Cmd/Ctrl+click on a safe link opens it in a new tab, without opener or referrer.
  await setCursor(page, src.length);
  const [popup] = await Promise.all([context.waitForEvent('page'), page.locator('.mt-link', { hasText: 'ok' }).click({ modifiers: ['ControlOrMeta'] })]);
  await popup.waitForLoadState();
  expect(popup.url()).toBe(safe);
  expect(await popup.evaluate(() => [window.opener, document.referrer])).toEqual([null, '']);
  await popup.close();
  expect(dialogs).toEqual([]);
  expect(requests.filter((u) => u.includes('127.0.0.1:9') || u.endsWith('/x'))).toEqual([]);
  expect(await docText(page)).toBe(src);
});
