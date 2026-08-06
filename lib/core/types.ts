/**
 * Core data model for Context Distiller.
 *
 * The MVP does no persistence: every object here lives only in the Side Panel's
 * in-memory React state for the duration of one distillation session. There is
 * deliberately no `Project`, no database key, no sync state, no export file
 * type and no final-answer object — those are out of scope by design.
 */

export type MessageRole = 'user' | 'assistant' | 'system';

/** Where a message's text came from — the page's internal data, or the DOM. */
export type MessageSource = 'page-data' | 'dom';

/** High-level info about the conversation currently open on the page. */
export interface ConversationInfo {
  /** Human-readable conversation title (best effort). */
  title: string;
  /** URL of the tab the conversation was read from. */
  url: string;
  /** Adapter id the conversation was read through, e.g. `chatgpt`. */
  platform: string;
}

/** A single normalized message in the conversation. */
export interface ConversationMessage {
  id: string;
  role: MessageRole;
  text: string;
  /** 0-based position in the conversation, ascending with time. */
  order: number;
  source?: MessageSource;
}

/**
 * A piece of material the user selected. It may be a whole message or a local
 * text selection inside one. All selection methods normalize to a Fragment so
 * the grouping and compilation logic never depends on how it was selected.
 */
export interface Fragment {
  id: string;
  /** The message this fragment came from, when known. */
  messageId?: string;
  role: 'user' | 'assistant';
  text: string;
  /** Order of the source message, used to keep material roughly chronological. */
  sourceOrder: number;
  /** Optional short note the user attached to this fragment. */
  note?: string;
  /** True when this fragment is a whole message — used to prevent duplicate adds. */
  whole?: boolean;
}

/** A user-defined module (e.g. 框架 / 正文内容 / 关键语句) holding fragments. */
export interface FragmentGroup {
  id: string;
  title: string;
  order: number;
  fragments: Fragment[];
  /** User-added module (not one of the defaults). */
  custom?: boolean;
  /** Long-term module: recreated on future sessions (saved to local config). */
  persist?: boolean;
}

/** session = only this session; persist = remembered long-term (local config). */
export type PresetScope = 'session' | 'persist';

/** The set of preset-button choices for the current compilation. */
export interface PromptSelections {
  /** Output-purpose preset id, or '' for none. */
  intent: string;
  /** Knowledge-density preset id, or ''. */
  density: string;
  /** Writing-style preset id, or ''. */
  writingStyle: string;
  /** Output-structure preset id, or ''. */
  responseStructure: string;
  /** Additional-requirement preset ids (multi-select). */
  extras: string[];
}

/** The complete in-memory state of one distillation session. */
export interface DistillationSession {
  conversation: ConversationInfo;
  groups: FragmentGroup[];
  selections: PromptSelections;
}

// --- Preset library types ------------------------------------------------

export type PresetGroupId =
  | 'intent'
  | 'density'
  | 'writingStyle'
  | 'responseStructure'
  | 'extras';

/**
 * A single preset button. `text` is the exact Prompt fragment inserted into the
 * compiled message. Presets are authored, versioned and tested by the developer
 * — they are product configuration, not a user prompt collection.
 */
export interface PresetOption {
  id: string;
  name: string;
  group: PresetGroupId;
  text: string;
  version: number;
  /** Optional one-line explanation shown in the UI. */
  hint?: string;
  /** True for a user-defined requirement (editable / deletable in the UI). */
  custom?: boolean;
  /** For custom requirements: session-only or remembered long-term. */
  scope?: PresetScope;
}
