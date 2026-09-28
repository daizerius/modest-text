// CodeMirror setup: extensions, per-tab editor states, paste, view updates.
import { EditorState, EditorSelection, Compartment, Annotation, Transaction, Prec } from '@codemirror/state';
import { EditorView, keymap, runScopeHandlers } from '@codemirror/view';
import { history, undo, redo, standardKeymap, indentLess, indentMore, moveLineUp, moveLineDown, copyLineUp, copyLineDown, deleteLine, selectLine, insertBlankLine, simplifySelection } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { cleanText } from './text.js';
import { markdownExtensions, markdownLanguage, listEditing, linkPaste, inAnyCode } from './markdown.js';
import { typingHelpers } from './typing.js';
import { renumberLists } from './lists.js';
import { findExtension, findViewUpdate } from './find.js';
import { FORMATS, formatKeymap } from './format.js';
import { physKey } from './keys.js';
import { S, activeTab, isMac, newId, settings, t } from './state.js';
import { markDirty } from './persist.js';
import { renderSelectionCounts, scheduleCounts } from './statusbar.js';
import { autoName } from './tabs.js';
import { renderActiveFormats, updateHistButtons } from './toolbar.js';

// ---------------------------------------------------------------- editor
export const External = Annotation.define();
export const modeC = new Compartment();
export const wrapC = new Compartment();
export const roC = new Compartment();
export const labelC = new Compartment();

export function openLink(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.append(a);
  a.click();
  a.remove();
}

export const mdExt = markdownExtensions(() => t, openLink);

export function insertTab(v) {
  if (v.state.readOnly) return false;
  v.dispatch(v.state.update(v.state.replaceSelection('\t'), { scrollIntoView: true, userEvent: 'input' }));
  return true;
}

// Shift+Cmd/Ctrl+Enter: a new line above the cursor's line, with its indentation, the cursor on it — the
// counterpart of Cmd/Ctrl+Enter's line below (VS Code, Sublime Text).
export function insertLineAbove(v) {
  const { state } = v;
  if (state.readOnly) return false;
  v.dispatch(state.update(state.changeByRange((r) => {
    const line = state.doc.lineAt(r.head);
    const indent = /^[ \t]*/.exec(line.text)[0];
    return { changes: { from: line.from, insert: indent + state.lineBreak }, range: EditorSelection.cursor(line.from + indent.length) };
  }), { scrollIntoView: true, userEvent: 'input' }));
  return true;
}

// Shortcuts on keys matched by physical position (keys.js): Shift+Cmd/Ctrl with 8, 7, 9 (bullets, numbers,
// tasks: Word and Google Docs) and with the key right of 0 (a rule: it writes "---").
const PHYS_FORMATS = { Digit8: 'ul', Digit7: 'ol', Digit9: 'tasklist', Minus: 'hr' };

export function handlePaste(e, v) {
  const dt = e.clipboardData;
  if (!dt) return false;
  e.preventDefault();
  if (v.state.readOnly) return true;
  let text = dt.getData('text/plain');
  if (!text) {
    const h = dt.getData('text/html');
    if (h) {
      const doc = new DOMParser().parseFromString(h, 'text/html');
      // WebKit puts an ordinary space on the clipboard as <span class="Apple-converted-space">&nbsp;</span>.
      // That NBSP is its own doing, not one the author typed, so it goes back to a space; an NBSP the
      // author really did type is anywhere else in the markup and is kept.
      for (const s of doc.querySelectorAll('span.Apple-converted-space')) s.textContent = s.textContent.replace(/ /g, ' ');
      text = doc.body.textContent || '';
    }
  }
  text = cleanText(text);
  const link = text ? linkPaste(v.state, text) : null; // an address pasted over selected text makes a link (both modes)
  if (link) { v.dispatch(v.state.update(link, { scrollIntoView: true, userEvent: 'input.paste' })); return true; }
  if (text) v.dispatch(v.state.update(v.state.replaceSelection(text), { scrollIntoView: true, userEvent: 'input.paste' }));
  return true;
}

