// Tabs: activate / add / close / reopen, the tab strip (mouse, keyboard, drag), the rename modal.
import { helpText } from './i18n.js';
import { cleanName, uniqueName, nextDefaultName } from './text.js';
import { K, store } from './storage.js';
import { $, KEYS, S, activeTab, html, names, t, textOf } from './state.js';
import { charKey } from './keys.js';
import { createState, makeTab, syncView } from './editor.js';
import { flushDirty, markDirty, saveTab, writeClosed, writeIndex } from './persist.js';
import { updateStatus } from './statusbar.js';
import { focusFormatBar, focusTopBar, updateToolbar } from './toolbar.js';
import { refreshFind } from './find.js';
import { focusText, helpView, renderHelp, showHelpView, textHasFocus } from './helpview.js';

// ---------------------------------------------------------------- tabs
export function showTab(tab, { focus = false } = {}) {
  const prev = activeTab();
  if (prev && prev !== tab && S.tabs.includes(prev)) {
    prev.scrollTop = prev.help ? helpView.scrollTop : S.view.scrollDOM.scrollTop;
    prev.scrollLeft = prev.help ? 0 : S.view.scrollDOM.scrollLeft;
    prev.state = S.view.state;
  }
  S.activeId = tab.id;
  if (!tab.help) S.lastRealActive = tab.id;
  showHelpView(!!tab.help); // the Help tab is a page, not an editor (its text stays in its editor state, unseen)
  const switching = S.view.state !== tab.state;
  if (switching) S.view.setState(tab.state);
  syncView(tab);
  if (focus) focusText();
  if (switching || tab.help) restoreScroll(tab);
}

// Each tab keeps its own vertical (and horizontal) position; focusing never jumps to the cursor.
export function restoreScroll(tab) {
  const top = tab.scrollTop || 0;
  const left = tab.scrollLeft || 0;
  const apply = tab.help ? () => { helpView.scrollTop = top; } : () => { S.view.scrollDOM.scrollTop = top; S.view.scrollDOM.scrollLeft = left; };
  apply();
  S.view.requestMeasure({ read() {}, write: apply }); // again after CodeMirror's layout pass
  requestAnimationFrame(apply);
}

export function activate(id, opts = {}) {
  const tab = S.tabs.find((x) => x.id === id);
  if (!tab) return;
  const changed = tab.id !== S.activeId;
  if (changed) flushDirty(); // switching tabs saves
  showTab(tab, opts);
  if (changed) { writeIndex(); }
  renderTabs();
  updateToolbar();
  updateStatus(true);
  if (changed) refreshFind();
}

export function addTab() {
  if (S.role !== 'editor') return;
  const tab = makeTab({ name: nextDefaultName(t('untitled'), names()), auto: true });
  S.tabs.push(tab);
  tab.dirty = true;
  saveTab(tab);
  activate(tab.id, { focus: true });
  writeIndex();
}

export function closeTab(id) {
  if (S.role !== 'editor') return;
  const idx = S.tabs.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const tab = S.tabs[idx];
  if (tab === activeTab()) tab.state = S.view.state;
  const content = textOf(tab);
  if (!tab.help && content !== '') {
    S.closedStack.push({ name: tab.name, mode: tab.mode, content, pos: idx, state: tab.state, auto: tab.auto, def: tab.defaultName });
    if (S.closedStack.length > 3) S.closedStack.shift();
  }
  S.tabs.splice(idx, 1);
  if (!tab.help) store.remove(K.tab(tab.id));
  if (!S.tabs.length) {
    const f = makeTab({ name: nextDefaultName(t('untitled'), []), auto: true });
    f.dirty = true;
    S.tabs.push(f);
    saveTab(f);
  }
  if (S.activeId === id) {
    S.activeId = null;
    showTab(S.tabs[idx] || S.tabs[idx - 1], { focus: true });
  }
  writeClosed();
  writeIndex();
  if (S.full) flushDirty(); // retry now that space was freed
  renderTabs();
  updateToolbar();
  updateStatus(true);
}

