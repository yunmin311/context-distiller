import type { PlatformAdapter, RawMessage } from './adapter';
import { registerAdapter } from './adapter';

/**
 * ChatGPT platform adapter (chatgpt.com / chat.openai.com).
 *
 * All ChatGPT-specific DOM knowledge is confined to this file. If ChatGPT
 * changes its markup, this is the only place that needs updating.
 */

const MESSAGE_SELECTOR = '[data-message-author-role]';
const COMPOSER_SELECTOR =
  '#prompt-textarea, textarea[data-testid="prompt-textarea"], div[contenteditable="true"]#prompt-textarea';

/** Read the visible text of one message node, preferring the content container. */
function readMessageText(node: HTMLElement): string {
  const content =
    node.querySelector<HTMLElement>('.markdown') ??
    node.querySelector<HTMLElement>('.whitespace-pre-wrap') ??
    node;
  return (content.innerText ?? content.textContent ?? '').trim();
}

/**
 * Set the value of a React-controlled <textarea> using the native setter so the
 * page's React state actually updates when we dispatch the input event.
 */
function setNativeTextareaValue(el: HTMLTextAreaElement, value: string): void {
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  desc?.set?.call(el, value);
}

export const chatgptAdapter: PlatformAdapter = {
  id: 'chatgpt',
  label: 'ChatGPT',
  mainWorldScript: '/chatgpt-main-world.js',

  matchesUrl(url: string): boolean {
    return /^https?:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(url);
  },

  getConversationTitle(): string {
    // Active conversation title in the sidebar, else the document title.
    const active = document.querySelector<HTMLElement>(
      'nav a[aria-current="page"], nav li[data-active] a',
    );
    const fromNav = active?.innerText?.trim();
    if (fromNav) return fromNav;
    return document.title.replace(/\s*[-|]\s*ChatGPT\s*$/i, '').trim() || 'ChatGPT 对话';
  },

  extractFromDom(): RawMessage[] {
    const nodes = document.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR);
    const out: RawMessage[] = [];
    nodes.forEach((node) => {
      const role = node.getAttribute('data-message-author-role') ?? '';
      const id = node.getAttribute('data-message-id') ?? undefined;
      const text = readMessageText(node);
      if (text) out.push({ id, role, text, source: 'dom' });
    });
    return out;
  },

  findComposer(): HTMLElement | null {
    return document.querySelector<HTMLElement>(COMPOSER_SELECTOR);
  },

  async fillComposer(text: string): Promise<boolean> {
    const el = this.findComposer();
    if (!el) return false;
    el.focus();

    // Plain <textarea> path (older ChatGPT / some fallbacks).
    if (el instanceof HTMLTextAreaElement) {
      setNativeTextareaValue(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return el.value === text;
    }

    // ProseMirror contenteditable: select everything, then replace it in ONE
    // operation. Rebuilding paragraph nodes by hand is what made this slow, so
    // we insert the whole string in a single transaction instead.
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    selection?.removeAllRanges();
    selection?.addRange(range);

    // Fast, reliable path: one execCommand insert. Deprecated but still the
    // method ProseMirror handles most cleanly.
    try {
      if (document.execCommand('insertText', false, text)) return true;
    } catch {
      // fall through to the paste path
    }

    // Fallback: a synthetic paste, which ProseMirror also processes in one pass.
    try {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
      return true;
    } catch {
      return false;
    }
  },

  locateMessageElement(messageId: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
  },
};

registerAdapter(chatgptAdapter);
