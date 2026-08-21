import type { Lang } from '../i18n';
import type { PresetGroupId, PresetOption } from './types';

/**
 * The preset Prompt library.
 *
 * Every button in the Side Panel maps to exactly one preset id here. The plugin
 * never generates or rewrites these texts at runtime — they are authored,
 * hand-tested and versioned by the developer. The compiler simply looks them up
 * by id and concatenates them in a fixed order. See lib/core/compiler.ts.
 *
 * Categories are kept small (≤6 single-select options ≈ 2 grid rows) so the
 * panel stays light. The additional-requirements group is the extensible one:
 * it also hosts user-defined custom requirements at runtime.
 *
 * BILINGUAL: each preset carries `nameEn` / `hintEn` / `textEn`. The English
 * `textEn` is an authored English prompt, not a machine translation of the
 * Chinese — the compiled message must read natively in whichever language the
 * user picked. Ids and compile order are shared, so switching language never
 * changes WHICH presets apply, only how they are worded.
 */

export const PRESET_LIBRARY_VERSION = 5;

/**
 * Step 1 of every compiled message: state that the material was hand-selected
 * by the user and ask for output that reads independently of the original chat.
 */
export const BASE_TASK_PROMPT =
  '请根据下方由用户主动筛选并整理的 AI 对话片段生成最终内容。' +
  '这些材料已由用户手动挑选，请只依据这些材料进行整理，不要引入材料之外的内容，' +
  '并生成可以脱离原始对话、独立阅读的结果。';

export const BASE_TASK_PROMPT_EN =
  'Produce the final piece from the AI-conversation excerpts below, which the user selected and organized by hand. ' +
  'Work only from this material — do not bring in anything beyond it — and write a result that reads on its own, ' +
  'without the reader needing the original conversation.';

/** The base instruction in the requested language. */
export function baseTaskPrompt(lang: Lang): string {
  return lang === 'en' ? BASE_TASK_PROMPT_EN : BASE_TASK_PROMPT;
}

/** Display name in the requested language (falls back to Chinese). */
export function presetName(option: PresetOption, lang: Lang): string {
  return lang === 'en' ? option.nameEn ?? option.name : option.name;
}

/** One-line hint in the requested language (may be undefined). */
export function presetHint(option: PresetOption, lang: Lang): string | undefined {
  return lang === 'en' ? option.hintEn ?? option.hint : option.hint;
}

/**
 * The Prompt fragment that actually compiles into the message. A user's own
 * custom requirement has no `textEn`, so it compiles verbatim in either
 * language — the extension never translates what the user wrote.
 */
export function presetText(option: PresetOption, lang: Lang): string {
  return lang === 'en' ? option.textEn ?? option.text : option.text;
}

/**
 * 输出用途（单选）——本次要生成的东西是什么。
 * 收敛为「整理长对话」最常见的六种成品：概要、笔记、学习稿、行动清单、续接上下文、成文初稿。
 */
