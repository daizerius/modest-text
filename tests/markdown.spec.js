// Done when #10 (Markdown security) and #11 (rendering, reveal on cursor line, byte-identical export).
import { test, expect, openFresh, docText, setDoc, setCursor, download, typeMarkdown, activeName, clickTab, openHelp } from './helpers.js';

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

  // Cursor on the paragraph: its syntax is revealed, and only there; a link's, only with the cursor in the link.
  await setCursor(page, MD.indexOf('Para with') + 3);
  expect(await lineText(page, 3)).toBe('Para with **bold**, *italic*, ~~strike~~, `code` and a link.');
  expect(await lineText(page, 0)).toBe('Heading 1');
  await setCursor(page, MD.indexOf('a link') + 2);
  expect(await lineText(page, 3)).toBe('Para with **bold**, *italic*, ~~strike~~, `code` and [a link](https://example.com/x).');
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
  // E-mail links are off by default: the written one looks like a link but offers no Cmd/Ctrl+click.
  await expect(page.locator('.mt-link', { hasText: 'mail' })).not.toHaveAttribute('title', /./);

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

test('a link\'s brackets, parentheses and address each have their own colour, in plain-text and Markdown tabs', async ({ page, appURL }) => {
  await openFresh(page, appURL); // a plain-text tab
  const doc = 'see [a link](https://example.com/x) and <https://example.org>';
  const colours = () => page.evaluate(() => Object.fromEntries(['mt-link-bracket', 'mt-link-paren', 'mt-link-url'].map((c) =>
    [c, [...document.querySelectorAll('.' + c)].map((e) => [e.textContent, getComputedStyle(e).color])])));
  for (const md of [false, true]) {
    if (md) await page.click('#btn-md');
    await setDoc(page, doc);
    await setCursor(page, doc.indexOf('a link') + 2); // in a Markdown tab, a link's syntax shows only with the cursor in it
    const c = await colours();
    expect(c['mt-link-bracket'].map(([s]) => s), String(md)).toEqual(md ? ['[', ']'] : ['[', ']', '<', '>']);
    expect(c['mt-link-paren'].map(([s]) => s)).toEqual(['(', ')']);
    expect(c['mt-link-url'].map(([s]) => s)).toEqual(['https://example.com/x', 'https://example.org']);
    // In a Markdown tab, an autolink's address is the link's text, coloured as such.
    if (md) expect(c['mt-link-url'][1][1]).toBe(await page.locator('.mt-link', { hasText: 'example.org' }).evaluate((e) => getComputedStyle(e).color));
    const [b, p, u, text] = [c['mt-link-bracket'][0][1], c['mt-link-paren'][0][1], c['mt-link-url'][0][1],
      await page.locator('.cm-line').first().evaluate((e) => getComputedStyle(e).color)];
    expect(new Set([b, p, u, text]).size).toBe(4);
  }
});

test('headings, bold and italic are subtly coloured in both modes; highlight is tinted in plain-text tabs; a link in a Markdown highlight reads in the dark text colour', async ({ page, appURL }) => {
  await openFresh(page, appURL); // a plain-text tab
  const doc = '# Title\n\nSome **bold**, _italic_, `code` and ==marked `c` [a link](https://example.com)== text.';
  const look = () => page.evaluate(() => {
    const css = (sel) => { const e = document.querySelector(sel); return e && getComputedStyle(e); };
    const lum = (c) => { const v = c.match(/[\d.]+/g).slice(0, 3).map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const bg = getComputedStyle(document.querySelector('.cm-editor')).backgroundColor;
    const hl = css('.mt-c-hl').backgroundColor;
    const r = { text: css('.cm-line:last-child').color, h: css('.mt-c-h').color, strong: css('.mt-c-strong').color, em: css('.mt-c-em').color, code: css('.mt-c-code').color, hl,
      link: css('.mt-link') ? css('.mt-link').color : null, mdHl: css('.mt-highlight')?.backgroundColor };
    r.min = Math.min(...['h', 'strong', 'em', 'code'].map((k) => ratio(r[k], bg)), ...(hl === 'rgba(0, 0, 0, 0)' ? [] : [...document.querySelectorAll('.mt-c-hl, .mt-c-hl *')].map((e) => ratio(getComputedStyle(e).color, hl))));
    return r;
  });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((th) => { document.documentElement.dataset.theme = th; }, theme);
    for (const md of [false, true]) {
      if (md !== (await page.locator('.cm-editor.mt-md').count() === 1)) await page.click('#btn-md');
      await setDoc(page, doc);
      await setCursor(page, 0);
      const r = await look();
      const at = `${theme} ${md ? 'md' : 'plain'}`;
      expect(new Set([r.text, r.h, r.strong, r.em]).size, at).toBe(4);
      expect(r.min, at).toBeGreaterThanOrEqual(4.5);
      if (!md) {
        expect(r.hl, at).not.toBe('rgba(0, 0, 0, 0)');
        expect(new Set([r.text, r.h, r.strong, r.em, r.code]).size, at).toBe(5); // inline code too, in plain text
      }
      else {
        expect(r.hl, at).toBe('rgba(0, 0, 0, 0)'); // the real highlight, not the tint
        expect(r.mdHl, at).toBe('rgb(235, 203, 139)');
        // In the light theme the yellow is close to the page in lightness: an edge shows it without hue.
        expect(await page.locator('.mt-highlight').first().evaluate((e) => getComputedStyle(e).boxShadow), at)
          .toBe(theme === 'light' ? 'rgb(154, 116, 32) 0px 0px 0px 1px inset' : 'rgba(0, 0, 0, 0) 0px 0px 0px 1px inset');
        expect(r.link, at).toBe('rgb(46, 52, 64)');
        // Code in a highlight keeps the dark text on a darker yellow; the link's underline is a saturated blue.
        expect(await page.locator('.mt-highlight .mt-code').evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]), at)
          .toEqual(['rgb(46, 52, 64)', 'rgba(46, 52, 64, 0.1)']);
        expect(await page.locator('.mt-highlight .mt-link').evaluate((e) => getComputedStyle(e).textDecorationColor), at).toBe('rgb(11, 87, 208)');
      }
    }
  }
});

