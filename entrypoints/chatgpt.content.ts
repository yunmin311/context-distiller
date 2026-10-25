import type { ConversationInfo, MessageSource } from '../lib/core/types';
import { normalizeMessages, coerceRole } from '../lib/platform/normalizer';
import type { RawMessage } from '../lib/platform/adapter';
import { chatgptAdapter } from '../lib/platform/chatgpt-adapter';
import { splitPastedConversation } from '../lib/utils/paste-split';
import {
  AUTHOR_ROLE_ATTR,
  CONVERSATION_ID_RE,
  MESSAGE_ANCHOR_SELECTOR,
  MESSAGE_ID_ATTR,
  MESSAGE_SELECTOR,
  SEND_BUTTON_SELECTOR,
  STOP_BUTTON_SELECTOR,
  STREAMING_CLASS_SELECTOR,
  THEME_ACCENT_VARS,
  THREAD_SCROLL_SELECTOR,
  TURN_COMPLETE_STATE,
  TURN_MESSAGE_IDS_ATTR,
  TURN_STATE_ATTR,
  TURN_SELECTOR,
  messageByAnyIdSelector,
} from '../lib/platform/chatgpt-markers';
import {
  MW_REQUEST_EVENT,
  MW_RESPONSE_EVENT,
  type PanelRequest,
  type PanelResponse,
  type SelectionPayload,
  type MwRequest,
  type MwResponse,
  type ActiveMessagePush,
  type ThemePush,
  type ConversationGrewPush,
  type StreamChangePush,
} from '../lib/messaging/protocol';

/**
 * Content Script (isolated world).
 *
 * Coordinates the page side: injects the main-world bridge, answers the side
 * panel's requests (read conversation, read selection, fill composer). It reads
 * the DOM and orchestrates, but never renders the panel UI and never persists.
 */
export default defineContentScript({
  matches: ['*://chatgpt.com/*', '*://chat.openai.com/*'],
  runAt: 'document_idle',

  main(ctx) {
    // An orphaned instance (left over from a dev-mode extension reload) has an
    // invalidated context — bail out quietly instead of crashing when it touches
    // browser.runtime. A page refresh replaces it with a fresh, valid instance.
    if (ctx.isInvalid) return;

    // Inject the main-world bridge (fire-and-forget; DOM extraction is the fallback).
    void injectMainWorld();

    try {
      browser.runtime.onMessage.addListener(
        (message: PanelRequest, _sender, sendResponse: (r: PanelResponse) => void) => {
          if (ctx.isInvalid) return false;
          handle(message)
            .then(sendResponse)
            .catch((err) => sendResponse({ kind: 'error', error: String(err) }));
          return true; // keep the message channel open for the async response
        },
      );
    } catch (err) {
      // The context can invalidate between the check above and here during a
      // dev reload. Nothing to do — the next fresh load registers cleanly.
      console.debug('[Context Distiller] listener not registered (context invalidated):', err);
    }

    setupFollow(ctx);
    setupThemeSync(ctx);
    setupGrowthWatch(ctx);
    setupStreamWatch(ctx);
  },
});

/**
 * Is ChatGPT currently generating (streaming) an answer? Two independent page
 * signals: the composer swaps its send button for a STOP button while generating,
 * and the growing answer carries the streaming highlight class. Either alone is
 * treated as active, so a rename of one can't blind us.
 */
/**
 * SSR-FALLBACK EXTRACTION (v1.4.5).
 *
 * ChatGPT's new app shell renders the conversation SERVER-SIDE as plain
 * speaker-prefixed text (「你说：…」/「ChatGPT 说：…」) and hydrates the
 * interactive UI later — in measured conditions (automated contexts, stale
 * tabs) hydration may NEVER happen, leaving the page with ZERO
 * data-message-* anchors: DOM reads, locate and follow all dead, every read
 * forced onto the slow backend path. The fallback text contains the WHOLE
 * thread, so parsing it yields instant, backend-free reads.
 *
 * Guarded to the non-hydrated state (no MESSAGE_SELECTOR nodes) and to text
 * that actually contains speaker lines, so a hydrated page is untouched.
 */