export function reopenClosed() {
  if (S.role !== 'editor' || !S.closedStack.length) return;
  const e = S.closedStack.pop();
  const state = e.state && e.state.doc.toString() === e.content ? e.state : null;
  const tab = makeTab({ name: uniqueName(e.name, names()), mode: e.mode, content: e.content, state, auto: e.auto === true });
  if (e.def) tab.defaultName = e.def;
  S.tabs.splice(Math.min(Math.max(0, e.pos), S.tabs.length), 0, tab);
  tab.dirty = true;
  saveTab(tab);
  writeClosed();
  activate(tab.id, { focus: true });
  writeIndex();
}

export function openHelp() {
  let h = S.tabs.find((x) => x.help);
  if (!h) {
    h = makeTab({ id: 'help', name: t('help'), mode: 'md', content: helpText(S.lang, KEYS), help: true });
    S.tabs.push(h);
  }
  activate(h.id);
}

export function refreshHelp() {
  const h = S.tabs.find((x) => x.help);
  if (!h) return;
  h.name = t('help');
  const fresh = createState(h, helpText(S.lang, KEYS));
  h.state = fresh;
  h.scrollTop = 0;
  h.scrollLeft = 0;
  renderHelp(true);
  if (h === activeTab()) { S.view.setState(fresh); syncView(h); helpView.scrollTop = 0; }
}

export function toggleMode() {
  const tab = activeTab();
  if (!tab || tab.help || S.role !== 'editor') return;
  tab.mode = tab.mode === 'md' ? 'plain' : 'md';
  syncView(tab);
  markDirty(tab);
  updateToolbar();
  renderTabs();
}

// ---------------------------------------------------------------- UI: tabs
export const tabsEl = $('tabs');
export const newBtn = $('btn-new');
export const strip = $('tabstrip');
export let drag = null;
export let suppressUntil = 0;

export function createTabEl(id) {
  const el = document.createElement('div');
  el.setAttribute('role', 'tab');
  el.dataset.id = id;
  const name = document.createElement('span');
  name.className = 'tab-name';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'tab-close';
  close.textContent = '×';
  el.append(name, close);
  return el;
}

// Inactive tabs with changes not yet in storage (in practice: a failed save) carry a red dot, in the
// tooltip and the accessible name too. The active tab shows its state in the status bar instead.
export function markTab(el, tab) {
  const unsaved = !tab.help && tab.id !== S.activeId && (tab.dirty || tab.failed);
  el.classList.toggle('unsaved', unsaved);
  el.setAttribute('aria-label', unsaved ? `${tab.name} (${t('tabUnsaved')})` : tab.name);
  el.title = tab.help ? tab.name : (unsaved ? `${t('tabUnsaved')}\n` : '') + t('tabTip', { name: tab.name });
}
export function updateTabMarkers() {
  for (const el of tabsEl.children) {
    const tab = S.tabs.find((x) => x.id === el.dataset.id);
    if (tab) markTab(el, tab);
  }
}

// Tab elements are updated in place (not rebuilt) so a double-click spans one element.
export function renderTabs() {
  const existing = new Map([...tabsEl.children].map((el) => [el.dataset.id, el]));
  S.tabs.forEach((tab, i) => {
    const active = tab.id === S.activeId;
    const el = existing.get(tab.id) || createTabEl(tab.id);
    el.className = 'tab' + (active ? ' active' : '') + (tab.help ? ' help' : '') + (tab.mode === 'md' ? ' md' : '');
    el.setAttribute('aria-selected', String(active));
    el.tabIndex = active ? 0 : -1;
    markTab(el, tab);
    const [name, close] = el.children;
    if (name.textContent !== tab.name) name.textContent = tab.name;
    close.tabIndex = active ? 0 : -1;
    const tip = t('closeTab', { name: tab.name });
    close.title = tip;
    close.setAttribute('aria-label', tip);
    close.disabled = S.role !== 'editor';
    if (tabsEl.children[i] !== el) tabsEl.insertBefore(el, tabsEl.children[i] || null);
  });
  while (tabsEl.children.length > S.tabs.length) tabsEl.lastElementChild.remove();
  newBtn.disabled = S.role !== 'editor';
  const a = tabsEl.querySelector('.tab.active');
  if (a) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  scheduleTabListFit();
  if (!tabList.hidden) renderTabList();
}

