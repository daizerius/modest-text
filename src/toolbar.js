// Top bar and the bar under the tabs: fonts, size, wrap, reading width, formatting, undo / redo, theme,
// language, narrow layout.
import { undo, redo, undoDepth, redoDepth } from '@codemirror/commands';
import { makeT, SHORTCUTS } from './i18n.js';
import { FONT_GROUPS, defaultFont, cssFamily, genericOf, kindOf } from './fonts.js';
import { activeFormats } from './markdown.js';
import { FORMATS } from './format.js';
import { $, KEYS, S, SIZES, activeTab, html, setT, settings, t } from './state.js';
import { charKey } from './keys.js';
import { formatStamp } from './text.js';
import { syncView } from './editor.js';
import { writeSettings } from './persist.js';
import { updateFindTips } from './find.js';
import { focusText } from './helpview.js';
import { addTab, focusTab, modal, refreshHelp, renameTab, renderTabs, reopenClosed, updateRenamePreview } from './tabs.js';
import { renderBanners, updateAmber, updateStatus } from './statusbar.js';

// ---------------------------------------------------------------- UI: toolbar
export const fontBtn = $('font-btn');
export const fontList = $('font-list');
export const sizeSel = $('size-select');
export const wrapBtn = $('btn-wrap');
export const readBtn = $('btn-readwidth');

// A saved font that is not installed falls back to the default of its section.
export function effectiveFont(kind) {
  const f = kind === 'md' ? settings.mdFont : settings.monoFont;
  return f && S.installed[f] && kindOf(f) === kind ? f : defaultFont(kind, S.installed);
}

// Reading width narrows the text to a centred column. It is only ever applied where the text wraps:
// with wrap off, a long line would run outside the column instead of being cut to it.
export const readApplies = () => { const tab = activeTab(); return !!tab && (tab.mode === 'md' || settings.wrap); };
export function applyReadWidth() {
  $('editor').dataset.read = settings.read && readApplies() ? '1' : '0';
  S.view?.requestMeasure();
}

export function applyFonts() {
  const md = effectiveFont('md');
  const mono = effectiveFont('mono');
  for (const ed of [$('editor'), $('help-view')]) { // the Help page uses the same fonts and size
    ed.style.setProperty('--md-font', md ? cssFamily(md, genericOf(md)) : 'serif');
    ed.style.setProperty('--mono-font', cssFamily(mono, 'monospace'));
    ed.style.setProperty('--ed-size', settings.size + 'px');
  }
  updateFontButton();
  S.view?.requestMeasure();
}

// The button shows the font that applies to the active tab.
export function updateFontButton() {
  const tab = activeTab();
  const kind = tab && tab.mode === 'md' ? 'md' : 'mono';
  const f = effectiveFont(kind);
  $('font-label').textContent = f || (kind === 'md' ? 'serif' : 'monospace');
  $('font-label').style.fontFamily = cssFamily(f, kind === 'md' ? genericOf(f) : 'monospace');
  const tip = t(kind === 'md' ? 'fontTipMd' : 'fontTip');
  fontBtn.title = tip;
  fontBtn.setAttribute('aria-label', `${tip}: ${$('font-label').textContent}`);
}

// Only the section that applies to the active tab is listed.
export function buildFontList() {
  fontList.replaceChildren();
  const tab = activeTab();
  const kind = tab && tab.mode === 'md' ? 'md' : 'mono';
  for (const g of FONT_GROUPS.filter((x) => x.kind === kind)) {
    const cur = effectiveFont(g.kind);
    const group = document.createElement('div');
    group.setAttribute('role', 'group');
    const label = document.createElement('div');
    label.className = 'font-group';
    label.id = 'fg-' + g.kind;
    label.textContent = t(g.key);
    group.setAttribute('aria-labelledby', label.id);
    group.append(label);
    for (const [f, generic] of g.fonts) {
      const o = document.createElement('div');
      o.setAttribute('role', 'menuitemradio');
      o.id = 'font-opt-' + f.replace(/\W+/g, '-');
      o.className = 'font-opt';
      o.dataset.font = f;
      o.dataset.kind = g.kind;
      o.textContent = f;
      o.style.fontFamily = cssFamily(f, generic);
      const ok = S.installed[f];
      o.setAttribute('aria-disabled', String(!ok));
      o.setAttribute('aria-checked', String(f === cur));
      o.title = ok ? f : t('notInstalled');
      group.append(o);
    }
    fontList.append(group);
  }
}