function extractFromSsrFallback(): RawMessage[] {
  // Hydrated (either shell) — the normal paths apply, the fallback must not run.
  if (document.querySelector(`${MESSAGE_SELECTOR}, ${TURN_SELECTOR}, [${TURN_MESSAGE_IDS_ATTR}]`))
    return [];
  const frame =
    document.querySelector<HTMLElement>('[class*="MainContentFrame"]') ??
    document.querySelector<HTMLElement>('main');
  const text = frame?.innerText ?? '';
  if (!text || !/\n?\s*(?:你|我|用户|ai|chatgpt|gpt)(?:说)?\s*[:：]/i.test(text)) return [];
  const turns = splitPastedConversation(text, 'assistant');
  // Fewer than half the turns matching a speaker prefix usually means we
  // grabbed UI chrome instead of the thread — bail rather than guess.
  if (turns.length === 0) return [];
  return turns.map((t) => ({ role: t.role, text: t.text, source: 'dom' as const }));
}

function isGenerating(): boolean {
  // New shell: per-turn lifecycle state — anything but "complete" is streaming.
  const activeTurn = document.querySelector(`[${TURN_STATE_ATTR}]`);
  if (
    activeTurn &&
    activeTurn.getAttribute(TURN_STATE_ATTR) !== TURN_COMPLETE_STATE
  ) {
    return true;
  }
  // Legacy signals, visibility-checked (stale hidden stop buttons made
  // existence-only checks read as "generating forever").
  const stop = document.querySelector<HTMLElement>(STOP_BUTTON_SELECTOR);
  if (stop && (stop.offsetParent !== null || stop.getClientRects().length > 0)) return true;
  const streaming = document.querySelector<HTMLElement>(STREAMING_CLASS_SELECTOR);
  return !!streaming && streaming.getClientRects().length > 0;
}

/**
 * Report stream start/stop to the panel, so it can quietly re-read on a slow
 * cadence while an answer is being generated and do one catch-up read after it
 * ends. Pushed only on CHANGES (debounced — generation churns the DOM constantly).
 */
function setupStreamWatch(ctx: {
  isInvalid: boolean;
  onInvalidated: (cb: () => void) => void;
}): void {
  let last: boolean | null = null;
  let timer: number | undefined;
  const check = () => {
    timer = undefined;
    if (ctx.isInvalid) return;
    const active = isGenerating();
    if (active === last) return;
    last = active;
    const msg: StreamChangePush = { kind: 'stream-change', active };
    try {
      void browser.runtime.sendMessage(msg).catch(() => {});
    } catch {
      // context gone between the check and the send — ignore
    }
  };
  const observer = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(check, 350); // let bursts of DOM churn settle first
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  check();
  ctx.onInvalidated(() => {
    observer.disconnect();
    if (timer) clearTimeout(timer);
  });
}

/** Mounted-message count and completeness of the most recent read. */
let lastReadWasPartial = false;
let lastReadMounted = 0;

/**
 * When the panel is showing a PARTIAL (DOM) read — the fallback used when the full
 * backend read isn't available — scrolling up loads older turns into the page.
 * Tell the panel so it can re-read and grow its list, instead of the user having
 * to hit refresh. After a full read there is nothing to add, so we stay silent.
 */
function setupGrowthWatch(ctx: {
  isInvalid: boolean;
  onInvalidated: (cb: () => void) => void;
}): void {
  let timer: number | undefined;
  const check = () => {
    if (ctx.isInvalid || !lastReadWasPartial) return;
    const mounted = document.querySelectorAll(MESSAGE_SELECTOR).length;
    if (mounted <= lastReadMounted) return;
    lastReadMounted = mounted;
    const msg: ConversationGrewPush = { kind: 'conversation-grew', mounted, reason: 'grown' };
    try {
      void browser.runtime.sendMessage(msg).catch(() => {});
    } catch {
      // context gone between the check and the send — ignore
    }
  };
  const observer = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(check, 500); // settle before reporting
  });
  observer.observe(document.body, { childList: true, subtree: true });
  ctx.onInvalidated(() => {
    observer.disconnect();
    if (timer) clearTimeout(timer);
  });
}

/**
 * Tell the panel ChatGPT's light/dark theme whenever it changes, so the panel can
 * follow it. ChatGPT toggles theme by changing a class / attribute on <html>, so
 * we watch that. Lifecycle-safe like setupFollow: the observer is disconnected on
 * context invalidation, and the send is guarded.
 */
