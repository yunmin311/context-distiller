import { memo, useMemo, useRef, useState } from 'react';
import type { Fragment, FragmentGroup } from '../../../lib/core/types';
import { plainify } from '../../../lib/utils/plainify';
import { useT, type TFn } from '../i18n';

interface GroupBoardProps {
  groups: FragmentGroup[];
  onMove: (groupId: string, fragmentId: string, dir: -1 | 1) => void;
  onMoveToGroup: (fromGroupId: string, toGroupId: string, fragmentId: string) => void;
  onRemove: (groupId: string, fragmentId: string) => void;
  onSetNote: (groupId: string, fragmentId: string, note: string) => void;
  onSetText: (groupId: string, fragmentId: string, text: string) => void;
  onRemoveGroup: (groupId: string) => void;
  /** Scroll the ChatGPT page to a fragment's source message (local scroll only). */
  onLocate: (messageId: string) => void;
}

function roleLabel(role: 'user' | 'assistant', t: TFn): string {
  return role === 'user' ? t('role.user') : t('role.assistant');
}

/** Crosshair — "locate this in the conversation". */
function LocateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

interface MoveTarget {
  id: string;
  title: string;
}

interface FragmentRowProps {
  fragment: Fragment;
  groupId: string;
  isFirst: boolean;
  isLast: boolean;
  moveTargets: MoveTarget[];
  onMove: (groupId: string, fragmentId: string, dir: -1 | 1) => void;
  onRemove: (groupId: string, fragmentId: string) => void;
  onSetNote: (groupId: string, fragmentId: string, note: string) => void;
  onSetText: (groupId: string, fragmentId: string, text: string) => void;
  onMoveToGroup: (fromGroupId: string, toGroupId: string, fragmentId: string) => void;
  onLocate: (messageId: string) => void;
}

/**
 * One grouped fragment. Memoized so typing in one fragment's note only re-renders
 * that fragment (the reducer keeps every other fragment's object identity), not
 * the whole board. Its callbacks come straight from the reducer's stable actions.
 */
const FragmentRow = memo(function FragmentRow({
  fragment,
  groupId,
  isFirst,
  isLast,
  moveTargets,
  onMove,
  onRemove,
  onSetNote,
  onSetText,
  onMoveToGroup,
  onLocate,
}: FragmentRowProps) {
  const t = useT();
  const others = moveTargets.filter((target) => target.id !== groupId);
  const display = plainify(fragment.text);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const cancelRef = useRef(false);

  function startEdit() {
    setDraft(display);
    cancelRef.current = false;
    setEditing(true);
  }
  function commitEdit() {
    if (cancelRef.current) {
      cancelRef.current = false;
      setEditing(false);
      return;
    }
    const next = draft.trim();
    if (next && next !== display) onSetText(groupId, fragment.id, next);
    setEditing(false);
  }

  return (
    <li className="frag">
      <div className="frag-head">
        <span className={`tag tag-${fragment.role} xs`}>{roleLabel(fragment.role, t)}</span>
        <div className="spacer" />
        {fragment.messageId && (
          <button
            className="icon-btn xs"
            onClick={() => onLocate(fragment.messageId!)}
            title={t('frag.locate')}
            aria-label={t('msg.locateAria')}
          >
            <LocateIcon />
          </button>
        )}
        <button
          className="icon-btn xs"
          disabled={isFirst}
          onClick={() => onMove(groupId, fragment.id, -1)}
          title={t('frag.up')}
          aria-label={t('frag.upAria')}
        >
          ↑
        </button>
        <button
          className="icon-btn xs"
          disabled={isLast}
          onClick={() => onMove(groupId, fragment.id, 1)}
          title={t('frag.down')}
          aria-label={t('frag.downAria')}
        >
          ↓
        </button>
        <button
          className="icon-btn xs danger-hover"
          onClick={() => onRemove(groupId, fragment.id)}
          title={t('frag.remove')}
          aria-label={t('frag.removeAria')}
        >
          ✕
        </button>
      </div>

      {editing ? (
        <textarea
          className="input frag-text-edit"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              cancelRef.current = true;
              setEditing(false);
            }
          }}
        />
      ) : (
        <div
          className="frag-text frag-text-editable"
          title={t('frag.editTip')}
          onClick={startEdit}
        >
          {display}
        </div>
      )}

      <div className="frag-foot">
        <input
          className="input note-input"
          placeholder={t('frag.note')}
          value={fragment.note ?? ''}
          onChange={(e) => onSetNote(groupId, fragment.id, e.target.value)}
        />
        {others.length > 0 && (
          <select
            className="input move-select"
            value=""
            onChange={(e) => {
              if (e.target.value) onMoveToGroup(groupId, e.target.value, fragment.id);
            }}
            title={t('frag.moveToTip')}
          >
            <option value="">{t('frag.moveTo')}</option>
            {others.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        )}
      </div>
    </li>
  );
});

/**
 * Display + edit board for the grouped material. Choosing the active target and
 * creating modules now live in the sticky selector up top, so this board no
 * longer carries a redundant selector — it just shows and edits fragments.
 */
export function GroupBoard({
  groups,
  onMove,
  onMoveToGroup,
  onRemove,
  onSetNote,
  onSetText,
  onRemoveGroup,
  onLocate,
}: GroupBoardProps) {
  const t = useT();
  // Stable move-target list (id + title), rebuilt only when group ids/titles
  // change — not on every fragment / note edit — so the memoized rows stay put.
  const groupsKey = groups.map((g) => `${g.id}:${g.title}`).join('|');
  const moveTargets = useMemo<MoveTarget[]>(
    () => groups.map((g) => ({ id: g.id, title: g.title })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupsKey],
  );

  return (
    <div className="group-board">
      <div className="group-list">
        {groups.map((group) => {
          const isEmpty = group.fragments.length === 0;
          return (
            <section key={group.id} className="group">
              <header className="group-head">
                <span className="group-title">{group.title}</span>
                {!isEmpty && <span className="count-pill">{group.fragments.length}</span>}
                <div className="spacer" />
                {isEmpty && groups.length > 1 && (
                  <button
                    className="icon-btn xs danger-hover"
                    title={t(group.persist ? 'group.removePersist' : 'group.removeEmpty')}
                    aria-label={t('group.removeAria', { title: group.title })}
                    onClick={() => onRemoveGroup(group.id)}
                  >
                    ✕
                  </button>
                )}
              </header>

              {!isEmpty && (
                <ul className="frag-list">
                  {group.fragments.map((fragment, index) => (
                    <FragmentRow
                      key={fragment.id}
                      fragment={fragment}
                      groupId={group.id}
                      isFirst={index === 0}
                      isLast={index === group.fragments.length - 1}
                      moveTargets={moveTargets}
                      onMove={onMove}
                      onRemove={onRemove}
                      onSetNote={onSetNote}
                      onSetText={onSetText}
                      onMoveToGroup={onMoveToGroup}
                      onLocate={onLocate}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
