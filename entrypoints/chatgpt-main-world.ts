import {
  MW_REQUEST_EVENT,
  MW_RESPONSE_EVENT,
  type MwRequest,
  type MwResponse,
  type MwRawMessage,
} from '../lib/messaging/protocol';
import { walkActiveBranch } from '../lib/platform/conversation-walk';

/**
 * Why a full backend read failed, classified so the panel can say something
 * useful instead of a generic "读取失败" — this product's whole data path hangs
 * off ChatGPT's PRIVATE session/conversation endpoints, so when they change we
 * must be able to TELL (see docs: the contract-drift probe).
 */
export type MwFailKind = 'auth' | 'network' | 'contract' | 'empty';

/** An Error carrying its classification. */
function classified(kind: MwFailKind, message: string): Error & { cdKind?: MwFailKind } {
  const err = new Error(message) as Error & { cdKind?: MwFailKind };
  err.cdKind = kind;
  return err;
}

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

  /**
   * fetch → JSON with a few retries. A long-thread read used to fall back to the
   * partial DOM whenever the session or conversation request had a single
   * transient hiccup (a 429 rate-limit, a 5xx, a momentary network blip). Retrying
   * a couple of times with a short backoff makes the full read far more reliable.
   */
  async function fetchJsonRetry(
    url: string,
    init: RequestInit,
    attempts: number,
    perTryMs: number,
  ): Promise<any> {
    let lastErr = 'network';
    for (let i = 0; i < attempts; i += 1) {
      // Abort a single try that HANGS (a stuck socket), so we retry instead of
      // silently eating the whole read budget — the old failure mode on long reads.
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), perTryMs);
      try {
        const r = await fetch(url, { ...init, signal: ctrl.signal });
        clearTimeout(timer);
        if (r.ok) return await r.json();
        lastErr = `status ${r.status}`;
      } catch {
        clearTimeout(timer);
        lastErr = ctrl.signal.aborted ? `hung > ${perTryMs}ms` : 'network error';
      }
      if (i < attempts - 1) await new Promise((res) => setTimeout(res, 500 * (i + 1)));
    }
    throw new Error(`fetch failed after ${attempts} tries (${lastErr}): ${url}`);
  }

  /**
   * The session endpoint is the slow half of a read (it hits auth, not a cache),
   * and it was re-fetched on every refresh. Hold the token for a few minutes so a
   * re-read is ONE request instead of two. A stale token just means the next
   * conversation fetch 401s, and the retry re-fetches it.
   */
  let tokenCache: { value: string; until: number } | null = null;

  async function getAccessToken(): Promise<string> {
    if (tokenCache && Date.now() < tokenCache.until) return tokenCache.value;
    const session = await fetchJsonRetry('/api/auth/session', { credentials: 'include' }, 2, 7000);
    const token: string | undefined = session?.accessToken;
    if (!token) {
      // Either the user is logged out, or the session payload changed shape —
      // both mean "auth path broken", which is what the panel needs to know.
      throw classified(
        'auth',
        'session returned no accessToken (logged out, or the session contract changed)',
      );
    }
    tokenCache = { value: token, until: Date.now() + 4 * 60 * 1000 };
    return token;
  }

  /**
   * Fetch the COMPLETE conversation from ChatGPT's own backend. This runs in the
   * PAGE world, so the same-origin session auth works exactly like the site's own
   * requests (a content-script fetch in the isolated world can't reliably
   * authenticate — that made long reads fall back to the mounted DOM and return
   * only part of the thread). One request returns every turn, any length.
   *
   * Throws a descriptive error on every failure path (instead of returning null),
   * so the content script can log WHY it fell back to the partial DOM read.
   */
  async function extractViaApi(): Promise<MwRawMessage[]> {
    const convId = location.pathname.match(/\/c\/([\w-]+)/)?.[1];
    if (!convId) throw new Error('no conversation id in URL (not on a /c/ page)');

    let token: string;
    try {
      token = await getAccessToken();
    } catch (err) {
      throw classified('auth', String((err as Error)?.message ?? err));
    }

    // The big one — give each try up to 15s (a huge thread's JSON is large), two tries.
    const load = (t: string) =>
      fetchJsonRetry(
        `/backend-api/conversation/${convId}`,
        { headers: { Authorization: `Bearer ${t}` }, credentials: 'include' },
        2,
        15000,
      );
    let conv: any;
    try {
      conv = await load(token);
    } catch (err) {
      // Most likely a cached token that expired — drop it and try once with a fresh one.
      tokenCache = null;
      try {
        conv = await load(await getAccessToken());
      } catch (retryErr) {
        void err;
        // Preserve a more specific inner classification (e.g. auth) if there is one.
        const kind = (retryErr as Error & { cdKind?: MwFailKind })?.cdKind ?? 'network';
        throw classified(kind, String((retryErr as Error)?.message ?? retryErr));
      }
    }
    const mapping = conv?.mapping;
    if (!mapping || typeof mapping !== 'object') {
      // The conversation JSON no longer looks like a mapping tree — the clearest
      // possible signal that ChatGPT changed its backend contract.
      throw classified('contract', 'conversation had no mapping (contract drift?)');
    }

    // Walk ONLY the active branch (current node → root), so regenerated / edited
    // dead branches are excluded and the order is exactly what's shown on screen.
    // Pure logic, unit-tested in lib/platform/conversation-walk.
    const out = walkActiveBranch(mapping, conv.current_node);
    if (out.length === 0) {
      throw classified('empty', 'no user/assistant turns after filtering');
    }
    return out;
  }

  window.addEventListener(MW_REQUEST_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<MwRequest>).detail;
    if (!detail) return;
    const respond = (r: MwResponse) =>
      window.dispatchEvent(new CustomEvent(MW_RESPONSE_EVENT, { detail: r }));

    if (detail.action === 'extract-api') {
      extractViaApi()
        .then((messages) =>
          respond({
            id: detail.id,
            ok: !!messages && messages.length > 0,
            title: document.title,
            messages: messages ?? [],
          }),
        )
        .catch((err) => {
          const e = err as Error & { cdKind?: MwFailKind };
          respond({ id: detail.id, ok: false, error: String(err), failKind: e?.cdKind });
        });
      return;
    }

    try {
      const messages = extract();
      respond({ id: detail.id, ok: messages.length > 0, title: document.title, messages });
    } catch (err) {
      respond({ id: detail.id, ok: false, error: String(err) });
    }
  });
});
