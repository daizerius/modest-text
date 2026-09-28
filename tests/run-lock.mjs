// One test run at a time. Two `playwright test` invocations on this machine would share the static server on
// port 8765 and, worse, compete for the CPU while the timing test measures event-loop gaps — a second run can
// turn a 40 ms gap into 500 ms. The lock is
// a file created atomically ('wx' fails if it exists) holding the owner's process id; a lock whose process is
// gone (a run stopped with Ctrl+C, which skips the teardown) is stale and is taken over.
import { openSync, writeSync, closeSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const LOCK = join(root, '.tmp', 'test-run.lock'); // not test-results/, which Playwright empties at start

const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

const busy = (pid) => new Error(`Another test run is in progress (process ${pid}). Wait for it to finish: two runs at once `
  + `share the test server and skew the timing test. If no run is actually going, delete ${LOCK}.`);

// Called from playwright.config.js, which Playwright loads *before* it empties test-results/: a second run
// refused only in globalSetup has already deleted the first run's traces and reports (it happened, and
// five tests of the first run failed on their missing trace files). This refuses it before that.
export function assertFree() {
  let pid;
  try { pid = Number(readFileSync(LOCK, 'utf8')); } catch { return; }
  if (pid && pid !== process.pid && alive(pid)) throw busy(pid);
}

export function acquire() {
  mkdirSync(dirname(LOCK), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(LOCK, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const pid = Number(readFileSync(LOCK, 'utf8'));
      if (pid && alive(pid)) {
        throw busy(pid);
      }
      rmSync(LOCK, { force: true }); // stale: its process is gone
    }
  }
  throw new Error(`Could not take the test run lock at ${LOCK}.`);
}

export function release() {
  try { if (Number(readFileSync(LOCK, 'utf8')) === process.pid) rmSync(LOCK, { force: true }); } catch { /* already gone */ }
}
