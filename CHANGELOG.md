# Changelog

All notable changes to Context Distiller are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
  sits beside. Read on open and followed live. Greyscale is rejected as an accent
  (ChatGPT's primary button is monochrome), in which case the panel keeps its own
  neutral accent; the OS preference still applies when the page can't be read.
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

[Unreleased]: https://github.com/yunmin311/context-distiller/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/yunmin311/context-distiller/releases/tag/v0.5.0
[0.4.0]: https://github.com/yunmin311/context-distiller/releases/tag/v0.4.0
[0.3.0]: https://github.com/yunmin311/context-distiller/releases/tag/v0.3.0
[0.2.0]: https://github.com/yunmin311/context-distiller/releases/tag/v0.2.0
[0.1.0]: https://github.com/yunmin311/context-distiller/releases/tag/v0.1.0
