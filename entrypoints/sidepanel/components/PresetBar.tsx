import { PRESET_GROUPS } from '../../../lib/core/presets';
import type { PromptSelections } from '../../../lib/core/types';
import type { SingleKey } from '../useDistiller';

interface PresetBarProps {
  selections: PromptSelections;
  onSetSingle: (key: SingleKey, presetId: string) => void;
  onToggleExtra: (presetId: string) => void;
}

const SINGLE_KEYS: Record<string, SingleKey> = {
  intent: 'intent',
  density: 'density',
  writingStyle: 'writingStyle',
  responseStructure: 'responseStructure',
};

export function PresetBar({ selections, onSetSingle, onToggleExtra }: PresetBarProps) {
  return (
    <div className="preset-bar">
      {PRESET_GROUPS.map((group) => {
        const singleKey = SINGLE_KEYS[group.id];
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
