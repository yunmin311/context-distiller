import { useEffect, useState } from 'react';
import { useT } from '../i18n';

interface PreviewPanelProps {
  open: boolean;
  text: string;
  charCount: number;
  onClose: () => void;
  onCopy: (text: string) => void;
  onFill: (text: string) => void;
}

/**
 * Full plain-text preview. The user can edit the text here before copying or
 * filling; edits are a one-off on the output only — they do not change the
 * fragments or the button selections (计划书 §6.5).
 */
export function PreviewPanel({
  open,
  text,
  charCount,
  onClose,
  onCopy,
  onFill,
}: PreviewPanelProps) {
  const t = useT();
  const [draft, setDraft] = useState(text);

  // Re-seed the editable draft whenever the panel is (re)opened with new text.
  useEffect(() => {
    if (open) setDraft(text);
  }, [open, text]);

  if (!open) return null;

  const draftCount = [...draft].length;

  return (
    <div className="overlay" role="dialog" aria-label={t('preview.title')}>
      <div className="overlay-head">
        <strong>{t('preview.title')}</strong>
        <span className="muted small">
          {t('preview.chars', { count: draftCount })}
          {draftCount !== charCount ? t('preview.edited') : ''}
        </span>
        <div className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          {t('preview.back')}
        </button>
      </div>

      <textarea
        className="preview-text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
      />

      <div className="overlay-actions">
        <button className="btn btn-primary" onClick={() => onCopy(draft)}>
          {t('preview.copy')}
        </button>
        <button className="btn btn-secondary" onClick={() => onFill(draft)}>
          {t('preview.fill')}
        </button>
      </div>
      <p className="hint small">{t('preview.hint')}</p>
    </div>
  );
}