function setupThemeSync(ctx: {
  isInvalid: boolean;
  onInvalidated: (cb: () => void) => void;
}): void {
  let last = '';
  const push = () => {
    if (ctx.isInvalid) return;
    const theme = detectChatgptTheme();
    const accent = detectChatgptAccent(theme);
    const key = `${theme}|${accent ?? ''}`;
    if (key === last) return;
    last = key;
    const msg: ThemePush = { kind: 'theme-change', theme, accent };
    try {
      void browser.runtime.sendMessage(msg).catch(() => {});
    } catch {
      // context gone between the check and the send — ignore
    }
  };
  const observer = new MutationObserver(push);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme'],
  });
  ctx.onInvalidated(() => observer.disconnect());
}

/**
 * "Follow" — as the user scrolls / uses ChatGPT's right-side jump, tell the panel
 * which message is at the top of the viewport so it can highlight + scroll to it.
 *
 * Lifecycle-safe: the scroll listener is REMOVED when the context is invalidated
 * (an orphaned instance after an extension reload), and sends are guarded by
 * `ctx.isInvalid`, so an old instance can never keep firing runtime.sendMessage
 * on a dead context. Throttled to animation frames and to actual id changes; if
 * the panel isn't open the send simply has no receiver.
 */
function setupFollow(ctx: {
  isInvalid: boolean;
  onInvalidated: (cb: () => void) => void;
}): void {
  let scheduled = false;
  let lastId = '';
  const onScroll = () => {
    // Our OWN scrolling (locate / seek) must not be reported back as "the user
    // moved here" — that turned one click into a feedback loop: we scroll the
    // page, the page tells the panel, the panel scrolls, and both ends chase
    // each other until neither is anywhere near the target.
    if (isProgrammaticScroll()) return;
    if (scheduled || ctx.isInvalid) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (ctx.isInvalid) return;
      const id = topVisibleMessageId();
      if (!id || id === lastId) return;
      lastId = id;
      const msg: ActiveMessagePush = { kind: 'active-message', messageId: id };
      try {
        void browser.runtime.sendMessage(msg).catch(() => {});
      } catch {
        // context gone between the check and the send — ignore
      }
    });
  };
  // Capture phase catches scrolling of ChatGPT's inner message container too.
  window.addEventListener('scroll', onScroll, true);
  ctx.onInvalidated(() => window.removeEventListener('scroll', onScroll, true));
}

/**
 * While WE are scrolling the page (a locate, or the multi-step seek), the follow
 * push is muted: those scrolls are not the user moving around, and reporting them
 * makes the panel chase a position we are still changing. Held as a deadline that
 * each programmatic scroll extends, so a whole seek stays covered.
 */
let programmaticScrollUntil = 0;

function beginProgrammaticScroll(ms: number): void {
  programmaticScrollUntil = Math.max(programmaticScrollUntil, Date.now() + ms);
}

function isProgrammaticScroll(): boolean {
  return Date.now() < programmaticScrollUntil;
}

/**
 * The message whose top sits just below the header line — i.e. the one the user
 * has scrolled to / is reading at the top of the viewport.
 */
function topVisibleMessageId(): string | null {
  // Both shells: legacy data-message-id nodes and new-shell turn id lists.
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(MESSAGE_ANCHOR_SELECTOR),
  );
  const LINE = 140; // a little below the very top of the viewport
  let best: HTMLElement | null = null;
  let bestTop = -Infinity;
  for (const n of nodes) {
    const rect = n.getBoundingClientRect();
    if (rect.bottom <= 0) continue; // fully scrolled above
    if (rect.top <= LINE && rect.top > bestTop) {
      bestTop = rect.top;
      best = n;
    }
  }
  if (!best) {
    for (const n of nodes) {
      if (n.getBoundingClientRect().bottom > 0) {
        best = n;
        break;
      }
    }
  }
  if (!best) return null;
  return (
    best.getAttribute(MESSAGE_ID_ATTR) ??
    ((best.getAttribute(TURN_MESSAGE_IDS_ATTR) || '').split(/\s+/)[0] || null)
  );
}

/** Inject the main-world bridge; swallow failures so DOM extraction still works. */
async function injectMainWorld(): Promise<void> {
  try {
    await injectScript('/chatgpt-main-world.js', { keepInDom: true });
  } catch (err) {
    console.debug('[Context Distiller] main-world inject failed, DOM only:', err);
  }
}

