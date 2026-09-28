// Done when #16 (active tab + AA contrast in both themes) plus visual-design rules that can be measured.
import { test, expect, openFresh, openApp, addTab, setDoc, setCursor, importFiles, setLang, toggleTheme, dblclickTab } from './helpers.js';

// WCAG contrast of every visible text element against its composited background.
function measure(page, selectors) {
  return page.evaluate((selectors) => {
    const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
    const lum = ({ r, g, b }) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
    const bgOf = (el) => {
      const layers = [];
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c.a > 0) { layers.push(c); if (c.a >= 1) break; }
      }
      let bg = { r: 255, g: 255, b: 255, a: 1 };
      for (const l of layers.reverse()) bg = over(l, bg);
      return bg;
    };
    const out = [];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || !el.textContent.trim() || el.closest('[hidden]')) continue;
        if (el.matches(':disabled') || el.closest('[aria-disabled="true"]') || el.closest('label')?.querySelector('input:disabled')) continue; // disabled controls are exempt
        const cs = getComputedStyle(el);
        let op = 1;
        for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
        const bg = bgOf(el);
        const fg = over({ ...parse(cs.color), a: parse(cs.color).a * op }, bg);
        const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
        out.push({ sel, text: el.textContent.trim().slice(0, 30), ratio: (l1 + 0.05) / (l2 + 0.05) });
      }
    }
    return out;
  }, selectors);
}

const TEXT_SELECTORS = [
  '#app-title', '.btn', '.pair-half', '.fmt-btn', '.fmt-hl', '.mt-highlight', '.tab .tab-name', '.tab-close', '.new-tab', '#st-counts', '#st-status', '#st-time',
  '#st-storage', '#st-sel', '#banner-full .banner-text', '#banner-ro .banner-text', '.banner-btn', '.cm-line', '.mt-link', '.mt-code', '.mt-img',
  '.mt-listmark', '.toast-text', '.font-opt', '.font-group', '#rename-title', '#rename-preview', '#rename-error', '.drop-overlay span',
];

