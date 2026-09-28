// Export, Export All (ZIP) and Import (picker and drag-and-drop).
import { cleanName, uniqueName, nextDefaultName, exportFileName, dedupeFileNames, prepareImport, zipStamp, MAX_IMPORT_BYTES } from './text.js';
import { makeZip } from './zip.js';
import { K, WARN_CHARS, store } from './storage.js';
import { $, S, activeTab, names, t, textOf } from './state.js';
import { makeTab } from './editor.js';
import { fits, saveTab, writeIndex } from './persist.js';
import { activate, autoName, renderTabs } from './tabs.js';
import { renderBanners, toast, updateAmber, updateStatus } from './statusbar.js';
import { updateFileTips, updateToolbar } from './toolbar.js';

// ---------------------------------------------------------------- export / import
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function exportActive() {
  const tab = activeTab();
  if (!tab) return;
  autoName(tab); // a heading typed less than a pause ago names the file too
  download(new Blob([new TextEncoder().encode(textOf(tab))], { type: 'application/octet-stream' }), exportFileName(tab.name, tab.mode === 'md'));
}

export function exportAll() {
  S.tabs.forEach(autoName);
  const list = S.tabs.filter((x) => !x.help).map((x) => ({ tab: x, text: textOf(x) })).filter((x) => x.text !== '');
  if (!list.length) { toast(t('nothingToExport')); return; }
  const enc = new TextEncoder();
  const fileNames = dedupeFileNames(list.map((x) => exportFileName(x.tab.name, x.tab.mode === 'md')));
  const now = new Date();
  const zip = makeZip(list.map((x, i) => ({ name: fileNames[i], data: enc.encode(x.text) })), now);
  download(zip, `modest-text_${zipStamp(now)}.zip`);
  S.lastExport = now.getTime(); // the backup: remembered for the Export All tooltip and for leaving the page
  if (S.role === 'editor') store.set(K.lastExport, String(S.lastExport));
  updateFileTips();
  updateStatus(); // the status bar shows when the last full export ran
}

export async function importFiles(fileList) {
  if (S.role !== 'editor') return;
  const files = [...fileList].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const skip = { size: 0, type: 0, binary: 0, space: 0 };
  const created = [];
  const usageBefore = store.usage();
  for (const f of files) {
    if (!/\.(txt|md)$/i.test(f.name)) { skip.type++; continue; }
    if (f.size > MAX_IMPORT_BYTES) { skip.size++; continue; }
    let bytes;
    try { bytes = new Uint8Array(await f.arrayBuffer()); } catch { skip.binary++; continue; }
    const r = prepareImport(f.name, bytes);
    if (!r.ok) { skip[r.reason]++; continue; }
    const name = uniqueName(cleanName(r.name) || nextDefaultName(t('untitled'), names()), names());
    const tab = makeTab({ name, mode: r.markdown ? 'md' : 'plain', content: r.text });
    const need = K.tab(tab.id).length + JSON.stringify({ rev: 1, name, mode: tab.mode, saved: Date.now(), content: r.text }).length;
    if (!fits(need)) { skip.space++; continue; }
    S.tabs.push(tab);
    tab.dirty = true;
    if (!saveTab(tab)) { S.tabs.pop(); skip.space++; if (S.full) { S.full = false; renderBanners(); } continue; }
    created.push(tab);
  }
  if (created.length) { activate(created[0].id, { focus: true }); writeIndex(); }
  const nSkipped = skip.size + skip.type + skip.binary + skip.space;
  let msg = t('imported', { n: created.length });
  if (nSkipped) {
    const parts = [];
    if (skip.size) parts.push(t('skipSize', { n: skip.size }));
    if (skip.type) parts.push(t('skipType', { n: skip.type }));
    if (skip.binary) parts.push(t('skipBinary', { n: skip.binary }));
    if (skip.space) parts.push(t('skipSpace', { n: skip.space }));
    msg += ` · ${t('skipped', { n: nSkipped })} (${parts.join(', ')})`;
  }
  toast(msg, { kind: nSkipped ? 'warn' : 'info', timeout: 10000 });
  const usageAfter = store.usage();
  if (usageAfter > WARN_CHARS && usageBefore <= WARN_CHARS + (created.length ? 0 : Infinity)) toast(t('importWarn'), { kind: 'warn', timeout: 12000 });
  updateAmber();
  renderTabs();
  updateToolbar();
}

$('btn-export').addEventListener('click', exportActive);
$('btn-export-all').addEventListener('click', exportAll);
$('banner-export-all').addEventListener('click', exportAll);
$('st-storage').addEventListener('click', exportAll);
export const fileInput = $('file-input');
$('btn-import').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const files = [...fileInput.files];
  fileInput.value = '';
  await importFiles(files);
});

export const dropOverlay = $('drop-overlay');
export const hasFiles = (e) => !!e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
window.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = S.role === 'editor' ? 'copy' : 'none';
  if (S.role === 'editor') dropOverlay.hidden = false;
}, true);
window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) dropOverlay.hidden = true; });
window.addEventListener('drop', (e) => {
  dropOverlay.hidden = true;
  if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
  e.preventDefault();
  e.stopPropagation();
  importFiles(e.dataTransfer.files);
}, true);
