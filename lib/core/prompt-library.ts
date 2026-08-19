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
 */

export interface PromptLibraryEntry {
  id: string;
  /** Short display name, used as the custom requirement's chip label. */
  name: string;
  /** Grouping shown in the picker. */
  category: string;
  /** The full prompt text, dropped into the editor on import. */
  text: string;
  /** Attribution shown in the picker (adapted source / 原创). */
  source?: string;
}

const FABRIC = '改编自 Fabric（MIT）';
const ORIGINAL = '原创';

export const PROMPT_LIBRARY: PromptLibraryEntry[] = [
  // --- 总结提炼 --------------------------------------------------------------
  {
    id: 'lib-extract-wisdom',
    name: '提炼精华',
    category: '总结提炼',
    source: FABRIC,
    text: [
      '从材料中提炼最有价值的内容，分类列出：',
      '- 核心洞见：最重要的观点，每条一句话，尽量多列',
      '- 金句：原文里最精炼有力的句子，原样引用',
      '- 可执行建议：能立刻上手的具体做法',
      '- 提到的资源：书 / 工具 / 人名 / 链接',
      '只保留真正有信息量的，去掉客套、重复和过渡句。',
    ].join('\n'),
  },
  {
    id: 'lib-five-sentence',
    name: '五句话总结',
    category: '总结提炼',
    source: FABRIC,
    text: [
      '用最多五句话总结材料的核心，覆盖：讲了什么、关键结论、给谁看、为什么重要、下一步。',
      '每句独立成行，不要客套开场，直接给结论。',
    ].join('\n'),
  },
  {
    id: 'lib-points-todo',
    name: '要点与待办',
    category: '总结提炼',
    source: ORIGINAL,
    text: [
      '把材料整理成两部分：',
      '1. 要点：用无序列表列出关键信息，每条不超过一行',
      '2. 待办：列出其中所有需要行动的事项，每条以动词开头，能判断是否完成',
      '不确定是否算待办的，宁可列出并标注「（待确认）」。',
    ].join('\n'),
  },
  {
    id: 'lib-extract-quotes',
    name: '提金句',
    category: '总结提炼',
    source: FABRIC,
    text: [
      '只挑出材料里最精彩、最值得记住的原话，逐条原样引用（不要改写），',
      '每条后面用一句话说明它为什么重要。按精彩程度排序，宁缺毋滥。',
    ].join('\n'),
  },

  // --- 分析审视 --------------------------------------------------------------
  {
    id: 'lib-analyze-claims',
    name: '核查论点',
    category: '分析审视',
    source: FABRIC,
    text: [
      '逐条找出材料里提出的主张，对每一条：',
      '- 复述这个主张',
      '- 支持它的证据（材料里给了什么）',
      '- 反对它或存疑的地方',
      '- 你的判断：成立 / 存疑 / 不成立，并给一句理由',
      '对没有证据支撑的断言，明确指出来。',
    ].join('\n'),
  },
  {
    id: 'lib-logical-fallacies',
    name: '找逻辑漏洞',
    category: '分析审视',
    source: FABRIC,
    text: [
      '审视材料的推理，指出其中的逻辑谬误、跳步、以偏概全或证据不足之处。',
      '每条指出：出现在哪句、属于什么问题、为什么站不住。',
      '如果推理整体是严谨的，也直说，别硬找。',
    ].join('\n'),
  },
  {
    id: 'lib-devils-advocate',
    name: '唱反调',
    category: '分析审视',
    source: ORIGINAL,
    text: [
      '站在反对立场审视材料：这套观点 / 方案最可能在哪里出错？',
      '列出最强的三到五条反驳或风险，每条给出具体的失败场景，',
      '不要用「可能」「也许」搪塞，把话说到能被检验的程度。',
    ].join('\n'),
  },

  // --- 改写润色 --------------------------------------------------------------
  {
    id: 'lib-improve-writing',
    name: '改清楚',
    category: '改写润色',
    source: FABRIC,
    text: [
      '在不改变原意的前提下，把材料改得更清楚：理顺逻辑、去掉冗词、拆开长句、统一术语。',
      '只做表达上的修整，不增删观点、不加评论，直接给改后的版本。',
    ].join('\n'),
  },
  {
    id: 'lib-humanize',
    name: '去 AI 味',
    category: '改写润色',
    source: ORIGINAL,
    text: [
      '把材料改写成像真人写的：去掉「首先 / 其次 / 综上所述」这类套话和排比腔，',
      '少用空泛的大词，句子长短错落，该直白就直白。保持原意和信息量不变。',
    ].join('\n'),
  },
  {
    id: 'lib-compress',
    name: '精简一半',
    category: '改写润色',
    source: ORIGINAL,
    text: [
      '在不丢关键信息的前提下，把材料压缩到原来的一半以内。',
      '优先砍重复、铺垫和例子，保留结论、关键事实和必要的限定。',
      '给出精简后的完整版本，不要只列删了什么。',
    ].join('\n'),
  },

  // --- 结构化 ----------------------------------------------------------------
  {
    id: 'lib-outline',
    name: '列大纲',
    category: '结构化',
    source: FABRIC,
    text: [
      '把材料重新组织成一份有层级的大纲：一级是主干，二级是支撑点，必要时到三级。',
      '用材料本身的信息填充，不要凭空补内容；顺序按逻辑而非原文出现顺序。',
    ].join('\n'),
  },
  {
    id: 'lib-key-questions',
    name: '提关键问题',
    category: '结构化',
    source: FABRIC,
    text: [
      '基于材料，提出最值得进一步追问的关键问题，分两类：',
      '一类是材料没讲清、需要补充的；一类是能把讨论推向深入的。',
      '每类列 3-6 条，问题要具体、能被回答。',
    ].join('\n'),
  },
  {
    id: 'lib-to-table',
    name: '做成表格',
    category: '结构化',
    source: ORIGINAL,
    text: [
      '把材料里可对比的信息整理成一张表格：先想清楚该用哪几个维度做列，',
      '每个对象一行，单元格只填事实、不填空话。材料里缺的格子标「—」。',
    ].join('\n'),
  },

  // --- 迁移交接 --------------------------------------------------------------
  {
    id: 'lib-handoff',
    name: '交接给新对话',
    category: '迁移交接',
    source: ORIGINAL,
    text: [
      '把材料整理成一份能直接丢给另一个 AI 对话的交接说明，让它无需看原对话就能接着干：',
      '- 背景：这是关于什么的，已经到了哪一步',
      '- 已定的结论 / 决定（连同理由）',
      '- 还没解决、需要继续的问题',
      '- 接手后第一步该做什么',
      '用第三方也能看懂的话写，不要用「你之前说」这种依赖原对话的指代。',
    ].join('\n'),
  },
];

/** Distinct categories in first-seen order, for the picker's grouping. */
export const PROMPT_LIBRARY_CATEGORIES: string[] = [
  ...new Set(PROMPT_LIBRARY.map((e) => e.category)),
];
