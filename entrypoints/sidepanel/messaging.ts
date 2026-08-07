import type { PanelRequest, PanelResponse } from '../../lib/messaging/protocol';

/** Get the tab the side panel is currently attached to (the active tab). */
export async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * Is the active tab a supported ChatGPT conversation page? Used to auto-read on
 * open only when it makes sense — the URL is readable because we hold host
 * permissions for these origins.
 */
export async function activeTabIsSupported(): Promise<boolean> {
  const tab = await getActiveTab();
  return !!tab?.url && /^https?:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(tab.url);
}

/**
 * Reload the active tab. Used by "重试" so the user doesn't have to refresh the
 * page by hand — most read failures are just a not-yet-ready content script.
 * Works with our host permissions; no extra "tabs" permission needed.
 *
 * Guarded to a ChatGPT tab: the side panel always talks to whatever tab is
 * focused, so without this check a user who switched to another tab (a doc, a
 * form) and hit 重试 would reload THAT tab and lose its unsaved state. If the
 * focused tab is not a supported page we refuse and let the caller explain.
 */
export async function reloadActiveTab(): Promise<boolean> {
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url || !/^https?:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(tab.url)) {
    return false;
  }
  try {
    await browser.tabs.reload(tab.id);
    return true;
  } catch {
    return false;
  }
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
