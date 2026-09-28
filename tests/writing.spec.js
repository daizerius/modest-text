// Writing helpers: task check boxes, pasting a URL over a selection, French no-break spaces, pressed format buttons.
import { test, expect, openFresh, openApp, setDoc, docText, setCursor, selectRange, cursorPos, writeClipboard, setLang, saveNow, openHelp, clickTab } from './helpers.js';

const NB = String.fromCharCode(0xa0), NNB = String.fromCharCode(0x202f);
const pressed = (page) => page.evaluate(() => [...document.querySelectorAll('.fmt-btn[aria-pressed="true"]')].map((b) => b.dataset.fmt));

test('task items show check boxes in Markdown tabs; a click toggles the mark in the source, keeps the cursor, and is undoable', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await page.click('#btn-md');
  const text = '- [ ] milk\n- [x] bread\n1. [ ] numbered\n  - [X] nested\n\nend';
  await setDoc(page, text);
  await setCursor(page, text.length); // on "end": the task lines are rendered
  const boxes = page.locator('.mt-task');
  await expect(boxes).toHaveCount(4);
  expect(await boxes.evaluateAll((b) => b.map((x) => x.checked))).toEqual([false, true, false, true]);
  // The box stands for the list marker and the "[ ]"; the space after it stays text, drawn as the gap
  // before the task's text (so the caret after it is placed as in text): the line reads " milk".
  expect(await page.locator('.cm-line').first().textContent()).toBe(' milk');
  await expect(boxes.first()).toHaveAttribute('title', 'Task: click to check or uncheck');
  await boxes.nth(0).click();
  expect(await docText(page)).toBe(text.replace('- [ ] milk', '- [x] milk'));
  await expect(boxes.nth(0)).toBeChecked();
  expect(await cursorPos(page)).toBe(text.length);
  await boxes.nth(3).click();
  expect(await docText(page)).toBe(text.replace('- [ ] milk', '- [x] milk').replace('[X] nested', '[ ] nested'));
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await docText(page)).toBe(text);
  // On the cursor line the source is shown instead.
  await setCursor(page, 3);
  await expect(boxes).toHaveCount(3);
  // Plain-text tabs show the source only.
  await page.click('#btn-md');
  await expect(page.locator('.mt-task')).toHaveCount(0);
});

test('task boxes are disabled in a read-only window', async ({ page, context, appURL }) => {
  await openFresh(page, appURL);
  await page.click('#btn-md');
  await setDoc(page, '- [ ] shared\n\nend');
  await saveNow(page);
  const b = await context.newPage();
  await openApp(b, appURL, { role: 'readonly' });
  const box = b.locator('.mt-task');
  await expect(box).toHaveCount(1);
  await expect(box).toBeDisabled();
  await box.click({ force: true });
  expect(await docText(b)).toBe('- [ ] shared\n\nend');
});

test('pasting a web address over selected text makes a Markdown link, in both modes; otherwise paste is unchanged', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await page.click('#btn-md');
  const url = 'https://example.com/a?b=1';
  await setDoc(page, 'see site now');
  await writeClipboard(page, { plain: `  ${url}\n` });
  await selectRange(page, 4, 8);
  await page.keyboard.press('ControlOrMeta+v');
  expect(await docText(page)).toBe(`see [site](${url}) now`);
  expect(await cursorPos(page)).toBe(`see [site](${url})`.length);
  await page.keyboard.press('ControlOrMeta+z'); // one step back to the selected text
  expect(await docText(page)).toBe('see site now');
  // No selection: the address is pasted as text.
  await setCursor(page, 12);
  await page.keyboard.press('ControlOrMeta+v');
  expect(await docText(page)).toBe(`see site now  ${url}\n`); // as copied
  // Inside inline code, or over several lines, or when the selection is itself an address: plain paste.
  await writeClipboard(page, { plain: url });
  for (const [doc, from, to, want] of [
    ['a `code` b', 3, 7, `a \`${url}\` b`],
    ['one\ntwo', 2, 5, `on${url}wo`],
    ['go http://old.example here', 3, 21, `go ${url} here`],
  ]) {
    await setDoc(page, doc);
    await selectRange(page, from, to);
    await page.keyboard.press('ControlOrMeta+v');
    expect(await docText(page), doc).toBe(want);
  }
  // Text that is not an address replaces the selection as usual.
  await writeClipboard(page, { plain: 'plain words' });
  await setDoc(page, 'see site');
  await selectRange(page, 4, 8);
  await page.keyboard.press('ControlOrMeta+v');
  expect(await docText(page)).toBe('see plain words');
  // Plain-text tabs: the same.
  await writeClipboard(page, { plain: url });
  await page.click('#btn-md');
  await setDoc(page, 'see site');
  await selectRange(page, 4, 8);
  await page.keyboard.press('ControlOrMeta+v');
  expect(await docText(page)).toBe(`see [site](${url})`);
});