// ---------------------------------------------------------------- all tabs in one menu
// With more tabs than the strip can show, the strip scrolls; this menu lists them all, so any tab is two
// keystrokes away. The button only appears once the strip actually overflows, measured on a frame of its
// own because it depends on the rendered widths.
export const tabListBtn = $('btn-tablist');
export const tabList = $('tab-list');
let fitFrame = 0;
export function fitTabList() {
  fitFrame = 0;
  const over = strip.scrollWidth > strip.clientWidth + 1;
  if (!over && !tabList.hidden) closeTabList(false);
  tabListBtn.hidden = !over;
}
const scheduleTabListFit = () => { if (!fitFrame) fitFrame = requestAnimationFrame(fitTabList); };
window.addEventListener('resize', scheduleTabListFit);

export function renderTabList() {
  tabList.replaceChildren();
  for (const tab of S.tabs) {
    const o = document.createElement('div');
    o.setAttribute('role', 'menuitemradio');
    o.className = 'tab-opt';
    o.id = 'tab-opt-' + tab.id;
    o.dataset.id = tab.id;
    o.setAttribute('aria-checked', String(tab.id === S.activeId));
    const name = document.createElement('span');
    name.className = 'tab-opt-name';
    name.textContent = tab.name;
    o.append(name);
    if (tab.mode === 'md' && !tab.help) {
      const md = document.createElement('span');
      md.className = 'tab-opt-md';
      md.textContent = '.md';
      o.append(md);
    }
    if (tab.dirty || tab.failed) { // the same red dot the tab itself carries
      const dot = document.createElement('span');
      dot.className = 'tab-opt-dot';
      dot.title = t('tabUnsaved');
      o.append(dot);
    }
    o.title = tab.name;
    tabList.append(o);
  }
}
export function openTabList() {
  renderTabList();
  tabList.hidden = false;
  tabListBtn.setAttribute('aria-expanded', 'true');
  setTabOptActive(tabList.querySelector('[aria-checked="true"]') || tabList.firstElementChild);
  tabList.focus();
}
export function closeTabList(refocus) {
  tabList.hidden = true;
  tabListBtn.setAttribute('aria-expanded', 'false');
  if (refocus) tabListBtn.focus();
}
function setTabOptActive(o) {
  tabList.querySelectorAll('.tab-opt.kb').forEach((x) => x.classList.remove('kb'));
  if (!o) return;
  o.classList.add('kb');
  tabList.setAttribute('aria-activedescendant', o.id);
  o.scrollIntoView({ block: 'nearest' });
}
tabListBtn.addEventListener('click', () => (tabList.hidden ? openTabList() : closeTabList(false)));
tabList.addEventListener('click', (e) => {
  const o = e.target.closest('.tab-opt');
  if (!o) return;
  closeTabList(false);
  activate(o.dataset.id, { focus: true });
});
tabList.addEventListener('keydown', (e) => {
  const opts = [...tabList.querySelectorAll('.tab-opt')];
  const i = opts.indexOf(tabList.querySelector('.tab-opt.kb'));
  const k = e.key;
  if (k === 'ArrowDown') { e.preventDefault(); setTabOptActive(opts[Math.min(opts.length - 1, i + 1)]); }
  else if (k === 'ArrowUp') { e.preventDefault(); setTabOptActive(opts[Math.max(0, i - 1)]); }
  else if (k === 'Home') { e.preventDefault(); setTabOptActive(opts[0]); }
  else if (k === 'End') { e.preventDefault(); setTabOptActive(opts[opts.length - 1]); }
  else if (k === 'Enter' || k === ' ') {
    e.preventDefault();
    const cur = opts[i];
    closeTabList(false);
    if (cur) activate(cur.dataset.id, { focus: true });
  } else if (k === 'Escape' || k === 'Tab') { if (k === 'Escape') e.preventDefault(); closeTabList(k === 'Escape'); }
});
document.addEventListener('mousedown', (e) => {
  if (!tabList.hidden && !e.target.closest('#tab-list, #btn-tablist')) closeTabList(false);
});

