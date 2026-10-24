# Changelog

All notable changes to Context Distiller are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.4] — 2026-10-23

交接复核轮（Codex 只读核对发现的问题全部处理；除闸门重试外均为工程修正）。

### Fixed
- **CI**：`packageManager` 字段锁定 pnpm@11.7.0——此前 workflow 停在「安装 pnpm」一步（未指定版本）。
- **闸门超时不再丢读**：后台读取 defer 超时后自动重试准入（最多 3 次、间隔 4s）。此前 25s 超时仍会以
  `skipped` 静默丢弃升级/追读/全量就绪读——「等待式」只解决了等待，未解决超时后的兜底。

### Changed
- 冒烟脚本支持版本号作首参（`pnpm smoke 1.4.4`），并注明 Windows-only 运行前提。
- 文档纠偏：USAGE 清单「重试不会重载页面」改为 1.4.1 恢复后的实际行为（重试=刷新页面 + 两个按钮分工）。

### chore
- 补齐 tag：v1.4.3 指向发布提交 d9fdd00（此前 1.4.1–1.4.3 均未打 tag）。

## [1.4.3] — 2026-10-23

### Added
- **右上角刷新 = 强制加载**（用户指令）：跳过 30s 响应缓存与闸门间隔、直拉全量，点击瞬间弹提示；
  底部「读取当前对话」保持温和读取（DOM 秒出 + 排队升级）。
- `bypassCache` 全链路贯通（面板 → 协议 → 内容脚本 → 主世界桥），强制加载永不使用过期缓存。

### Fixed
- **定位守卫彻底移除**（回归 1.3 语义）：可见性检查在真实 ChatGPT UI 上仍持续误判、永久拒绝定位；
  现在永远尝试，失败回原位。寻址预算提到 80 步 / 20s。

## [1.4.2] — 2026-10-23

### Fixed
- **读取闸门改为推迟式**（`ReadGate.acquire`，语义有单测锁定）：v1.4.0 的拒绝式闸门静默丢弃
  partial→full 升级读取，是「列表永远半截」的根因。
- 主世界桥新增单条对话响应缓存（30s TTL）：升级读、轮询、追读窗口内秒出、零后端。
- 定位寻址去掉过激的停滞熔断，回归时间上限走查。

## [1.4.1] — 2026-10-23

### Fixed
- **恢复「重试 = 刷新页面」**（用户实证：对久开的 ChatGPT 页面最有效）；保留 45s 请求硬超时与轮询上限。
- **挂起死锁免疫**：`sendToActiveTab` 全部请求 45s 硬超时——标签页死亡时 sendMessage 的 promise
  永不返回，曾把读取闸门和加载管线永久占死（「后台一直在加载但界面不出现」）。
- 后台读取（轮询/升级/合并）不再拨动前台 spinner：`busyReads` 计数驱动加载条，`loading` 状态专属前台读取。
- 面板自动 ping 页面并在首屏/错误卡显示连接状态（ok / dead / nopage）——免开 DevTools 的自诊断。
- 「未读取到消息」错误自带层数诊断（页面节点数 → 原始消息数 → 页面数据数）。
- 版本号显示在面板首屏与底部。

## [1.4.0] — 2026-10-23

读取策略整顿：这一版的主目标是**让插件不再和 ChatGPT 网页打架**——所有自动读取现在共享一个
节流闸门（单飞行 + 20 秒最小间隔 + 内容无变化即跳过），与页面本身抢限流预算的路径被逐一堵住。

### Added
- **手动粘贴导入（兜底路径）** — 读取不可用时（如 ChatGPT 改版、接口失效），顶栏「导入」或
  首屏「手动粘贴导入」可把任意文本作为消息加入列表：默认整段一条并可选角色；检测到
  「你：/AI：/User:/Assistant:」等前缀（中英、全半角冒号）时可一键**按前缀拆分**成多条。
  导入的消息参与既有全流程（标记 / 问答配对 / 划词 / 编译 / 快照），行内编号不可定位（没有对应网页消息）。
  `lib/utils/paste-split.ts` 为纯函数并有单测锁定。
