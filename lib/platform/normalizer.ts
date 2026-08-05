import type { ConversationMessage, MessageRole } from '../core/types';
import type { RawMessage } from './adapter';

/**
 * Conversation Normalizer.
 *
 * Turns raw platform messages (from page data OR DOM) into a clean, ordered
 * ConversationMessage[]. Pure and deterministic — it decides nothing about
 * whether a message is "important", it only cleans, dedupes and orders. This is
 * the seam that lets the UI ignore where a message came from.
 */

/** Map a platform's role string onto our closed role set, or null to drop it. */
export function coerceRole(raw: string): MessageRole | null {
  const r = raw?.toLowerCase().trim();
  if (r === 'user' || r === 'human') return 'user';
  if (r === 'assistant' || r === 'ai' || r === 'gpt' || r === 'bot' || r === 'model')
    return 'assistant';
  if (r === 'system') return 'system';
  // 'tool' and other internal roles are intentionally dropped from the material.
  return null;
}

export function normalizeMessages(raw: RawMessage[]): ConversationMessage[] {
  const out: ConversationMessage[] = [];
  const seenIds = new Set<string>();
  let order = 0;

  for (const item of raw) {
    const role = coerceRole(item.role);
    if (!role) continue;

    const text = (item.text ?? '').replace(/ /g, ' ').trim();
    if (!text) continue;

    // Drop duplicate platform ids (a message can appear in both data + DOM).
    if (item.id) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
    }

    out.push({
      id: item.id ?? `msg_${order}`,
      role,
      text,
      order,
      source: item.source,
    });
    order += 1;
  }

  return out;
}