// #11: bare addresses are links in Markdown tabs only; www. opens as https://, an e-mail address as mailto:.
test('bare addresses are links in Markdown tabs (Cmd/Ctrl+click opens them), and not in plain-text tabs', async ({ page, appURL }) => {
  await openFresh(page, appURL); // a plain-text tab
  await page.evaluate(() => { window.__opened = []; HTMLAnchorElement.prototype.click = function () { window.__opened.push(this.href); }; });
  const doc = 'See https://example.com/a?b=1. Or www.example.org, or write to name@example.com; xmpp:x@y.z stays text.';
  await setDoc(page, doc);
  await setCursor(page, 0);
  // Plain text: no link, no link colour, and Cmd/Ctrl+click only places the cursor.
  expect(await page.locator('.mt-link').count()).toBe(0);
  expect(await page.locator('.mt-link-url').count()).toBe(0);
  await page.locator('.cm-line').click({ modifiers: ['ControlOrMeta'], position: { x: 60, y: 5 } });
  expect(await page.evaluate(() => window.__opened)).toEqual([]);
  // Markdown: links, ending before the trailing punctuation; an e-mail address only once turned on in Help.
  await page.click('#btn-md');
  await setCursor(page, doc.length);
  await expect(page.locator('.mt-link')).toHaveText(['https://example.com/a?b=1', 'www.example.org']);
  await expect(page.locator('.mt-link').nth(1)).toHaveAttribute('title', /https:\/\/www\.example\.org/);
  const name = await activeName(page);
  const toggle = (which) => page.locator(`#help-view [data-toggle="${which}"]`);
  await openHelp(page);
  await expect(toggle('links')).toHaveAttribute('aria-checked', 'true');
  await expect(toggle('mail')).toHaveAttribute('aria-checked', 'false');
  // A switch showing both words: clicking a word sets that value; Space flips it.
  await expect(toggle('mail')).toHaveText('OffOn');
  await toggle('mail').locator('[data-value="off"]').click();
  await expect(toggle('mail')).toHaveAttribute('aria-checked', 'false');
  await toggle('mail').focus();
  await page.keyboard.press('Space');
  await expect(toggle('mail')).toHaveAttribute('aria-checked', 'true');
  await expect(toggle('mail').locator('.active')).toHaveText('On');
  await clickTab(page, name);
  await expect(page.locator('.mt-link')).toHaveText(['https://example.com/a?b=1', 'www.example.org', 'name@example.com']);
  for (const i of [0, 1, 2]) await page.locator('.mt-link').nth(i).click({ modifiers: ['ControlOrMeta'], position: { x: 3, y: 5 } });
  expect(await page.evaluate(() => window.__opened)).toEqual(['https://example.com/a?b=1', 'https://www.example.org/', 'mailto:name@example.com']);
  expect(await docText(page)).toBe(doc); // the text itself is never rewritten
  // Links off: they still look like links, written or bare, but none opens or offers to; the E-mail button
  // waits for Links; both survive a reload.
  await setDoc(page, doc + '\n\n[written](https://example.com/w)');
  await openHelp(page);
  await toggle('links').locator('[data-value="off"]').click();
  await expect(toggle('mail')).toBeDisabled();
  await clickTab(page, name);
  await setCursor(page, 0);
  await expect(page.locator('.mt-link')).toHaveText(['https://example.com/a?b=1', 'www.example.org', 'name@example.com', 'written']);
  for (const i of [0, 3]) await expect(page.locator('.mt-link').nth(i)).not.toHaveAttribute('title', /./);
  await page.locator('.cm-line').last().click({ modifiers: ['ControlOrMeta'], position: { x: 3, y: 5 } });
  expect((await page.evaluate(() => window.__opened)).length).toBe(3);
  await page.reload();
  await openHelp(page);
  await expect(toggle('links')).toHaveAttribute('aria-checked', 'false');
  await expect(toggle('mail')).toHaveAttribute('aria-checked', 'true');
});

// A link around a highlight: the link draws the underline, in the accent colour, which the yellow hid.
test('a link around a highlight is underlined in the blue that reads on the yellow, in both themes', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await page.click('#btn-md');
  await setDoc(page, 'A [some ==marked== link](https://example.com) here.\n\nx');
  await setCursor(page, 50);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((th) => { document.documentElement.dataset.theme = th; }, theme);
    expect(await page.locator('.mt-link .mt-highlight').evaluate((e) => [getComputedStyle(e).textDecorationLine, getComputedStyle(e).textDecorationColor]), theme)
      .toEqual(['underline', 'rgb(11, 87, 208)']);
  }
});
