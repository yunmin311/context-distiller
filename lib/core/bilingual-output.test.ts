import { describe, expect, it } from 'vitest';
import { compile, compileMessage } from './compiler';
import { BASE_TASK_PROMPT_EN, ALL_PRESETS, EXTRA_PRESETS, getPreset } from './presets';
import type { Fragment, FragmentGroup, PresetOption, PromptSelections } from './types';

/**
 * End-to-end bilingual compilation tests. The parity tests in lib/i18n pin the
 * STRING TABLES; these pin what actually ships to an AI: a fully-selected
 * English compile must contain no Chinese anywhere except the user's own words,
 * and both languages must compile the same material to the same structure.
 */

const CJK = /[一-鿿　-〿＀-￯]/;

function frag(text: string, over: Partial<Fragment> = {}): Fragment {
  return {
    id: over.id ?? `f_${text.slice(0, 6)}`,
    role: over.role ?? 'assistant',
    text,
    sourceOrder: over.sourceOrder ?? 0,
    note: over.note,
    messageId: over.messageId,
  };
}

function group(title: string, order: number, fragments: Fragment[]): FragmentGroup {
  return { id: `g_${title}`, title, order, fragments };
}

const EMPTY_SELECTIONS: PromptSelections = {
  intent: '',
  density: '',
  writingStyle: '',
  responseStructure: '',
  outputFormat: '',
  extras: [],
};

/** Every single-select slot filled + every built-in extra ticked. */
const FULL_SELECTIONS: PromptSelections = {
  intent: 'intent.study',
  density: 'density.high',
  writingStyle: 'style.professional',
  responseStructure: 'structure.paragraphs',
  outputFormat: 'format.markdown',
  extras: EXTRA_PRESETS.map((p) => p.id),
};

describe('bilingual compile — English output purity', () => {
  it('with EVERY preset selected and English-only material, emits zero Chinese', () => {
    const groups = [
      group('Frame', 0, [frag('Conclusion one.'), frag('Conclusion two.')]),
      group('Key sentences', 1, [frag('A quoted line.', { role: 'user' })]),
    ];
    const en = compileMessage(groups, FULL_SELECTIONS, {
      lang: 'en',
      marks: [{ text: 'A marked turn.', note: 'why', order: 2 }],
      customExtras: [
        {
          id: 'ex_en',
          name: 'Mine',
          group: 'extras',
          version: 1,
          text: 'Answer in plain sentences.',
          custom: true,
        },
      ],
    });
    expect(CJK.test(en), `Chinese leaked into the English compile:\n${en}`).toBe(false);
  });

  it('contains every selected built-in preset in its ENGLISH wording', () => {
    const en = compileMessage([], FULL_SELECTIONS, { lang: 'en' });
    for (const preset of ALL_PRESETS) {
      const selected =
        FULL_SELECTIONS.extras.includes(preset.id) ||
        Object.entries({
          intent: FULL_SELECTIONS.intent,
          density: FULL_SELECTIONS.density,
          writingStyle: FULL_SELECTIONS.writingStyle,
          responseStructure: FULL_SELECTIONS.responseStructure,
          outputFormat: FULL_SELECTIONS.outputFormat,
        }).some(([, id]) => id === preset.id);
      if (!selected) continue;
      expect(en).toContain(preset.textEn!);
      expect(en).not.toContain(preset.text);
    }
  });

  it('translates its own chrome but never the user’s words', () => {
    const custom: PresetOption = {
      id: 'ex_zh',
      name: '中文要求',
      group: 'extras',
      version: 1,
      text: '必须保留我的中文原话',
      custom: true,
    };
    const selections: PromptSelections = {
      ...EMPTY_SELECTIONS,
      intent: 'intent.study',
      extras: ['ex_zh'],
    };
    const en = compile(
      [group('Body', 0, [frag('用户材料原句。', { note: '中文备注' })])],
      selections,
      {
        lang: 'en',
        customExtras: [custom],
        marks: [{ text: '被标记的中文消息', note: '标记备注', order: 0 }],
      },
    );
    // Chrome is English…
    expect(en.text.startsWith(BASE_TASK_PROMPT_EN)).toBe(true);
    expect(en.text).toContain('[Body]');
    expect(en.text).toContain('(note: ');
    expect(en.text).toContain(getPreset('intent.study')!.textEn!);
    expect(en.text).not.toContain('【');
    expect(en.text).not.toContain('（备注：');
    // …and every piece the user wrote survives verbatim.
    expect(en.text).toContain('用户材料原句。');
    expect(en.text).toContain('(note: 中文备注)');
    expect(en.text).toContain('必须保留我的中文原话');
    expect(en.text).toContain('被标记的中文消息');
    expect(en.text).toContain('(note: 标记备注)');
  });

  it('compiles identical material structure in both languages', () => {
    const zhGroups = [
      group('框架', 0, [frag('甲'), frag('乙')]),
      group('正文内容', 1, [frag('丙', { role: 'user' })]),
    ];
    const enGroups = [
      group('Frame', 0, [frag('甲'), frag('乙')]),
      group('Body', 1, [frag('丙', { role: 'user' })]),
    ];
    const zh = compile(zhGroups, FULL_SELECTIONS);
    const en = compile(enGroups, FULL_SELECTIONS, { lang: 'en' });
    expect(en.usedPresetIds).toEqual(zh.usedPresetIds);
    expect(en.fragmentCount).toBe(zh.fragmentCount);
    // Same number of sections/headers either way.
    expect(en.text.match(/\]/g)?.length ?? 0).toBeGreaterThanOrEqual(
      zh.text.match(/】/g)?.length ?? 0,
    );
  });
});