test('the formats under the cursor show as pressed buttons, in Markdown and plain-text tabs', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  const doc = '# Title\n\nsome **bold** and *it* ~~st~~ ==hl== `code`\n\n- item\n1. one\n> quote **b**\n\n## Two';
  const at = (s, d = 1) => doc.indexOf(s) + d;
  const checks = [
    [at('Title'), ['h1']], [at('bold'), ['bold']], [at('*it*', 2), ['italic']], [at('st~'), ['strike']], [at('hl='), ['highlight']],
    [at('code`'), ['code']], [at('item'), ['ul']], [at('one'), ['ol']], [at('quote'), ['quote']], [at('b**', 1), ['bold', 'quote']],
    [at('Two'), ['h2']], [at('some'), []], [doc.indexOf('Title') + 5, ['h1']], [0, ['h1']], // line start and end
  ];
  for (const mode of ['md', 'plain']) {
    if (mode === 'md') await page.click('#btn-md');
    await setDoc(page, doc);
    for (const [pos, want] of checks) {
      await setCursor(page, pos);
      expect((await pressed(page)).sort(), `${mode} @${pos} "${doc.slice(pos - 3, pos + 3)}"`).toEqual([...want].sort());
    }
    // A selection counts where it starts.
    await selectRange(page, at('bold', 0), at('bold', 4));
    expect(await pressed(page)).toEqual(['bold']);
    if (mode === 'md') await page.click('#btn-md');
  }
  // Clicking a pressed button removes that format, and the button is released.
  await setCursor(page, at('bold'));
  await page.click('.fmt-btn[data-fmt="bold"]');
  expect(await docText(page)).toContain('some bold and');
  expect(await pressed(page)).toEqual([]);
  // Also with part of the word selected, for each inline format, in both modes; bold inside ***x*** keeps the italic.
  for (const mode of ['plain', 'md']) {
    for (const [src, fmt, from, to, want] of [
      ['a **bold** b', 'bold', 5, 7, 'a bold b'], ['a *it* b', 'italic', 3, 4, 'a it b'], ['a ~~st~~ b', 'strike', 4, 5, 'a st b'],
      ['a ==hl== b', 'highlight', 5, 5, 'a hl b'], ['a `co` b', 'code', 3, 5, 'a co b'], ['a ***x*** b', 'bold', 5, 5, 'a *x* b'],
    ]) {
      await setDoc(page, src);
      await selectRange(page, from, to);
      await page.click(`.fmt-btn[data-fmt="${fmt}"]`);
      expect(await docText(page), `${mode} ${src}`).toBe(want);
    }
    await page.click('#btn-md');
  }
  // Only toggles carry a pressed state (code block too: it removes the block around the cursor); link and rule insert.
  expect(await page.evaluate(() => ['link', 'hr', 'codeblock'].map((f) => document.querySelector(`.fmt-btn[data-fmt="${f}"]`).hasAttribute('aria-pressed')))).toEqual([false, false, true]);
  // Pressed look: a face and an accent bar under the button.
  await setDoc(page, doc);
  await setCursor(page, at('Title'));
  const look = await page.evaluate(() => {
    const b = document.querySelector('.fmt-btn[data-fmt="h1"]'), o = document.querySelector('.fmt-btn[data-fmt="h2"]');
    return [getComputedStyle(b).backgroundColor !== getComputedStyle(o).backgroundColor, getComputedStyle(b).boxShadow];
  });
  expect(look[0]).toBe(true);
  expect(look[1]).toMatch(/0px -3px 0px 0px inset/);
  // Help tab: nothing pressed.
  await openHelp(page);
  expect(await pressed(page)).toEqual([]);
  await clickTab(page, 'Title'); // the tab named itself from the document's first heading
});

