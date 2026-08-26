import { memo, useState } from 'react';
import { useT } from '../i18n';

interface ScratchpadProps {
  /** The committed 便签 text held in state (already hydrated from local config). */
  value: string;
  /** Commit the edited text back to state (persisted as long-term config). */
  onCommit: (text: string) => void;
}

/** Hard cap mirrors loadPrefs' bound, so a paste can't exceed what storage keeps. */
const MAX_SCRATCHPAD = 20000;

/**
 * 便签 — a private annotation pad. Pure personal notes: they are NEVER compiled
 * into the output and never sent anywhere (they don't touch compile() at all).
 * The opposite of 消息标记, which DO compile into the 【标记】 section.
 *
 * Local draft + commit-on-blur (same pattern as GroupBoard's FragmentRow): typing
 * only touches this component's own state, so no keystroke re-renders App or writes
 * to storage. The committed text flows to long-term config on blur, where the
 * existing signature-dedupe handles the actual save.
 */
export const Scratchpad = memo(function Scratchpad({ value, onCommit }: ScratchpadProps) {
  const t = useT();
  const [draft, setDraft] = useState(value);

  function commit() {
    if (draft !== value) onCommit(draft);
  }

  return (
    <div className="scratchpad">
      <textarea
        className="input scratchpad-text"
        placeholder={t('scratch.placeholder')}
        aria-label={t('top.scratchpad')}
        value={draft}
        maxLength={MAX_SCRATCHPAD}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
    </div>
  );
});
