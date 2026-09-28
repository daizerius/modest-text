// One editing window at a time (Web Locks, lease fallback), handover, live updates, autosave triggers.
import { K, P, TAB_PREFIX, store } from './storage.js';
import { $, LEASE_RENEW, LEASE_TTL, LOCK_NAME, S, activeTab, cic, html, t, windowId } from './state.js';
import { syncView } from './editor.js';
import { changedSinceExport, flushDirty, loadClosed, loadSettings, probe, saveTab, syncFromStorage, writeIndex } from './persist.js';
import { closeRename, modal } from './tabs.js';
import { toast } from './statusbar.js';
import { applyFonts, applyLang, applyTheme, closeFontList, renderAll, updateToolbar } from './toolbar.js';

export let lockMode = null; // 'weblock' | 'lease'

// ---------------------------------------------------------------- autosave triggers
window.addEventListener('blur', () => flushDirty());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushDirty();
  else if (lockMode === 'lease') leaseTick();
});
window.addEventListener('pagehide', () => {
  flushDirty();
  if (lockMode === 'lease' && S.role === 'editor') {
    const l = readLease();
    if (l && l.id === windowId) store.remove(K.lock);
  }
});
// Leaving with notes changed since the last Export All: the browser's own "Leave site?" box, the one thing
// a page may show while it closes (it can neither word the box nor offer anything in it). Only then, so a
// backed-up workspace closes without a question. The notes are saved either way (pagehide).
window.addEventListener('beforeunload', (e) => {
  if (!changedSinceExport()) return;
  e.preventDefault();
  e.returnValue = ''; // older browsers show the box only with this set
});
window.addEventListener('pageshow', (e) => {
  if (e.persisted && lockMode === 'lease') { S.role = 'pending'; startLease(); }
});

// ---------------------------------------------------------------- multiple windows
export let releaseWebLock = null;
export let liveTimer = null;
export let waitAbort = null;
export let leaseTimer = null;
export let takeoverTimer = null;

export function webLocksAvailable() {
  try { return !!(navigator.locks && typeof navigator.locks.request === 'function'); } catch { return false; }
}

// Resolves 'granted' | 'unavailable' | 'error'. A granted lock is held until released or stolen.
export function webLockRequest(opts) {
  return new Promise((resolve) => {
    let granted = false;
    try {
      navigator.locks.request(LOCK_NAME, opts, (lock) => {
        if (!lock) { resolve('unavailable'); return undefined; }
        granted = true;
        resolve('granted');
        return new Promise((rel) => { releaseWebLock = rel; });
      }).catch(() => {
        if (!granted) resolve('error');
        else if (releaseWebLock) { releaseWebLock = null; onLockLost(); } // stolen
      });
    } catch {
      resolve('error');
    }
  });
}

export function waitForWebLock() {
  try { waitAbort?.abort(); } catch { /* ignore */ }
  waitAbort = new AbortController();
  webLockRequest({ signal: waitAbort.signal }).then((r) => { if (r === 'granted') becomeEditor(true); });
}

export function startLocking() {
  if (!webLocksAvailable()) { startLease(); return; }
  webLockRequest({ ifAvailable: true }).then((r) => {
    if (r === 'error') { startLease(); return; }
    lockMode = 'weblock';
    html.dataset.lock = 'weblock';
    if (r === 'granted') becomeEditor(false);
    else { becomeReadOnly(); waitForWebLock(); }
  });
}

export function readLease() {
  const r = store.get(K.lock);
  if (r.error || !r.value) return null;
  try { const l = JSON.parse(r.value); return l && typeof l.id === 'string' ? l : null; } catch { return null; }
}
export const leaseFree = (l) => !l || l.id === windowId || Date.now() - Number(l.t || 0) > LEASE_TTL;
export function writeLease(id = windowId) { store.set(K.lock, JSON.stringify({ id, t: Date.now() })); }

export function tryLease(reload) {
  writeLease();
  setTimeout(() => {
    const l = readLease();
    if (l && l.id === windowId) becomeEditor(reload);
    else if (S.role === 'pending') becomeReadOnly();
  }, 120);
}

export function startLease() {
  lockMode = 'lease';
  html.dataset.lock = 'lease';
  if (leaseFree(readLease())) tryLease(false);
  else becomeReadOnly();
  clearInterval(leaseTimer);
  leaseTimer = setInterval(leaseTick, LEASE_RENEW);
}

export function leaseTick() {
  const l = readLease();
  if (S.role === 'editor') {
    if (l && l.id !== windowId && Date.now() - Number(l.t || 0) <= LEASE_TTL) onLockLost();
    else writeLease();
  } else if (S.role === 'readonly' && leaseFree(l)) tryLease(true);
}