- **读取闸门（read gate）** — 所有后端读取经过单一闸门：同一时刻最多一次全量请求；自动触发
  （轮询 / 追读 / 升级读）之间强制 ≥20 秒间隔；用户显式动作（刷新 / 三连击收尾 / 重试）跳过间隔但
  仍不并发。`lib/utils/read-governor.ts` 纯逻辑 + 单测。
- **结果去重** — 内容完全相同的读取（典型的空闲轮询）在 reducer 里原样跳过：列表不重渲染、
  视口不动、spinner 不闪。
- **CI** — 恢复 GitHub Actions：push / PR 自动跑 typecheck + 单测 + 构建。
- **选择器集中化** — 所有 ChatGPT 选择器 / 端点 / 正则集中到 `lib/platform/chatgpt-markers.ts`，
  三个消费文件全部改为引用；外部兼容性探针的 `--sync` 会自动跟随这张表。

### Changed
- **生成中轮询 70s → 120s**，且每次轮询过闸门、无变化不落状态。生成结束后仍保留一次 3.5s 追读。
- **grew 推送按原因分流**：滚动增长（`grown`）现在做 **DOM 合并读取（零后端请求）**——v1.3 在这里
  发全量后端读取，是与网页抢预算的最大漏洞；迟到全量读落地（`full-ready`）才触发一次受闸门的
  全量读取。慢打开场景下 wasted 的第二次全量请求不复存在。
- **吸底不再任性** — 只有用户显式动作（手动刷新 / 重试 / 三连击 / 切换会话 / 首次打开）或用户本来就
  在底部时，读取后才会落到最新消息；后台轮询与升级读保持视口原地不动。
- **「重试」不再重载你的标签页** — v1.3 的重试会替用户刷新 ChatGPT 页并轮询 30 次；现在改为原地
  静默重试 3 次（前两次 DOM-only），页面问题仍由错误界面说明、由用户自己决定何时刷新。

### Fixed
- 慢打开时同一次启动浪费两次全量后端请求（首次 4 秒超时的结果被丢弃后立即重发）的问题，随
  `full-ready` 分流消除。

### Removed
- `reloadActiveTab` / 自动刷新页面重试路径及其 i18n 文案（`toast.reloaded*`、`err.focusChatgptTab`、
  `err.reloadNoMessages`）。

## [1.3.0] — 2026-08-26

### Added
- **DEEP LOAD — 三连击刷新** — for giant or throttled threads: click the refresh
  button **three times in a row** and the panel walks the ChatGPT page itself —
  jump to the oldest message, then scroll viewport by viewport toward the
  newest, **merging every partial read** — until the whole thread is captured.
  Each step is DOM-only (zero requests to a throttling endpoint) and the walk
  ends with one normal read that upgrades to the authoritative full thread if
  the backend has recovered. Verified: 60-message virtualized thread fully
  captured in ~6s with the backend hanging the entire time.
- **Fast-first two-stage read** — a refresh no longer blocks on a slow backend. The quick stage now answers within ~4s.
  Within ~4 seconds the panel shows the turns ChatGPT has mounted right now,
  while the full backend read continues in the background; when it lands, the
  panel **upgrades itself to the complete thread automatically** — no second
  click. This restores the snappy "partial first, full moments later" feel on
  very long threads even while ChatGPT's endpoint is slow or throttling, and it
  stops a hanging read from burning a minute of spinner.
- **Live follow of a generating answer** — while ChatGPT streams, the panel
  quietly re-reads every ~70 seconds and catches up once after generation ends;
  a freshly-opened panel asks the page directly and joins an already-running
  stream.
- **Refreshes land on the latest message instantly** — the previous read stays
  mounted while loading (no scroll-container collapse, so the viewport never
  resets to the oldest message), and every successful read is an atomic jump to
  the newest turn. No animation, nothing to scroll back from.
- Lightweight diagnostics: after each read the page's `<html>` carries a
  `data-cd-lastread` attribute (raw count / partial / source) for support.
