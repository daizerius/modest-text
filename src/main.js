// Modest Text — application entry point: printing, global keys, startup.
import { EditorView } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';
import { makeT, helpText } from './i18n.js';
import { nextDefaultName } from './text.js';
import { detectFonts } from './fonts.js';
import { $, KEYS, S, activeTab, html, isMac, setT, settings, t } from './state.js';
import { makeTab } from './editor.js';
import { allSaved, flushDirty, loadClosed, loadLastExport, loadScroll, loadSettings, loadWorkspace, probe, scheduleScroll, tabFromRecord } from './persist.js';
import { closeTab, cycleTab, modal, openHelp, reopenClosed, restoreScroll, toggleMode } from './tabs.js';
import { exportActive, exportAll, fileInput } from './io.js';
import { flash, toast } from './statusbar.js';
import { applyFonts, applyLang, applyTheme, fitTopbar, renderAll, toggleBars } from './toolbar.js';
import { startLocking } from './windows.js';
import { openFind, findGo, findOpen } from './find.js';
import { toggleKeySheet } from './keysheet.js';
import { charKey, physKey, loadLayout } from './keys.js';
import { focusText, showHelpView } from './helpview.js';
// Every module registers its own event listeners: load them all.
import './storage.js';
import './state.js';
import './editor.js';
import './persist.js';
import './tabs.js';
import './statusbar.js';
import './toolbar.js';
import './io.js';
import './windows.js';
import './find.js';
import './keysheet.js';

let storageOk = true;

// ---------------------------------------------------------------- printing
// Not supported (CodeMirror only lays out the visible part of a note): Cmd/Ctrl+P explains, and a print from
// the browser menu produces a page that says so (see @media print).
const printDialog = $('print-dialog');
$('print-ok').addEventListener('click', () => printDialog.close());
printDialog.addEventListener('close', () => { if (S.view && !document.activeElement?.closest('#topbar, #tabbar, #formatbar, #statusbar')) focusText(); });

