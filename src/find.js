// Find in the active tab (Cmd/Ctrl+F): a row above the text. Case-insensitive; every match is highlighted,
// the current one more strongly; Enter / Shift+Enter or Cmd/Ctrl+G / Shift+Cmd/Ctrl+G go to the next / previous
// match (wrapping around); Esc closes it and leaves the cursor on the match. Needed because the browser's own
// Find only sees the lines CodeMirror has drawn.
import { StateField, StateEffect, EditorSelection, RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';
import { $, S, activeTab, t } from './state.js';

export const setFind = StateEffect.define(); // the query ('' = none)
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Matches as a flat, sorted list [from, to, from, to, …].
function search(doc, q) {
  if (!q) return [];
  const re = new RegExp(escapeRe(q), 'giu');
  const text = doc.toString();
  const out = [];
  for (let m; (m = re.exec(text)) && out.length < 200000;) out.push(m.index, m.index + m[0].length);
  return out;
}

export const findField = StateField.define({
  create: () => ({ q: '', m: [] }),
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setFind)) return { q: e.value, m: search(tr.state.doc, e.value) };
    return tr.docChanged && v.q ? { q: v.q, m: search(tr.state.doc, v.q) } : v;
  },
});

const match = Decoration.mark({ class: 'mt-find' });
const current = Decoration.mark({ class: 'mt-find mt-find-current' });
// First pair whose end is after pos.
function firstAfter(m, pos) {
  let lo = 0, hi = m.length / 2;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (m[mid * 2 + 1] <= pos) lo = mid + 1; else hi = mid; }
  return lo * 2;
}
const highlight = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = this.build(view); }
  update(u) {
    if (u.docChanged || u.viewportChanged || u.selectionSet || u.transactions.some((tr) => tr.effects.some((e) => e.is(setFind)))) this.decorations = this.build(u.view);
  }
  build(view) {
    const { m } = view.state.field(findField);
    const sel = view.state.selection.main;
    const b = new RangeSetBuilder();
    for (const { from, to } of view.visibleRanges) {
      for (let i = firstAfter(m, from); i < m.length && m[i] < to; i += 2) b.add(m[i], m[i + 1], m[i] === sel.from && m[i + 1] === sel.to ? current : match);
    }
    return b.finish();
  }
}, { decorations: (v) => v.decorations });
export const findExtension = [findField, highlight];

// ---------------------------------------------------------------- the find row
const bar = $('findbar');
const input = $('find-input');
const count = $('find-count');
export const findOpen = () => !bar.hidden;

function renderCount() {
  const v = S.view;
  if (!v) return;
  const { q, m } = v.state.field(findField);
  const sel = v.state.selection.main;
  let cur = 0;
  for (let i = firstAfter(m, sel.from); i < m.length && m[i] <= sel.from; i += 2) if (m[i] === sel.from && m[i + 1] === sel.to) cur = i / 2 + 1;
  count.textContent = !q ? '' : m.length ? t('findCount', { i: cur ? t.num(cur) : '–', n: t.num(m.length / 2) }) : t('findNone');
  input.classList.toggle('no-match', !!q && !m.length);
}

// The range the search itself last selected. Reopening the bar seeds the field from the selection, and
// without this it would seed it from the search's own last match: type "whatever" over a text holding
// "what" and the match stays on "what" while the query stops matching, so reopening offered "what" back
// rather than the "whatever" that was being looked for.
let findSel = null;

// dir 1: next match after the selection (from its start while typing the query, so the match stays put); -1: previous.
export function findGo(dir, typing = false) {
  const v = S.view;
  if (!v) return;
  const { m } = v.state.field(findField);
  if (m.length) {
    const sel = v.state.selection.main;
    let i;
    if (dir > 0) {
      const pos = typing ? sel.from : sel.to;
      i = firstAfter(m, pos);
      while (i < m.length && m[i] < pos) i += 2;
      if (i >= m.length) i = 0;
    } else {
      i = firstAfter(m, sel.from) - 2;
      if (i < 0) i = m.length - 2;
    }
    v.dispatch({ selection: EditorSelection.range(m[i], m[i + 1]), effects: EditorView.scrollIntoView(m[i], { y: 'center' }) });
    findSel = { from: m[i], to: m[i + 1], tab: activeTab()?.id };
  }
  renderCount();
}

function apply(jump) {
  S.view?.dispatch({ effects: setFind.of(input.value) });
  if (jump) findGo(1, true); else renderCount();
}

export function openFind() {
  const v = S.view;
  if (!v) return;
  const r = v.state.selection.main;
  const own = findSel && findSel.from === r.from && findSel.to === r.to && findSel.tab === activeTab()?.id;
  const sel = r.empty || own ? '' : v.state.sliceDoc(r.from, r.to);
  if (sel && !sel.includes('\n') && sel.length <= 200) input.value = sel;
  bar.hidden = false;
  input.focus();
  input.select();
  apply(!sel);
}

export function closeFind() {
  if (bar.hidden) return;
  bar.hidden = true;
  S.view?.dispatch({ effects: setFind.of('') });
  S.view?.focus();
}

// Another tab became active: search it with the same query.
export function refreshFind() {
  if (bar.hidden) return;
  if (activeTab()?.help) { bar.hidden = true; S.view?.dispatch({ effects: setFind.of('') }); return; } // the browser's own find works on Help
  apply(false);
}
// The text or the selection changed: update "3 of 12".
export function findViewUpdate(u) {
  if (u.docChanged) findSel = null; // the range no longer means what it meant
  if (!bar.hidden && (u.docChanged || u.selectionSet)) renderCount();
}

input.addEventListener('input', () => apply(true));
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); findGo(e.shiftKey ? -1 : 1); }
  else if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
});
bar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); }); // keep the focus in the field
$('find-next').addEventListener('click', () => findGo(1));
$('find-prev').addEventListener('click', () => findGo(-1));
$('find-close').addEventListener('click', closeFind);

export function updateFindTips() {
  const set = (el, s) => { el.title = s; el.setAttribute('aria-label', s); };
  set(input, t('findLabel'));
  input.placeholder = t('findLabel');
  set($('find-next'), `${t('findNext')} (${t.key('Enter')}, ${t.key('findNext')})`);
  set($('find-prev'), `${t('findPrev')} (${t.key('Shift-Enter')}, ${t.key('findPrev')})`);
  set($('find-close'), `${t('findClose')} (Esc)`);
  renderCount();
}
