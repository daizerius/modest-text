// The settings panel (the sliders in the top bar; Option+Cmd+, on a Mac, Alt+, elsewhere): every setting in one place,
// over the note, so that each change shows on the text at once. A change applies and is saved at once: there is
// no OK button. The top bar keeps its quick controls; this is their full home and adds what the bar has no room
// for. It works in a read-only window too: the editing window takes the change up (windows.js).
import { FONT_GROUPS } from './fonts.js';
import { store } from './storage.js';
import { $, S, SIZES, settings, t } from './state.js';
import { formatStamp } from './text.js';
import { writeSettings } from './persist.js';
import { exportAll } from './io.js';
import { openErase } from './erase.js';
import { applyFonts, applyLang, applyTheme, effectiveFont, fadeTheme, updateToolbar } from './toolbar.js';

const dialog = $('prefs-dialog');
const body = $('prefs-body');
let builtLang = null;
let kept = null; // navigator.storage.persisted(): true / false, null while unknown

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// A labelled row: the label on the left, the control on the right.
function row(label, control) {
  const r = el('div', 'prefs-row');
  const l = el('label', 'prefs-label', label);
  if (!control.id) control.id = 'prefs-' + Math.random().toString(36).slice(2, 8);
  l.htmlFor = control.id;
  r.append(l, control.closest('.size-picker') || control);
  return r;
}
// A select drawn as the top bar's size menu (WebKit ignores a native select's border-radius), with its caret.
function select(id, options, onChange) {
  const s = el('select', 'btn select');
  s.id = id;
  for (const o of options) {
    if (o.group) { const g = document.createElement('optgroup'); g.label = o.group; s.append(g); continue; }
    const opt = el('option', null, o.label);
    opt.value = o.value;
    opt.disabled = !!o.disabled;
    (s.lastElementChild?.tagName === 'OPTGROUP' ? s.lastElementChild : s).append(opt);
  }
  s.addEventListener('change', () => onChange(s.value));
  const wrap = el('span', 'size-picker');
  const caret = el('span', 'caret', '▾');
  caret.setAttribute('aria-hidden', 'true');
  wrap.append(s, caret);
  return s;
}
function fontOptions(kind) {
  const out = [];
  for (const g of FONT_GROUPS.filter((x) => x.kind === kind)) {
    for (const [f] of g.fonts) out.push({ value: f, label: S.installed[f] ? f : `${f} · ${t('notInstalled')}`, disabled: !S.installed[f] });
  }
  return out;
}
// An Off|On switch for settings[name], both words shown, the current one filled (toolbar.js listens for the
// click: on a word, that value; from the keyboard, the other one).
function toggle(name) {
  const b = el('button', 'switch');
  b.type = 'button';
  b.dataset.toggle = name;
  b.setAttribute('role', 'switch');
  b.setAttribute('aria-label', t(name + 'Toggle'));
  b.title = t(name + 'Toggle');
  for (const v of ['off', 'on']) {
    const half = el('span', 'switch-half');
    half.dataset.value = v;
    b.append(half);
  }
  updateToggle(b);
  return b;
}
function updateToggle(b) {
  const on = settings[b.dataset.toggle];
  for (const half of b.children) {
    half.textContent = t(half.dataset.value === 'on' ? 'toggleOn' : 'toggleOff');
    half.classList.toggle('active', (half.dataset.value === 'on') === on);
  }
  b.setAttribute('aria-checked', String(on));
  b.disabled = b.dataset.toggle === 'mail' && !settings.links; // e-mail links need links on
}
export const updateToggles = () => { for (const b of body.querySelectorAll('.switch[data-toggle]')) updateToggle(b); };

function section(title, ...rows) {
  const s = el('section', 'prefs-section');
  s.append(el('h3', null, title), ...rows);
  return s;
}

