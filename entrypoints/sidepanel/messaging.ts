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
 * Send a typed request to the content script in the active tab. Never throws —
 * connectivity problems (wrong page, content script not injected yet) come back
 * as a `{ kind: 'error' }` response so the UI can show a friendly message.
 *
 * SELF-HEALING: right after the extension is reloaded/updated, an open ChatGPT
 * tab still holds the OLD content script — an orphaned context that can no
 * longer answer (every request dies with "Receiving end does not exist"). That
 * made the panel appear dead until the user manually refreshed the tab. When we
 * see exactly that signature, we inject a FRESH content script into the page
 * and retry ONCE, so an update heals itself instead of breaking silently.
 */
export async function sendToActiveTab(request: PanelRequest): Promise<PanelResponse> {
  // TEST SEAM (offline E2E rig only): a localStorage counter forces the exact
  // "orphaned content script" failure signature for the next N sends, so the
  // self-heal path is exercisable deterministically in a real browser.
  let forcedFailures = 0;
  try {
    forcedFailures = Number(localStorage.getItem('cd-e2e-fail-send') ?? 0) || 0;
    if (forcedFailures > 0) {
      localStorage.setItem('cd-e2e-fail-send', String(forcedFailures - 1));
    }
  } catch {
    // storage unavailable — the seam simply never activates
  }

  let healed = false; // inject at most ONCE per request — never speculatively
  const attempt = async (): Promise<PanelResponse | null> => {
    const tab = await getActiveTab();
    if (!tab?.id) {
      return { kind: 'error', error: '没有找到活动标签页。', code: 'err.noActiveTab' };
    }
    try {
      if (forcedFailures > 0) {
        forcedFailures -= 1;
        throw new Error('Could not establish connection. Receiving end does not exist.');
      }
      const response = (await browser.tabs.sendMessage(tab.id, request)) as
        | PanelResponse
        | undefined;
      return (
        response ?? {
          kind: 'error',
          error: '页面没有响应。请在 ChatGPT 对话页打开，刷新页面后重试。',
          code: 'err.noResponse',
        }
      );
    } catch (e) {
      if (
        !healed &&
        /receiving end does not exist|message port closed|establish connection/i.test(String(e))
      ) {
        // Stale / missing content script — signal the caller to heal and retry.
        healed = true;
        const okInject = await reinjectContentScript(tab.id);
        if (okInject) return null;
      }
      return {
        kind: 'error',
        error: '无法与页面通信。请在 ChatGPT（chatgpt.com）对话页打开侧边栏，必要时刷新页面。',
        code: 'err.noContentScript',
      };
    }
  };

  const first = await attempt();
  if (first) return first;
  return (await attempt()) ?? {
    kind: 'error',
    error: '无法与页面通信。请刷新 ChatGPT 页面后重试。',
    code: 'err.noContentScript',
  };
}

/**
 * Inject a fresh content script into the tab (host permissions cover it). Used
 * ONLY for the orphaned-context signature above — injecting twice would double
 * listeners, so never call this speculatively. Guarded to ChatGPT pages: the
 * "receiver missing" case can also fire when the active tab is NOT a ChatGPT
 * page (e.g. the panel itself in an embedded context), and force-injecting
 * there would pollute an unrelated page.
 */
async function reinjectContentScript(tabId: number): Promise<boolean> {
  try {
    const tab = await browser.tabs.get(tabId);
    if (!tab.url || !/^https?:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(tab.url)) {
      return false;
    }
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/chatgpt.js'],
    });
    // Give the freshly injected script a beat to register its listener.
    await new Promise((r) => setTimeout(r, 250));
    return true;
  } catch {
    return false;
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