// Double-click = two clicks on the same tab within 500 ms, with that tab still active in between (another tab
// activated meanwhile, e.g. by the Help button, breaks it). Detected here as well as through `dblclick`,
// because focusing the editor on the first click can reset the browser's click count.
export let lastTabClick = null;
tabsEl.addEventListener('click', (e) => {
  if (Date.now() < suppressUntil) return;
  const el = e.target.closest('.tab');
  if (!el) return;
  if (e.target.closest('.tab-close')) { closeTab(el.dataset.id); return; }
  const now = Date.now();
  const second = lastTabClick && lastTabClick.id === el.dataset.id && now - lastTabClick.t < 500 && S.activeId === el.dataset.id;
  lastTabClick = second ? null : { id: el.dataset.id, t: now };
  const tab = S.tabs.find((x) => x.id === el.dataset.id);
  if (second && tab) { openRename(tab, { x: e.clientX, y: e.clientY }); return; }
  activate(el.dataset.id, { focus: true });
});
tabsEl.addEventListener('auxclick', (e) => {
  const el = e.target.closest('.tab');
  if (el && e.button === 1) { e.preventDefault(); closeTab(el.dataset.id); }
});
tabsEl.addEventListener('dblclick', (e) => {
  if (Date.now() < suppressUntil || e.target.closest('.tab-close')) return;
  const el = e.target.closest('.tab');
  const tab = el && S.tabs.find((x) => x.id === el.dataset.id);
  if (tab) openRename(tab, { x: e.clientX, y: e.clientY });
});
// Keyboard in the tab strip: ← → go through the tabs, then + and Reopen; ↑ to the top bar, ↓ to the bar under
// the tabs. On a tab: Enter / Space open it (in its text), F2 or r renames, Delete (a Mac's delete key) or x closes,
// v makes it float.
// Anywhere in the strip (and in the bar under the tabs, see toolbar.js): n adds a tab, u reopens the last closed one.
const stripItems = () => [...tabsEl.querySelectorAll('.tab'), newBtn, $('btn-undo-close'), tabListBtn]
  .filter((e) => !e.disabled && !e.hidden);
$('tabbar').addEventListener('keydown', (e) => {
  const target = e.target instanceof Element ? e.target : null;
  if (!target || target.closest('.tab-close')) return;
  if (target.closest('#tab-list')) return; // the menu handles its own keys (it lives in this bar, not the strip)
  const el = target.closest('.tab');
  const tab = el && S.tabs.find((x) => x.id === el.dataset.id);
  if (floating) { floatKey(e); return; }
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
  const items = stripItems();
  const i = items.indexOf(el || target);
  const k = e.key.length === 1 || e.key === 'Dead' ? charKey(e) : e.key; // letters on every layout (keys.js)
  let next = null;
  if (k === 'ArrowRight') next = items[(i + 1) % items.length];
  else if (k === 'ArrowLeft') next = items[(i - 1 + items.length) % items.length];
  else if (k === 'Home') next = items[0];
  else if (k === 'End') next = items[items.length - 1];
  else if (k === 'ArrowUp') { e.preventDefault(); focusTopBar(); return; }
  else if (k === 'ArrowDown') { e.preventDefault(); focusFormatBar(); return; }
  else if (plain && (k === 'n' || k === 'u')) { e.preventDefault(); (k === 'n' ? addTab : reopenClosed)(); return; } // the new tab's text gets the focus
  else if (tab && (k === 'Enter' || k === ' ')) { e.preventDefault(); activate(tab.id, { focus: true }); return; } // opens it, in its text
  else if (tab && (k === 'F2' || (k === 'r' && plain))) { e.preventDefault(); openRename(tab); return; }
  // Delete closes it; on a Mac the key labelled "delete" is Backspace, so that one does there.
  else if (tab && (k === 'Delete' || (KEYS.mac && k === 'Backspace' && plain) || (k === 'x' && plain))) { e.preventDefault(); closeTab(tab.id); focusTab(S.activeId); return; }
  else if (tab && k === 'v' && plain && S.role === 'editor') { e.preventDefault(); startFloat(tab); return; }
  if (!next) return;
  e.preventDefault();
  if (next.classList.contains('tab')) { tabsEl.querySelectorAll('.tab').forEach((x) => { x.tabIndex = -1; }); next.tabIndex = 0; }
  next.focus();
});

