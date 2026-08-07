import type { FragmentGroup, PresetOption, PromptSelections } from './types';
import { BASE_TASK_PROMPT, EXTRA_PRESETS, getPreset } from './presets';

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
}

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

  // --- 1..5: base instruction + single-select prompts -------------------
  const instructionLines: string[] = [BASE_TASK_PROMPT];

  for (const key of SINGLE_SELECT_ORDER) {
    const preset = getPreset(selections[key]);
    if (preset) {
      instructionLines.push(preset.text);
      usedPresetIds.push(preset.id);
    }
  }

  // --- 6: extras, always emitted in canonical order (built-ins, then customs)
  const selectedExtras = new Set(selections.extras ?? []);
  const allExtras = [...EXTRA_PRESETS, ...(options.customExtras ?? [])];
  for (const preset of allExtras) {
    if (selectedExtras.has(preset.id)) {
      instructionLines.push(preset.text);
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

    const header = `【${group.title}】`;
    const fragmentBlocks = fragments.map((fragment) => {
      fragmentCount += 1;
      const body = fragment.text.trimEnd(); // drop trailing whitespace (was /\s+$/)
      const note = fragment.note?.trim();
      return note ? `${body}\n（备注：${note}）` : body;
    });

    groupBlocks.push(
      fragmentBlocks.length > 0 ? `${header}\n${fragmentBlocks.join('\n\n')}` : header,
    );
  }

  const sections = [instructionBlock];
  if (groupBlocks.length > 0) {
    sections.push(groupBlocks.join('\n\n'));
  }

  const text = sections.join('\n\n');
  return {
    text,
    charCount: [...text].length,
    usedPresetIds,
    fragmentCount,
  };
}
