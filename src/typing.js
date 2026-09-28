// Helpers while typing, in both modes.
//  - Paired characters: with text selected, typing an opening quote or bracket encloses the selection in the
//    pair instead of replacing it (the text stays selected, so pairs can be nested). Each wrap is one undo step.
//  - Task marks: typing "- []" or "- [  ]" at the start of a list item gives the standard "- [ ]" (GFM needs
//    exactly one character between the brackets). Its own undo step: Cmd/Ctrl+Z right after takes it back.
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';

export const PAIRS = { '"': '"', "'": "'", '`': '`', '(': ')', '[': ']', '{': '}', '<': '>', '«': '»', '“': '”', '‘': '’' };
const TASK = /^((?:[ \t]*>[ \t]?)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)\[( *)\]$/;

export function typingHelpers(inCode) {
  return EditorView.inputHandler.of((view, from, to, text) => {
    const { state } = view;
    if (state.readOnly || !text || text.length > 20) return false;
    if (PAIRS[text] && state.selection.ranges.some((r) => !r.empty)) {
      view.dispatch(state.update(state.changeByRange((r) => (r.empty
        ? { changes: { from: r.from, insert: text }, range: EditorSelection.cursor(r.from + 1) }
        : { changes: [{ from: r.from, insert: text }, { from: r.to, insert: PAIRS[text] }], range: EditorSelection.range(r.anchor + 1, r.head + 1) })),
      { scrollIntoView: true, userEvent: 'input.type', annotations: isolateHistory.of('full') })); // each wrap: its own undo step
      return true;
    }
    // Task marks: read the line before the insertion (no trial transaction: that would re-run the parser).
    if (!text.includes(']') || /\n/.test(text)) return false;
    const l = state.doc.lineAt(from);
    const m = TASK.exec(state.sliceDoc(l.from, from) + text);
    if (!m || m[2].length === 1 || inCode(state, from)) return false;
    const end = from + text.length;
    view.dispatch(state.update({ changes: { from, to, insert: text }, selection: { anchor: end }, scrollIntoView: true, userEvent: 'input.type' }));
    view.dispatch({ changes: { from: l.from + m[1].length, to: end, insert: '[ ]' }, selection: { anchor: l.from + m[1].length + 3 }, annotations: isolateHistory.of('full'), userEvent: 'input.type.helper' });
    return true;
  });
}