// ---------------------------------------------------------------- keyboard
window.addEventListener('keydown', (e) => {
  const k = charKey(e); // a Latin letter as printed, else the key's position (Russian, Greek, dead keys…)
  // Punctuation shortcuts go by the key's physical position, so they are the same keys on every layout.
  const p = physKey(e);
  const mod = isMac ? e.metaKey : e.ctrlKey;
  // Files, from anywhere, as Open / Save As / Save All: Cmd/Ctrl+O imports, Shift+Cmd/Ctrl+S exports the tab
  // in view, Option+Cmd+S (Alt+Shift+S off a Mac, since Ctrl+Alt is AltGr there) exports all. Claimed
  // in every state, so the browser's own Open / Save Page / screenshot never answers instead.
  const dialogUp = !modal.hidden || printDialog.open;
  if (mod && !e.altKey && !e.shiftKey && k === 'o') {
    e.preventDefault();
    if (!dialogUp && S.role === 'editor') fileInput.click();
    return;
  }
  if (mod && e.shiftKey && !e.altKey && k === 's') {
    e.preventDefault();
    if (!dialogUp && !$('btn-export').disabled) exportActive();
    return;
  }
  if (isMac ? e.metaKey && e.altKey && !e.shiftKey && !e.ctrlKey && k === 's' : e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && k === 's') {
    e.preventDefault();
    if (!dialogUp) exportAll();
    return;
  }
  // Close the tab in view / reopen the last closed one, from anywhere: Control+Cmd+W / U on a Mac, next to
  // Control+Cmd+, and . for the tabs; Alt+W / U elsewhere (no browser menu uses those letters). Cmd/Ctrl+W
  // and Shift+Cmd/Ctrl+T cannot be had: the browsers keep them.
  const tabKeys = isMac ? e.metaKey && e.ctrlKey && !e.altKey && !e.shiftKey : e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
  if (tabKeys && (k === 'w' || k === 'u')) {
    e.preventDefault();
    if (!dialogUp && S.role === 'editor' && !document.querySelector('dialog[open]')) {
      if (k === 'w') { if (S.activeId) closeTab(S.activeId); } else reopenClosed();
      focusText();
    }
    return;
  }
  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && k === 's') {
    e.preventDefault();
    flushDirty();
    // Say what happened, having checked it: people expect Cmd/Ctrl+S to save the page as a file. On a
    // failure nothing is claimed; the status bar and the red banner already say it.
    const ok = allSaved();
    if (ok === 'readonly') flash(t('savedReadOnly'));
    else if (ok) flash(t('savedFlash'), t('savedFlashHint'));
    return;
  }
  // Cmd/Ctrl+J: to the bar under the tabs (arrows inside, ↑ to the tabs) and back to the text.
  if (mod && !e.altKey && !e.shiftKey && k === 'j') {
    e.preventDefault();
    if (modal.hidden && !printDialog.open) toggleBars();
    return;
  }
  // Cmd/Ctrl+F: find in this tab; Cmd/Ctrl+G, Shift+Cmd/Ctrl+G: next / previous match.
  if (mod && !e.altKey && !e.shiftKey && k === 'f') {
    if (activeTab()?.help) return; // Help is a plain page: the browser's own find sees all of it
    e.preventDefault();
    if (modal.hidden && !printDialog.open) openFind();
    return;
  }
  // With the find bar closed this opens it rather than letting the key through: a shortcut that the page
  // swallows only sometimes is worse than one it never takes, because the browser's own Find Again
  // appears on the first press and not on the rest.
  if (mod && !e.altKey && k === 'g') {
    if (activeTab()?.help) return; // Help is a plain page: the browser's own find sees all of it
    e.preventDefault();
    if (!modal.hidden || printDialog.open) return;
    if (findOpen()) findGo(e.shiftKey ? -1 : 1); else openFind();
    return;
  }
  // F3 / Shift+F3: next / previous match, the Windows convention. With the find bar closed, F3 opens it.
  if (k === 'f3' && !e.altKey && !e.ctrlKey && !e.metaKey) {
    if (activeTab()?.help) return;
    e.preventDefault();
    if (!modal.hidden || printDialog.open) return;
    if (findOpen()) findGo(e.shiftKey ? -1 : 1); else openFind();
    return;
  }
  // Previous / next tab, from anywhere: Shift+Cmd+, and . (Ctrl+Shift on Windows), or Ctrl+Cmd+, and . (Ctrl+,
  // and . on Windows). The two keys right of M on a US keyboard, whatever they print elsewhere. Also
  // Ctrl+PageUp / Ctrl+PageDown off a Mac, which is what browsers and editors use there. Never with Option / Alt.
  const shiftTab = isMac ? e.metaKey && e.shiftKey && !e.ctrlKey : e.ctrlKey && e.shiftKey && !e.metaKey;
  const ctrlTab = isMac ? e.metaKey && e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (!e.altKey && (shiftTab || ctrlTab)) {
    const dir = p === ',' ? -1 : p === '.' ? 1 : 0;
    if (dir) {
      e.preventDefault();
      if (!document.querySelector('dialog[open]')) cycleTab(dir); // not under the print or shortcut dialog
      return;
    }
  }
  if (!isMac && e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (k === 'pageup' || k === 'pagedown')) {
    e.preventDefault();
    if (!document.querySelector('dialog[open]')) cycleTab(k === 'pageup' ? -1 : 1);
    return;
  }
  // Cmd/Ctrl+/: the shortcut sheet, on the key right of the two above.
  if (mod && !e.altKey && p === '/') {
    e.preventDefault();
    if (modal.hidden && !printDialog.open) toggleKeySheet();
    return;
  }
  // F1, and Shift+Cmd/Ctrl+I ("info"): the Help tab, on every platform. Off a Mac, Ctrl+Shift+I is also
  // the browsers' developer tools: the app claims it all the same, and whether a browser lets a page have
  // it is for a test on Windows to show (qa-checklist.md, §7.6).
  if ((k === 'f1' && !mod && !e.ctrlKey && !e.altKey && !e.shiftKey) || (mod && e.shiftKey && !e.altKey && k === 'i')) {
    e.preventDefault();
    if (modal.hidden && !printDialog.open) openHelp();
    return;
  }
  // Shift+Cmd/Ctrl+M: plain text <-> Markdown (the active tab), from anywhere.
  if (mod && e.shiftKey && !e.altKey && k === 'm') {
    e.preventDefault();
    if (modal.hidden && !printDialog.open) toggleMode();
    return;
  }
  // Cmd+L on a Mac selects the line (the editor's keymap does it in the text). Claimed everywhere, so the
  // address bar never answers the first press and the app the next: in this app Cmd+L is not the URL.
  if (isMac && e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && k === 'l') {
    if (!(S.view && e.target instanceof Node && S.view.dom.contains(e.target))) e.preventDefault();
    return;
  }
  // Cmd/Ctrl+U does nothing here (no page source, no CodeMirror selection undo).
  if (mod && !e.altKey && k === 'u') {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (mod && !e.altKey && !e.shiftKey && k === 'p') {
    e.preventDefault();
    if (!printDialog.open) printDialog.showModal();
    return;
  }
  if (!modal.hidden || !S.view) return;
  const target = e.target instanceof Element ? e.target : null;
  if (target && (S.view.dom.contains(target) || target.closest('input, select, textarea, [role=listbox], [role=menu]'))) return;
  if (mod && !e.altKey && k === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)(S.view); }
  else if ((mod || e.ctrlKey) && !e.altKey && k === 'y') { e.preventDefault(); redo(S.view); }
}, true);

