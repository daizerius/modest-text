// List structure helpers, in both modes (they work on the text, line by line):
//  - numbered lists are renumbered after every edit that touches them (1., 2., 3. … from the first item's number);
//  - Option/Alt+↑ ↓ on a list item moves it together with its sub-items;
//  - Cmd/Ctrl+Enter checks or unchecks the tasks on the selected lines.
import { EditorState, EditorSelection } from '@codemirror/state';

const QUOTE = /^(?:[ \t]*>[ \t]?)*/; // quote marks only (leading spaces are indentation)
const ITEM = /^([ \t]*)([-*+]|(\d{1,9})([.)]))([ \t]+|$)/;

// A line split into its quote prefix, indentation and list marker (if any).
function parse(text) {
  const qp = QUOTE.exec(text)[0];
  const rest = text.slice(qp.length);
  const m = ITEM.exec(rest);
  const indent = /^[ \t]*/.exec(rest)[0].replace(/\t/g, '    ').length;
  return { qp: qp.replace(/[ \t]+$/, ''), rest, m, indent, blank: !rest.trim(), num: m && m[3] ? Number(m[3]) : null };
}

// The lines of the item at line `n` (1-based): the item line, then its sub-items and continuation lines (deeper
// indentation), blank lines included only when more of the item follows.
function itemEnd(doc, n, max = doc.lines) {
  const head = parse(doc.line(n).text);
  let end = n;
  for (let k = n + 1; k <= max && k <= n + 2000; k++) {
    const p = parse(doc.line(k).text);
    if (p.qp !== head.qp) break;
    if (p.blank) continue;
    if (p.indent > head.indent) { end = k; continue; }
    break;
  }
  return end;
}

// ---------------------------------------------------------------- renumbering
// The first numbered item of the list that line n belongs to (same quote and indentation), or 0.
function runStart(doc, n, at) {
  const same = (p) => p.qp === at.qp && p.m && p.indent === at.indent;
  const inside = (p) => p.qp === at.qp && (p.blank || p.indent > at.indent);
  let first = 0;
  for (let k = n; k >= 1 && k > n - 2000; k--) {
    const p = parse(doc.line(k).text);
    if (same(p)) { if (p.num === null) break; first = k; } else if (!inside(p)) break;
  }
  return first;
}

// The list keeps the number it started with before the edit (moving or deleting its first item does not change
// it); a list that did not exist before starts with the number typed.
function renumberRun(doc, n, changes, done, before) {
  const at = parse(doc.line(n).text);
  if (at.num === null) return;
  const same = (p) => p.qp === at.qp && p.m && p.indent === at.indent;
  const inside = (p) => p.qp === at.qp && (p.blank || p.indent > at.indent);
  const first = runStart(doc, n, at);
  if (!first || done.has(first)) return;
  done.add(first);
  let expect = parse(doc.line(first).text).num;
  const { oldDoc, toOld } = before();
  const o = oldDoc.lineAt(toOld(doc.line(first).from)).number;
  const oldFirst = runStart(oldDoc, o, at);
  if (oldFirst) expect = parse(oldDoc.line(oldFirst).text).num;
  for (let k = first; k <= doc.lines && k < first + 4000; k++) {
    const line = doc.line(k);
    const p = parse(line.text);
    if (same(p)) {
      if (p.num === null) break;
      if (p.num !== expect) {
        const from = line.from + (line.text.length - p.rest.length) + p.m[1].length; // the number itself
        changes.push({ from, to: from + p.m[3].length, insert: String(expect) });
      }
      expect++;
    } else if (!inside(p)) break;
  }
}

export const renumberLists = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !(tr.isUserEvent('input') || tr.isUserEvent('delete') || tr.isUserEvent('move'))) return tr;
  const doc = tr.newDoc;
  const changes = [], done = new Set();
  let old = null; // the document before the edit, and a way back to it (computed only when a list is found)
  const before = () => old || (old = { oldDoc: tr.startState.doc, toOld: ((inv) => (pos) => inv.mapPos(pos, -1))(tr.changes.invert(tr.startState.doc)) });
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    const a = doc.lineAt(fromB).number, b = doc.lineAt(toB).number;
    for (let n = a; n <= b; n++) renumberRun(doc, n, changes, done, before); // only the lists the edit touches
  });
  return changes.length ? [tr, { changes, sequential: true }] : tr;
});

