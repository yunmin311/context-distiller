import { useCallback, useEffect, useMemo, useState } from 'react';
import { compile } from '../../lib/core/compiler';
import type { ConversationMessage } from '../../lib/core/types';
import { useDistiller, type SelectionInput } from './useDistiller';
import { activeTabIsSupported, copyText, sendToActiveTab } from './messaging';
import { MessageList } from './components/MessageList';
import { GroupBoard } from './components/GroupBoard';
import { PresetBar } from './components/PresetBar';
import { PreviewPanel } from './components/PreviewPanel';

interface Toast {
  text: string;
  tone: 'ok' | 'warn' | 'error';
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

  // Read the conversation, then flash a brief status toast instead of keeping a
  // permanent banner. On a silent auto-read (panel just opened) a failure quietly
  // returns to the intro rather than throwing up an error screen.
  const handleLoad = useCallback(
    async (silent = false) => {
      const res = await actions.loadConversation();
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
  // straight on the messages instead of an extra click.
  useEffect(() => {
    let cancelled = false;
    void activeTabIsSupported().then((ok) => {
      if (ok && !cancelled) void handleLoad(true);
    });
    return () => {
      cancelled = true;
    };
  }, [handleLoad]);

  const result = useMemo(
    () => compile(state.groups, state.selections, { customExtras: state.customExtras }),
    [state.groups, state.selections, state.customExtras],
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

  function canPair(message: ConversationMessage): boolean {
    if (message.role !== 'user') return false;
    const index = state.messages.findIndex((m) => m.id === message.id);
    const next = state.messages[index + 1];
    return !!next && next.role === 'assistant';
  }

  function addPair(message: ConversationMessage) {
    const index = state.messages.findIndex((m) => m.id === message.id);
    const next = state.messages[index + 1];
    if (!addedIds.has(message.id)) actions.addMessageFragment(message, activeGroupId);
    if (next && next.role === 'assistant' && !addedIds.has(next.id)) {
      actions.addMessageFragment(next, activeGroupId);
    }
    setToast({ text: `已加入问答到「${activeGroup?.title}」`, tone: 'ok' });
  }

  function handleAddSelection(payload: SelectionInput) {
    actions.addSelection(activeGroupId, payload);
    setToast({ text: `已加入选中到「${activeGroup?.title}」`, tone: 'ok' });
  }

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

  function handleClear() {
    const hasMaterial = state.groups.some((g) => g.fragments.length > 0);
    if (hasMaterial && !window.confirm('清空本次整理？已选材料和备注都会丢失。')) return;
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
        {state.status === 'ready' && (
          <span className="muted tiny topbar-count">{state.messages.length}</span>
        )}
        <button
          className="icon-btn topbar-refresh"
          title="读取 / 刷新当前对话"
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
                groups={state.groups}
                activeGroupId={activeGroupId}
                onSetActive={setActiveGroupId}
                onAddGroup={actions.addGroup}
                onAdd={(m) => {
                  actions.addMessageFragment(m, activeGroupId);
                  setToast({ text: `已加入到「${activeGroup?.title}」`, tone: 'ok' });
                }}
                onAddPair={addPair}
                onAddSelection={handleAddSelection}
                canPair={canPair}
              />
            </section>

            <section className="section">
              <div className="eyebrow">整理工作区</div>
              <GroupBoard
                groups={state.groups}
                onMove={actions.moveFragment}
                onMoveToGroup={actions.moveToGroup}
                onRemove={actions.removeFragment}
                onSetNote={actions.setNote}
                onRemoveGroup={actions.removeGroup}
              />
            </section>

            <section className="section">
              <div className="eyebrow">预设 Prompt</div>
              <PresetBar
                selections={state.selections}
                customExtras={state.customExtras}
                onSetSingle={actions.setSingle}
                onToggleExtra={actions.toggleExtra}
                onAddCustom={(text, persist) =>
                  actions.addCustomExtra(text, text, persist ? 'persist' : 'session')
                }
                onUpdateCustom={(id, text) => actions.updateCustomExtra(id, text, text)}
                onRemoveCustom={actions.removeCustomExtra}
              />
            </section>
          </>
        )}
      </main>

      <footer className="app-footer">
        <span className="muted tiny">
          {result.fragmentCount} 段 · {result.charCount} 字
        </span>
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
