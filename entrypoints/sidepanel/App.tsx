import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compile } from '../../lib/core/compiler';
import type { ConversationMessage } from '../../lib/core/types';
import type { PanelResponse } from '../../lib/messaging/protocol';
import { isUIKey, t as translate, type UIKey } from '../../lib/i18n';
import { LangProvider } from './i18n';
import { useDistiller, type SelectionInput } from './useDistiller';
import { activeTabIsSupported, copyText, sendToActiveTab } from './messaging';
import { MessageList } from './components/MessageList';
import { GroupBoard } from './components/GroupBoard';
import { PresetBar } from './components/PresetBar';
import { PreviewPanel } from './components/PreviewPanel';
import { Scratchpad } from './components/Scratchpad';
import { ImportDialog } from './components/ImportDialog';

interface Toast {
  text: string;
  tone: 'ok' | 'warn' | 'error';
}

/** A custom requirement's chip shows a short one-line label; the full text still
 *  compiles verbatim. Keeps a long paste from stretching the chip off-screen. */
function chipLabel(text: string): string {
  const oneLine = text.trim().replace(/\s+/g, ' ');
  return oneLine.length > 14 ? oneLine.slice(0, 14) + '…' : oneLine;
}

// Logo — "Aperture": two chevrons converging to a point (distillation to essence).
function Logo() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 7l6 5 6-5" />
      <path d="M8.5 12.5l3.5 3 3.5-3" />
      <circle cx="12" cy="18.4" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 11a8 8 0 1 0-.6 3" />
      <path d="M20 4v5h-5" />
    </svg>
  );
}

