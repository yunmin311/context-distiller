import { describe, it, expect } from 'vitest';
import { plainify } from './plainify';

describe('plainify', () => {
  it('strips heading, bold, blockquote and bullet markers', () => {
    const md = '## RAG 是什么?\n\n**RAG** 就是先检索再生成。\n\n> 用户提问 → 模型回答\n\n- 第一点\n- 第二点';
    const out = plainify(md);
    expect(out).not.toContain('##');
    expect(out).not.toContain('**');
    expect(out).not.toMatch(/^>/m);
    expect(out).toContain('RAG 是什么?');
    expect(out).toContain('RAG 就是先检索再生成。');
    expect(out).toContain('用户提问 → 模型回答');
    expect(out).toContain('• 第一点');
  });

  it('unwraps links and inline code, drops code fences', () => {
    const md = '见 [文档](https://x.y) 里的 `useState`。\n```ts\nconst a = 1;\n```';
    const out = plainify(md);
    expect(out).toContain('见 文档 里的 useState。');
    expect(out).not.toContain('```');
    expect(out).toContain('const a = 1;');
  });

  it('leaves plain text untouched and handles empty input', () => {
    expect(plainify('普通一句话。')).toBe('普通一句话。');
    expect(plainify('')).toBe('');
  });
});
