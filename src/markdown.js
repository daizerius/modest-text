// Typora-style live preview for CodeMirror 6.
// The Markdown source is never rewritten: rendering is done with decorations
// only, and raw syntax is revealed on the line / block holding the cursor.
// Document text is only ever inserted as text (textContent), never as HTML.

import { Prec } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap } from '@codemirror/view';
import { Language, defineLanguageFacet, languageDataProp, syntaxTree, language } from '@codemirror/language';
import { parser as baseParser, Strikethrough, TaskList, Table } from '@lezer/markdown';
import { moveItemUp, moveItemDown, toggleTasks } from './lists.js';

const data = defineLanguageFacet({});
// Very long paragraphs (e.g. a 1 MB file without blank lines) are closed every ~8 KB so that
// each keystroke re-parses a small leaf block instead of the whole document.
const SplitLongParagraphs = { parseBlock: [{ name: 'SplitLongParagraphs', endLeaf: (cx, line, leaf) => leaf.content.length > 8000 }] };
// ==highlight== (not CommonMark / GFM; the common "mark" extension): same delimiter rules as Lezer's
// Strikethrough, with "=" instead of "~"; "===" and "a == b" are not highlights.
const Punctuation = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~\xA1\u2010-\u2027]/;
const HighlightDelim = { resolve: 'Highlight', mark: 'HighlightMark' };
const Highlight = {
  defineNodes: [{ name: 'Highlight' }, { name: 'HighlightMark' }],
  parseInline: [{
    name: 'Highlight',
    parse(cx, next, pos) {
      if (next !== 61 || cx.char(pos + 1) !== 61 || cx.char(pos + 2) === 61 || cx.char(pos - 1) === 61) return -1;
      const before = cx.slice(pos - 1, pos), after = cx.slice(pos + 2, pos + 3);
      const sBefore = /\s|^$/.test(before), sAfter = /\s|^$/.test(after);
      const pBefore = Punctuation.test(before), pAfter = Punctuation.test(after);
      return cx.addDelimiter(HighlightDelim, pos, pos + 2,
        !sAfter && (!pAfter || sBefore || pBefore),
        !sBefore && (!pBefore || sAfter || pAfter));
    },
    after: 'Emphasis',
  }],
};

const mdParser = baseParser.configure([Strikethrough, TaskList, Highlight, SplitLongParagraphs, { props: [languageDataProp.add({ Document: data })] }]);
export const markdownLanguage = new Language(data, mdParser, [], 'markdown');
// The Help page (helpview.js) also has tables.
export const helpParser = mdParser.configure([Table]);

export function safeUrl(url) {
  const u = String(url || '').trim();
  return /^(https?:|mailto:)/i.test(u) ? u : null;
}

class TextWidget extends WidgetType {
  constructor(text, cls, title) { super(); this.text = text; this.cls = cls; this.title = title || ''; }
  eq(o) { return o.text === this.text && o.cls === this.cls && o.title === this.title; }
  toDOM() {
    const el = document.createElement('span');
    el.className = this.cls;
    el.textContent = this.text;
    if (this.title) el.title = this.title;
    return el;
  }
  ignoreEvent() { return false; }
}

// Task list items ("- [ ]" / "- [x]"): a check box; clicking it toggles the mark in the source.
class TaskWidget extends WidgetType {
  constructor(checked, readOnly, label) { super(); this.checked = checked; this.readOnly = readOnly; this.label = label; }
  eq(o) { return o.checked === this.checked && o.readOnly === this.readOnly && o.label === this.label; }
  toDOM(view) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'mt-task';
    box.checked = this.checked;
    box.disabled = this.readOnly;
    box.tabIndex = -1;
    box.title = this.label;
    box.setAttribute('aria-label', this.label);
    box.addEventListener('mousedown', (e) => e.preventDefault()); // keep the cursor (and the preview) where it is
    box.addEventListener('click', (e) => { e.preventDefault(); toggleTask(view, view.posAtDOM(box)); });
    return box;
  }
  ignoreEvent() { return true; }
}

