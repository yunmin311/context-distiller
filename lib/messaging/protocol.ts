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
  | { kind: 'fill-composer'; text: string };

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
  | { kind: 'error'; error: string };

// --- Content Script  <->  Main World Bridge (window CustomEvent) ----------

export const MW_REQUEST_EVENT = 'cd:mw-request';
export const MW_RESPONSE_EVENT = 'cd:mw-response';

export interface MwRequest {
  id: string;
  action: 'extract';
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
