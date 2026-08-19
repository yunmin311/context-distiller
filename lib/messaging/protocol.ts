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
  | { kind: 'scroll-to-message'; messageId: string };

/** A raw text selection the content script resolved to a message + role. */
export interface SelectionPayload {
  text: string;
  messageId?: string;
  role: 'user' | 'assistant';
  sourceOrder: number;
}

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
  | { kind: 'conversation'; ok: false; error: string }
  | { kind: 'selection'; ok: true; selection: SelectionPayload | null }
  | { kind: 'selection'; ok: false; error: string }
  | { kind: 'fill'; ok: boolean; error?: string }
  | { kind: 'scroll-result'; ok: boolean; error?: string }
  | { kind: 'error'; error: string };

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
