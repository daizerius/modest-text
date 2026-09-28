// Pure text helpers: cleanup, tab-name cleaning, counts, import decoding.

// Remove U+FEFF, NUL and every other control character except tab and newline;
// normalize CRLF / CR to LF. Everything else (NBSP, ZWJ, ...) is kept.
export function cleanText(s) {
  return String(s)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\uFEFF]/g, '');
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
export const MAX_NAME = 100;

function truncateCodePoints(s, n) {
  const cps = Array.from(s);
  return cps.length > n ? cps.slice(0, n).join('') : s;
}

// Clean a tab name. Returns '' when nothing usable is left.
export function cleanName(raw) {
  let s = String(raw ?? '');
  s = s.replace(/[\u0000-\u001F\u007F-\u009F\\/:*?"<>|]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/[. ]+$/, '');
  if (RESERVED.test(s)) s = '_' + s;
  s = truncateCodePoints(s, MAX_NAME).replace(/[. ]+$/, '');
  return s;
}

// Make `name` unique among `taken` (case-insensitive) with " (2)", " (3)"...
// A .txt / .md extension stays last: "notes.md" -> "notes (2).md".
export function uniqueName(name, taken) {
  const lower = new Set([...taken].map((n) => n.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  const [, stem, ext = ''] = /^(.*?)(\.(?:txt|md))?$/i.exec(name);
  for (let i = 2; ; i++) {
    const suffix = ` (${i})`;
    const base = truncateCodePoints(stem, MAX_NAME - suffix.length - ext.length).replace(/[. ]+$/, '');
    const candidate = base + suffix + ext;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

// "notes.md" + "(conflict)" -> "notes (conflict).md"
export function withSuffix(name, suffix) {
  const [, stem, ext = ''] = /^(.*?)(\.(?:txt|md))?$/i.exec(name);
  return truncateCodePoints(stem, MAX_NAME - suffix.length - 1 - ext.length).replace(/[. ]+$/, '') + ' ' + suffix + ext;
}

// Next "Untitled N" using the smallest unused number.
export function nextDefaultName(prefix, taken) {
  const lower = new Set([...taken].map((n) => n.toLowerCase()));
  for (let i = 1; ; i++) {
    const n = `${prefix} ${i}`;
    if (!lower.has(n.toLowerCase())) return n;
  }
}

export function exportFileName(name, markdown) {
  return /\.(txt|md)$/i.test(name) ? name : name + (markdown ? '.md' : '.txt');
}


export function dedupeFileNames(names) {
  const used = new Set();
  return names.map((n) => {
    let out = n;
    const m = /^(.*?)(\.[^.]*)?$/.exec(n);
    for (let i = 2; used.has(out.toLowerCase()); i++) out = `${m[1]} (${i})${m[2] || ''}`;
    used.add(out.toLowerCase());
    return out;
  });
}

// Counts on the source text.
// Same set as the JS regex \s.
function isSpace(c) {
  return (c >= 9 && c <= 13) || c === 32 || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff;
}

// Lines = line breaks + 1; words = runs of non-whitespace; chars = code points.
// Single pass without allocations, so it stays cheap on a 1 MB document.
export function countText(s) {
  let lines = 1, words = 0, surrogates = 0, inWord = false;
  for (let i = 0, n = s.length; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c === 10) lines++;
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < n) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { surrogates++; i++; if (!inWord) { inWord = true; words++; } continue; }
    }
    if (isSpace(c)) inWord = false;
    else if (!inWord) { inWord = true; words++; }
  }
  return { lines, words, chars: s.length - surrogates };
}

// Import decoding: BOM (UTF-8/UTF-16) -> strict UTF-8 -> Windows-1252.
export function decodeBytes(bytes) {
  const b = bytes;
  let enc, start = 0;
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) { enc = 'utf-8'; start = 3; }
  else if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) { enc = 'utf-16le'; start = 2; }
  else if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) { enc = 'utf-16be'; start = 2; }
  const body = b.subarray(start);
  if (enc) return { text: new TextDecoder(enc).decode(body), encoding: enc };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(body), encoding: 'windows-1252' };
  }
}

export const MAX_IMPORT_BYTES = 1024 * 1024;

// Returns {ok, reason, text, name, markdown}
export function prepareImport(fileName, bytes) {
  if (!/\.(txt|md)$/i.test(fileName)) return { ok: false, reason: 'type' };
  if (bytes.length > MAX_IMPORT_BYTES) return { ok: false, reason: 'size' };
  const { text } = decodeBytes(bytes);
  if (text.includes('\u0000')) return { ok: false, reason: 'binary' };
  return {
    ok: true,
    text: cleanText(text),
    name: fileName, // the tab keeps the full file name, extension included
    markdown: /\.md$/i.test(fileName),
  };
}

export function pad2(n) { return String(n).padStart(2, '0'); }