test('16. in both themes the active tab is obvious and all text passes WCAG AA (4.5:1)', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await addTab(page, 'Second', 'plain');
  await addTab(page, 'Doc', '# Heading\n\ntext **bold** `code` ==marked== [link](https://example.com)\n\n1. item\n\n![img](x.png)\n\n> quote', { md: true });
  await page.locator('.tab', { hasText: 'Untitled 1' }).click();
  await page.locator('.tab', { hasText: 'Doc' }).click();
  await page.evaluate(() => { const v = document.getElementById('editor').mtView; v.dispatch({ selection: { anchor: 0, head: 9 } }); }); // selection counts shown
  await page.locator('#btn-export').focus();
  for (const theme of ['light', 'dark']) {
    await importFiles(page, [{ name: 'toast.zip', text: 'x' }]); // shows a message toast
    if ((await page.getAttribute('html', 'data-theme')) !== theme) await toggleTheme(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.evaluate(() => {
      for (const id of ['banner-full', 'banner-ro', 'st-storage', 'drop-overlay']) document.getElementById(id).hidden = false;
      document.getElementById('st-storage').textContent = 'Storage 4.3 / ~5 MB';
    });
    const results = await measure(page, TEXT_SELECTORS);
    await page.click('#font-btn');
    results.push(...await measure(page, ['.font-opt', '.font-group']));
    await page.keyboard.press('Escape');
    await dblclickTab(page, 'Doc'); // the active Markdown tab stays active
    await page.fill('#rename-input', '');
    results.push(...await measure(page, ['#rename-title', '#rename-error', '.modal .btn', '#rename-input']));
    await page.fill('#rename-input', 'Doc');
    results.push(...await measure(page, ['#rename-preview']));
    await page.keyboard.press('Escape');
    await page.locator('#btn-export').focus(); // editor blurred: everything rendered
    const failing = results.filter((r) => r.ratio < 4.5).map((r) => `${theme} ${r.sel} "${r.text}" ${r.ratio.toFixed(2)}`);
    expect(failing).toEqual([]);
    expect(results.length).toBeGreaterThan(30);
    for (const sel of ['#banner-full .banner-text', '#banner-ro .banner-text', '#st-storage', '#st-sel', '.toast-text', '.mt-link', '.mt-highlight', '.pair-half']) {
      expect(results.some((r) => r.sel === sel), `${sel} measured`).toBe(true);
    }
    await page.evaluate(() => { for (const id of ['banner-full', 'banner-ro', 'st-storage', 'drop-overlay']) document.getElementById(id).hidden = true; });

    // Emoji buttons have no face of their own (the emoji is the button); EN|FR (text) keeps a darker face
    // than the top bar in the light theme; the 📄|📝 accent bar stands out (≥ 3:1) against the top bar.
    const faces = await page.evaluate(() => {
      const lum = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      document.activeElement?.blur(); // faces at rest (a keyboard-focused button is tinted on purpose)
      const bar = getComputedStyle(document.getElementById('topbar')).backgroundColor;
      const accent = getComputedStyle(document.querySelector('#btn-md .pair-half.active'), '::after').backgroundColor;
      const [a, b] = [lum(accent), lum(bar)].sort((x, y) => y - x);
      return {
        bar,
        emoji: ['btn-undo-close', 'btn-export', 'btn-export-all', 'btn-import', 'btn-theme', 'btn-help', 'btn-md', 'btn-lang'].map((id) => {
          const c = getComputedStyle(document.getElementById(id));
          return [c.backgroundColor, c.borderTopWidth];
        }),
        lang: [...document.querySelectorAll('#btn-lang .pair-half')].map((e) => getComputedStyle(e).backgroundColor),
        accentRatio: (a + 0.05) / (b + 0.05),
      };
    });
    for (const [bg, border] of faces.emoji) expect([bg, border]).toEqual(['rgba(0, 0, 0, 0)', '0px']);
    for (const bg of faces.lang) expect(bg).toBe('rgba(0, 0, 0, 0)'); // EN|FR has no face either
    expect(faces.accentRatio).toBeGreaterThanOrEqual(3);

    // Active tab: background + accent bar + weight (not colour alone).
    const style = (loc) => loc.evaluate((e) => { const c = getComputedStyle(e); return { bg: c.backgroundColor, shadow: c.boxShadow, weight: Number(c.fontWeight) }; });
    const active = await style(page.locator('.tab.active'));
    const inactive = await style(page.locator('.tab:not(.active)').first());
    expect(active.bg).not.toBe(inactive.bg);
    expect(active.shadow).toMatch(/inset/);
    expect(inactive.shadow).toBe('none');
    expect(active.weight).toBeGreaterThanOrEqual(600);
    expect(inactive.weight).toBeLessThan(600);

    // The save dot is a saturated colour with at least 3:1 contrast against the status bar (non-text).
    const dots = await page.evaluate(() => {
      const lum = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const sat = (c) => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
      const dot = document.getElementById('st-dot');
      const bg = getComputedStyle(document.getElementById('statusbar')).backgroundColor;
      const keep = dot.className;
      const out = {};
      for (const k of ['red', 'green']) {
        dot.className = `dot dot-${k}`;
        const c = getComputedStyle(dot).backgroundColor;
        const [a, b] = [lum(c), lum(bg)].sort((x, y) => y - x);
        out[k] = { ratio: (a + 0.05) / (b + 0.05), saturation: sat(c) };
      }
      dot.className = keep;
      return out;
    });
    for (const k of ['red', 'green']) {
      expect(dots[k].ratio, `${theme} ${k} dot contrast`).toBeGreaterThanOrEqual(3);
      expect(dots[k].saturation, `${theme} ${k} dot saturation`).toBeGreaterThan(0.6);
    }
  }
});

