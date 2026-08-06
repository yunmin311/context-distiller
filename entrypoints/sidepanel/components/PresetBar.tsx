import { useState } from 'react';
import { PRESET_GROUPS } from '../../../lib/core/presets';
import type { PresetOption, PromptSelections } from '../../../lib/core/types';
import type { SingleKey } from '../useDistiller';

interface PresetBarProps {
  selections: PromptSelections;
  customExtras: PresetOption[];
  onSetSingle: (key: SingleKey, presetId: string) => void;
  onToggleExtra: (presetId: string) => void;
  onAddCustom: (text: string, persist: boolean) => void;
  onUpdateCustom: (id: string, text: string) => void;
  onRemoveCustom: (id: string) => void;
}

const SINGLE_KEYS: Record<string, SingleKey> = {
  intent: 'intent',
  density: 'density',
  writingStyle: 'writingStyle',
  responseStructure: 'responseStructure',
};

export function PresetBar({
  selections,
  customExtras,
  onSetSingle,
  onToggleExtra,
  onAddCustom,
  onUpdateCustom,
  onRemoveCustom,
}: PresetBarProps) {
  // editing: null = closed, 'new' = adding, otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  function openNew() {
    setEditing('new');
    setDraft('');
  }
  function openEdit(option: PresetOption) {
    setEditing(option.id);
    setDraft(option.text);
  }
  function close() {
    setEditing(null);
    setDraft('');
  }
  function commitNew(persist: boolean) {
    const text = draft.trim();
    if (!text) return;
    onAddCustom(text, persist);
    close();
  }
  function commitEdit(id: string) {
    const text = draft.trim();
    if (!text) return;
    onUpdateCustom(id, text);
    close();
  }

  return (
    <div className="preset-bar">
      {PRESET_GROUPS.map((group) => {
        const singleKey = SINGLE_KEYS[group.id];
        const isExtras = group.id === 'extras';
        return (
          <div key={group.id} className="preset-group">
            <div className="preset-label">
              {group.label}
              {group.mode === 'multi' && <span className="preset-multi">可多选</span>}
            </div>
            <div className="preset-options">
              {group.options.map((option) => {
                const active =
                  group.mode === 'single'
                    ? selections[singleKey!] === option.id
                    : selections.extras.includes(option.id);
                return (
                  <button
                    key={option.id}
                    className={`chip ${active ? 'chip-active' : ''}`}
                    title={option.hint ?? option.text}
                    onClick={() =>
                      group.mode === 'single'
                        ? onSetSingle(singleKey!, option.id)
                        : onToggleExtra(option.id)
                    }
                  >
                    {option.name}
                  </button>
                );
              })}

              {isExtras &&
                customExtras.map((option) => {
                  const active = selections.extras.includes(option.id);
                  return (
                    <span key={option.id} className="chip-custom-wrap">
                      <button
                        className={`chip chip-custom ${active ? 'chip-active' : ''}`}
                        title={`${option.text}\n（自定义${
                          option.scope === 'persist' ? '·长期' : '·本次'
                        }｜点选用，双击改）`}
                        onClick={() => onToggleExtra(option.id)}
                        onDoubleClick={() => openEdit(option)}
                      >
                        {option.name}
                      </button>
                      <button
                        className="chip-x"
                        title="删除这条自定义要求"
                        onClick={() => {
                          if (editing === option.id) close();
                          onRemoveCustom(option.id);
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  );
                })}

              {isExtras && editing === null && (
                <button className="chip chip-add" title="添加一条你自己的要求" onClick={openNew}>
                  ＋ 自定义
                </button>
              )}
            </div>

            {isExtras && editing !== null && (
              <div className="custom-editor">
                <textarea
                  className="input custom-input"
                  autoFocus
                  rows={2}
                  placeholder="写一条要求，会原样拼进消息里，例如：请标注每条结论对应材料里的哪一段"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div className="custom-editor-actions">
                  {editing === 'new' ? (
                    <>
                      <button
                        className="chip-btn tiny"
                        disabled={!draft.trim()}
                        onClick={() => commitNew(false)}
                        title="只在这次有，关掉就没了"
                      >
                        本次
                      </button>
                      <button
                        className="chip-btn tiny"
                        disabled={!draft.trim()}
                        onClick={() => commitNew(true)}
                        title="长期保留，下次打开还在"
                      >
                        长期
                      </button>
                    </>
                  ) : (
                    <button
                      className="chip-btn tiny"
                      disabled={!draft.trim()}
                      onClick={() => commitEdit(editing)}
                    >
                      保存
                    </button>
                  )}
                  <button className="link-btn tiny" onClick={close}>
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
