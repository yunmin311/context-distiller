/**
 * Interface language for Context Distiller.
 *
 * Deliberately NOT `chrome.i18n` / `_locales`: that follows the browser's UI
 * language and cannot be switched inside the extension, so a user on a Chinese
 * Chrome could never see the English build (and vice versa). Here the language
 * is an explicit, switchable preference stored in local config, defaulting to
 * `auto` (resolved from the browser's UI language on first run).
 *
 * `zh` is the source of truth: `en` is typed as `Record<UIKey, string>`, so
 * adding a Chinese string without its English twin is a type error, and the
 * table can never silently drift out of parity.
 *
 * Scope note: this covers the PANEL. The preset Prompt texts that get compiled
 * into the message live in `lib/core/presets.ts` / `prompt-library.ts` with
 * their own `*En` fields (see `presetText()`), because they are product content,
 * not chrome.
 */

export type Lang = 'zh' | 'en';

/** Stored preference: `auto` resolves from the browser's UI language. */
export type LangPref = 'auto' | Lang;

/** Values interpolated into a string via `{name}` placeholders. */
export type TVars = Record<string, string | number>;

const zh = {
  // --- top bar ------------------------------------------------------------
  'top.scratchpad': '便签',
  'top.scratchpadTip':
    '便签：随手记的个人批注，只存本地、跨会话保留；永远不会编译进输出，也不发送',
  'top.refresh': '读取 / 刷新当前对话',
  'top.refreshAria': '读取或刷新当前对话',
  'top.langTip': '切换界面与提示词语言（中文 / English）',
  'top.langAria': '切换语言',

  // --- intro / status -----------------------------------------------------
  'intro.title': '选材料，编译成一段可交给 AI 的纯文本',
  'intro.body':
    '在 ChatGPT 对话页读取消息，挑出真正有用的整条或片段，分组、点预设按钮，生成一段纯文本，复制或填回输入框。不调用模型、不保存、不自动发送。',
  'intro.read': '读取当前对话',
  'intro.scope': '仅在 chatgpt.com / chat.openai.com 生效。',
  'status.loading': '正在读取当前对话…',
  'status.errorTitle': '读取失败',
  'status.retry': '刷新页面重试',

  // --- section headers ----------------------------------------------------
  'section.messages': '对话消息',
  'section.workspace': '整理工作区',
  'section.presets': '预设 Prompt',

  // --- footer -------------------------------------------------------------
  'footer.remember': '记住本次',
  'footer.rememberTip':
    '打开后：本次对话与整理会存到本地，下次打开自动恢复；关闭即清除（默认关闭，不落盘）',
  'footer.counts': '{fragments} 段 · {chars} 字',
  'footer.preview': '预览',
  'footer.copy': '复制',
  'footer.fill': '填入',
  'footer.clear': '清空',

  // --- toasts -------------------------------------------------------------
  'toast.read': '已读取 {count} 条消息',
  'toast.readPartial': '已读取 {count} 条 · 超长对话可向上滚动加载后再刷新',
  'toast.reloaded': '已刷新并读取 {count} 条消息',
  'toast.reloadedPartial': '已刷新并读取 {count} 条 · 超长对话可向上滚动加载后再刷新',
  'toast.added': '已加入到「{group}」',
  'toast.addedPair': '已加入问答到「{group}」',
  'toast.addedSelection': '已加入选中到「{group}」',
  'toast.nothingToCopy': '还没有可复制的内容。',
  'toast.copied': '已复制到剪贴板。',
  'toast.copyFailed': '复制失败。',
  'toast.nothingToFill': '没有可填入的内容。',
  'toast.filled': '已填入输入框，检查后自行发送。',
  'toast.fillFailed': '填入失败，请改用复制。',
  'toast.cleared': '已清空。',
  'confirm.clear': '清空本次整理？已选材料、标记和备注都会丢失。',

  // --- errors (also used as codes across the messaging hops) ---------------
  'err.readFailed': '读取对话失败。',
  'err.noActiveTab': '没有找到活动标签页。',
  'err.noResponse': '页面没有响应。请在 ChatGPT 对话页打开，刷新页面后重试。',
  'err.noContentScript':
    '无法与页面通信。请在 ChatGPT（chatgpt.com）对话页打开侧边栏，必要时刷新页面。',
  'err.noMessages': '未读取到消息。请确认已打开一个对话；超长对话可向上滚动加载后再刷新。',
  'err.fillFailed': '未能写入输入框，请改用“复制完整消息”。',
  'err.unknownRequest': '未知请求',
  'err.scrollNotFound': '这条当前找不到（可能刚被折叠/虚拟化），刷新页面后再试。',
  'err.scrollGeneric': '未能跳转。',
  'err.scrollNoPage': '未能跳转，请确认 ChatGPT 对话页在前台。',
  'err.focusChatgptTab': '请先切换到并聚焦 ChatGPT 对话标签页（chatgpt.com），再点重试。',
  'err.reloadNoMessages': '刷新后仍未读取到消息，请确认页面已打开一个对话后再重试。',

  // --- message list -------------------------------------------------------
  'role.user': '你',
  'role.assistant': 'AI',
  'role.system': '系统',
  'msg.locate': '点编号：在左侧对话里定位这条（只滚动页面，不影响账号）',
  'msg.locateAria': '在对话里定位这条',
  'msg.mark': '标记这条（会进【标记】段，一起编译）',
  'msg.markAria': '标记这条',
  'msg.unmark': '取消标记',
  'msg.addPair': '＋问答',
  'msg.addPairTip': '加入这条提问和它的下一条回答',
  'msg.added': '✓ 已加入',
  'msg.addedTip': '整条已加入',
  'msg.add': '＋加入',
  'msg.expand': '展开',
  'msg.collapse': '收起',
  'msg.markNote': '标记备注（可选）',
  'list.target': '加入到',
  'list.targetTip': '新加入的整条 / 片段会放进这个模块',
  'list.targetAria': '选择加入目标模块',
  'list.newModule': '＋ 新建模块…',
  'list.filter': '筛选…',
  'list.showAll': '显示全部消息',
  'list.onlyMarked': '只看已标记的消息',
  'list.newModuleName': '新模块名称',
  'list.scopeSession': '本次',
  'list.scopeSessionTip': '只在这次有，关掉就没了',
  'list.scopePersist': '长期',
  'list.scopePersistTip': '长期保留，下次打开还在',
  'list.cancel': '取消',
  'list.cancelNewModule': '取消新建模块',
  'list.hint':
    '整条点「＋加入」；只要其中几句 —— 直接在消息里划词，冒出来的小条里可顺手加条注释再加入。',
  'list.emptyMarked': '没有匹配的已标记消息。',
  'list.emptyFilter': '没有匹配「{query}」的消息。',
  'sel.aria': '给选中文本加注释并加入',
  'sel.note': '加条注释（可选）',
  'sel.add': '＋ 加入',

  // --- workspace board ----------------------------------------------------
  'frag.locate': '在左侧对话里定位这条（只滚动页面，不影响账号）',
  'frag.up': '上移',
  'frag.upAria': '上移片段',
  'frag.down': '下移',
  'frag.downAria': '下移片段',
  'frag.remove': '删除',
  'frag.removeAria': '删除片段',
  'frag.editTip': '点击编辑这段正文（失焦保存，Esc 取消）',
  'frag.note': '备注（可选）',
  'frag.moveTo': '移到…',
  'frag.moveToTip': '移动到其他模块',
  'group.removePersist': '删除这个模块（长期模块，一并从记忆里移除）',
  'group.removeEmpty': '删除这个空模块',
  'group.removeAria': '删除模块：{title}',

  // --- preview ------------------------------------------------------------
  'preview.title': '完整消息预览',
  'preview.chars': '{count} 字',
  'preview.edited': '（已编辑）',
  'preview.back': '返回',
  'preview.copy': '复制完整消息',
  'preview.fill': '填入当前对话',
  'preview.hint': '插件不会自动发送。填入后请在 ChatGPT 输入框中检查，并由你自己点击发送。',

  // --- scratchpad ---------------------------------------------------------
  'scratch.placeholder': '随手记点什么…只存在本地，永远不会编译进输出，也不会发送。',

  // --- preset bar ---------------------------------------------------------
  'preset.multi': '可多选',
  'preset.collapse': '收起',
  'preset.expandAll': '展开全部',
  'preset.customTip': '（自定义{scope}｜点选用，双击改）',
  'preset.scopePersist': '·长期',
  'preset.scopeSession': '·本次',
  'preset.removeCustom': '删除这条自定义要求',
  'preset.removeCustomAria': '删除自定义要求：{name}',
  'preset.addCustom': '＋ 自定义',
  'preset.addCustomTip': '添加一条你自己的要求',
  'preset.namePlaceholder': '起个名字（可选，留空自动取）',
  'preset.textPlaceholder':
    '写一条要求，会原样拼进消息里；或点「从库导入」挑一个现成的详细提示词再改。',
  'preset.importFromLibrary': '从库导入',
  'preset.importTip': '从内置提示词库挑一个填进来',
  'preset.save': '保存',
  'preset.cancel': '取消',
  'preset.searchLibrary': '搜提示词…',
  'preset.libraryEmpty': '没有匹配的提示词。',
  'preset.libraryNote': '选一条填进上面，可再改名 / 编辑；部分改编自 Fabric（MIT）。',
  'preset.srcFabric': '改编自 Fabric（MIT）',
  'preset.srcOriginal': '原创',

  // --- defaults created at runtime ----------------------------------------
  'module.fallback': '模块 {n}',
  'extra.fallback': '要求',
} as const;