export function openFontList() {
  buildFontList();
  fontList.hidden = false;
  fontBtn.setAttribute('aria-expanded', 'true');
  const tab = activeTab();
  const kind = tab && tab.mode === 'md' ? 'md' : 'mono';
  const sel = fontList.querySelector(`.font-opt[data-kind="${kind}"][aria-checked="true"]`) || fontList.querySelector('[aria-disabled="false"]');
  setFontActive(sel);
  fontList.focus();
}
export function closeFontList(refocus) {
  fontList.hidden = true;
  fontBtn.setAttribute('aria-expanded', 'false');
  if (refocus) fontBtn.focus();
}
export function setFontActive(o) {
  fontList.querySelectorAll('.font-opt.kb').forEach((x) => x.classList.remove('kb'));
  if (!o) return;
  o.classList.add('kb');
  fontList.setAttribute('aria-activedescendant', o.id);
  o.scrollIntoView({ block: 'nearest' });
}
export function chooseFont(f) {
  if (!S.installed[f]) return;
  if (kindOf(f) === 'md') settings.mdFont = f; else settings.monoFont = f;
  writeSettings();
  applyFonts();
  closeFontList(true);
  updateToolbar();
}
fontBtn.addEventListener('click', () => (fontList.hidden ? openFontList() : closeFontList(false)));
fontList.addEventListener('click', (e) => {
  const o = e.target.closest('.font-opt');
  if (o && o.getAttribute('aria-disabled') === 'false') chooseFont(o.dataset.font);
});
fontList.addEventListener('keydown', (e) => {
  const opts = [...fontList.querySelectorAll('.font-opt[aria-disabled="false"]')];
  const cur = fontList.querySelector('.font-opt.kb');
  const i = opts.indexOf(cur);
  if (e.key === 'ArrowDown') { e.preventDefault(); setFontActive(opts[Math.min(opts.length - 1, i + 1)]); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); setFontActive(opts[Math.max(0, i - 1)]); }
  else if (e.key === 'Home') { e.preventDefault(); setFontActive(opts[0]); }
  else if (e.key === 'End') { e.preventDefault(); setFontActive(opts[opts.length - 1]); }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (cur) chooseFont(cur.dataset.font); }
  else if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); closeFontList(e.key === 'Escape'); }
});
document.addEventListener('mousedown', (e) => {
  if (!fontList.hidden && !e.target.closest('.font-picker')) closeFontList(false);
});

export function buildSizeOptions() {
  sizeSel.replaceChildren(...SIZES.map(([key, px]) => {
    const o = document.createElement('option');
    o.value = String(px);
    o.textContent = `${px}px · ${t(key)}`;
    return o;
  }));
  sizeSel.value = String(settings.size);
}
sizeSel.addEventListener('change', () => {
  settings.size = Number(sizeSel.value);
  writeSettings();
  applyFonts();
});
wrapBtn.addEventListener('click', () => {
  settings.wrap = !settings.wrap;
  writeSettings();
  const tab = activeTab();
  if (tab) syncView(tab);
  updateToolbar();
});
readBtn.addEventListener('click', () => {
  settings.read = !settings.read;
  writeSettings();
  updateToolbar();
});

export function setTip(el, key, vars) {
  const s = t(key, vars);
  el.title = s;
  el.setAttribute('aria-label', s);
}