- **Self-healing after extension updates** — an open ChatGPT tab keeps an
  ORPHANED old content script that can never answer again (every click dead
  until the tab was manually refreshed). The panel now detects that error
  signature, injects a fresh content script, and retries once — updates heal
  themselves. The injected bridge is idempotent per page, so a heal can never
  stack a second listener (which used to double every request and read as
  throttling).
- **Conversation-switch detection** — picking another chat in ChatGPT's sidebar
  changes the URL but re-mounts nothing; the panel now watches for it and
  quietly re-reads (sub-second) so it always shows the conversation actually
  on screen.
- **Snappy startup** — the first read of a fresh panel is DOM-only (lands in
  well under a second) and a background backend read upgrades it; retries on a
  half-loaded page are DOM-only too, so a slow network no longer makes the
  start button feel dead for half a minute.

### Fixed
- **Locate no longer drifts to the top of the message.** After a jump, ChatGPT's
  virtualizer keeps re-layouting for up to a second, and that drift could shove
  the target to the viewport top. The landing is now verified at 240/480/900ms
  and re-centered whenever the target drifted away from the middle, with Follow
  muted for the whole settle.

### Changed
- Backend read retries are bounded (2 × 11s, no second token round), so a
  failing read surfaces in ≤ ~35s instead of stretching past a minute — and
  stops hammering an endpoint that is already throttling us.

## [1.2.0] — 2026-08-21

### Added
- **English version / 英文版本** — the panel now ships in **Chinese and English**,
  switched with a **中 / EN** button in the top bar. The choice is stored as local
  config and survives across sessions.
  - **The compiled prompt switches too**, not just the chrome. In English mode the
    base instruction, every preset Prompt, the built-in prompt-library entries and
    the default module names are authored English — not machine translations of the
    Chinese — and the section brackets and note wrapper follow suit
    (`【框架】` → `[Frame]`, `【标记】` → `[Marks]`, `（备注：…）` → `(note: …)`).
  - **What you wrote is never translated.** A custom requirement, a fragment note,
    a mark note, a module you named yourself and the 便签 all compile verbatim in
    either language — the extension translates its own words, never yours.
  - **Deliberately not `chrome.i18n` / `_locales`.** That follows the browser's UI
    language and cannot be switched inside the extension, so a user on a Chinese
    Chrome could never reach the English build. The preference defaults to `auto`
    (resolved from the browser's UI language on first run) and an explicit pick
    pins it.
  - Switching language **relabels the built-in modules in place** — the fragments
    already grouped under them stay exactly where you put them.
  - A new **用英文输出 / Answer in English** additional requirement joins the
    existing 用中文输出.
  - Failures now travel from the page to the panel as **language-independent
    codes**, so an error message is worded in whichever language the panel shows.
- New unit tests pin the parity: the two string tables must have identical keys and
  identical placeholders, no English string may contain leftover Chinese, and every
  built-in preset and prompt-library entry must carry an English twin. **61 tests**
  (was 36).

### Fixed
- The English labels use an ASCII `+` where the Chinese ones use the fullwidth `＋`,
  which rendered oversized and misaligned next to Latin text.

## [1.1.2] — 2026-08-21

### Added
- **便签 (scratchpad)** — a single free-text annotation pad in the **top bar** (toggle
  it open beside the conversation title; a dot on the toggle signals it has
  content), dropping down as a strip under the bar. Purely
  personal notes for your own use: it **never compiles into the output** and is
  never passed to the compiler at all — the deliberate opposite of **消息标记**,
  which *do* compile into their own 【标记】 section. Stored as long-term local
  config (like a custom requirement), so it persists across sessions regardless of
  the 「记住本次」 toggle; local-only, never uploaded, bounded to 20000 characters.
- **消息标记 (marks)** — click the 📌 on any message to mark it and jot an optional
  note. Marked messages show the pin + note inline, a **📌 N** chip in the toolbar
  toggles a **只看已标记** filter to review them, and — the point — they **compile
  into their own 【标记】 section** (each block = the whole message + its note),
  placed after the grouped material. Held in memory only, persisted with the
  conversation solely when 「记住本次」 is on. (For a pure-annotation pad that never
  compiles, see 便签 above.)
- **Partial reads grow as you scroll** — when the full backend read isn't available
  and the panel is showing a DOM-based (partial) read, scrolling up in ChatGPT
  loads older turns and the panel now **re-reads quietly on its own**, so the list
  fills in without touching refresh. After a full read this stays silent, since
  there is nothing to add.
- **在对话里定位** — click a message's **#N number** (it *is* the button — no extra
  icon) to scroll the ChatGPT page to that message and flash a ring around it;
  workspace fragments keep a small crosshair button for the same. A **pure local
  scroll** — no request, nothing done to the account, no ban risk. When ChatGPT has
  virtualized the message out of the DOM (common after a full backend read), the
  page now **seeks** it — scrolling the conversation toward its position, binary-
  searched from the full ordered id list, until it mounts — instead of giving up.
  The highlight ring is now **monochrome and tinted to ChatGPT's own light/dark
  theme** (no fixed accent), and it settles the target back to center after
  ChatGPT re-lays-out.