export const baseExt = [
  history(),
  EditorState.tabSize.of(4),
  indentUnit.of('\t'),
  Prec.highest(keymap.of([
    { key: 'Mod-z', run: undo, preventDefault: true },
    { key: 'Mod-Shift-z', run: redo, preventDefault: true },
    { key: 'Mod-y', run: redo, preventDefault: true },
    { key: 'Ctrl-y', run: redo, preventDefault: true },
  ])),
  markdownLanguage.extension, // Markdown is parsed in both modes (formats under the cursor, code detection)
  listEditing, // lists and quotes: Enter continues, Tab indents, Backspace removes a marker (both modes)
  Prec.high(keymap.of(formatKeymap)), // Markdown formatting shortcuts, in both modes
  // CodeMirror's standard keys (cursor, selection, deletion, Enter, select all) and, of its other default keys, only
  // the line commands documented in Help. Left out: its Tab-focus toggle (Ctrl+M / Shift+Option+M: Esc then Tab
  // already leaves the text, and Shift+Option+M must keep typing its character on a Mac), extra cursors (out of
  // scope), comments, bracket matching and syntax-based selection (nothing to act on here).
  keymap.of([
    { key: 'Tab', run: insertTab }, { key: 'Shift-Tab', run: indentLess },
    ...standardKeymap.filter((b) => !/^(Shift-)?Mod-u$/.test(b.key)),
    { key: 'Alt-ArrowUp', run: moveLineUp }, { key: 'Shift-Alt-ArrowUp', run: copyLineUp },
    { key: 'Alt-ArrowDown', run: moveLineDown }, { key: 'Shift-Alt-ArrowDown', run: copyLineDown },
    // Select line: Cmd+L on a Mac (VS Code's key; the address bar gives it up, see main.js), Alt+L elsewhere
    // (Ctrl+L stays the address bar there).
    { key: 'Shift-Mod-k', run: deleteLine }, { key: 'Alt-l', mac: 'Mod-l', run: selectLine, preventDefault: true },
    { key: 'Mod-Enter', run: insertBlankLine }, { key: 'Shift-Mod-Enter', run: insertLineAbove },
    { key: 'Escape', run: simplifySelection },
  ]),
  // Indent / outdent on the two keys right of P, by physical position: CodeMirror's keymap can only match
  // the character a key prints, which loses the pair on any layout where one of them is a dead key (the
  // French `^`). A DOM handler is the only place `event.code` is available, so the binding lives here
  // rather than in the keymap above.
  // The digits and "-" of PHYS_FORMATS are matched the same way.
  // Caps Lock: with Shift and Caps Lock both on, a letter arrives in lower case, and off a Mac CodeMirror
  // then matches the unshifted binding — Ctrl+Shift+Z undid, Ctrl+Shift+K made a link. The key is replayed
  // as the capital letter that Shift alone sends, and the lower-case one is never let through.
  Prec.highest(EditorView.domEventHandlers({
    keydown(e, view) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && /^[a-z]$/.test(e.key) && /^Key[A-Z]$/.test(e.code)) {
        const up = new KeyboardEvent('keydown', { key: e.key.toUpperCase(), code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: true });
        Object.defineProperty(up, 'keyCode', { get: () => e.code.charCodeAt(3) }); // 'KeyZ' -> 90, as hardware
        if (runScopeHandlers(view, up, 'editor')) e.preventDefault();
        return true;
      }
      // Headings 1 to 6: Option+Cmd+digit on a Mac, Ctrl+Shift+digit elsewhere, by the digit key's position.
      // On some Mac layouts Option+6 is a dead key (event.key "Dead"), which CodeMirror's keymap cannot
      // match: heading 6 did nothing in Firefox on a Mac.
      const hd = /^Digit([1-6])$/.exec(e.code || '');
      if (hd && (isMac ? e.metaKey && e.altKey && !e.shiftKey && !e.ctrlKey : e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey)) {
        e.preventDefault();
        FORMATS['h' + hd[1]](view);
        return true;
      }
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod || e.altKey) return false;
      if (e.shiftKey) {
        const name = PHYS_FORMATS[e.code];
        if (!name) return false;
        e.preventDefault();
        FORMATS[name](view);
        return true;
      }
      const p = physKey(e);
      if (p !== '[' && p !== ']') return false;
      e.preventDefault();
      return (p === ']' ? indentMore : indentLess)(view);
    },
  })),
  // autocorrect "on", not "off": on a Mac that attribute gates the system's text substitutions, and
  // "off" was switching off Text Replacement (System Settings -> Keyboard) along with them. Measured
  // in a plain contenteditable: Chromium and Firefox expand a replacement only with it on — Firefox
  // needs it stated, since leaving the attribute out is not enough — while Safari expands either way.
  // autocapitalize stays off: it is its own switch, and an editor should not capitalise for you.
  EditorView.contentAttributes.of({ autocorrect: 'on', autocapitalize: 'off', translate: 'no' }),
  findExtension, // Cmd/Ctrl+F: matches highlighted in the active tab
  EditorView.clipboardInputFilter.of((text) => cleanText(text)),
  EditorView.domEventHandlers({ paste: handlePaste }),
  typingHelpers(inAnyCode), // paired characters around a selection, standard task marks
  renumberLists, // numbered lists stay 1., 2., 3. … after every edit
  EditorView.updateListener.of((u) => onViewUpdate(u)),
];

