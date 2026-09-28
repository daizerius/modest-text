// Markdown formatting commands used by the formatting bar and its shortcuts.
// Every command edits the Markdown source as ordinary, undoable changes.
import { EditorSelection } from '@codemirror/state';
import { formatSpanAt, fenceAt } from './markdown.js';
import { SHORTCUTS } from './i18n.js';

const run = (view, spec) => {
  view.dispatch(view.state.update(spec, { scrollIntoView: true, userEvent: 'input.format' }));
  return true;
};

// **bold**, *italic*, ~~strike~~, ==highlight==, `code`: wrap the selection, or unwrap it when already wrapped.
// Asterisk runs decide between italic (odd count, 1 or 3) and bold (2 or 3).
function runLength(state, pos, dir) {
  let n = 0;
  while (n < 3 && state.sliceDoc(dir < 0 ? pos - n - 1 : pos + n, dir < 0 ? pos - n : pos + n + 1) === '*') n++;
  return n;
}
const hasMark = (mark, count) => (mark === '*' ? count % 2 === 1 : mark === '**' ? count >= 2 : true);
const SPAN = { '**': 'StrongEmphasis', '*': 'Emphasis', '~~': 'Strikethrough', '==': 'Highlight', '`': 'InlineCode' };

// The word at a cursor, which the inline formats and the link take when nothing is selected: letters (any
// alphabet), digits, "-" and "_"; ".", ",", "@" and apostrophes between two of those ("3,14", "example.com",
// "aujourd'hui", "me@example.com"), so not at its end ("word." or "wait..." stop before the dots); "#" or "@" in
// front ("#tag", "@name"). It needs a letter or a digit, so a lone "-" (a list marker) or "---" is not a word.
// The cursor may be inside the word or at either end of it; null elsewhere.
const WORD = /[#@]?[\p{L}\p{N}\p{M}_-]+(?:[.,@'’][\p{L}\p{N}\p{M}_-]+)*/gu;
export function wordAt(state, pos) {
  const line = state.doc.lineAt(pos);
  const start = Math.max(line.from, pos - 500); // a window around the cursor, for very long lines
  const text = state.sliceDoc(start, Math.min(line.to, pos + 500));
  const at = pos - start;
  for (const m of text.matchAll(WORD)) {
    if (m.index > at) break;
    if (m.index + m[0].length >= at && /[\p{L}\p{N}]/u.test(m[0])) return { from: start + m.index, to: start + m.index + m[0].length };
  }
  return null;
}

export function toggleInline(view, mark) {
  if (view.state.readOnly) return false;
  const { state } = view;
  const n = mark.length;
  const star = mark[0] === '*';
  return run(view, state.changeByRange((r) => {
    const before = state.sliceDoc(r.from - n, r.from);
    const after = state.sliceDoc(r.to, r.to + n);
    const outside = star ? hasMark(mark, runLength(state, r.from, -1)) && hasMark(mark, runLength(state, r.to, 1)) : before === mark && after === mark;
    const text = state.sliceDoc(r.from, r.to);
    const inside = star
      ? text.length >= 2 * n && hasMark(mark, runLength(state, r.from, 1)) && hasMark(mark, runLength(state, r.to, -1))
      : text.length >= 2 * n && text.startsWith(mark) && text.endsWith(mark);
    if (outside && !(star && inside)) {
      return {
        changes: [{ from: r.from - n, to: r.from }, { from: r.to, to: r.to + n }],
        range: EditorSelection.range(r.from - n, r.to - n),
      };
    }
    if (inside) {
      return {
        changes: { from: r.from, to: r.to, insert: text.slice(n, text.length - n) },
        range: EditorSelection.range(r.from, r.to - 2 * n),
      };
    }
    // The cursor (or selection) is inside formatted text: remove that span's marks (the button shows as pressed).
    const span = formatSpanAt(state, r.from, r.to, SPAN[mark]);
    if (span) {
      const len = span[0].to - span[0].from;
      return { changes: span, range: EditorSelection.range(r.anchor - len, r.head - len) };
    }
    // No selection: the word at the cursor (the cursor stays where it is in it); outside a word, empty marks.
    const w = r.empty && wordAt(state, r.head);
    if (w) return { changes: [{ from: w.from, insert: mark }, { from: w.to, insert: mark }], range: EditorSelection.cursor(r.head + n) };
    return {
      changes: [{ from: r.from, insert: mark }, { from: r.to, insert: mark }],
      range: EditorSelection.range(r.from + n, r.to + n),
    };
  }));
}

// The block around a line: the lines between blank lines (a paragraph, a list, a quote…); a blank line alone.
function blockAt(state, line) {
  const { doc } = state;
  let a = line.number, b = line.number;
  if (line.text.trim()) {
    while (a > 1 && doc.line(a - 1).text.trim()) a--;
    while (b < doc.lines && doc.line(b + 1).text.trim()) b++;
  }
  return [doc.line(a), doc.line(b)];
}

// The selected lines; with `block`, a cursor without a selection stands for its whole block.
function selectedLines(state, block = false) {
  const seen = new Set();
  const lines = [];
  for (const r of state.selection.ranges) {
    const [first, last] = block && r.empty ? blockAt(state, state.doc.lineAt(r.head)) : [state.doc.lineAt(r.from), state.doc.lineAt(r.to)];
    for (let n = first.number; n <= last.number; n++) {
      if (!seen.has(n)) { seen.add(n); lines.push(state.doc.line(n)); }
    }
  }
  return lines.sort((a, b) => a.number - b.number);
}

// Line prefixes: a cursor where a mark is inserted ends up after it (on an empty line, ready to type).
const runLines = (view, changes) => {
  const set = view.state.changes(changes);
  return run(view, { changes: set, selection: view.state.selection.map(set, 1) });
};

const HEADING = /^(#{1,6})[ \t]+/;
const LIST = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+/;
const BOX = /^\[[ xX]\](?:[ \t]+|$)/; // a task box, after the list marker
const QUOTE = /^[ \t]*>[ \t]?/;
const QUOTES = /^(?:[ \t]*>[ \t]?)*/; // every quote mark in front of a line

// A line without its quote marks: headings and list marks go after them ("> - one", not "- > one"), with a space
// after a ">" that has none.
function body(l) {
  const q = QUOTES.exec(l.text)[0];
  return { at: l.from + q.length, text: l.text.slice(q.length), pad: /[^ \t]$/.test(q) ? ' ' : '' };
}

// Headings: "#" … "###". The same level again removes it.
export function toggleHeading(view, level) {
  if (view.state.readOnly) return false;
  const lines = selectedLines(view.state).map(body);
  const want = '#'.repeat(level) + ' ';
  const all = lines.every((b) => (HEADING.exec(b.text) || [])[1]?.length === level);
  return runLines(view, lines.map((b) => {
    const m = HEADING.exec(b.text);
    return { from: b.at, to: b.at + (m ? m[0].length : 0), insert: all ? '' : b.pad + want };
  }));
}

// A line that would be swallowed into the list item above it. In Markdown a paragraph line straight after a
// list item is a "lazy continuation" of that item, so turning one line of a paragraph into an item would
// silently make the rest of the paragraph part of it too — the source would read as a one-line item, while
// Markdown (the live preview, and any other Markdown reader the file is exported to) would read the whole
// paragraph as the item. Blank lines, and lines that start a block of their own, are not swallowed.
const STARTS_BLOCK = /^[ \t]*(?:$|#{1,6}(?:[ \t]|$)|>|[-*+][ \t]|\d{1,9}[.)][ \t]|```|~~~|(?:[-*_][ \t]*){3,}$)/;

// Bullet list, numbered list, task list, quote: toggle a prefix on every selected line. The three lists replace
// each other (a task keeps its bullet or number); the quote takes the whole block around a cursor.
export function toggleBlock(view, kind) {
  if (view.state.readOnly) return false;
  const lines = selectedLines(view.state, kind === 'quote');
  const parts = (l) => {
    const b = body(l);
    const m = LIST.exec(b.text);
    return { b, m, box: m && BOX.exec(b.text.slice(m[0].length)) };
  };
  const is = (l) => {
    if (kind === 'quote') return QUOTE.test(l.text);
    const { m, box } = parts(l);
    return !!m && (kind === 'task' ? !!box : !box && (kind === 'ol') === /\d/.test(m[2]));
  };
  const all = lines.every(is);
  let n = 0;
  const changes = lines.map((l) => {
    if (kind === 'quote') {
      if (all) return { from: l.from, to: l.from + QUOTE.exec(l.text)[0].length };
      return is(l) ? [] : { from: l.from, insert: '> ' };
    }
    const { b, m, box } = parts(l);
    const indent = m ? m[1] : /^[ \t]*/.exec(b.text)[0];
    const from = b.at + indent.length;
    const to = m ? b.at + m[0].length + (box ? box[0].length : 0) : from;
    const pad = indent ? '' : b.pad;
    if (all) return { from, to, insert: '' };
    if (kind === 'task') return box ? [] : m ? { from: to, insert: '[ ] ' } : { from, insert: pad + '- [ ] ' };
    return { from, to, insert: pad + (kind === 'ol' ? `${++n}. ` : '- ') };
  });
  // Making list items in a Markdown tab: they are the selected lines and no more. When the line after them
  // would be swallowed into the last item, a blank line ends the list there, so that Markdown agrees with
  // what the source shows. Inserted at the start of that next line rather than at the end of the item, so a
  // cursor at the end of the item stays on it. Plain-text tabs are left alone: nothing renders there.
  if (kind !== 'quote' && !all && view.dom.classList.contains('mt-md')) {
    const { doc } = view.state;
    const last = lines[lines.length - 1];
    if (last.number < doc.lines) {
      const next = doc.line(last.number + 1);
      if (!STARTS_BLOCK.test(next.text)) changes.push({ from: next.from, insert: '\n' });
    }
  }
  return runLines(view, changes);
}

// _Italic_ with underscores (easier to tell from **bold**), or with asterisks inside a word (where CommonMark
// does not accept underscores) and next to an underscore (__*x*__ rather than ___x___). Any italic (either mark) is recognised and removed.
const LETTER = /[\p{L}\p{N}]/u;
export function toggleItalic(view) {
  if (view.state.readOnly) return false;
  const { state } = view;
  return run(view, state.changeByRange((r) => {
    const span = formatSpanAt(state, r.from, r.to, 'Emphasis');
    if (span) {
      const len = span[0].to - span[0].from;
      return { changes: span, range: EditorSelection.range(r.anchor - len, r.head - len) };
    }
    const text = state.sliceDoc(r.from, r.to);
    const c = text[0];
    if (text.length >= 3 && (c === '_' || c === '*') && text[text.length - 1] === c && text[1] !== c && text[text.length - 2] !== c) {
      return { changes: { from: r.from, to: r.to, insert: text.slice(1, -1) }, range: EditorSelection.range(r.from, r.to - 2) };
    }
    const w = r.empty && wordAt(state, r.head); // no selection: the word at the cursor
    const from = w ? w.from : r.from, to = w ? w.to : r.to;
    const around = state.sliceDoc(from - 1, from) + state.sliceDoc(to, to + 1);
    const mark = LETTER.test(around) || around.includes('_') ? '*' : '_'; // inside a word, or next to __bold__: asterisks
    return { changes: [{ from, insert: mark }, { from: to, insert: mark }], range: w ? EditorSelection.cursor(r.head + 1) : EditorSelection.range(r.from + 1, r.to + 1) };
  }));
}

// Code block: removes the fences of the block around the cursor; otherwise fences the selected lines, or the
// block the cursor is in, or makes an empty block on an empty line (the cursor inside).
export function insertCodeBlock(view) {
  if (view.state.readOnly) return false;
  const { state } = view;
  const r = state.selection.main;
  const fence = fenceAt(state, r.from, r.to);
  if (fence) {
    const changes = [{ from: fence.open.from, to: Math.min(fence.open.to + 1, state.doc.length) }];
    if (fence.close) changes.push({ from: fence.close.from - 1, to: fence.close.to });
    return run(view, { changes });
  }
  const line = state.doc.lineAt(r.from);
  if (r.empty && !line.text.trim()) {
    return run(view, { changes: { from: line.from, to: line.to, insert: '```\n\n```' }, selection: { anchor: line.from + 4 } });
  }
  const [first, last] = r.empty ? blockAt(state, line) : [line, state.doc.lineAt(r.to)];
  return run(view, {
    changes: [{ from: first.from, insert: '```\n' }, { from: last.to, insert: '\n```' }],
    selection: r.empty ? { anchor: r.head + 4 } : EditorSelection.range(first.from + 4, last.to + 4),
  });
}

// [text](https://) with the URL placeholder selected; the text is the selection, else the word at the cursor.
export function insertLink(view) {
  if (view.state.readOnly) return false;
  const { state } = view;
  const r = state.selection.main;
  const { from, to } = (r.empty && wordAt(state, r.head)) || r;
  const text = state.sliceDoc(from, to) || 'link';
  const insert = `[${text}](https://)`;
  const urlFrom = from + text.length + 3;
  return run(view, { changes: { from, to, insert }, selection: EditorSelection.range(urlFrom, urlFrom + 8) });
}

// Horizontal rule on its own line, after a blank line (so it is never read as a heading underline).
export function insertRule(view) {
  if (view.state.readOnly) return false;
  const { state } = view;
  const l = state.doc.lineAt(state.selection.main.head);
  if (!l.text.trim()) {
    return run(view, { changes: { from: l.from, to: l.to, insert: '---\n' }, selection: { anchor: l.from + 4 } });
  }
  return run(view, { changes: { from: l.to, insert: '\n\n---\n' }, selection: { anchor: l.to + 6 } });
}

export const FORMATS = {
  bold: (v) => toggleInline(v, '**'),
  italic: toggleItalic,
  strike: (v) => toggleInline(v, '~~'),
  highlight: (v) => toggleInline(v, '=='),
  code: (v) => toggleInline(v, '`'),
  h1: (v) => toggleHeading(v, 1),
  h2: (v) => toggleHeading(v, 2),
  h3: (v) => toggleHeading(v, 3),
  h4: (v) => toggleHeading(v, 4), // shortcuts only: the bar keeps H1 to H3
  h5: (v) => toggleHeading(v, 5),
  h6: (v) => toggleHeading(v, 6),
  ul: (v) => toggleBlock(v, 'ul'),
  ol: (v) => toggleBlock(v, 'ol'),
  tasklist: (v) => toggleBlock(v, 'task'),
  quote: (v) => toggleBlock(v, 'quote'),
  codeblock: insertCodeBlock,
  link: insertLink,
  hr: insertRule,
};

// Shortcuts, in plain-text and Markdown tabs (keys in SHORTCUTS): each does exactly what its button does.
// The rule and the headings are on keys matched by their position instead (editor.js).
export const formatKeymap = Object.keys(FORMATS).filter((n) => SHORTCUTS[n] && n !== 'hr' && !/^h[1-6]$/.test(n)).map((n) => {
  const s = SHORTCUTS[n];
  return typeof s === 'string' ? { key: s, run: FORMATS[n], preventDefault: true } : { key: s.win, mac: s.mac, run: FORMATS[n], preventDefault: true };
});
