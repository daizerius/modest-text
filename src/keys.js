// Shortcuts that sit on punctuation keys are matched by the key's physical position, never by the
// character it prints, so that they are the same two keys on every keyboard layout.
//
// Why: a browser reports three things about a key. `event.code` is the physical position, named after the
// US layout and the same everywhere. `event.key` is the character the layout actually prints. `keyCode` is
// legacy and usually follows the US position, which is why CodeMirror's own fallback rescues most of these
// — but only when the key produced a single character. On a French AZERTY keyboard the key right of P is
// the dead `^`, whose `event.key` is the four-letter string "Dead", so that fallback never runs and
// Cmd/Ctrl+[ was simply lost. Matching on `event.code` has no such hole.
//
// The keys below are the ones the app binds: previous / next tab, the shortcut sheet, indent / outdent,
// and the horizontal rule (the key right of 0, where "-" is on a US keyboard).
export const PHYS = { Comma: ',', Period: '.', Slash: '/', BracketLeft: '[', BracketRight: ']', Minus: '-' };

// The US character for the physical key that was pressed, or '' when that key is not one of the five.
// Matching is strictly by position: on a French AZERTY keyboard the key that prints "," is the US M
// position, and it is *not* previous-tab — previous-tab stays on the key right of it, where "," is on a US
// keyboard. Only a browser that reports no `code` at all falls back to the character.
export const physKey = (e) => (e.code ? PHYS[e.code] || '' : (e.key || '').toLowerCase());

// Letters and digits: the character the key prints when it is a Latin letter or a digit, as in every
// app (Cmd+Z is wherever Z is printed, on AZERTY too) — and the key's position when it prints anything
// else: a Russian, Greek or Hebrew layout (Ctrl+F prints "а"), a dead key, Shift+digit on a US keyboard
// ("!"). That is CodeMirror's own fallback, so the app's shortcuts answer on every layout as its
// formatting shortcuts already did. Other keys come back as `event.key` in lower case ("f3", "enter").
export function charKey(e) {
  const k = (e.key || '').toLowerCase();
  if (/^[a-z0-9]$/.test(k)) return k;
  const m = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(e.code || '');
  return m ? (m[1] || m[2]).toLowerCase() : k;
}

// ---------------------------------------------------------------- what the key actually prints
// Tooltips and the shortcut sheet name these keys as the user's own keyboard prints them: `Cmd+$` on a
// French AZERTY keyboard rather than `Cmd+]`, because that is the key they have to press. Chromium exposes
// the layout through the Keyboard Map API; Firefox does not, and there the US character is shown, which is
// what the shortcut is called everywhere else anyway.
const printed = new Map(); // US character -> the character this keyboard prints on that key
export const keyFace = (usChar) => printed.get(usChar) || usChar;

// Reads the layout once at startup. `onChange` re-renders the labels, and only runs when the layout
// actually differs from US, so a US keyboard never causes a second render.
export function loadLayout(onChange) {
  const kb = navigator.keyboard;
  if (!kb || typeof kb.getLayoutMap !== 'function') return;
  let map;
  try { map = kb.getLayoutMap(); } catch { return; }
  Promise.resolve(map).then((layout) => {
    let changed = false;
    for (const [code, us] of Object.entries(PHYS)) {
      const face = layout.get(code);
      // A dead key reports its own accent (or nothing); showing it is still better than showing a key the
      // user does not have. An empty face means the layout has no such key: keep the US name.
      if (face && face !== us) { printed.set(us, face.length === 1 ? face.toUpperCase() : face); changed = true; }
    }
    if (changed) onChange();
  }).catch(() => { /* no layout information: the US names stand */ });
}