let mwCounter = 0;

/** Ask the main-world bridge to extract messages; resolves null on timeout. */
function requestMainWorld(
  timeoutMs: number,
  action: MwRequest['action'] = 'extract',
  bypassCache = false,
): Promise<MwResponse | null> {
  return new Promise((resolve) => {
    const id = `mw_${mwCounter++}_${Math.random().toString(36).slice(2, 8)}`;
    let settled = false;

    const onResponse = (event: Event) => {
      const detail = (event as CustomEvent<MwResponse>).detail;
      if (!detail || detail.id !== id) return;
      settled = true;
      window.removeEventListener(MW_RESPONSE_EVENT, onResponse);
      resolve(detail);
    };

    window.addEventListener(MW_RESPONSE_EVENT, onResponse);
    window.dispatchEvent(
      new CustomEvent<MwRequest>(MW_REQUEST_EVENT, {
        detail: { id, action, bypassCache: bypassCache || undefined },
      }),
    );

    setTimeout(() => {
      if (settled) return;
      window.removeEventListener(MW_RESPONSE_EVENT, onResponse);
      resolve(null);
    }, timeoutMs);
  });
}

async function handle(message: PanelRequest): Promise<PanelResponse> {
  switch (message.kind) {
    case 'ping':
      return { kind: 'pong', platform: chatgptAdapter.id };
    case 'get-conversation':
      return getConversation(message);
    case 'get-selection':
      try {
        return { kind: 'selection', ok: true, selection: readSelection() };
      } catch (err) {
        return { kind: 'selection', ok: false, error: String(err) };
      }
    case 'fill-composer': {
      const ok = await chatgptAdapter.fillComposer(message.text);
      // The page has no idea which language the panel is showing, so failures
      // travel as a stable code and the panel words them (see lib/i18n).
      return {
        kind: 'fill',
        ok,
        error: ok ? undefined : '未能写入输入框，请改用“复制完整消息”。',
        code: ok ? undefined : 'err.fillFailed',
      };
    }
    case 'scroll-to-message':
      return scrollToMessage(message.messageId, message.orderedIds);
    case 'get-theme': {
      const theme = detectChatgptTheme();
      return { kind: 'theme', theme, accent: detectChatgptAccent(theme) };
    }
    case 'get-stream':
      return { kind: 'stream', active: isGenerating() };
    case 'deep-walk-step':
      return deepWalkStep(message.toTop === true);
    default:
      return { kind: 'error', error: '未知请求', code: 'err.unknownRequest' };
  }
}

