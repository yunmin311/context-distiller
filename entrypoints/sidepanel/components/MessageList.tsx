import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { ConversationMessage, FragmentGroup } from '../../../lib/core/types';
import type { ActiveMessagePush } from '../../../lib/messaging/protocol';
import type { SelectionInput } from '../useDistiller';
import { plainify } from '../../../lib/utils/plainify';

interface MessageListProps {
  messages: ConversationMessage[];
  addedIds: Set<string>;
  /** Ids of user turns whose next turn is an assistant reply (drives ＋问答). */
  pairableIds: Set<string>;
  /** Reading marks: messageId → note. A reading aid, never compiled. */
  marks: Record<string, string>;
  groups: FragmentGroup[];
  activeGroupId: string;
  onSetActive: (groupId: string) => void;
  onAddGroup: (title: string, persist: boolean) => string;
  onAdd: (message: ConversationMessage) => void;
  onAddPair: (message: ConversationMessage) => void;
  onAddSelection: (payload: SelectionInput) => void;
  onToggleMark: (id: string) => void;
  onSetMarkNote: (id: string, note: string) => void;
  onRemoveMark: (id: string) => void;
}

const NEW_MODULE = '__new__';

interface Popover extends SelectionInput {
  /** Vertical position (px, viewport). The bar spans the panel width itself. */
  top: number;
}

const CLAMP_CHARS = 220;
const TOP_SAFE = 96; // topbar + conv bar — place the bar below a selection above this
const BAR_H = 40; // approximate bar height, for vertical clamping

function roleLabel(role: ConversationMessage['role']): string {
  if (role === 'user') return '你';
  if (role === 'assistant') return 'AI';
  return '系统';
}

interface MessageRowProps {
  message: ConversationMessage;
  readable: string;
  open: boolean;
  added: boolean;
  canPair: boolean;
  /** Highlighted because the ChatGPT page is currently scrolled to this message. */
  isActive: boolean;
  /** 读时标记 state for this row (a reading aid, never compiled). */
  marked: boolean;
  markNote: string;
  onToggle: (id: string) => void;
  onAdd: (message: ConversationMessage) => void;
  onAddPair: (message: ConversationMessage) => void;
  onToggleMark: (id: string) => void;
  onSetMarkNote: (id: string, note: string) => void;
  onRemoveMark: (id: string) => void;
}

/**
 * One message row. Memoized: App re-renders on every note keystroke / preset
 * click, but a row only re-renders when its own props change (its text, its
 * added / expanded / pairable state). With stable callbacks from App, editing a
 * note no longer re-renders the whole conversation.
 */