// ---------------------------------------------------------------- startup
$('btn-help').addEventListener('click', openHelp);
$('btn-undo-close').addEventListener('click', reopenClosed);

$('btn-md').addEventListener('click', toggleMode);


function init() {
  try { void localStorage.length; } catch { storageOk = false; }
  loadSettings();
  S.installed = detectFonts();
  S.lang = settings.lang || (/^fr\b/i.test(navigator.language || '') ? 'fr' : 'en');
  setT(makeT(S.lang, KEYS));
  applyTheme();

  const ws = loadWorkspace();
  S.indexReadFailed = ws.indexError;
  S.brokenIds = ws.broken;
  S.firstLaunch = ws.first;
  S.tabs = ws.order.map((id) => tabFromRecord(id, ws.loaded.get(id)));
  loadClosed();
  loadLastExport();
  loadScroll();
  if (S.firstLaunch) {
    S.tabs.push(makeTab({ id: 'help', name: t('help'), mode: 'md', content: helpText(S.lang, KEYS), help: true }));
  } else if (!S.tabs.length) {
    const f = makeTab({ name: nextDefaultName(t('untitled'), []) });
    f.dirty = true;
    S.tabs.push(f);
  }
  const first = S.tabs.find((x) => x.id === ws.active) || (S.firstLaunch ? S.tabs[S.tabs.length - 1] : S.tabs[0]);
  S.activeId = first.id;
  if (!first.help) S.lastRealActive = first.id;
  S.view = new EditorView({ state: first.state, parent: $('editor') });
  // Where the active tab is scrolled to, kept on the tab as it scrolls rather than read at save time, so
  // that saving never forces a layout while typing. Switching tabs records it too (see activate).
  let scrollFrame = 0;
  S.view.scrollDOM.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      const tab = activeTab();
      if (!tab || tab.help) return;
      tab.scrollTop = S.view.scrollDOM.scrollTop;
      tab.scrollLeft = S.view.scrollDOM.scrollLeft;
      scheduleScroll();
    });
  }, { passive: true });
  // Read-only handle for the automated tests (instead of CodeMirror's private DOM properties).
  Object.defineProperty($('editor'), 'mtView', { get: () => S.view });
  applyFonts();
  applyLang();
  showHelpView(!!first.help); // first launch: the Help page, in place of the editor
  fitTopbar();
  if (!storageOk) toast(t('storageUnavailable'), { kind: 'error', timeout: 0 });
  probe();
  renderAll();
  restoreScroll(first); // a long note reopens where it was left
  // Chromium can say what this keyboard prints on the punctuation keys; when it differs from US, the
  // tooltips and the shortcut sheet are rewritten with the keys the user actually has.
  loadLayout(() => { applyLang(); });
  startLocking();
  // Ask the browser to keep this page's storage — the notes — when disk space runs low. Chrome decides
  // by itself, Firefox asks the user once, Safari applies its own rules (its 7-day cap on sites not
  // opened is a separate matter: Help tells Safari users to open the app weekly and keep a backup).
  try { navigator.storage?.persisted?.().then((kept) => kept || navigator.storage.persist()).catch(() => {}); } catch { /* not offered */ }
  html.dataset.ready = '1';
}

init();