export const modeExt = (mode) => (mode === 'md' ? mdExt : []);
export const wrapExt = (mode) => (mode === 'md' || settings.wrap ? EditorView.lineWrapping : []);
export const roExt = (tab) => (S.role !== 'editor' || tab.help ? [EditorState.readOnly.of(true)] : []);
// Per tab: its accessible name, and the language of its text. Spell checking is the browser's: CodeMirror turns
// it off by default, so the attribute is set back to "true" and the browser's own setting decides whether to
// check (and its context menu turns it on or off). `lang` picks the dictionary, French or English.
export const labelExt = (tab, text = tab.state?.doc) => EditorView.contentAttributes.of({
  'aria-label': t('editor', { name: tab.name }), spellcheck: tab.help ? 'false' : 'true', lang: tabLang(text),
});
// French or English, from common words at the start of the text; otherwise the interface language.
const FR_WORDS = /\b(le|la|les|des|une|est|et|que|qui|dans|pour|pas|sur|avec|je|vous|nous|cette|mais|du|au|aux|ne|plus|être)\b/g;
const EN_WORDS = /\b(the|and|is|are|of|to|in|that|it|for|with|on|this|was|you|not|be|have|but|they|at|from|or)\b/g;
export function tabLang(text) {
  const s = (typeof text === 'string' ? text.slice(0, 20000) : text ? text.sliceString(0, 20000) : '').toLowerCase();
  const fr = (s.match(FR_WORDS) || []).length, en = (s.match(EN_WORDS) || []).length;
  return fr > en * 1.2 ? 'fr' : en > fr * 1.2 ? 'en' : S.lang;
}

export function createState(tab, content) {
  return EditorState.create({
    doc: content,
    extensions: [baseExt, modeC.of(modeExt(tab.mode)), wrapC.of(wrapExt(tab.mode)), roC.of(roExt(tab)), labelC.of(labelExt(tab, content))],
  });
}

// `auto`: the tab still carries the name it was given automatically, so a first heading in its text may
// rename it (see autoName in tabs.js). A rename by hand, or an import, turns it off for good.
export function makeTab({ id = newId(), name, mode = 'plain', content = '', state = null, rev = 0, savedAt = null, help = false, auto = false }) {
  const tab = { id, name, mode, rev, savedAt, help, auto, defaultName: name, dirty: false, failed: false, scrollTop: 0, scrollLeft: 0 };
  tab.state = state || createState(tab, content);
  return tab;
}


export function syncView(tab) {
  if (!S.view || !tab) return;
  S.view.dispatch({
    effects: [
      modeC.reconfigure(modeExt(tab.mode)),
      wrapC.reconfigure(wrapExt(tab.mode)),
      roC.reconfigure(roExt(tab)),
      labelC.reconfigure(labelExt(tab)),
    ],
  });
}

// The language of a tab — which picks the browser's spell-check dictionary — follows its text as it is typed,
// so a new tab written in French is marked "fr" without switching tabs. It is guessed from up to 20,000
// characters, so it is worked out once typing pauses, and the editor is reconfigured only when it changes.
let langTimer = null;
function scheduleLang(tab) {
  clearTimeout(langTimer);
  langTimer = setTimeout(() => {
    if (!S.view || tab !== activeTab() || tab.help) return;
    if (S.view.contentDOM.getAttribute('lang') !== tabLang(S.view.state.doc)) syncView(tab);
  }, 800);
}

// A tab named from its first heading follows the text, but only once typing pauses: renaming on every
// keystroke would rewrite the tab strip letter by letter.
let autoNameTimer = null;
export function scheduleAutoName(tab) {
  if (!tab.auto) return;
  clearTimeout(autoNameTimer);
  autoNameTimer = setTimeout(() => autoName(tab), 400);
}

export function onViewUpdate(u) {
  const tab = activeTab();
  if (!tab || !S.view || u.view !== S.view) return;
  tab.state = u.state;
  if (u.docChanged) {
    if (!u.transactions.some((tr) => tr.annotation(External))) markDirty(tab);
    scheduleCounts();
    scheduleAutoName(tab);
    scheduleLang(tab);
    updateHistButtons();
  } else if (u.selectionSet) renderSelectionCounts();
  renderActiveFormats();
  findViewUpdate(u);
}

export function replaceTabContent(tab, content) {
  const spec = {
    changes: { from: 0, to: tab.state.doc.length, insert: content },
    annotations: [External.of(true), Transaction.addToHistory.of(false)],
  };
  if (tab === activeTab() && S.view) S.view.dispatch(spec);
  else tab.state = tab.state.update(spec).state;
}
