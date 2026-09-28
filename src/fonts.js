// Local font detection by comparing rendered widths against generic fallbacks
// (document.fonts.check() is unreliable for local fonts).
//
// The font menu has two sections:
//   - Markdown text: the font of Markdown prose, in every Markdown tab (default Georgia);
//   - Source and code: the monospace font of plain-text tabs and of code in Markdown
//     (default: first installed of Consolas, Menlo, Courier New; Cascadia Mono comes with Windows 11).
// SF Mono is not offered: macOS hides it from web pages by name, and Chrome and Firefox do not
// support the `ui-monospace` generic that reaches it in Safari.

export const FONT_GROUPS = [
  { kind: 'md', key: 'fontGroupMd', fonts: [['Georgia', 'serif'], ['Times New Roman', 'serif'], ['Arial', 'sans-serif'], ['Verdana', 'sans-serif']] },
  { kind: 'mono', key: 'fontGroupMono', fonts: [['Cascadia Mono', 'monospace'], ['Consolas', 'monospace'], ['Courier New', 'monospace'], ['Menlo', 'monospace']] },
];

export const DEFAULT_MD_ORDER = ['Georgia', 'Times New Roman'];
export const DEFAULT_MONO_ORDER = ['Consolas', 'Menlo', 'Courier New'];

const SAMPLE = 'mmmmmmmmmmlli WwQq@#0Oo1Il|.,;:1234567890 AaBbCcÉéàç';

export function detectFonts() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const width = (family) => {
    ctx.font = `72px ${family}`;
    return ctx.measureText(SAMPLE).width;
  };
  const generics = ['monospace', 'serif', 'sans-serif'];
  const base = Object.fromEntries(generics.map((g) => [g, width(g)]));
  const installed = {};
  for (const g of FONT_GROUPS) {
    for (const [f] of g.fonts) {
      installed[f] = generics.some((gen) => Math.abs(width(`"${f}", ${gen}`) - base[gen]) > 0.5);
    }
  }
  return installed;
}

export const kindOf = (font) => FONT_GROUPS.find((g) => g.fonts.some(([f]) => f === font))?.kind || null;
export const genericOf = (font) => FONT_GROUPS.flatMap((g) => g.fonts).find(([f]) => f === font)?.[1] || 'monospace';

export function defaultFont(kind, installed) {
  return (kind === 'md' ? DEFAULT_MD_ORDER : DEFAULT_MONO_ORDER).find((f) => installed[f]) || null;
}

export function cssFamily(font, generic) {
  return font ? `"${font}", ${generic}` : generic;
}