// The time zone's abbreviation, as the tz database itself writes it: "CET" / "CEST", "EST" / "EDT",
// "AEST" / "AEDT". Intl's own short name only abbreviates the Americas and gives "GMT+2" for the rest of
// the world, so the abbreviation is looked up by the zone's full English name, which Intl does give
// everywhere. The table below was generated once from the tz database (a throwaway script, not kept):
// across the 418 zones Intl knows, these 57 names each map to exactly one abbreviation,
// with no conflicts (the shared trailing " Time" is dropped). Zones the tz database itself writes
// numerically (America/Sao_Paulo is "-03",
// Asia/Dubai is "+04") are deliberately absent, and keep Intl's "GMT+4" form.
// Always English: these are codes, not words.
const TZ_ABBR = {
  'Alaska Daylight': 'AKDT', 'Alaska Standard': 'AKST', 'Atlantic Daylight': 'ADT', 'Atlantic Standard': 'AST',
  'Australian Central Daylight': 'ACDT', 'Australian Central Standard': 'ACST',
  'Australian Eastern Daylight': 'AEDT', 'Australian Eastern Standard': 'AEST',
  'Australian Western Standard': 'AWST', 'British Summer': 'BST', 'Central Africa': 'CAT', 'Central Daylight': 'CDT',
  'Central European Standard': 'CET', 'Central European Summer': 'CEST', 'Central Indonesia': 'WITA',
  'Central Standard': 'CST', 'Chamorro Standard': 'ChST', 'China Standard': 'CST', 'Cuba Daylight': 'CDT',
  'Cuba Standard': 'CST', 'East Africa': 'EAT', 'Eastern Daylight': 'EDT', 'Eastern European Standard': 'EET',
  'Eastern European Summer': 'EEST', 'Eastern Indonesia': 'WIT', 'Eastern Standard': 'EST', 'Greenwich Mean': 'GMT',
  'Hawaii-Aleutian Daylight': 'HDT', 'Hawaii-Aleutian Standard': 'HST', 'Hong Kong Standard': 'HKT',
  'India Standard': 'IST', 'Irish Standard': 'IST', 'Israel Daylight': 'IDT', 'Israel Standard': 'IST',
  'Japan Standard': 'JST', 'Korean Standard': 'KST', 'Mexican Pacific Standard': 'MST', 'Moscow Standard': 'MSK',
  'Mountain Daylight': 'MDT', 'Mountain Standard': 'MST', 'New Zealand Daylight': 'NZDT',
  'New Zealand Standard': 'NZST', 'Newfoundland Daylight': 'NDT', 'Newfoundland Standard': 'NST',
  'Pacific Daylight': 'PDT', 'Pacific Standard': 'PST', 'Pakistan Standard': 'PKT', 'Philippine Standard': 'PST',
  'Samoa Standard': 'SST', 'South Africa Standard': 'SAST', 'Taipei Standard': 'CST', 'Volgograd Standard': 'MSK',
  'West Africa Standard': 'WAT', 'Western European Standard': 'WET', 'Western European Summer': 'WEST',
  'Western Indonesia': 'WIB', 'Yukon': 'MST',
};
let tzLong = null, tzShort = null;
const tzCache = new Map(); // by UTC offset, so winter and summer time each resolve once
export function timeZoneName(d) {
  const key = d.getTimezoneOffset();
  if (tzCache.has(key)) return tzCache.get(key);
  let name = '';
  try {
    tzLong = tzLong || new Intl.DateTimeFormat('en-US', { timeZoneName: 'long' });
    const long = tzLong.formatToParts(d).find((p) => p.type === 'timeZoneName')?.value;
    name = (long && TZ_ABBR[long.replace(/ Time$/, '')]) || ''; // every name in the table ends in " Time"
    if (!name) {
      tzShort = tzShort || new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' });
      name = tzShort.formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || '';
    }
  } catch { /* no Intl time zone data: the stamp goes without it */ }
  tzCache.set(key, name);
  return name;
}

// The save stamp, in ISO date order, widest first. A narrow status bar steps down this ladder (see fitStatus);
// the year is never shortened, and the date goes altogether before the time does.
//   0  2026-09-16 ∙ 14:03:22 EDT    3  20260916 ∙ 14:03
//   1  2026-09-16 ∙ 14:03:22        4  14:03:22
//   2  20260916 ∙ 14:03:22          5  14:03
export function formatStamp(d, sep = ' ∙ ', level = 0) {
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}${level === 3 || level === 5 ? '' : ':' + pad2(d.getSeconds())}`;
  if (level >= 4) return time;
  const dash = level >= 2 ? '' : '-';
  const date = `${d.getFullYear()}${dash}${pad2(d.getMonth() + 1)}${dash}${pad2(d.getDate())}`;
  const tz = level === 0 ? timeZoneName(d) : '';
  return `${date}${sep}${time}${tz ? ' ' + tz : ''}`;
}

// modest-text_20260916_140322.zip: sorts chronologically in Finder and Explorer.
export function zipStamp(d) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}
