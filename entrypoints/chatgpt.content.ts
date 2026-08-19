import type { ConversationInfo, MessageSource } from '../lib/core/types';
import { normalizeMessages, coerceRole } from '../lib/platform/normalizer';
import type { RawMessage } from '../lib/platform/adapter';
import { chatgptAdapter } from '../lib/platform/chatgpt-adapter';
import {
  MW_REQUEST_EVENT,
  MW_RESPONSE_EVENT,
  type PanelRequest,
  type PanelResponse,
  type SelectionPayload,
  type MwRequest,
  type MwResponse,
  type ActiveMessagePush,
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
  },
});

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
 * The message whose top sits just below the header line — i.e. the one the user
 * has scrolled to / is reading at the top of the viewport.
 */
function topVisibleMessageId(): string | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-message-author-role]'));
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
  return best ? best.getAttribute('data-message-id') : null;
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
      new CustomEvent<MwRequest>(MW_REQUEST_EVENT, { detail: { id, action } }),
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
      return getConversation();
    case 'get-selection':
      try {
        return { kind: 'selection', ok: true, selection: readSelection() };
      } catch (err) {
        return { kind: 'selection', ok: false, error: String(err) };
      }
    case 'fill-composer': {
      const ok = await chatgptAdapter.fillComposer(message.text);
      return { kind: 'fill', ok, error: ok ? undefined : '未能写入输入框，请改用“复制完整消息”。' };
    }
    case 'scroll-to-message':
      return scrollToMessage(message.messageId);
    default:
      return { kind: 'error', error: '未知请求' };
  }
}

async function getConversation(): Promise<PanelResponse> {
  const url = location.href;
  const title = chatgptAdapter.getConversationTitle();

  let raw: RawMessage[];
  let source: MessageSource;
  let partial: boolean;

  // Primary: full thread from ChatGPT's backend, fetched in the MAIN WORLD (page
  // context — same-origin session auth works there, unlike an isolated-world
  // fetch, which made long reads silently fall back to a partial DOM read).
  // Generous timeout so a big conversation's JSON has time to arrive.
  const api = await requestMainWorld(8000, 'extract-api');
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
    // Fallback: read the mounted DOM (main-world text where available). May be
    // partial when ChatGPT virtualizes a long thread.
    const domRaw = chatgptAdapter.extractFromDom();
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
    } else {
      const mw = await requestMainWorld(400);
      raw =
        mw?.ok && mw.messages
          ? mw.messages.map((m) => ({ id: m.id, role: m.role, text: m.text, source: 'page-data' as const }))
          : [];
      source = 'page-data';
    }
    partial = true;
  }

  console.debug(
    `[Context Distiller] read ${raw.length} messages via ${partial ? 'DOM (partial)' : 'API (full)'}`,
  );

  const messages = normalizeMessages(raw);
  if (messages.length === 0) {
    return {
      kind: 'conversation',
      ok: false,
      error: '未读取到消息。请确认已打开一个对话；超长对话可向上滚动加载后再刷新。',
    };
  }

  const conversation: ConversationInfo = { title, url, platform: chatgptAdapter.id };
  return { kind: 'conversation', ok: true, conversation, messages, partial, source };
}

/**
 * Scroll the ChatGPT page to a message and flash a brief ring around it. This is
 * a PURE, LOCAL scroll of the page the user already has open — no network request,
 * no message sent, nothing done to the account (zero ban risk). If the message
 * isn't mounted (ChatGPT virtualizes long threads), we can't reach it, so we say
 * so instead of guessing.
 */
function scrollToMessage(messageId: string): PanelResponse {
  const el = document.querySelector<HTMLElement>(
    `[data-message-id="${CSS.escape(messageId)}"]`,
  );
  if (!el) {
    return { kind: 'scroll-result', ok: false, error: '这条当前不在页面上，向上滚动加载后再试。' };
  }
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  // Non-layout highlight (outline ring), restored after a moment. We save and
  // restore the inline styles we touch so ChatGPT's own styling is left intact.
  const prev = {
    outline: el.style.outline,
    offset: el.style.outlineOffset,
    radius: el.style.borderRadius,
    transition: el.style.transition,
  };
  el.style.transition = 'outline-color 0.25s ease';
  el.style.outline = '2px solid rgba(56, 132, 122, 0.9)';
  el.style.outlineOffset = '3px';
  el.style.borderRadius = '10px';
  window.setTimeout(() => {
    el.style.outline = prev.outline;
    el.style.outlineOffset = prev.offset;
    el.style.borderRadius = prev.radius;
    el.style.transition = prev.transition;
  }, 1600);
  return { kind: 'scroll-result', ok: true };
}

function readSelection(): SelectionPayload | null {
  const selection = window.getSelection();
  const text = selection?.toString().trim();
  if (!selection || !text) return null;

  const anchor = selection.anchorNode;
  const startEl = anchor instanceof Element ? anchor : anchor?.parentElement ?? null;
  const messageEl = startEl?.closest<HTMLElement>('[data-message-author-role]') ?? null;

  const role =
    coerceRole(messageEl?.getAttribute('data-message-author-role') ?? 'assistant') ?? 'assistant';
  const messageId = messageEl?.getAttribute('data-message-id') ?? undefined;

  let sourceOrder = 0;
  if (messageEl) {
    const all = Array.from(document.querySelectorAll('[data-message-author-role]'));
    sourceOrder = Math.max(0, all.indexOf(messageEl));
  }

  return {
    text,
    role: role === 'system' ? 'assistant' : role,
    messageId,
    sourceOrder,
  };
}