test('layout by scope: app & workspace in the top bar, tab tools in the tab strip, current-tab bar under the tabs; line icons in the text colour', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  // Top bar, right: Import, Export, Export All | theme, EN|FR | Help — groups split by hairlines, 4px inside groups.
  const right = await page.evaluate(() => [...document.querySelectorAll('.bar-right > *:not(input)')].map((e) => e.id || e.className));
  expect(right).toEqual(['btn-import', 'btn-export', 'btn-export-all', 'bar-sep', 'btn-theme', 'btn-lang', 'bar-sep', 'btn-help']);
  const gaps = await page.evaluate(() => {
    const r = [...document.querySelectorAll('.bar-right > *:not(input)')].map((b) => b.getBoundingClientRect());
    return r.slice(1).map((x, i) => Math.round(x.left - r[i].right));
  });
  expect(gaps).toEqual([4, 4, 8, 8, 4, 8, 8]); // 4px within a group; separator with 4px margins (+ 4px gap) each side
  const sepStyle = await page.locator('.bar-sep').first().evaluate((e) => [e.getBoundingClientRect().width, getComputedStyle(e).backgroundColor]);
  expect(sepStyle[0]).toBe(1);
  expect(sepStyle[1]).toBe(await page.locator('.fmt-group').nth(1).evaluate((e) => getComputedStyle(e, '::before').backgroundColor)); // same hairline in both bars
  expect(await page.locator('.fmt-group').nth(1).evaluate((e) => parseFloat(getComputedStyle(e, '::before').width))).toBe(1);
  // Tab strip: + stays right after the last tab; the reopen-closed-tab button (clock arrow) follows it.
  expect(await page.evaluate(() => [document.getElementById('tabs').nextElementSibling.id, document.getElementById('btn-new').nextElementSibling.id])).toEqual(['btn-new', 'btn-undo-close']);
  // Bar under the tabs: the plain / Markdown toggle comes first, then the formatting groups.
  expect(await page.evaluate(() => document.querySelector('#formatbar button').id)).toBe('btn-md');
  expect(await page.evaluate(() => document.getElementById('formatbar').compareDocumentPosition(document.getElementById('tabbar')) & Node.DOCUMENT_POSITION_PRECEDING)).toBeTruthy();
  // The amber storage item sits with the save state (right side of the status bar).
  expect(await page.evaluate(() => document.getElementById('st-storage').parentElement.className)).toBe('st-right');
  expect(await page.locator('#topbar canvas, #topbar img').count()).toBe(0); // no emoji canvases or images
  for (const theme of ['light', 'dark']) {
    if ((await page.getAttribute('html', 'data-theme')) !== theme) await toggleTheme(page);
    await page.mouse.move(5, 400); // no hover tint while measuring
    const icons = await page.evaluate(() => {
      const lum = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const text = getComputedStyle(document.body).color;
      return [...document.querySelectorAll('#topbar svg.icon, #tabbar svg.icon, #btn-md svg.icon')].filter((svg) => svg.getBoundingClientRect().width > 0).map((svg) => {
        const holder = svg.closest('.pair-half') || svg.closest('button');
        const bar = getComputedStyle(svg.closest('#topbar, #tabbar, #formatbar')).backgroundColor;
        const h = holder.getBoundingClientRect(), r = svg.getBoundingClientRect();
        const stroke = getComputedStyle(svg).stroke;
        const [a, b] = [lum(stroke), lum(bar)].sort((x, y) => y - x);
        return { name: svg.dataset.icon, size: [r.width, r.height], dx: (r.left + r.right) / 2 - (h.left + h.right) / 2,
          inside: r.left >= h.left && r.right <= h.right && r.top >= h.top && r.bottom <= h.bottom, strokeIsText: stroke === text,
          fill: getComputedStyle(svg).fill, stroke, ratio: (a + 0.05) / (b + 0.05) };
      });
    });
    expect(icons.map((i) => i.name)).toEqual(['wrap', 'readwidth', 'import', 'export', 'export-all', theme === 'dark' ? 'light' : 'dark', 'help', 'reopen', 'plain', 'markdown']);
    for (const i of icons) {
      expect(i.size, i.name).toEqual([20, 20]);
      expect(Math.abs(i.dx), i.name).toBeLessThanOrEqual(1);
      expect(i.inside, i.name).toBe(true);
      expect(i.strokeIsText, `${theme} ${i.name} follows the text colour`).toBe(true);
      expect(i.fill, i.name).toBe(i.name === 'dark' || i.name === 'light' ? i.stroke : 'none'); // solid moon and sun; every other icon is a line icon
      expect(i.ratio, `${theme} ${i.name} contrast`).toBeGreaterThanOrEqual(3);
    }
  }
  // The light-theme icon is a sun: a solid disc and eight short rays; its apparent size matches the moon's.
  const sun = await page.evaluate(() => {
    const svg = document.querySelector('#btn-theme svg[data-icon="light"]');
    const rays = svg.querySelector('path').getAttribute('d').match(/M[^M]+/g);
    const len = (r) => { const n = r.match(/-?\d*\.?\d+/g).map(Number); return Math.hypot(n[2], n[3] || 0); };
    return { circles: svg.querySelectorAll('circle').length, r: Number(svg.querySelector('circle').getAttribute('r')), rays: rays.length, maxRay: Math.max(...rays.map(len)),
      icons: ['light', 'dark'].map((n) => document.querySelector(`svg[data-icon="${n}"]`).outerHTML) };
  });
  expect([sun.circles, sun.rays]).toEqual([1, 8]);
  expect(sun.r).toBeGreaterThanOrEqual(4.5); // a large disc
  expect(sun.maxRay).toBeLessThanOrEqual(0.8); // short rays (plus their round caps)
  // Apparent size: the inked area of the sun and of the moon, drawn at 20px, within 20% of each other.
  const blank = await page.context().newPage();
  const ink = await blank.evaluate(async (icons) => Promise.all(icons.map(async (h) => {
    const svg = h.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" fill="#000" stroke="#000" stroke-width="2" stroke-linecap="round" ').replace(/ class="icon"/, '');
    const img = new Image();
    img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
    await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 200;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, 200, 200).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i] / 255;
    return n;
  })), sun.icons);
  await blank.close();
  // The eye weighs the sun's compact disc against the moon's larger outline: the sun has somewhat more ink,
  // the moon's outline spans a little less than the sun's rays. Both stay within a band (checked by eye too).
  expect(ink[0] / ink[1]).toBeGreaterThan(0.9);
  expect(ink[0] / ink[1]).toBeLessThan(1.45);
  const extent = await page.evaluate(() => ['light', 'dark'].map((n) => {
    const svg = document.querySelector(`svg[data-icon="${n}"]`);
    const shown = svg.style.display; svg.style.display = 'block';
    const b = svg.getBBox(); svg.style.display = shown;
    return Math.max(b.width, b.height) + 2; // plus the stroke
  }));
  expect(extent[0] / extent[1]).toBeGreaterThan(1.05);
  expect(extent[0] / extent[1]).toBeLessThan(1.3);
  // Hover tints an icon with the accent colour.
  await page.hover('#btn-help');
  const hover = await page.evaluate(() => [getComputedStyle(document.querySelector('#btn-help svg')).stroke, getComputedStyle(document.querySelector('#btn-md .pair-half.active'), '::after').backgroundColor]);
  expect(hover[0]).toBe(hover[1]);
  // Plain / Markdown: the accent bar sits under the current mode only.
  const bars = () => page.evaluate(() => [...document.querySelectorAll('#btn-md .pair-half')].map((e) => getComputedStyle(e, '::after').content !== 'none'));
  expect(await bars()).toEqual([true, false]);
  await page.click('#btn-md');
  expect(await bars()).toEqual([false, true]);
  // EN|FR: styled like plain / Markdown — no face, letters in the text colour, accent bar under the current language.
  const lang = await page.evaluate(() => [...document.querySelectorAll('#btn-lang .pair-half')].map((e) => ({
    bg: getComputedStyle(e).backgroundColor, bar: getComputedStyle(e, '::after').content !== 'none', color: getComputedStyle(e).color })));
  expect(lang.map((l) => l.bg)).toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
  expect(await page.evaluate(() => [...document.querySelectorAll('#btn-lang .pair-half')].map((e) => e.textContent))).toEqual(['EN', 'FR']); // alphabetical
  expect(lang.map((l) => l.bar)).toEqual([true, false]); // English is active
  await setLang(page, 'fr');
  expect(await page.evaluate(() => [...document.querySelectorAll('#btn-lang .pair-half')].map((e) => getComputedStyle(e, '::after').content !== 'none'))).toEqual([false, true]);
  await setLang(page, 'en');
  // EN|FR: no "|" character, a faint 1px hairline instead.
  const sep = await page.locator('#btn-lang .pair-sep').evaluate((e) => [e.textContent, e.getBoundingClientRect().width, getComputedStyle(e).backgroundColor]);
  expect(sep[0]).toBe('');
  expect(sep[1]).toBe(1);
  expect(sep[2]).not.toBe('rgba(0, 0, 0, 0)');
});

