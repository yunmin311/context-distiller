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
  },
});

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
function requestMainWorld(timeoutMs: number): Promise<MwResponse | null> {
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
      new CustomEvent<MwRequest>(MW_REQUEST_EVENT, { detail: { id, action: 'extract' } }),
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
    default:
      return { kind: 'error', error: '未知请求' };
  }
}

async function getConversation(): Promise<PanelResponse> {
  const url = location.href;
  const title = chatgptAdapter.getConversationTitle();

  let raw: RawMessage[];
  let source: MessageSource;

  // Prefer the page's internal data (better text), fall back to DOM. The bridge
  // is injected at document_idle and normally answers in a few ms; the short
  // window only bites on the very first read before it has registered, and DOM
  // extraction (still good) covers that case.
  const mw = await requestMainWorld(450);
  if (mw?.ok && mw.messages && mw.messages.length > 0) {
    raw = mw.messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      source: 'page-data' as const,
    }));
    source = 'page-data';
  } else {
    raw = chatgptAdapter.extractFromDom();
    source = 'dom';
  }

  const messages = normalizeMessages(raw);
  if (messages.length === 0) {
    return {
      kind: 'conversation',
      ok: false,
      error: '未读取到消息。请确认已打开一个对话；超长对话可向上滚动加载后再刷新。',
    };
  }

  const conversation: ConversationInfo = { title, url, platform: chatgptAdapter.id };
  return {
    kind: 'conversation',
    ok: true,
    conversation,
    messages,
    // Virtual lists only mount visible messages, so completeness is not guaranteed.
    partial: true,
    source,
  };
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