// A floating tab (v): ← → move it one place, Enter (or v) drops it there, Esc puts it back. Leaving it drops it.
let floating = null; // { id, from }
let floatMoving = false;
function startFloat(tab) {
  floating = { id: tab.id, from: S.tabs.indexOf(tab) };
  tabsEl.querySelector(`.tab[data-id="${CSS.escape(tab.id)}"]`)?.classList.add('floating');
}
function moveFloating(to) {
  const i = S.tabs.findIndex((x) => x.id === floating.id);
  if (to < 0 || to >= S.tabs.length || to === i) return;
  const [t] = S.tabs.splice(i, 1);
  S.tabs.splice(to, 0, t);
  floatMoving = true;
  renderTabs();
  const el = tabsEl.querySelector(`.tab[data-id="${CSS.escape(floating.id)}"]`);
  el.classList.add('floating');
  el.tabIndex = 0;
  el.focus();
  floatMoving = false;
}
function endFloat(keep) {
  if (!floating) return;
  const { id, from } = floating;
  if (!keep) moveFloating(from);
  floating = null;
  renderTabs();
  if (keep) writeIndex();
  focusTab(id);
}
function floatKey(e) {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === 'Tab') { endFloat(true); return; }
  e.preventDefault();
  const i = S.tabs.findIndex((x) => x.id === floating.id);
  if (k === 'ArrowLeft') moveFloating(i - 1);
  else if (k === 'ArrowRight') moveFloating(i + 1);
  else if (k === 'Home') moveFloating(0);
  else if (k === 'End') moveFloating(S.tabs.length - 1);
  else if (k === 'Enter' || k === ' ' || k === 'v') endFloat(true);
  else if (k === 'Escape') endFloat(false);
}
tabsEl.addEventListener('focusout', () => { if (floating && !floatMoving) setTimeout(() => { if (floating && !tabsEl.contains(document.activeElement)) endFloat(true); }); });
// Shift+Cmd/Ctrl+, and Shift+Cmd/Ctrl+.: the previous / next tab, wrapping around. The focus stays where it was: in
// the text (of the new tab), on the tabs (the new tab), or elsewhere.
export function cycleTab(dir) {
  if (floating || !modal.hidden || S.tabs.length < 2) return;
  const i = S.tabs.findIndex((x) => x.id === S.activeId);
  const next = S.tabs[(i + dir + S.tabs.length) % S.tabs.length];
  const onTab = document.activeElement instanceof Element && !!document.activeElement.closest('#tabs .tab');
  activate(next.id, { focus: textHasFocus() });
  if (onTab) focusTab(next.id);
}
export function focusTab(id) { tabsEl.querySelector(`.tab[data-id="${CSS.escape(id)}"]`)?.focus(); }

tabsEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('.tab-close')) return;
  const el = e.target.closest('.tab');
  if (el) drag = { el, x: e.clientX, active: false, pid: e.pointerId };
});
window.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.pid) return;
  if (!drag.active) {
    if (Math.abs(e.clientX - drag.x) < 6) return;
    if (S.role !== 'editor') { drag = null; return; }
    drag.active = true;
    drag.el.classList.add('dragging');
    html.classList.add('tab-dragging');
  }
  const els = [...tabsEl.querySelectorAll('.tab')].filter((x) => x !== drag.el);
  const before = els.find((x) => { const r = x.getBoundingClientRect(); return e.clientX < r.left + r.width / 2; }) || null;
  if (drag.el.nextElementSibling !== before) tabsEl.insertBefore(drag.el, before);
  const sr = strip.getBoundingClientRect();
  if (e.clientX < sr.left + 30) strip.scrollLeft -= 12;
  else if (e.clientX > sr.right - 30) strip.scrollLeft += 12;
});
export function endDrag(commit) {
  if (!drag) return;
  if (drag.active) {
    suppressUntil = Date.now() + 400;
    drag.el.classList.remove('dragging');
    html.classList.remove('tab-dragging');
    if (commit) {
      const order = [...tabsEl.querySelectorAll('.tab')].map((x) => x.dataset.id);
      S.tabs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      writeIndex();
    }
    renderTabs();
  }
  drag = null;
}
window.addEventListener('pointerup', () => endDrag(true));
window.addEventListener('pointercancel', () => endDrag(false));

