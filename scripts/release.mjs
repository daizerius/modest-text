// Release: a signed tag vX.Y.Z and a GitHub Release with modest-text.html attached, its notes taken
// from that version's section of CHANGELOG.md. See "Releasing" in AGENTS.md.
//
//   npm run release                # check everything, and say what would be done
//   npm run release -- --publish   # do it (needs git with a signing key, and gh logged in)
//
// It does not run the test suite (fifteen minutes): run `npm test` first, and wait for CI on master.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const run = (cmd, args, opts = {}) => (execFileSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts }) ?? '').trim();
const fail = (msg) => { console.error(`release: ${msg}`); process.exit(1); };
const publish = process.argv.includes('--publish');

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const tag = `v${version}`;

// The tree: clean, on master, level with origin.
if (run('git', ['status', '--porcelain'])) fail('the working tree has changes; commit or stash them first.');
const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== 'master') fail(`on "${branch}", not master.`);
run('git', ['fetch', '--quiet', 'origin', 'master']);
if (run('git', ['rev-parse', 'HEAD']) !== run('git', ['rev-parse', 'origin/master'])) fail('master is not level with origin/master; push (and let CI pass) first.');
if (run('git', ['tag', '--list', tag])) fail(`the tag ${tag} already exists.`);

// The notes: this version's section of CHANGELOG.md, from its heading to the next one.
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const heading = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\].*$`, 'm');
const m = heading.exec(changelog);
if (!m) fail(`CHANGELOG.md has no "## [${version}]" section.`);
const rest = changelog.slice(m.index + m[0].length);
const next = rest.search(/^## \[/m);
const notes = (next < 0 ? rest : rest.slice(0, next)).replace(/\n\[[^\]]+\]: .*$/gm, '').trim();
if (!notes) fail(`the ${version} section of CHANGELOG.md is empty.`);

// The build: rebuilding must give the committed file, byte for byte.
const committed = readFileSync(join(root, 'modest-text.html'));
run('node', ['build.mjs']);
if (!committed.equals(readFileSync(join(root, 'modest-text.html')))) {
  fail('a fresh build differs from the committed modest-text.html: build, commit, push, then release.');
}
if (run('git', ['status', '--porcelain'])) fail('the build changed the tree; commit it first.');

console.log(`Modest Text ${version}: all checks pass.`);
if (!publish) {
  console.log(`Would run:\n  git tag -s ${tag} -m "Modest Text ${version}"\n  git push origin ${tag}\n  gh release create ${tag} modest-text.html --title "Modest Text ${version}" --notes-file <the ${version} section of CHANGELOG.md>`);
  console.log('Run again with --publish to do it.');
  process.exit(0);
}
const notesFile = join(mkdtempSync(join(tmpdir(), 'modest-text-release-')), 'notes.md');
writeFileSync(notesFile, `${notes}\n`);
run('git', ['tag', '-s', tag, '-m', `Modest Text ${version}`], { stdio: 'inherit' });
run('git', ['push', 'origin', tag], { stdio: 'inherit' });
run('gh', ['release', 'create', tag, 'modest-text.html', '--title', `Modest Text ${version}`, '--notes-file', notesFile], { stdio: 'inherit' });
console.log(`Released ${tag}.`);