export type UIKey = keyof typeof zh;

const en: Record<UIKey, string> = {
  // --- top bar ------------------------------------------------------------
  'top.scratchpad': 'Notes',
  'top.scratchpadTip':
    'Scratchpad: a private notepad. Stored locally, kept across sessions, and NEVER compiled into the output or sent anywhere.',
  'top.refresh': 'Read / refresh this conversation',
  'top.refreshAria': 'Read or refresh this conversation',
  'top.langTip': 'Switch interface and prompt language (中文 / English)',
  'top.langAria': 'Switch language',

  // --- intro / status -----------------------------------------------------
  'intro.title': 'Pick the material, compile one plain-text prompt',
  'intro.body':
    'Read the messages of an open ChatGPT conversation, pick the turns or highlights that actually matter, group them, click the preset buttons, and get one plain-text message to copy or drop back into the composer. No model call, nothing stored, never auto-sent.',
  'intro.read': 'Read this conversation',
  'intro.scope': 'Works only on chatgpt.com / chat.openai.com.',
  'status.loading': 'Reading this conversation…',
  'status.errorTitle': "Couldn't read the conversation",
  'status.retry': 'Reload the page and retry',

  // --- section headers ----------------------------------------------------
  'section.messages': 'Messages',
  'section.workspace': 'Workspace',
  'section.presets': 'Preset prompts',

  // --- footer -------------------------------------------------------------
  'footer.remember': 'Remember',
  'footer.rememberTip':
    'On: this conversation and your organizing are saved locally and restored next time. Off: cleared immediately (default — nothing hits the disk).',
  'footer.counts': '{fragments} pieces · {chars} chars',
  'footer.preview': 'Preview',
  'footer.copy': 'Copy',
  'footer.fill': 'Fill in',
  'footer.clear': 'Clear',

  // --- toasts -------------------------------------------------------------
  'toast.read': 'Read {count} messages',
  'toast.readPartial': 'Read {count} · scroll up in ChatGPT to load more, then refresh',
  'toast.reloaded': 'Reloaded and read {count} messages',
  'toast.reloadedPartial':
    'Reloaded and read {count} · scroll up in ChatGPT to load more, then refresh',
  'toast.added': 'Added to “{group}”',
  'toast.addedPair': 'Added the Q&A pair to “{group}”',
  'toast.addedSelection': 'Added the highlight to “{group}”',
  'toast.nothingToCopy': 'Nothing to copy yet.',
  'toast.copied': 'Copied to the clipboard.',
  'toast.copyFailed': 'Copy failed.',
  'toast.nothingToFill': 'Nothing to fill in.',
  'toast.filled': 'Filled the composer — check it and send it yourself.',
  'toast.fillFailed': 'Could not fill the composer. Copy it instead.',
  'toast.cleared': 'Cleared.',
  'confirm.clear': 'Clear this session? The selected material, marks and notes will be lost.',

  // --- errors -------------------------------------------------------------
  'err.readFailed': 'Could not read the conversation.',
  'err.noActiveTab': 'No active tab found.',
  'err.noResponse': "The page didn't answer. Open a ChatGPT conversation, refresh, and retry.",
  'err.noContentScript':
    'Cannot talk to the page. Open the side panel on a ChatGPT (chatgpt.com) conversation, and refresh the page if needed.',
  'err.noMessages':
    'No messages found. Make sure a conversation is open; for a very long thread, scroll up to load more and refresh.',
  'err.fillFailed': 'Could not write to the composer — use “Copy the full message” instead.',
  'err.unknownRequest': 'Unknown request',
  'err.scrollNotFound':
    "Can't find that message right now (it may have just been virtualized). Refresh the page and try again.",
  'err.scrollGeneric': 'Could not jump to it.',
  'err.scrollNoPage': 'Could not jump — make sure the ChatGPT conversation tab is in front.',
  'err.focusChatgptTab': 'Switch to and focus the ChatGPT tab (chatgpt.com) first, then retry.',
  'err.reloadNoMessages':
    'Still no messages after the reload — make sure a conversation is open, then retry.',

  // --- message list -------------------------------------------------------
  'role.user': 'You',
  'role.assistant': 'AI',
  'role.system': 'System',
  'msg.locate': 'Click the number to locate this message in ChatGPT (scroll only — nothing sent)',
  'msg.locateAria': 'Locate this message in the conversation',
  'msg.mark': 'Mark this message (compiles into the [Marks] section)',
  'msg.markAria': 'Mark this message',
  'msg.unmark': 'Remove mark',
  // ASCII '+' here, not the fullwidth '＋' the Chinese labels use — a fullwidth
  // plus next to Latin text renders oversized and misaligned.
  'msg.addPair': '+ Q&A',
  'msg.addPairTip': 'Add this question together with the reply that follows it',
  'msg.added': '✓ Added',
  'msg.addedTip': 'The whole message is already added',
  'msg.add': '+ Add',
  'msg.expand': 'Expand',
  'msg.collapse': 'Collapse',
  'msg.markNote': 'Note for this mark (optional)',
  'list.target': 'Add to',
  'list.targetTip': 'New messages and highlights go into this module',
  'list.targetAria': 'Choose the target module',
  'list.newModule': '+ New module…',
  'list.filter': 'Filter…',
  'list.showAll': 'Show all messages',
  'list.onlyMarked': 'Show marked messages only',
  'list.newModuleName': 'Module name',
  'list.scopeSession': 'This session',
  'list.scopeSessionTip': 'Only for now — gone when you close the panel',
  'list.scopePersist': 'Long-term',
  'list.scopePersistTip': 'Kept long-term — still here next time',
  'list.cancel': 'Cancel',
  'list.cancelNewModule': 'Cancel creating a module',
  'list.hint':
    'Click “+ Add” for a whole message; for just a few lines, highlight them and a small bar appears where you can add a note before adding.',
  'list.emptyMarked': 'No marked message matches.',
  'list.emptyFilter': 'No message matches “{query}”.',
  'sel.aria': 'Annotate the highlighted text and add it',
  'sel.note': 'Add a note (optional)',
  'sel.add': '+ Add',

  // --- workspace board ----------------------------------------------------
  'frag.locate': 'Locate this in the ChatGPT conversation (scroll only — nothing sent)',
  'frag.up': 'Move up',
  'frag.upAria': 'Move fragment up',
  'frag.down': 'Move down',
  'frag.downAria': 'Move fragment down',
  'frag.remove': 'Remove',
  'frag.removeAria': 'Remove fragment',
  'frag.editTip': 'Click to edit this text (saves on blur, Esc cancels)',
  'frag.note': 'Note (optional)',
  'frag.moveTo': 'Move to…',
  'frag.moveToTip': 'Move to another module',
  'group.removePersist': 'Delete this module (long-term — also removed from memory)',
  'group.removeEmpty': 'Delete this empty module',
  'group.removeAria': 'Delete module: {title}',

  // --- preview ------------------------------------------------------------
  'preview.title': 'Full message preview',
  'preview.chars': '{count} chars',
  'preview.edited': ' (edited)',
  'preview.back': 'Back',
  'preview.copy': 'Copy the full message',
  'preview.fill': 'Fill the composer',
  'preview.hint':
    'The extension never sends anything. After filling, check it in the ChatGPT composer and press send yourself.',

  // --- scratchpad ---------------------------------------------------------
  'scratch.placeholder':
    'Jot anything down… stored locally only, never compiled into the output, never sent.',

  // --- preset bar ---------------------------------------------------------
  'preset.multi': 'multi-select',
  'preset.collapse': 'Collapse',
  'preset.expandAll': 'Show all',
  'preset.customTip': '(custom{scope} · click to use, double-click to edit)',
  'preset.scopePersist': ' · long-term',
  'preset.scopeSession': ' · this session',
  'preset.removeCustom': 'Delete this custom requirement',
  'preset.removeCustomAria': 'Delete custom requirement: {name}',
  'preset.addCustom': '+ Custom',
  'preset.addCustomTip': 'Add a requirement of your own',
  'preset.namePlaceholder': 'Name it (optional — taken from the text if left blank)',
  'preset.textPlaceholder':
    'Write a requirement; it is concatenated verbatim. Or click “Import from library” to start from a ready-made prompt.',
  'preset.importFromLibrary': 'Import from library',
  'preset.importTip': 'Pick a ready-made prompt from the built-in library',
  'preset.save': 'Save',
  'preset.cancel': 'Cancel',
  'preset.searchLibrary': 'Search prompts…',
  'preset.libraryEmpty': 'No prompt matches.',
  'preset.libraryNote':
    'Pick one to fill the editor above, then rename or trim it. Some entries adapted from Fabric (MIT).',
  'preset.srcFabric': 'adapted from Fabric (MIT)',
  'preset.srcOriginal': 'original',

  // --- defaults created at runtime ----------------------------------------
  'module.fallback': 'Module {n}',
  'extra.fallback': 'Requirement',
};