test('typing "- []" or "- [  ]" gives the standard task mark "- [ ]"; Enter continues the task list; one undo step reverts the fix', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  for (const mode of ['plain', 'md']) {
    if (mode === 'md') await page.click('#btn-md');
    await setDoc(page, '');
    await setCursor(page, 0);
    await page.keyboard.type('- [] milk');
    expect(await docText(page)).toBe('- [ ] milk');
    await page.keyboard.press('Enter');
    await page.keyboard.type('bread');
    expect(await docText(page)).toBe('- [ ] milk\n- [ ] bread');
    await setDoc(page, '');
    await setCursor(page, 0);
    await page.keyboard.type('> 1. [  ]');
    expect(await docText(page)).toBe('> 1. [ ]');
    await page.keyboard.press('ControlOrMeta+z');
    expect(await docText(page)).toBe('> 1. [  ]');
    // Not a list item, or already standard: unchanged.
    await setDoc(page, '');
    await setCursor(page, 0);
    await page.keyboard.type('see [] and - [x] ok');
    expect(await docText(page)).toBe('see [] and - [x] ok');
    if (mode === 'md') await page.click('#btn-md');
  }
  // In a Markdown tab, the fixed item shows its box once the cursor leaves the line.
  await page.click('#btn-md');
  await setDoc(page, '');
  await setCursor(page, 0);
  await page.keyboard.type('- [] task');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // ends the list
  await page.keyboard.type('end');
  await expect(page.locator('.mt-task')).toHaveCount(1);
});

test('nested list levels are indented further in Markdown tabs', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await page.click('#btn-md');
  await setDoc(page, '- one\n  - two\n    - three\n      - four\n- back\n\n> - q\n>   - r\n\nend');
  await setCursor(page, (await docText(page)).length);
  const pads = await page.evaluate(() => [...document.querySelectorAll('.cm-line')].map((l) => parseFloat(getComputedStyle(l).paddingLeft)));
  const [one, two, three, four, back, , q, r] = pads;
  expect(back).toBe(one);
  expect(two - one).toBeGreaterThanOrEqual(16); // at least 1em more per level, on top of the source indentation
  expect(three - two).toBeGreaterThanOrEqual(16);
  expect(four - three).toBeGreaterThanOrEqual(16);
  expect(r - q).toBeGreaterThanOrEqual(16); // inside a quote too
  expect(q).toBeGreaterThan(one); // a quoted list keeps the quote's own indent
  // Plain-text tabs show the source as is.
  await page.click('#btn-md');
  const plain = await page.evaluate(() => [...document.querySelectorAll('.cm-line')].slice(0, 2).map((l) => parseFloat(getComputedStyle(l).paddingLeft)));
  expect(plain[0]).toBe(plain[1]);
});

