// Build: bundles src/ into the single self-contained modest-text.html.
// Usage: node build.mjs
import { build, transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { deflateRawSync, constants } from 'node:zlib';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALPHABET, encode, decode } from './base91.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const src = (p) => join(root, 'src', p);

// The version shown at the end of Help (and named by the release): package.json's.
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// The stylesheet (minified) and the page's markup go into the bundle, which is stored compressed, rather than into
// the HTML file as text: about 28 KB smaller. The HTML file keeps a few rules of its own (src/boot.css), so that
// the page is dark, not white, until the bundle has unpacked and started, and so that the message shown when it
// cannot start has its frame.
const css = (await transform(readFileSync(src('styles.css'), 'utf8'), { loader: 'css', minify: true, legalComments: 'none' })).code.trim();
let page = readFileSync(src('index.html'), 'utf8');
const bodyStart = page.indexOf('<body>') + '<body>'.length, bodyEnd = page.indexOf('<script>__SCRIPT__</script>');
if (bodyStart < 6 || bodyEnd < bodyStart) throw new Error('index.html: <body> or the script marker is missing');
const markup = page.slice(bodyStart, bodyEnd).trim();
page = page.slice(0, bodyStart) + '\n' + page.slice(bodyEnd);
const bootCss = (await transform(readFileSync(src('boot.css'), 'utf8'), { loader: 'css', minify: true, legalComments: 'none' })).code.trim();

const result = await build({
  define: { __APP_VERSION__: JSON.stringify(version), __CSS__: JSON.stringify(css), __BODY__: JSON.stringify(markup) },
  entryPoints: [src('main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['chrome103', 'firefox113', 'safari16.4'], // the loader's DecompressionStream('deflate-raw') needs these
  legalComments: 'none',
  write: false,
  metafile: true,
  charset: 'ascii',
});

let js = result.outputFiles[0].text.trim();
// Never let the bundle close its own <script> element.
// `\x2d` is '-' in both string and regex literals.
js = js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<!\\x2d-');
// esbuild can emit raw control / non-ASCII characters inside regex literals; the HTML
// parser rewrites some of them (NUL -> U+FFFD, CR -> LF), which would break the CSP hash.
js = js.replace(/[^\x09\x0A\x20-\x7E]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
if (/<\/script|<!--/i.test(js)) throw new Error('bundle contains </script or <!--');

// Third-party license notices for every bundled package: each package with its copyright lines, then each
// distinct license text once, with the packages it applies to (the MIT text is the same for most of them).
const pkgs = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input);
  if (m) pkgs.add(m[1]);
}
const groups = new Map(); // license text without its copyright lines (spacing and title ignored) -> { body, packages }
for (const name of [...pkgs].sort()) {
  const dir = join(root, 'node_modules', name);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const file = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license'].map((f) => join(dir, f)).find(existsSync);
  const lines = (file ? readFileSync(file, 'utf8') : `License: ${pkg.license}`).trim().split(/\r?\n/);
  const copyright = lines.filter((l) => /^\s*Copyright\b/i.test(l)).map((l) => l.trim());
  const body = lines.filter((l) => !/^\s*Copyright\b/i.test(l)).join('\n').trim();
  const key = body.replace(/^MIT License\s*/i, '').replace(/\s+/g, ' '); // the same text, with or without its title
  if (!groups.has(key)) groups.set(key, { body, list: [] });
  groups.get(key).list.push(`${name}@${pkg.version} (${pkg.license})${copyright.map((c) => `\n  ${c}`).join('')}`);
}
const notices = [...groups.values()].map(({ body, list }) => `${list.join('\n')}\n\nThe license below applies to each of the packages above:\n\n${body}`);
const licenseComment = `<!--\nModest Text bundles the following third-party libraries.\nTheir copyright and license notices are reproduced below.\n\n${notices.join('\n\n========================================\n\n').replace(/--!?>/g, '- ->')}\n-->`;

// The bundle is stored compressed (raw deflate, in basE91 text: base91.mjs) in a data block, which the page does not run. A small
// inline loader decompresses it and runs it from a blob: URL with an integrity attribute. The CSP allows exactly two
// scripts, by hash: the loader, and the bundle (a script loaded from any URL runs only if its content has that hash).
const hash = createHash('sha256').update(js, 'utf8').digest('base64');
const packed = encode(deflateRawSync(Buffer.from(js, 'utf8'), { level: 9, memLevel: 9, strategy: constants.Z_DEFAULT_STRATEGY }));
const failText = 'Modest Text could not start: use a current version of Chrome, Edge, Firefox or Safari. \u00b7 Modest Text n\u2019a pas pu d\u00e9marrer : utilisez une version r\u00e9cente de Chrome, Edge, Firefox ou Safari.';
const loader = (await transform(`(async () => {
  const data = document.getElementById('mt-code');
  const fail = () => {
    const p = document.createElement('p');
    p.className = 'mt-fail';
    p.textContent = '${failText}';
    document.body.prepend(p);
  };
  try {
    const bytes = (${decode.toString()})(data.textContent, ${JSON.stringify(ALPHABET)});
    const code = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    const s = document.createElement('script');
    s.integrity = 'sha256-${hash}';
    s.src = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    s.onload = () => URL.revokeObjectURL(s.src);
    s.onerror = fail;
    data.remove();
    document.body.append(s);
  } catch {
    fail();
  }
})();`, { minify: true, target: ['chrome103', 'firefox113', 'safari16.4'], charset: 'ascii' })).code.trim();
const loaderHash = createHash('sha256').update(loader, 'utf8').digest('base64');
const csp = [
  "default-src 'none'",
  `script-src 'sha256-${loaderHash}' 'sha256-${hash}'`,
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const put = (marker, value) => {
  if (!page.includes(marker)) throw new Error(`missing ${marker}`);
  page = page.split(marker).join(value);
};
put('/*STYLE*/', bootCss);
put('<!--LICENSES-->', licenseComment);
put('__CSP__', csp);
// Insert the scripts last (split/join avoids `$` replacement patterns).
put('<script>__SCRIPT__</script>', `<script type="application/octet-stream" id="mt-code">${packed}</script>\n<script>${loader}</script>`);

writeFileSync(join(root, 'modest-text.html'), page);
console.log(`built modest-text.html: ${Buffer.byteLength(page).toLocaleString('en')} bytes (bundle ${js.length.toLocaleString('en')} bytes, packed ${packed.length.toLocaleString('en')}), ${pkgs.size} bundled packages, bundle sha256-${hash}`);