export const STRINGS: Record<Lang, Record<UIKey, string>> = { zh, en };

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Look up a string and interpolate `{name}` placeholders.
 *
 * An unknown placeholder is left as-is rather than replaced with `undefined`,
 * so a mistake shows up as visible `{foo}` instead of silently corrupting text.
 */
export function t(lang: Lang, key: UIKey, vars?: TVars): string {
  const template = STRINGS[lang][key] ?? STRINGS.zh[key] ?? key;
  if (!vars) return template;
  return template.replace(PLACEHOLDER, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/** True for any key present in the table — used to treat error codes as keys. */
export function isUIKey(value: string): value is UIKey {
  return Object.prototype.hasOwnProperty.call(zh, value);
}

/**
 * Resolve the stored preference to a concrete language. `auto` reads the
 * browser's UI language: anything starting with `zh` is Chinese, everything
 * else falls back to English (the wider default for an unknown locale).
 */
export function resolveLang(pref: LangPref | undefined, uiLanguage?: string): Lang {
  if (pref === 'zh' || pref === 'en') return pref;
  const raw = (uiLanguage ?? '').toLowerCase();
  return raw.startsWith('zh') ? 'zh' : 'en';
}

/** The browser's UI language, or '' where the API is unavailable (tests, SSR). */
export function browserUILanguage(): string {
  try {
    const api = (globalThis as { chrome?: { i18n?: { getUILanguage?: () => string } } }).chrome;
    const fromApi = api?.i18n?.getUILanguage?.();
    if (fromApi) return fromApi;
  } catch {
    // fall through to navigator
  }
  return globalThis.navigator?.language ?? '';
}