test('with text selected, typing an opening quote or bracket encloses the selection (both modes); without a selection it types normally', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  for (const mode of ['plain', 'md']) {
    if (mode === 'md') await page.click('#btn-md');
    for (const [open, close] of [['"', '"'], ["'", "'"], ['`', '`'], ['(', ')'], ['[', ']'], ['{', '}'], ['<', '>'], ['«', '»'], ['“', '”'], ['‘', '’']]) {
      await setDoc(page, 'say word now');
      await selectRange(page, 4, 8);
      await page.keyboard.type(open);
      expect(await docText(page), `${mode} ${open}`).toBe(`say ${open}word${close} now`);
      expect(await page.evaluate(() => { const r = document.getElementById('editor').mtView.state.selection.main; return [r.from, r.to]; })).toEqual([5, 9]); // still selected
    }
    // Nesting, and one undo step each.
    await setDoc(page, 'word');
    await selectRange(page, 0, 4);
    await page.keyboard.type('(');
    await page.keyboard.type('"');
    expect(await docText(page)).toBe('("word")');
    await page.keyboard.press('ControlOrMeta+z');
    expect(await docText(page)).toBe('(word)');
    // A closing character or a letter still replaces the selection; no selection: plain typing.
    await setDoc(page, 'word');
    await selectRange(page, 0, 4);
    await page.keyboard.type(')');
    expect(await docText(page)).toBe(')');
    await setDoc(page, 'ab');
    await setCursor(page, 1);
    await page.keyboard.type('(');
    expect(await docText(page)).toBe('a(b');
    if (mode === 'md') await page.click('#btn-md');
  }
});

test('strikethrough in Markdown tabs: fainter text (still AA), the line in the full text colour', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await page.click('#btn-md');
  await setDoc(page, 'a ~~gone~~ b\n\nx');
  await page.evaluate(() => document.getElementById('editor').mtView.contentDOM.blur());
  for (const theme of ['light', 'dark']) {
    if ((await page.getAttribute('html', 'data-theme')) !== theme) await page.click('#btn-theme');
    const r = await page.evaluate(() => {
      const lum = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const el = document.querySelector('.mt-strike'), line = el.closest('.cm-line');
      const c = getComputedStyle(el), bg = getComputedStyle(document.querySelector('.cm-editor')).backgroundColor;
      const [a, b] = [lum(c.color), lum(bg)].sort((x, y) => y - x);
      return { color: c.color, text: getComputedStyle(line).color, deco: c.textDecorationColor, line: c.textDecorationLine, ratio: (a + 0.05) / (b + 0.05) };
    });
    expect(r.line).toBe('line-through');
    expect(r.color, theme).not.toBe(r.text); // fainter
    expect(r.deco, theme).toBe(r.text); // the line keeps the text colour
    expect(r.ratio, theme).toBeGreaterThanOrEqual(4.5);
  }
});