export const INTENT_PRESETS: PresetOption[] = [
  {
    id: 'intent.quick-review',
    name: '快速回顾',
    nameEn: 'Quick recap',
    group: 'intent',
    version: 1,
    hint: '简洁重述要点，方便快速回忆',
    hintEn: 'Restate the points briefly, to jog the memory',
    text: '本次输出用途是快速回顾：用简洁的方式重述讨论要点，帮助用户在短时间内回忆本次对话的核心内容，不需要展开细节。',
    textEn:
      'The purpose of this output is a quick recap: restate the points of the discussion concisely so the reader can recall the core of this conversation in a short time. Do not expand into details.',
  },
  {
    id: 'intent.dense-notes',
    name: '高密度笔记',
    nameEn: 'Dense notes',
    group: 'intent',
    version: 1,
    hint: '信息密集、可长期查阅',
    hintEn: 'Information-dense, worth keeping for reference',
    text: '本次输出用途是高密度笔记：整理为信息密集、可长期查阅的笔记，去除对话性冗余，保留可复用的结论与依据。',
    textEn:
      'The purpose of this output is a set of dense notes: information-rich and worth keeping for long-term reference. Strip the conversational padding and keep the reusable conclusions together with the evidence behind them.',
  },
  {
    id: 'intent.study',
    name: '学习版本',
    nameEn: 'Study version',
    group: 'intent',
    version: 1,
    hint: '突出定义、步骤、示例、误区',
    hintEn: 'Surfaces definitions, steps, examples, pitfalls',
    text: '本次输出用途是学习版本：面向学习者整理，突出定义、原因、步骤、示例与常见误区，便于理解、记忆与复习。',
    textEn:
      'The purpose of this output is a study version: organize it for a learner, surfacing definitions, reasons, steps, worked examples and common pitfalls, so it is easy to understand, remember and review.',
  },
  {
    id: 'intent.action-items',
    name: '行动清单',
    nameEn: 'Action items',
    group: 'intent',
    version: 1,
    hint: '提取待办、决定与下一步',
    hintEn: 'Pulls out to-dos, decisions and next steps',
    text: '本次输出用途是行动清单：从材料中提取需要执行的任务、已经做出的决定与明确的下一步，逐条列出；如材料中提到了前提、负责人或时间，请一并标出，材料中没有的不要编造。',
    textEn:
      'The purpose of this output is an action list: pull out the tasks that need doing, the decisions already made, and the explicit next steps, listed one per line. Where the material states a prerequisite, an owner or a deadline, carry it over; never invent one that is not there.',
  },
  {
    id: 'intent.handoff',
    name: '对话续接',
    nameEn: 'Hand-off',
    group: 'intent',
    version: 2,
    hint: '迁移到新对话 / 新模型的交接上下文',
    hintEn: 'Context for moving to a new chat or model',
    text:
      '本次输出用途是对话续接 / 迁移：整理成一段可以直接粘贴到新对话（也可以是换一个模型、开一个新窗口）的交接上下文，' +
      '让新对话无需看到原始对话即可继续——包含目标、已知背景、已完成内容与关键决定、当前进度，以及剩余任务 / 下一步；' +
      '只依据材料整理，不编造。',
    textEn:
      'The purpose of this output is a hand-off: write context that can be pasted straight into a new conversation (possibly with a different model, or in a fresh window) so that conversation can carry on without ever seeing the original. ' +
      'Cover the goal, the background already established, what has been done and the key decisions behind it, where things currently stand, and what remains / what to do next. ' +
      'Work only from the material; invent nothing.',
  },
  {
    id: 'intent.draft',
    name: '成文初稿',
    nameEn: 'Prose draft',
    group: 'intent',
    version: 1,
    hint: '整理成可直接阅读的文稿',
    hintEn: 'A continuous piece someone can just read',
    text: '本次输出用途是成文初稿：把材料整理成一篇可以直接阅读或发布的连续文稿，有清晰的开头、主体与结尾，读者无需看到原始对话即可理解；只依据材料整理，不额外扩写。',
    textEn:
      'The purpose of this output is a prose draft: turn the material into a continuous piece that can be read or published as-is, with a clear opening, body and close, understandable without the original conversation. Work from the material only; do not pad it out.',
  },
];

/** 知识密度（单选）——细节保留和解释深度。density.high 文本沿用计划书原文。*/
export const DENSITY_PRESETS: PresetOption[] = [
  {
    id: 'density.low',
    name: '低',
    nameEn: 'Low',
    group: 'density',
    version: 1,
    hint: '只留核心，删细节',
    hintEn: 'Core only, details dropped',
    text: '知识密度为低：保留核心结论和必要解释，减少细节、例子和延伸内容。',
    textEn:
      'Keep the knowledge density low: retain the core conclusions and the explanation they need, and cut back on details, examples and tangents.',
  },
  {
    id: 'density.medium',
    name: '中',
    nameEn: 'Medium',
    group: 'density',
    version: 1,
    hint: '结论 + 主要逻辑 + 代表性示例',
    hintEn: 'Conclusions, main reasoning, a few examples',
    text: '知识密度为中：保留核心结论、主要逻辑、必要解释和代表性示例。',
    textEn:
      'Keep the knowledge density medium: retain the core conclusions, the main line of reasoning, the necessary explanation, and representative examples.',
  },
  {
    id: 'density.high',
    name: '高',
    nameEn: 'High',
    group: 'density',
    version: 1,
    hint: '压缩重复，尽量不丢信息',
    hintEn: 'Squeeze out repetition, lose nothing',
    text: '知识密度为高：在删除重复内容的同时，尽可能保留专业术语、关键逻辑、重要条件、例外情况和必要示例。',
    textEn:
      'Keep the knowledge density high: remove repetition, but preserve as much as possible of the terminology, the key reasoning, the important conditions, the exceptions and the examples that matter.',
  },
];

