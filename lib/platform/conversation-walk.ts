/**
 * Walk ChatGPT's conversation `mapping` into a flat, ordered turn list — the
 * pure data core of the full backend read (`chatgpt-main-world.ts`).
 *
 * The mapping is an adjacency tree: every node has a `parent` and any number of
 * children; edits / regenerations fork it. The displayed thread is ONLY the path
 * from `currentNode` back to the root, reversed — dead branches must never leak
 * in, or a "regenerated" answer would show twice.
 *
 * Browser-independent and fully unit-tested: this is where long-read
 * completeness bugs (missing turns, duplicated answers, wrong order) live.
 */

export interface WalkedTurn {
  id?: string;
  role: 'user' | 'assistant';
  text: string;
}

interface MappingNode {
  parent?: string | null;
  message?: ChatGptMessage | null;
}

export interface ChatGptMessage {
  id?: string;
  author?: { role?: string };
  recipient?: string;
  content?: {
    content_type?: string;
    parts?: unknown[];
    text?: string;
  };
  metadata?: {
    is_visually_hidden_from_conversation?: boolean;
    is_thinking_preamble_message?: boolean;
  };
}

export type ConversationMapping = Record<string, MappingNode | undefined>;

/** Pull plain text out of a message's `content` (parts are strings or {text}). */
function partsToText(content: ChatGptMessage['content']): string {
  const parts = content?.parts;
  if (Array.isArray(parts)) {
    return parts
      .map((p) => {
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object') {
          const rec = p as Record<string, unknown>;
          if (typeof rec.text === 'string') return rec.text;
          if (typeof rec.content === 'string') return rec.content;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  if (typeof content?.text === 'string') return content.text.trim();
  return '';
}

/**
 * The active branch, root → leaf = display order. Guarded against a corrupted
 * mapping whose parent chain loops forever.
 */
export function activeBranchIds(mapping: ConversationMapping, currentNode?: string): string[] {
  const path: string[] = [];
  let id = currentNode;
  let guard = 0;
  const seen = new Set<string>();
  while (id && mapping[id] && guard < 5000 && !seen.has(id)) {
    seen.add(id);
    path.push(id);
    id = mapping[id]!.parent ?? undefined;
    guard += 1;
  }
  return path.reverse();
}

/**
 * The full read: active-branch turns only, with everything that isn't part of
 * what the user SEES dropped (tool calls, system, internal reasoning, hidden
 * nodes), then consecutive same-role turns merged — ChatGPT can split one answer
 * into adjacent assistant nodes, which would otherwise cut a turn into pieces.
 */
export function walkActiveBranch(
  mapping: ConversationMapping,
  currentNode?: string,
): WalkedTurn[] {
  const out: WalkedTurn[] = [];
  for (const nodeId of activeBranchIds(mapping, currentNode)) {
    const msg = mapping[nodeId]?.message;
    if (!msg?.author) continue;
    const role = msg.author.role;
    if (role !== 'user' && role !== 'assistant') continue; // tool / system
    if (msg.recipient && msg.recipient !== 'all') continue; // tool-directed
    if (msg.metadata?.is_visually_hidden_from_conversation) continue;
    if (msg.metadata?.is_thinking_preamble_message) continue; // "我先…" preview
    const ctype = msg.content?.content_type;
    if (ctype === 'thoughts' || ctype === 'reasoning_recap') continue; // reasoning
    const text = partsToText(msg.content);
    if (!text) continue;

    const last = out[out.length - 1];
    if (last && last.role === role) {
      last.text = `${last.text}\n\n${text}`; // merge split turns; keep first id
    } else {
      out.push({ id: msg.id, role, text });
    }
  }
  return out;
}
