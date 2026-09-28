// Unit tests of the pure helpers (run in Node).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import {
  cleanText, cleanName, uniqueName, withSuffix, nextDefaultName, exportFileName, dedupeFileNames, countText, decodeBytes, prepareImport, formatStamp, zipStamp,
} from '../src/text.js';
import { makeZip, crc32 } from '../src/zip.js';
const PY = process.platform === 'win32' ? 'python' : 'python3'; // the Python 3 command

const NBSP = String.fromCharCode(0xa0), ZWJ = String.fromCharCode(0x200d), BOM = String.fromCharCode(0xfeff);

test('cleanText removes FEFF, NUL and control characters except tab/newline, normalizes line breaks, keeps NBSP and ZWJ', () => {
  const s = `a\r\nb\rc\n\td${String.fromCharCode(0)}${BOM}${String.fromCharCode(7)}${String.fromCharCode(0x85)}${NBSP}e👨${ZWJ}👩`;
  expect(cleanText(s)).toBe(`a\nb\nc\n\td${NBSP}e👨${ZWJ}👩`);
});

test('cleanName', () => {
  expect(cleanName('CON')).toBe('_CON');
  expect(cleanName('con.txt')).toBe('_con.txt');
  expect(cleanName('COM7')).toBe('_COM7');
  expect(cleanName('LPT9')).toBe('_LPT9');
  expect(cleanName('COM10')).toBe('COM10');
  expect(cleanName('a/b:c')).toBe('abc');
  expect(cleanName('  x..  ')).toBe('x');
  expect(cleanName('a  \t b')).toBe('a b');
  expect(cleanName('q\\u*e?s"t<i>o|n')).toBe('question');
  expect(cleanName('   ')).toBe('');
  expect(cleanName('...')).toBe('');
  expect(Array.from(cleanName('é'.repeat(120)))).toHaveLength(100);
  expect(cleanName('😀'.repeat(101))).toBe('😀'.repeat(100));
});

test('uniqueName and nextDefaultName', () => {
  expect(uniqueName('Notes', ['notes'])).toBe('Notes (2)');
  expect(uniqueName('Notes', ['notes', 'NOTES (2)'])).toBe('Notes (3)');
  expect(uniqueName('Other', ['notes'])).toBe('Other');
  expect(uniqueName('x'.repeat(100), ['x'.repeat(100)])).toBe('x'.repeat(96) + ' (2)');
  expect(uniqueName('notes.md', ['Notes.md'])).toBe('notes (2).md');
  expect(uniqueName('a.TXT', ['a.txt', 'a (2).txt'])).toBe('a (3).TXT');
  expect(withSuffix('notes.md', '(conflict)')).toBe('notes (conflict).md');
  expect(withSuffix('Untitled 1', '(conflict)')).toBe('Untitled 1 (conflict)');
  expect(nextDefaultName('Untitled', ['Untitled 1', 'untitled 3'])).toBe('Untitled 2');
  expect(nextDefaultName('Sans titre', [])).toBe('Sans titre 1');
});

test('export file names', () => {
  expect(exportFileName('Notes', false)).toBe('Notes.txt');
  expect(exportFileName('Notes', true)).toBe('Notes.md');
  expect(exportFileName('a.MD', false)).toBe('a.MD');
  expect(exportFileName('a.txt', true)).toBe('a.txt');
  expect(exportFileName('a.markdown', true)).toBe('a.markdown.md');
  expect(dedupeFileNames(['a.txt', 'A.txt', 'b.md', 'a.txt'])).toEqual(['a.txt', 'A (2).txt', 'b.md', 'a (3).txt']);
});

test('counts: lines = breaks + 1, words = runs of non-whitespace, characters = code points', () => {
  expect(countText('')).toEqual({ lines: 1, words: 0, chars: 0 });
  expect(countText('a b\nc 😀\n')).toEqual({ lines: 3, words: 4, chars: 8 });
  expect(countText(`un${NBSP}deux`)).toEqual({ lines: 1, words: 2, chars: 7 });
  expect(countText('👨' + ZWJ + '👩')).toEqual({ lines: 1, words: 1, chars: 3 });
  const s = 'Lorem ipsum\tdolor  sit\n'.repeat(1000);
  expect(countText(s).words).toBe((s.match(/\S+/g) || []).length);
});

test('decoding: BOMs, strict UTF-8, Windows-1252 fallback; binary detection', () => {
  expect(decodeBytes(Buffer.from([0xef, 0xbb, 0xbf, 0x61])).text).toBe('a');
  expect(decodeBytes(Buffer.from([0xff, 0xfe, 0x61, 0x00])).text).toBe('a');
  expect(decodeBytes(Buffer.from([0xfe, 0xff, 0x00, 0x61])).text).toBe('a');
  expect(decodeBytes(Buffer.from('é€', 'utf8'))).toEqual({ text: 'é€', encoding: 'utf-8' });
  expect(decodeBytes(Buffer.from([0xc9, 0x6c, 0xe8, 0x76, 0x65, 0x80, 0x9c]))).toEqual({ text: 'Élève€œ', encoding: 'windows-1252' });
  expect(prepareImport('x.txt', Buffer.from([0x61, 0x00]))).toEqual({ ok: false, reason: 'binary' });
  expect(prepareImport('x.zip', Buffer.from('a'))).toEqual({ ok: false, reason: 'type' });
  expect(prepareImport('x.txt', Buffer.alloc(1024 * 1024 + 1, 0x61))).toEqual({ ok: false, reason: 'size' });
  expect(prepareImport('Notes.MD', Buffer.from('# a\r\n'))).toEqual({ ok: true, text: '# a\n', name: 'Notes.MD', markdown: true });
});

