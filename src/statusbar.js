// Toasts and the status bar (counts, save state, amber storage item, banners).
import { countText, formatStamp } from './text.js';
import { WARN_CHARS, store } from './storage.js';
import { $, S, activeTab, html, t, textOf } from './state.js';
import { updateTabMarkers } from './tabs.js';

// ---------------------------------------------------------------- UI: toasts
export const toastsEl = $('toasts');
export function toast(msg, { kind = 'info', timeout = 7000 } = {}) {
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  const span = document.createElement('span');
  span.className = 'toast-text';
  span.textContent = msg;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'toast-close';
  b.textContent = '×';
  b.dataset.i18nTip = 'dismiss';
  b.title = t('dismiss');
  b.setAttribute('aria-label', t('dismiss'));
  b.addEventListener('click', () => el.remove());
  el.append(span, b);
  toastsEl.append(el);
  while (toastsEl.children.length > 4) toastsEl.firstElementChild.remove();
  if (timeout) setTimeout(() => el.remove(), timeout);
  return el;
}

// A short message in the middle of the window, gone after a second: the answer to Cmd/Ctrl+S, which
// people press expecting to save the page as a file. Not a toast: nothing to dismiss, nothing that stays.
let flashTimer = null;
export function flash(title, hint = '') {
  const el = $('save-flash');
  $('save-flash-title').textContent = title;
  $('save-flash-hint').textContent = hint;
  $('save-flash-hint').hidden = !hint;
  el.hidden = false;
  el.classList.remove('out');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    el.classList.add('out'); // fades (unless reduced motion), then hides
    flashTimer = setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 200);
  }, 1000);
}

// ---------------------------------------------------------------- UI: status bar
export let countsTimer = null;
export function scheduleCounts() {
  clearTimeout(countsTimer);
  countsTimer = setTimeout(renderCounts, activeTab() && activeTab().state.doc.length > 200000 ? 300 : 80);
}
// Level of abbreviation (narrow windows): 1 characters, 2 words, 3 lines.
export const formatCounts = (c, level = 0) => `${t(level >= 3 ? 'linesAbbr' : 'lines', { n: c.lines })} · ${t(level >= 2 ? 'wordsAbbr' : 'words', { n: c.words })} · ${t(level >= 1 ? 'charsAbbr' : 'chars', { n: c.chars })}`;
let docCounts = null, selCounts = null;

export function renderCounts() {
  clearTimeout(countsTimer);
  const tab = activeTab();
  if (!tab) return;
  docCounts = tab.help ? null : countText(textOf(tab)); // Help: no counts (it is not a note)
  renderSelectionCounts();
}

// When text is selected, its counts follow the document counts.
export function renderSelectionCounts() {
  const sel = S.view && !activeTab()?.help && S.view.state.selection.main;
  selCounts = !sel || sel.empty ? null : countText(S.view.state.sliceDoc(sel.from, sel.to));
  fitStatus();
}

