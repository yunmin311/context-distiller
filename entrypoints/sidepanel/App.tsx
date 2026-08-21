import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compile } from '../../lib/core/compiler';
import type { ConversationMessage } from '../../lib/core/types';
import { isUIKey, t as translate, type UIKey } from '../../lib/i18n';
import { LangProvider } from './i18n';
import { useDistiller, type SelectionInput } from './useDistiller';
import { activeTabIsSupported, copyText, sendToActiveTab } from './messaging';
import { MessageList } from './components/MessageList';
import { GroupBoard } from './components/GroupBoard';
import { PresetBar } from './components/PresetBar';
import { PreviewPanel } from './components/PreviewPanel';
import { Scratchpad } from './components/Scratchpad';

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
  const [toast, setToast] = useState<Toast | null>(null);

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

  // A partial (DOM) read only sees what ChatGPT has mounted. When the user scrolls
  // up and the page loads older turns, the content script says so and we quietly
  // re-read, so the list grows on its own instead of needing a manual refresh.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onMsg = (msg: unknown): undefined => {
      const m = msg as { kind?: string } | undefined;
      if (m?.kind !== 'conversation-grew') return undefined;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void actions.loadConversation(true), 400);
      return undefined;
    };
    browser.runtime.onMessage.addListener(onMsg);
    return () => {
      browser.runtime.onMessage.removeListener(onMsg);
      if (timer) clearTimeout(timer);
    };
  }, [actions]);

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
  const handleLoad = useCallback(
    async (silent = false) => {
      // A read can land before the page's content script is listening, or while a
      // heavy conversation is still rendering. Keep RETRYING QUIETLY (the panel
      // stays in its loading state) with a growing backoff — up to ~14s — instead
      // of declaring failure the instant a busy page hasn't answered yet. Only the
      // final attempt is allowed to surface an error.
      const BACKOFF = [400, 700, 1200, 1800, 2500, 3500, 4000];
      let res = await actions.loadConversation(true);
      for (let attempt = 0; !res.ok && attempt < BACKOFF.length; attempt += 1) {
        await new Promise<void>((r) => setTimeout(r, BACKOFF[attempt]));
        const last = attempt === BACKOFF.length - 1;
        res = await actions.loadConversation(!last);
      }
      if (res.ok) {
        setToast({
          text: t(res.partial ? 'toast.readPartial' : 'toast.read', { count: res.count }),
          tone: 'ok',
        });
      } else if (silent) {
        actions.reset();
      }
    },
    [actions, t],
  );

  // "重试" reloads the page for the user and reads again, so they don't have to
  // refresh by hand.
  const handleRetry = useCallback(async () => {
    const res = await actions.retryWithReload();
    if (res.ok) {
      setToast({
        text: t(res.partial ? 'toast.reloadedPartial' : 'toast.reloaded', { count: res.count }),
        tone: 'ok',
      });
    }
  }, [actions, t]);

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
      if (ok && !cancelled) void handleLoad(true);
    });
    return () => {
      cancelled = true;
    };
  }, [state.hydrated, state.status, handleLoad]);

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
  });
  latestRef.current = {
    activeGroupId,
    activeGroupTitle: activeGroup?.title,
    addedIds,
    messages: state.messages,
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
        {state.status === 'ready' && (
          <span className="muted tiny topbar-count">{state.messages.length}</span>
        )}
        <button
          className="icon-btn topbar-refresh"
          title={t('top.refresh')}
          aria-label={t('top.refreshAria')}
          onClick={() => handleLoad()}
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

      <main className="app-main">
        {state.status === 'idle' && (
          <div className="intro">
            <h1>{t('intro.title')}</h1>
            <p className="muted">{t('intro.body')}</p>
            <button className="btn btn-primary" onClick={() => handleLoad()}>
              {t('intro.read')}
            </button>
            <p className="hint tiny">{t('intro.scope')}</p>
          </div>
        )}

        {state.status === 'loading' && <p className="muted center">{t('status.loading')}</p>}

        {state.status === 'error' && (
          <div className="notice notice-error">
            <strong>{t('status.errorTitle')}</strong>
            <p className="muted tiny">
              {state.errorCode && isUIKey(state.errorCode) ? t(state.errorCode) : state.error}
            </p>
            <button className="btn btn-outline btn-sm" onClick={() => handleRetry()}>
              {t('status.retry')}
            </button>
          </div>
        )}

        {state.status === 'ready' && (
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

      {toast && <div className={`toast toast-${toast.tone}`}>{toast.text}</div>}
    </div>
    </LangProvider>
  );
}
