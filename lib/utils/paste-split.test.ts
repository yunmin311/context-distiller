import { describe, expect, it } from 'vitest';
import { countTurnPrefixes, splitPastedConversation } from './paste-split';

describe('countTurnPrefixes', () => {
  it('counts prefixed lines across CN/EN and colon widths', () => {
    const text = ['你：你好', 'plain line', 'AI: hello', 'AI：再见', 'no prefix here'].join('\n');
    expect(countTurnPrefixes(text)).toBe(3);
  });

  it('returns 0 for unprefixed text', () => {
    expect(countTurnPrefixes('just some text\nwith lines')).toBe(0);
  });

  it('does not count near-misses (token without a colon)', () => {
    expect(countTurnPrefixes('AI is great\nUser informed us')).toBe(0);
  });
});

describe('splitPastedConversation', () => {
  it('keeps unprefixed text as ONE turn with the fallback role', () => {
    const turns = splitPastedConversation('第一段\n第二段', 'user');
    expect(turns).toEqual([{ role: 'user', text: '第一段\n第二段' }]);
  });

  it('splits CN prefixes; unprefixed lines continue the current turn', () => {
    const turns = splitPastedConversation('你：帮我总结\n好，以下是总结…\nAI：这是总结');
    expect(turns).toEqual([
      { role: 'user', text: '帮我总结\n好，以下是总结…' },
      { role: 'assistant', text: '这是总结' },
    ]);
  });

  it('handles english prefixes case-insensitively, half or full width colon', () => {
    const turns = splitPastedConversation('User: hi\nASSISTANT：hello there');
    expect(turns).toEqual([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hello there' },
    ]);
  });

  it('parses ChatGPT SSR-fallback style prefixes (你说：/ChatGPT 说：)', () => {
    const turns = splitPastedConversation('你说：1\nChatGPT 说：What does “1” refer to?');
    expect(turns).toEqual([
      { role: 'user', text: '1' },
      { role: 'assistant', text: 'What does “1” refer to?' },
    ]);
  });

  it('parses AI说-style prefixes too', () => {
    const turns = splitPastedConversation('用户说：问题\nAI说：答案');
    expect(turns).toEqual([
      { role: 'user', text: '问题' },
      { role: 'assistant', text: '答案' },
    ]);
  });

  it('uses the fallback role for a leading unprefixed block', () => {
    const turns = splitPastedConversation('开场白没有前缀\n你：问题', 'assistant');
    expect(turns).toEqual([
      { role: 'assistant', text: '开场白没有前缀' },
      { role: 'user', text: '问题' },
    ]);
  });

  it('drops empty turns and trims edges', () => {
    const turns = splitPastedConversation('你：\n\nAI:  实质内容  \n');
    expect(turns).toEqual([{ role: 'assistant', text: '实质内容' }]);
  });

  it('is deterministic — same input, same output', () => {
    const text = '你：a\nAI：b\n你：c';
    expect(splitPastedConversation(text)).toEqual(splitPastedConversation(text));
  });
});
