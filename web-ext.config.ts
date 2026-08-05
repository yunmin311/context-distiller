import { resolve } from 'node:path';
import { defineWebExtConfig } from 'wxt';

/**
 * Dev-mode browser startup (used by `pnpm dev`).
 *
 * WXT only auto-opens a browser when the `web-ext` package is installed.
 * We open Chrome on a ChatGPT tab using a PERSISTENT dedicated dev profile,
 * so your ChatGPT login survives across `pnpm dev` restarts — you only log in
 * once in the auto-opened window.
 *
 * Note: this is a separate profile from your everyday Chrome. If you'd rather
 * use your normal browser (already logged in), just load `.output/chrome-mv3-dev`
 * as an unpacked extension manually instead — HMR still works while `pnpm dev`
 * is running.
 */
export default defineWebExtConfig({
  // Persist the dev profile between runs (Windows needs an absolute path).
  chromiumProfile: resolve('.wxt/chrome-data'),
  keepProfileChanges: true,
  startUrls: ['https://chatgpt.com'],
});
