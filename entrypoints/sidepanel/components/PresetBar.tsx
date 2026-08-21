import { useMemo, useState } from 'react';
import { PRESET_GROUPS, groupLabel, presetHint, presetName, presetText } from '../../../lib/core/presets';
import {
  PROMPT_LIBRARY,
  PROMPT_LIBRARY_CATEGORIES,
  categoryLabel,
  entryName,
  entryText,
} from '../../../lib/core/prompt-library';
import type { PromptLibraryEntry } from '../../../lib/core/prompt-library';
import type { PresetOption, PromptSelections } from '../../../lib/core/types';
import type { SingleKey } from '../useDistiller';
import { useLang, useT } from '../i18n';

interface PresetBarProps {
  selections: PromptSelections;
  customExtras: PresetOption[];
  onSetSingle: (key: SingleKey, presetId: string) => void;
  onToggleExtra: (presetId: string) => void;
  onAddCustom: (name: string, text: string, persist: boolean) => void;
  onUpdateCustom: (id: string, name: string, text: string) => void;
  onRemoveCustom: (id: string) => void;
}

const SINGLE_KEYS: Record<string, SingleKey> = {
  intent: 'intent',
  density: 'density',
  writingStyle: 'writingStyle',
  responseStructure: 'responseStructure',
  outputFormat: 'outputFormat',
};

/** A collapsible category shows this many chips when collapsed (2 rows, 3-col). */
const COLLAPSED_CHIPS = 6;

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`chevron ${open ? 'chevron-open' : ''}`}
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

