// Erase all local data: every key this app keeps under modest-text:v1:, after a warning, then a fresh start.
import { K, store } from './storage.js';
import { $, S, html, t, windowId } from './state.js';
import { exportAll } from './io.js';
import { toast } from './statusbar.js';
import { helpView } from './helpview.js';
import { leaseTimer } from './windows.js';

const dialog = $('erase-dialog');

export function openErase() {
  // Only the editing window may: the other windows write nothing, and erasing under the editor would leave it
  // saving its copy of the notes back.
  if (S.role !== 'editor') { toast(t('eraseReadOnly'), { kind: 'info' }); return; }
  dialog.showModal();
}

export function eraseAll() {
  // From here on this window writes nothing (every save checks the role), so nothing comes back on the way out,
  // and the page closes without the "Leave site?" box.
  S.role = 'erased';
  html.dataset.role = 'erased';
  clearInterval(leaseTimer);
  // The other windows first, before the lease disappears: one that took over now would save its copy again.
  store.set(K.msg, JSON.stringify({ type: 'erased', from: windowId, n: Math.random() }));
  for (const k of store.ownKeys()) store.remove(k);
  location.reload();
}

helpView.addEventListener('click', (e) => { if (e.target.closest('[data-action="erase"]')) openErase(); });
$('erase-cancel').addEventListener('click', () => dialog.close());
$('erase-export').addEventListener('click', exportAll);
$('erase-ok').addEventListener('click', eraseAll);
