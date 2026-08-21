import type { Lang } from '../i18n';

/**
 * Built-in prompt library.
 *
 * A curated, OFFLINE set of ready-made "requirement" prompts the user can import
 * into a custom 额外要求 (bottom of the preset bar), then name / trim / keep. It
 * ships inside the extension — no network call, no server — so it never touches
 * the plugin's local-only promise. Several entries are adapted (translated and
 * condensed for this tool's "process the material" context) from Fabric
 * (github.com/danielmiessler/fabric, MIT © Daniel Miessler); see
 * docs/THIRD_PARTY.md. The rest are original.
 *
 * Each entry's `text` is inserted verbatim into the compiled message exactly like
 * any other extra requirement — the extension does no AI processing.
 *
 * BILINGUAL: every entry carries an authored English twin (`nameEn` / `textEn`)
 * and a category id whose label is resolved per language, so importing in
 * English mode drops an English prompt into the editor.
 */

/** Stable category ids; labels are resolved per language below. */
export type PromptCategoryId = 'summarize' | 'analyze' | 'rewrite' | 'structure' | 'handoff';

/** Attribution, stored as an id so the label can be localized. */
export type PromptSource = 'fabric' | 'original';

export interface PromptLibraryEntry {
  id: string;
  /** Short display name, used as the custom requirement's chip label. */
  name: string;
  nameEn: string;
  /** Grouping shown in the picker. */
  category: PromptCategoryId;
  /** The full prompt text, dropped into the editor on import. */
  text: string;
  textEn: string;
  /** Attribution shown in the picker. */
  source: PromptSource;
}

const CATEGORY_LABELS: Record<PromptCategoryId, Record<Lang, string>> = {
  summarize: { zh: '总结提炼', en: 'Summarize' },
  analyze: { zh: '分析审视', en: 'Analyze' },
  rewrite: { zh: '改写润色', en: 'Rewrite' },
  structure: { zh: '结构化', en: 'Structure' },
  handoff: { zh: '迁移交接', en: 'Hand-off' },
};