/** 文风（单选）——语言专业程度与表达方式。 */
export const STYLE_PRESETS: PresetOption[] = [
  {
    id: 'style.professional',
    name: '专业直接',
    nameEn: 'Direct',
    group: 'writingStyle',
    version: 1,
    hint: '直陈要点，少过渡句',
    hintEn: 'States the point, few transitions',
    text: '语言风格为专业、直接：减少无意义的过渡句和对话性表达，直接陈述要点。',
    textEn:
      'Write in a professional, direct voice: cut filler transitions and chatty phrasing, and state the point outright.',
  },
  {
    id: 'style.readable',
    name: '自然易读',
    nameEn: 'Readable',
    group: 'writingStyle',
    version: 1,
    hint: '平实句子，降低阅读负担',
    hintEn: 'Plain sentences, easy going',
    text: '语言风格为自然、易读：使用平实、连贯的句子，在保留信息的同时降低阅读负担。',
    textEn:
      'Write in a natural, readable voice: plain, connected sentences that keep the information but ask less of the reader.',
  },
  {
    id: 'style.academic',
    name: '学术严谨',
    nameEn: 'Academic',
    group: 'writingStyle',
    version: 1,
    hint: '用词规范，谨慎下结论',
    hintEn: 'Precise wording, careful claims',
    text: '语言风格为学术、严谨：用词准确规范，谨慎下结论，必要时说明前提、范围与限定条件。',
    textEn:
      'Write in an academic, rigorous voice: precise wording, careful with conclusions, and state the premises, scope and qualifications where they matter.',
  },
  {
    id: 'style.plain',
    name: '口语通俗',
    nameEn: 'Conversational',
    group: 'writingStyle',
    version: 1,
    hint: '像聊天，少术语',
    hintEn: 'Like talking, few jargon words',
    text: '语言风格为口语、通俗：像跟人聊天一样自然，少用书面语，必要时把专业术语解释成大白话。',
    textEn:
      'Write in a conversational, everyday voice: as if talking to someone, light on formal register, and put any jargon into plain words when it comes up.',
  },
  {
    id: 'style.neutral',
    name: '中立客观',
    nameEn: 'Neutral',
    group: 'writingStyle',
    version: 1,
    hint: '只陈述，不带倾向',
    hintEn: 'States it, takes no side',
    text: '语言风格为中立、客观：只陈述事实与各方观点，不加入个人倾向、评价或情绪化措辞。',
    textEn:
      'Write in a neutral, objective voice: report the facts and each side of the argument, without personal leaning, judgement or emotive wording.',
  },
  {
    id: 'style.preserve-original',
    name: '保留原表达',
    nameEn: 'Keep original wording',
    group: 'writingStyle',
    version: 1,
    hint: '沿用原始措辞，少改写',
    hintEn: 'Reuses the source phrasing',
    text: '语言风格为保留原表达：尽量沿用材料中的原始措辞与关键句子，不做不必要的改写。',
    textEn:
      "Preserve the original wording: stay with the material's own phrasing and key sentences wherever you can, and do not rewrite for its own sake.",
  },
];

/**
 * 输出结构（单选）——最终回答的「组织形式」（段落 / 提纲 / 表格 / 问答 / 步骤）。
 * 这是内容如何组织，与「标记格式」正交——Markdown / HTML / PDF 属于「输出格式」，见下。
 */
