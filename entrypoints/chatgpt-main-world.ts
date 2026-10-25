import {
  MW_REQUEST_EVENT,
  MW_RESPONSE_EVENT,
  type MwRequest,
  type MwResponse,
  type MwRawMessage,
} from '../lib/messaging/protocol';
import {
  AUTHOR_ROLE_ATTR,
  CONVERSATION_ID_RE,
  FIBER_KEY_PREFIXES,
  MESSAGE_SELECTOR,
  SESSION_ENDPOINT,
  conversationEndpoint,
} from '../lib/platform/chatgpt-markers';

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
  // ONE BRIDGE PER PAGE, EVER. A page-world script survives extension reloads,
  // so after an update + self-heal reinjection a second copy would register a
  // second request listener — every read then fetched the conversation TWICE,
  // which reads as rate-limiting on big threads. Late arrivals bail out here.
  const w = window as unknown as { __cdMwBridge?: boolean };
  if (w.__cdMwBridge) return;
  w.__cdMwBridge = true;

  function getFiber(node: Element): any {
    const key = Object.keys(node).find((k) =>
      FIBER_KEY_PREFIXES.some((p) => k.startsWith(p)),
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
    const nodes = document.querySelectorAll(MESSAGE_SELECTOR);
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

        const role = message.author?.role ?? node.getAttribute(AUTHOR_ROLE_ATTR) ?? '';
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
    perTrySchedule?: number[],
  ): Promise<any> {
    let lastErr = 'network';
    for (let i = 0; i < attempts; i += 1) {
      // Progressive per-try budget: a huge thread's JSON can take far longer
      // than the first try allows — later tries get more time instead of
      // repeating the same too-short abort (v1.1/v1.2 used a flat 15s×2 and
      // still read huge threads; v1.3's flat 11s×2 made them fail forever).
      const budget = perTrySchedule?.[i] ?? perTryMs;
      // Abort a single try that HANGS (a stuck socket), so we retry instead of
      // silently eating the whole read budget — the old failure mode on long reads.
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), budget);
      try {
        const r = await fetch(url, { ...init, signal: ctrl.signal });
        clearTimeout(timer);
        if (r.ok) return await r.json();
        lastErr = `status ${r.status}`;
      } catch {
        clearTimeout(timer);
        lastErr = ctrl.signal.aborted ? `hung > ${budget}ms` : 'network error';
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
  let cache: { id: string; at: number; messages: MwRawMessage[] } | null = null;
  const CACHE_TTL_MS = 30_000;

  async function getAccessToken(): Promise<string> {
    if (tokenCache && Date.now() < tokenCache.until) return tokenCache.value;
    const session = await fetchJsonRetry(SESSION_ENDPOINT, { credentials: 'include' }, 2, 7000);
    const token: string | undefined = session?.accessToken;
    if (!token) throw new Error('session returned no accessToken (are you logged in?)');
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
  async function extractViaApi(bypassCache = false): Promise<MwRawMessage[]> {
    const convId = location.pathname.match(CONVERSATION_ID_RE)?.[1];
    if (!convId) throw new Error('no conversation id in URL (not on a /c/ page)');

    // Single-entry response cache: the partial→full upgrade, the periodic poll
    // and the end-of-stream catch-up all fetch the SAME conversation within
    // seconds of each other. A fresh cache serves them instantly and costs the
    // endpoint (and the user's rate-limit budget) nothing. Bounded: one
    // conversation's worth of strings, 30 seconds — the panel already holds the
    // same data in memory. User-forced loads bypass AND refresh it.
    if (!bypassCache && cache && cache.id === convId && Date.now() - cache.at < CACHE_TTL_MS) {
      return cache.messages;
    }

    const token = await getAccessToken();

    // The big one — PATIENT, PROGRESSIVE budget (v1.4.9): a huge thread's JSON
    // is large and grows with the conversation; flat 2×11s (v1.3+) aborted
    // mid-download forever, leaving the panel stuck on the mounted partial
    // (8/8 forever). v1.1/v1.2 used 2×15s blocking and read huge threads fine.
    // Now: 3 tries with a growing schedule (15s → 30s → 45s ≈ 90s total). The
    // panel already shows the fast DOM/SSR partial via the 4s race, so patience
    // here costs nothing visually — it only decides whether the FULL thread
    // ever lands.
    const load = (t: string) =>
      fetchJsonRetry(
        conversationEndpoint(convId),
        { headers: { Authorization: `Bearer ${t}` }, credentials: 'include' },
        3,
        15000,
        [15000, 30000, 45000],
      );
    const conv = await load(token);
    const mapping = conv?.mapping;
    if (!mapping || typeof mapping !== 'object') throw new Error('conversation had no mapping');

    // Walk ONLY the active branch (current node → root), so regenerated / edited
    // dead branches are excluded and the order is exactly what's shown on screen.
    const path: any[] = [];
    let id: string | undefined = conv.current_node;
    let guard = 0;
    while (id && mapping[id] && guard < 5000) {
      path.push(mapping[id]);
      id = mapping[id].parent;
      guard += 1;
    }
    path.reverse(); // root → leaf = display order

    const out: MwRawMessage[] = [];
    for (const node of path) {
      const msg = node?.message;
      if (!msg?.author) continue;
      const role = msg.author.role;
      if (role !== 'user' && role !== 'assistant') continue; // drop tool / system
      if (msg.recipient && msg.recipient !== 'all') continue; // drop tool-directed
      if (msg.metadata?.is_visually_hidden_from_conversation) continue; // drop hidden
      if (msg.metadata?.is_thinking_preamble_message) continue; // "我先…" thinking preview, not the answer
      const ctype = msg.content?.content_type;
      if (ctype === 'thoughts' || ctype === 'reasoning_recap') continue; // internal reasoning, not shown
      const text = partsToText(msg.content);
      if (!text) continue;
      // Merge consecutive same-role messages: ChatGPT can split one answer into
      // several adjacent assistant nodes, which would otherwise show as a turn cut
      // into pieces. Keep the first node's id; join the parts with a blank line.
      const last = out[out.length - 1];
      if (last && last.role === role) {
        last.text = `${last.text}\n\n${text}`;
      } else {
        out.push({ id: msg.id, role, text });
      }
    }
    if (out.length === 0) throw new Error('no user/assistant turns after filtering');
    cache = { id: convId, at: Date.now(), messages: out };
    return out;
  }

  window.addEventListener(MW_REQUEST_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<MwRequest>).detail;
    if (!detail) return;
    const respond = (r: MwResponse) =>
      window.dispatchEvent(new CustomEvent(MW_RESPONSE_EVENT, { detail: r }));

    if (detail.action === 'extract-api') {
      extractViaApi(detail.bypassCache === true)
        .then((messages) =>
          respond({
            id: detail.id,
            ok: !!messages && messages.length > 0,
            title: document.title,
            messages: messages ?? [],
          }),
        )
        .catch((err) => respond({ id: detail.id, ok: false, error: String(err) }));
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