export function updateToolbar() {
  const tab = activeTab();
  const undoBtn = $('btn-undo-close');
  const last = S.closedStack[S.closedStack.length - 1];
  undoBtn.disabled = !last || S.role !== 'editor';
  setTip(undoBtn, last ? 'undoCloseName' : 'undoCloseEmpty', last ? { name: last.name } : undefined);
  const mdBtn = $('btn-md');
  const isMd = !!tab && tab.mode === 'md';
  mdBtn.setAttribute('aria-pressed', String(isMd));
  for (const h of mdBtn.querySelectorAll('[data-mode]')) h.classList.toggle('active', h.dataset.mode === (isMd ? 'md' : 'plain'));
  mdBtn.disabled = !tab || tab.help || S.role !== 'editor';
  tipWithKey(mdBtn, isMd ? 'mdOn' : 'mdOff', 'mode');
  // Wrap is fixed on in Markdown (which always wraps); reading width needs a wrapping tab to apply to.
  wrapBtn.setAttribute('aria-pressed', String(isMd || settings.wrap));
  wrapBtn.disabled = isMd;
  setTip(wrapBtn, isMd ? 'wrapTipMd' : settings.wrap ? 'wrapTipOn' : 'wrapTipOff');
  // The Help page is a centred column of its own, and is not the user's to change: pressed and disabled,
  // exactly as Wrap is in a Markdown tab.
  const help = !!tab && !!tab.help;
  const canRead = readApplies();
  readBtn.setAttribute('aria-pressed', String(help || (settings.read && canRead)));
  readBtn.disabled = help || !canRead;
  setTip(readBtn, help ? 'readTipHelp' : !canRead ? 'readTipNA' : settings.read ? 'readTipOn' : 'readTipOff');
  applyReadWidth();
  updateFontButton();
  setTip(sizeSel, 'sizeTip');
  $('btn-import').disabled = S.role !== 'editor';
  $('btn-export').disabled = !tab || !!tab.help; // Help is not a note
  const dark = html.dataset.theme === 'dark';
  const themeBtn = $('btn-theme');
  setTip(themeBtn, dark ? 'themeToLight' : 'themeToDark');
  const langBtn = $('btn-lang');
  for (const h of langBtn.querySelectorAll('[data-lang]')) h.classList.toggle('active', h.dataset.lang === S.lang);
  setTip(langBtn, S.lang === 'fr' ? 'langTipFr' : 'langTipEn');
  sizeSel.value = String(settings.size);
  updateFormatBar();
  scheduleFit();
}

// ---------------------------------------------------------------- narrow windows
// The top bar stays on one row while everything fits; otherwise font, size, wrap and reading width move to a
// second row (the title and the workspace buttons keep the first). Measured, because the font name and the
// size labels change with the language and the chosen font.
export const topbar = $('topbar');
export let fitFrame = 0;
export function fitTopbar() {
  fitFrame = 0;
  topbar.classList.remove('stacked');
  const title = $('app-title');
  if (topbar.scrollWidth > topbar.clientWidth + 1 || title.scrollWidth > title.clientWidth + 1) topbar.classList.add('stacked');
}
export const scheduleFit = () => { if (!fitFrame) fitFrame = requestAnimationFrame(fitTopbar); };
window.addEventListener('resize', scheduleFit);

