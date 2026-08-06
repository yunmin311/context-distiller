import { useEffect, useMemo, useState } from 'react';
import type { ConversationMessage, FragmentGroup } from '../../../lib/core/types';
import type { SelectionInput } from '../useDistiller';

interface MessageListProps {
  messages: ConversationMessage[];
  addedIds: Set<string>;
  groups: FragmentGroup[];
  activeGroupId: string;
  onSetActive: (groupId: string) => void;
  onAddGroup: (title: string, persist: boolean) => string;
  onAdd: (message: ConversationMessage) => void;
  onAddPair: (message: ConversationMessage) => void;
  onAddSelection: (payload: SelectionInput) => void;
  canPair: (message: ConversationMessage) => boolean;
}

const NEW_MODULE = '__new__';

interface Popover extends SelectionInput {
  x: number;
  y: number;
  below: boolean;
}

const CLAMP_CHARS = 220;
const TOP_SAFE = 96; // topbar + conv bar — flip the chip below the selection above this

function roleLabel(role: ConversationMessage['role']): string {
  if (role === 'user') return '你';
  if (role === 'assistant') return 'AI';
  return '系统';
}

export function MessageList({
  messages,
  addedIds,
  groups,
  activeGroupId,
  onSetActive,
  onAddGroup,
  onAdd,
  onAddPair,
  onAddSelection,
  canPair,
}: MessageListProps) {
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [popover, setPopover] = useState<Popover | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  function createModule(persist: boolean) {
    const name = newName.trim();
    if (!name) return;
    onSetActive(onAddGroup(name, persist));
    setNewName('');
    setCreating(false);
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => m.text.toLowerCase().includes(q));
  }, [messages, filter]);

  // Dismiss the highlight chip whenever the panel scrolls or resizes — its
  // position is fixed to the viewport and would otherwise drift.
  useEffect(() => {
    if (!popover) return;
    const dismiss = () => setPopover(null);
    document.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [popover]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Highlight-to-add: when the user selects text inside a message body, show a
  // small chip at the selection to add exactly that fragment.
  function handleMouseUp(event: React.MouseEvent) {
    // Ignore the chip's own mouseup so clicking it doesn't re-open/duplicate.
    if ((event.target as HTMLElement).closest('.sel-pop')) return;

    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!selection || !text || selection.rangeCount === 0) {
      setPopover(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const start =
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;
    const msgEl = start?.closest<HTMLElement>('.msg[data-mid]');
    if (!msgEl || !start?.closest('[data-body]')) {
      setPopover(null);
      return;
    }
    // Position near where the selection ends (its last line), and flip below
    // when the selection sits under the sticky header.
    const rects = range.getClientRects();
    const rect = rects[rects.length - 1] ?? range.getBoundingClientRect();
    const below = rect.top < TOP_SAFE;
    // Keep the chip inside the panel so it never squishes against an edge.
    const x = Math.min(Math.max(rect.left + rect.width / 2, 60), window.innerWidth - 60);
    setPopover({
      text,
      role: msgEl.dataset.role === 'user' ? 'user' : 'assistant',
      messageId: msgEl.dataset.mid,
      sourceOrder: Number(msgEl.dataset.order ?? 0),
      x,
      y: below ? rect.bottom + 8 : rect.top - 8,
      below,
    });
  }

  function commitSelection() {
    if (!popover) return;
    onAddSelection({
      text: popover.text,
      role: popover.role,
      messageId: popover.messageId,
      sourceOrder: popover.sourceOrder,
    });
    window.getSelection()?.removeAllRanges();
    setPopover(null);
  }

  return (
    <div className="message-list" onMouseUp={handleMouseUp}>
      <div className="list-toolbar">
        <label className="target-pick" title="新加入的整条 / 片段会放进这个模块">
          <span className="target-cap">加入到</span>
          <select
            className="input target-select"
            aria-label="选择加入目标模块"
            value={activeGroupId}
            onChange={(e) => {
              if (e.target.value === NEW_MODULE) setCreating(true);
              else onSetActive(e.target.value);
            }}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
                {g.fragments.length ? ` (${g.fragments.length})` : ''}
              </option>
            ))}
            <option value={NEW_MODULE}>＋ 新建模块…</option>
          </select>
        </label>
        <input
          className="input filter-input"
          type="search"
          placeholder="筛选…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="muted tiny">
          {filtered.length}/{messages.length}
        </span>
      </div>

      {creating && (
        <div className="new-module">
          <input
            className="input"
            autoFocus
            placeholder="新模块名称"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createModule(false);
              if (e.key === 'Escape') {
                setNewName('');
                setCreating(false);
              }
            }}
          />
          <button
            className="chip-btn tiny"
            disabled={!newName.trim()}
            onClick={() => createModule(false)}
            title="只在这次有，关掉就没了"
          >
            本次
          </button>
          <button
            className="chip-btn tiny"
            disabled={!newName.trim()}
            onClick={() => createModule(true)}
            title="长期保留，下次打开还在"
          >
            长期
          </button>
          <button
            className="icon-btn xs"
            onClick={() => {
              setNewName('');
              setCreating(false);
            }}
            title="取消"
            aria-label="取消新建模块"
          >
            ✕
          </button>
        </div>
      )}

      <p className="hint tiny">
        整条点「＋加入」；只要其中几句 —— 直接在消息里划词，点冒出来的「加入选中」。
      </p>

      {filtered.map((message) => {
        const isLong = message.text.length > CLAMP_CHARS;
        const open = expanded.has(message.id);
        const shown = isLong && !open ? message.text.slice(0, CLAMP_CHARS).trimEnd() + '…' : message.text;
        const added = addedIds.has(message.id);
        return (
          <article
            key={message.id}
            className={`msg msg-${message.role}`}
            data-mid={message.id}
            data-role={message.role}
            data-order={message.order}
          >
            <header className="msg-head">
              <span className={`tag tag-${message.role}`}>{roleLabel(message.role)}</span>
              <span className="muted tiny">#{message.order + 1}</span>
              {isLong && (
                <button className="link-btn tiny" onClick={() => toggle(message.id)}>
                  {open ? '收起' : '展开'}
                </button>
              )}
              <div className="spacer" />
              {canPair(message) && !added && (
                <button
                  className="chip-btn tiny"
                  title="加入这条提问和它的下一条回答"
                  onClick={() => onAddPair(message)}
                >
                  ＋问答
                </button>
              )}
              {added ? (
                <span className="added-flag tiny" title="整条已加入">
                  ✓ 已加入
                </span>
              ) : (
                <button className="chip-btn chip-btn-strong tiny" onClick={() => onAdd(message)}>
                  ＋加入
                </button>
              )}
            </header>
            <div className={`msg-body ${open ? 'msg-body-open' : ''}`} data-body>
              {shown}
            </div>
          </article>
        );
      })}

      {messages.length > 0 && filtered.length === 0 && (
        <p className="muted tiny">没有匹配「{filter}」的消息。</p>
      )}

      {popover && (
        <button
          className={`sel-pop ${popover.below ? 'sel-pop-below' : ''}`}
          style={{ left: popover.x, top: popover.y }}
          onMouseDown={(e) => e.preventDefault()} // keep the selection alive for the click
          onClick={commitSelection}
        >
          ＋ 加入选中
        </button>
      )}
    </div>
  );
}