async function getConversation(message: PanelRequest & { kind: 'get-conversation' }): Promise<PanelResponse> {
  const url = location.href;
  const title = chatgptAdapter.getConversationTitle();

  let raw: RawMessage[];
  let source: MessageSource;
  let partial: boolean;
  // How many turns the page-world bridge contributed — part of the no-messages
  // diagnostic line (0 there means the fiber walk found nothing either).
  let bridgeCount = 0;

  // DOM-ONLY mode (deep-load walk): skip the backend entirely — zero pressure
  // on a throttling endpoint, and each walk step returns in milliseconds.
  const domOnly = message.domOnly === true;
  const apiPromise = domOnly
    ? null
    : requestMainWorld(40000, 'extract-api', message.bypassCache === true);
  const api = apiPromise
    ? await Promise.race([
        apiPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
      ])
    : null;

  if (api?.ok && api.messages && api.messages.length > 0) {
    raw = api.messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      source: 'page-data' as const,
    }));
    source = 'page-data';
    partial = false; // the whole conversation, not just what's mounted
  } else {
    // Full read not available YET (fast budget elapsed) or failed outright —
    // record WHY, fall back to the mounted DOM, and let stage 2 finish later.
    console.info(
      '[Context Distiller] full read unavailable → showing mounted DOM now. reason:',
      api === null
        ? `slower than 6s (still trying in the background)`
        : api.error ?? 'unknown',
    );
    let domRaw = chatgptAdapter.extractFromDom();
    if (domRaw.length === 0) domRaw = extractFromSsrFallback(); // non-hydrated shell
    if (domRaw.length > 0) {
      const mw = await requestMainWorld(400);
      const mwText = new Map<string, string>();
      if (mw?.ok && mw.messages) {
        for (const m of mw.messages) if (m.id && m.text) mwText.set(m.id, m.text);
      }
      raw = domRaw.map((d) =>
        d.id && mwText.has(d.id)
          ? { ...d, text: mwText.get(d.id)!, source: 'page-data' as const }
          : d,
      );
      source = mwText.size > 0 ? 'page-data' : 'dom';
      bridgeCount = mwText.size;
    } else {
      const mw = await requestMainWorld(400);
      raw =
        mw?.ok && mw.messages
          ? mw.messages.map((m) => ({ id: m.id, role: m.role, text: m.text, source: 'page-data' as const }))
          : [];
      source = 'page-data';
      bridgeCount = mw?.ok && mw.messages ? mw.messages.length : 0;
    }
    partial = true;

    // Stage 2 — report the outcome of the background full read (never in
    // DOM-ONLY mode: there is no background read by design).
    if (apiPromise) {
      void apiPromise.then((late) => {
        if (location.href !== url) return; // user moved on to another conversation
        if (late?.ok && late.messages && late.messages.length > 0) {
          console.info('[Context Distiller] late FULL read arrived — panel will upgrade itself');
          try {
            void browser.runtime
              .sendMessage({
                kind: 'conversation-grew',
                mounted: document.querySelectorAll(MESSAGE_SELECTOR).length,
                reason: 'full-ready',
              } satisfies ConversationGrewPush)
              .catch(() => {});
          } catch {
            // context gone between check and send — ignore
          }
        } else {
          console.info(
            '[Context Distiller] background full read failed:',
            late ? late.error ?? 'unknown' : 'no answer within 40s',
          );
        }
      });
    }
  }

  document.documentElement.setAttribute(
    'data-cd-lastread',
    'raw=' + raw.length + ' partial=' + partial + ' source=' + source,
  );
  console.debug(
    `[Context Distiller] read ${raw.length} messages via ${partial ? 'DOM (partial)' : 'API (full)'}`,
  );

  // Remember what this read saw, so the growth watcher only speaks up when a
  // partial read could actually be improved by re-reading.
  lastReadWasPartial = partial;
  lastReadMounted = document.querySelectorAll(MESSAGE_SELECTOR).length;

  const messages = normalizeMessages(raw);
  if (messages.length === 0) {
    // ZERO readable turns is the one failure the panel cannot classify on its
    // own — ship the layer counts so the error line alone pins which layer is
    // broken (no page nodes → wrong page or a ChatGPT markup change; nodes but
    // no raw turns → text extraction; raw turns but no normalized → filtering).
    const domNodes = document.querySelectorAll(MESSAGE_SELECTOR).length;
    const onConversation = CONVERSATION_ID_RE.test(location.pathname);
    const detail = onConversation
      ? `诊断：页面消息节点 ${domNodes} 个 → 原始消息 ${raw.length} 条（其中页面数据 ${bridgeCount} 条）。`
      : '当前是还没有消息的新对话 —— 先发出第一条消息，再读取。';
    return {
      kind: 'conversation',
      ok: false,
      error: `未读取到消息。${detail}`,
      code: 'err.noMessages',
    };
  }

  const conversation: ConversationInfo = { title, url, platform: chatgptAdapter.id };
  return { kind: 'conversation', ok: true, conversation, messages, partial, source };
}

/** Small await helper shared by the seek and the deep-load walk. */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * One step of the DEEP LOAD walk (panel-driven). ChatGPT virtualizes long
 * threads, so when the backend read is throttled the only way to see EVERYTHING
 * is to walk the page: jump to the oldest message, then scroll one viewport at
 * a time toward the newest while the panel merges each partial read.
 * Programmatic-scroll muting covers the whole walk so Follow never fights it.
 */
async function deepWalkStep(toTop: boolean): Promise<PanelResponse> {
  const container = findScrollContainer();
  const maxTop = () => Math.max(0, container.scrollHeight - container.clientHeight);
  beginProgrammaticScroll(2000);
  if (toTop) {
    container.scrollTo({ top: 0, behavior: 'auto' });
    await sleep(450);
    return { kind: 'deep-walk', ok: true, reachedEnd: maxTop() < 10 };
  }
  const before = container.scrollTop;
  container.scrollTo({
    top: Math.min(maxTop(), before + container.clientHeight * 0.9),
    behavior: 'auto',
  });
  await sleep(380);
  const after = container.scrollTop;
  const reachedEnd = after >= maxTop() - 4 || after <= before + 2;
  return { kind: 'deep-walk', ok: true, reachedEnd };
}