// ---------------------------------------------------------------- formatting bar
export const fmtBar = $('formatbar');
// Undo / redo act on the active tab in both modes; each is enabled only when there is something to undo / redo.
export const histBtns = fmtBar.querySelectorAll('.hist-btn');
export function updateFormatBar() {
  const tab = activeTab();
  const on = !!tab && !tab.help && S.role === 'editor';
  for (const b of fmtBar.querySelectorAll('.fmt-btn')) {
    b.disabled = !on;
    tipWithKey(b, 'fmt_' + b.dataset.fmt, b.dataset.fmt);
  }
  for (const b of histBtns) tipWithKey(b, 'hist_' + b.dataset.hist, b.dataset.hist);
  updateHistButtons();
  updateRoving();
  renderActiveFormats();
}
// Tooltip and accessible name: the label plus its shortcut in the platform's own key names ("Bold (Cmd+B)").
function tipWithKey(el, key, shortcut) {
  const s = SHORTCUTS[shortcut] ? `${t(key)} (${t.key(shortcut)})` : t(key);
  el.title = s;
  el.setAttribute('aria-label', s);
}
// The formats under the cursor (bold, heading, list, code block…) show as pressed buttons: clicking one removes it.
export const TOGGLE_FMTS = new Set(['bold', 'italic', 'strike', 'highlight', 'code', 'h1', 'h2', 'h3', 'ul', 'ol', 'tasklist', 'quote', 'codeblock']);
export function renderActiveFormats() {
  const tab = activeTab();
  const on = S.view && tab && !tab.help ? activeFormats(S.view.state) : new Set();
  for (const b of fmtBar.querySelectorAll('.fmt-btn')) {
    if (!TOGGLE_FMTS.has(b.dataset.fmt)) continue;
    const p = String(on.has(b.dataset.fmt));
    if (b.getAttribute('aria-pressed') !== p) b.setAttribute('aria-pressed', p);
  }
}
export function updateHistButtons() {
  const tab = activeTab();
  const can = !!S.view && !!tab && !tab.help && S.role === 'editor';
  for (const b of histBtns) {
    const off = !can || (b.dataset.hist === 'undo' ? undoDepth : redoDepth)(S.view.state) === 0;
    if (b.disabled !== off) { b.disabled = off; updateRoving(); }
  }
}
// Keyboard: the bar is a single Tab stop (WAI-ARIA toolbar); ← → Home End move between its enabled buttons.
export let fmtCurrent = null;
export const fmtItems = () => [...fmtBar.querySelectorAll('button')].filter((b) => !b.disabled);
export function updateRoving() {
  const items = fmtItems();
  if (!items.includes(fmtCurrent)) fmtCurrent = items[0] || null;
  for (const b of fmtBar.querySelectorAll('button')) b.tabIndex = b === fmtCurrent ? 0 : -1;
}
fmtBar.addEventListener('focusin', (e) => {
  const b = e.target.closest('button');
  if (b && b !== fmtCurrent) { fmtCurrent = b; updateRoving(); }
});
fmtBar.addEventListener('keydown', (e) => {
  const letter = !e.ctrlKey && !e.metaKey && !e.altKey && (e.key.length === 1 || e.key === 'Dead') ? charKey(e) : '';
  if (letter === 'n' || letter === 'u') { e.preventDefault(); (letter === 'n' ? addTab : reopenClosed)(); return; } // as in the tabs
  const items = fmtItems();
  const i = items.indexOf(document.activeElement);
  const n = e.key === 'ArrowRight' ? (i + 1) % items.length : e.key === 'ArrowLeft' ? (i - 1 + items.length) % items.length
    : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : -1;
  if (e.key === 'Tab') { // to the first button of the next (Shift: previous) group; past the last one, out of the bar
    const groups = [...fmtBar.querySelectorAll('.fmt-group')];
    const dir = e.shiftKey ? -1 : 1;
    for (let g = groups.findIndex((x) => x.contains(document.activeElement)) + dir; g >= 0 && g < groups.length; g += dir) {
      const first = [...groups[g].querySelectorAll('button')].find((b) => !b.disabled);
      if (first) { e.preventDefault(); fmtCurrent = first; updateRoving(); first.focus(); return; }
    }
    return;
  }
  if (e.key === 'ArrowUp') { e.preventDefault(); focusTab(S.activeId); return; } // up to the tabs
  if (e.key === 'ArrowDown') { e.preventDefault(); focusText(); return; } // down to the text
  if (n < 0 || !items.length) return;
  e.preventDefault();
  fmtCurrent = items[n];
  updateRoving();
  fmtCurrent.focus();
});
// Cmd/Ctrl+J: from the text to the bar under the tabs, and back (see main.js for the key).
export function focusFormatBar() {
  updateRoving();
  if (fmtCurrent) fmtCurrent.focus();
  else focusTab(S.activeId); // nothing enabled there (Help tab): the tabs
}
export function toggleBars() {
  const a = document.activeElement;
  if (a instanceof Element && a.closest('#formatbar, #tabbar, #topbar')) focusText();
  else focusFormatBar();
}

// Top bar with the keyboard: ← → move between its controls, Home / End to the first / last, ↓ goes to the
// tabs; on the size field, Enter or Space opens its list (the arrows move between controls there too).
const topItems = () => [fontBtn, sizeSel, wrapBtn, readBtn, $('btn-import'), $('btn-export'), $('btn-export-all'), $('btn-theme'), $('btn-lang'), $('btn-help')]
  .filter((e) => !e.disabled);