// Write the status bar texts in the widest form that fits, stepping down one notch at a time until they do.
// A step is [counts level, save-stamp level, document counts hidden, short "Selection:"]. The order gives up
// the least useful thing first: the time zone, then "characters" (chars. / car.), then the date's dashes,
// then "words" (wds. / mts.) and "lines" (ln. / lgn.), then the seconds, then the date itself. With text
// selected the document counts go before all of that (the selection is what the user is looking at) and come
// back as soon as nothing is selected. An ellipsis remains as the very last resort.
const STEPS_DOC = [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2], [3, 3], [3, 4], [3, 5]];
const STEPS_SEL = [[0, 0, false], ...STEPS_DOC.map(([c, st]) => [c, st, true]), [3, 5, true, true]];
const statusEl = $('statusbar');
const stLeft = statusEl.querySelector('.st-left');
const cut = (el) => el.scrollWidth > el.clientWidth + 1;
export function fitStatus() {
  const sel = $('st-sel'), counts = $('st-counts');
  for (const [level, stamp, selOnly = false, selShort = false] of selCounts ? STEPS_SEL : STEPS_DOC) {
    counts.hidden = selOnly;
    stLeft.classList.toggle('sel-only', selOnly);
    counts.textContent = docCounts ? formatCounts(docCounts, level) : '';
    sel.hidden = !selCounts;
    sel.textContent = selCounts ? t(selShort ? 'selectionAbbr' : 'selection', { counts: formatCounts(selCounts, level) }) : '';
    // The backup, not the note: when Export All last ran. The label shows only at full width: from the
    // first step the Export All icon says what the stamp is (a long note must still fit at 500 px with
    // "chars." at most, as before), and the tooltip keeps the whole wording.
    $('st-export-label').textContent = stamp >= 1 ? '' : t('stExport');
    $('st-time').textContent = S.lastExport ? formatStamp(new Date(S.lastExport), ' ∙ ', stamp) : t('stNever');
    if (!cut(statusEl) && !(!selOnly && cut(counts)) && !(selCounts && cut(sel))) break;
  }
}
window.addEventListener('resize', fitStatus);

export function updateStatus(withCounts) {
  const tab = activeTab();
  if (!tab) return;
  if (withCounts) renderCounts();
  let st, dot;
  if (tab.help) { st = t('stHelp'); dot = 'none'; } // Help: just "Help · read-only", no dot or date
  else if (S.role !== 'editor') { st = t('stReadOnly'); dot = 'green'; }
  else if (tab.failed) { st = t('stFailed'); dot = 'red'; }
  else if (tab.dirty && (S.savePending || S.idleHandle)) { st = t('stSaving'); dot = 'red'; }
  else if (tab.dirty) { st = t('stUnsaved'); dot = 'red'; }
  else { st = t('stSaved'); dot = 'green'; }
  if (!tab.help && S.role !== 'editor' && tab.dirty) dot = 'red';
  $('st-status').textContent = st;
  const stamp = tab.savedAt ? formatStamp(new Date(tab.savedAt)) : '—'; // the note's own save: in the dot's tooltip
  fitStatus();
  const exp = S.lastExport ? t('lastExport', { when: formatStamp(new Date(S.lastExport)) }) : t('lastExportNever');
  $('st-export').title = exp; // the whole wording, whatever the width left of the label
  $('st-export').setAttribute('aria-label', exp);
  const dotEl = $('st-dot');
  dotEl.className = `dot dot-${dot}`;
  dotEl.hidden = $('st-sep').hidden = $('st-export').hidden = !!tab.help;
  const state = dot === 'red' ? t('dotUnsaved') : tab.savedAt ? t('dotSaved') : t('dotNever');
  const label = t('dotLabel', { state, when: stamp });
  dotEl.title = label;
  dotEl.setAttribute('aria-label', label);
  html.dataset.status = dot;
  updateTabMarkers();
}

export function updateAmber() {
  const usage = store.usage();
  const amber = usage > WARN_CHARS || S.probeFailed;
  const el = $('st-storage');
  el.hidden = !amber;
  const mb = new Intl.NumberFormat(S.lang === 'fr' ? 'fr-FR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(usage / 1048576);
  el.textContent = t('storageItem', { used: mb });
  el.title = t('storageTip');
  el.setAttribute('aria-label', `${el.textContent}. ${t('storageTip')}`);
  if (amber) {
    if (!S.amberNotified) { S.amberNotified = true; toast(t('nearlyFull'), { kind: 'warn', timeout: 12000 }); }
  }
  html.dataset.storage = S.full ? 'full' : amber ? 'amber' : 'ok';
}

export function renderBanners() {
  $('banner-full').hidden = !(S.full && S.role === 'editor');
  $('banner-ro').hidden = S.role !== 'readonly';
  html.dataset.storage = S.full ? 'full' : html.dataset.storage === 'full' ? 'ok' : html.dataset.storage || 'ok';
}