export const STRUCTURE_PRESETS: PresetOption[] = [
  {
    id: 'structure.paragraphs',
    name: '连续段落',
    nameEn: 'Prose',
    group: 'responseStructure',
    version: 1,
    hint: '不用列表和标题',
    hintEn: 'No lists, no headings',
    text: '请以连续段落输出，不使用列表或标题，保持行文连贯。',
    textEn: 'Write in continuous paragraphs — no lists, no headings — and keep the prose flowing.',
  },
  {
    id: 'structure.outline',
    name: '结构化提纲',
    nameEn: 'Outline',
    group: 'responseStructure',
    version: 1,
    hint: '层级化要点',
    hintEn: 'Nested bullet points',
    text: '请以结构化提纲输出，用带层级的要点组织内容，突出条目之间的从属关系。',
    textEn:
      'Write it as a structured outline: organize the content into nested bullet points that make the hierarchy between items visible.',
  },
  {
    id: 'structure.bluf',
    name: '结论先行',
    nameEn: 'Conclusion first',
    group: 'responseStructure',
    version: 1,
    hint: '先给结论，再展开',
    hintEn: 'Answer up front, then the why',
    text: '请采用结论先行（BLUF）结构：开头先给出最重要的结论或结果，再展开理由、依据与细节。',
    textEn:
      'Use a bottom-line-up-front (BLUF) structure: lead with the most important conclusion or result, then unfold the reasons, the evidence and the details.',
  },
  {
    id: 'structure.tables-when-needed',
    name: '必要时表格',
    nameEn: 'Tables where useful',
    group: 'responseStructure',
    version: 1,
    hint: '适合对比处用表格',
    hintEn: 'A table where things compare',
    text: '当内容适合对比或结构化呈现时，请使用表格；其余部分保持正常排版，不需要生成任何文件。',
    textEn:
      'Use a table wherever the content is a comparison or is naturally tabular; keep the rest as normal prose. No file needs to be produced.',
  },
  {
    id: 'structure.qa',
    name: '问答形式',
    nameEn: 'Q&A',
    group: 'responseStructure',
    version: 1,
    hint: '整理成问题 + 回答',
    hintEn: 'Organized as question + answer',
    text: '请以问答（Q&A）形式输出：把内容组织成若干「问题 + 回答」，便于复习与查阅。这是对文字排版的要求，不需要生成任何文件。',
    textEn:
      'Write it as Q&A: organize the content into question-and-answer pairs so it is easy to review and look things up. This is a formatting instruction for the text; no file needs to be produced.',
  },
  {
    id: 'structure.steps',
    name: '步骤清单',
    nameEn: 'Numbered steps',
    group: 'responseStructure',
    version: 1,
    hint: '带编号、可依次执行',
    hintEn: 'Numbered, followable in order',
    text: '请以带编号的步骤清单输出，每一步单独成条、可依次执行，必要时说明每步的目的或前提。这是对文字排版的要求，不需要生成任何文件。',
    textEn:
      'Write it as a numbered list of steps, one step per item, executable in order, noting each step’s purpose or prerequisite where that matters. This is a formatting instruction for the text; no file needs to be produced.',
  },
];

/**
 * 输出格式（单选）——用什么「标记 / 文件格式」呈现。与「输出结构」正交。
 * 说明：本插件只往输入框写纯文本、不产出文件；这些选项是让 AI 用对应格式作答的指令
 * （HTML = 输出 HTML 代码；PDF = 输出便于打印 / 另存为 PDF 的排版）。
 */
