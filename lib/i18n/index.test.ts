import { describe, expect, it } from 'vitest';
import { STRINGS, isUIKey, resolveLang, t } from './index';
import { ALL_PRESETS, PRESET_GROUPS, baseTaskPrompt, presetName, presetText } from '../core/presets';
import { PROMPT_LIBRARY, categoryLabel, entryName, entryText } from '../core/prompt-library';

/**
 * These are parity tests, not translation-quality tests. Their whole job is to
 * make a MISSING or FORGOTTEN English string fail the build rather than ship as
 * a Chinese label sitting in an English panel.
 */

/** English strings that legitimately contain Chinese characters. */
const CJK_ALLOWED_IN_EN = new Set(['top.langTip']);
const CJK = /[一-鿿　-〿＀-￯]/;

describe('UI string table', () => {
  it('has the same keys in both languages', () => {
    expect(Object.keys(STRINGS.en).sort()).toEqual(Object.keys(STRINGS.zh).sort());
  });

  it('has no empty string in either language', () => {
    for (const lang of ['zh', 'en'] as const) {
      for (const [key, value] of Object.entries(STRINGS[lang])) {
        expect(value.trim(), `${lang}.${key} is empty`).not.toBe('');
      }
    }
  });

  it('leaves no Chinese text in the English table', () => {
    for (const [key, value] of Object.entries(STRINGS.en)) {
      if (CJK_ALLOWED_IN_EN.has(key)) continue;
      expect(CJK.test(value), `en.${key} still contains Chinese: ${value}`).toBe(false);
    }
  });

  it('keeps the same placeholders in both languages', () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(STRINGS.zh) as Array<keyof typeof STRINGS.zh>) {
      expect(names(STRINGS.en[key]), `placeholders differ for ${key}`).toEqual(
        names(STRINGS.zh[key]),
      );
    }
  });
});

describe('t()', () => {
  it('interpolates named placeholders', () => {
    expect(t('en', 'toast.read', { count: 12 })).toBe('Read 12 messages');
    expect(t('zh', 'toast.read', { count: 12 })).toBe('已读取 12 条消息');
  });

  it('leaves an unknown placeholder visible instead of printing undefined', () => {
    expect(t('en', 'toast.added', {})).toContain('{group}');
  });

  it('returns the template untouched when no vars are passed', () => {
    expect(t('en', 'footer.copy')).toBe('Copy');
  });
});

describe('isUIKey()', () => {
  it('recognizes error codes that travel across the messaging hops', () => {
    expect(isUIKey('err.noMessages')).toBe(true);
    expect(isUIKey('err.notARealCode')).toBe(false);
  });
});

describe('resolveLang()', () => {
  it('honours an explicit preference regardless of the browser', () => {
    expect(resolveLang('zh', 'en-US')).toBe('zh');
    expect(resolveLang('en', 'zh-CN')).toBe('en');
  });

  it('follows the browser UI language when set to auto', () => {
    expect(resolveLang('auto', 'zh-CN')).toBe('zh');
    expect(resolveLang('auto', 'zh')).toBe('zh');
    expect(resolveLang('auto', 'en-GB')).toBe('en');
  });

  it('falls back to English for an unknown or missing locale', () => {
    expect(resolveLang('auto', '')).toBe('en');
    expect(resolveLang(undefined, undefined)).toBe('en');
    expect(resolveLang('auto', 'fr-FR')).toBe('en');
  });
});

describe('preset library is fully bilingual', () => {
  it('gives every built-in preset an English name, hint and text', () => {
    for (const preset of ALL_PRESETS) {
      expect(preset.nameEn, `${preset.id} has no nameEn`).toBeTruthy();
      expect(preset.textEn, `${preset.id} has no textEn`).toBeTruthy();
      if (preset.hint) expect(preset.hintEn, `${preset.id} has no hintEn`).toBeTruthy();
      expect(CJK.test(preset.textEn!), `${preset.id} textEn contains Chinese`).toBe(false);
    }
  });

  it('gives every preset category an English label', () => {
    for (const group of PRESET_GROUPS) {
      expect(group.labelEn, `${group.id} has no labelEn`).toBeTruthy();
      expect(CJK.test(group.labelEn)).toBe(false);
    }
  });

  it('resolves name and text per language', () => {
    const quick = ALL_PRESETS.find((p) => p.id === 'intent.quick-review')!;
    expect(presetName(quick, 'zh')).toBe('快速回顾');
    expect(presetName(quick, 'en')).toBe('Quick recap');
    expect(presetText(quick, 'en')).not.toBe(presetText(quick, 'zh'));
  });

  it('compiles a user’s own requirement verbatim in either language', () => {
    const custom = {
      id: 'ex-1',
      name: '我的要求',
      group: 'extras' as const,
      version: 1,
      text: '保持我写的原样',
      custom: true,
    };
    expect(presetText(custom, 'en')).toBe('保持我写的原样');
    expect(presetText(custom, 'zh')).toBe('保持我写的原样');
  });

  it('has a distinct base instruction per language', () => {
    expect(baseTaskPrompt('zh')).not.toBe(baseTaskPrompt('en'));
    expect(CJK.test(baseTaskPrompt('en'))).toBe(false);
  });
});

describe('prompt library is fully bilingual', () => {
  it('gives every entry an English name and text', () => {
    for (const entry of PROMPT_LIBRARY) {
      expect(entry.nameEn, `${entry.id} has no nameEn`).toBeTruthy();
      expect(entry.textEn, `${entry.id} has no textEn`).toBeTruthy();
      expect(CJK.test(entry.textEn), `${entry.id} textEn contains Chinese`).toBe(false);
    }
  });

  it('resolves entry name, text and category per language', () => {
    const entry = PROMPT_LIBRARY.find((e) => e.id === 'lib-five-sentence')!;
    expect(entryName(entry, 'zh')).toBe('五句话总结');
    expect(entryName(entry, 'en')).toBe('Five-sentence summary');
    expect(entryText(entry, 'en')).not.toBe(entryText(entry, 'zh'));
    expect(categoryLabel('summarize', 'zh')).toBe('总结提炼');
    expect(categoryLabel('summarize', 'en')).toBe('Summarize');
  });
});