export function App() {
  const { state, actions } = useDistiller();
  // App owns the language, so it translates directly and hands the value down
  // through LangProvider for every child (including the memoized rows).
  const lang = state.lang;
  const t = useMemo(
    () => (key: UIKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );
  const [activeGroupId, setActiveGroupId] = useState(() => state.groups[0]?.id ?? '');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [scratchpadOpen, setScratchpadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  // Liveness of the link to the ChatGPT tab, surfaced in the UI so "reads work
  // but locate/follow don't" (or the reverse) is diagnosable WITHOUT devtools:
  // 'ok' = the content script answers; 'dead' = no live script in the page;
  // 'nopage' = the active tab isn't a ChatGPT conversation at all.
  const [link, setLink] = useState<'unknown' | 'ok' | 'dead' | 'nopage'>('unknown');
  // The load bar stays on for a grace period AFTER a read settles: reads fire in
  // bursts (hydration growth, poll + upgrade), and a bar that blinks on/off per
  // read reads as the panel twitching. A steady line says "working"; a clean end
  // says "done". Driven by busyReads (ANY read) — not by status, which only
  // foreground reads may move (background polls must not strobe the spinner).
  const [loadBarOn, setLoadBarOn] = useState(false);
  const busy = state.busyReads > 0;
  useEffect(() => {
    if (busy) {
      setLoadBarOn(true);
      return;
    }
    const t = setTimeout(() => setLoadBarOn(false), 700);
    return () => clearTimeout(t);
  }, [busy]);

  useEffect(() => {
    if (!state.groups.some((g) => g.id === activeGroupId)) {
      setActiveGroupId(state.groups[0]?.id ?? '');
    }
  }, [state.groups, activeGroupId]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  // Probe the page link with the cheap ping (self-heal included): re-checked
  // whenever a read settles, so a failed read ALWAYS arrives with a verdict on
  // whether the page side is even alive.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await Promise.race([
        sendToActiveTab({ kind: 'ping' }),
        new Promise<PanelResponse>((r) =>
          setTimeout(() => r({ kind: 'error', error: 'timeout', code: 'err.noResponse' }), 6000),
        ),
      ]);
      if (!alive) return;
      if (res.kind === 'pong') setLink('ok');
      else if (res.kind === 'error' && res.code === 'err.noActiveTab') setLink('nopage');
      else setLink('dead');
    })();
    return () => {
      alive = false;
    };
  }, [state.status]);

  // A partial (DOM) read only sees what ChatGPT has mounted. The content script
  // pushes 'conversation-grew' with a REASON, and each reason gets the cheapest
  // correct response (v1.4 read policy):
  //   - 'grown'     → the user scrolled and more turns mounted. A DOM-only MERGE
  //                   read adds them with ZERO backend pressure — the old full
  //                   backend read here was the main rate-limit budget leak.
  //   - 'full-ready'→ the slow full backend read started earlier finally landed;
  //                   ONE gated full read upgrades the panel to the whole thread
  //                   (instead of the old implicit second full fetch).
  // Background reads settle back to 'ready' on failure instead of erroring, and
  // the viewport ANCHORS to the row the user is reading — growth must never
  // yank them to the bottom.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onMsg = (msg: unknown): undefined => {
      const m = msg as { kind?: string; reason?: string } | undefined;
      if (m?.kind !== 'conversation-grew') return undefined;
      const reason = m.reason === 'full-ready' ? 'full-ready' : 'grown';
      // 'grown' only matters while our list is still a partial read; after a
      // full read there is nothing for a DOM merge to add.
      if (reason === 'grown' && !latestRef.current.partial) return undefined;
      if (timer) clearTimeout(timer);
      // Remember WHERE the user is so the post-read snap can restore it: the
      // topmost visible message row when there is one, otherwise their exact
      // scroll offset (they were in the workspace / presets area).
      try {
        const el = mainRef.current;
        const rows = el?.querySelectorAll('.msg');
        if (el && rows) {
          const top = el.getBoundingClientRect().top;
          let anchored = false;
          for (const r of rows) {
            if (r.getBoundingClientRect().top >= top - 1) {
              const id = r.getAttribute('data-mid');
              if (id) {
                snapIntentRef.current = { anchor: id };
                anchored = true;
              }
              break;
            }
          }
          if (!anchored) {
            snapIntentRef.current = {
              preserve: { top: el.scrollTop, sh: el.scrollHeight },
            };
          }
        }
      } catch {
        // anchoring is best-effort — default snap applies otherwise
      }
      timer = setTimeout(
        () => {
          if (reason === 'grown') {
            void actions.loadConversation(true, { background: true, merge: true, domOnly: true });
          } else {
            void actions.loadConversation(true, { background: true, merge: true });
          }
        },
        400,
      );
      return undefined;
    };
    browser.runtime.onMessage.addListener(onMsg);
    return () => {
      browser.runtime.onMessage.removeListener(onMsg);
      if (timer) clearTimeout(timer);
    };
  }, [actions]);

  // Live follow of a generating answer: while ChatGPT is streaming, quietly
  // re-read every 120s so the list tracks the output; one catch-up read shortly
  // after generation ends captures the completed answer. Driven by
  // 'stream-change' pushes from the page.
  //
  // CADENCE (v1.4): raised from 70s to 120s, AND every poll goes through the
  // read gate (single-flight + 20s minimum gap). The poll shares the user's
  // ChatGPT rate-limit budget with the page itself — a 70s full fetch plus the
  // growth/upgrade paths was exactly the "reads fight the web page" feeling.
  // Unchanged polls are also dropped in the reducer (identical content → no
  // state churn), so a quiet thread costs nothing but the interval tick.
  const streamActiveRef = useRef(false);
  // The end-of-stream catch-up lives in a REF, not in the effect body: the
  // effect re-subscribes on every status flip (each background read toggles
  // loading→ready), and an effect-local timer would be cancelled mid-wait by
  // its own cleanup — losing the final catch-up exactly when it matters.
  const streamFinalRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const REFRESH_MS = 120_000;
    let poll: ReturnType<typeof setInterval> | undefined;
    const stopPoll = () => {
      if (poll) {
        clearInterval(poll);
        poll = undefined;
      }
    };
    const maybeStart = () => {
      if (!poll && streamActiveRef.current && state.status === 'ready') {
        poll = setInterval(
          () => void actions.loadConversation(true, { background: true }),
          REFRESH_MS,
        );
      }
    };
    const onMsg = (msg: unknown): undefined => {
      const m = msg as { kind?: string; active?: boolean } | undefined;
      if (m?.kind !== 'stream-change') return undefined;
      streamActiveRef.current = !!m.active;
      if (m.active) {
        // A new answer started: cancel any pending end-of-stream catch-up.
        if (streamFinalRef.current) {
          clearTimeout(streamFinalRef.current);
          streamFinalRef.current = undefined;
        }
        maybeStart();
      } else {
        stopPoll();
        if (!streamFinalRef.current && state.status === 'ready') {
          // Generation ended — give the page a moment to finalize the message,
          // then read once so the finished text lands in the panel.
          streamFinalRef.current = setTimeout(
            () => void actions.loadConversation(true, { background: true }),
            3500,
          );
        }
      }
      return undefined;
    };
    browser.runtime.onMessage.addListener(onMsg);
    // Ask the page once whether a generation is ALREADY running: its start push
    // fired before this panel existed, so without this query a freshly-opened
    // panel would sit out the rest of an ongoing stream.
    void sendToActiveTab({ kind: 'get-stream' }).then((res) => {
      if (res.kind === 'stream') {
        streamActiveRef.current = res.active;
        maybeStart();
      }
    });
    maybeStart(); // a stream may already be running across a status flip
    return () => {
      stopPoll();
      browser.runtime.onMessage.removeListener(onMsg);
    };
  }, [actions, state.status]);

  // Sync the panel's light/dark theme to ChatGPT's own, so it feels native even
  // when ChatGPT's theme differs from the OS preference. Query once on open, then
  // follow the live changes the content script pushes.
  useEffect(() => {
    let alive = true;
    const apply = (theme: 'light' | 'dark', accent?: string | null) => {
      const root = document.documentElement;
      root.setAttribute('data-theme', theme);
      // Borrow ChatGPT's accent for our own accent tokens when it exposes a real
      // (non-grey) one; otherwise clear them so the panel's neutral accent applies.
      // NOTE: only light/dark is synced. We deliberately do NOT borrow ChatGPT's
      // accent color: its UI is monochrome, so "its accent" resolves to grey and
      // tinted the whole panel a muddy neutral. The panel keeps its own celadon
      // blue-grey accent (see styles.css), which is the product's identity.
      void accent;
    };
    void sendToActiveTab({ kind: 'get-theme' }).then((res) => {
      if (alive && res.kind === 'theme') apply(res.theme, res.accent);
    });
    const onMsg = (msg: unknown): undefined => {
      const m = msg as
        | { kind?: string; theme?: 'light' | 'dark'; accent?: string | null }
        | undefined;
      if (m?.kind === 'theme-change' && m.theme) apply(m.theme, m.accent);
      return undefined;
    };
    browser.runtime.onMessage.addListener(onMsg);
    return () => {
      alive = false;
      browser.runtime.onMessage.removeListener(onMsg);
    };
  }, []);

  // Read the conversation, then flash a brief status toast instead of keeping a
  // permanent banner. On a silent auto-read (panel just opened) a failure quietly
  // returns to the intro rather than throwing up an error screen.
  //
  // STARTUP SPEED: the FIRST read of a fresh panel runs DOM-ONLY — it lands in
  // well under a second with whatever ChatGPT has mounted, and a background
  // backend read then upgrades it to the full thread. Retries (slow page) also
  // go DOM-only: waiting out the 4s backend budget on every attempt was what
  // made the start button feel dead.
  const loadingRef = useRef(false);
  const handleLoad = useCallback(
    async (silent = false, opts?: { domOnlyFirst?: boolean }) => {
      if (loadingRef.current) {
        // A pipeline is already running. Silence reads as "the button is dead" —
        // tell the user their click landed and something IS in flight.
        if (!silent) setToast({ text: t('status.loading'), tone: 'ok' });
        return;
      }
      loadingRef.current = true;
      try {
        const domFirst = !!opts?.domOnlyFirst;
        if (!domFirst) {
          // User-invoked read: skip the gate's gap window (their click IS the
          // authorization) — the gate still prevents overlap.
          forceSnapRef.current = true;
        }
        let res = await actions.loadConversation(
          true,
          domFirst ? { domOnly: true } : { force: true },
        );
        // Slow page: retry QUIETLY with a growing backoff — up to ~30s. Early
        // retries are DOM-only (instant once the page has anything mounted);
        // only the final attempt may surface an error.
        const BACKOFF = [400, 700, 1200, 1800, 2500, 3500, 4000, 5000, 6500, 8000];
        for (let attempt = 0; !res.ok && attempt < BACKOFF.length; attempt += 1) {
          await new Promise<void>((r) => setTimeout(r, BACKOFF[attempt]));
          const last = attempt === BACKOFF.length - 1;
          res = await actions.loadConversation(!last, {
            background: !last,
            domOnly: !last,
            force: last, // the pipeline is user-visible — the gate must not fail it silently
          });
        }
        if (res.ok) {
          if (!silent) {
            setToast({
              text: t(res.partial ? 'toast.readPartial' : 'toast.read', { count: res.count }),
              tone: 'ok',
            });
          }
          // DOM-first start: kick the full backend read right away (silently —
          // it upgrades the list when it lands, or aborts back if throttled).
          if (domFirst && res.partial) {
            void actions.loadConversation(true, { background: true });
          }
        } else if (silent) {
          actions.reset();
        }
      } finally {
        loadingRef.current = false;
      }
    },
    [actions, t],
  );

  // "重试" reads again in place — it NEVER reloads the user's tab anymore
  // (v1.3 did, and could wipe whatever they were mid-doing in it).
  const handleRetry = useCallback(async () => {
    forceSnapRef.current = true; // an explicit retry lands on the latest
    const res = await actions.retryRead();
    if (res.ok) {
      setToast({
        text: t(res.partial ? 'toast.readPartial' : 'toast.read', { count: res.count }),
        tone: 'ok',
      });
    }
  }, [actions, t]);

  // DEEP LOAD — the escape hatch for throttled / giant threads: walk the page
  // from the oldest message to the newest, merging every partial read, until a
  // full read lands or the walk stops finding anything new. Triggered by
  // clicking the refresh button THREE times in a row.
  const deepLoadingRef = useRef(false);
  const conversationUrlRef = useRef<string | undefined>(undefined);
  conversationUrlRef.current = state.conversation?.url;
  const runDeepLoad = useCallback(async () => {
    if (deepLoadingRef.current) return;
    deepLoadingRef.current = true;
    const startUrl = conversationUrlRef.current;
    forceSnapRef.current = true; // the user asked for the whole thread — land on it
    setToast({ text: t('toast.deepStart'), tone: 'ok' });
    try {
      // Jump the page to its oldest message first.
      await sendToActiveTab({ kind: 'deep-walk-step', toTop: true });
      let prevCount = -1;
      let staleSteps = 0;
      for (let step = 0; step < 80; step += 1) {
        if (conversationUrlRef.current !== startUrl) return; // user switched away
        const res = await actions.loadConversation(true, { background: true, merge: true, domOnly: true });
        if (res.ok && !res.partial) break; // the backend gave us EVERYTHING
        const stepRes = await sendToActiveTab({ kind: 'deep-walk-step' });
        const count = latestRef.current.messages.length;
        const ended = stepRes.kind === 'deep-walk' && stepRes.ok && stepRes.reachedEnd;
        if (ended) {
          if (count === prevCount) {
            staleSteps += 1;
            if (staleSteps >= 2) break; // bottom, and nothing new twice — done
          } else {
            staleSteps = 0;
          }
          prevCount = count;
          // One extra merge read at the bottom captures the newest turns.
          await actions.loadConversation(true, { background: true, merge: true, domOnly: true });
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      // Walk done: ONE normal (backend) read to finish — if the endpoint has
      // recovered it replaces the merged list with the authoritative full thread;
      // if it is still throttled the merged walk result stays on screen.
      forceSnapRef.current = true;
      await actions.loadConversation(true, { background: true, merge: true, force: true });
      setToast({
        text: t('toast.deepDone', { count: latestRef.current.messages.length }),
        tone: 'ok',
      });
    } finally {
      deepLoadingRef.current = false;
    }
  }, [actions, t]);

  const refreshClicksRef = useRef<number[]>([]);
  const handleRefreshClick = useCallback(() => {
    const now = Date.now();
    const clicks = refreshClicksRef.current.filter((ts) => now - ts < 900);
    clicks.push(now);
    refreshClicksRef.current = clicks;
    if (clicks.length >= 3) {
      refreshClicksRef.current = [];
      void runDeepLoad();
      return;
    }
    // Manual refresh reads DOM-first too: the mounted list lands in well under a
    // second and a gated background read upgrades it to the full thread. Waiting
    // out the 4s backend race on every click was the "refresh feels slow" hang.
    void handleLoad(false, { domOnlyFirst: true });
  }, [handleLoad, runDeepLoad]);

  // Auto-read on open when the active tab is a ChatGPT page, so the panel lands
  // straight on the messages instead of an extra click. Runs once, AFTER config +
  // any remembered session has hydrated — a restored session (status !== 'idle')
  // suppresses the auto-read so it never overwrites what we just brought back.
  const didAutoRead = useRef(false);
  useEffect(() => {
    if (!state.hydrated || didAutoRead.current) return;
    didAutoRead.current = true;
    if (state.status !== 'idle') return; // a remembered session was restored
    let cancelled = false;
    void activeTabIsSupported().then((ok) => {
      if (ok && !cancelled) void handleLoad(true, { domOnlyFirst: true });
    });
    return () => {
      cancelled = true;
    };
  }, [state.hydrated, state.status, handleLoad]);

  // Detect CONVERSATION SWITCHES in the tab (user picks another chat in
  // ChatGPT's sidebar): the URL changes but nothing re-mounts, so the panel
  // used to keep showing the old thread until a manual refresh — or appear
  // stalled. Watch the active tab's URL and quietly re-read on change.
  useEffect(() => {
    let alive = true;
    const convId = (u: string) => u.match(/\/c\/([\w-]+)/)?.[1] ?? null;
    const onUpdated = (tabId: number, info: { url?: string }) => {
      if (!alive || !info.url) return;
      const newId = convId(info.url);
      if (!newId) return;
      const currentId = conversationUrlRef.current ? convId(conversationUrlRef.current) : null;
      if (newId === currentId) return;
      const reRead = () => {
        forceSnapRef.current = true; // a switched-in conversation lands on its latest
        void handleLoad(true, { domOnlyFirst: true });
      };
      reRead();
      // If a read pipeline was already in flight and swallowed that call, try
      // once more once it had time to finish.
      window.setTimeout(() => {
        if (alive && conversationUrlRef.current && convId(conversationUrlRef.current) !== newId) {
          reRead();
        }
      }, 2500);
    };
    void browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      alive = false;
      void browser.tabs.onUpdated.removeListener(onUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleLoad, state.conversation?.url]);

  // Viewport policy (v1.4) — the panel must never yank itself while the user
  // reads. Growth re-reads declare an anchor / preserve intent (set in
  // snapIntentRef above): the viewport is ANCHORED to the row they were
  // reading, or their exact scroll offset is preserved. The bottom snap fires
  // only when the user ASKED for the read (manual refresh / retry / deep-load
  // finish / conversation switch set forceSnapRef) or when they were already
  // reading at the bottom; background polls and upgrades keep the viewport.
  const mainRef = useRef<HTMLElement | null>(null);
  const snapIntentRef = useRef<
    'bottom' | { anchor: string } | { preserve: { top: number; sh: number } }
  >('bottom');
  const atBottomRef = useRef(true);
  const forceSnapRef = useRef(true); // the very first read lands on the latest
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => {
      atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (state.status !== 'ready' || state.messages.length === 0) return;
    const el = mainRef.current;
    if (!el) return;
    const intent = snapIntentRef.current;
    snapIntentRef.current = 'bottom';
    if (typeof intent === 'object' && 'anchor' in intent) {
      const row = el.querySelector(`.msg[data-mid="${CSS.escape(intent.anchor)}"]`);
      if (row) {
        row.scrollIntoView({ block: 'start', behavior: 'auto' });
        return;
      }
    }
    if (typeof intent === 'object' && 'preserve' in intent) {
      // Rows were added ABOVE the viewport — keep the same content under the
      // user's eyes by compensating for the height the prepend added.
      el.scrollTop = intent.preserve.top + (el.scrollHeight - intent.preserve.sh);
      return;
    }
    if (forceSnapRef.current || atBottomRef.current) {
      forceSnapRef.current = false;
      el.scrollTop = el.scrollHeight;
    }
  }, [state.status, state.messages]);

  // Marked messages (读时标记) still present in the read conversation, compiled
  // into their own 【标记】 section (message order applied in the compiler).
  const compiledMarks = useMemo(() => {
    const byId = new Map(state.messages.map((m) => [m.id, m]));
    const out: Array<{ text: string; note?: string; order: number }> = [];
    for (const [id, note] of Object.entries(state.marks)) {
      const m = byId.get(id);
      if (m) out.push({ text: m.text, note: note.trim() || undefined, order: m.order });
    }
    return out;
  }, [state.marks, state.messages]);

  const result = useMemo(
    () =>
      compile(state.groups, state.selections, {
        customExtras: state.customExtras,
        marks: compiledMarks,
        lang,
      }),
    [state.groups, state.selections, state.customExtras, compiledMarks, lang],
  );

  // Grouped-material count (excludes marks) — gates the 整理工作区 board so that
  // marks-only still compiles but doesn't show an empty board.
  const groupFragmentCount = useMemo(
    () => state.groups.reduce((n, g) => n + g.fragments.length, 0),
    [state.groups],
  );

  // Message ids already added as a whole message — used to prevent duplicates.
  const addedIds = useMemo(
    () =>
      new Set(
        state.groups
          .flatMap((g) => g.fragments)
          .filter((f) => f.whole && f.messageId)
          .map((f) => f.messageId as string),
      ),
    [state.groups],
  );

  const activeGroup = state.groups.find((g) => g.id === activeGroupId) ?? state.groups[0];

  const topTitle =
    state.status === 'ready' && state.conversation ? state.conversation.title : 'Context Distiller';

  // User turns whose next turn is an assistant reply — drives the "＋问答" button.
  const pairableIds = useMemo(() => {
    const ids = new Set<string>();
    const msgs = state.messages;
    for (let i = 0; i < msgs.length - 1; i += 1) {
      const cur = msgs[i];
      const next = msgs[i + 1];
      if (cur && next && cur.role === 'user' && next.role === 'assistant') ids.add(cur.id);
    }
    return ids;
  }, [state.messages]);

  // Handlers passed to the memoized message rows must keep a STABLE identity, so a
  // note keystroke (which rebuilds `groups` / `addedIds`) doesn't re-render the
  // whole message list. We read the latest values through a ref instead of closing
  // over them, so the callbacks themselves never need to change.
  const latestRef = useRef({
    activeGroupId,
    activeGroupTitle: activeGroup?.title,
    addedIds,
    messages: state.messages,
    partial: state.partial,
  });
  latestRef.current = {
    activeGroupId,
    activeGroupTitle: activeGroup?.title,
    addedIds,
    messages: state.messages,
    partial: state.partial,
  };

  const handleAddMessage = useCallback(
    (message: ConversationMessage) => {
      actions.addMessageFragment(message, latestRef.current.activeGroupId);
      setToast({
        text: t('toast.added', { group: latestRef.current.activeGroupTitle ?? '' }),
        tone: 'ok',
      });
    },
    [actions, t],
  );

  const addPair = useCallback(
    (message: ConversationMessage) => {
      const { activeGroupId: gid, activeGroupTitle, addedIds: added, messages } = latestRef.current;
      const index = messages.findIndex((m) => m.id === message.id);
      const next = messages[index + 1];
      if (!added.has(message.id)) actions.addMessageFragment(message, gid);
      if (next && next.role === 'assistant' && !added.has(next.id)) {
        actions.addMessageFragment(next, gid);
      }
      setToast({ text: t('toast.addedPair', { group: activeGroupTitle ?? '' }), tone: 'ok' });
    },
    [actions, t],
  );

  const handleAddSelection = useCallback(
    (payload: SelectionInput) => {
      actions.addSelection(latestRef.current.activeGroupId, payload);
      setToast({
        text: t('toast.addedSelection', { group: latestRef.current.activeGroupTitle ?? '' }),
        tone: 'ok',
      });
    },
    [actions, t],
  );

  async function handleCopy(text: string) {
    if (!text.trim()) {
      setToast({ text: t('toast.nothingToCopy'), tone: 'warn' });
      return;
    }
    const ok = await copyText(text);
    setToast(
      ok
        ? { text: t('toast.copied'), tone: 'ok' }
        : { text: t('toast.copyFailed'), tone: 'error' },
    );
  }

  async function handleFill(text: string) {
    if (!text.trim()) {
      setToast({ text: t('toast.nothingToFill'), tone: 'warn' });
      return;
    }
    const res = await sendToActiveTab({ kind: 'fill-composer', text });
    if (res.kind === 'fill' && res.ok) {
      setToast({ text: t('toast.filled'), tone: 'ok' });
    } else {
      const failed = res.kind === 'fill' || res.kind === 'error' ? res : undefined;
      setToast({
        text: failed?.code ? t(failed.code) : failed?.error ?? t('toast.fillFailed'),
        tone: 'error',
      });
    }
  }

  // Scroll the ChatGPT page to a fragment's source message and flash it. Pure
  // client-side scroll (no request, no account action) — see docs/PRIVACY.md.
  const handleLocate = useCallback(
    async (messageId: string) => {
      // Pass the whole conversation's ids in order, so the page can binary-search
      // its scroll position to a message ChatGPT has virtualized out of the DOM.
      const orderedIds = latestRef.current.messages.map((m) => m.id);
      const res = await sendToActiveTab({ kind: 'scroll-to-message', messageId, orderedIds });
      if (res.kind === 'scroll-result' && res.ok) return;
      const failed = res.kind === 'scroll-result' || res.kind === 'error' ? res : undefined;
      const text = failed?.code
        ? t(failed.code)
        : failed?.error ?? t(res.kind === 'scroll-result' ? 'err.scrollGeneric' : 'err.scrollNoPage');
      setToast({ text, tone: 'warn' });
    },
    [t],
  );

  function handleClear() {
    const hasMaterial =
      state.groups.some((g) => g.fragments.length > 0) ||
      Object.keys(state.marks).length > 0;
    if (hasMaterial && !window.confirm(t('confirm.clear'))) return;
    actions.clearMaterial();
    setPreviewOpen(false);
    setToast({ text: t('toast.cleared'), tone: 'ok' });
  }

  return (
    <LangProvider lang={lang}>
    <div className="app">
      {/* ANY read in flight — foreground, background, or the periodic poll — shows
          this thin bar (held ~0.7s after settle so bursts read as one steady run).
          Background reads are silent by design in every other way, but "something
          is happening" must always be visible at a glance. */}
      {loadBarOn && <div className="loadbar" aria-hidden />}
      <header className="topbar">
        <span className="brand-mark">
          <Logo />
        </span>
        <span className="topbar-title" title={topTitle}>
          {topTitle}
        </span>
        {/* Explicit language switch: `auto` only decides the FIRST run, because a
            user on a Chinese browser must still be able to reach English. */}
        <button
          type="button"
          className="lang-toggle"
          title={t('top.langTip')}
          aria-label={t('top.langAria')}
          onClick={() => actions.setLang(lang === 'zh' ? 'en' : 'zh')}
        >
          {lang === 'zh' ? '中' : 'EN'}
        </button>
        <button
          type="button"
          className={`scratch-toggle${scratchpadOpen ? ' scratch-toggle-on' : ''}`}
          title={t('top.scratchpadTip')}
          aria-expanded={scratchpadOpen}
          onClick={() => setScratchpadOpen((v) => !v)}
        >
          {t('top.scratchpad')}
          {state.scratchpad.trim() !== '' && <span className="scratch-dot" aria-hidden />}
        </button>
        <button
          type="button"
          className={`scratch-toggle${importOpen ? ' scratch-toggle-on' : ''}`}
          title={t('top.importTip')}
          aria-expanded={importOpen}
          onClick={() => setImportOpen((v) => !v)}
        >
          {t('top.import')}
        </button>
        {state.messages.length > 0 && (
          <span className="muted tiny topbar-count">{state.messages.length}</span>
        )}
        <button
          className="icon-btn topbar-refresh"
          title={t('top.refresh')}
          aria-label={t('top.refreshAria')}
          onClick={handleRefreshClick}
        >
          {state.status === 'loading' ? (
            <span className="spin">
              <RefreshIcon />
            </span>
          ) : (
            <RefreshIcon />
          )}
        </button>
      </header>

      {scratchpadOpen && (
        <Scratchpad value={state.scratchpad} onCommit={actions.setScratchpad} />
      )}

      <main className="app-main" ref={mainRef}>
        {state.status === 'idle' && (
          <div className="intro">
            <h1>{t('intro.title')}</h1>
            <p className="muted">{t('intro.body')}</p>
            <div className="intro-actions">
              {/* Clicking flips status to 'loading', which unmounts this whole
                  intro and swaps in the「正在读取当前对话…」placeholder — that
                  swap IS the loading state; no in-button spinner needed. */}
              <button className="btn btn-primary" onClick={() => handleLoad(false, { domOnlyFirst: true })}>
                {t('intro.read')}
              </button>
              <button className="btn btn-outline" onClick={() => setImportOpen(true)}>
                {t('import.open')}
              </button>
            </div>
            <p className="hint tiny">{t('intro.scope')}</p>
            {link === 'dead' && <p className="hint tiny">{t('link.dead')}</p>}
            {link === 'nopage' && <p className="hint tiny">{t('link.nopage')}</p>}
          </div>
        )}

        {/* A refresh must NOT tear the list down: unmounting it collapses the
            scroll container and the viewport resets to the oldest message. Keep
            the previous read on screen (spinner shows in the top bar) and only
            show this placeholder before anything has been read. */}
        {state.status === 'loading' && state.messages.length === 0 && (
          <p className="muted center">{t('status.loading')}</p>
        )}

        {state.status === 'error' && (
          <div className="notice notice-error">
            <strong>{t('status.errorTitle')}</strong>
            <p className="muted tiny">
              {state.errorCode && isUIKey(state.errorCode) ? t(state.errorCode) : state.error}
            </p>
            {link !== 'unknown' && link !== 'ok' && (
              <p className="hint tiny">{t(link === 'nopage' ? 'link.nopage' : 'link.dead')}</p>
            )}
            <button className="btn btn-outline btn-sm" onClick={() => handleRetry()}>
              {t('status.retry')}
            </button>
          </div>
        )}

        {state.messages.length > 0 && (
          <>
            <section className="section">
              <div className="eyebrow">{t('section.messages')}</div>
              <MessageList
                messages={state.messages}
                addedIds={addedIds}
                pairableIds={pairableIds}
                marks={state.marks}
                groups={state.groups}
                activeGroupId={activeGroupId}
                onSetActive={setActiveGroupId}
                onAddGroup={actions.addGroup}
                onAdd={handleAddMessage}
                onAddPair={addPair}
                onAddSelection={handleAddSelection}
                onToggleMark={actions.toggleMark}
                onSetMarkNote={actions.setMarkNote}
                onRemoveMark={actions.removeMark}
                onLocate={handleLocate}
              />
            </section>

            {groupFragmentCount > 0 && (
              <section className="section">
                <div className="eyebrow">{t('section.workspace')}</div>
                <GroupBoard
                  groups={state.groups}
                  onMove={actions.moveFragment}
                  onMoveToGroup={actions.moveToGroup}
                  onRemove={actions.removeFragment}
                  onSetNote={actions.setNote}
                  onSetText={actions.setText}
                  onRemoveGroup={actions.removeGroup}
                  onLocate={handleLocate}
                />
              </section>
            )}

            <section className="section">
              <div className="eyebrow">{t('section.presets')}</div>
              <PresetBar
                selections={state.selections}
                customExtras={state.customExtras}
                onSetSingle={actions.setSingle}
                onToggleExtra={actions.toggleExtra}
                onAddCustom={(name, text, persist) =>
                  actions.addCustomExtra(
                    name.trim() || chipLabel(text),
                    text,
                    persist ? 'persist' : 'session',
                  )
                }
                onUpdateCustom={(id, name, text) =>
                  actions.updateCustomExtra(id, name.trim() || chipLabel(text), text)
                }
                onRemoveCustom={actions.removeCustomExtra}
              />
            </section>
          </>
        )}
      </main>

      <footer className="app-footer">
        <div className="footer-meta">
          <label className="remember-toggle" title={t('footer.rememberTip')}>
            <input
              type="checkbox"
              checked={state.rememberSession}
              onChange={(e) => actions.setRemember(e.target.checked)}
            />
            {t('footer.remember')}
          </label>
          <span className="muted tiny">
            {t('footer.counts', { fragments: result.fragmentCount, chars: result.charCount })}
          </span>
        </div>
        <div className="footer-actions">
          <button
            className="btn btn-primary btn-sm"
            disabled={result.fragmentCount === 0}
            onClick={() => setPreviewOpen(true)}
          >
            {t('footer.preview')}
          </button>
          <button
            className="btn btn-outline btn-sm"
            disabled={result.fragmentCount === 0}
            onClick={() => handleCopy(result.text)}
          >
            {t('footer.copy')}
          </button>
          <button
            className="btn btn-outline btn-sm"
            disabled={result.fragmentCount === 0}
            onClick={() => handleFill(result.text)}
          >
            {t('footer.fill')}
          </button>
          <button className="btn btn-ghost btn-sm danger" onClick={handleClear}>
            {t('footer.clear')}
          </button>
        </div>
      </footer>

      <PreviewPanel
        open={previewOpen}
        text={result.text}
        charCount={result.charCount}
        onClose={() => setPreviewOpen(false)}
        onCopy={handleCopy}
        onFill={handleFill}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={(turns) => {
          const count = actions.addPastedMessages(turns);
          if (count > 0) {
            setImportOpen(false);
            setToast({ text: t('toast.imported', { count }), tone: 'ok' });
          }
        }}
      />

      {toast && <div className={`toast toast-${toast.tone}`}>{toast.text}</div>}
    </div>
    </LangProvider>
  );
}

