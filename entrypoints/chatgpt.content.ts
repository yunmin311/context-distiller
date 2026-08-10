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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The scrollable element that holds the conversation (ChatGPT virtualizes it). */
function findScrollContainer(): HTMLElement | null {
  const msg = document.querySelector<HTMLElement>('[data-message-author-role]');
  let el: HTMLElement | null = msg?.parentElement ?? null;
  while (el && el !== document.body) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 40) return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * Read the WHOLE conversation. ChatGPT virtualizes long threads (only messages
 * near the viewport are actually in the DOM), so a single read can miss most of
 * it. We scroll the conversation container top-to-bottom, collecting every
 * message that mounts along the way (deduped by id; first-seen order = message
 * order), then restore the scroll position. Falls back to a single read when
 * there's no scroll container.
 */
async function readAllMessages(): Promise<{ raw: RawMessage[]; container: boolean; nodeMax: number }> {
  const seen = new Map<string, RawMessage>();
  let nodeMax = 0;
  const collect = () => {
    nodeMax = Math.max(nodeMax, document.querySelectorAll('[data-message-author-role]').length);
    for (const m of chatgptAdapter.extractFromDom()) {
      if (!m.id || !m.text) continue;
      const prev = seen.get(m.id);
      if (!prev) seen.set(m.id, m);
      else if (m.text.length > prev.text.length) prev.text = m.text;
    }
  };

  const container = findScrollContainer();
  if (!container) {
    collect();
    return { raw: [...seen.values()], container: false, nodeMax };
  }

  const restore = container.scrollTop;
  try {
    container.scrollTop = 0;
    await delay(180);
    collect();
    let guard = 0;
    while (container.scrollTop + container.clientHeight < container.scrollHeight - 4 && guard < 80) {
      guard += 1;
      container.scrollTop += Math.max(200, container.clientHeight * 0.8);
      await delay(140);
      collect();
    }
    collect();
  } catch {
    // keep whatever we collected
  } finally {
    try {
      container.scrollTop = restore;
    } catch {
      /* ignore */
    }
  }
  return { raw: [...seen.values()], container: true, nodeMax };
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

  // Scroll the whole thread and collect every message (beats ChatGPT's
  // virtualization, which only keeps ~a screenful in the DOM). Then enrich the
  // currently-mounted ones with richer main-world text (better code blocks).
  const { raw: domRaw, container, nodeMax } = await readAllMessages();

  if (domRaw.length > 0) {
    const mw = await requestMainWorld(400);
    const mwText = new Map<string, string>();
    if (mw?.ok && mw.messages) {
      for (const m of mw.messages) {
        if (m.id && m.text) mwText.set(m.id, m.text);
      }
    }
    raw = domRaw.map((d) =>
      d.id && mwText.has(d.id)
        ? { ...d, text: mwText.get(d.id)!, source: 'page-data' as const }
        : d,
    );
    source = mwText.size > 0 ? 'page-data' : 'dom';
  } else {
    // No DOM messages at all — the markup may have changed; try main-world alone.
    const mw = await requestMainWorld(400);
    if (mw?.ok && mw.messages && mw.messages.length > 0) {
      raw = mw.messages.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        source: 'page-data' as const,
      }));
      source = 'page-data';
    } else {
      raw = [];
      source = 'dom';
    }
  }

  // Diagnostic (visible in the ChatGPT page console): how much did we see?
  console.debug('[Context Distiller] read', {
    collected: domRaw.length,
    scrollContainer: container,
    maxNodesSeen: nodeMax,
  });

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
