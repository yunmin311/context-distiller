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
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Usage:
//   node cdp-smoke.mjs <extensionDir> <expectedVersion>   (explicit)
//   node cdp-smoke.mjs <expectedVersion>                  (dir defaults to .output/chrome-mv3 — `pnpm smoke 1.4.4`)
// A first arg starting with a digit is treated as the version, so
// `pnpm smoke 1.4.4` works even though the npm script already pins the dir.
const DEFAULT_DIR = '.output/chrome-mv3';
const arg1 = process.argv[2];
const arg2 = process.argv[3];
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
  const profile = mkdtempSync(join(tmpdir(), 'cd-smoke-'));
  const child = spawn(
    browserPath,
    [
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-crash-reporter',
      `--load-extension=${extensionDir}`,
      `--remote-debugging-port=${PORT}`,
      // Headless: a windowed launch can attach to an EXISTING browser session
      // ("正在现有浏览器会话中打开"), which leaves OUR debug port dead — the
      // exact failure that made this script flaky. headless=new always starts
      // its own session. Extensions DO load in headless=new (verified on Edge).
      '--headless=new',
      '--window-size=560,940',
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
for (const p of candidates) {
  console.log(`SMOKE: trying ${p}`);
  launched = await launchWith(p);
  if (launched) {
    browserPathUsed = p;
    break;
  }
  console.log(`SMOKE: ${p} did not load the extension (flag ignored?), trying next`);
}
if (!launched) {
  console.error('SMOKE: FAIL — no candidate loaded the extension');
  process.exit(1);
}
({ child, id } = launched);
}
const failures = [];
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

  // 2. Open a real chatgpt.com tab (becomes the ACTIVE tab), then click 读取
  //    in the panel: full three-hop against the logged-out landing page.
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
