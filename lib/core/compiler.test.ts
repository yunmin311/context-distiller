import { describe, it, expect } from 'vitest';
import { compile, compileMessage } from './compiler';
import {
  BASE_TASK_PROMPT,
  EXTRA_PRESETS,
  getPreset,
  ALL_PRESETS,
} from './presets';
import type { Fragment, FragmentGroup, PresetOption, PromptSelections } from './types';

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

describe('compileMessage', () => {
  it('always starts with the base task instruction', () => {
    const text = compileMessage([], EMPTY_SELECTIONS);
    expect(text.startsWith(BASE_TASK_PROMPT)).toBe(true);
  });

  it('with no selections and no material, emits only the base instruction', () => {
    const text = compileMessage([], EMPTY_SELECTIONS);
    expect(text).toBe(BASE_TASK_PROMPT);
  });

  it('is deterministic — identical input yields identical output', () => {
    const groups = [
      group('框架', 0, [frag('结论 A'), frag('结论 B')]),
      group('关键语句', 1, [frag('原句 X', { role: 'user' })]),
    ];
    const selections: PromptSelections = {
      intent: 'intent.dense-notes',
      density: 'density.high',
      writingStyle: 'style.professional',
      responseStructure: 'structure.paragraphs',
      outputFormat: 'format.markdown',
      extras: ['extra.no-new-claims', 'extra.keep-key-sentences'],
    };
    const a = compileMessage(groups, selections);
    const b = compileMessage(
      structuredClone(groups),
      structuredClone(selections),
    );
    expect(a).toBe(b);
  });

  it('emits single-select prompts in the fixed order intent→density→style→structure→format', () => {
    const text = compileMessage([], {
      intent: 'intent.study',
      density: 'density.low',
      writingStyle: 'style.academic',
      responseStructure: 'structure.outline',
      outputFormat: 'format.html',
      extras: [],
    });
    const iIntent = text.indexOf(getPreset('intent.study')!.text);
    const iDensity = text.indexOf(getPreset('density.low')!.text);
    const iStyle = text.indexOf(getPreset('style.academic')!.text);
    const iStructure = text.indexOf(getPreset('structure.outline')!.text);
    const iFormat = text.indexOf(getPreset('format.html')!.text);
    expect(iIntent).toBeGreaterThan(-1);
    expect(iIntent).toBeLessThan(iDensity);
    expect(iDensity).toBeLessThan(iStyle);
    expect(iStyle).toBeLessThan(iStructure);
    expect(iStructure).toBeLessThan(iFormat);
  });

  it('emits extras in canonical library order regardless of click order', () => {
    const canonical = compileMessage([], {
      ...EMPTY_SELECTIONS,
      extras: EXTRA_PRESETS.map((p) => p.id),
    });
    const reversed = compileMessage([], {
      ...EMPTY_SELECTIONS,
      extras: [...EXTRA_PRESETS].reverse().map((p) => p.id),
    });
    expect(reversed).toBe(canonical);

    // And they actually appear in the library order.
    const positions = EXTRA_PRESETS.map((p) => canonical.indexOf(p.text));
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
  });

  it('appends custom requirements after built-in extras, in stable order', () => {
    const custom: PresetOption[] = [
      { id: 'extra.custom.a', name: '甲', group: 'extras', version: 1, text: '自定义要求甲。', custom: true },
      { id: 'extra.custom.b', name: '乙', group: 'extras', version: 1, text: '自定义要求乙。', custom: true },
    ];
    // Click order deliberately scrambled — output must not depend on it.
    const selections: PromptSelections = {
      ...EMPTY_SELECTIONS,
      extras: ['extra.custom.b', 'extra.no-new-claims', 'extra.custom.a'],
    };
    const text = compileMessage([], selections, { customExtras: custom });
    const iBuiltin = text.indexOf(getPreset('extra.no-new-claims')!.text);
    const iA = text.indexOf('自定义要求甲。');
    const iB = text.indexOf('自定义要求乙。');
    expect(iBuiltin).toBeGreaterThan(-1);
    expect(iBuiltin).toBeLessThan(iA); // built-ins before customs
    expect(iA).toBeLessThan(iB); // customs in their array order, not click order
  });

  it('places all prompts before any user material', () => {
    const groups = [group('正文内容', 0, [frag('材料一')])];
    const text = compileMessage(groups, {
      ...EMPTY_SELECTIONS,
      intent: 'intent.handoff',
    });
    expect(text.indexOf(getPreset('intent.handoff')!.text)).toBeLessThan(
      text.indexOf('【正文内容】'),
    );
  });

  it('renders groups sorted by order, then fragments in array order', () => {
    const groups = [
      group('B组', 1, [frag('b1'), frag('b2')]),
      group('A组', 0, [frag('a1')]),
    ];
    const text = compileMessage(groups, EMPTY_SELECTIONS);
    expect(text.indexOf('【A组】')).toBeLessThan(text.indexOf('【B组】'));
    expect(text.indexOf('a1')).toBeLessThan(text.indexOf('b1'));
    expect(text.indexOf('b1')).toBeLessThan(text.indexOf('b2'));
  });

  it('omits empty groups by default, includes them when asked', () => {
    const groups = [
      group('框架', 0, []),
      group('正文内容', 1, [frag('有内容')]),
    ];
    expect(compileMessage(groups, EMPTY_SELECTIONS)).not.toContain('【框架】');
    expect(
      compileMessage(groups, EMPTY_SELECTIONS, { includeEmptyGroups: true }),
    ).toContain('【框架】');
  });

  it('appends a fragment note as a 备注 line', () => {
    const groups = [group('复盘', 0, [frag('决定用 WXT', { note: '因为 HMR 好' })])];
    const text = compileMessage(groups, EMPTY_SELECTIONS);
    expect(text).toContain('决定用 WXT\n（备注：因为 HMR 好）');
  });

  it('passes special characters and code through unchanged (no escaping/rewrite)', () => {
    const raw = '```ts\nconst a = `x` + [1,2] & <b>;\n```';
    const groups = [group('关键语句', 0, [frag(raw)])];
    const text = compileMessage(groups, EMPTY_SELECTIONS);
    expect(text).toContain(raw);
  });

  it('ignores unknown preset ids without throwing', () => {
    const text = compileMessage([], {
      intent: 'intent.does-not-exist',
      density: '',
      writingStyle: '',
      responseStructure: '',
      outputFormat: '',
      extras: ['extra.also-fake'],
    });
    expect(text).toBe(BASE_TASK_PROMPT);
  });
});