function build() {
  builtLang = S.lang;
  const theme = select('prefs-theme', [{ value: '', label: t('themeSystem') }, { value: 'light', label: t('themeLight') }, { value: 'dark', label: t('themeDark') }],
    (v) => fadeTheme(() => { settings.theme = v || null; writeSettings(); applyTheme(); }));
  const lang = select('prefs-lang', [{ value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }],
    (v) => { settings.lang = v; writeSettings(); applyLang(); });
  const font = (kind) => select('prefs-font-' + kind, fontOptions(kind), (v) => {
    settings[kind === 'md' ? 'mdFont' : 'monoFont'] = v;
    writeSettings();
    applyFonts();
    updateToolbar();
  });
  const size = select('prefs-size', SIZES.map(([key, px]) => ({ value: String(px), label: `${px}px · ${t(key)}` })),
    (v) => { settings.size = Number(v); writeSettings(); applyFonts(); updateToolbar(); });
  const exportBtn = el('button', 'btn', t('exportAll'));
  exportBtn.type = 'button';
  exportBtn.id = 'prefs-export-all';
  exportBtn.addEventListener('click', () => { exportAll(); sync(); });
  const eraseBtn = el('button', 'btn btn-danger', t('eraseBtn'));
  eraseBtn.type = 'button';
  eraseBtn.id = 'prefs-erase';
  eraseBtn.addEventListener('click', () => { dialog.close(); openErase(); });
  const used = el('output', 'prefs-value');
  used.id = 'prefs-used';
  const keptOut = el('output', 'prefs-value');
  keptOut.id = 'prefs-kept';
  const last = el('div', 'prefs-row');
  const lastText = el('span', 'prefs-label');
  lastText.id = 'prefs-last';
  last.append(lastText, exportBtn);
  const erase = el('div', 'prefs-row prefs-erase');
  erase.append(eraseBtn);
  const keptRow = row(t('prefsKept'), keptOut);
  keptRow.id = 'prefs-kept-row';
  body.replaceChildren(
    section(t('prefsLook'), row(t('prefsTheme'), theme), row(t('prefsLang'), lang)),
    section(t('prefsText'), row(t('prefsMdFont'), font('md')), row(t('prefsMonoFont'), font('mono')), row(t('prefsSize'), size),
      row(t('wrapToggle'), toggle('wrap')), row(t('readToggle'), toggle('read'))),
    section(t('prefsLinks'), row(t('linksToggle'), toggle('links')), row(t('mailToggle'), toggle('mail'))),
    section(t('prefsFiles'), row(t('plainNamesToggle'), toggle('plainNames'))),
    section(t('prefsData'), row(t('prefsUsed'), used), keptRow, last, erase),
  );
  sync();
}

// The values, from the settings as they are now (they may have changed in another window).
function sync() {
  $('prefs-theme').value = settings.theme || '';
  $('prefs-lang').value = S.lang;
  $('prefs-font-md').value = effectiveFont('md') || '';
  $('prefs-font-mono').value = effectiveFont('mono') || '';
  $('prefs-size').value = String(settings.size);
  updateToggles();
  const mb = new Intl.NumberFormat(S.lang === 'fr' ? 'fr-FR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(store.usage() / 1048576);
  $('prefs-used').textContent = t('storageItem', { used: mb }).replace(/^\S+\s/, ''); // "1.2 / ~5 MB", without the bar's "Storage"
  $('prefs-kept-row').hidden = kept === null;
  $('prefs-kept').textContent = t(kept ? 'prefsKeptYes' : 'prefsKeptNo');
  $('prefs-last').textContent = S.lastExport ? t('lastExport', { when: formatStamp(new Date(S.lastExport), ' ∙ ', 1) }) : t('lastExportNever');
  $('prefs-erase').disabled = S.role !== 'editor'; // only the editing window may erase (erase.js)
  $('prefs-erase').title = S.role === 'editor' ? t('eraseBtn') : t('eraseReadOnly');
}

// Called whenever the toolbar is updated: a change made in the top bar or in another window shows here.
export function updatePrefs() {
  if (!dialog.open) return;
  if (builtLang !== S.lang) { // the labels change with the language: rebuilt, keeping the focus where it was
    const id = document.activeElement?.id;
    build();
    if (id) $(id)?.focus();
  } else sync();
}

export function togglePrefs() {
  if (dialog.open) { dialog.close(); return; }
  try {
    navigator.storage?.persisted?.().then((v) => { kept = !!v; if (dialog.open) sync(); }).catch(() => {});
  } catch { /* not offered: the row stays hidden */ }
  build();
  dialog.showModal();
  $('prefs-theme').focus();
}
$('btn-prefs').addEventListener('click', togglePrefs);
$('prefs-ok').addEventListener('click', () => dialog.close());