- **主题跟随 ChatGPT** — the panel now mirrors ChatGPT's own light/dark theme **and
  borrows its accent color** (read from ChatGPT's own CSS custom properties, else
  its send button), so buttons, selected chips and focus rings match the page it
  sits beside. Read on open and followed live. The borrowed accent is **pulled
  toward grey and toward the theme's ground** before use, so it lands as a quiet
  tint rather than saturated paint. Greyscale is rejected as an accent (ChatGPT's
  primary button is monochrome), in which case the panel keeps its own neutral
  accent; the OS preference still applies when the page can't be read.
- **One blue palette across the panel.** Every button and selected state — the
  footer's 预览 / 复制 / 填入, the in-list ＋加入 / ＋问答, selected preset chips, the
  clickable message number — now shares a single celadon blue-grey family instead
  of black-on-white plus a grey "primary". The three footer pills are deliberately
  **identical** to each other. The panel keeps its own accent rather than borrowing
  ChatGPT's: ChatGPT's UI is monochrome, so "its accent" resolved to grey and
  tinted everything a muddy neutral. The footer bar itself stays solid.
- **Prompt library** — a built-in, **offline** set of ready-made "requirement"
  prompts (总结提炼 / 分析审视 / 改写润色 / 结构化 / 迁移交接) you can pull into a
  custom requirement via **从库导入**, then rename / trim / keep. Several entries
  are adapted from **Fabric** (MIT); the rest are original. Fully local — importing
  makes no network request, so the local-only promise is unchanged. See
  docs/THIRD_PARTY.md.
- Custom requirements now take an explicit **name** (leave it blank to auto-derive
  from the text), so a long imported prompt still shows a short, meaningful chip.
  The editor also grew a larger multi-line box for pasting a detailed prompt.

### Changed
- The message **展开 / 收起** toggle moved from beside the #N number to the **end of
  the message text** (inline), and the collapsed preview is now **tap-anywhere-to-
  open** — while a real text selection (drag-to-select for add-fragment) is left
  untouched. Collapsing now **scrolls the message back into view**, so 收起 lands you
  on the message you just closed instead of stranding you far down the list.

### Fixed
- **Switching conversations no longer mixes their material.** The workspace kept
  fragments from the previous thread, so a distillation could quietly contain
  another conversation's content. A read that lands on a *different* conversation
  now clears the selected material, marks and preset choices; a plain refresh of
  the same thread keeps everything, and module structure is kept either way. The
  same/different test is a pure function pinned by tests, since both failure
  directions are damaging.
- **The followed message hugs its block again.** The highlight ring was drawn
  outside the border box, where the row's paint containment (from
  `content-visibility`) clipped it — hence rings that looked cut off or misaligned.
  It's an inset ring now, so it can't be clipped.
- **A far jump lands on the first click.** The seek interpolated its next scroll
  position, but the virtualizer changes `scrollHeight` underfoot, so the guess was
  stale on arrival and the hunt oscillated — taking two or three clicks. It now
  makes one proportional jump and then walks toward the target a screen at a time,
  which cannot overshoot by more than one screen.
- **Reading is faster.** The access token is cached for a few minutes, so a
  re-read is one request instead of two (the session endpoint hits auth and was
  the slow half of every read). An expired cached token is detected and refreshed.
