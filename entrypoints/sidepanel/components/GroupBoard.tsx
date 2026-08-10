import { memo, useMemo } from 'react';
import type { Fragment, FragmentGroup } from '../../../lib/core/types';
import { plainify } from '../../../lib/utils/plainify';

interface GroupBoardProps {
  groups: FragmentGroup[];
  onMove: (groupId: string, fragmentId: string, dir: -1 | 1) => void;
  onMoveToGroup: (fromGroupId: string, toGroupId: string, fragmentId: string) => void;
  onRemove: (groupId: string, fragmentId: string) => void;
  onSetNote: (groupId: string, fragmentId: string, note: string) => void;
  onRemoveGroup: (groupId: string) => void;
}

function roleLabel(role: 'user' | 'assistant'): string {
  return role === 'user' ? '你' : 'AI';
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
  onMoveToGroup: (fromGroupId: string, toGroupId: string, fragmentId: string) => void;
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
  onMoveToGroup,
}: FragmentRowProps) {
  const others = moveTargets.filter((t) => t.id !== groupId);
  return (
    <li className="frag">
      <div className="frag-head">
        <span className={`tag tag-${fragment.role} xs`}>{roleLabel(fragment.role)}</span>
        <div className="spacer" />
        <button
          className="icon-btn xs"
          disabled={isFirst}
          onClick={() => onMove(groupId, fragment.id, -1)}
          title="上移"
          aria-label="上移片段"
        >
          ↑
        </button>
        <button
          className="icon-btn xs"
          disabled={isLast}
          onClick={() => onMove(groupId, fragment.id, 1)}
          title="下移"
          aria-label="下移片段"
        >
          ↓
        </button>
        <button
          className="icon-btn xs danger-hover"
          onClick={() => onRemove(groupId, fragment.id)}
          title="删除"
          aria-label="删除片段"
        >
          ✕
        </button>
      </div>
      <div className="frag-text">{plainify(fragment.text)}</div>
      <div className="frag-foot">
        <input
          className="input note-input"
          placeholder="备注（可选）"
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
            title="移动到其他模块"
          >
            <option value="">移到…</option>
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
  onRemoveGroup,
}: GroupBoardProps) {
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
                    title={
                      group.persist
                        ? '删除这个模块（长期模块，一并从记忆里移除）'
                        : '删除这个空模块'
                    }
                    aria-label={`删除模块：${group.title}`}
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
                      onMoveToGroup={onMoveToGroup}
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
