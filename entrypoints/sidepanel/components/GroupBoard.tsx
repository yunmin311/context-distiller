import { useState } from 'react';
import type { FragmentGroup } from '../../../lib/core/types';

interface GroupBoardProps {
  groups: FragmentGroup[];
  activeGroupId: string;
  onSetActive: (groupId: string) => void;
  onMove: (groupId: string, fragmentId: string, dir: -1 | 1) => void;
  onMoveToGroup: (fromGroupId: string, toGroupId: string, fragmentId: string) => void;
  onRemove: (groupId: string, fragmentId: string) => void;
  onSetNote: (groupId: string, fragmentId: string, note: string) => void;
  onAddGroup: (title: string) => void;
  onRemoveGroup: (groupId: string) => void;
}

function roleLabel(role: 'user' | 'assistant'): string {
  return role === 'user' ? '你' : 'AI';
}

export function GroupBoard({
  groups,
  activeGroupId,
  onSetActive,
  onMove,
  onMoveToGroup,
  onRemove,
  onSetNote,
  onAddGroup,
  onRemoveGroup,
}: GroupBoardProps) {
  const [newTitle, setNewTitle] = useState('');

  return (
    <div className="group-board">
      <div className="group-list">
        {groups.map((group) => {
        const isActive = group.id === activeGroupId;
        const isEmpty = group.fragments.length === 0;
        return (
          <section key={group.id} className={`group ${isActive ? 'group-active' : ''}`}>
            <header className="group-head" onClick={() => onSetActive(group.id)}>
              <span className={`radio-dot ${isActive ? 'on' : ''}`} aria-hidden />
              <span className="group-title">{group.title}</span>
              {!isEmpty && <span className="count-pill">{group.fragments.length}</span>}
              <div className="spacer" />
              {isEmpty && groups.length > 1 && (
                <button
                  className="icon-btn xs danger-hover"
                  title="删除这个空模块"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveGroup(group.id);
                  }}
                >
                  ✕
                </button>
              )}
            </header>

            {!isEmpty && (
              <ul className="frag-list">
                {group.fragments.map((fragment, index) => (
                  <li key={fragment.id} className="frag">
                    <div className="frag-head">
                      <span className={`tag tag-${fragment.role} xs`}>
                        {roleLabel(fragment.role)}
                      </span>
                      <div className="spacer" />
                      <button
                        className="icon-btn xs"
                        disabled={index === 0}
                        onClick={() => onMove(group.id, fragment.id, -1)}
                        title="上移"
                      >
                        ↑
                      </button>
                      <button
                        className="icon-btn xs"
                        disabled={index === group.fragments.length - 1}
                        onClick={() => onMove(group.id, fragment.id, 1)}
                        title="下移"
                      >
                        ↓
                      </button>
                      <button
                        className="icon-btn xs danger-hover"
                        onClick={() => onRemove(group.id, fragment.id)}
                        title="删除"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="frag-text">{fragment.text}</div>
                    <div className="frag-foot">
                      <input
                        className="input note-input"
                        placeholder="备注（可选）"
                        value={fragment.note ?? ''}
                        onChange={(e) => onSetNote(group.id, fragment.id, e.target.value)}
                      />
                      {groups.length > 1 && (
                        <select
                          className="input move-select"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) onMoveToGroup(group.id, e.target.value, fragment.id);
                          }}
                          title="移动到其他模块"
                        >
                          <option value="">移到…</option>
                          {groups
                            .filter((g) => g.id !== group.id)
                            .map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.title}
                              </option>
                            ))}
                        </select>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          );
        })}
      </div>

      <div className="add-group">
        <input
          className="input"
          placeholder="新模块名称"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newTitle.trim()) {
              onAddGroup(newTitle);
              setNewTitle('');
            }
          }}
        />
        <button
          className="btn btn-outline btn-sm"
          disabled={!newTitle.trim()}
          onClick={() => {
            onAddGroup(newTitle);
            setNewTitle('');
          }}
        >
          添加
        </button>
      </div>
    </div>
  );
}