export function PresetBar({
  selections,
  customExtras,
  onSetSingle,
  onToggleExtra,
  onAddCustom,
  onUpdateCustom,
  onRemoveCustom,
}: PresetBarProps) {
  const t = useT();
  const lang = useLang();
  // editing: null = closed, 'new' = adding, otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [draftName, setDraftName] = useState('');
  // The 从库导入 picker under the editor.
  const [libOpen, setLibOpen] = useState(false);
  const [libFilter, setLibFilter] = useState('');
  // Which categories are expanded past two rows (by group id).
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());

  function toggleOpen(id: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function openNew() {
    setEditing('new');
    setDraft('');
    setDraftName('');
    setLibOpen(false);
    setLibFilter('');
  }
  function openEdit(option: PresetOption) {
    setEditing(option.id);
    setDraft(option.text);
    setDraftName(option.name);
    setLibOpen(false);
    setLibFilter('');
  }
  function close() {
    setEditing(null);
    setDraft('');
    setDraftName('');
    setLibOpen(false);
    setLibFilter('');
  }
  function commitNew(persist: boolean) {
    const text = draft.trim();
    if (!text) return;
    onAddCustom(draftName.trim(), text, persist);
    close();
  }
  function commitEdit(id: string) {
    const text = draft.trim();
    if (!text) return;
    onUpdateCustom(id, draftName.trim(), text);
    close();
  }
  function importEntry(entry: PromptLibraryEntry) {
    setDraftName(entryName(entry, lang));
    setDraft(entryText(entry, lang));
    setLibOpen(false);
  }

  // Library entries grouped by category, filtered by the picker's search box.
  // The search matches the CURRENT language's name/text plus the category label,
  // so typing English in English mode finds things (and likewise for Chinese).
  const libGroups = useMemo(() => {
    const q = libFilter.trim().toLowerCase();
    const match = (e: PromptLibraryEntry) =>
      !q ||
      entryName(e, lang).toLowerCase().includes(q) ||
      entryText(e, lang).toLowerCase().includes(q) ||
      categoryLabel(e.category, lang).toLowerCase().includes(q);
    return PROMPT_LIBRARY_CATEGORIES.map((category) => ({
      category,
      entries: PROMPT_LIBRARY.filter((e) => e.category === category && match(e)),
    })).filter((g) => g.entries.length > 0);
  }, [libFilter, lang]);

  return (
    <div className="preset-bar">
      {PRESET_GROUPS.map((group) => {
        const singleKey = SINGLE_KEYS[group.id];
        const isExtras = group.id === 'extras';
        // Collapse any category taller than two rows. Extras also counts its
        // custom chips + the add button toward the total.
        const totalCount = group.options.length + (isExtras ? customExtras.length + 1 : 0);
        const collapsible = totalCount > COLLAPSED_CHIPS;
        const showAll =
          !collapsible || openGroups.has(group.id) || (isExtras && editing !== null);
        const builtins =
          collapsible && !showAll ? group.options.slice(0, COLLAPSED_CHIPS) : group.options;
        return (
          <div key={group.id} className="preset-group">
            <div className="preset-label">
              {groupLabel(group, lang)}
              {group.mode === 'multi' && <span className="preset-multi">{t('preset.multi')}</span>}
              {collapsible && (
                <button
                  className="collapse-btn"
                  onClick={() => toggleOpen(group.id)}
                  title={t(showAll ? 'preset.collapse' : 'preset.expandAll')}
                  aria-label={t(showAll ? 'preset.collapse' : 'preset.expandAll')}
                  aria-expanded={showAll}
                >
                  <Chevron open={showAll} />
                </button>
              )}
            </div>
            <div className="preset-options">
              {builtins.map((option) => {
                const active =
                  group.mode === 'single'
                    ? selections[singleKey!] === option.id
                    : selections.extras.includes(option.id);
                return (
                  <button
                    key={option.id}
                    className={`chip ${active ? 'chip-active' : ''}`}
                    title={presetHint(option, lang) ?? presetText(option, lang)}
                    onClick={() =>
                      group.mode === 'single'
                        ? onSetSingle(singleKey!, option.id)
                        : onToggleExtra(option.id)
                    }
                  >
                    {presetName(option, lang)}
                  </button>
                );
              })}

              {isExtras &&
                showAll &&
                customExtras.map((option) => {
                  const active = selections.extras.includes(option.id);
                  return (
                    <span key={option.id} className="chip-custom-wrap">
                      <button
                        className={`chip chip-custom ${active ? 'chip-active' : ''}`}
                        title={`${option.text}\n${t('preset.customTip', {
                          scope: t(
                            option.scope === 'persist'
                              ? 'preset.scopePersist'
                              : 'preset.scopeSession',
                          ),
                        })}`}
                        onClick={() => onToggleExtra(option.id)}
                        onDoubleClick={() => openEdit(option)}
                      >
                        {option.name}
                      </button>
                      <button
                        className="chip-x"
                        title={t('preset.removeCustom')}
                        aria-label={t('preset.removeCustomAria', { name: option.name })}
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

              {isExtras && showAll && editing === null && (
                <button className="chip chip-add" title={t('preset.addCustomTip')} onClick={openNew}>
                  {t('preset.addCustom')}
                </button>
              )}
            </div>

            {isExtras && editing !== null && (
              <div className="custom-editor">
                <input
                  className="input custom-name"
                  maxLength={24}
                  placeholder={t('preset.namePlaceholder')}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                />
                <textarea
                  className="input custom-input"
                  autoFocus
                  rows={3}
                  maxLength={4000}
                  placeholder={t('preset.textPlaceholder')}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div className="custom-editor-actions">
                  <button
                    className="chip-btn tiny lib-open-btn"
                    onClick={() => setLibOpen((v) => !v)}
                    aria-expanded={libOpen}
                    title={t('preset.importTip')}
                  >
                    {t('preset.importFromLibrary')} <Chevron open={libOpen} />
                  </button>
                  <div className="spacer" />
                  {editing === 'new' ? (
                    <>
                      <button
                        className="chip-btn tiny"
                        disabled={!draft.trim()}
                        onClick={() => commitNew(false)}
                        title={t('list.scopeSessionTip')}
                      >
                        {t('list.scopeSession')}
                      </button>
                      <button
                        className="chip-btn tiny"
                        disabled={!draft.trim()}
                        onClick={() => commitNew(true)}
                        title={t('list.scopePersistTip')}
                      >
                        {t('list.scopePersist')}
                      </button>
                    </>
                  ) : (
                    <button
                      className="chip-btn tiny"
                      disabled={!draft.trim()}
                      onClick={() => commitEdit(editing)}
                    >
                      {t('preset.save')}
                    </button>
                  )}
                  <button className="link-btn tiny" onClick={close}>
                    {t('preset.cancel')}
                  </button>
                </div>

                {libOpen && (
                  <div className="lib-picker">
                    <input
                      className="input lib-search"
                      type="search"
                      placeholder={t('preset.searchLibrary')}
                      value={libFilter}
                      onChange={(e) => setLibFilter(e.target.value)}
                    />
                    <div className="lib-list">
                      {libGroups.map(({ category, entries }) => (
                        <div key={category} className="lib-cat">
                          <div className="lib-cat-label">{categoryLabel(category, lang)}</div>
                          {entries.map((entry) => (
                            <button
                              key={entry.id}
                              className="lib-item"
                              title={entryText(entry, lang)}
                              onClick={() => importEntry(entry)}
                            >
                              <span className="lib-item-name">{entryName(entry, lang)}</span>
                              <span className="lib-item-src">
                                {t(
                                  entry.source === 'fabric'
                                    ? 'preset.srcFabric'
                                    : 'preset.srcOriginal',
                                )}
                              </span>
                            </button>
                          ))}
                        </div>
                      ))}
                      {libGroups.length === 0 && (
                        <p className="muted tiny lib-empty">{t('preset.libraryEmpty')}</p>
                      )}
                    </div>
                    <p className="hint tiny lib-note">{t('preset.libraryNote')}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
