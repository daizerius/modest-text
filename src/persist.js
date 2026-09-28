// Saving to and loading from browser storage (autosave, revisions, conflicts, headroom probe).
import { uniqueName, withSuffix, nextDefaultName } from './text.js';
import { K, PROBE_CHARS, TAB_PREFIX, store } from './storage.js';
import { S, SIZES, activeTab, cic, names, ric, settings, t, textOf } from './state.js';
import { makeTab, replaceTabContent, syncView } from './editor.js';
import { renderTabs, showTab } from './tabs.js';
import { renderBanners, toast, updateAmber, updateStatus } from './statusbar.js';
import { renderAll } from './toolbar.js';

// ---------------------------------------------------------------- saving
export function markDirty(tab) {
  if (tab.help) return;
  tab.dirty = true;
  S.localEdit = true;
  if (S.role !== 'editor') return;
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(queueIdleSave, 500);
  updateStatus();
}

export function queueIdleSave() {
  S.saveTimer = null;
  S.savePending = true;
  if (S.idleHandle) cic(S.idleHandle);
  S.idleHandle = ric(() => { S.idleHandle = null; flushDirty(); });
  updateStatus();
}

export function parseRev(v) {
  const m = /^\{"rev":(\d+)/.exec(v.slice(0, 40));
  return m ? Number(m[1]) : null;
}

export function saveTab(tab) {
  if (S.role !== 'editor' || tab.help) return true;
  const key = K.tab(tab.id);
  const cur = store.get(key);
  if (!cur.error && cur.value != null) {
    const storedRev = parseRev(cur.value);
    if (storedRev !== null && storedRev !== tab.rev) {
      handleConflict(tab, cur.value);
      return true;
    }
  }
  const rev = tab.rev + 1;
  const now = Date.now();
  const value = JSON.stringify({ rev, name: tab.name, mode: tab.mode, saved: now, content: textOf(tab), auto: tab.auto, def: tab.defaultName });
  const r = store.set(key, value);
  if (r.ok) {
    tab.rev = rev;
    tab.savedAt = now;
    tab.dirty = false;
    tab.failed = false;
    return true;
  }
  tab.failed = true;
  if (r.quota && !S.full) { S.full = true; renderBanners(); }
  return false;
}

export function writeIndex() {
  if (S.role !== 'editor' || S.indexReadFailed) return;
  S.localEdit = true;
  const order = S.tabs.filter((x) => !x.help).map((x) => x.id).concat(S.brokenIds);
  const act = activeTab();
  let active = act && !act.help ? act.id : S.lastRealActive;
  if (!order.includes(active)) active = order[0] || null;
  const r = store.set(K.index, JSON.stringify({ order, active }));
  S.indexDirty = !r.ok;
  S.indexFailed = !r.ok;
  if (!r.ok && r.quota && !S.full) { S.full = true; renderBanners(); }
}

export function writeSettings() {
  if (S.role !== 'editor') return;
  store.set(K.settings, JSON.stringify(settings));
}

// { id: [top, left] } for every tab, written on a long debounce and whenever the workspace is flushed.
// Scrolling is not an edit, so it never marks a tab unsaved; keeping the positions out of the tab records
// means a scroll never rewrites the text either.
let scrollTimer = null, scrollWritten = null;
export function writeScroll() {
  clearTimeout(scrollTimer);
  scrollTimer = null;
  if (S.role !== 'editor' || S.full) return;
  const out = {};
  for (const tab of S.tabs) {
    if (tab.help) continue;
    const top = Math.round(tab.scrollTop) || 0, left = Math.round(tab.scrollLeft) || 0;
    if (top || left) out[tab.id] = left ? [top, left] : [top];
  }
  const value = JSON.stringify(out);
  if (value === scrollWritten) return; // nothing moved since the last write: typing must not rewrite this key
  if (store.set(K.scroll, value).ok) scrollWritten = value;
}
export function scheduleScroll() {
  if (scrollTimer || S.role !== 'editor') return;
  scrollTimer = setTimeout(writeScroll, 1000);
}
export function loadScroll() {
  const r = store.get(K.scroll);
  if (r.error || r.value == null) return;
  try {
    const m = JSON.parse(r.value);
    for (const tab of S.tabs) {
      const v = m && m[tab.id];
      if (Array.isArray(v)) { tab.scrollTop = Number(v[0]) || 0; tab.scrollLeft = Number(v[1]) || 0; }
    }
  } catch { /* a corrupt key only costs the scroll positions */ }
}

export function writeClosed() {
  if (S.role !== 'editor' || S.full) return; // while full, the stack stays in memory only
  store.set(K.closed, JSON.stringify(S.closedStack.map(({ name, mode, content, pos, auto, def }) => ({ name, mode, content, pos, auto, def }))));
}

export function flushDirty() {
  clearTimeout(S.saveTimer);
  S.saveTimer = null;
  if (S.idleHandle) { cic(S.idleHandle); S.idleHandle = null; }
  S.savePending = false;
  if (S.role !== 'editor') { updateStatus(); return; }
  for (const tab of [...S.tabs]) if (tab.dirty || tab.failed) saveTab(tab);
  if (S.indexDirty || S.indexFailed) writeIndex();
  writeScroll(); // leaving the page (or the tab) keeps where each note was scrolled to
  afterSaves();
  updateStatus();
}

// After Cmd/Ctrl+S: is every note really in storage? The tab in view is read back and compared with its
// text; the others must have no pending or failed save. 'readonly' in a window that does not edit.
export function allSaved() {
  if (S.role !== 'editor') return 'readonly';
  if (S.tabs.some((x) => !x.help && (x.dirty || x.failed)) || S.indexFailed) return false;
  const tab = activeTab();
  if (!tab || tab.help) return true;
  const r = store.get(K.tab(tab.id));
  if (r.error || r.value == null) return false;
  try { return JSON.parse(r.value).content === textOf(tab); } catch { return false; }
}

// Export All is the backup: when it last ran, and whether any note changed since.
export function loadLastExport() {
  const r = store.get(K.lastExport);
  S.lastExport = !r.error && r.value ? Number(r.value) || 0 : 0;
}
export function changedSinceExport() {
  if (S.role !== 'editor') return false;
  const since = S.lastExport || 0;
  return S.tabs.some((x) => !x.help && textOf(x) !== '' && (x.dirty || x.failed || (x.savedAt || 0) > since));
}

export function afterSaves() {
  const pending = S.tabs.some((x) => x.failed || x.dirty) || S.indexFailed;
  if (S.full && !pending) {
    S.full = false;
    renderBanners();
    toast(t('recovered'), { kind: 'ok' });
    probe();
  } else if (Date.now() - S.lastProbe > 60000) probe();
  updateAmber();
}

export function probe() {
  S.lastProbe = Date.now();
  const r = store.set(K.probe, 'x'.repeat(PROBE_CHARS));
  store.remove(K.probe);
  S.probeFailed = !r.ok && r.quota;
  updateAmber();
}

export function fits(chars) {
  const r = store.set(K.probe, 'x'.repeat(Math.max(0, chars - K.probe.length)));
  store.remove(K.probe);
  return r.ok || !r.quota;
}

export function handleConflict(tab, storedValue) {
  let rec = null;
  try { rec = validRecord(JSON.parse(storedValue)); } catch { rec = null; }
  const copy = makeTab({ name: uniqueName(withSuffix(tab.name, t('conflictSuffix')), names()), mode: tab.mode, content: textOf(tab) });
  S.tabs.splice(S.tabs.indexOf(tab) + 1, 0, copy);
  copy.dirty = true;
  if (rec) {
    tab.name = rec.name;
    tab.mode = rec.mode;
    tab.rev = rec.rev;
    tab.savedAt = rec.saved;
    replaceTabContent(tab, rec.content);
    if (tab === activeTab()) syncView(tab);
  } else {
    tab.rev = parseRev(storedValue) ?? tab.rev;
  }
  tab.dirty = false;
  tab.failed = false;
  saveTab(copy);
  writeIndex();
  renderTabs();
  toast(t('conflict', { name: tab.name, copy: copy.name }), { kind: 'warn', timeout: 12000 });
}

// ---------------------------------------------------------------- loading
export function validRecord(r) {
  if (!r || typeof r !== 'object' || typeof r.content !== 'string' || typeof r.name !== 'string') return null;
  return {
    rev: Number.isFinite(r.rev) ? r.rev : 0,
    name: r.name || 'Untitled',
    mode: r.mode === 'md' ? 'md' : 'plain',
    saved: Number.isFinite(r.saved) ? r.saved : null,
    content: r.content,
  };
}

export function loadWorkspace() {
  const idx = store.get(K.index);
  let index = null;
  if (!idx.error && idx.value != null) {
    try {
      const v = JSON.parse(idx.value);
      if (v && Array.isArray(v.order)) index = v;
    } catch { /* corrupt index: recover from tab keys */ }
  }
  const keys = store.ownKeys();
  const loaded = new Map();
  const broken = [];
  store.sizes.clear();
  for (const k of keys) {
    if (k === K.probe) continue;
    const r = store.get(k);
    if (!r.error && r.value != null) store.sizes.set(k, k.length + r.value.length);
    if (!k.startsWith(TAB_PREFIX)) continue;
    const id = k.slice(TAB_PREFIX.length);
    let rec = null;
    if (!r.error && r.value != null) { try { rec = validRecord(JSON.parse(r.value)); } catch { rec = null; } }
    if (rec) loaded.set(id, rec); else broken.push(id); // never overwritten: kept in the index
  }
  const order = [];
  if (index) for (const id of index.order) if (typeof id === 'string' && loaded.has(id) && !order.includes(id)) order.push(id);
  for (const id of [...loaded.keys()].sort()) if (!order.includes(id)) order.push(id);
  const first = !idx.error && idx.value == null && keys.every((k) => !k.startsWith(TAB_PREFIX) && k !== K.closed);
  return { order, loaded, broken, active: index && index.active, first, indexError: !!idx.error };
}

export function tabFromRecord(id, rec) {
  const tab = makeTab({ id, name: rec.name, mode: rec.mode, content: rec.content, rev: rec.rev, savedAt: rec.saved, auto: rec.auto === true });
  if (typeof rec.def === 'string' && rec.def) tab.defaultName = rec.def; // the name to go back to with no heading
  return tab;
}

export function loadSettings() {
  const r = store.get(K.settings);
  if (r.error || r.value == null) return;
  try {
    const s = JSON.parse(r.value);
    if (s.theme === 'dark' || s.theme === 'light') settings.theme = s.theme;
    if (s.lang === 'en' || s.lang === 'fr') settings.lang = s.lang;
    if (typeof s.mdFont === 'string') settings.mdFont = s.mdFont;
    if (typeof s.monoFont === 'string') settings.monoFont = s.monoFont;
    if (SIZES.some(([, px]) => px === s.size)) settings.size = s.size;
    if (typeof s.wrap === 'boolean') settings.wrap = s.wrap;
    if (typeof s.read === 'boolean') settings.read = s.read;
  } catch { /* keep defaults; the key is not rewritten until a setting changes */ }
}

export function loadClosed() {
  const r = store.get(K.closed);
  if (r.error || r.value == null) return;
  try {
    const v = JSON.parse(r.value);
    if (Array.isArray(v)) {
      S.closedStack = v.filter((e) => e && typeof e.content === 'string' && typeof e.name === 'string').slice(-3)
        .map((e) => ({ name: e.name, mode: e.mode === 'md' ? 'md' : 'plain', content: e.content, pos: Number(e.pos) || 0 }));
    }
  } catch { /* ignore */ }
}

// Rebuild tabs from storage, reusing tab objects (and their history) when possible.
export function syncFromStorage() {
  const ws = loadWorkspace();
  const byId = new Map(S.tabs.map((x) => [x.id, x]));
  const next = [];
  for (const id of ws.order) {
    const rec = ws.loaded.get(id);
    let tab = byId.get(id);
    if (tab) {
      tab.name = rec.name;
      tab.mode = rec.mode;
      tab.rev = rec.rev;
      tab.savedAt = rec.saved;
      tab.dirty = false;
      tab.failed = false;
      if (textOf(tab) !== rec.content) replaceTabContent(tab, rec.content);
    } else tab = tabFromRecord(id, rec);
    next.push(tab);
  }
  const help = S.tabs.find((x) => x.help);
  if (help) next.splice(Math.min(S.tabs.indexOf(help), next.length), 0, help);
  S.brokenIds = ws.broken;
  S.indexReadFailed = ws.indexError;
  S.tabs = next;
  if (!S.tabs.length) { const f = makeTab({ name: nextDefaultName(t('untitled'), []) }); f.dirty = true; S.tabs.push(f); }
  if (!activeTab()) {
    const want = S.tabs.find((x) => x.id === ws.active) || S.tabs[0];
    showTab(want);
  } else syncView(activeTab());
  renderAll();
}