- **Locate and follow no longer fight each other.** Clicking a message number
  scrolled the page, whose scroll event was then reported back as "the user moved
  here", so the panel scrolled too — and during a multi-step seek the two ends
  chased a position that was still changing, leaving both adrift. Scrolls the
  extension performs itself are now muted for the follow push, so only real user
  scrolling drives the highlight.
- The locate ring in the conversation is **thinner and properly blue** (it was
  still the old grey-teal, and heavy enough to look like damage to the page).
- **A user turn and an AI turn can no longer look alike.** The follow highlight
  replaced a message's background outright, so whenever the page scrolled to an AI
  answer that message took on the same color as a user message. Role is now carried
  by a ground **and** a left rail (plus distinct 你 / AI tags), and the highlight
  only adds a ring — it never repaints the ground.
- **Refreshing no longer gives up on a slow page.** A read that landed while a
  heavy conversation was still rendering reported "无法与页面通信" immediately. The
  panel now stays in its loading state and retries quietly with a growing backoff
  (up to ~14s); only the final attempt can surface an error.
- **Text reads cleanly.** Markdown tables lose their separator row and outer rails
  instead of showing as rows of pipes and dashes; horizontal rules (`---`, `***`)
  are dropped rather than left as stray punctuation; and long unbroken strings
  (URLs, tokens, base64) now wrap instead of overflowing the panel.
- **Reading no longer needs a second try.** The first read fires as the panel
  opens, which could land before the page's content script was listening (or
  before ChatGPT had rendered the conversation) — it failed quietly and you had to
  click 读取 again. A failed read now **retries up to three times with a short
  backoff** before reporting anything.
- **Long-conversation full read is much more reliable.** A transient hiccup on the
  session or conversation request (a 429 rate-limit, a 5xx, a network blip — or a
  *hung* socket) used to drop the whole read to the partial DOM path, the one that
  only sees a screenful until you scroll the entire thread. The backend fetches now
  **retry with backoff** and each try is **time-boxed with an AbortController**, so
  a stuck request is aborted and retried instead of silently eating the read
  budget; the overall **timeout is raised to 40s** (a big thread's JSON plus
  retries needs the room). When the full read still can't run, the content script
  **logs the exact reason** before falling back, so a failure is diagnosable at a
  glance instead of silent.

## [0.5.0] — 2026-08-12

### Added
- **Follow ChatGPT** (re-added) — as you scroll the conversation or use ChatGPT's
  right-side jump, the panel highlights the message you're on and scrolls it into
  view. The scroll listener is now removed when the content-script context is
  invalidated (an orphaned instance after an extension reload), and sends are
  guarded by `ctx.isInvalid`, so it can't keep firing on a dead context — which is
  what produced the earlier reload-time errors.

### Fixed
- A split answer (ChatGPT sometimes breaks one reply into several adjacent
  messages) now reads as one turn — consecutive same-role messages are merged
  (blank-line separated) after the reasoning / thinking-preview filters.

### Performance
- Message rows use `content-visibility: auto`, so the browser skips rendering
  off-screen messages — a long conversation (now read in full) paints fast even
  on a low-end machine, with no JS windowing.

## [0.4.0] — 2026-08-12

### Added
- **Edit a fragment's text** — click a fragment in the workspace to edit it inline
  (blur to save, Esc to cancel), handy for trimming a quote before compiling.

