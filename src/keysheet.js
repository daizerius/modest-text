// The shortcut sheet (Cmd/Ctrl+/): every keyboard shortcut, in the platform's key names and the interface
// language, built from the same SHORTCUTS table as the tooltips and Help.
import { $, KEYS, t } from './state.js';

// One row per action: [label key, alternatives]. Each alternative is a list of keys that pairs up with
// the label, "Previous / next tab" -> [prevTab, nextTab], and is shown joined by " / "; the alternatives
// are joined by the language's "or" ("F2 or R"). A key is a SHORTCUTS name or a key spec; a string
// starting with '=' is a spec written out ("=F1"), and one starting with '#' a character typed as it is
// (the paired characters: "[" is not renamed after the layout's key). Every key sits in its own <kbd>.
// Every shortcut the app binds is listed here. When a binding is added, it belongs in this table and in
// the Help page's Keyboard section, so that nothing is reachable but undocumented.
function sections(mac) {
  const only = (cond, ...alts) => (cond ? alts : []);
  return [
    ['ksMove', [
      ['ksBars', [['bars']]],
      ['ksUpDown', [['=ArrowUp', '=ArrowDown']]],
      ['ksInBar', [['=ArrowLeft', '=ArrowRight']]],
      ['ksInBarEnds', [['=Home', '=End']]],
      ['ksGroups', [['=Tab', '=Shift-Tab']]],
      ['ksEsc', [['=Escape']]],
      ['ksTabOpen', [['Enter'], ['=Space']]],
      ['ksTabRename', [['=F2'], ['=R']]],
      // stripClose: Delete off a Mac, and on a Mac its delete key (⌫, which sends Backspace).
      ['ksTabClose', [['=X'], ['stripClose']]],
      ['ksTabMove', [['=V']]],
      ['ksTabNew', [['=N']]],
      ['ksTabReopen', [['=U']]],
      ['ksTabCloseKey', [['closeTabKey']]], ['ksTabReopenKey', [['reopenTabKey']]],
      ['ksTabNext', [['prevTab', 'nextTab'], ['prevTab2', 'nextTab2'], ...only(!mac, ['=Ctrl-PageUp', '=Ctrl-PageDown'])]],
    ]],
    ['ksFormat', [
      ['fmt_bold', [['bold']]], ['fmt_italic', [['italic']]], ['fmt_strike', [['strike']]], ['fmt_highlight', [['highlight']]],
      ['fmt_code', [['code']]], ['fmt_link', [['link']]], ['ksHeadings', [{ range: ['h1', 'h6'] }]],
      ['fmt_ul', [['ul'], ['ul2']]], ['fmt_ol', [['ol'], ['ol2']]], ['fmt_tasklist', [['tasklist'], ['tasklist2']]], ['fmt_quote', [['quote']]],
      ['fmt_codeblock', [['codeblock']]], ['fmt_hr', [['hr']]], ['ksTask', [['task']]], ['ksMode', [['mode']]],
    ]],
    ['ksFiles', [
      ['ksImport', [['importKey']]], ['ksExport', [['exportKey']]], ['ksExportAll', [['exportAllKey']]],
    ]],
    ['ksEdit', [
      // Off a Mac, Ctrl+Y is the name; Ctrl+Shift+Z is accepted too.
      ['hist_undo', [['undo']]], ['hist_redo', [['redo'], ...only(!mac, ['=Shift-Mod-z'])]],
      ['ksSave', [['Mod-s']]], ['ksFind', [['find']]],
      ['ksFindNext', [['findNext', 'findPrev'], ...only(!mac, ['=F3', '=Shift-F3'])]],
      ['ksLineMove', [['Alt-ArrowUp', 'Alt-ArrowDown']]], ['ksLineCopy', [['Shift-Alt-ArrowUp', 'Shift-Alt-ArrowDown']]],
      ['ksLineBelow', [['task']]], ['ksLineAbove', [['lineAbove']]], ['ksLineDelete', [['Shift-Mod-k']]], ['ksLineSelect', [['selectLine']]], ['ksIndent', [['Mod-]', 'Mod-[']]],
      ['ksPrint', [['Mod-p']]], ['ksSheet', [['keys']]],
      // Off a Mac, Ctrl+Shift+I is also the browsers' developer tools; the app claims it (main.js).
      ['helpTip', [['=F1'], ['help']]],
    ]],
    ['ksWrite', [
      ['ksTabKey', [['=Tab', '=Shift-Tab']]], ['ksEnterList', [['Enter']]], ['ksBackMark', [['=Backspace']]],
      ['ksPairs', [['#"'], ['#\u2018'], ['#('], ['#['], ['#{']]],
    ]],
  ];
}

const dialog = $('keys-dialog');
const body = $('keys-body');

// t.key() takes a SHORTCUTS name or a key spec, so a literal only needs its leading '=' removed. It also
// gives each platform its own names ("Return" on a Mac) and the interface language's ("Maj" in French).
const label = (k) => (k[0] === '#' ? k.slice(1) : t.key(k[0] === '=' ? k.slice(1) : k));

// The keys of one row: " / " inside an alternative, the language's "or" between alternatives.
function keyCell(alts) {
  const cell = document.createElement('td');
  const groups = alts.map((alt) => {
    const g = document.createElement('span');
    // { range: [first, last] }: "⌥⌘1 to ⌥⌘6", for a run too long to list (it broke the line).
    const keys = alt.range || alt;
    keys.forEach((key, i) => {
      if (i) g.append(alt.range ? ` ${t('ksTo')} ` : ' / ');
      const kbd = document.createElement('kbd');
      kbd.textContent = label(key);
      g.append(kbd);
    });
    return g;
  });
  const parts = new Intl.ListFormat(t.lang, { type: 'disjunction' }).formatToParts(groups.map((_, i) => String(i)));
  for (const p of parts) cell.append(p.type === 'element' ? groups[Number(p.value)] : p.value);
  return cell;
}

// One table (the key column lines up across sections), a heading row per section.
function build() {
  const table = document.createElement('table');
  for (const [title, rows] of sections(KEYS.mac)) {
    const hr = document.createElement('tr');
    const h = document.createElement('th');
    h.colSpan = 2;
    h.scope = 'colgroup';
    h.textContent = t(title);
    hr.append(h);
    table.append(hr);
    for (const [name, alts] of rows) {
      const tr = document.createElement('tr');
      const d = document.createElement('td');
      d.textContent = t(name);
      tr.append(keyCell(alts), d);
      table.append(tr);
    }
  }
  body.replaceChildren(table);
}

export function toggleKeySheet() {
  if (dialog.open) { dialog.close(); return; }
  build();
  dialog.showModal();
}
$('keys-ok').addEventListener('click', () => dialog.close());