test('flat, sharp design: radii ≤ 4px, no gradients, Nord palette; system UI font for the chrome', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  for (const theme of ['light', 'dark']) {
    if ((await page.getAttribute('html', 'data-theme')) !== theme) await toggleTheme(page);
    const bad = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const c = getComputedStyle(el);
        const radius = Math.max(...['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].map((p) => parseFloat(c[p]) || 0));
        if (radius > 4 && !el.classList.contains('dot')) out.push(`${el.className} radius ${radius}`);
        if (c.backgroundImage.includes('gradient')) out.push(`${el.className} gradient`);
      }
      return out;
    });
    expect(bad).toEqual([]);
    const bodyBg = await page.evaluate(() => getComputedStyle(document.querySelector('.cm-editor')).backgroundColor);
    expect(bodyBg).toBe(theme === 'dark' ? 'rgb(46, 52, 64)' : 'rgb(236, 239, 244)');
  }
  expect(await page.locator('#btn-export').evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/system-ui/);
});

test('default theme follows the OS until the user chooses; the button shows the mode it switches to', async ({ browser, appURL }) => {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ colorScheme: scheme });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await openApp(p, appURL);
    // Chromium applies the emulated scheme; Firefox over WebDriver BiDi ignores the emulation and
    // reports the real macOS appearance. Either way the app must follow what the page reports.
    const os = (await p.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)) ? 'dark' : 'light';
    const other = os === 'dark' ? 'light' : 'dark';
    await expect(p.locator('html')).toHaveAttribute('data-theme', os);
    await expect(p.locator('#btn-theme svg.icon:visible')).toHaveAttribute('data-icon', os === 'dark' ? 'light' : 'dark');
    await expect(p.locator('#btn-theme')).toHaveAttribute('title', os === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme');
    await toggleTheme(p);
    await expect(p.locator('html')).toHaveAttribute('data-theme', other);
    await expect(p.locator('#btn-theme svg.icon:visible')).toHaveAttribute('data-icon', other === 'dark' ? 'light' : 'dark');
    await p.reload();
    await expect(p.locator('html[data-ready="1"]')).toHaveCount(1);
    await expect(p.locator('html')).toHaveAttribute('data-theme', other); // the explicit choice wins over the OS
    expect(errors).toEqual([]);
    await ctx.close();
  }
});

