import { describe, it, expect } from 'vitest';
import { conversationKey } from './conversation-key';

/**
 * This key decides whether a read KEEPS the user's selected material or clears it.
 * Both failure directions are damaging, so both are pinned here:
 *   — too loose  → two conversations' material silently mixes in the workspace
 *   — too strict → an ordinary refresh throws away work the user just did
 */
describe('conversationKey', () => {
  const A = 'https://chatgpt.com/c/68a1f0c2-1111-2222-3333-444455556666';
  const B = 'https://chatgpt.com/c/79b2e1d3-9999-8888-7777-666655554444';

  it('treats the same conversation as the same, despite query / hash / trailing slash', () => {
    expect(conversationKey(A)).toBe(conversationKey(`${A}/`));
    expect(conversationKey(A)).toBe(conversationKey(`${A}?model=gpt-4o`));
    expect(conversationKey(A)).toBe(conversationKey(`${A}#anchor`));
    // and across hosts, since the id is what identifies the thread
    expect(conversationKey(A)).toBe(
      conversationKey(A.replace('chatgpt.com', 'chat.openai.com')),
    );
  });

  it('tells two different conversations apart', () => {
    expect(conversationKey(A)).not.toBe(conversationKey(B));
  });

  it('handles a new, unsaved chat (no /c/ segment) as equal to itself', () => {
    const fresh = 'https://chatgpt.com/';
    expect(conversationKey(fresh)).toBe(conversationKey('https://chatgpt.com/?temp=1'));
    expect(conversationKey(fresh)).not.toBe(conversationKey(A));
  });

  it('returns an empty key for an empty url instead of throwing', () => {
    expect(conversationKey('')).toBe('');
  });
});