const MessageRow = memo(function MessageRow({
  message,
  readable,
  open,
  added,
  canPair,
  isActive,
  marked,
  markNote,
  onToggle,
  onAdd,
  onAddPair,
  onToggleMark,
  onSetMarkNote,
  onRemoveMark,
}: MessageRowProps) {
  const isLong = readable.length > CLAMP_CHARS;
  const shown = isLong && !open ? readable.slice(0, CLAMP_CHARS).trimEnd() + '…' : readable;

  // Local draft for the mark note so typing doesn't dispatch on every keystroke
  // (commit on blur / Enter). Resync if the note changes from outside (restore).
  const [noteDraft, setNoteDraft] = useState(markNote);
  useEffect(() => setNoteDraft(markNote), [markNote]);
  const commitNote = () => {
    if (noteDraft !== markNote) onSetMarkNote(message.id, noteDraft);
  };

  return (
    <article
      className={`msg msg-${message.role}${isActive ? ' msg-active' : ''}${
        marked ? ' msg-marked' : ''
      }`}
      data-mid={message.id}
      data-role={message.role}
      data-order={message.order}
    >
      <header className="msg-head">
        <span className={`tag tag-${message.role}`}>{roleLabel(message.role)}</span>
        <span className="muted tiny">#{message.order + 1}</span>
        <div className="spacer" />
        <button
          className={`mark-btn${marked ? ' mark-btn-on' : ''}`}
          title={marked ? '取消标记' : '标记这条（只帮读，不进输出）'}
          aria-pressed={marked}
          aria-label={marked ? '取消标记' : '标记这条'}
          onClick={() => onToggleMark(message.id)}
        >
          📌
        </button>
        {canPair && !added && (
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
      <div
        className={`msg-body ${open ? 'msg-body-open' : ''}${
          isLong && !open ? ' msg-body-clamped' : ''
        }`}
        data-body
        onClick={
          isLong && !open
            ? () => {
                // Tap the preview to open it — but don't hijack a text selection
                // (a drag-to-select also ends in a click).
                if (window.getSelection()?.toString().trim()) return;
                onToggle(message.id);
              }
            : undefined
        }
      >
        {shown}
        {isLong && (
          <button
            className="msg-toggle"
            onClick={(e) => {
              e.stopPropagation();
              const collapsing = open;
              const article = (e.currentTarget as HTMLElement).closest('.msg');
              onToggle(message.id);
              // 收起 shrinks the body above this button, which would otherwise
              // strand the reader far below the message. Bring the row back into
              // view so you land on the message you just collapsed, not down-list.
              if (collapsing && article) {
                requestAnimationFrame(() => article.scrollIntoView({ block: 'nearest' }));
              }
            }}
          >
            {open ? '收起' : '展开'}
          </button>
        )}
      </div>
      {marked && (
        <div className="msg-note">
          <span className="msg-note-pin" aria-hidden>
            📌
          </span>
          <input
            className="msg-note-input"
            placeholder="标记备注（可选）"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={commitNote}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setNoteDraft(markNote);
                e.currentTarget.blur();
              }
            }}
          />
          <button
            className="msg-note-x"
            title="取消标记"
            aria-label="取消标记"
            onClick={() => onRemoveMark(message.id)}
          >
            ✕
          </button>
        </div>
      )}
    </article>
  );
});

