/**
 * Opt-in session persistence for the "记住本次整理" toggle.
 *
 * By DEFAULT this is never used — conversation content and selected material
 * stay in memory only (the privacy default). ONLY when the user turns the toggle
 * on does the current working set (conversation + messages + grouped material +
 * preset selections) get snapshotted to `chrome.storage.local`, so reopening the
 * panel restores it verbatim. Turning the toggle off clears the snapshot.
 */

import type {
  ConversationInfo,
  ConversationMessage,
  FragmentGroup,
  MessageSource,
  PresetOption,
  PromptSelections,
} from '../../lib/core/types';

const KEY = 'cd-session-v1';

/** Don't persist an absurdly large snapshot (guards the storage quota). */
const MAX_CHARS = 3_000_000;

export interface SessionSnapshot {
  conversation?: ConversationInfo;
  messages: ConversationMessage[];
  partial: boolean;
  source?: MessageSource;
  groups: FragmentGroup[];
  selections: PromptSelections;
  customExtras: PresetOption[];
}

export async function loadSession(): Promise<SessionSnapshot | null> {
  try {
    const got = await browser.storage?.local?.get(KEY);
    const s = got?.[KEY] as SessionSnapshot | undefined;
    if (!s || !Array.isArray(s.messages) || !Array.isArray(s.groups)) return null;
    return s;
  } catch {
    return null;
  }
}

export async function saveSession(snap: SessionSnapshot): Promise<void> {
  try {
    const json = JSON.stringify(snap);
    if (json.length > MAX_CHARS) return; // too large — skip silently
    await browser.storage?.local?.set({ [KEY]: snap });
  } catch {
    // storage full / unavailable — persistence degrades silently to session-only
  }
}

export async function clearSession(): Promise<void> {
  try {
    await browser.storage?.local?.remove(KEY);
  } catch {
    // ignore
  }
}