// Narrow windows: the workspace buttons stay beside the title and font / size / wrap / reading width move,
// together, to a row below; in the bar under the tabs, groups never break, the break comes before the headings,
// and no hairline is left at the start of a row.
for (const width of [700, 560, 420]) {
  test(`narrow window (${width}px): top bar keeps the workspace buttons on the first row; formatting breaks at H1`, async ({ page, appURL }) => {
    await page.setViewportSize({ width, height: 600 });
    await openFresh(page, appURL);
    await page.click('#btn-md');
    for (const lang of ['en', 'fr']) {
      await setLang(page, lang);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); // refitted on the next frame
      const r = await page.evaluate(() => {
        const box = (e) => e.getBoundingClientRect();
        const title = box(document.getElementById('app-title')), right = box(document.querySelector('.bar-right')), set = box(document.getElementById('bar-settings'));
        const fb = document.getElementById('formatbar'), fbr = box(fb);
        const groups = [...fb.querySelectorAll('.fmt-group')].map((g) => ({ first: g.querySelector('button').dataset.fmt || g.querySelector('button').id, r: box(g),
          split: new Set([...g.querySelectorAll('button')].map((b) => Math.round(box(b).top))).size > 1 }));
        const rowStarts = groups.filter((g, i) => i === 0 || g.r.top > groups[i - 1].r.top + 4);
        const all = [...document.querySelectorAll('#topbar button, #topbar select, #topbar label, #formatbar button, #tabbar button')].filter((e) => box(e).width > 0);
        return {
          rightBesideTitle: Math.abs((right.top + right.bottom) / 2 - (title.top + title.bottom) / 2) < 6,
          settingsBelow: set.top >= right.bottom - 1,
          settingsFirstRow: Math.abs(set.top - right.top) < 6,
          overflowX: document.documentElement.scrollWidth > window.innerWidth,
          outside: all.filter((e) => box(e).left < 0 || box(e).right > window.innerWidth + 0.5).map((e) => e.id || e.className),
          split: groups.filter((g) => g.split).map((g) => g.first),
          rows: rowStarts.map((g) => g.first),
          // A group that starts a row has its hairline outside the bar (clipped); the others inside.
          strayLines: rowStarts.filter((g) => g.r.left - 9 >= fbr.left + 1).map((g) => g.first),
          missingLines: groups.filter((g) => !rowStarts.includes(g)).filter((g) => g.r.left - 9 < fbr.left + 1).map((g) => g.first),
        };
      });
      expect(r.rightBesideTitle, lang).toBe(true);
      expect(r.settingsBelow || r.settingsFirstRow, lang).toBe(true);

      expect(r.overflowX, lang).toBe(false);
      expect(r.outside, lang).toEqual([]);
      expect(r.split, lang).toEqual([]);
      if (r.rows.length > 1) expect(r.rows, lang).toContain('h1'); // the second half starts a row, with H1
      expect(r.strayLines, lang).toEqual([]);
      expect(r.missingLines, lang).toEqual([]);
    }
  });
}