let topCurrent = null;
export function focusTopBar() {
  const items = topItems();
  (items.includes(topCurrent) ? topCurrent : items[0])?.focus();
}
topbar.addEventListener('focusin', (e) => { if (topItems().includes(e.target)) topCurrent = e.target; });
topbar.addEventListener('keydown', (e) => {
  if (!(e.target instanceof Element) || e.target.closest('.font-list') || e.ctrlKey || e.metaKey || e.altKey) return;
  const items = topItems();
  const i = items.indexOf(e.target);
  if (i < 0) return;
  let n = -1;
  if (e.key === 'ArrowRight') n = (i + 1) % items.length;
  else if (e.key === 'ArrowLeft') n = (i - 1 + items.length) % items.length;
  else if (e.key === 'Home') n = 0; // like every other bar
  else if (e.key === 'End') n = items.length - 1;
  else if (e.key === 'ArrowDown') { e.preventDefault(); focusTab(S.activeId); return; }
  else if (e.key === 'ArrowUp') { e.preventDefault(); return; }
  else if (e.target === sizeSel && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    try { sizeSel.showPicker(); } catch { /* not supported: the field still takes the keys of its own list */ }
    return;
  }
  if (n < 0) return;
  e.preventDefault();
  items[n].focus();
});
// Esc in any bar (or banner) returns to the text. From the text, Esc then Shift+Tab reaches the bars
// (CodeMirror lets Tab / Shift+Tab move focus for 2 seconds after Esc).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented || !S.view || !modal.hidden) return;
  if (e.target instanceof Element && e.target.closest('#topbar, #tabbar, #formatbar, #statusbar, .banner')) {
    e.preventDefault();
    focusText();
  }
});
// mousedown would move focus (and the selection) out of the editor: keep them where they are.
fmtBar.addEventListener('mousedown', (e) => { if (e.target.closest('.fmt-btn, .hist-btn')) e.preventDefault(); });
fmtBar.addEventListener('click', (e) => {
  const h = e.target.closest('.hist-btn');
  if (h && !h.disabled && S.view) {
    (h.dataset.hist === 'undo' ? undo : redo)(S.view);
    S.view.focus();
    return;
  }
  const b = e.target.closest('.fmt-btn');
  if (!b || b.disabled || !S.view) return;
  FORMATS[b.dataset.fmt]?.(S.view);
  S.view.focus();
});

// ---------------------------------------------------------------- theme & language
export const mql = window.matchMedia('(prefers-color-scheme: dark)');
export function applyTheme() {
  html.dataset.theme = settings.theme || (mql.matches ? 'dark' : 'light');
  updateToolbar();
}
mql.addEventListener?.('change', () => { if (!settings.theme) applyTheme(); });
$('btn-theme').addEventListener('click', () => {
  const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
  const apply = () => { settings.theme = next; writeSettings(); applyTheme(); };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof document.startViewTransition !== 'function' || reduce) { apply(); return; }
  html.dataset.themeFading = '1'; // cross-fade between the two themes (see ::view-transition-* in CSS)
  const vt = document.startViewTransition(apply);
  vt.ready.catch(() => {});
  vt.updateCallbackDone.catch(() => {});
  vt.finished.catch(() => {}).then(() => { delete html.dataset.themeFading; });
});

// Import, Export and Export All: their keys, and when the last full export ran.
export function updateFileTips() {
  const tip = (id, key, name, extra = '') => { const s = `${t(key)} (${t.key(name)})${extra}`; $(id).title = s; $(id).setAttribute('aria-label', s); };
  tip('btn-import', 'importTip', 'importKey');
  tip('btn-export', 'exportTip', 'exportKey');
  const last = S.lastExport ? t('lastExport', { when: formatStamp(new Date(S.lastExport), ' ∙ ', 1) }) : t('lastExportNever');
  tip('btn-export-all', 'exportAllTip', 'exportAllKey', `\n${last}`);
}

export function applyLang() {
  S.lang = settings.lang || (/^fr\b/i.test(navigator.language || '') ? 'fr' : 'en');
  setT(makeT(S.lang, KEYS));
  html.lang = S.lang;
  document.body.dataset.printMsg = t('printText');
  updateFindTips();
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-tip]')) setTip(el, el.dataset.i18nTip);
  updateFileTips();
  buildSizeOptions();
  if (!fontList.hidden) buildFontList();
  if (renameTab) updateRenamePreview();
  refreshHelp();
  renderTabs();
  updateToolbar();
  updateStatus(true);
  updateAmber();
  const tab = activeTab();
  if (tab) syncView(tab);
}
$('btn-lang').addEventListener('click', () => {
  settings.lang = S.lang === 'fr' ? 'en' : 'fr';
  writeSettings();
  applyLang();
});

// ---------------------------------------------------------------- render all
export function renderAll() {
  renderTabs();
  renderBanners();
  updateToolbar();
  updateStatus(true);
  updateAmber();
}
