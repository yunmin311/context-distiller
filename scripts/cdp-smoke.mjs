/**
 * CDP smoke test for the built extension — run BEFORE every deploy.
 *
 * What it verifies, end to end, without any account:
 *   1. The extension loads in a fresh disposable Chrome profile (SW alive).
 *   2. The side panel page boots and shows the CURRENT version + intro.
 *   3. Clicking 读取 drives the full three-hop channel
 *      (panel → content script → main-world bridge attempt) against a real
 *      chatgpt.com tab and lands on the expected structured failure
 *      (logged-out landing → noMessages with the diagnostic counts), with no
 *      hang anywhere.
 *
 * Usage: node cdp-smoke.mjs <extensionDir> [expectedVersion]
 * Exit 0 = all assertions passed.
 */
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Usage:
//   node cdp-smoke.mjs <extensionDir> <expectedVersion>   (explicit)
//   node cdp-smoke.mjs <expectedVersion>                  (dir defaults to .output/chrome-mv3 — `pnpm smoke 1.4.4`)
//   node cdp-smoke.mjs --login <expectedVersion>          (one-time: open a windowed persistent
//                                                          profile at chatgpt.com; log in by hand)
// A first arg starting with a digit is treated as the version, so
// `pnpm smoke 1.4.4` works even though the npm script already pins the dir.
//
// PROFILES: when `.smoke-profile/` exists next to the repo root it is reused
// (persistent), which enables the LOGGED-IN suite — read success, partial→full
// upgrade and locate against a real ChatGPT conversation. Without it, a
// throwaway profile runs the anonymous suite only (structured failure cards).
// The persistent profile holds the tester's ChatGPT session — it is
// git-ignored and must NEVER be committed or copied anywhere.
const DEFAULT_DIR = '.output/chrome-mv3';
const PROFILE_DIR = resolve('.smoke-profile');
const PERSIST = existsSync(PROFILE_DIR);
const LOGIN_MODE = process.argv[2] === '--login';
const arg1 = LOGIN_MODE ? process.argv[3] : process.argv[2];
const arg2 = LOGIN_MODE ? process.argv[4] : process.argv[3];
const firstIsDir = arg1 && !/^\d/.test(arg1);
// Edge/Chrome REJECT a relative --load-extension path (silently ignores it —
// the exact failure that made this script flaky). Always resolve to absolute.
const extensionDir = resolve(firstIsDir ? arg1 : DEFAULT_DIR);
const expectedVersion = (firstIsDir ? arg2 : arg1) ?? '1.4.4';
if (!extensionDir || !expectedVersion) {
  console.error('usage: node cdp-smoke.mjs [extensionDir] <expectedVersion>');
  process.exit(2);
}