export const PROMPT_LIBRARY: PromptLibraryEntry[] = [
  // --- 总结提炼 / Summarize --------------------------------------------------
  {
    id: 'lib-extract-wisdom',
    name: '提炼精华',
    nameEn: 'Extract the wisdom',
    category: 'summarize',
    source: 'fabric',
    text: [
      '从材料中提炼最有价值的内容，分类列出：',
      '- 核心洞见：最重要的观点，每条一句话，尽量多列',
      '- 金句：原文里最精炼有力的句子，原样引用',
      '- 可执行建议：能立刻上手的具体做法',
      '- 提到的资源：书 / 工具 / 人名 / 链接',
      '只保留真正有信息量的，去掉客套、重复和过渡句。',
    ].join('\n'),
    textEn: [
      'Extract the most valuable content from the material, sorted into:',
      '- Insights: the ideas that matter most, one sentence each, as many as you can find',
      '- Quotes: the sharpest sentences in the original, quoted verbatim',
      '- Actionable advice: concrete things someone could start doing today',
      '- Resources mentioned: books / tools / people / links',
      'Keep only what actually carries information; drop the pleasantries, repetition and filler.',
    ].join('\n'),
  },
  {
    id: 'lib-five-sentence',
    name: '五句话总结',
    nameEn: 'Five-sentence summary',
    category: 'summarize',
    source: 'fabric',
    text: [
      '用最多五句话总结材料的核心，覆盖：讲了什么、关键结论、给谁看、为什么重要、下一步。',
      '每句独立成行，不要客套开场，直接给结论。',
    ].join('\n'),
    textEn: [
      'Summarize the core of the material in at most five sentences, covering: what it is about, the key conclusion, who it is for, why it matters, and what comes next.',
      'One sentence per line. No preamble — go straight to the point.',
    ].join('\n'),
  },
  {
    id: 'lib-points-todo',
    name: '要点与待办',
    nameEn: 'Points and to-dos',
    category: 'summarize',
    source: 'original',
    text: [
      '把材料整理成两部分：',
      '1. 要点：用无序列表列出关键信息，每条不超过一行',
      '2. 待办：列出其中所有需要行动的事项，每条以动词开头，能判断是否完成',
      '不确定是否算待办的，宁可列出并标注「（待确认）」。',
    ].join('\n'),
    textEn: [
      'Organize the material into two parts:',
      '1. Points: the key information as a bullet list, one line per bullet',
      '2. To-dos: everything that requires action, each starting with a verb and each verifiably done or not done',
      'If you are unsure whether something is a to-do, list it anyway and mark it "(to confirm)".',
    ].join('\n'),
  },
  {
    id: 'lib-extract-quotes',
    name: '提金句',
    nameEn: 'Pull the quotes',
    category: 'summarize',
    source: 'fabric',
    text: [
      '只挑出材料里最精彩、最值得记住的原话，逐条原样引用（不要改写），',
      '每条后面用一句话说明它为什么重要。按精彩程度排序，宁缺毋滥。',
    ].join('\n'),
    textEn: [
      'Pick out only the strongest, most memorable lines in the material and quote each one verbatim (no rewriting),',
      'each followed by a single sentence on why it matters. Order them by how good they are, and leave out the merely adequate.',
    ].join('\n'),
  },

  // --- 分析审视 / Analyze ----------------------------------------------------
  {
    id: 'lib-analyze-claims',
    name: '核查论点',
    nameEn: 'Check the claims',
    category: 'analyze',
    source: 'fabric',
    text: [
      '逐条找出材料里提出的主张，对每一条：',
      '- 复述这个主张',
      '- 支持它的证据（材料里给了什么）',
      '- 反对它或存疑的地方',
      '- 你的判断：成立 / 存疑 / 不成立，并给一句理由',
      '对没有证据支撑的断言，明确指出来。',
    ].join('\n'),
    textEn: [
      'Find each claim the material makes, and for every one:',
      '- Restate the claim',
      '- The evidence for it (what the material actually offers)',
      '- What argues against it, or where it is doubtful',
      '- Your verdict: holds / doubtful / does not hold, with a one-sentence reason',
      'Call out, explicitly, any assertion with no evidence behind it.',
    ].join('\n'),
  },
  {
    id: 'lib-logical-fallacies',
    name: '找逻辑漏洞',
    nameEn: 'Find the logical gaps',
    category: 'analyze',
    source: 'fabric',
    text: [
      '审视材料的推理，指出其中的逻辑谬误、跳步、以偏概全或证据不足之处。',
      '每条指出：出现在哪句、属于什么问题、为什么站不住。',
      '如果推理整体是严谨的，也直说，别硬找。',
    ].join('\n'),
    textEn: [
      'Examine the reasoning in the material and point out the fallacies, skipped steps, over-generalizations and places where the evidence is too thin.',
      'For each: which sentence it appears in, what kind of problem it is, and why it does not hold.',
      'If the reasoning is sound throughout, say so plainly — do not manufacture faults.',
    ].join('\n'),
  },
  {
    id: 'lib-devils-advocate',
    name: '唱反调',
    nameEn: "Devil's advocate",
    category: 'analyze',
    source: 'original',
    text: [
      '站在反对立场审视材料：这套观点 / 方案最可能在哪里出错？',
      '列出最强的三到五条反驳或风险，每条给出具体的失败场景，',
      '不要用「可能」「也许」搪塞，把话说到能被检验的程度。',
    ].join('\n'),
    textEn: [
      'Take the opposing side: where is this view or plan most likely to go wrong?',
      'List the three to five strongest objections or risks, each with a concrete failure scenario.',
      'No hedging with "might" or "perhaps" — state each one specifically enough to be tested.',
    ].join('\n'),
  },

  // --- 改写润色 / Rewrite ----------------------------------------------------
  {
    id: 'lib-improve-writing',
    name: '改清楚',
    nameEn: 'Make it clearer',
    category: 'rewrite',
    source: 'fabric',
    text: [
      '在不改变原意的前提下，把材料改得更清楚：理顺逻辑、去掉冗词、拆开长句、统一术语。',
      '只做表达上的修整，不增删观点、不加评论，直接给改后的版本。',
    ].join('\n'),
    textEn: [
      'Without changing the meaning, make the material clearer: straighten the logic, cut redundant words, break up long sentences, make terminology consistent.',
      'Fix the expression only — add and remove no ideas, offer no commentary. Return the revised version directly.',
    ].join('\n'),
  },
  {
    id: 'lib-humanize',
    name: '去 AI 味',
    nameEn: 'De-AI the writing',
    category: 'rewrite',
    source: 'original',
    text: [
      '把材料改写成像真人写的：去掉「首先 / 其次 / 综上所述」这类套话和排比腔，',
      '少用空泛的大词，句子长短错落，该直白就直白。保持原意和信息量不变。',
    ].join('\n'),
    textEn: [
      'Rewrite the material so it reads as though a person wrote it: drop the "firstly / moreover / in conclusion" scaffolding and the tidy parallel constructions,',
      'avoid vague grand words, vary the sentence lengths, and be blunt where blunt is right. Keep the meaning and the information intact.',
    ].join('\n'),
  },
  {
    id: 'lib-compress',
    name: '精简一半',
    nameEn: 'Cut it in half',
    category: 'rewrite',
    source: 'original',
    text: [
      '在不丢关键信息的前提下，把材料压缩到原来的一半以内。',
      '优先砍重复、铺垫和例子，保留结论、关键事实和必要的限定。',
      '给出精简后的完整版本，不要只列删了什么。',
    ].join('\n'),
    textEn: [
      'Compress the material to half its length or less, without losing anything essential.',
      'Cut repetition, throat-clearing and examples first; keep the conclusions, the key facts and the qualifications that matter.',
      'Return the complete shortened version — not a list of what you removed.',
    ].join('\n'),
  },

  // --- 结构化 / Structure ----------------------------------------------------
  {
    id: 'lib-outline',
    name: '列大纲',
    nameEn: 'Build an outline',
    category: 'structure',
    source: 'fabric',
    text: [
      '把材料重新组织成一份有层级的大纲：一级是主干，二级是支撑点，必要时到三级。',
      '用材料本身的信息填充，不要凭空补内容；顺序按逻辑而非原文出现顺序。',
    ].join('\n'),
    textEn: [
      'Reorganize the material into a hierarchical outline: the first level is the trunk, the second the supporting points, a third where needed.',
      "Fill it from the material's own content — invent nothing — and order it by logic rather than by where things appeared in the original.",
    ].join('\n'),
  },
  {
    id: 'lib-key-questions',
    name: '提关键问题',
    nameEn: 'Raise the key questions',
    category: 'structure',
    source: 'fabric',
    text: [
      '基于材料，提出最值得进一步追问的关键问题，分两类：',
      '一类是材料没讲清、需要补充的；一类是能把讨论推向深入的。',
      '每类列 3-6 条，问题要具体、能被回答。',
    ].join('\n'),
    textEn: [
      'From the material, raise the questions most worth pursuing, in two groups:',
      'those where the material is unclear and needs filling in, and those that would push the discussion deeper.',
      'Three to six per group. Each question must be specific and answerable.',
    ].join('\n'),
  },
  {
    id: 'lib-to-table',
    name: '做成表格',
    nameEn: 'Turn it into a table',
    category: 'structure',
    source: 'original',
    text: [
      '把材料里可对比的信息整理成一张表格：先想清楚该用哪几个维度做列，',
      '每个对象一行，单元格只填事实、不填空话。材料里缺的格子标「—」。',
    ].join('\n'),
    textEn: [
      'Turn the comparable information in the material into a table: first decide which dimensions deserve to be columns,',
      'one row per subject, and put only facts in the cells — no filler. Mark a cell the material does not cover with "—".',
    ].join('\n'),
  },

  // --- 迁移交接 / Hand-off ---------------------------------------------------
  {
    id: 'lib-handoff',
    name: '交接给新对话',
    nameEn: 'Hand off to a new chat',
    category: 'handoff',
    source: 'original',
    text: [
      '把材料整理成一份能直接丢给另一个 AI 对话的交接说明，让它无需看原对话就能接着干：',
      '- 背景：这是关于什么的，已经到了哪一步',
      '- 已定的结论 / 决定（连同理由）',
      '- 还没解决、需要继续的问题',
      '- 接手后第一步该做什么',
      '用第三方也能看懂的话写，不要用「你之前说」这种依赖原对话的指代。',
    ].join('\n'),
    textEn: [
      'Turn the material into a hand-off note that can be dropped straight into another AI conversation, so it can carry on without ever seeing the original:',
      '- Background: what this is about and how far it has got',
      '- Conclusions and decisions already settled (with the reasons behind them)',
      '- What is still unresolved and needs continuing',
      '- The first thing whoever picks this up should do',
      'Write it so a third party can follow it — no "as you said earlier" references that depend on the original conversation.',
    ].join('\n'),
  },
];

/** Distinct categories in first-seen order, for the picker's grouping. */
export const PROMPT_LIBRARY_CATEGORIES: PromptCategoryId[] = [
  ...new Set(PROMPT_LIBRARY.map((e) => e.category)),
];

/** A library entry's display name in the requested language. */
export function entryName(entry: PromptLibraryEntry, lang: Lang): string {
  return lang === 'en' ? entry.nameEn : entry.name;
}

/** The prompt text an import drops into the editor, in the requested language. */
export function entryText(entry: PromptLibraryEntry, lang: Lang): string {
  return lang === 'en' ? entry.textEn : entry.text;
}

/** A category's label in the requested language. */
export function categoryLabel(category: PromptCategoryId, lang: Lang): string {
  return CATEGORY_LABELS[category][lang];
}
