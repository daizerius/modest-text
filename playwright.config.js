// Playwright: Chromium + Firefox + WebKit, each over file:// and over a local http server (tests/serve.mjs;
// load.spec.js additionally loads the page from python3 -m http.server).
import { defineConfig } from '@playwright/test';
import { firefox, webkit } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertFree } from './tests/run-lock.mjs';

// Before anything else: Playwright empties test-results/ right after loading this file, which would wipe a
// run in progress. Workers load it too, while their own run holds the lock, so only the main process checks.
if (process.env.TEST_WORKER_INDEX === undefined) assertFree();

const root = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MT_PORT || 8765);
const fileURL = pathToFileURL(join(root, 'modest-text.html')).href;
const httpURL = `http://127.0.0.1:${PORT}/modest-text.html`;

// Chromium: Playwright's own build (npx playwright install chromium), or the executable named by
// MT_CHROME for a machine where that download is unavailable.
function chromePath() {
  return process.env.MT_CHROME || undefined;
}
// Clipboard permissions let the paste test write HTML + text with the async Clipboard API.
const chromeUse = { browserName: 'chromium', launchOptions: { executablePath: chromePath() }, permissions: ['clipboard-read', 'clipboard-write'] };
// Firefox: Playwright's own build when installed (npx playwright install firefox), else the stock Firefox
// driven over WebDriver BiDi (channel "moz-firefox"); MT_FIREFOX_CHANNEL overrides ("" = Playwright's build).
function firefoxChannel() {
  if (process.env.MT_FIREFOX_CHANNEL !== undefined) return process.env.MT_FIREFOX_CHANNEL || undefined;
  try { if (existsSync(firefox.executablePath())) return undefined; } catch { /* not installed */ }
  return 'moz-firefox';
}
const ffChannel = firefoxChannel();
const firefoxUse = { browserName: 'firefox', ...(ffChannel ? { channel: ffChannel } : {}) };
// WebKit (Safari's engine): Playwright's own build, when it is installed
// (npx playwright install webkit). Without it the WebKit projects are left out.
function hasWebKit() {
  try { return existsSync(webkit.executablePath()); } catch { return false; }
}
const webkitUse = { browserName: 'webkit' };
const webkitProjects = hasWebKit() ? [
  { name: 'webkit-file', testIgnore: /perf\.spec/, use: { ...webkitUse, appURL: fileURL } },
  { name: 'webkit-http', testIgnore: /perf\.spec/, use: { ...webkitUse, appURL: httpURL } },
] : [];

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: { timeout: 8000 },
  fullyParallel: true,
  // Several workers for the functional tests: none of them measures time, so parallelism cannot affect their
  // results. The one test that does — the 1 MB typing test in perf.spec.js, which measures event-loop gaps —
  // runs in the *-perf projects below, which wait for every functional project to finish and then run one
  // after another, one worker each: nothing else of this suite is running while it measures.
  // Conflicts between runs are prevented too: tests/global-setup.mjs takes a lock, so a second
  // `playwright test` started while one is going stops at once with a clear message instead of sharing the
  // test server and the CPU. What that cannot prevent is other work on the machine, so leave it alone while
  // the timing test runs. MT_WORKERS overrides the worker count (MT_WORKERS=1 for a fully sequential run).
  workers: Number(process.env.MT_WORKERS || 4),
  globalSetup: './tests/global-setup.mjs',
  retries: 0,
  reporter: [['list']],
  use: { trace: 'retain-on-failure', acceptDownloads: true, viewport: { width: 1200, height: 800 }, locale: 'en-US', colorScheme: 'light' },
  projects: [
    { name: 'chromium-file', testIgnore: /perf\.spec/, use: { ...chromeUse, appURL: fileURL } },
    { name: 'chromium-http', testIgnore: /perf\.spec/, use: { ...chromeUse, appURL: httpURL } },
    { name: 'firefox-file', testIgnore: /perf\.spec/, use: { ...firefoxUse, appURL: fileURL } },
    { name: 'firefox-http', testIgnore: /perf\.spec/, use: { ...firefoxUse, appURL: httpURL } },
    ...webkitProjects,
    // Timing test: after everything else, one project at a time, one worker.
    { name: 'chromium-file-perf', testMatch: /perf\.spec/, workers: 1, dependencies: ['chromium-file', 'chromium-http', 'firefox-file', 'firefox-http', ...webkitProjects.map(p => p.name)], use: { ...chromeUse, appURL: fileURL } },
    { name: 'chromium-http-perf', testMatch: /perf\.spec/, workers: 1, dependencies: ['chromium-file-perf'], use: { ...chromeUse, appURL: httpURL } },
    { name: 'firefox-file-perf', testMatch: /perf\.spec/, workers: 1, dependencies: ['chromium-http-perf'], use: { ...firefoxUse, appURL: fileURL } },
    { name: 'firefox-http-perf', testMatch: /perf\.spec/, workers: 1, dependencies: ['firefox-file-perf'], use: { ...firefoxUse, appURL: httpURL } },
  ],
  webServer: {
    command: `node tests/serve.mjs ${PORT}`,
    url: httpURL,
    reuseExistingServer: true,
    cwd: root,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