export function MessageList({
  messages,
  addedIds,
  pairableIds,
  marks,
  groups,
  activeGroupId,
  onSetActive,
  onAddGroup,
  onAdd,
  onAddPair,
  onAddSelection,
  onToggleMark,
  onSetMarkNote,
  onRemoveMark,
}: MessageListProps) {
  const [filter, setFilter] = useState('');
  const [onlyMarked, setOnlyMarked] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [popover, setPopover] = useState<Popover | null>(null);
  const [selNote, setSelNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  // Follow ChatGPT: when the page reports the message it scrolled to (its right-
  // side jump, or any scroll), highlight the matching row and bring it into view —
  // but only if it's one we've actually read into the list.
  useEffect(() => {
    const onMsg = (msg: unknown): undefined => {
      const m = msg as ActiveMessagePush | undefined;
      if (!m || m.kind !== 'active-message') return undefined;
      const el = document.querySelector<HTMLElement>(`.msg[data-mid="${CSS.escape(m.messageId)}"]`);
      if (!el) return undefined;
      setActiveId(m.messageId);
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return undefined;
    };
    browser.runtime.onMessage.addListener(onMsg);
    return () => browser.runtime.onMessage.removeListener(onMsg);
  }, []);

  function createModule(persist: boolean) {
    const name = newName.trim();
    if (!name) return;
    onSetActive(onAddGroup(name, persist));
    setNewName('');
    setCreating(false);
  }

  const markCount = useMemo(() => {
    const ids = new Set(messages.map((m) => m.id));
    return Object.keys(marks).filter((id) => ids.has(id)).length;
  }, [messages, marks]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = q ? messages.filter((m) => m.text.toLowerCase().includes(q)) : messages;
    if (onlyMarked) list = list.filter((m) => m.id in marks);
    return list;
  }, [messages, filter, onlyMarked, marks]);

  // If the last mark is removed while 只看已标记 is on, fall back to showing
  // everything so the list can't get stuck empty with no chip left to toggle off.
  useEffect(() => {
    if (onlyMarked && markCount === 0) setOnlyMarked(false);
  }, [onlyMarked, markCount]);

  // De-Markdown each message once per load, not on every keystroke/re-render.
  const readables = useMemo(
    () => new Map(messages.map((m) => [m.id, plainify(m.text)] as const)),
    [messages],
  );

  // The bar spans the panel width at a fixed position, so scrolling no longer
  // needs to dismiss it (you can scroll to check context while writing the note).
  // A resize can shift the layout, so dismiss on that.
  useEffect(() => {
    if (!popover) return;
    const dismiss = () => setPopover(null);
    window.addEventListener('resize', dismiss);
    return () => window.removeEventListener('resize', dismiss);
  }, [popover]);

  // Stable so the memoized rows don't re-render when it's recreated.
  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Highlight-to-add: when the user selects text inside a message body, show a
  // small chip at the selection to add exactly that fragment (with an optional note).
  function handleMouseUp(event: React.MouseEvent) {
    // Ignore interaction inside the chip so clicking / typing doesn't re-open it.
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
    // Full-width bar: only its vertical position tracks the selection. Place it
    // below the selection when that sits under the sticky header, else above;
    // clamp so the whole bar stays on screen.
    const rects = range.getClientRects();
    const rect = rects[rects.length - 1] ?? range.getBoundingClientRect();
    const nearTop = rect.top < TOP_SAFE + BAR_H;
    let top = nearTop ? rect.bottom + 8 : rect.top - 8 - BAR_H;
    top = Math.min(Math.max(top, 8), window.innerHeight - BAR_H - 8);
    setSelNote('');
    setPopover({
      text,
      role: msgEl.dataset.role === 'user' ? 'user' : 'assistant',
      messageId: msgEl.dataset.mid,
      sourceOrder: Number(msgEl.dataset.order ?? 0),
      top,
    });
  }

  function commitSelection() {
    if (!popover) return;
    onAddSelection({
      text: popover.text,
      role: popover.role,
      messageId: popover.messageId,
      sourceOrder: popover.sourceOrder,
      note: selNote.trim() || undefined,
    });
    window.getSelection()?.removeAllRanges();
    setSelNote('');
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
        {markCount > 0 && (
          <button
            className={`mark-filter${onlyMarked ? ' mark-filter-on' : ''}`}
            onClick={() => setOnlyMarked((v) => !v)}
            title={onlyMarked ? '显示全部消息' : '只看已标记的消息'}
            aria-pressed={onlyMarked}
          >
            📌 {markCount}
          </button>
        )}
      </div>

      {creating && (
        <div className="new-module">
          <input
            className="input"
            autoFocus
            maxLength={40}
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
        整条点「＋加入」；只要其中几句 —— 直接在消息里划词，冒出来的小条里可顺手加条注释再加入。
      </p>

      {filtered.map((message) => (
        <MessageRow
          key={message.id}
          message={message}
          readable={readables.get(message.id) ?? message.text}
          open={expanded.has(message.id)}
          added={addedIds.has(message.id)}
          canPair={pairableIds.has(message.id)}
          isActive={message.id === activeId}
          marked={message.id in marks}
          markNote={marks[message.id] ?? ''}
          onToggle={toggle}
          onAdd={onAdd}
          onAddPair={onAddPair}
          onToggleMark={onToggleMark}
          onSetMarkNote={onSetMarkNote}
          onRemoveMark={onRemoveMark}
        />
      ))}

      {messages.length > 0 && filtered.length === 0 && (
        <p className="muted tiny">
          {onlyMarked ? '没有匹配的已标记消息。' : `没有匹配「${filter}」的消息。`}
        </p>
      )}

      {popover && (
        <div
          className="sel-pop"
          style={{ top: popover.top }}
          role="dialog"
          aria-label="给选中文本加注释并加入"
        >
          <span className="sel-pop-preview" title={popover.text}>
            「{popover.text.length > 14 ? popover.text.slice(0, 14).trim() + '…' : popover.text}」
          </span>
          <input
            className="sel-pop-note"
            autoFocus
            placeholder="加条注释（可选）"
            value={selNote}
            onChange={(e) => setSelNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitSelection();
              if (e.key === 'Escape') setPopover(null);
            }}
          />
          <button className="sel-pop-add" onClick={commitSelection}>
            ＋ 加入
          </button>
        </div>
      )}
    </div>
  );
}
