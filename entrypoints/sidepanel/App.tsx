import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compile } from '../../lib/core/compiler';
import type { ConversationMessage } from '../../lib/core/types';
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
      let res = await actions.loadConversation();
      // The first read right after the panel opens often lands before the page's
      // content script is listening (or before ChatGPT has rendered a conversation),
      // which is why it used to take a second click. Retry a couple of times with a
      // short backoff before reporting anything.
      for (let attempt = 0; !res.ok && attempt < 3; attempt += 1) {
        await new Promise<void>((r) => setTimeout(r, 500 + attempt * 500));
        res = await actions.loadConversation();
      }
      if (res.ok) {
        setToast({
          text: res.partial
            ? `已读取 ${res.count} 条 · 超长对话可向上滚动加载后再刷新`
            : `已读取 ${res.count} 条消息`,
          tone: 'ok',
        });
      } else if (silent) {
        actions.reset();
      }
    },
    [actions],
  );

  // "重试" reloads the page for the user and reads again, so they don't have to
  // refresh by hand.
  const handleRetry = useCallback(async () => {
    const res = await actions.retryWithReload();
    if (res.ok) {
      setToast({
        text: res.partial
          ? `已刷新并读取 ${res.count} 条 · 超长对话可向上滚动加载后再刷新`
          : `已刷新并读取 ${res.count} 条消息`,
        tone: 'ok',
      });
    }
  }, [actions]);

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
      }),
    [state.groups, state.selections, state.customExtras, compiledMarks],
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
      setToast({ text: `已加入到「${latestRef.current.activeGroupTitle}」`, tone: 'ok' });
    },
    [actions],
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
      setToast({ text: `已加入问答到「${activeGroupTitle}」`, tone: 'ok' });
    },
    [actions],
  );

  const handleAddSelection = useCallback(
    (payload: SelectionInput) => {
      actions.addSelection(latestRef.current.activeGroupId, payload);
      setToast({ text: `已加入选中到「${latestRef.current.activeGroupTitle}」`, tone: 'ok' });
    },
    [actions],
  );

  async function handleCopy(text: string) {
    if (!text.trim()) {
      setToast({ text: '还没有可复制的内容。', tone: 'warn' });
      return;
    }
    const ok = await copyText(text);
    setToast(ok ? { text: '已复制到剪贴板。', tone: 'ok' } : { text: '复制失败。', tone: 'error' });
  }

  async function handleFill(text: string) {
    if (!text.trim()) {
      setToast({ text: '没有可填入的内容。', tone: 'warn' });
      return;
    }
    const res = await sendToActiveTab({ kind: 'fill-composer', text });
    if (res.kind === 'fill' && res.ok) {
      setToast({ text: '已填入输入框，检查后自行发送。', tone: 'ok' });
    } else {
      const err = res.kind === 'fill' ? res.error : res.kind === 'error' ? res.error : undefined;
      setToast({ text: err ?? '填入失败，请改用复制。', tone: 'error' });
    }
  }

  // Scroll the ChatGPT page to a fragment's source message and flash it. Pure
  // client-side scroll (no request, no account action) — see docs/PRIVACY.md.
  const handleLocate = useCallback(async (messageId: string) => {
    // Pass the whole conversation's ids in order, so the page can binary-search
    // its scroll position to a message ChatGPT has virtualized out of the DOM.
    const orderedIds = latestRef.current.messages.map((m) => m.id);
    const res = await sendToActiveTab({ kind: 'scroll-to-message', messageId, orderedIds });
    if (res.kind === 'scroll-result' && res.ok) return;
    const err =
      res.kind === 'scroll-result'
        ? res.error ?? '未能跳转。'
        : res.kind === 'error'
          ? res.error
          : '未能跳转，请确认 ChatGPT 对话页在前台。';
    setToast({ text: err, tone: 'warn' });
  }, []);

  function handleClear() {
    const hasMaterial =
      state.groups.some((g) => g.fragments.length > 0) ||
      Object.keys(state.marks).length > 0;
    if (hasMaterial && !window.confirm('清空本次整理？已选材料、标记和备注都会丢失。')) return;
    actions.clearMaterial();
    setPreviewOpen(false);
    setToast({ text: '已清空。', tone: 'ok' });
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand-mark">
          <Logo />
        </span>
        <span className="topbar-title" title={topTitle}>
          {topTitle}
        </span>
        <button
          type="button"
          className={`scratch-toggle${scratchpadOpen ? ' scratch-toggle-on' : ''}`}
          title="便签：随手记的个人批注，只存本地、跨会话保留；永远不会编译进输出，也不发送"
          aria-expanded={scratchpadOpen}
          onClick={() => setScratchpadOpen((v) => !v)}
        >
          便签
          {state.scratchpad.trim() !== '' && <span className="scratch-dot" aria-hidden />}
        </button>
        {state.status === 'ready' && (
          <span className="muted tiny topbar-count">{state.messages.length}</span>
        )}
        <button
          className="icon-btn topbar-refresh"
          title="读取 / 刷新当前对话"
          aria-label="读取或刷新当前对话"
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
            <h1>选材料，编译成一段可交给 AI 的纯文本</h1>
            <p className="muted">
              在 ChatGPT 对话页读取消息，挑出真正有用的整条或片段，分组、点预设按钮，
              生成一段纯文本，复制或填回输入框。不调用模型、不保存、不自动发送。
            </p>
            <button className="btn btn-primary" onClick={() => handleLoad()}>
              读取当前对话
            </button>
            <p className="hint tiny">仅在 chatgpt.com / chat.openai.com 生效。</p>
          </div>
        )}

        {state.status === 'loading' && <p className="muted center">正在读取当前对话…</p>}

        {state.status === 'error' && (
          <div className="notice notice-error">
            <strong>读取失败</strong>
            <p className="muted tiny">{state.error}</p>
            <button className="btn btn-outline btn-sm" onClick={() => handleRetry()}>
              刷新页面重试
            </button>
          </div>
        )}

        {state.status === 'ready' && (
          <>
            <section className="section">
              <div className="eyebrow">对话消息</div>
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
                <div className="eyebrow">整理工作区</div>
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
              <div className="eyebrow">预设 Prompt</div>
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
          <label
            className="remember-toggle"
            title="打开后：本次对话与整理会存到本地，下次打开自动恢复；关闭即清除（默认关闭，不落盘）"
          >
            <input
              type="checkbox"
              checked={state.rememberSession}
              onChange={(e) => actions.setRemember(e.target.checked)}
            />
            记住本次
          </label>
          <span className="muted tiny">
            {result.fragmentCount} 段 · {result.charCount} 字
          </span>
        </div>
        <div className="footer-actions">
          <button
            className="btn btn-primary btn-sm"
            disabled={result.fragmentCount === 0}
            onClick={() => setPreviewOpen(true)}
          >
            预览
          </button>
          <button
            className="btn btn-outline btn-sm"
            disabled={result.fragmentCount === 0}
            onClick={() => handleCopy(result.text)}
          >
            复制
          </button>
          <button
            className="btn btn-outline btn-sm"
            disabled={result.fragmentCount === 0}
            onClick={() => handleFill(result.text)}
          >
            填入
          </button>
          <button className="btn btn-ghost btn-sm danger" onClick={handleClear}>
            清空
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
  );
}
