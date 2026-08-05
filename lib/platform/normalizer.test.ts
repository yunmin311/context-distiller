import { describe, it, expect } from 'vitest';
import { normalizeMessages, coerceRole } from './normalizer';
import type { RawMessage } from './adapter';

function raw(role: string, text: string, id?: string): RawMessage {
  return { role, text, id, source: 'dom' };
}

describe('coerceRole', () => {
  it('maps known roles onto the closed set', () => {
    expect(coerceRole('user')).toBe('user');
    expect(coerceRole('Human')).toBe('user');
    expect(coerceRole('assistant')).toBe('assistant');
    expect(coerceRole('GPT')).toBe('assistant');
    expect(coerceRole('system')).toBe('system');
  });

  it('drops unknown / internal roles', () => {
    expect(coerceRole('tool')).toBeNull();
    expect(coerceRole('')).toBeNull();
  });
});

describe('normalizeMessages', () => {
  it('assigns ascending order and preserves sequence', () => {
    const out = normalizeMessages([
      raw('user', '问题一', 'a'),
      raw('assistant', '回答一', 'b'),
      raw('user', '问题二', 'c'),
    ]);
    expect(out.map((m) => m.order)).toEqual([0, 1, 2]);
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('drops empty and whitespace-only messages', () => {
    const out = normalizeMessages([raw('user', '   '), raw('assistant', '有内容')]);
    expect(out).toHaveLength(1);
    expect(out[0]!.text).toBe('有内容');
  });

  it('dedupes by platform id', () => {
    const out = normalizeMessages([
      raw('user', '第一次', 'dup'),
      raw('user', '重复挂载', 'dup'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.text).toBe('第一次');
  });

  it('drops tool/unknown roles but keeps user + assistant', () => {
    const out = normalizeMessages([
      raw('tool', '内部调用'),
      raw('user', '保留我'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.role).toBe('user');
  });

  it('synthesizes an id when the platform gives none', () => {
    const out = normalizeMessages([raw('assistant', '无 id 消息')]);
    expect(out[0]!.id).toBe('msg_0');
  });
});