/**
 * Scroll the ChatGPT page to a message and flash a ring around it. PURE, LOCAL
 * scroll of the page the user already has open — no network request, no message
 * sent, nothing done to the account (zero ban risk).
 *
 * ChatGPT virtualizes long threads, so a message read via the backend API often
 * isn't in the DOM. When it isn't, we SEEK it: scroll the conversation container
 * toward its position (binary-searched using the full ordered id list) until it
 * mounts. If it still can't be found, we say so instead of guessing.
 */
async function scrollToMessage(messageId: string, orderedIds?: string[]): Promise<PanelResponse> {
  // Ported VERBATIM from v1.3.0 (user verdict: the old locate was the product's
  // best feature — do not redesign it). Only the anchor selector is dual-mode
  // (new-shell turn keys + legacy data-message-id).
  const sel = messageByAnyIdSelector(messageId);
  // Mute the follow push for the whole operation (extended by each seek step).
  beginProgrammaticScroll(2000);
  let el = document.querySelector<HTMLElement>(sel);
  if (!el && orderedIds && orderedIds.length > 0) {
    // The FIRST seek in a session often failed because the virtualizer had not
    // settled yet (heights still being measured), which is why it used to take a
    // few clicks. Run the seek, and if it comes up empty, run it once more — the
    // first pass leaves the list warmed up and measured, so the retry lands.
    el = await seekToMessage(messageId, orderedIds);
    if (!el) {
      await new Promise<void>((r) => setTimeout(r, 200));
      el = await seekToMessage(messageId, orderedIds);
    }
  }
  if (!el) {
    return {
      kind: 'scroll-result',
      ok: false,
      error: '这条当前找不到（可能刚被折叠/虚拟化），刷新页面后再试。',
      code: 'err.scrollNotFound',
    };
  }
  beginProgrammaticScroll(1400);
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  // The virtualizer keeps RE-LAYOUTING after we arrive (heights above the
  // target settle late), and that drift can shove the target to the TOP of the
  // viewport. One compensation pass wasn't enough — verify the landing several
  // times and re-center whenever the target drifted away from the middle.
  void (async () => {
    for (const delay of [240, 480, 900]) {
      await sleep(delay);
      const cur = document.querySelector<HTMLElement>(sel) ?? el;
      beginProgrammaticScroll(1000); // keep Follow muted for the whole settle
      const rect = cur.getBoundingClientRect();
      const offCenter = Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2);
      if (offCenter > 80) {
        cur.scrollIntoView({ block: 'center', behavior: 'auto' });
      }
      if (delay === 900) flashElement(cur);
    }
  })();
  return { kind: 'scroll-result', ok: true };
}

/**
 * Detect ChatGPT's current light/dark theme. Prefers its own `dark`/`light` class
 * on <html>; falls back to the page background's luminance so a class rename can't
 * break it. Used to tint the locate highlight and to sync the panel's theme.
 */
function detectChatgptTheme(): 'light' | 'dark' {
  const root = document.documentElement;
  if (root.classList.contains('dark')) return 'dark';
  if (root.classList.contains('light')) return 'light';
  const bg =
    getComputedStyle(document.body).backgroundColor || getComputedStyle(root).backgroundColor;
  const m = bg.match(/\d+(\.\d+)?/g);
  if (m && m.length >= 3) {
    const lum = 0.2126 * Number(m[0]) + 0.7152 * Number(m[1]) + 0.0722 * Number(m[2]);
    return lum < 128 ? 'dark' : 'light';
  }
  return 'light';
}