test('Markdown lists: every line of an item starts where its text starts (wrapped, continued, tasks, numbers, quotes); nested items under their parent’s text; the cursor line too', async ({ page, appURL }) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await openFresh(page, appURL);
  await page.click('#btn-md');
  const long = 'long enough to wrap onto a second line in this narrow window, and then some more words';
  const doc = `- First item ${long}\n- Second item\n  continued on its own line\n  - Nested item ${long}\n- [ ] Task item ${long}\n\n1. Numbered item ${long}\n2. Two\n10. Ten\n\n> - Quoted item ${long}\n>   continued in the quote\n\nEnd`;
  await setDoc(page, doc);
  await page.evaluate(() => document.getElementById('editor').mtView.contentDOM.blur());
  // x of a word's first letter, and x where the wrapped part of its line starts.
  const geo = () => page.evaluate((d) => {
    const v = document.getElementById('editor').mtView;
    const x = (word) => v.coordsAtPos(d.indexOf(word)).left;
    const wrapX = (word) => {
      const p = d.indexOf(word), end = v.state.doc.lineAt(p).to, top = v.coordsAtPos(p).top;
      for (let q = p; q < end; q++) { const c = v.coordsAtPos(q); if (c && c.top > top + 5) return c.left; }
      return null;
    };
    return {
      first: x('First'), firstWrap: wrapX('First'), second: x('Second'), continued: x('continued on'), nested: x('Nested'), nestedWrap: wrapX('Nested'),
      task: x('Task'), taskWrap: wrapX('Task'), numbered: x('Numbered'), numberedWrap: wrapX('Numbered'), two: x('Two'), ten: x('Ten'),
      quoted: x('Quoted'), quotedWrap: wrapX('Quoted'), quotedCont: x('continued in'), end: x('End'),
    };
  }, doc);
  const g = await geo();
  const near = (a, b, what) => expect(Math.abs(a - b), `${what}: ${a} vs ${b}`).toBeLessThanOrEqual(1.5);
  near(g.firstWrap, g.first, 'wrapped line of an item');
  near(g.continued, g.second, 'continuation line of an item');
  expect(g.nested - g.second, 'nested item: further in').toBeGreaterThanOrEqual(16);
  near(g.nestedWrap, g.nested, 'wrapped line of a nested item');
  near(g.task, g.first, 'task text like bullet text');
  near(g.taskWrap, g.task, 'wrapped line of a task');
  near(g.numberedWrap, g.numbered, 'wrapped line of a numbered item');
  near(g.two, g.numbered, 'numbers of one list: text aligned');
  near(g.ten, g.numbered, 'wider number: text still aligned');
  near(g.quotedWrap, g.quoted, 'wrapped line in a quote');
  near(g.quotedCont, g.quoted, 'continuation line in a quote');
  expect(g.first).toBeGreaterThan(g.end + 10); // the item's text is indented from the paragraph
  // The cursor's line shows the source ("- ", "  - ") in a box of the same width: its text does not move.
  for (const [word, key] of [['First', 'first'], ['Nested', 'nested'], ['Task', 'task'], ['Ten', 'ten'], ['continued on', 'continued']]) {
    await setCursor(page, doc.indexOf(word) + 2);
    const a = await geo();
    near(a[key], g[key], `cursor line: ${word}`);
    if (a[key + 'Wrap'] !== undefined) near(a[key + 'Wrap'], g[key], `cursor line, wrapped: ${word}`);
  }
  // The source is untouched.
  expect(await docText(page)).toBe(doc);
});

test('on a task with no text yet, the caret stands where the text will start, also after switching modes', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await page.click('#btn-md');
  await page.locator('.cm-content').click();
  await page.keyboard.type('- [ ] milk');
  await page.keyboard.press('Enter'); // the empty task, as a user gets it
  // The browser's own caret: the rectangle of the collapsed DOM selection (not CodeMirror's idea of it).
  const caret = () => page.evaluate(() => { const r = getSelection().getRangeAt(0); const b = r.getClientRects()[0] || r.getBoundingClientRect(); return { x: b.left, top: b.top, bottom: b.bottom }; });
  const textStart = await page.evaluate(() => { const v = document.getElementById('editor').mtView; return v.coordsAtPos(6).left; }); // before the m of milk
  const boxRight = await page.locator('.mt-task').last().evaluate((e) => e.getBoundingClientRect().right);
  const lineBox = await page.locator('.cm-line').last().evaluate((e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; });
  const check = async (when) => {
    const c = await caret();
    expect(Math.abs(c.x - textStart), `${when}: where the text starts`).toBeLessThan(1.5);
    expect(c.x - boxRight, `${when}: a gap after the box`).toBeGreaterThan(3);
    expect(c.top, `${when}: within its line`).toBeGreaterThanOrEqual(lineBox.top - 1);
    expect(c.bottom, `${when}: within its line`).toBeLessThanOrEqual(lineBox.bottom + 1);
  };
  await check('after Enter');
  await page.keyboard.press('ControlOrMeta+Shift+KeyM');
  await page.keyboard.press('ControlOrMeta+Shift+KeyM');
  await check('after switching to plain text and back');
  // The box and the gap after it are one step for the arrow keys.
  const head = () => page.evaluate(() => document.getElementById('editor').mtView.state.selection.main.head);
  const end = await head();
  await page.keyboard.press('ArrowLeft');
  expect(end - (await head())).toBe(4); // past "[ ] " at once
});