describe('reading marks (读时标记) → 【标记】 section', () => {
  it('compiles marks into a 【标记】 section, in message order, with notes', () => {
    const result = compile([], EMPTY_SELECTIONS, {
      marks: [
        { text: '第二条被标记', order: 5 },
        { text: '第一条被标记', note: '关键决定点', order: 1 },
      ],
    });
    expect(result.text).toContain('【标记】');
    // ordered by `order`, not array order
    expect(result.text.indexOf('第一条被标记')).toBeLessThan(
      result.text.indexOf('第二条被标记'),
    );
    // a note renders exactly like a fragment note
    expect(result.text).toContain('第一条被标记\n（备注：关键决定点）');
    // marks count as compiled blocks
    expect(result.fragmentCount).toBe(2);
  });

  it('places the 【标记】 section after grouped material', () => {
    const groups = [group('正文内容', 0, [frag('普通材料')])];
    const text = compileMessage(groups, EMPTY_SELECTIONS, {
      marks: [{ text: '标记内容', order: 0 }],
    });
    expect(text.indexOf('【正文内容】')).toBeLessThan(text.indexOf('【标记】'));
  });

  it('emits no 【标记】 section when there are no marks', () => {
    expect(compileMessage([], EMPTY_SELECTIONS, { marks: [] })).toBe(BASE_TASK_PROMPT);
    expect(compileMessage([], EMPTY_SELECTIONS)).toBe(BASE_TASK_PROMPT);
  });
});

describe('compile (metadata)', () => {
  it('reports charCount by code points and counts fragments + used presets', () => {
    const groups = [group('框架', 0, [frag('一二三'), frag('四五')])];
    const result = compile(groups, {
      ...EMPTY_SELECTIONS,
      intent: 'intent.study',
      extras: ['extra.no-new-claims'],
    });
    expect(result.charCount).toBe([...result.text].length);
    expect(result.fragmentCount).toBe(2);
    expect(result.usedPresetIds).toEqual(['intent.study', 'extra.no-new-claims']);
  });
});

describe('preset library integrity', () => {
  it('has globally unique preset ids', () => {
    const ids = ALL_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every preset declares the group it belongs to and a version', () => {
    for (const p of ALL_PRESETS) {
      expect(p.text.length).toBeGreaterThan(0);
      expect(p.version).toBeGreaterThanOrEqual(1);
      expect([
        'intent',
        'density',
        'writingStyle',
        'responseStructure',
        'outputFormat',
        'extras',
      ]).toContain(p.group);
    }
  });
});