export function onLeaseChange(v) {
  if (lockMode !== 'lease') return;
  let l = null;
  try { l = v ? JSON.parse(v) : null; } catch { l = null; }
  if (S.role === 'editor' && l && l.id !== windowId) onLockLost();
  else if (S.role === 'readonly') {
    if (l && l.id === windowId) becomeEditor(true);
    else if (!l) tryLease(true);
  }
}

export function onMessage(v) {
  let m = null;
  try { m = JSON.parse(v); } catch { return; }
  if (!m || m.from === windowId) return;
  if (m.type === 'takeover' && S.role === 'editor') handOver(m.from);
}

export function handOver(to) {
  flushDirty(); // write the last keystrokes before letting go
  if (lockMode === 'weblock') {
    const r = releaseWebLock;
    releaseWebLock = null;
    becomeReadOnly();
    r?.();
    waitForWebLock();
  } else {
    writeLease(to);
    becomeReadOnly();
  }
  toast(t('movedAway'), { kind: 'info' });
}

export function onLockLost() {
  if (S.role !== 'editor') return;
  flushDirty();
  becomeReadOnly();
  toast(t('movedAway'), { kind: 'info' });
  if (lockMode === 'weblock') waitForWebLock();
}

export function requestTakeover() {
  if (S.role === 'editor') return;
  store.set(K.msg, JSON.stringify({ type: 'takeover', from: windowId, n: Math.random() }));
  clearTimeout(takeoverTimer);
  takeoverTimer = setTimeout(() => {
    if (S.role === 'editor') return;
    if (lockMode === 'weblock') {
      try { waitAbort?.abort(); } catch { /* ignore */ }
      webLockRequest({ steal: true }).then((r) => { if (r === 'granted') becomeEditor(true); });
    } else {
      writeLease();
      becomeEditor(true);
    }
  }, 3000);
}
$('btn-edit-here').addEventListener('click', requestTakeover);

export function becomeEditor(reload) {
  // Once only: a lease check or lock request still pending from the read-only state must not reload the tabs
  // again (that would drop what was typed since taking over).
  if (S.role === 'editor') return;
  clearTimeout(takeoverTimer);
  clearTimeout(liveTimer); // a live sync queued while read-only must not overwrite new edits
  const wasPending = S.role === 'pending';
  S.role = 'editor';
  html.dataset.role = 'editor';
  if (reload && !wasPending) { loadClosed(); syncFromStorage(); lateSyncUntil = Date.now() + 3000; }
  if (S.firstLaunch) { S.firstLaunch = false; S.indexDirty = true; }
  for (const tab of S.tabs) if (tab.dirty) saveTab(tab);
  if (S.indexDirty || wasPending) writeIndex();
  syncView(activeTab());
  probe();
  renderAll();
  S.localEdit = false;
}
// The previous editor's last writes (its final save on handover or on closing) can become visible here only
// after this window got the lock: Firefox may grant a Web Lock before another process's localStorage writes
// arrive. For a few seconds after taking over, such late writes are applied as long as nothing was changed
// here yet; after that (or once something was changed) the revision check handles any difference.
let lateSyncUntil = 0;

export function becomeReadOnly() {
  clearTimeout(S.saveTimer);
  if (S.idleHandle) { cic(S.idleHandle); S.idleHandle = null; }
  S.savePending = false;
  S.role = 'readonly';
  html.dataset.role = 'readonly';
  closeFontList(false);
  if (!modal.hidden) closeRename();
  syncView(activeTab());
  renderAll();
}

window.addEventListener('storage', (e) => {
  const k = e.key;
  if (k === null) { if (S.role !== 'editor') syncFromStorage(); return; }
  if (!k.startsWith(P) || k === K.probe) return;
  if (e.newValue == null) store.sizes.delete(k); else store.sizes.set(k, k.length + e.newValue.length);
  if (k === K.msg) { onMessage(e.newValue); return; }
  if (k === K.lock) { onLeaseChange(e.newValue); return; }
  if (S.role === 'editor') {
    const late = Date.now() < lateSyncUntil && (k === K.index || k === K.closed || k.startsWith(TAB_PREFIX));
    if (late && !S.localEdit && !S.tabs.some((x) => x.dirty || x.failed)) {
      if (k === K.closed) { loadClosed(); updateToolbar(); } else syncFromStorage();
    }
    return;
  }
  if (k === K.settings) {
    loadSettings();
    applyTheme();
    applyFonts();
    applyLang();
  } else if (k === K.closed) {
    loadClosed();
    updateToolbar();
  } else if (k === K.index || k.startsWith(TAB_PREFIX)) {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { if (S.role !== 'editor') syncFromStorage(); }, 30);
  }
});
