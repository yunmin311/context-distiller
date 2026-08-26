import { describe, expect, it } from 'vitest';
import {
  activeBranchIds,
  walkActiveBranch,
  type ChatGptMessage,
  type ConversationMapping,
} from './conversation-walk';

/** Build a mapping node in one line. */
function node(
  parent: string | null,
  message?: Partial<ChatGptMessage> | null,
): { parent: string | null; message: ChatGptMessage | null } {
  return {
    parent,
    message: message === undefined || message === null
      ? ({ author: { role: 'user' }, content: { parts: ['x'] } } as ChatGptMessage)
      : ({
          author: { role: 'user' },
          content: { content_type: 'text', parts: [] },
          ...message,
        } as ChatGptMessage),
  };
}

function linearChain(): ConversationMapping {
  // root(a) -> b -> c, each a user/assistant pair would be more real, but the
  // shape of the chain is what matters here.
  return {
    a: node(null, text('user', 'q1', 'a')),
    b: node('a', text('assistant', 'ans1', 'b')),
    c: node('b', text('user', 'q2', 'c')),
  };
}

function text(role: 'user' | 'assistant' | string, body: string, id?: string): Partial<ChatGptMessage> {
  return {
    id,
    author: { role },
    recipient: 'all',
    content: { content_type: 'text', parts: [body] },
  };
}

describe('activeBranchIds', () => {
  it('walks the parent chain and returns root → leaf order', () => {
    const ids = activeBranchIds({ a: node(null), b: node('a'), c: node('b') }, 'c');
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('survives a looping parent chain (corrupted mapping)', () => {
    const mapping: ConversationMapping = {
      a: node('c'),
      b: node('a'),
      c: node('b'),
    };
    // Must terminate via the seen-set / guard, not hang or blow the stack.
    expect(activeBranchIds(mapping, 'a').length).toBeLessThanOrEqual(5000);
  });

  it('returns empty for an unknown current node', () => {
    expect(activeBranchIds(linearChain(), 'nope')).toEqual([]);
  });
});

describe('walkActiveBranch', () => {
  it('reads a simple thread in display order with roles and ids intact', () => {
    const turns = walkActiveBranch(
      {
        r: node(null, text('user', 'hi', 'u1')),
        m1: node('r', text('assistant', 'hello', 'a1')),
      },
      'm1',
    );
    expect(turns).toEqual([
      { id: 'u1', role: 'user', text: 'hi' },
      { id: 'a1', role: 'assistant', text: 'hello' },
    ]);
  });

  it('excludes dead branches — only the path to currentNode counts', () => {
    const mapping: ConversationMapping = {
      u1: node(null, text('user', 'q', 'u1')),
      good: node('u1', text('assistant', 'kept', 'a-kept')),
      stale: node('u1', text('assistant', 'regenerated-away', 'a-stale')),
    };
    const turns = walkActiveBranch(mapping, 'good');
    expect(turns).toEqual([
      { id: 'u1', role: 'user', text: 'q' },
      { id: 'a-kept', role: 'assistant', text: 'kept' },
    ]);
  });

  it('drops tool, system, reasoning, hidden and preamble nodes on the ACTIVE branch', () => {
    // Chained linearly so every junk node IS on the active path — the filters
    // must be what removes them, not the branch pruning.
    const mapping: ConversationMapping = {
      u1: node(null, text('user', 'q', 'u1')),
      t1: node('u1', text('tool', 'tool output')),
      s1: node('t1', text('system', 'sysmsg')),
      th: node('s1', {
        ...text('assistant', 'thinking…'),
        content: { content_type: 'thoughts', parts: ['thinking…'] },
      }),
      rc: node('th', {
        ...text('assistant', 'recap'),
        content: { content_type: 'reasoning_recap', parts: ['recap'] },
      }),
      hid: node('rc', {
        ...text('assistant', 'invisible'),
        metadata: { is_visually_hidden_from_conversation: true },
      }),
      pre: node('hid', {
        ...text('assistant', '我先看看'),
        metadata: { is_thinking_preamble_message: true },
      }),
      to: node('pre', {
        ...text('assistant', 'for the tool'),
        recipient: 'browser',
      }),
      a1: node('to', text('assistant', 'the answer', 'a1')),
    };
    const turns = walkActiveBranch(mapping, 'a1');
    expect(turns).toEqual([
      { id: 'u1', role: 'user', text: 'q' },
      { id: 'a1', role: 'assistant', text: 'the answer' },
    ]);
  });

  it('merges consecutive same-role turns into one, keeping the first id', () => {
    const mapping: ConversationMapping = {
      u1: node(null, text('user', 'q', 'u1')),
      a1: node('u1', text('assistant', 'part one', 'a1')),
      a2: node('a1', text('assistant', 'part two', 'a2')),
    };
    const turns = walkActiveBranch(mapping, 'a2');
    expect(turns).toEqual([
      { id: 'u1', role: 'user', text: 'q' },
      { id: 'a1', role: 'assistant', text: 'part one\n\npart two' },
    ]);
  });

  it('skips nodes whose text comes out empty (e.g. multimodal placeholders)', () => {
    const mapping: ConversationMapping = {
      u1: node(null, text('user', '', 'u1-empty')),
      a1: node('u1', text('assistant', 'still works', 'a1')),
    };
    expect(walkActiveBranch(mapping, 'a1')).toEqual([
      { id: 'a1', role: 'assistant', text: 'still works' },
    ]);
  });

  it('unwraps object-shaped parts ({text} / {content})', () => {
    const mapping: ConversationMapping = {
      a1: node(null, {
        id: 'a1',
        author: { role: 'assistant' },
        content: { content_type: 'text', parts: [{ text: 'wrapped' }] },
      }),
    };
    expect(walkActiveBranch(mapping, 'a1')[0]?.text).toBe('wrapped');
  });

  it('returns empty (not a crash) for a missing or empty mapping', () => {
    expect(walkActiveBranch({}, undefined)).toEqual([]);
    // A node with no message at all contributes nothing.
    expect(walkActiveBranch({ x: { parent: null, message: null } }, 'x')).toEqual([]);
  });
});