// ---------------------------------------------------------------- moving an item with its sub-items
// The list item that line n belongs to: n itself when it is an item, else the nearest item above whose
// extent (sub-items and indented continuation lines, see itemEnd) reaches down to n. 0 when there is none —
// including a lazy continuation line at the left margin, which itemEnd does not count as part of an item.
function owningItem(doc, n) {
  if (parse(doc.line(n).text).m) return n;
  for (let k = n - 1; k >= 1 && k > n - 200; k--) {
    const p = parse(doc.line(k).text);
    if (p.m && itemEnd(doc, k) >= n) return k;
    if (!p.blank && !p.m && p.indent === 0) return 0; // a paragraph outside any list: no owner
  }
  return 0;
}

// Option/Alt+↑ ↓ in a list moves the block the cursor is in — the item with its sub-items — at the level it
// is at, among its siblings. A cursor on a continuation line moves the item that line belongs to.
//  - Next to a sibling: the two items, each with its sub-items, change places.
//  - Next to something shallower (the block would leave its parent): it changes places with that one line
//    and keeps its own indentation, so it keeps its relative level — the last child of one item going down
//    becomes the first child of the next.
//  - Next to a blank line: it changes places with that blank line only, never with the block on the far
//    side of it. Crossing a gap in the text is one line at a time, and the block stays whole while it does.
function moveItem(view, dir) {
  const { state } = view;
  const { doc } = state;
  const r = state.selection.main;
  if (state.readOnly || state.selection.ranges.length > 1) return false;
  const start = owningItem(doc, doc.lineAt(r.from).number);
  if (!start) return false; // not in a list: the usual line move
  const head = parse(doc.line(start).text);
  const end = itemEnd(doc, start);
  if (doc.lineAt(r.to).number > end) return false; // a selection wider than the block: the usual line move
  if (dir < 0 ? start === 1 : end === doc.lines) return true; // at the edge of the document: nothing to do
  const nextTo = dir < 0 ? start - 1 : end + 1;
  const sibling = (p) => p.qp === head.qp && p.m && p.indent === head.indent;
  let a, b; // the two blocks to swap, as line ranges [a0, a1] (upper) and [b0, b1] (lower)
  if (parse(doc.line(nextTo).text).blank) {
    // A blank line alongside: swap with it alone.
    if (dir < 0) { a = [nextTo, nextTo]; b = [start, end]; } else { a = [start, end]; b = [nextTo, nextTo]; }
  } else if (dir < 0) {
    // The previous sibling with its sub-items, or else just the line above (leaving the parent).
    let s = nextTo;
    for (let j = nextTo; j >= 1 && j > nextTo - 2000; j--) {
      const p = parse(doc.line(j).text);
      if (sibling(p)) { s = j; break; }
      if (!(p.qp === head.qp && !p.blank && p.indent > head.indent)) break;
    }
    const sEnd = sibling(parse(doc.line(s).text)) ? itemEnd(doc, s, start - 1) : start - 1;
    a = [s, sEnd]; b = [start, end];
  } else {
    const p = parse(doc.line(nextTo).text);
    a = [start, end]; b = [nextTo, sibling(p) ? itemEnd(doc, nextTo) : nextTo];
  }
  const from = doc.line(a[0]).from, to = doc.line(b[1]).to;
  const upper = doc.sliceString(doc.line(a[0]).from, doc.line(a[1]).to);
  const gap = doc.sliceString(doc.line(a[1]).to, doc.line(b[0]).from); // the line break between the two
  const lower = doc.sliceString(doc.line(b[0]).from, doc.line(b[1]).to);
  const shift = dir < 0 ? from - doc.line(b[0]).from : lower.length + gap.length;
  view.dispatch(state.update({
    changes: { from, to, insert: lower + gap + upper },
    selection: EditorSelection.range(r.anchor + shift, r.head + shift),
    scrollIntoView: true, userEvent: 'move.line',
  }));
  return true;
}
export const moveItemUp = (view) => moveItem(view, -1);
export const moveItemDown = (view) => moveItem(view, 1);

// ---------------------------------------------------------------- tasks
const TASK = /^((?:[ \t]*>[ \t]?)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[)([ xX])\]/;
export function toggleTasks(view) {
  const { state } = view;
  if (state.readOnly) return false;
  const changes = [];
  const seen = new Set();
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const line = state.doc.line(n);
      const m = TASK.exec(line.text);
      if (m) changes.push({ from: line.from + m[1].length, to: line.from + m[1].length + 1, insert: m[2] === ' ' ? 'x' : ' ' });
    }
  }
  if (!changes.length) return false; // not a task: Cmd/Ctrl+Enter keeps its usual meaning
  view.dispatch(state.update({ changes, userEvent: 'input.toggle' }));
  return true;
}