export const FORMAT_PRESETS: PresetOption[] = [
  {
    id: 'format.plain',
    name: '纯文本',
    nameEn: 'Plain text',
    group: 'outputFormat',
    version: 1,
    hint: '不用任何标记语法',
    hintEn: 'No markup at all',
    text: '请以纯文本输出，不使用 Markdown、HTML 等标记语法。',
    textEn: 'Answer in plain text — no Markdown, no HTML, no markup of any kind.',
  },
  {
    id: 'format.markdown',
    name: 'Markdown',
    nameEn: 'Markdown',
    group: 'outputFormat',
    version: 1,
    hint: '标题 / 列表 / 代码块',
    hintEn: 'Headings, lists, code blocks',
    text: '请用 Markdown 语法排版（标题层级、列表、必要时代码块）。这是对文字排版的要求，不需要生成任何文件。',
    textEn:
      'Format the answer with Markdown (heading levels, lists, and code blocks where needed). This is a formatting instruction for the text; no file needs to be produced.',
  },
  {
    id: 'format.html',
    name: 'HTML',
    nameEn: 'HTML',
    group: 'outputFormat',
    version: 1,
    hint: '输出完整 HTML 代码',
    hintEn: 'A complete HTML document',
    text: '请输出为完整的 HTML 代码（含基本结构，可直接保存为 .html 文件打开）。',
    textEn:
      'Answer as complete HTML code — with the basic document structure, so it can be saved as an .html file and opened directly.',
  },
  {
    id: 'format.json',
    name: 'JSON',
    nameEn: 'JSON',
    group: 'outputFormat',
    version: 1,
    hint: '结构化、可被程序解析',
    hintEn: 'Structured, machine-parseable',
    text: '请输出为合法的 JSON：字段语义明确、结构清晰，可被程序直接解析。',
    textEn:
      'Answer as valid JSON: clearly named fields, a clean structure, ready to be parsed by a program.',
  },
  {
    id: 'format.codeblock',
    name: '代码块',
    nameEn: 'Code block',
    group: 'outputFormat',
    version: 1,
    hint: '整段用代码块包裹',
    hintEn: 'Wrapped in one code fence',
    text: '请把最终内容整体放进一个代码块（```）里，方便一次性复制。',
    textEn:
      'Put the entire final answer inside a single code block (```) so it can be copied in one go.',
  },
  {
    id: 'format.pdf',
    name: 'PDF 排版',
    nameEn: 'PDF layout',
    group: 'outputFormat',
    version: 1,
    hint: '适合打印 / 另存为 PDF',
    hintEn: 'Suits printing / save-as-PDF',
    text: '请以适合导出或打印为 PDF 的排版输出：结构清晰、分节明确、标题层级分明，便于直接打印或另存为 PDF。',
    textEn:
      'Lay the answer out for printing or exporting to PDF: a clear structure, distinct sections and well-defined heading levels, so it can be printed or saved as PDF directly.',
  },
];

/**
 * 附加要求（多选）。
 *
 * The order of this array is the canonical compile order: no matter what order
 * the user clicks these buttons, the compiler always emits them in this
 * sequence, so identical selections always produce identical output. User-added
 * custom requirements are appended after these, in their own stable order.
 */