### Changed
- **Reading now loads the COMPLETE conversation from ChatGPT's own backend**, so
  long threads read in full and instantly. ChatGPT virtualizes long threads (only
  a screenful is in the DOM), so the old DOM read returned just a fraction. The
  page-world bridge now fetches the whole conversation from ChatGPT's own API
  (same-origin, your existing session, nothing uploaded), follows the active
  branch (dropping regenerated / edited dead branches so order is exact), and
  skips the model's internal reasoning and "thinking-preview" preambles — so each
  turn is a clean question + answer. The DOM read stays as a fallback (new chats /
  when the API isn't available). See docs/PRIVACY.md.

### Fixed
- The note-at-selection bar could be clipped by the panel edges (especially in a
  narrow side panel). It is now a full-width floating bar pinned to both panel
  edges, so it can never be cut off; it also shows a preview of the selected text.
- Scrolling no longer dismisses that bar (the bar is fixed and doesn't drift), so
  you can scroll to check context while writing the note.

## [0.3.0] — 2026-08-10

### Added
- **Note at selection time** — when you highlight text in a message, the add chip
  now includes a small note field, so you can annotate the fragment as you add it
  (previously notes could only be added later in the workspace).

### Performance
- Memoized message rows and grouped-fragment rows (`React.memo`) and stabilized the
  callbacks passed to them, so typing a note or clicking a preset no longer
  re-renders the whole conversation — only the row that actually changed. This is
  the main fix for the sluggishness reported after 0.2.0.

## [0.2.0] — 2026-08-07

### Added
- Opt-in **"记住本次整理"** toggle in the footer (off by default): snapshots the
  current conversation + selected material + preset choices to local storage so
  reopening the panel restores them verbatim. Local-only, never uploaded, and
  purged the moment you turn it off. The privacy default — nothing
  conversation-related persisted — is unchanged.

### Changed
- Reworded the **对话续接 (handoff)** preset to explicitly cover migrating the
  distilled context into a new conversation or a different model, and note in
  the README that opening the side panel auto-reads the current conversation.

### Performance
- Memoize `plainify` with a bounded cache, so re-rendering the message list /
  group board no longer re-parses every message and fragment on each keystroke.
- Debounce the opt-in session snapshot write, so typing / reordering no longer
  serializes the whole snapshot to storage synchronously on every change — fixes
  the lag and slow startup reported when the toggle is on.

## [0.1.0] — 2026-08-07

First public MVP: a side-panel workbench beside ChatGPT that hands the choice of
what, the way it's organized, and control over the generation instructions back
to the user. Local-only — no model API, no server, no tracking, never auto-sends.

### Added
- **Conversation reading** — reads the current ChatGPT conversation via main-world
  React data with a DOM fallback; distinguishes user / AI. The panel strips
  Markdown markers for clean reading while the original text is kept for the AI.
- **Multi-granularity selection** — whole message, Q&A pair, or highlight-to-extract
  a fragment.
- **Temporary module board** — group, reorder, annotate, add / remove fragments; a
  sticky "add-to" selector creates modules on the fly (this-session or long-term).
- **Preset Prompts** — output purpose / knowledge density / writing style / output
  structure / output format (single-select) + additional requirements (multi-select,
  user-customizable). Each maps to one versioned, author-maintained prompt; the
  extension does no AI processing.
- **Deterministic compiler** — a pure function concatenates in a fixed order; the same
  input always yields the same output, with special characters and code passed through
  verbatim.
- **Hand back to the chat** — full preview, then copy or fill the ChatGPT composer;
  never auto-sends.
- **Local config only** — long-term custom modules / requirements persist in
  `chrome.storage.local`; conversation content and selected material stay in memory
  and are never persisted.
- Manifest V3, built with WXT + React 19 + TypeScript; Vitest unit tests around the
  deterministic core (27 tests).

### Security
- Hardened against hostile / extreme input from an adversarial review: no
  `innerHTML` / `eval` anywhere (message content can't XSS), least-privilege
  permissions (`sidePanel`, `scripting`, `storage` on chatgpt.com only), a ReDoS
  guard on the display de-Markdown pass, a wrong-tab reload guard, and
  bounds / validation on stored config.

[Unreleased]: https://github.com/yunmin311/context-distiller/compare/v1.1.2...HEAD
[1.1.2]: https://github.com/yunmin311/context-distiller/releases/tag/v1.1.2
[0.5.0]: https://github.com/yunmin311/context-distiller/releases/tag/v0.5.0
[0.4.0]: https://github.com/yunmin311/context-distiller/releases/tag/v0.4.0
[0.3.0]: https://github.com/yunmin311/context-distiller/releases/tag/v0.3.0
[0.2.0]: https://github.com/yunmin311/context-distiller/releases/tag/v0.2.0
[0.1.0]: https://github.com/yunmin311/context-distiller/releases/tag/v0.1.0