/** Parse a CSS color to RGB, using the browser itself (handles rgb/hex/oklch/…). */
function parseRgb(color: string): [number, number, number] | null {
  if (!color) return null;
  const probe = document.createElement('span');
  probe.style.color = '';
  probe.style.color = color;
  if (!probe.style.color) return null; // not a color the browser accepts
  probe.style.position = 'fixed';
  probe.style.pointerEvents = 'none';
  probe.style.opacity = '0';
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  const m = resolved.match(/\d+(\.\d+)?/g);
  if (!m || m.length < 3) return null;
  // Reject fully transparent results.
  if (m.length >= 4 && Number(m[3]) === 0) return null;
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

/** Is this color a usable accent — i.e. not near-black, near-white, or grey? */
function isUsableAccent(rgb: [number, number, number], theme: 'light' | 'dark'): boolean {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // ChatGPT's primary button is monochrome (black on light / white on dark); a
  // greyscale color is not an accent worth borrowing, so require some saturation
  // OR a mid luminance that still reads as a tint.
  if (max - min < 18) return false;
  return theme === 'dark' ? lum > 40 : lum < 225;
}

/**
 * Read ChatGPT's own accent / primary-button color so the panel can borrow it.
 * Tries the CSS custom properties ChatGPT defines on :root, then falls back to the
 * computed background of the composer's send button. Returns null when the page
 * only offers a monochrome button (then the panel keeps its own neutral accent).
 */
function detectChatgptAccent(theme: 'light' | 'dark'): string | null {
  const rootStyle = getComputedStyle(document.documentElement);
  for (const name of THEME_ACCENT_VARS) {
    const raw = rootStyle.getPropertyValue(name).trim();
    if (!raw) continue;
    const rgb = parseRgb(raw);
    if (rgb && isUsableAccent(rgb, theme)) return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }
  // Fall back to the send button / a prominent link.
  const candidates = [
    document.querySelector<HTMLElement>(SEND_BUTTON_SELECTOR),
    document.querySelector<HTMLElement>('button[aria-label*="Send" i]'),
  ];
  for (const el of candidates) {
    if (!el) continue;
    const cs = getComputedStyle(el);
    for (const raw of [cs.backgroundColor, cs.color]) {
      const rgb = parseRgb(raw);
      if (rgb && isUsableAccent(rgb, theme)) return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }
  }
  return null;
}

/** Non-layout highlight (outline ring + soft glow), restored after a moment.
 *  Monochrome and tinted to ChatGPT's OWN theme, so it reads as native instead of
 *  a clashing accent. Saves/restores the inline styles we touch. */
function flashElement(el: HTMLElement): void {
  const theme = detectChatgptTheme();
  const dark = theme === 'dark';
  // The product's blue accent, matching the panel. Thin: a hairline ring reads as
  // a pointer, while a heavy band looks like a defect on someone else's page.
  const ring = dark ? 'rgba(111, 168, 216, 0.95)' : 'rgba(61, 127, 181, 0.95)';
  const glow = dark ? 'rgba(111, 168, 216, 0.16)' : 'rgba(61, 127, 181, 0.12)';
  const prev = {
    outline: el.style.outline,
    offset: el.style.outlineOffset,
    radius: el.style.borderRadius,
    shadow: el.style.boxShadow,
    transition: el.style.transition,
  };
  el.style.transition = 'outline-color 0.25s ease, box-shadow 0.25s ease';
  el.style.outline = `1.5px solid ${ring}`;
  el.style.outlineOffset = '2px';
  el.style.borderRadius = '10px';
  el.style.boxShadow = `0 0 0 3px ${glow}`;
  window.setTimeout(() => {
    el.style.outline = prev.outline;
    el.style.outlineOffset = prev.offset;
    el.style.borderRadius = prev.radius;
    el.style.boxShadow = prev.shadow;
    el.style.transition = prev.transition;
  }, 1600);
}

/** The scrollable ancestor that holds the conversation (best effort). */
function findScrollContainer(): HTMLElement {
  // New shell names its scroller explicitly — trust it when present.
  const named = document.querySelector<HTMLElement>(THREAD_SCROLL_SELECTOR);
  if (named && named.scrollHeight - named.clientHeight > 60) return named;
  const anyMsg = document.querySelector<HTMLElement>(`${MESSAGE_SELECTOR}, ${TURN_SELECTOR}`);
  let el: HTMLElement | null = anyMsg?.parentElement ?? null;
  // Pick the ancestor with the LARGEST scrollable range — the real conversation
  // scroller, not the first nested element that merely allows overflow.
  let best: HTMLElement | null = null;
  let bestRange = 0;
  while (el && el !== document.body) {
    const oy = getComputedStyle(el).overflowY;
    const range = el.scrollHeight - el.clientHeight;
    if ((oy === 'auto' || oy === 'scroll') && range > bestRange) {
      best = el;
      bestRange = range;
    }
    el = el.parentElement;
  }
  if (best && bestRange > 60) return best;
  return (document.scrollingElement as HTMLElement) ?? document.documentElement;
}

/**
 * Seek a virtualized (unmounted) message by scrolling the container to its likely
 * position, using the mounted messages we CAN map to an order as feedback to
 * binary-search toward the target. Bounded so it can't scroll forever.
 */
async function seekToMessage(messageId: string, orderedIds: string[]): Promise<HTMLElement | null> {
  const targetOrder = orderedIds.indexOf(messageId);
  if (targetOrder < 0) return null;
  const container = findScrollContainer();
  const orderOf = new Map(orderedIds.map((id, i) => [id, i] as const));
  const sel = messageByAnyIdSelector(messageId);
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const maxTop = () => Math.max(1, container.scrollHeight - container.clientHeight);

  const mountedOrders = (): number[] =>
    Array.from(document.querySelectorAll<HTMLElement>(MESSAGE_ANCHOR_SELECTOR)).flatMap(
      (node) => {
        const legacy = node.getAttribute(MESSAGE_ID_ATTR);
        const ids = legacy
          ? [legacy]
          : (node.getAttribute(TURN_MESSAGE_IDS_ATTR) || '').split(/\s+/);
        return ids
          .map((id) => orderOf.get(id))
          .filter((o): o is number => typeof o === 'number');
      },
    );

  // One proportional jump to get in the neighbourhood…
  let top = (targetOrder / Math.max(1, orderedIds.length - 1)) * maxTop();
  beginProgrammaticScroll(1500);
  container.scrollTo({ top, behavior: 'auto' });
  await wait(260);
  const early = document.querySelector<HTMLElement>(sel);
  if (early) return early;

  // …then WALK toward it a screen at a time. Interpolating a second guess made the
  // hunt oscillate — the virtualizer changes scrollHeight underfoot, so a computed
  // position is stale by the time it applies. Stepping can't overshoot by more than
  // one screen, which is why this lands on the first click instead of the third.
  // (Ported verbatim from v1.3.0 — same step size, same waits, same budget.)
  const step = Math.max(200, container.clientHeight * 0.8);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const mounted = mountedOrders();
    let dir = 0;
    if (mounted.length === 0) {
      dir = 1;
    } else if (targetOrder < Math.min(...mounted)) {
      dir = -1; // target is above what's mounted
    } else if (targetOrder > Math.max(...mounted)) {
      dir = 1; // target is below
    } else {
      // Inside the mounted band but not painted yet — let it render, then nudge on.
      await wait(200);
      const late = document.querySelector<HTMLElement>(sel);
      if (late) return late;
      dir = 1;
    }

    const extent = maxTop();
    const next = Math.max(0, Math.min(extent, top + dir * step));
    if (next === top) break; // pinned at an end and still nothing — give up cleanly
    top = next;

    beginProgrammaticScroll(1200); // keep the follow push muted for the whole hunt
    container.scrollTo({ top, behavior: 'auto' });
    await wait(210);

    const hit = document.querySelector<HTMLElement>(sel);
    if (hit) return hit;
  }
  return document.querySelector<HTMLElement>(sel);
}

function readSelection(): SelectionPayload | null {
  const selection = window.getSelection();
  const text = selection?.toString().trim();
  if (!selection || !text) return null;

  const anchor = selection.anchorNode;
  const startEl = anchor instanceof Element ? anchor : anchor?.parentElement ?? null;
  const messageEl = startEl?.closest<HTMLElement>(MESSAGE_SELECTOR) ?? null;

  const role =
    coerceRole(messageEl?.getAttribute(AUTHOR_ROLE_ATTR) ?? 'assistant') ?? 'assistant';
  const messageId = messageEl?.getAttribute(MESSAGE_ID_ATTR) ?? undefined;

  let sourceOrder = 0;
  if (messageEl) {
    const all = Array.from(document.querySelectorAll(MESSAGE_SELECTOR));
    sourceOrder = Math.max(0, all.indexOf(messageEl));
  }

  return {
    text,
    role: role === 'system' ? 'assistant' : role,
    messageId,
    sourceOrder,
  };
}




