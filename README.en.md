<div align="center">

<img src="public/icon/128.png" width="72" height="72" alt="Context Distiller" />

# Context Distiller

**A temporary "select material + compile a Prompt" workbench that runs beside your AI chat**

Before you hand material to the AI, it hands the **choice of what, the way it's organized, and the control over the generation instructions** back to you.

[中文](README.md) · **English**

![Manifest V3](https://img.shields.io/badge/Manifest-V3-1f1f1f)
![WXT](https://img.shields.io/badge/built%20with-WXT-1f1f1f)
![React](https://img.shields.io/badge/React-19-1f1f1f)
![TypeScript](https://img.shields.io/badge/TypeScript-5-1f1f1f)
![Vitest](https://img.shields.io/badge/tested%20with-Vitest-1f1f1f)
![License](https://img.shields.io/badge/license-MIT-1f1f1f)
![Privacy](https://img.shields.io/badge/privacy-no_server_no_tracking-3a8a5f)

</div>

<div align="center">

<img src="docs/screenshots/messages.png" width="800" alt="Context Distiller docked next to a real ChatGPT conversation, reading it and selecting material" />

<sub>Real screenshot · docked beside a ChatGPT conversation, reading the current thread · select by highlight / whole message (the side panel strips Markdown markers for clean reading)</sub>

<br /><br />

<img src="docs/screenshots/workspace.png" width="212" alt="All preset Prompts at a glance: purpose / density / style / structure / format + extras" />
&nbsp;&nbsp;
<img src="docs/screenshots/preview.png" width="212" alt="Preview of the deterministically compiled full prompt" />

<br />

<sub>All preset Prompts at a glance (purpose / density / style / structure / format + extras)&nbsp;&nbsp;·&nbsp;&nbsp;preview of the deterministically compiled prompt (keeps the original Markdown)</sub>

</div>

---

## What it is

Context Distiller does not "let the extension summarize the conversation for you." It solves a different problem: **before you hand material to the AI, put you back in control.** Between a long conversation and the final generation, it adds one lightweight, visible, deterministic input-compilation step — it does not compete with the model, nor duplicate its compute. It does exactly one thing: **take the material you picked plus the preset Prompts, and concatenate them into a single plain-text message in a fixed order.**

> The extension prepares the input, you confirm the input, and your own AI generates the result.

By design it is deliberately **quiet and blends into ChatGPT**: neutral colors, minimal controls, never stealing the show.

## Product boundaries (MVP)

| Does | Does not |
| --- | --- |
| Read the current ChatGPT conversation and normalize it | Call an AI / model API |
| Multi-granularity selection (whole message / Q&A / highlight) | Save history projects or a long-term fragment library |
| Group, reorder and annotate material in a temporary board | Generate PDF / Word / Markdown files |
| Preset Prompts → compile plain text in a fixed order | Auto-send messages |
| Copy / fill back into the composer | Server, account, cloud sync |

Once you close or refresh the side panel, **the material you organized is gone** — a deliberate product trade-off (so it never turns into a note vault). The only thing you can optionally keep is your own config: the custom module names and custom requirements you mark "long-term" (stored locally, never conversation content). See the [Privacy notes](docs/PRIVACY.md).

## Core features

- **Conversation reading**: a main-world path that reads ChatGPT's internal React data (more accurate for code blocks) + a DOM fallback, distinguishing user / AI. The side panel strips Markdown markers on display (`##`, `**`, `>`, …) for clean reading; the original text handed to the AI is preserved.
- **Multi-granularity selection**: a whole message, a Q&A pair, or **highlight text inside a message** to extract that exact fragment.
- **Temporary grouping**: five default modules ("Framework / Body / Supplement / Recap / Key sentences"), reorderable, annotatable, add/remove. A sticky selector up top switches the "add-to" target any time and creates new modules (optionally "this session / long-term").
- **Preset Prompts**: output purpose / knowledge density / writing style / output structure / output format (single-select; output format includes plain text · Markdown · HTML · PDF layout) + additional requirements (multi-select, collapsible when long). Each button maps to exactly one author-maintained, versioned Prompt — **the extension does no AI processing whatsoever**. Additional requirements support **user customization** (add/edit/remove, optionally long-term). "Output format" is only an instruction telling the AI to answer in that format; the extension itself produces no files.
- **Deterministic compilation**: a pure function concatenates in a fixed order — the same input always yields the same output; special characters and code pass through verbatim.
- **Hand back to the conversation**: a full preview → copy or fill the ChatGPT composer, and it **never auto-sends**.

## How it works

```
Open a long ChatGPT conversation
      │  the extension reads and normalizes the current thread
Pick whole messages / Q&A pairs / highlighted fragments
      │  they enter the temporary side-panel workspace
Group, reorder, add notes
      │  click the preset buttons at the bottom
Base Prompt + preset Prompts + your material
      │  deterministic concatenation
One complete plain-text message
      │  copy  or  fill the composer
You review, then send it yourself → your own AI does the final generation
```

For architecture details, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tech stack

| Layer | Choice |
| --- | --- |
| Extension standard | Manifest V3 |
| Framework | [WXT](https://wxt.dev) |
| Language / UI | TypeScript · React 19 |
| Browser capability | Chrome Side Panel API |
| Page access | Content Script (isolated world) + Main World injected script |
| Unit tests | Vitest |

## Quick start

```bash
pnpm install       # install deps (auto-runs wxt prepare to generate types)
pnpm dev           # dev mode: opens Chrome with the extension, hot reload
pnpm build         # production build → .output/chrome-mv3
pnpm zip           # package → .output/*.zip (store flow: docs/STORE.md)
pnpm test          # unit tests
pnpm typecheck     # type check
```

> Requirements: Node.js ≥ 20, [pnpm](https://pnpm.io) ≥ 9, Chrome / Edge (with Side Panel API support).

### Manual load

1. `pnpm build`
2. Open `chrome://extensions` (Edge: `edge://extensions`) and enable "Developer mode"
3. "Load unpacked" → select `.output/chrome-mv3`
4. Open a [chatgpt.com](https://chatgpt.com) conversation and click the toolbar icon to open the side panel

Full usage: [docs/USAGE.md](docs/USAGE.md).

## Project structure

```
context-distiller/
├─ entrypoints/            # extension entrypoints (WXT convention)
│  ├─ background.ts        # Service Worker
│  ├─ chatgpt.content.ts   # Content Script (isolated world)
│  ├─ chatgpt-main-world.ts# Main World bridge (reads page internals)
│  └─ sidepanel/           # React side panel
├─ lib/                    # browser-agnostic core (unit-testable)
│  ├─ core/                # data model · preset library · Prompt compiler ★
│  ├─ platform/            # platform adapter · normalizer
│  └─ messaging/           # three-hop messaging protocol
└─ docs/                   # architecture / privacy / usage
```

★ = the deterministic core of the product, locked down by unit tests.

## Testing

```bash
pnpm test
```

Unit tests cover the deterministic core: the Prompt compiler (determinism, fixed order, extras in library order, empty material, special-character passthrough, unknown presets skipped) and the normalizer (role detection, whitespace, dedup). The parts that depend on the real ChatGPT DOM are verified manually / with Playwright in the browser; the checklist is in [docs/USAGE.md](docs/USAGE.md).

## Privacy

Least privilege, least retention. It runs only on chatgpt.com / chat.openai.com, processes only the current conversation page, never reads accounts or cookies, and never uploads to a server. Conversation content and selected material live **in memory only, never on disk**; local storage is used solely for the custom modules / requirements you actively mark "long-term" (config, not conversation). See [docs/PRIVACY.md](docs/PRIVACY.md).

## Roadmap

- **MVP** ✅ ChatGPT reading, multi-granularity selection, temporary grouping, preset compilation, copy & fill
- **Beta** ◻ virtual-list enhancements, search-to-locate, selector resilience, keyboard shortcuts, error recovery
- **Later** ◻ Claude / Gemini adapters, more validated presets, optional user-defined presets

## Changelog

Per-version changes are in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
