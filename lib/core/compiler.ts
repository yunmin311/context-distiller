import type { Lang } from '../i18n';
import type { FragmentGroup, PresetOption, PromptSelections } from './types';
import { EXTRA_PRESETS, baseTaskPrompt, getPreset, presetText } from './presets';

/**
 * The Prompt Compiler.
 *
 * A pure, deterministic, local string builder. Given the same fragments, module
 * order and button selections it MUST return exactly the same text. It never
 * reads the DOM, never calls an AI, never rewrites user material and never
 * judges the content — it only concatenates preset Prompt fragments and the
 * user's material in a fixed order.
 *
 * Fixed compile order (see 计划书 §7.2):
 *   1. Base task instruction
 *   2. Output-purpose (intent) prompt
 *   3. Knowledge-density prompt
 *   4. Writing-style prompt
 *   5. Output-structure prompt
 *   6. Output-format (markup) prompt
 *   7. Additional-requirement prompts (built-ins, then customs)
 *   8. User material (by group order, then fragment order)
 *   9. Marked messages (读时标记) → their own 【标记】 section
 */

export interface CompileOptions {
  /** Emit `【title】` headers for groups that contain no fragments. Default: false. */
  includeEmptyGroups?: boolean;
  /**
   * User-defined requirements, appended after the built-in extras in their own
   * stable array order. They compile exactly like built-in extras — the plugin
   * still does no AI rewriting; it just concatenates the user's own text.
   */
  customExtras?: PresetOption[];
  /**
   * Reading marks (读时标记) to compile into their own 【标记】 section, after the
   * grouped material. Each is a whole marked message plus its optional note.
   */
  marks?: Array<{ text: string; note?: string; order: number }>;
  /**
   * Language of the compiled message. Selects the preset wording (`textEn`), the
   * base instruction, the note wrapper and the section brackets. Default `zh`,
   * so an existing caller that passes no options is unaffected. Determinism is
   * per-language: same input + same lang → same output, always.
   */
  lang?: Lang;
}

/** Punctuation and wrappers that differ between the two compiled languages. */
const FORMAT: Record<Lang, { open: string; close: string; marks: string; note: (n: string) => string }> = {
  zh: {
    open: '【',
    close: '】',
    marks: '标记',
    note: (n) => `（备注：${n}）`,
  },
  en: {
    open: '[',
    close: ']',
    marks: 'Marks',
    note: (n) => `(note: ${n})`,
  },
};

export interface CompileResult {
  /** The full plain-text message. */
  text: string;
  /** Character count (code points — a CJK character counts as 1). */
  charCount: number;
  /** Ids of the presets actually applied, in compile order. */
  usedPresetIds: string[];
  /** Total number of fragments included in the material section. */
  fragmentCount: number;
}

const SINGLE_SELECT_ORDER: Array<keyof Pick<
  PromptSelections,
  'intent' | 'density' | 'writingStyle' | 'responseStructure' | 'outputFormat'
>> = ['intent', 'density', 'writingStyle', 'responseStructure', 'outputFormat'];

/** Convenience wrapper returning only the compiled string. */
export function compileMessage(
  groups: FragmentGroup[],
  selections: PromptSelections,
  options: CompileOptions = {},
): string {
  return compile(groups, selections, options).text;
}

/** Compile and return the text plus useful metadata for the preview UI. */
export function compile(
  groups: FragmentGroup[],
  selections: PromptSelections,
  options: CompileOptions = {},
): CompileResult {
  const usedPresetIds: string[] = [];
  const lang: Lang = options.lang ?? 'zh';
  const fmt = FORMAT[lang];

  // --- 1..5: base instruction + single-select prompts -------------------
  const instructionLines: string[] = [baseTaskPrompt(lang)];

  for (const key of SINGLE_SELECT_ORDER) {
    const preset = getPreset(selections[key]);
    if (preset) {
      instructionLines.push(presetText(preset, lang));
      usedPresetIds.push(preset.id);
    }
  }

  // --- 6: extras, always emitted in canonical order (built-ins, then customs)
  const selectedExtras = new Set(selections.extras ?? []);
  const allExtras = [...EXTRA_PRESETS, ...(options.customExtras ?? [])];
  for (const preset of allExtras) {
    if (selectedExtras.has(preset.id)) {
      // A user's own requirement has no English twin — `presetText` falls back to
      // what they wrote, so the extension never translates the user's words.
      instructionLines.push(presetText(preset, lang));
      usedPresetIds.push(preset.id);
    }
  }

  const instructionBlock = instructionLines.join('\n');

  // --- 7: user material -------------------------------------------------
  const includeEmptyGroups = options.includeEmptyGroups ?? false;
  const orderedGroups = [...groups].sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  );

  const groupBlocks: string[] = [];
  let fragmentCount = 0;

  for (const group of orderedGroups) {
    const fragments = group.fragments ?? [];
    if (fragments.length === 0 && !includeEmptyGroups) continue;

    const header = `${fmt.open}${group.title}${fmt.close}`;
    const fragmentBlocks = fragments.map((fragment) => {
      fragmentCount += 1;
      const body = fragment.text.trimEnd(); // drop trailing whitespace (was /\s+$/)
      const note = fragment.note?.trim();
      return note ? `${body}\n${fmt.note(note)}` : body;
    });

    groupBlocks.push(
      fragmentBlocks.length > 0 ? `${header}\n${fragmentBlocks.join('\n\n')}` : header,
    );
  }

  // --- 8: marked messages (读时标记) — their own section, message order ----
  const marks = [...(options.marks ?? [])].sort((a, b) => a.order - b.order);
  const markBlocks = marks.map((mk) => {
    fragmentCount += 1;
    const body = mk.text.trimEnd();
    const note = mk.note?.trim();
    return note ? `${body}\n${fmt.note(note)}` : body;
  });

  const sections = [instructionBlock];
  if (groupBlocks.length > 0) {
    sections.push(groupBlocks.join('\n\n'));
  }
  if (markBlocks.length > 0) {
    sections.push(`${fmt.open}${fmt.marks}${fmt.close}\n${markBlocks.join('\n\n')}`);
  }

  const text = sections.join('\n\n');
  return {
    text,
    charCount: [...text].length,
    usedPresetIds,
    fragmentCount,
  };
}
