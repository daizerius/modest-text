import { acquire, release } from './run-lock.mjs';
// Returning a function makes it Playwright's teardown, so the lock is released however the run ends normally.
export default async function globalSetup() {
  acquire();
  return () => release();
}
