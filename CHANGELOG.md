# Changelog

All notable changes to Context Distiller are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Reworded the **对话续接 (handoff)** preset to explicitly cover migrating the
  distilled context into a new conversation or a different model, and note in
  the README that opening the side panel auto-reads the current conversation.

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

[Unreleased]: https://github.com/yunmin311/context-distiller/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yunmin311/context-distiller/releases/tag/v0.1.0
