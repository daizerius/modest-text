// Erase all local data: every key this app keeps under modest-text:v1:, after a warning, then a fresh start.
import { K, store } from './storage.js';
import { $, S, html, t, windowId } from './state.js';
import { exportAll } from './io.js';
import { toast, flash } from './statusbar.js';
import { helpView } from './helpview.js';
import { leaseTimer } from './windows.js';

const dialog = $('erase-dialog');
const ERASED = 'modest-text:erased'; // in sessionStorage, which erasing leaves alone: the toast after the reload

export function openErase() {
  // Only the editing window may: the other windows write nothing, and erasing under the editor would leave it
  // saving its copy of the notes back.
  if (S.role !== 'editor') { toast(t('eraseReadOnly'), { kind: 'info' }); return; }
  dialog.showModal();
}

// What the warning's choices did, in the middle of the window, where it cannot be missed.
const said = (msg) => flash(msg, '', 2500);

export function eraseAll() {
  // From here on this window writes nothing (every save checks the role), so nothing comes back on the way out,
  // and the page closes without the "Leave site?" box.
  S.role = 'erased';
  html.dataset.role = 'erased';
  clearInterval(leaseTimer);
  dialog.close();
  flash(t('eraseDoing'), '', 2000);
  // A second to read it, then the erasing; the lease, not renewed, outlasts it, so no other window takes over.
  setTimeout(eraseNow, 1000);
}
function eraseNow() {
  // The other windows first, before the lease disappears: one that took over now would save its copy again.
  store.set(K.msg, JSON.stringify({ type: 'erased', from: windowId, n: Math.random() }));
  for (const k of store.ownKeys()) store.remove(k);
  try { sessionStorage.setItem(ERASED, '1'); } catch { /* no toast then */ }
  location.reload();
}

helpView.addEventListener('click', (e) => { if (e.target.closest('[data-action="erase"]')) openErase(); });
// Each choice says what it did. The safe ones close the warning, so the toast is not under its backdrop.
$('erase-cancel').addEventListener('click', () => { dialog.close(); said(t('eraseCancelled')); });
$('erase-export').addEventListener('click', () => { dialog.close(); if (exportAll()) said(t('eraseExported')); });
try {
  if (sessionStorage.getItem(ERASED)) { sessionStorage.removeItem(ERASED); said(t('eraseDone')); }
} catch { /* storage blocked */ }
$('erase-ok').addEventListener('click', eraseAll);
