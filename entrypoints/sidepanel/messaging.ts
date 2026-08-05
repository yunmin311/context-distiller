import type { PanelRequest, PanelResponse } from '../../lib/messaging/protocol';

/** Get the tab the side panel is currently attached to (the active tab). */
export async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * Send a typed request to the content script in the active tab. Never throws —
 * connectivity problems (wrong page, content script not injected yet) come back
 * as a `{ kind: 'error' }` response so the UI can show a friendly message.
 */
export async function sendToActiveTab(request: PanelRequest): Promise<PanelResponse> {
  const tab = await getActiveTab();
  if (!tab?.id) {
    return { kind: 'error', error: '没有找到活动标签页。' };
  }
  try {
    const response = (await browser.tabs.sendMessage(tab.id, request)) as
      | PanelResponse
      | undefined;
    return (
      response ?? {
        kind: 'error',
        error: '页面没有响应。请在 ChatGPT 对话页打开，刷新页面后重试。',
      }
    );
  } catch {
    return {
      kind: 'error',
      error: '无法与页面通信。请在 ChatGPT（chatgpt.com）对话页打开侧边栏，必要时刷新页面。',
    };
  }
}

/** Copy text to the clipboard, with an execCommand fallback (no permission needed). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