export const EXTRA_PRESETS: PresetOption[] = [
  {
    id: 'extra.keep-key-sentences',
    name: '保留关键原句',
    nameEn: 'Keep key sentences',
    group: 'extras',
    version: 1,
    hint: '关键原句不改写',
    hintEn: 'Key sentences stay verbatim',
    text: '请保留材料中的关键原句，对这些句子不要改写或删减。',
    textEn:
      'Keep the key sentences from the material as they are — do not rewrite or trim those sentences.',
  },
  {
    id: 'extra.keep-terms',
    name: '保留术语',
    nameEn: 'Keep terminology',
    group: 'extras',
    version: 1,
    hint: '术语保留原文',
    hintEn: 'Terms stay as written',
    text: '请保留专业术语的原始表述，不要替换、翻译或简化术语。',
    textEn:
      'Keep technical terms exactly as the material words them — do not substitute, translate or simplify them.',
  },
  {
    id: 'extra.keep-examples',
    name: '保留示例',
    nameEn: 'Keep examples',
    group: 'extras',
    version: 1,
    hint: '示例与代码不省略',
    hintEn: 'Examples and code stay in',
    text: '请保留材料中的示例与代码，不要省略或概括掉它们。',
    textEn:
      'Keep the examples and code from the material — do not drop them or summarize them away.',
  },
  {
    id: 'extra.keep-open-questions',
    name: '保留未解决问题',
    nameEn: 'Keep open questions',
    group: 'extras',
    version: 1,
    hint: '悬而未决的保持原样',
    hintEn: 'Unresolved stays unresolved',
    text: '材料中未解决的问题必须保持为未解决状态，不要给出材料之外的答案。',
    textEn:
      'Anything left unresolved in the material must stay unresolved — do not supply an answer from outside it.',
  },
  {
    id: 'extra.no-new-claims',
    name: '禁止新增观点',
    nameEn: 'No new claims',
    group: 'extras',
    version: 1,
    hint: '不加材料外的观点',
    hintEn: 'Nothing beyond the material',
    text: '不得擅自加入材料中没有的新观点、结论或事实。',
    textEn:
      'Do not introduce any view, conclusion or fact that is not present in the material.',
  },
  {
    id: 'extra.flag-uncertainty',
    name: '标注不确定',
    nameEn: 'Flag uncertainty',
    group: 'extras',
    version: 1,
    hint: '存疑内容要标出来',
    hintEn: 'Mark what is in doubt',
    text: '对材料中不确定、有争议或未经验证的内容，请明确标注（例如注明“存疑”），不要当作已确认的结论输出。',
    textEn:
      'Where the material is uncertain, disputed or unverified, mark it explicitly (e.g. “unconfirmed”) rather than presenting it as settled.',
  },
  {
    id: 'extra.merge-duplicates',
    name: '合并重复',
    nameEn: 'Merge duplicates',
    group: 'extras',
    version: 1,
    hint: '重复内容合成一处',
    hintEn: 'Repeats folded into one',
    text: '请合并重复出现的内容，只保留一处完整表述，但不要因此丢失信息。',
    textEn:
      'Merge anything that appears more than once into a single complete statement — without losing information in the process.',
  },
  {
    id: 'extra.output-chinese',
    name: '用中文输出',
    nameEn: 'Answer in Chinese',
    group: 'extras',
    version: 1,
    hint: '术语 / 代码保留原文',
    hintEn: 'Terms and code stay as-is',
    text: '请用简体中文输出最终内容；材料中的专有名词、术语与代码保留原文，不做翻译。',
    textEn:
      'Write the final answer in Simplified Chinese; leave proper nouns, technical terms and code in the original, untranslated.',
  },
  {
    id: 'extra.output-english',
    name: '用英文输出',
    nameEn: 'Answer in English',
    group: 'extras',
    version: 1,
    hint: '术语 / 代码保留原文',
    hintEn: 'Terms and code stay as-is',
    text: '请用英文输出最终内容；材料中的专有名词、术语与代码保留原文，不做翻译。',
    textEn:
      'Write the final answer in English; leave proper nouns, technical terms and code in the original, untranslated.',
  },
];

/** UI metadata for rendering the bottom preset bar. */
export interface PresetGroupMeta {
  id: PresetGroupId;
  label: string;
  labelEn: string;
  mode: 'single' | 'multi';
  options: PresetOption[];
}

export const PRESET_GROUPS: PresetGroupMeta[] = [
  {
    id: 'intent',
    label: '输出用途',
    labelEn: 'Purpose',
    mode: 'single',
    options: INTENT_PRESETS,
  },
  {
    id: 'density',
    label: '知识密度',
    labelEn: 'Density',
    mode: 'single',
    options: DENSITY_PRESETS,
  },
  {
    id: 'writingStyle',
    label: '文风',
    labelEn: 'Voice',
    mode: 'single',
    options: STYLE_PRESETS,
  },
  {
    id: 'responseStructure',
    label: '输出结构',
    labelEn: 'Structure',
    mode: 'single',
    options: STRUCTURE_PRESETS,
  },
  {
    id: 'outputFormat',
    label: '输出格式',
    labelEn: 'Format',
    mode: 'single',
    options: FORMAT_PRESETS,
  },
  {
    id: 'extras',
    label: '附加要求',
    labelEn: 'Extra requirements',
    mode: 'multi',
    options: EXTRA_PRESETS,
  },
];

/** A preset category's label in the requested language. */
export function groupLabel(group: PresetGroupMeta, lang: Lang): string {
  return lang === 'en' ? group.labelEn : group.label;
}

export const ALL_PRESETS: PresetOption[] = [
  ...INTENT_PRESETS,
  ...DENSITY_PRESETS,
  ...STYLE_PRESETS,
  ...STRUCTURE_PRESETS,
  ...FORMAT_PRESETS,
  ...EXTRA_PRESETS,
];

const PRESET_BY_ID = new Map<string, PresetOption>(ALL_PRESETS.map((p) => [p.id, p]));

/** Look up a built-in preset by id. Returns undefined for unknown/custom ids. */
export function getPreset(id: string): PresetOption | undefined {
  return id ? PRESET_BY_ID.get(id) : undefined;
}
