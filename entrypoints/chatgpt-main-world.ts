import {
  MW_REQUEST_EVENT,
  MW_RESPONSE_EVENT,
  type MwRequest,
  type MwResponse,
  type MwRawMessage,
} from '../lib/messaging/protocol';

/**
 * Main World Capture Bridge.
 *
 * Runs in the PAGE's JavaScript world (not the isolated content-script world),
 * which is the only place we can read ChatGPT's own React state. Content scripts
 * share the DOM but NOT page-set expando properties like `__reactFiber$…`, so
 * the fiber walk below must live here.
 *
 * It reads each mounted message's original `content.parts` (better than DOM
 * innerText for code blocks / formatting) and posts them back to the content
 * script via a window CustomEvent. If it finds nothing, the content script
 * falls back to plain DOM extraction.
 */
export default defineUnlistedScript(() => {
  function getFiber(node: Element): any {
    const key = Object.keys(node).find(
      (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
    );
    return key ? (node as any)[key] : null;
  }

  /** Walk up the fiber tree to find the ChatGPT message object for a node. */
  function findMessageObject(startFiber: any): any | null {
    let fiber = startFiber;
    let depth = 0;
    while (fiber && depth < 40) {
      const props = fiber.memoizedProps;
      const message = props?.message;
      if (message && message.author && message.content) return message;
      fiber = fiber.return;
      depth += 1;
    }
    return null;
  }

  function partsToText(content: any): string {
    const parts = content?.parts;
    if (Array.isArray(parts)) {
      // A part is usually a string, but newer ChatGPT builds can wrap it in an
      // object ({ text }, { content }, …). Pull the text out of whichever shape.
      return parts
        .map((p: any) => {
          if (typeof p === 'string') return p;
          if (p && typeof p.text === 'string') return p.text;
          if (p && typeof p.content === 'string') return p.content;
          return '';
        })
        .filter(Boolean)
        .join('\n')
        .trim();
    }
    if (typeof content?.text === 'string') return content.text.trim();
    return '';
  }

  function extract(): MwRawMessage[] {
    const nodes = document.querySelectorAll('[data-message-author-role]');
    const messages: MwRawMessage[] = [];
    const seen = new Set<string>();

    nodes.forEach((node) => {
      try {
        const fiber = getFiber(node);
        if (!fiber) return;
        const message = findMessageObject(fiber);
        if (!message) return;

        const id: string | undefined = message.id;
        if (id && seen.has(id)) return;
        if (id) seen.add(id);

        const role = message.author?.role ?? node.getAttribute('data-message-author-role') ?? '';
        const text = partsToText(message.content);
        if (text) messages.push({ id, role, text });
      } catch {
        // ignore a single unreadable node; DOM fallback covers the rest
      }
    });

    return messages;
  }

  window.addEventListener(MW_REQUEST_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<MwRequest>).detail;
    if (!detail || detail.action !== 'extract') return;

    let response: MwResponse;
    try {
      const messages = extract();
      response = {
        id: detail.id,
        ok: messages.length > 0,
        title: document.title,
        messages,
      };
    } catch (err) {
      response = { id: detail.id, ok: false, error: String(err) };
    }

    window.dispatchEvent(new CustomEvent(MW_RESPONSE_EVENT, { detail: response }));
  });
});
