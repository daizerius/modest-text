// The Help tab: a read-only page, rendered from the Help text (Markdown) in place of the editor. The controls it
// mentions ({ui:name}) are copies of the real icons and button faces, so Help always looks like the interface.
// Built with DOM calls only (text as text nodes, never HTML).
import { helpParser } from './markdown.js';
import { helpText } from './i18n.js';
import { $, KEYS, S, activeTab, settings, t } from './state.js';

export const helpView = $('help-view');

// The text: the Help page on the Help tab, else the editor.
export function focusText() {
  if (activeTab()?.help) helpView.focus({ preventScroll: true });
  else S.view?.focus();
}
export const textHasFocus = () => !!S.view?.hasFocus || document.activeElement === helpView;

const TAGS = {
  ATXHeading1: 'h1', ATXHeading2: 'h2', ATXHeading3: 'h3', Paragraph: 'p', BulletList: 'ul', OrderedList: 'ol', ListItem: 'li',
  Blockquote: 'blockquote', HorizontalRule: 'hr', Table: 'table', TableHeader: 'tr', TableRow: 'tr',
  StrongEmphasis: 'strong', Emphasis: 'em', Strikethrough: 's', Highlight: 'mark',
};
// Nodes whose own text sits between their children.
const INLINE = new Set(['ATXHeading1', 'ATXHeading2', 'ATXHeading3', 'Paragraph', 'TableCell', 'StrongEmphasis', 'Emphasis', 'Strikethrough', 'Highlight']);
// Accessible names of the icons (the button faces are named by their formatting button's label).
const UI_NAMES = { import: 'import', export: 'export', 'export-all': 'exportAll', light: 'themeToLight', dark: 'themeToDark', help: 'help',
  reopen: 'undoClose', new: 'newTab', undo: 'hist_undo', redo: 'hist_redo', plain: 'uiPlain', markdown: 'uiMd', lang: 'uiLang',
  wrap: 'uiWrap', readwidth: 'uiRead' };
const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

// {ui:name}: a copy of the interface's own icon (svg.icon[data-icon]) or button face (.fmt-btn[data-fmt], + and EN|FR).
function ui(name) {
  const box = el('span', 'help-ui');
  const icon = document.querySelector(`#topbar svg.icon[data-icon="${name}"], #tabbar svg.icon[data-icon="${name}"], #formatbar svg.icon[data-icon="${name}"]`);
  const face = icon ? null : name === 'new' ? $('btn-new') : name === 'lang' ? $('btn-lang') : document.querySelector(`.fmt-btn[data-fmt="${name}"]`);
  if (icon) box.append(icon.cloneNode(true));
  else if (face) {
    box.dataset.fmt = name;
    box.classList.add('help-face');
    if (face.classList.contains('fmt-mono')) box.classList.add('fmt-mono');
    for (const c of face.childNodes) box.append(c.cloneNode(true));
    for (const c of box.querySelectorAll('.active')) c.classList.remove('active');
  }
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', t(UI_NAMES[name] || 'fmt_' + name));
  return box;
}

// {action:name}: a button that runs a command (data-action; its module listens for the click).
function action(name) {
  const b = el('button', 'btn help-action');
  b.type = 'button';
  b.dataset.action = name;
  b.textContent = t(name + 'Btn');
  b.title = b.textContent;
  b.setAttribute('aria-label', b.textContent);
  return b;
}

// {toggle:name}: an Off|On switch for settings[name], both words shown, the current one filled (toolbar.js
// listens for the click: on a word, that value; from the keyboard, the other one).
function toggle(name) {
  const b = el('button', 'help-toggle');
  b.type = 'button';
  b.dataset.toggle = name;
  b.setAttribute('role', 'switch');
  b.setAttribute('aria-label', t(name + 'Toggle'));
  b.title = t(name + 'Toggle');
  for (const v of ['off', 'on']) {
    const half = el('span', 'help-toggle-half');
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
export const updateToggles = () => { for (const b of helpView.querySelectorAll('[data-toggle]')) updateToggle(b); };

const MAKE = { ui, action, toggle };
function text(parent, s) {
  const parts = s.replace(/\s*\n\s*/g, ' ').split(/\{(ui|action|toggle):([\w-]+)\}/);
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i]) parent.append(parts[i]);
    if (i + 2 < parts.length) parent.append(MAKE[parts[i + 1]](parts[i + 2]));
  }
}

function build(node, doc, parent) {
  if (/Mark$|^TableDelimiter$|^LinkMark$/.test(node.name)) return;
  if (node.name === 'InlineCode') {
    const open = node.firstChild, close = node.lastChild;
    let s = doc.slice(open.to, close.from).replace(/\n/g, ' ');
    if (/^ .*[^ ].* $/.test(s)) s = s.slice(1, -1); // CommonMark: one space on each side is padding
    const c = el('code');
    c.textContent = s;
    parent.append(c);
    return;
  }
  if (node.name === 'Escape') { parent.append(doc.slice(node.from + 1, node.to)); return; }
  // A line ending in \: parallel sentences start on lines of their own, so that they line up.
  if (node.name === 'HardBreak') { parent.append(el('br')); return; }
  if (node.name === 'URL') { text(parent, doc.slice(node.from, node.to)); return; } // a bare address: Help's links are written out
  // A link: only https, opened in a new tab without passing this page on; built as elements, as text.
  if (node.name === 'Link') {
    const marks = [];
    let url = '';
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.name === 'LinkMark') marks.push(c);
      else if (c.name === 'URL') url = doc.slice(c.from, c.to);
    }
    const label = marks.length >= 2 ? doc.slice(marks[0].to, marks[1].from) : doc.slice(node.from, node.to);
    // #name: a section of this page (its heading's id, see slug), scrolled to in the page.
    if (/^#[a-z0-9-]+$/.test(url)) {
      const a = el('a');
      a.href = url;
      a.textContent = label;
      a.addEventListener('click', (e) => { e.preventDefault(); helpView.querySelector(url)?.scrollIntoView({ block: 'start' }); });
      parent.append(a);
      return;
    }
    if (!/^https:\/\//.test(url)) { parent.append(label); return; }
    const a = el('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = label;
    parent.append(a);
    return;
  }
  const tag = node.name === 'TableCell' ? (node.parent?.name === 'TableHeader' ? 'th' : 'td') : TAGS[node.name];
  const out = tag ? el(tag) : parent;
  const inline = INLINE.has(node.name);
  let pos = node.from;
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (inline && c.from > pos) text(out, doc.slice(pos, c.from));
    build(c, doc, out);
    pos = c.to;
  }
  if (inline && pos < node.to) text(out, doc.slice(pos, node.to));
  if (/^h[23]$/.test(tag)) out.id = slug(out.textContent);
  if (tag) parent.append(out);
}
// A heading's id: its text, without accents or punctuation ("Où sont vos notes ?" -> ou-sont-vos-notes).
const slug = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let shown = ''; // the language the page was built in
export function renderHelp(force = false) {
  if (!force && shown === S.lang) return;
  shown = S.lang;
  const doc = helpText(S.lang, KEYS);
  const page = el('div', 'help-page');
  build(helpParser.parse(doc).topNode, doc, page);
  helpView.replaceChildren(page);
  helpView.setAttribute('aria-label', t('help'));
  helpView.lang = S.lang;
}

// Show the Help page (and hide the editor), or the reverse.
export function showHelpView(on) {
  if (on) renderHelp();
  helpView.hidden = !on;
  $('editor').hidden = on;
}