export function toggleTask(view, pos) {
  const mark = view.state.sliceDoc(pos, pos + 3);
  if (view.state.readOnly || !/^\[[ xX]\]$/.test(mark)) return false;
  view.dispatch(view.state.update({ changes: { from: pos + 1, to: pos + 2, insert: mark[1] === ' ' ? 'x' : ' ' }, userEvent: 'input.toggle' }));
  return true;
}

const hide = Decoration.replace({});
const taskGap = Decoration.mark({ class: 'mt-taskgap' });
const lineDeco = {};
function line(cls) { return lineDeco[cls] || (lineDeco[cls] = Decoration.line({ class: cls })); }
const markDeco = {};
function mark(cls) { return markDeco[cls] || (markDeco[cls] = Decoration.mark({ class: cls })); }

// List items have a hanging indent: the marker sits in a box of a fixed width (--mk), and every other line of the
// item, wrapped or not, starts where the item's text starts. A nested list starts where its parent's text starts.
// Widths in em: bullets and task boxes 1.3em; numbers by the widest number of their list.
const QUOTES = /^(?:[ \t]*>[ \t]?)*/;
const em = (x) => `${Math.round(x * 1000) / 1000}em`;
const listLineDeco = {};
function listLine(pad, mk, hang) {
  const style = `--list-pad:${em(pad)};--mk:${em(mk)}` + (hang ? `;text-indent:-${em(mk)}` : '');
  return listLineDeco[style] || (listLineDeco[style] = Decoration.line({ attributes: { style } }));
}
function markerWidth(list, cache) {
  let w = cache.get(list.from);
  if (w === undefined) {
    let digits = 1;
    if (list.name === 'OrderedList') {
      let k = 0;
      for (let c = list.firstChild; c && k < 5000; c = c.nextSibling, k++) {
        const m = c.firstChild;
        if (m && m.name === 'ListMark') digits = Math.max(digits, m.to - m.from - 1);
      }
    }
    w = list.name === 'OrderedList' ? digits * 0.55 + 0.85 : 1.3;
    cache.set(list.from, w);
  }
  return w;
}
const isList = (n) => n.name === 'BulletList' || n.name === 'OrderedList';

