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
 */

export const PRESET_LIBRARY_VERSION = 3;

/**
 * Step 1 of every compiled message: state that the material was hand-selected
 * by the user and ask for output that reads independently of the original chat.
 */
export const BASE_TASK_PROMPT =
  '请根据下方由用户主动筛选并整理的 AI 对话片段生成最终内容。' +
  '这些材料已由用户手动挑选，请只依据这些材料进行整理，不要引入材料之外的内容，' +
  '并生成可以脱离原始对话、独立阅读的结果。';

/**
 * 输出用途（单选）——本次要生成的东西是什么。
 * 收敛为「整理长对话」最常见的六种成品：概要、笔记、学习稿、行动清单、续接上下文、成文初稿。
 */
export const INTENT_PRESETS: PresetOption[] = [
  {
    id: 'intent.quick-review',
    name: '快速回顾',
    group: 'intent',
    version: 1,
    hint: '简洁重述要点，方便快速回忆',
    text: '本次输出用途是快速回顾：用简洁的方式重述讨论要点，帮助用户在短时间内回忆本次对话的核心内容，不需要展开细节。',
  },
  {
    id: 'intent.dense-notes',
    name: '高密度笔记',
    group: 'intent',
    version: 1,
    hint: '信息密集、可长期查阅',
    text: '本次输出用途是高密度笔记：整理为信息密集、可长期查阅的笔记，去除对话性冗余，保留可复用的结论与依据。',
  },
  {
    id: 'intent.study',
    name: '学习版本',
    group: 'intent',
    version: 1,
    hint: '突出定义、步骤、示例、误区',
    text: '本次输出用途是学习版本：面向学习者整理，突出定义、原因、步骤、示例与常见误区，便于理解、记忆与复习。',
  },
  {
    id: 'intent.action-items',
    name: '行动清单',
    group: 'intent',
    version: 1,
    hint: '提取待办、决定与下一步',
    text: '本次输出用途是行动清单：从材料中提取需要执行的任务、已经做出的决定与明确的下一步，逐条列出；如材料中提到了前提、负责人或时间，请一并标出，材料中没有的不要编造。',
  },
  {
    id: 'intent.handoff',
    name: '对话续接',
    group: 'intent',
    version: 1,
    hint: '可直接发给新对话的上下文',
    text: '本次输出用途是对话续接：整理为可以直接发送给新对话的上下文，包含目标、已知背景、已完成内容、关键决定与剩余任务。',
  },
  {
    id: 'intent.draft',
    name: '成文初稿',
    group: 'intent',
    version: 1,
    hint: '整理成可直接阅读的文稿',
    text: '本次输出用途是成文初稿：把材料整理成一篇可以直接阅读或发布的连续文稿，有清晰的开头、主体与结尾，读者无需看到原始对话即可理解；只依据材料整理，不额外扩写。',
  },
];

/** 知识密度（单选）——细节保留和解释深度。density.high 文本沿用计划书原文。 */
export const DENSITY_PRESETS: PresetOption[] = [
  {
    id: 'density.low',
    name: '低',
    group: 'density',
    version: 1,
    hint: '只留核心，删细节',
    text: '知识密度为低：保留核心结论和必要解释，减少细节、例子和延伸内容。',
  },
  {
    id: 'density.medium',
    name: '中',
    group: 'density',
    version: 1,
    hint: '结论 + 主要逻辑 + 代表性示例',
    text: '知识密度为中：保留核心结论、主要逻辑、必要解释和代表性示例。',
  },
  {
    id: 'density.high',
    name: '高',
    group: 'density',
    version: 1,
    hint: '压缩重复，尽量不丢信息',
    text: '知识密度为高：在删除重复内容的同时，尽可能保留专业术语、关键逻辑、重要条件、例外情况和必要示例。',
  },
];

