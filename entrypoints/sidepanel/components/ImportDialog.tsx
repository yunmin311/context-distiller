import { useMemo, useState } from 'react';
import {
  countTurnPrefixes,
  splitPastedConversation,
  type PasteRole,
  type PastedTurn,
} from '../../../lib/utils/paste-split';
import { useT } from '../i18n';

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (turns: PastedTurn[]) => void;
}

/**
 * Manual paste import — the product's floor when the ChatGPT read path is
 * unavailable. Text becomes real message rows via `addPastedMessages`; nothing
 * is sent anywhere, and the rows ride the normal in-memory / snapshot rules.
 *
 * Two entry modes, deliberately simple:
 *   - default: the WHOLE paste is one turn with a picked role;
 *   - split:   when ≥2 prefixed lines ("你：" / "AI:" …) are detected, one
 *              button cuts the paste at those prefixes into separate turns.
 */
export function ImportDialog({ open, onClose, onImport }: ImportDialogProps) {
  const t = useT();
  const [text, setText] = useState('');
  const [role, setRole] = useState<PasteRole>('assistant');
  const [split, setSplit] = useState(false);

  const prefixCount = useMemo(() => countTurnPrefixes(text), [text]);
  if (!open) return null;

  const trimmed = text.trim();
  const commit = () => {
    if (!trimmed) return;
    const turns =
      split && prefixCount >= 2
        ? splitPastedConversation(text, role)
        : [{ role, text: trimmed }];
    onImport(turns);
    setText('');
    setSplit(false);
  };

  return (
    <div className="overlay" role="dialog" aria-label={t('import.title')}>
      <div className="overlay-head">
        <strong>{t('import.title')}</strong>
        <div className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          {t('preview.back')}
        </button>
      </div>

      <p className="hint small">{t('import.body')}</p>

      <textarea
        className="preview-text import-text"
        autoFocus
        placeholder={t('import.placeholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />

      <div className="import-controls">
        <span className="muted small">{t('import.role')}</span>
        <label className="import-role">
          <input
            type="radio"
            name="cd-import-role"
            checked={role === 'assistant'}
            onChange={() => setRole('assistant')}
          />
          {t('role.assistant')}
        </label>
        <label className="import-role">
          <input
            type="radio"
            name="cd-import-role"
            checked={role === 'user'}
            onChange={() => setRole('user')}
          />
          {t('role.user')}
        </label>
        <div className="spacer" />
        {prefixCount >= 2 && (
          <button
            type="button"
            className={`chip-btn tiny${split ? ' chip-btn-strong' : ''}`}
            title={t('import.splitTip')}
            aria-pressed={split}
            onClick={() => setSplit((v) => !v)}
          >
            {t('import.split')}
          </button>
        )}
      </div>
      {prefixCount > 0 && (
        <p className="hint tiny">{t('import.detected', { count: prefixCount })}</p>
      )}

      <div className="overlay-actions">
        <button className="btn btn-primary" disabled={!trimmed} onClick={commit}>
          {t('import.add')}
        </button>
      </div>
    </div>
  );
}
