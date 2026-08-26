import type { ConversationInfo, ConversationMessage, MessageSource } from '../core/types';

/**
 * Typed message protocol for the three hops in the extension:
 *   Side Panel  <-runtime->  Content Script  <-CustomEvent->  Main World Bridge
 *
 * Keeping every payload here means no context has to guess the shape of a
 * message, and the Prompt Compiler / React UI never touch ChatGPT selectors.
 */

// --- Side Panel  ->  Content Script (chrome.tabs.sendMessage) -------------

export type PanelRequest =
  | { kind: 'ping' }
  | { kind: 'get-conversation' }
  | { kind: 'get-selection' }
  | { kind: 'fill-composer'; text: string }
  | { kind: 'get-theme' }
  | {
      kind: 'scroll-to-message';
      messageId: string;
      /** All message ids in display order, so the page can seek a virtualized
       *  (unmounted) message by binary-searching its scroll position. */
      orderedIds?: string[];
    };

/** A raw text selection the content script resolved to a message + role. */
export interface SelectionPayload {
  text: string;
  messageId?: string;
  role: 'user' | 'assistant';
  sourceOrder: number;
}

/**
 * A stable, language-independent id for a failure, mirroring a key in the panel's
 * i18n table (`lib/i18n`). The content script runs in the page and has no idea
 * which language the panel is showing, so it reports a CODE and lets the panel
 * word it; `error` stays alongside as a human-readable fallback.
 */
export type ErrorCode =
  | 'err.readFailed'
  | 'err.noActiveTab'
  | 'err.noResponse'
  | 'err.noContentScript'
  | 'err.noMessages'
  | 'err.fillFailed'
  | 'err.unknownRequest'
  | 'err.scrollNotFound'
  | 'err.focusChatgptTab'
  | 'err.reloadNoMessages';

export type PanelResponse =
  | { kind: 'pong'; platform: string }
  | {
      kind: 'conversation';
      ok: true;
      conversation: ConversationInfo;
      messages: ConversationMessage[];
      /** Only mounted messages could be read (virtual list) — may be incomplete. */
      partial: boolean;
      source: MessageSource;
    }
  | { kind: 'conversation'; ok: false; error: string; code?: ErrorCode }
  | { kind: 'selection'; ok: true; selection: SelectionPayload | null }
  | { kind: 'selection'; ok: false; error: string; code?: ErrorCode }
  | { kind: 'fill'; ok: boolean; error?: string; code?: ErrorCode }
  | { kind: 'scroll-result'; ok: boolean; error?: string; code?: ErrorCode }
  | {
      kind: 'theme';
      theme: 'light' | 'dark';
      /** ChatGPT's own accent / primary color, when the page exposes a non-grey
       *  one; null when its buttons are monochrome (panel keeps its own accent). */
      accent?: string | null;
    }
  | { kind: 'error'; error: string; code?: ErrorCode };

// --- Content Script  ->  Side Panel (push, chrome.runtime.sendMessage) -----

/**
 * Pushed as the user scrolls / jumps around the ChatGPT conversation, so the
 * panel can follow along (scroll the matching row into view + highlight it).
 * Fire-and-forget: if the panel isn't open, the send simply has no receiver.
 */
export interface ActiveMessagePush {
  kind: 'active-message';
  messageId: string;
}

/**
 * Pushed when a PARTIAL (DOM-based) read is on screen and scrolling up has
 * loaded more of the thread into the page, so the panel can quietly re-read and
 * grow its list. Never sent after a full backend read — there is nothing to add.
 */
export interface ConversationGrewPush {
  kind: 'conversation-grew';
  mounted: number;
}

/** Pushed when ChatGPT's theme (light/dark or accent) changes, so the panel follows. */
export interface ThemePush {
  kind: 'theme-change';
  theme: 'light' | 'dark';
  /** ChatGPT's accent color, or null when its UI is monochrome. */
  accent?: string | null;
}

// --- Content Script  <->  Main World Bridge (window CustomEvent) ----------

export const MW_REQUEST_EVENT = 'cd:mw-request';
export const MW_RESPONSE_EVENT = 'cd:mw-response';

export interface MwRequest {
  id: string;
  /** `extract` = read mounted DOM via React fibers; `extract-api` = fetch the
   *  COMPLETE conversation from ChatGPT's backend (runs in the page world so the
   *  same-origin session auth works). */
  action: 'extract' | 'extract-api';
}

export interface MwRawMessage {
  id?: string;
  role: string;
  text: string;
}

export interface MwResponse {
  id: string;
  ok: boolean;
  title?: string;
  messages?: MwRawMessage[];
  error?: string;
}