newBtn.addEventListener('click', addTab);

// ---------------------------------------------------------------- UI: rename modal
export const modal = $('modal');
export const renameInput = $('rename-input');
export const renamePreview = $('rename-preview');
export const renameError = $('rename-error');
export const renameOk = $('rename-ok');
export let renameTab = null;
export let renameReturnFocus = null;
export let renameOpenedAt = 0;
export let renameOpenPoint = null;

// ---------------------------------------------------------------- name from the first heading
// A tab that still has the name it was given ("Untitled 3") takes its name from the first heading of its
// text, so a note called "# Project plan" shows up as "Project plan" without being renamed by hand. The
// heading is cleaned like any tab name and made unique. Removing the heading gives the tab its original
// name back. Renaming by hand, or importing a file, ends this for that tab.
const FIRST_HEADING = /^[ \t]{0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
export function headingName(doc) {
  // Only the first non-blank line can name the tab, and only within the first few lines, so a heading
  // deep in a long note never renames anything.
  for (let n = 1; n <= Math.min(doc.lines, 20); n++) {
    const text = doc.line(n).text;
    if (!text.trim()) continue;
    const m = FIRST_HEADING.exec(text);
    return m ? cleanName(m[2]) : '';
  }
  return '';
}

export function autoName(tab) {
  // Not while that tab is being renamed by hand: the name in the dialog is about to settle it anyway.
  if (!tab || !tab.auto || tab.help || S.role !== 'editor' || renameTab === tab) return;
  const want = headingName(tab.state.doc) || tab.defaultName;
  const name = uniqueName(want, names(tab));
  if (name === tab.name) return;
  tab.name = name;
  renderTabs();
  updateToolbar();
  syncView(tab); // the editor's accessible name carries the tab's name
  markDirty(tab);
}

export function openRename(tab, point = null) {
  if (S.role !== 'editor' || tab.help || !modal.hidden) return;
  renameTab = tab;
  renameOpenedAt = Date.now();
  renameOpenPoint = point;
  renameReturnFocus = document.activeElement;
  modal.hidden = false;
  renameInput.value = tab.name;
  updateRenamePreview();
  renameInput.focus();
  renameInput.select();
}
export function updateRenamePreview() {
  const c = cleanName(renameInput.value);
  renameError.hidden = !!c;
  renamePreview.hidden = !c;
  renameOk.disabled = !c;
  if (c) renamePreview.textContent = t('renamePreview', { name: uniqueName(c, names(renameTab)) });
  renameInput.setAttribute('aria-invalid', String(!c));
}
export function closeRename() {
  modal.hidden = true;
  renameTab = null;
  renamePreview.textContent = '';
  const back = renameReturnFocus;
  if (back && document.contains(back) && !S.view.dom.contains(back)) back.focus({ preventScroll: true });
  else focusText(); // CodeMirror focuses without scrolling
}
export function confirmRename() {
  if (!renameTab) return;
  const c = cleanName(renameInput.value);
  if (!c) { updateRenamePreview(); renameInput.focus(); return; }
  const tab = renameTab;
  const name = uniqueName(c, names(tab));
  closeRename();
  tab.auto = false; // named by hand: the text no longer decides
  if (name !== tab.name) {
    tab.name = name;
    markDirty(tab);
    if (tab === activeTab()) syncView(tab);
    renderTabs();
  }
}
renameInput.addEventListener('input', updateRenamePreview);
modal.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); confirmRename(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeRename(); }
  else if (e.key === 'Tab') {
    const f = [...modal.querySelectorAll('input, button:not([disabled])')];
    const i = f.indexOf(document.activeElement);
    const n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i + 1) % f.length;
    e.preventDefault();
    f[n].focus();
  }
});
// A backdrop click cancels, except a trailing click of the gesture that just opened the modal.
modal.addEventListener('mousedown', (e) => {
  if (e.target !== modal) return;
  e.preventDefault();
  const p = renameOpenPoint;
  const trailing = p && Date.now() - renameOpenedAt < 500 && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 12;
  if (!trailing) closeRename();
});
renameOk.addEventListener('click', confirmRename);
$('rename-cancel').addEventListener('click', closeRename);