// The top bar and the current-tab bar each fit one row from 800 px in both languages (the settings are a
// font name, a size field and two icon buttons, so the language barely changes their width).
for (const [width, maxRows] of [[800, { en: 1, fr: 1 }], [1200, { en: 1, fr: 1 }]]) {
  test(`layout holds at ${width}px wide in English and French (top bar: ${maxRows.en} / ${maxRows.fr} row(s) at most)`, async ({ page, appURL }) => {
    await page.setViewportSize({ width, height: 600 });
    await openFresh(page, appURL);
    await page.click('#btn-md'); // Markdown tab: formatting bar enabled
    for (const lang of ['en', 'fr']) {
      await setLang(page, lang);
      const r = await page.evaluate(() => {
        const bars = ['topbar', 'formatbar', 'tabbar', 'statusbar'].map((id) => document.getElementById(id));
        const controls = bars.flatMap((bar) => [...bar.querySelectorAll('button, select, label, .fmt-sep, .bar-sep')]).filter((e) => e.getBoundingClientRect().width > 0);
        const rects = controls.map((e) => e.getBoundingClientRect());
        const overlaps = [];
        for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j];
          if (controls[i].contains(controls[j]) || controls[j].contains(controls[i])) continue;
          if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps.push(`${controls[i].id || controls[i].className} / ${controls[j].id || controls[j].className}`);
        }
        // Rows: controls whose vertical centres are within 12 px belong to the same row.
        const countRows = (sel) => {
          const centres = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0)
            .map((e) => { const x = e.getBoundingClientRect(); return (x.top + x.bottom) / 2; }).sort((a, b) => a - b);
          let rows = 0, last = -Infinity;
          for (const c of centres) { if (c - last > 12) { rows++; last = c; } }
          return rows;
        };
        return {
          rows: countRows('#topbar button, #topbar select, #topbar label'),
          fmtRows: countRows('#formatbar button'),
          outside: controls.filter((e) => { const x = e.getBoundingClientRect(); return x.left < 0 || x.right > window.innerWidth; }).map((e) => e.id || e.className),
          overlaps,
          bodyScroll: document.documentElement.scrollWidth > window.innerWidth,
          status: document.getElementById('statusbar').scrollWidth <= document.getElementById('statusbar').clientWidth,
          sizeFits: (() => { // the size field shows its whole label
            const sel = document.getElementById('size-select');
            const probe = document.createElement('span');
            probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${getComputedStyle(sel).font}`;
            document.body.append(probe);
            const widest = Math.max(...[...sel.options].map((o) => { probe.textContent = o.textContent; return probe.getBoundingClientRect().width; }));
            probe.remove();
            return sel.getBoundingClientRect().width >= widest + 16;
          })(),
        };
      });
      expect(r.outside, lang).toEqual([]);
      expect(r.overlaps, lang).toEqual([]);
      expect(r.bodyScroll, lang).toBe(false);
      expect(r.rows, lang).toBeLessThanOrEqual(maxRows[lang]);
      expect(r.fmtRows, `${lang} current-tab bar`).toBe(1);
      expect(r.status, lang).toBe(true);
      expect(r.sizeFits, lang).toBe(true);
    }
  });
}

test('every control has a translated tooltip and aria-label and a visible keyboard focus state', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  await setDoc(page, 'x');
  const missing = await page.evaluate(() => [...document.querySelectorAll('button, select, input, [role="tab"], [role="listbox"]')]
    .filter((e) => e.type !== 'file' && !e.closest('#modal'))
    .filter((e) => !(e.getAttribute('title') || e.closest('[title]')) || !e.getAttribute('aria-label'))
    .map((e) => e.id || e.className));
  expect(missing).toEqual([]);
  // Walk the toolbar with the keyboard: each focused control shows an outline.
  await page.locator('#statusbar').click();
  const seen = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const e = document.activeElement;
      const c = getComputedStyle(e);
      return { id: e.id || e.className, outline: c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) >= 2 };
    });
    seen.push(f);
  }
  expect(seen[0].id).toBe('font-btn'); // the title is plain text and the undo-close button is disabled here
  expect(seen.filter((f) => !f.outline)).toEqual([]);
});

test('narrowing top bar: it never overflows, and it goes to a second row once (and only once) it must', async ({ page, appURL }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await openFresh(page, appURL);
  // Sweeps down to 320 px and returns the width at which the settings moved to a second row.
  const sweep = async () => {
    let stackedAt = null, unstackedBelow = null;
    for (let w = 900; w >= 360; w -= 10) {
      await page.setViewportSize({ width: w, height: 600 });
      const s = await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => {
        const bar = document.getElementById('topbar');
        r({ stacked: bar.classList.contains('stacked'), over: bar.scrollWidth > bar.clientWidth + 1 });
      }))));
      expect(s.over, `${w}px: the top bar is never cut`).toBe(false);
      if (s.stacked && stackedAt === null) stackedAt = w;
      if (!s.stacked && stackedAt !== null) unstackedBelow = w; // it must not go back to one row
    }
    return { stackedAt, unstackedBelow };
  };
  for (const lang of ['fr', 'en']) {
    await setLang(page, lang);
    const r = await sweep();
    expect(r.stackedAt, `${lang}: one row while it fits`).toBeLessThanOrEqual(800);
    expect(r.unstackedBelow, `${lang}: it never goes back to one row`).toBeNull();
  }
  await setLang(page, 'fr');
  await expect(page.locator('#btn-wrap')).toHaveAttribute('title', /^Renvoi à la ligne/);
  await expect(page.locator('#btn-readwidth')).toHaveAttribute('title', /^Largeur de lecture/);
  await setLang(page, 'en');
});

// The generic focus tint replaces a button's background but not its text colour, which on a primary
// button is the dark one picked for the light accent face: in dark mode that left the label at 1.7:1.
// Firefox and WebKit make an autofocused button focus-visible at once, so both dialogs opened showing it.
test('a primary button keeps a readable label while it has the keyboard focus, in both themes', async ({ page, appURL }) => {
  await openFresh(page, appURL);
  const isFocusVisible = (id) => page.evaluate((i) => document.getElementById(i).matches(':focus-visible'), id);
  for (const theme of ['light', 'dark']) {
    if ((await page.getAttribute('html', 'data-theme')) !== theme) await toggleTheme(page);
    for (const [keys, id] of [['ControlOrMeta+KeyP', 'print-ok'], ['ControlOrMeta+Slash', 'keys-ok']]) {
      await page.keyboard.press(keys);
      // Chromium only counts it as keyboard focus once the focus has moved by key.
      for (let i = 0; i < 6 && !(await isFocusVisible(id)); i++) await page.keyboard.press('Tab');
      expect(await isFocusVisible(id), `${id} focus-visible in ${theme}`).toBe(true);
      const [m] = await measure(page, [`#${id}`]);
      expect(m.ratio, `${id} in ${theme}`).toBeGreaterThanOrEqual(4.5);
      await page.keyboard.press('Escape');
    }
  }
});