function buildDecorations(view, t) {
  const { state } = view;
  const doc = state.doc;
  const sel = state.selection.ranges;
  // Raw syntax is revealed only where the cursor is, and only while the editor has focus.
  const focused = view.hasFocus;
  const touches = (from, to) => focused && sel.some((r) => r.from <= to && r.to >= from);
  const lineActive = (pos) => { const l = doc.lineAt(pos); return touches(l.from, l.to); };
  const linesActive = (from, to) => touches(doc.lineAt(from).from, doc.lineAt(to).to);
  // A task item keeps its check box on the cursor's line, unless the cursor is in the marker itself ("- [ ] "):
  // the source is wider than the box, so the text would move.
  const taskRaw = (markFrom, text) => focused && sel.some((r) => r.from < text && r.to >= markFrom);
  const textStart = (pos, end) => { while (pos < end && /[ \t]/.test(doc.sliceString(pos, pos + 1))) pos++; return pos; };
  const out = [], atoms = [];
  const add = (from, to, deco) => { if (from <= to) out.push(deco.range(from, to)); };
  const quoteDepth = new Map();
  const listLines = new Map(); // line start -> [indent, marker width, first line of its item] (the innermost item wins)
  const listWidths = new Map();
  const codeLines = new Set(); // code keeps its own indentation
  const tree = syntaxTree(state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from, to,
      enter: (node) => {
        const name = node.name;
        const nf = node.from, nt = node.to;
        let m;
        if ((m = /^ATXHeading(\d)$/.exec(name))) {
          const l = doc.lineAt(nf);
          add(l.from, l.from, line(`mt-h mt-h${m[1]}`));
          if (!touches(l.from, l.to)) {
            for (let c = node.node.firstChild; c; c = c.nextSibling) {
              if (c.name !== 'HeaderMark') continue;
              if (c.from === l.from) {
                let end = c.to;
                while (end < l.to && /[ \t]/.test(doc.sliceString(end, end + 1))) end++;
                add(c.from, end, hide);
              } else {
                let start = c.from;
                while (start > l.from && /[ \t]/.test(doc.sliceString(start - 1, start))) start--;
                add(start, c.to, hide);
              }
            }
          }
          return;
        }
        if ((m = /^SetextHeading(\d)$/.exec(name))) {
          const active = touches(nf, nt);
          const last = doc.lineAt(nt);
          for (let p = nf; p <= nt;) {
            const l = doc.lineAt(p);
            if (l.number === last.number && l.number !== doc.lineAt(nf).number) {
              add(l.from, l.from, line(active ? 'mt-setext-mark' : 'mt-setext-mark mt-fence-hidden'));
              if (!active) add(l.from, l.to, hide);
            } else add(l.from, l.from, line(`mt-h mt-h${m[1]}`));
            p = l.to + 1;
          }
          return false;
        }
        switch (name) {
          case 'Emphasis': add(nf, nt, mark('mt-em')); break;
          case 'StrongEmphasis': add(nf, nt, mark('mt-strong')); break;
          case 'Strikethrough': add(nf, nt, mark('mt-strike')); break;
          case 'Highlight': add(nf, nt, mark('mt-highlight')); break;
          case 'EmphasisMark':
          case 'StrikethroughMark':
          case 'HighlightMark':
            if (!lineActive(nf)) add(nf, nt, hide);
            break;
          case 'InlineCode':
            add(nf, nt, mark('mt-code'));
            if (!lineActive(nf)) {
              for (let c = node.node.firstChild; c; c = c.nextSibling) if (c.name === 'CodeMark') add(c.from, c.to, hide);
            }
            return false;
          case 'Escape':
            if (!lineActive(nf)) add(nf, nf + 1, hide);
            break;
          case 'Link': {
            const n = node.node;
            const marks = [];
            let url = null, urlNode = null;
            for (let c = n.firstChild; c; c = c.nextSibling) {
              if (c.name === 'LinkMark') marks.push(c);
              if (c.name === 'URL') { urlNode = c; url = doc.sliceString(c.from, c.to); }
            }
            const safe = urlNode && safeUrl(url);
            if (!safe || marks.length < 2) return; // unsafe or reference link: leave raw, inert
            const textFrom = marks[0].to, textTo = marks[1].from;
            add(textFrom, textTo, Decoration.mark({ class: 'mt-link', attributes: { title: t('linkTip', { url: safe }) } }));
            if (!linesActive(nf, nt)) {
              add(marks[0].from, marks[0].to, hide);
              add(marks[1].from, nt, hide);
            }
            return;
          }
          case 'Autolink': {
            const n = node.node;
            const u = n.getChild('URL');
            const safe = u && safeUrl(doc.sliceString(u.from, u.to));
            if (!safe) return false;
            add(u.from, u.to, Decoration.mark({ class: 'mt-link', attributes: { title: t('linkTip', { url: safe }) } }));
            if (!linesActive(nf, nt)) {
              add(nf, u.from, hide);
              add(u.to, nt, hide);
            }
            return false;
          }
          case 'Image': {
            if (linesActive(nf, nt) || doc.lineAt(nf).number !== doc.lineAt(nt).number) return false;
            const n = node.node;
            const marks = n.getChildren('LinkMark');
            const alt = marks.length >= 2 ? doc.sliceString(marks[0].to, marks[1].from) : '';
            out.push(Decoration.replace({ widget: new TextWidget(t('image', { alt }), 'mt-img', '') }).range(nf, nt));
            return false;
          }
          case 'Blockquote': {
            for (let p = nf; p <= nt;) {
              const l = doc.lineAt(p);
              quoteDepth.set(l.from, (quoteDepth.get(l.from) || 0) + 1);
              p = l.to + 1;
            }
            break;
          }
          case 'QuoteMark':
            if (!lineActive(nf)) {
              let end = nt;
              if (doc.sliceString(end, end + 1) === ' ') end++;
              add(nf, end, hide);
            }
            break;
          case 'TaskMarker':
            if (!taskRaw(node.node.parent?.parent?.firstChild?.from ?? nf, textStart(nt, doc.lineAt(nt).to))) {
              const checked = /x/i.test(doc.sliceString(nf, nt));
              out.push(Decoration.replace({ widget: new TaskWidget(checked, state.readOnly, t('task')) }).range(nf, nt));
              // The space after the box stays text, drawn as the gap up to where the task's text starts
              // (mt-taskgap). With the gap inside the widget, a task with no text yet left the caret to
              // the browser's guess next to a non-text box: against the box, and at the wrong height
              // after switching modes. After a real space, every browser places it as it does in text.
              if (doc.sliceString(nt, nt + 1) === ' ') {
                out.push(taskGap.range(nt, nt + 1));
                atoms.push(taskGap.range(nf, nt + 1)); // box and gap are one step for the cursor
              }
            }
            break;
          case 'ListItem': {
            const list = node.node.parent;
            if (!list || !isList(list)) break;
            const mk = markerWidth(list, listWidths);
            let pad = mk;
            for (let p = list.parent; p; p = p.parent) if (isList(p)) pad += markerWidth(p, listWidths);
            const first = doc.lineAt(nf).number;
            const a = Math.max(first, doc.lineAt(from).number), b = Math.min(doc.lineAt(nt).number, doc.lineAt(to).number);
            for (let n = a; n <= b; n++) listLines.set(doc.line(n).from, [pad, mk, n === first]);
            break;
          }
          case 'ListMark': {
            const l = doc.lineAt(nf);
            const task = node.node.nextSibling;
            const isTask = task && task.name === 'Task' && task.firstChild?.name === 'TaskMarker' && task.from === task.firstChild.from;
            const text = textStart(isTask ? task.firstChild.to : nt, l.to); // where the item's text starts
            const ordered = node.node.parent?.parent?.name === 'OrderedList';
            if (isTask ? taskRaw(nf, text) : lineActive(nf)) { // the source as typed, in a box as wide as the rendered marker
              add(nf, text, mark('mt-listbox'));
              if (ordered) add(nf, nt, mark('mt-listmark'));
            } else if (isTask) add(nf, task.from, hide); // the check box stands for the marker
            else if (ordered) out.push(Decoration.replace({ widget: new TextWidget(doc.sliceString(nf, nt), 'mt-listmark mt-listbox mt-olbox') }).range(nf, text));
            else out.push(Decoration.replace({ widget: new TextWidget('•', 'mt-bullet mt-listbox') }).range(nf, text));
            break;
          }
          case 'FencedCode': {
            const active = touches(nf, nt);
            const first = doc.lineAt(nf), last = doc.lineAt(nt);
            for (let p = first.from; p <= last.to;) {
              const l = doc.lineAt(p);
              codeLines.add(l.from);
              let cls = 'mt-codeblock';
              const isFence = (l.number === first.number) ||
                (l.number === last.number && l.number !== first.number && /^\s*(```|~~~)/.test(l.text));
              if (l.number === first.number) cls += ' mt-codeblock-first';
              if (l.number === last.number) cls += ' mt-codeblock-last';
              if (isFence) {
                cls += ' mt-fence';
                if (!active) { cls += ' mt-fence-hidden'; if (l.to > l.from) add(l.from, l.to, hide); }
              }
              add(l.from, l.from, line(cls));
              p = l.to + 1;
            }
            return false;
          }
          case 'CodeBlock': {
            for (let p = nf; p <= nt;) {
              const l = doc.lineAt(p);
              codeLines.add(l.from);
              add(l.from, l.from, line('mt-codeblock mt-indented'));
              p = l.to + 1;
            }
            return false;
          }
          case 'HorizontalRule': {
            const l = doc.lineAt(nf);
            add(l.from, l.from, line('mt-hrline'));
            if (!touches(l.from, l.to)) out.push(Decoration.replace({ widget: new TextWidget('', 'mt-hr') }).range(nf, nt));
            return false;
          }
          case 'HTMLBlock':
          case 'HTMLTag':
          case 'Comment':
          case 'ProcessingInstruction':
            return false; // shown as literal text
          default:
        }
      },
    });
  }
  for (const [from, depth] of quoteDepth) out.push(line(`mt-quote mt-quote-${Math.min(depth, 3)}`).range(from));
  for (const [from, [pad, mk, first]] of listLines) {
    out.push(listLine(pad, mk, first).range(from));
    // The source indentation is replaced by the list's own, on the cursor's line too (not in code).
    const l = doc.lineAt(from);
    if (codeLines.has(from)) continue;
    const q = QUOTES.exec(l.text)[0].length;
    const ws = /^[ \t]*/.exec(l.text.slice(q))[0].length;
    if (ws) add(l.from + q, l.from + q + ws, hide);
  }
  return { decorations: Decoration.set(out, true), atoms: Decoration.set(atoms, true) };
}

export function livePreview(getT) {
  const plugin = ViewPlugin.fromClass(class {
    constructor(view) { ({ decorations: this.decorations, atoms: this.atoms } = buildDecorations(view, getT())); }
    update(u) {
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || syntaxTree(u.startState) !== syntaxTree(u.state) || u.transactions.some((tr) => tr.reconfigured)) {
        ({ decorations: this.decorations, atoms: this.atoms } = buildDecorations(u.view, getT()));
      }
    }
  }, {
    decorations: (v) => v.decorations,
    provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.atoms ?? Decoration.none),
  });
  return plugin;
}

// Find a safe link URL at a document position.
export function linkAt(state, pos) {
  const tree = syntaxTree(state);
  for (const side of [1, -1]) {
    for (let n = tree.resolveInner(pos, side); n; n = n.parent) {
      if (n.name === 'Link' || n.name === 'Autolink') {
        const u = n.getChild('URL');
        return u ? safeUrl(state.doc.sliceString(u.from, u.to)) : null;
      }
      if (n.name === 'Image') return null;
    }
  }
  return null;
}

function inCode(state, pos) {
  for (let n = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    if (n.name === 'FencedCode' || n.name === 'CodeBlock' || n.name === 'HTMLBlock') return true;
  }
  return false;
}
// Also inline code (for typing helpers).
export function inAnyCode(state, pos) {
  for (let n = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    if (n.name === 'InlineCode' || n.name === 'FencedCode' || n.name === 'CodeBlock' || n.name === 'HTMLBlock') return true;
  }
  return false;
}

// The fenced code block around a selection, with its opening and closing fence lines (no closing line when
// the block runs to the end of the document).
export function fenceAt(state, from, to = from) {
  for (const side of [1, -1]) {
    for (let n = syntaxTree(state).resolveInner(from, side); n; n = n.parent) {
      if (n.name !== 'FencedCode') continue;
      if (to > n.to) return null;
      const open = state.doc.lineAt(n.from), last = state.doc.lineAt(n.to);
      return { open, close: last.number !== open.number && /^[ \t]*(```|~~~)/.test(last.text) ? last : null };
    }
  }
  return null;
}

// Pasting a web address over selected text (Markdown tabs) makes a link: [text](address).
const PASTE_URL = /^(https?:\/\/|mailto:)[^\s<>()[\]]+$/i;
export function linkPaste(state, text) {
  const url = text.trim();
  const r = state.selection.main;
  if (state.selection.ranges.length > 1 || r.empty || !PASTE_URL.test(url)) return null;
  const sel = state.sliceDoc(r.from, r.to);
  if (!sel.trim() || /[\n[\]]/.test(sel) || PASTE_URL.test(sel.trim()) || inAnyCode(state, r.from)) return null;
  const insert = `[${sel}](${url})`;
  return { changes: { from: r.from, to: r.to, insert }, selection: { anchor: r.from + insert.length } };
}

// The inline format span (bold, italic, …) around a selection, with its opening and closing marks; Markdown tabs
// use the document's tree, plain-text tabs parse the line. Null when the selection is not inside its text.
export function formatSpanAt(state, from, to, name) {
  let tree = syntaxTree(state), off = 0;
  if (!state.facet(language)) {
    const l = state.doc.lineAt(from);
    if (to > l.to || l.length > 10000) return null;
    tree = mdParser.parse(l.text);
    off = l.from;
  }
  for (const side of [-1, 1]) {
    for (let n = tree.resolveInner(from - off, side); n; n = n.parent) {
      if (n.name !== name) continue;
      const open = n.firstChild, close = n.lastChild;
      if (!open || !close || open === close || !/Mark$/.test(open.name) || !/Mark$/.test(close.name)) return null;
      if (from - off < open.to || to - off > close.from) return null;
      return [{ from: open.from + off, to: open.to + off }, { from: close.from + off, to: close.to + off }];
    }
  }
  return null;
}

// Formats that apply where the selection starts (what clicking the button again would remove):
// shown as pressed buttons (both modes use the document's syntax tree).
const PRESSED = { StrongEmphasis: 'bold', Emphasis: 'italic', Strikethrough: 'strike', Highlight: 'highlight', InlineCode: 'code',
  ATXHeading1: 'h1', ATXHeading2: 'h2', ATXHeading3: 'h3', SetextHeading1: 'h1', SetextHeading2: 'h2', Blockquote: 'quote', FencedCode: 'codeblock' };
const BLOCK = new Set(['h1', 'h2', 'h3', 'quote', 'codeblock']);
const TASK_ITEM = /^([-*+]|\d{1,9}[.)])[ \t]+\[[ xX]\](?:[ \t]|$)/; // from the list marker (an empty task too)
const LEAD = /^(?:[ \t]*>[ \t]?)*[ \t]*/; // quote marks and indentation in front of a line's text
export function activeFormats(state) {
  const on = new Set();
  const r = state.selection.main;
  const pos = r.empty ? r.head : r.from;
  const tree = syntaxTree(state); // both modes parse Markdown (plain-text tabs just do not render it)
  // Bullet, numbered or task list: a task item (bullet or number) is a task list, not the other two. When the cursor's
  // line starts an item, that item decides, wherever the cursor is on the line (in its indentation or on its marker,
  // the syntax tree would give the parent item or no item); on its other lines, the item they belong to.
  const kind = (item, list) => (TASK_ITEM.test(state.sliceDoc(item.from, state.doc.lineAt(item.from).to).replace(/^[ \t]+/, '')) ? 'tasklist'
    : list.name === 'BulletList' ? 'ul' : 'ol');
  const line = state.doc.lineAt(pos);
  const mark = tree.resolveInner(line.from + LEAD.exec(line.text)[0].length, 1);
  const lineItem = mark.name === 'ListMark' && mark.parent?.parent && isList(mark.parent.parent) ? mark.parent : null;
  if (lineItem) on.add(kind(lineItem, lineItem.parent));
  const walk = (side, inline) => {
    let list = !!lineItem, item = null;
    for (let n = tree.resolveInner(pos, side); n; n = n.parent) {
      const f = PRESSED[n.name];
      if (f && (inline || BLOCK.has(f))) on.add(f);
      if (!list && !item && n.name === 'ListItem') item = n;
      if (!list && isList(n)) { list = true; on.add(item ? kind(item, n) : n.name === 'BulletList' ? 'ul' : 'ol'); } // the nearest list only
    }
  };
  walk(r.empty ? -1 : 1, true);
  walk(r.empty ? 1 : -1, false); // line formats also at the very start / end of a line
  return on;
}

const LIST_RE = /^([ \t]*)([-*+]|(\d{1,9})([.)]))([ \t]+|$)/;

function listIndentUnit(state, lineNo, m) {
  const indent = m[1];
  for (let n = lineNo - 1; n >= 1 && n > lineNo - 200; n--) {
    const text = state.doc.line(n).text;
    const pm = LIST_RE.exec(text);
    if (pm && pm[1] === indent) return ' '.repeat(pm[2].length + Math.max(1, pm[5].length));
    if (!pm && text.trim() && !/^[ \t]/.test(text)) break;
  }
  return ' '.repeat(m[2].length + Math.max(1, m[5].length));
}

function selectedLines(state) {
  const lines = new Set();
  for (const r of state.selection.ranges) {
    for (let p = r.from; ;) {
      const l = state.doc.lineAt(p);
      lines.add(l.number);
      if (l.to >= r.to) break;
      p = l.to + 1;
    }
  }
  return [...lines].map((n) => state.doc.line(n));
}

export function indentListItems(view) {
  const { state } = view;
  const lines = selectedLines(state);
  if (!lines.length || !lines.every((l) => LIST_RE.test(l.text) && !inCode(state, l.from))) return false;
  const changes = lines.map((l) => ({ from: l.from, insert: listIndentUnit(state, l.number, LIST_RE.exec(l.text)) }));
  view.dispatch(state.update({ changes, userEvent: 'input.indent' }));
  return true;
}

export function outdentListItems(view) {
  const { state } = view;
  const lines = selectedLines(state);
  if (!lines.length || !lines.every((l) => LIST_RE.test(l.text) && !inCode(state, l.from))) return false;
  const changes = [];
  for (const l of lines) {
    const ws = /^[ \t]*/.exec(l.text)[0];
    if (!ws) continue;
    let remove = ws[0] === '\t' ? 1 : 0;
    if (!remove) {
      // Remove the indentation of the enclosing item's content, at most the leading whitespace.
      const m = LIST_RE.exec(l.text);
      let unit = 2;
      for (let n = l.number - 1; n >= 1 && n > l.number - 200; n--) {
        const pm = LIST_RE.exec(state.doc.line(n).text);
        if (pm && pm[1].length < m[1].length) { unit = m[1].length - pm[1].length; break; }
      }
      remove = Math.min(unit, ws.length);
    }
    changes.push({ from: l.from, to: l.from + remove });
  }
  if (!changes.length) return true;
  view.dispatch(state.update({ changes, userEvent: 'delete.dedent' }));
  return true;
}

// Enter continues Markdown lists and quotes (also a list inside a quote):
//  - on a list item: the next item, same marker, next number;
//  - on an empty list item: ends the list, or moves a nested item one level up;
//  - on a quote line: the next line starts with the same "> " prefix;
//  - on an empty quote line: one quote level less ("> > " -> "> ", "> " -> plain line).
const QUOTE_PREFIX = /^[ \t]*(?:>[ \t]?)+/;
export function continueMarkup(view) {
  const { state } = view;
  const r = state.selection.main;
  if (state.readOnly || !r.empty || state.selection.ranges.length > 1 || inCode(state, r.head)) return false;
  const l = state.doc.lineAt(r.head);
  const qp = (QUOTE_PREFIX.exec(l.text) || [''])[0];
  const rest = l.text.slice(qp.length);
  const m = LIST_RE.exec(rest);
  const put = (spec) => { view.dispatch(state.update(spec, { scrollIntoView: true, userEvent: 'input' })); return true; };
  if (m) {
    const itemStart = l.from + qp.length;
    if (r.head < itemStart + m[0].length) return false;
    const task = /^\[[ xX]\][ \t]+/.exec(rest.slice(m[0].length));
    if (!rest.slice(m[0].length + (task ? task[0].length : 0)).trim()) {
      if (m[1]) { // nested: one level up
        const unit = qp ? 2 : listIndentUnit(state, l.number, m).length;
        const keep = m[1].startsWith('\t') ? m[1].slice(1) : m[1].slice(Math.min(unit, m[1].length));
        return put({ changes: { from: itemStart, to: itemStart + m[1].length, insert: keep } });
      }
      return put({ changes: { from: itemStart, to: l.to, insert: '' } }); // ends the list (keeps the quote)
    }
    const marker = m[3] ? `${Number(m[3]) + 1}${m[4]}` : m[2];
    return put(state.replaceSelection('\n' + qp.replace(/[ \t]*$/, qp ? ' ' : '') + m[1] + marker + ' ' + (task ? '[ ] ' : '')));
  }
  if (qp) {
    if (r.head < l.from + qp.length) return false;
    if (!rest.trim()) {
      const less = qp.replace(/>[ \t]*$/, '');
      return put({ changes: { from: l.from, to: l.to, insert: less.trim() ? less.replace(/[ \t]*$/, ' ') : '' } });
    }
    return put(state.replaceSelection('\n' + qp.replace(/[ \t]*$/, ' ')));
  }
  return false;
}

// Backspace right after a list marker ("- ", "1. ", "- [ ] ") or a quote prefix removes the whole marker
// (one quote level at a time); the line's text and indentation stay.
export function deleteMarkerBackward(view) {
  const { state } = view;
  const r = state.selection.main;
  if (state.readOnly || !r.empty || state.selection.ranges.length > 1 || inCode(state, r.head)) return false;
  const l = state.doc.lineAt(r.head);
  const before = l.text.slice(0, r.head - l.from);
  const qp = (QUOTE_PREFIX.exec(before) || [''])[0];
  const m = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+(\[[ xX]\][ \t]+)?$/.exec(before.slice(qp.length));
  if (m) {
    const from = l.from + qp.length + m[1].length;
    view.dispatch(state.update({ changes: { from, to: r.head } }, { userEvent: 'delete' }));
    return true;
  }
  if (qp && qp === before) {
    const less = qp.replace(/>[ \t]*$/, '');
    view.dispatch(state.update({ changes: { from: l.from, to: r.head, insert: less.trim() ? less.replace(/[ \t]*$/, ' ') : '' } }, { userEvent: 'delete' }));
    return true;
  }
  return false;
}

// List and quote editing, in both modes: Enter continues, Tab / Shift+Tab indent list items,
// Backspace removes a marker.
export const listEditing = Prec.high(keymap.of([
  { key: 'Enter', run: continueMarkup },
  { key: 'Tab', run: indentListItems },
  { key: 'Shift-Tab', run: outdentListItems },
  { key: 'Backspace', run: deleteMarkerBackward },
  { key: 'Alt-ArrowUp', run: moveItemUp }, // a list item moves with its sub-items (otherwise: the line)
  { key: 'Alt-ArrowDown', run: moveItemDown },
  { key: 'Mod-Enter', run: toggleTasks }, // check / uncheck tasks (otherwise: a new line below)
]));

// The live preview of Markdown tabs (the Markdown parser itself runs in both modes, see editor.js).
export function markdownExtensions(getT, openLink) {
  return [
    livePreview(getT),
    EditorView.editorAttributes.of({ class: 'mt-md' }),
    EditorView.domEventHandlers({
      mousedown(e, view) {
        if (e.button !== 0 || !(e.metaKey || e.ctrlKey)) return false;
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos == null) return false;
        const url = linkAt(view.state, pos);
        if (!url) return false;
        e.preventDefault();
        openLink(url);
        return true;
      },
    }),
  ];
}