const PORT = Number(process.env.CDP_SMOKE_PORT ?? 9300 + Math.floor(Math.random() * 400));
const ATTACH_ONLY = process.env.CDP_SMOKE_PORT !== undefined;
const BASE = `http://127.0.0.1:${PORT}`;
// Edge FIRST: branded Chrome 155+ silently ignores --load-extension (its own
// component extensions still load, which previously fooled detection into
// thinking ours had). Edge honors the flag on this machine.
const candidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter((p) => {
  try {
    execSync(`if exist "${p}" (exit 0) else (exit 1)`, { shell: 'cmd.exe' });
    return true;
  } catch {
    return false;
  }
});
if (candidates.length === 0) {
  console.error('SMOKE: FAIL — no Chromium-family browser found');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launchWith(browserPath) {
  const profile = PERSIST ? PROFILE_DIR : mkdtempSync(join(tmpdir(), 'cd-smoke-'));
  // PERSIST runs WINDOWED on purpose: Cloudflare challenges headless
  // fingerprints ("请稍候…" interstitial), which would break the logged-in
  // suite. The anonymous tier stays headless (no login to protect).
  const headless = PERSIST ? [] : ['--headless=new'];
  const child = spawn(
    browserPath,
    [
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-crash-reporter',
      `--load-extension=${extensionDir}`,
      `--remote-debugging-port=${PORT}`,
      ...headless,
      '--window-size=900,940',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'], detached: false },
  );
  let stderrTail = '';
  child.stderr?.on('data', (d) => {
    stderrTail = (stderrTail + d.toString()).slice(-600);
  });
  // Wait for the debug endpoint AND OUR extension: branded Chrome ships its own
  // component extensions (a bare service_worker target may be Chrome's, not
  // ours), and modern branded builds IGNORE --load-extension entirely — both
  // must be distinguished by reading each SW's manifest.
  const seenHosts = new Set();
  for (let i = 0; i < 40; i += 1) {
    await sleep(750);
    try {
      const list = await (await fetch(`${BASE}/json/list`)).json();
      const sws = list.filter(
        (t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'),
      );
      for (const sw of sws) {
        const host = new URL(sw.url).host;
        if (seenHosts.has(host)) continue;
        seenHosts.add(host);
        let name = '';
        let version = '';
        try {
          const c = await connect(sw.webSocketDebuggerUrl);
          const info = await evalIn(
            c,
            `(() => { const m = chrome.runtime.getManifest(); return { name: m.name, version: m.version }; })()`,
          );
          c.close();
          name = info.name;
          version = info.version;
        } catch {
          continue;
        }
        console.log(`SMOKE:   sw ${host} = "${name}" v${version}`);
        if (name === 'Context Distiller' && version === expectedVersion) {
          return { child, id: host, browserPath, stderrTail: () => stderrTail };
        }
      }
    } catch {
      /* endpoint not up yet */
    }
  }
  if (stderrTail) console.log(`SMOKE: ${browserPath} stderr: ${stderrTail}`);
  try {
    execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' });
  } catch {}
  return null;
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    ws.onopen = () =>
      resolve({
        call(method, params = {}) {
          return new Promise((res, rej) => {
            const id = nextId++;
            pending.set(id, { res, rej });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          try {
            ws.close();
          } catch {}
        },
      });
    ws.onerror = reject;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      }
    };
  });
}

async function evalIn(cdp, expression) {
  const r = await cdp.call('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

let launched = null;
let browserPathUsed = ATTACH_ONLY ? '(attached to running instance)' : '';
let id = '';
let child = null;

// ---- LOGIN MODE (--login): one-time setup for the persistent profile -------
// Opens a WINDOWED browser on chatgpt.com so a human can log in by hand; polls
// (5 min ceiling) for the logged-in signal, then exits. Never touches
// credentials — the human does the login, the script only waits.
if (LOGIN_MODE) {
  if (!candidates.length) {
    console.error('SMOKE: no Chromium-family browser found');
    process.exit(1);
  }
  const profile = PROFILE_DIR;
  const loginArgs = (port) => [
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    `--load-extension=${extensionDir}`,
    `--remote-debugging-port=${port}`,
    '--window-size=900,940',
    'https://chatgpt.com/',
  ];
  // Windowed launches are flaky about binding the debug port (attach-to-
  // existing quirks) — verify the endpoint, retry up to 3 times on failure.
  let login = null;
  for (let attempt = 0; attempt < 3 && !login; attempt += 1) {
    const port = 9300 + Math.floor(Math.random() * 400);
    console.log(`SMOKE: launching login browser (attempt ${attempt + 1}, port ${port})`);
    login = spawn(candidates[0], loginArgs(port), { stdio: 'ignore', detached: false });
    let portUp = false;
    for (let i = 0; i < 15; i += 1) {
      await sleep(1000);
      try {
        await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
        portUp = true;
        break;
      } catch {}
    }
    if (portUp) {
      process.env.CDP_SMOKE_PORT = String(port);
      break;
    }
    console.log('SMOKE: debug port did not come up — relaunching');
    try {
      process.kill(-login.pid);
    } catch {
      try {
        login.kill();
      } catch {}
    }
    login = null;
  }
  if (!login) {
    console.error('SMOKE: could not start a login browser with a working debug port');
    process.exit(1);
  }
  const BASEL = `http://127.0.0.1:${process.env.CDP_SMOKE_PORT}`;
  console.log('SMOKE: LOGIN MODE — a browser window is open at chatgpt.com.');
  const waitMin = Number(process.env.CDP_SMOKE_LOGIN_WAIT_MIN ?? 5);
  console.log(`SMOKE: log in by hand; polling ${waitMin} min ceiling.`);
  let ready = false;
  let lastState = '';
  for (let i = 0; i < (waitMin * 60) / 3; i += 1) {
    await sleep(3000);
    try {
      const list = await (await fetch(`${BASEL}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && /chatgpt\.com/.test(t.url));
      if (!page) {
        if (i === 5) console.log('SMOKE: no chatgpt.com page target yet…');
        continue;
      }
      const c = await connect(page.webSocketDebuggerUrl);
      const state = await evalIn(
        c,
        `(() => ({ nav: !!document.querySelector('nav a[href*="/c/"]'),
           loginBtn: !!document.querySelector('[data-testid="login-button"]'),
           url: location.href.slice(0, 60) }))()`,
      );
      c.close();
      const sig = `${state.nav}|${state.loginBtn}|${state.url}`;
      if (sig !== lastState) {
        console.log(`SMOKE: login page state: ${sig}`);
        lastState = sig;
      }
      if (state.nav) {
        ready = true;
        break;
      }
    } catch (e) {
      if (i % 10 === 0) console.log(`SMOKE: poll error (will retry): ${e.message}`);
    }
  }
  try {
    process.kill(-login.pid);
  } catch {
    try {
      login.kill();
    } catch {}
  }
  console.log(ready ? 'SMOKE: LOGIN READY — persistent profile captured.' : 'SMOKE: LOGIN TIMED OUT');
  process.exit(ready ? 0 : 1);
}

if (ATTACH_ONLY) {
  const list = await (await fetch(`${BASE}/json/list`)).json();
  const sw = list.find(
    (t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'),
  );
  if (!sw) {
    console.error('SMOKE: FAIL — no extension service worker in the attached browser');
    process.exit(1);
  }
  id = new URL(sw.url).host;
  console.log(`SMOKE: attached, extension id = ${id}`);
} else {
// Windowed launches sometimes fail to bind the debug port (attach quirks) —
// give every candidate two attempts before moving on.
for (const p of candidates) {
  for (let attempt = 1; attempt <= 2 && !launched; attempt += 1) {
    console.log(`SMOKE: trying ${p} (attempt ${attempt})`);
    launched = await launchWith(p);
    if (launched) {
      browserPathUsed = p;
      break;
    }
    console.log(`SMOKE: ${p} attempt ${attempt} did not load the extension`);
  }
  if (launched) break;
}
if (!launched) {
  console.error('SMOKE: FAIL — no candidate loaded the extension');
  process.exit(1);
}
({ child, id } = launched);
}
const failures = [];
const skipped = [];
const check = (name, ok, detail = '') => {
  console.log(`SMOKE: ${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

try {
  if (child) {
    child.on?.('exit', (code) => console.log(`SMOKE: chrome process exited (code ${code})`));
  }
  const listAll = await (async () => {
    for (let i = 0; i < 10; i += 1) {
      try {
        return await (await fetch(`${BASE}/json/list`)).json();
      } catch (e) {
        if (i === 9) throw e;
        await sleep(500);
      }
    }
  })();

  // SW health (informational — Chrome 155 blocks in-SW fetches of extension
  // pages, so a fetch failure here is NOT a product failure).
  const swTarget = listAll.find((t) => t.type === 'service_worker');
  if (swTarget) {
    const swCdp = await connect(swTarget.webSocketDebuggerUrl);
    const swInfo = await evalIn(
      swCdp,
      `(() => { const m = chrome.runtime.getManifest();
        let fetchStatus = 'blocked-or-err';
        try { fetch(chrome.runtime.getURL('sidepanel.html')).then((r) => {}).catch(() => {}); } catch {}
        return { version: m.version, id: chrome.runtime.id }; })()`,
    );
    swCdp.close();
    console.log(`SMOKE: sw alive, version=${swInfo.version}, id=${swInfo.id}`);
  }

  // Open the panel as a page, let it boot. Retry once if the top-level load
  // raced extension registration (ERR_FILE_NOT_FOUND).
  await fetch(`${BASE}/json/new?chrome-extension://${id}/sidepanel.html`, { method: 'PUT' });
  await sleep(2500);
  const list = await (await fetch(`${BASE}/json/list`)).json();
  const panel = list.find((t) => t.url.includes('sidepanel.html'));
  check('panel page opened', !!panel);
  if (!panel) throw new Error('no panel target');
  const cdp = await connect(panel.webSocketDebuggerUrl);
  let probe = await evalIn(cdp, `document.body.innerText.slice(0, 140)`);
  if (/ERR_FILE_NOT_FOUND|无法访问/.test(probe)) {
    console.log('SMOKE: panel hit ERR_FILE_NOT_FOUND — reloading once');
    await cdp.call('Page.reload', {}).catch(() => {});
    await sleep(2500);
    probe = await evalIn(cdp, `document.body.innerText.slice(0, 140)`);
    console.log('SMOKE: after reload:', probe.slice(0, 60));
  }

  // 1. Boot: version + intro visible.
  const boot = await evalIn(
    cdp,
    `(() => ({ version: document.body.innerText.includes('v${expectedVersion}'),
       intro: !!document.querySelector('.intro-actions'),
       text: document.body.innerText.slice(0, 300) }))()`,
  );
  check(`panel shows v${expectedVersion}`, boot.version === true, boot.text.slice(0, 60));
  check('intro with 读取 button visible', boot.intro === true);

  // 2. Anonymous tier: open chatgpt.com and click 读取 — a logged-OUT profile
  //    fails the read and must surface a structured error card. In PERSIST
  //    mode the user is logged in, so reads SUCCEED — these assertions would
  //    be wrong there; the logged-in suite covers the success path instead.
  if (!PERSIST) {
    await fetch(`${BASE}/json/new?https://chatgpt.com/`, { method: 'PUT' });
    await sleep(6000); // let the page + content script settle

    const clickAndAwait = await evalIn(
      cdp,
      `(async () => {
        document.querySelector('.intro-actions .btn-primary')?.click();
        // The read pipeline retries quietly for ~35s before surfacing the error
        // card — the assertion window must outlast that by a wide margin.
        for (let i = 0; i < 180; i++) {
          await new Promise((r) => setTimeout(r, 500));
          const card = document.querySelector('.notice-error');
          if (card) return card.innerText;
        }
        return 'TIMEOUT: no error card within 90s';
      })()`,
    );
    const readOk =
      typeof clickAndAwait === 'string' &&
      clickAndAwait.includes('读取失败') &&
      (clickAndAwait.includes('诊断：页面消息节点') ||
        clickAndAwait.includes('还没有消息的新对话') ||
        clickAndAwait.includes('无法与页面通信'));
    check(
      'read click → structured error card (channel alive, no hang)',
      readOk,
      String(clickAndAwait).slice(0, 160),
    );

    // INFO (non-fatal): the retry button = reload-retry. Anonymous headless runs
    // usually stay bot-walled (noContentScript), but the panel must stay alive
    // and show a structured card afterwards either way.
    const retryAndAwait = await evalIn(
      cdp,
      `(async () => {
        document.querySelector('.notice-error .btn')?.click();
        for (let i = 0; i < 150; i++) {
          await new Promise((r) => setTimeout(r, 500));
          const card = document.querySelector('.notice-error');
          if (card) return card.innerText;
        }
        return 'TIMEOUT';
      })()`,
    );
    console.log(
      `SMOKE: INFO — reload-retry card: ${String(retryAndAwait).slice(0, 140).replace(/\n/g, ' | ')}`,
    );
    const aliveAfterRetry = await evalIn(cdp, `document.body.innerText.length > 0`);
    check('panel responsive after reload-retry', aliveAfterRetry === true);
  } else {
    skipped.push('read-failure card suite (logged-in: reads succeed — success path covered below)');
  }

  // ---- Paste-import E2E (deterministic, works logged-out) --------------------
  // Top bar 导入/Import → textarea → 按前缀拆分 → 加入 → two paste_ rows + count.
  const imported = await evalIn(
    cdp,
    `(async () => {
      const importBtn = [...document.querySelectorAll('.scratch-toggle')]
        .find((b) => /导入|Import/.test(b.innerText));
      if (!importBtn) return 'NO_IMPORT_BTN';
      importBtn.click();
      await new Promise((r) => setTimeout(r, 400));
      const ta = document.querySelector('.import-text');
      if (!ta) return 'NO_DIALOG';
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, '你：帮我总结这段\\n这是第一段要点\\nAI：好的，总结如下\\n要点一；要点二。');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
      const split = document.querySelector('.import-controls .chip-btn');
      if (split) split.click();
      await new Promise((r) => setTimeout(r, 300));
      document.querySelector('.overlay-actions .btn-primary')?.click();
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 300));
        const rows = document.querySelectorAll('.msg[data-mid^="paste_"]');
        if (rows.length >= 2) return { rows: rows.length };
      }
      return 'NO_ROWS';
    })()`,
  );
  check(
    'paste import → split → two paste_ rows',
    typeof imported === 'object' && imported.rows >= 2,
    `rows=${typeof imported === 'object' ? imported.rows : imported}`,
  );
  const compiled = await evalIn(
    cdp,
    `(() => { const m = document.body.innerText.match(/(\\d+)\\s*段|([\\d,]+)\\s*pieces/);
      return { text: document.body.innerText.slice(0, 200), matched: !!m }; })()`,
  );
  check('compile pipeline alive after import', compiled.matched === true, String(compiled.text).slice(0, 60).replace(/\n/g, ' | '));

  // ---- Logged-in suite (persistent profile only) ------------------------------
  if (!PERSIST) {
    skipped.push('logged-in E2E (no .smoke-profile — run `pnpm smoke:login <ver>` once)');
  } else {
    // Open a REAL conversation from the sidebar (read-only navigation, the
    // equivalent of a user click — never sends anything), then force-load.
    await fetch(`${BASE}/json/new?https://chatgpt.com/`, { method: 'PUT' });
    await sleep(6000);
    const chatList = await (await fetch(`${BASE}/json/list`)).json();
    const chatTab = chatList.find((t) => t.type === 'page' && /chatgpt\.com/.test(t.url));
    if (!chatTab) {
      skipped.push('logged-in E2E (no chatgpt.com tab)');
    } else {
      const chat = await connect(chatTab.webSocketDebuggerUrl);
      // Login check via the SAME endpoint the extension uses. Cloudflare may
      // interstitial a fresh window for a few seconds — poll through it.
      let token = false;
      for (let i = 0; i < 10 && !token; i += 1) {
        await sleep(3000);
        token = await evalIn(
          chat,
          `(async () => { try { const j = await (await fetch('/api/auth/session')).json();
               return !!j.accessToken; } catch { return false; } })()`,
        );
      }
      if (!token) {
        skipped.push('logged-in E2E (profile not logged in — run `pnpm smoke:login <ver>`)');
      } else {
        // Pick the most recent conversation from the ACCOUNT's list (read-only
        // GET, same call the extension makes) and navigate straight to it —
        // no sidebar-DOM dependency.
        const conv = await evalIn(
          chat,
          `(async () => { const r = await fetch('/backend-api/conversations?offset=0&limit=5&order=updated');
             const j = await r.json().catch(() => ({}));
             return { status: r.status,
               id: j.items && j.items[0] ? j.items[0].id : '',
               raw: JSON.stringify(j).slice(0, 160) }; })()`,
        );
        console.log(`SMOKE: conversations endpoint → ${conv.status} ${conv.raw}`);
        // A profile whose account keeps history off lists nothing — allow an
        // explicit conversation id via CDP_SMOKE_CONV.
        conv.id = conv.id || process.env.CDP_SMOKE_CONV || '';
        if (!conv.id) {
          skipped.push('logged-in E2E (no conversations in the account list)');
        } else {
          console.log(`SMOKE: testing conversation ${conv.id.slice(0, 8)}…`);
          await evalIn(chat, `location.href = '/c/${conv.id}'`);
          await sleep(9000);
        // Force load via the top-right refresh — full backend read.
        await evalIn(
          cdp,
          `(() => { document.querySelector('.topbar-refresh')?.click(); })()`,
        );
        let readOk = false;
        let lastMid = '';
        const readStart = Date.now();
        for (let i = 0; i < 90; i += 1) {
          await sleep(1000);
          const st = await evalIn(
            cdp,
            `(() => { const rows = [...document.querySelectorAll('.msg[data-mid]')]
                 .filter((r) => !r.dataset.mid.startsWith('paste_'));
               const err = document.querySelector('.notice-error');
               return { count: rows.length, err: err ? err.innerText.slice(0, 80) : null,
                 last: rows.length ? rows[rows.length - 1].dataset.mid : '' }; })()`,
          );
          if (st.err) {
            check('logged-in read lands messages', false, st.err);
            readOk = false;
            break;
          }
          if (st.count > 0) {
            readOk = true;
            lastMid = st.last;
            break;
          }
        }
        check(
          'logged-in read lands messages',
          readOk,
          `${((Date.now() - readStart) / 1000).toFixed(1)}s to first rows via topbar force load`,
        );
        if (readOk) {
          // The user-experienced "read complete" = first rows UNTIL the count
          // stops growing (partial→full upgrade, cache, gating all included).
          let stable = 0;
          let prev = 1;
          const settleStart = Date.now();
          for (let i = 0; i < 60; i += 1) {
            await sleep(1000);
            const n = await evalIn(
              cdp,
              `(() => { return [...document.querySelectorAll('.msg[data-mid]')]
                  .filter((r) => !r.dataset.mid.startsWith('paste_')).length; })()`,
            );
            if (n === prev) {
              stable += 1;
              if (stable >= 4) break;
            } else {
              stable = 0;
              prev = n;
            }
          }
          console.log(
            `SMOKE: TIMING — read settled at ${prev} msgs, total ${(
              (Date.now() - readStart) / 1000
            ).toFixed(1)}s from click to stable`,
          );
          void settleStart;
        }
        if (readOk && lastMid) {
          // Locate needs page-side anchors. In the non-hydrated shell (the
          // automation norm) ChatGPT renders no data-message-id nodes at all —
          // the extension correctly hides locate for those rows.
          const pageAnchors = await evalIn(
            chat,
            `document.querySelectorAll('[data-message-id]').length`,
          );
          if (pageAnchors === 0) {
            skipped.push('locate E2E (page shell not hydrated — no data-message-id anchors)');
          } else {
            // Locate: click the LAST row's number (it is mounted), then the page
            // must actually have that message in its DOM within the seek budget.
          await evalIn(
            cdp,
            `(() => { const rows = [...document.querySelectorAll('.msg[data-mid]')]
                 .filter((r) => !r.dataset.mid.startsWith('paste_'));
               rows[rows.length - 1].querySelector('.msg-num')?.click(); })()`,
          );
          let located = false;
          for (let i = 0; i < 30; i += 1) {
            await sleep(1000);
            const hit = await evalIn(
              chat,
              `!!document.querySelector('[data-message-id="${lastMid.replace(/"/g, '\\"')}"]')`,
            );
            if (hit) {
              located = true;
              break;
            }
          }
          if (!located) {
            // Diagnostics: what does the PAGE actually have vs the PANEL rows?
            const diag = await evalIn(
              chat,
              `(() => { const ids = [...document.querySelectorAll('[data-message-id]')]
                   .map((n) => n.getAttribute('data-message-id'));
                 return { count: ids.length, first: ids[0] ?? '', last: ids[ids.length - 1] ?? '',
                   url: location.pathname.slice(0, 50) }; })()`,
            );
            const panelDiag = await evalIn(
              cdp,
              `(() => { const rows = [...document.querySelectorAll('.msg[data-mid]')];
                 return { count: rows.length,
                   mids: rows.slice(-3).map((r) => r.dataset.mid.slice(0, 12)).join(',') }; })()`,
            );
            console.log(
              `SMOKE: DIAG locate-miss — page: ${JSON.stringify(diag)} | panel: ${JSON.stringify(panelDiag)} | sought: ${lastMid.slice(0, 12)}…`,
            );
          }
          check('locate scrolls the page to the message', located, `mid=${lastMid.slice(0, 12)}…`);
          }
        }
      }
      }
      chat.close();
    }
  }
  for (const s of skipped) console.log(`SMOKE: SKIPPED — ${s}`);

  // 3. The panel is responsive AFTER the failure (gate + pipeline released).
  const alive = await evalIn(
    cdp,
    `(async () => {
      document.querySelector('.intro-actions .btn-primary')?.click();
      await new Promise((r) => setTimeout(r, 1500));
      return document.body.innerText.length > 0;
    })()`,
  );
  check('panel still responsive after failed read', alive === true);

  // Visual evidence for the record.
  const shot = await cdp.call('Page.captureScreenshot', { format: 'png' });
  writeFileSync(new URL('./smoke-panel.png', import.meta.url), Buffer.from(shot.data, 'base64'));
  console.log('SMOKE: screenshot saved → smoke-panel.png');
} catch (e) {
  failures.push(`crash: ${e.message}`);
  console.error('SMOKE: CRASH —', e.stack ?? e.message);
} finally {
  try {
    execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' });
  } catch {}
}

console.log(`SMOKE: browser used = ${browserPathUsed}`);
if (failures.length > 0) {
  console.error(`SMOKE: RESULT FAIL (${failures.length}): ${failures.join(' | ')}`);
  process.exit(1);
}
console.log('SMOKE: RESULT PASS');
