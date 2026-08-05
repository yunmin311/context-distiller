import { useEffect, useState } from 'react';

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
  const [draft, setDraft] = useState(text);

  // Re-seed the editable draft whenever the panel is (re)opened with new text.
  useEffect(() => {
    if (open) setDraft(text);
  }, [open, text]);

  if (!open) return null;

  const draftCount = [...draft].length;

  return (
    <div className="overlay" role="dialog" aria-label="完整消息预览">
      <div className="overlay-head">
        <strong>完整消息预览</strong>
        <span className="muted small">
          {draftCount} 字{draftCount !== charCount ? '（已编辑）' : ''}
        </span>
        <div className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          返回
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
          复制完整消息
        </button>
        <button className="btn btn-secondary" onClick={() => onFill(draft)}>
          填入当前对话
        </button>
      </div>
      <p className="hint small">
        插件不会自动发送。填入后请在 ChatGPT 输入框中检查，并由你自己点击发送。
      </p>
    </div>
  );
}