test('timestamps: ISO date, the narrowing ladder, and a compact ZIP name', () => {
  const d = new Date(2026, 8, 12, 14, 3, 22);
  // Level 0 carries the time zone; the machine running the tests decides which one, and a runtime
  // without Intl time-zone data gives none, so only the shape is checked.
  expect(formatStamp(d)).toMatch(/^2026-09-12 ∙ 14:03:22( \S+)?$/);
  expect(formatStamp(d, ' ∙ ', 1)).toBe('2026-09-12 ∙ 14:03:22');
  expect(formatStamp(d, ' ∙ ', 2)).toBe('20260912 ∙ 14:03:22');
  expect(formatStamp(d, ' ∙ ', 3)).toBe('20260912 ∙ 14:03');
  expect(formatStamp(d, ' ∙ ', 4)).toBe('14:03:22');
  expect(formatStamp(d, ' ∙ ', 5)).toBe('14:03');
  // Each step is at most as wide as the one before it, and the year is never shortened.
  const widths = [0, 1, 2, 3, 4, 5].map((l) => formatStamp(d, ' ∙ ', l));
  expect(widths.map((s) => s.length)).toEqual([...widths.map((s) => s.length)].sort((a, b) => b - a));
  for (const s of widths) expect(s).not.toMatch(/\b26[-\d]/);
  expect(zipStamp(d)).toBe('20260912_140322');
});

// The status bar names the zone the way the tz database does, not the way Intl does on its own:
// Intl's short name only abbreviates the Americas and gives "GMT+2" for everywhere else. Each zone is
// checked in a child process, because Intl caches the zone for the life of the process.
test('time zone: the tz database\u2019s own abbreviation, winter and summer', () => {
  const script = `import { timeZoneName } from ${JSON.stringify(new URL('../src/text.js', import.meta.url).href)};
    process.stdout.write(JSON.stringify([1768478400, 1784203200].map((t) => timeZoneName(new Date(t * 1000)))));`;
  const at = (tz) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script],
    { env: { ...process.env, TZ: tz }, encoding: 'utf8' }));
  // Zones the tz database abbreviates: the abbreviation, and it changes with summer time.
  expect(at('Europe/Berlin')).toEqual(['CET', 'CEST']);
  expect(at('Europe/Paris')).toEqual(['CET', 'CEST']);
  expect(at('Europe/London')).toEqual(['GMT', 'BST']);
  expect(at('Europe/Athens')).toEqual(['EET', 'EEST']);
  expect(at('America/New_York')).toEqual(['EST', 'EDT']);
  expect(at('America/Los_Angeles')).toEqual(['PST', 'PDT']);
  expect(at('America/St_Johns')).toEqual(['NST', 'NDT']);
  expect(at('Australia/Sydney')).toEqual(['AEDT', 'AEST']); // southern hemisphere: summer time in January
  expect(at('Pacific/Auckland')).toEqual(['NZDT', 'NZST']);
  // Zones with no summer time still get their name.
  expect(at('Asia/Tokyo')).toEqual(['JST', 'JST']);
  expect(at('Asia/Kolkata')).toEqual(['IST', 'IST']);
  expect(at('Africa/Johannesburg')).toEqual(['SAST', 'SAST']);
  // Zones the tz database itself writes numerically ("-03", "+04") keep an offset instead.
  for (const [tz, re] of [['America/Sao_Paulo', /^GMT-3$/], ['Asia/Dubai', /^GMT\+4$/]]) {
    for (const name of at(tz)) expect(name, tz).toMatch(re);
  }
  expect(at('America/Santiago')).toEqual(['GMT-3', 'GMT-4']); // numeric, and it still shifts
});

test('zip writer: CRC-32, UTF-8 flag, readable by unzip and Python', () => {
  expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  const files = [{ name: 'Café crème.txt', data: Buffer.from('é\n') }, { name: 'empty.md', data: new Uint8Array(0) }, { name: '日本.txt', data: Buffer.from('語') }];
  return makeZip(files, new Date(2026, 8, 12, 14, 3, 22)).arrayBuffer().then((buf) => {
    const dir = mkdtempSync(join(tmpdir(), 'mt-zip-'));
    const p = join(dir, 't.zip');
    writeFileSync(p, Buffer.from(buf));
    expect(execFileSync('unzip', ['-t', p], { encoding: 'utf8' })).toContain('No errors detected');
    const out = execFileSync(PY, ['-c', 'import sys,zipfile,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps([z.testzip(),[[i.filename,i.flag_bits,i.date_time[:6],z.read(i).decode()] for i in z.infolist()]]))', p], { encoding: 'utf8' });
    expect(JSON.parse(out)).toEqual([null, [
      ['Café crème.txt', 0x800, [2026, 9, 12, 14, 3, 22], 'é\n'],
      ['empty.md', 0x800, [2026, 9, 12, 14, 3, 22], ''],
      ['日本.txt', 0x800, [2026, 9, 12, 14, 3, 22], '語'],
    ]]);
  });
});