/** 文风（单选）——语言专业程度与表达方式。 */
export const STYLE_PRESETS: PresetOption[] = [
  {
    id: 'style.professional',
    name: '专业直接',
    group: 'writingStyle',
    version: 1,
    hint: '直陈要点，少过渡句',
    text: '语言风格为专业、直接：减少无意义的过渡句和对话性表达，直接陈述要点。',
  },
  {
    id: 'style.readable',
    name: '自然易读',
    group: 'writingStyle',
    version: 1,
    hint: '平实句子，降低阅读负担',
    text: '语言风格为自然、易读：使用平实、连贯的句子，在保留信息的同时降低阅读负担。',
  },
  {
    id: 'style.academic',
    name: '学术严谨',
    group: 'writingStyle',
    version: 1,
    hint: '用词规范，谨慎下结论',
    text: '语言风格为学术、严谨：用词准确规范，谨慎下结论，必要时说明前提、范围与限定条件。',
  },
  {
    id: 'style.preserve-original',
    name: '保留原表达',
    group: 'writingStyle',
    version: 1,
    hint: '沿用原始措辞，少改写',
    text: '语言风格为保留原表达：尽量沿用材料中的原始措辞与关键句子，不做不必要的改写。',
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
    group: 'responseStructure',
    version: 1,
    hint: '不用列表和标题',
    text: '请以连续段落输出，不使用列表或标题，保持行文连贯。',
  },
  {
    id: 'structure.outline',
    name: '结构化提纲',
    group: 'responseStructure',
    version: 1,
    hint: '层级化要点',
    text: '请以结构化提纲输出，用带层级的要点组织内容，突出条目之间的从属关系。',
  },
  {
    id: 'structure.tables-when-needed',
    name: '必要时表格',
    group: 'responseStructure',
    version: 1,
    hint: '适合对比处用表格',
    text: '当内容适合对比或结构化呈现时，请使用表格；其余部分保持正常排版，不需要生成任何文件。',
  },
  {
    id: 'structure.qa',
    name: '问答形式',
    group: 'responseStructure',
    version: 1,
    hint: '整理成问题 + 回答',
    text: '请以问答（Q&A）形式输出：把内容组织成若干「问题 + 回答」，便于复习与查阅。这是对文字排版的要求，不需要生成任何文件。',
  },
  {
    id: 'structure.steps',
    name: '步骤清单',
    group: 'responseStructure',
    version: 1,
    hint: '带编号、可依次执行',
    text: '请以带编号的步骤清单输出，每一步单独成条、可依次执行，必要时说明每步的目的或前提。这是对文字排版的要求，不需要生成任何文件。',
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
    group: 'outputFormat',
    version: 1,
    hint: '不用任何标记语法',
    text: '请以纯文本输出，不使用 Markdown、HTML 等标记语法。',
  },
  {
    id: 'format.markdown',
    name: 'Markdown',
    group: 'outputFormat',
    version: 1,
    hint: '标题 / 列表 / 代码块',
    text: '请用 Markdown 语法排版（标题层级、列表、必要时代码块）。这是对文字排版的要求，不需要生成任何文件。',
  },
  {
    id: 'format.html',
    name: 'HTML',
    group: 'outputFormat',
    version: 1,
    hint: '输出完整 HTML 代码',
    text: '请输出为完整的 HTML 代码（含基本结构，可直接保存为 .html 文件打开）。',
  },
  {
    id: 'format.pdf',
    name: 'PDF 排版',
    group: 'outputFormat',
    version: 1,
    hint: '适合打印 / 另存为 PDF',
    text: '请以适合导出或打印为 PDF 的排版输出：结构清晰、分节明确、标题层级分明，便于直接打印或另存为 PDF。',
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
    group: 'extras',
    version: 1,
    hint: '关键原句不改写',
    text: '请保留材料中的关键原句，对这些句子不要改写或删减。',
  },
  {
    id: 'extra.keep-terms',
    name: '保留术语',
    group: 'extras',
    version: 1,
    hint: '术语保留原文',
    text: '请保留专业术语的原始表述，不要替换、翻译或简化术语。',
  },
  {
    id: 'extra.keep-examples',
    name: '保留示例',
    group: 'extras',
    version: 1,
    hint: '示例与代码不省略',
    text: '请保留材料中的示例与代码，不要省略或概括掉它们。',
  },
  {
    id: 'extra.keep-open-questions',
    name: '保留未解决问题',
    group: 'extras',
    version: 1,
    hint: '悬而未决的保持原样',
    text: '材料中未解决的问题必须保持为未解决状态，不要给出材料之外的答案。',
  },
  {
    id: 'extra.no-new-claims',
    name: '禁止新增观点',
    group: 'extras',
    version: 1,
    hint: '不加材料外的观点',
    text: '不得擅自加入材料中没有的新观点、结论或事实。',
  },
  {
    id: 'extra.flag-uncertainty',
    name: '标注不确定',
    group: 'extras',
    version: 1,
    hint: '存疑内容要标出来',
    text: '对材料中不确定、有争议或未经验证的内容，请明确标注（例如注明“存疑”），不要当作已确认的结论输出。',
  },
  {
    id: 'extra.merge-duplicates',
    name: '合并重复',
    group: 'extras',
    version: 1,
    hint: '重复内容合成一处',
    text: '请合并重复出现的内容，只保留一处完整表述，但不要因此丢失信息。',
  },
  {
    id: 'extra.output-chinese',
    name: '用中文输出',
    group: 'extras',
    version: 1,
    hint: '术语 / 代码保留原文',
    text: '请用简体中文输出最终内容；材料中的专有名词、术语与代码保留原文，不做翻译。',
  },
];

/** UI metadata for rendering the bottom preset bar. */
export interface PresetGroupMeta {
  id: PresetGroupId;
  label: string;
  mode: 'single' | 'multi';
  options: PresetOption[];
}

export const PRESET_GROUPS: PresetGroupMeta[] = [
  { id: 'intent', label: '输出用途', mode: 'single', options: INTENT_PRESETS },
  { id: 'density', label: '知识密度', mode: 'single', options: DENSITY_PRESETS },
  { id: 'writingStyle', label: '文风', mode: 'single', options: STYLE_PRESETS },
  { id: 'responseStructure', label: '输出结构', mode: 'single', options: STRUCTURE_PRESETS },
  { id: 'outputFormat', label: '输出格式', mode: 'single', options: FORMAT_PRESETS },
  { id: 'extras', label: '附加要求', mode: 'multi', options: EXTRA_PRESETS },
];

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
