import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type {
  ConversationInfo,
  ConversationMessage,
  Fragment,
  FragmentGroup,
  MessageSource,
  PresetOption,
  PresetScope,
  PromptSelections,
} from '../../lib/core/types';
import {
  browserUILanguage,
  resolveLang,
  t,
  type Lang,
  type LangPref,
  type UIKey,
} from '../../lib/i18n';
import { createId } from '../../lib/utils/id';
import { conversationKey } from '../../lib/utils/conversation-key';
import { readGate, sameMessages } from '../../lib/utils/read-governor';
import type { PastedTurn } from '../../lib/utils/paste-split';
import { sendToActiveTab } from './messaging';
import { loadPrefs, savePrefs, type Prefs } from './prefs';
import { loadSession, saveSession, clearSession, type SessionSnapshot } from './session';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The five default modules from 计划书 §6.3, in both languages.
 *
 * These titles are compiled into the message as section headers, so they follow
 * the chosen language. Switching language RELABELS them in place (see
 * `relabelDefaultGroups`) rather than recreating them, so the fragments already
 * grouped under a module stay exactly where the user put them.
 */
const DEFAULT_GROUPS: ReadonlyArray<Record<Lang, string>> = [
  { zh: '框架', en: 'Frame' },
  { zh: '正文内容', en: 'Body' },
  { zh: '补充', en: 'Supplement' },
  { zh: '复盘', en: 'Recap' },
  { zh: '关键语句', en: 'Key sentences' },
];

/**
 * Rename the built-in modules to `lang`. A module the USER created is never
 * touched, and neither is a built-in whose title matches neither language (it
 * came from an older version). Unchanged groups keep their object identity so
 * the memoized board doesn't re-render for nothing.
 */
function relabelDefaultGroups(groups: FragmentGroup[], lang: Lang): FragmentGroup[] {
  let changed = false;
  const next = groups.map((g) => {
    if (g.custom) return g;
    const spec = DEFAULT_GROUPS.find((d) => d.zh === g.title || d.en === g.title);
    if (!spec || spec[lang] === g.title) return g;
    changed = true;
    return { ...g, title: spec[lang] };
  });
  return changed ? next : groups;
}

export type SingleKey =
  | 'intent'
  | 'density'
  | 'writingStyle'
  | 'responseStructure'
  | 'outputFormat';

/** A local text selection made inside the side panel, ready to become a Fragment. */
export interface SelectionInput {
  text: string;
  role: 'user' | 'assistant';
  messageId?: string;
  sourceOrder: number;
  /** Optional note the user typed at selection time; becomes the fragment note. */
  note?: string;
}

export interface DistillerState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  /** i18n key for the failure, when the failure is one we word ourselves. */
  errorCode?: UIKey;
  /** Reads in flight RIGHT NOW (any kind). Drives the load bar; unlike `status`
   *  it counts BACKGROUND reads too, without strobing the foreground spinner. */
  busyReads: number;
  conversation?: ConversationInfo;
  messages: ConversationMessage[];
  partial: boolean;
  source?: MessageSource;
  groups: FragmentGroup[];
  selections: PromptSelections;
  /** User-defined requirements (session + long-term), appended after built-ins. */
  customExtras: PresetOption[];
  /** Reading marks (读时标记): messageId → note. A pure reading aid — NEVER
   *  compiled into the output. Persisted only when rememberSession is on. */
  marks: Record<string, string>;
  /** Opt-in: persist this session (conversation + material) and restore on reopen. */
  rememberSession: boolean;
  /** 便签: private annotation pad — pure personal notes. NEVER compiled into the
   *  output and never passed to compile(); persisted as long-term local config
   *  (like a custom requirement), so it survives across sessions regardless of
   *  「记住本次」. Deliberately kept out of `groups` / `selections` / `marks` so it
   *  can never leak into the compiled prompt. */
  scratchpad: string;
  /** Stored language preference (`auto` until the user picks one explicitly). */
  langPref: LangPref;
  /** The preference resolved to a concrete language — what the UI actually uses. */
  lang: Lang;
  /** True once long-term config has been loaded, so we don't save over it. */
  hydrated: boolean;
}

function createDefaultGroups(lang: Lang): FragmentGroup[] {
  return DEFAULT_GROUPS.map((spec, index) => ({
    id: createId('g'),
    title: spec[lang],
    order: index,
    fragments: [],
  }));
}

function emptySelections(): PromptSelections {
  return {
    intent: '',
    density: '',
    writingStyle: '',
    responseStructure: '',
    outputFormat: '',
    extras: [],
  };
}

function initialState(): DistillerState {
  // Before local config has loaded, follow the browser's UI language, so the
  // first paint is already in the right language instead of flashing Chinese.
  const lang = resolveLang('auto', browserUILanguage());
  return {
    status: 'idle',
    busyReads: 0,
    messages: [],
    partial: false,
    groups: createDefaultGroups(lang),
    selections: emptySelections(),
    customExtras: [],
    marks: {},
    rememberSession: false,
    scratchpad: '',
    langPref: 'auto',
    lang,
    hydrated: false,
  };
}

type Action =
  | { type: 'load-start'; background?: boolean }
  | {
      type: 'load-success';
      conversation: ConversationInfo;
      messages: ConversationMessage[];
      partial: boolean;
      source: MessageSource;
    }
  | { type: 'load-error'; error: string; code?: UIKey }
  | { type: 'load-abort' }
  | { type: 'merge-messages'; messages: ConversationMessage[] }
  | { type: 'paste-messages'; messages: ConversationMessage[] }
  | { type: 'reset' }
  | { type: 'add-fragment'; groupId: string; fragment: Fragment }
  | { type: 'remove-fragment'; groupId: string; fragmentId: string }
  | { type: 'move-fragment'; groupId: string; fragmentId: string; dir: -1 | 1 }
  | { type: 'move-to-group'; fromGroupId: string; toGroupId: string; fragmentId: string }
  | { type: 'set-note'; groupId: string; fragmentId: string; note: string }
  | { type: 'set-text'; groupId: string; fragmentId: string; text: string }
  | { type: 'add-group'; id: string; title: string; persist: boolean }
  | { type: 'remove-group'; groupId: string }
  | { type: 'set-single'; key: SingleKey; presetId: string }
  | { type: 'toggle-extra'; presetId: string }
  | { type: 'add-custom-extra'; option: PresetOption }
  | { type: 'update-custom-extra'; id: string; name: string; text: string }
  | { type: 'remove-custom-extra'; id: string }
  | { type: 'toggle-mark'; messageId: string }
  | { type: 'set-mark'; messageId: string; note: string }
  | { type: 'remove-mark'; messageId: string }
  | { type: 'hydrate-prefs'; prefs: Prefs; snapshot: SessionSnapshot | null }
  | { type: 'set-remember'; value: boolean }
  | { type: 'set-scratchpad'; text: string }
  | { type: 'set-lang'; pref: LangPref }
  | { type: 'clear-material' };

function mapGroup(
  groups: FragmentGroup[],
  groupId: string,
  fn: (g: FragmentGroup) => FragmentGroup,
): FragmentGroup[] {
  return groups.map((g) => (g.id === groupId ? fn(g) : g));
}

function reducer(state: DistillerState, action: Action): DistillerState {
  switch (action.type) {
    case 'load-start':
      // BACKGROUND reads must not strobe the foreground spinner: when a list is
      // already on screen, a poll/upgrade read only bumps busyReads (the load
      // bar's counter) and leaves status — and therefore the whole rendered
      // list — untouched.
      if (action.background && state.status === 'ready') {
        return { ...state, busyReads: state.busyReads + 1 };
      }
      return {
        ...state,
        status: 'loading',
        error: undefined,
        errorCode: undefined,
        busyReads: state.busyReads + 1,
      };

    case 'load-success': {
      // Switching to a DIFFERENT conversation must not carry the previous one's
      // material into the workspace — that silently mixed two threads. Module
      // structure (including long-term modules) is kept; only fragments are
      // dropped, and only when the conversation actually changed.
      const switched =
        !!state.conversation &&
        conversationKey(state.conversation.url) !== conversationKey(action.conversation.url);
      // Identical re-read (same conversation, same turns, same completeness):
      // settle back to 'ready' WITHOUT touching anything else — no list identity
      // churn (memoized rows don't re-render), no mark/group recomputation, and
      // the periodic stream poll stops being visible at all.
      if (
        !switched &&
        state.status === 'loading' &&
        state.partial === action.partial &&
        state.source === action.source &&
        sameMessages(state.messages, action.messages)
      ) {
        return {
          ...state,
          status: 'ready',
          error: undefined,
          errorCode: undefined,
          busyReads: Math.max(0, state.busyReads - 1),
        };
      }
      // Keep only marks whose message is still in the freshly read conversation —
      // a same-conversation refresh keeps its marks; switching conversations drops
      // stale ones so the 已标记 count never counts another thread's messages.
      const ids = new Set(action.messages.map((m) => m.id));
      const marks: Record<string, string> = {};
      for (const [id, note] of Object.entries(state.marks)) {
        if (ids.has(id)) marks[id] = note;
      }
      return {
        ...state,
        status: 'ready',
        error: undefined,
        errorCode: undefined,
        busyReads: Math.max(0, state.busyReads - 1),
        conversation: action.conversation,
        messages: action.messages,
        partial: action.partial,
        source: action.source,
        marks: switched ? {} : marks,
        groups: switched ? state.groups.map((g) => ({ ...g, fragments: [] })) : state.groups,
        selections: switched ? emptySelections() : state.selections,
      };
    }

    case 'load-error':
      return {
        ...state,
        status: 'error',
        error: action.error,
        errorCode: action.code,
        busyReads: Math.max(0, state.busyReads - 1),
      };

    case 'load-abort':
      // A BACKGROUND read (stream auto-refresh, growth re-read) failed: settle
      // back to what was on screen instead of getting stuck in 'loading' — the
      // user never asked for this read, so it must never surface an error screen.
      return {
        ...state,
        status: state.messages.length > 0 ? 'ready' : 'idle',
        error: undefined,
        errorCode: undefined,
        busyReads: Math.max(0, state.busyReads - 1),
      };

    case 'merge-messages': {
      // DEEP LOAD step: union of what we had with the fresh partial read, by
      // message id. On conflicting ids keep the LONGER text (a later read may
      // have captured a turn more completely). Marks survive untouched — they
      // reference ids that only ever grow here.
      const byId = new Map(state.messages.map((m) => [m.id, m] as const));
      for (const m of action.messages) {
        const prev = byId.get(m.id);
        byId.set(m.id, !prev || m.text.length > prev.text.length ? m : prev);
      }
      const merged = [...byId.values()].sort((a, b) => a.order - b.order);
      // A merge that adds NOTHING (the usual case once the list is complete) must
      // not churn list identity — every identity change re-renders the whole list
      // and re-runs the viewport effects. ChatGPT's progressive hydration fires
      // growth pushes in bursts; without this guard the panel strobes.
      if (sameMessages(state.messages, merged)) {
        return {
          ...state,
          status: 'ready',
          busyReads: Math.max(0, state.busyReads - 1),
        };
      }
      // Back to 'ready': the merge IS the completion of this background read.
      // Leaving 'loading' here kept the spinner alive forever AND gated the
      // viewport-anchor effect (which only runs when ready).
      return {
        ...state,
        status: 'ready',
        busyReads: Math.max(0, state.busyReads - 1),
        messages: merged,
      };
    }

    case 'paste-messages': {
      // Manual paste import: append the turns as REAL message rows (ids
      // `paste_…`), so pins, Q&A pairing, fragments and the session snapshot all
      // work on them unchanged. Orders continue after what's on screen; a paste
      // never claims a ChatGPT page position of its own (locate is hidden for
      // these rows). Landing on a non-empty list also settles the intro away.
      const base = state.messages.length;
      const appended = action.messages.map((m, i) => ({ ...m, order: base + i }));
      return {
        ...state,
        status: appended.length > 0 ? 'ready' : state.status,
        error: undefined,
        errorCode: undefined,
        messages: [...state.messages, ...appended],
      };
    }

    case 'reset':
      return {
        ...state,
        status: 'idle',
        error: undefined,
        errorCode: undefined,
        busyReads: 0,
        conversation: undefined,
        messages: [],
        partial: false,
        source: undefined,
      };

    case 'add-fragment':
      return {
        ...state,
        groups: mapGroup(state.groups, action.groupId, (g) => ({
          ...g,
          fragments: [...g.fragments, action.fragment],
        })),
      };

    case 'remove-fragment':
      return {
        ...state,
        groups: mapGroup(state.groups, action.groupId, (g) => ({
          ...g,
          fragments: g.fragments.filter((f) => f.id !== action.fragmentId),
        })),
      };

    case 'move-fragment':
      return {
        ...state,
        groups: mapGroup(state.groups, action.groupId, (g) => {
          const index = g.fragments.findIndex((f) => f.id === action.fragmentId);
          const target = index + action.dir;
          if (index < 0 || target < 0 || target >= g.fragments.length) return g;
          const next = [...g.fragments];
          const [moved] = next.splice(index, 1);
          next.splice(target, 0, moved!);
          return { ...g, fragments: next };
        }),
      };

    case 'move-to-group': {
      if (action.fromGroupId === action.toGroupId) return state;
      const source = state.groups.find((g) => g.id === action.fromGroupId);
      const fragment = source?.fragments.find((f) => f.id === action.fragmentId);
      if (!fragment) return state;
      return {
        ...state,
        groups: state.groups.map((g) => {
          if (g.id === action.fromGroupId) {
            return { ...g, fragments: g.fragments.filter((f) => f.id !== action.fragmentId) };
          }
          if (g.id === action.toGroupId) {
            return { ...g, fragments: [...g.fragments, fragment] };
          }
          return g;
        }),
      };
    }

    case 'set-note':
      return {
        ...state,
        groups: mapGroup(state.groups, action.groupId, (g) => ({
          ...g,
          fragments: g.fragments.map((f) =>
            f.id === action.fragmentId ? { ...f, note: action.note } : f,
          ),
        })),
      };

    case 'set-text':
      return {
        ...state,
        groups: mapGroup(state.groups, action.groupId, (g) => ({
          ...g,
          fragments: g.fragments.map((f) =>
            f.id === action.fragmentId ? { ...f, text: action.text } : f,
          ),
        })),
      };

    case 'add-group':
      return {
        ...state,
        groups: [
          ...state.groups,
          {
            id: action.id,
            title:
              action.title.trim() ||
              t(state.lang, 'module.fallback', { n: state.groups.length + 1 }),
            order: state.groups.length,
            fragments: [],
            custom: true,
            persist: action.persist,
          },
        ],
      };

    case 'remove-group':
      return { ...state, groups: state.groups.filter((g) => g.id !== action.groupId) };

    case 'set-single': {
      // Clicking the active option again clears it.
      const current = state.selections[action.key];
      return {
        ...state,
        selections: {
          ...state.selections,
          [action.key]: current === action.presetId ? '' : action.presetId,
        },
      };
    }

    case 'toggle-extra': {
      const has = state.selections.extras.includes(action.presetId);
      return {
        ...state,
        selections: {
          ...state.selections,
          extras: has
            ? state.selections.extras.filter((id) => id !== action.presetId)
            : [...state.selections.extras, action.presetId],
        },
      };
    }

    case 'add-custom-extra':
      return {
        ...state,
        customExtras: [...state.customExtras, action.option],
        // Auto-select the requirement the user just wrote.
        selections: {
          ...state.selections,
          extras: [...state.selections.extras, action.option.id],
        },
      };

    case 'update-custom-extra':
      return {
        ...state,
        customExtras: state.customExtras.map((e) =>
          e.id === action.id ? { ...e, name: action.name, text: action.text } : e,
        ),
      };

    case 'remove-custom-extra':
      return {
        ...state,
        customExtras: state.customExtras.filter((e) => e.id !== action.id),
        selections: {
          ...state.selections,
          extras: state.selections.extras.filter((id) => id !== action.id),
        },
      };

    case 'toggle-mark': {
      if (action.messageId in state.marks) {
        const next = { ...state.marks };
        delete next[action.messageId];
        return { ...state, marks: next };
      }
      return { ...state, marks: { ...state.marks, [action.messageId]: '' } };
    }

    case 'set-mark':
      return { ...state, marks: { ...state.marks, [action.messageId]: action.note } };

    case 'remove-mark': {
      if (!(action.messageId in state.marks)) return state;
      const next = { ...state.marks };
      delete next[action.messageId];
      return { ...state, marks: next };
    }

    case 'hydrate-prefs': {
      const { prefs, snapshot } = action;
      // The stored preference wins over the browser's UI language we guessed at
      // startup, and the built-in modules are relabelled to match it.
      const langPref: LangPref = prefs.lang ?? 'auto';
      const lang = resolveLang(langPref, browserUILanguage());
      // Opt-in full restore: use the saved working set verbatim ("原样恢复").
      if (snapshot) {
        return {
          ...state,
          langPref,
          lang,
          rememberSession: prefs.rememberSession,
          // 便签 is long-term config, not part of the session snapshot — always
          // restore it from prefs regardless of the remembered working set.
          scratchpad: prefs.scratchpad ?? '',
          busyReads: 0,
          conversation: snapshot.conversation,
          messages: snapshot.messages,
          partial: snapshot.partial,
          source: snapshot.source,
          status: snapshot.messages.length > 0 ? 'ready' : state.status,
          groups: relabelDefaultGroups(
            snapshot.groups.length > 0 ? snapshot.groups : state.groups,
            lang,
          ),
          selections: snapshot.selections,
          customExtras: snapshot.customExtras,
          marks: snapshot.marks ?? {},
          hydrated: true,
        };
      }
      // Default path: only long-term modules / requirements come back.
      const baseGroups = relabelDefaultGroups(state.groups, lang);
      const titles = new Set(baseGroups.map((g) => g.title));
      const restored: FragmentGroup[] = [];
      prefs.modules.forEach((title, i) => {
        if (titles.has(title)) return;
        titles.add(title);
        restored.push({
          id: createId('g'),
          title,
          order: baseGroups.length + i,
          fragments: [],
          custom: true,
          persist: true,
        });
      });
      const customExtras: PresetOption[] = prefs.extras.map((e) => ({
        id: e.id,
        name: e.name,
        text: e.text,
        group: 'extras',
        version: 1,
        custom: true,
        scope: 'persist',
      }));
      return {
        ...state,
        langPref,
        lang,
        rememberSession: prefs.rememberSession,
        scratchpad: prefs.scratchpad ?? '',
        groups: [...baseGroups, ...restored],
        customExtras,
        hydrated: true,
      };
    }

    case 'set-lang': {
      const lang = resolveLang(action.pref, browserUILanguage());
      if (action.pref === state.langPref && lang === state.lang) return state;
      return {
        ...state,
        langPref: action.pref,
        lang,
        groups: relabelDefaultGroups(state.groups, lang),
      };
    }

    case 'set-remember':
      return { ...state, rememberSession: action.value };

    case 'set-scratchpad':
      return { ...state, scratchpad: action.text };

    case 'clear-material':
      // Clear MATERIAL (fragments + marks + selections) — keep the module
      // structure and custom requirements.
      return {
        ...state,
        groups: state.groups.map((g) => ({ ...g, fragments: [] })),
        selections: emptySelections(),
        marks: {},
      };

    default:
      return state;
  }
}

export function useDistiller() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  // Load long-term config once, on mount. If "记住本次整理" is on and a snapshot
  // exists, restore the whole working set; otherwise make sure nothing conversation
  // -related is left on disk.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const prefs = await loadPrefs();
      if (!prefs.rememberSession) void clearSession();
      const snapshot = prefs.rememberSession ? await loadSession() : null;
      if (alive) dispatch({ type: 'hydrate-prefs', prefs, snapshot });
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Mirror the long-term (persist-scoped) items to local config when they
  // change. Guarded by `hydrated` so the initial empty state never overwrites
  // stored config, and by a signature so ordinary edits don't spam writes.
  const lastSaved = useRef('');
  useEffect(() => {
    if (!state.hydrated) return;
    const prefs: Prefs = {
      rememberSession: state.rememberSession,
      modules: state.groups.filter((g) => g.persist).map((g) => g.title),
      extras: state.customExtras
        .filter((e) => e.scope === 'persist')
        .map((e) => ({ id: e.id, name: e.name, text: e.text })),
      scratchpad: state.scratchpad,
      lang: state.langPref,
    };
    const signature = JSON.stringify(prefs);
    if (signature === lastSaved.current) return;
    lastSaved.current = signature;
    void savePrefs(prefs);
  }, [
    state.groups,
    state.customExtras,
    state.hydrated,
    state.rememberSession,
    state.scratchpad,
    state.langPref,
  ]);

  // Opt-in session snapshot: while "记住本次整理" is on, mirror the working set
  // (conversation + material + selections) to storage so reopening restores it.
  // DEBOUNCED: rapid edits (typing a note, reordering) only reset the timer, so we
  // serialize the whole snapshot + write to storage at most once per settle window
  // — never synchronously on every keystroke. A signature skips no-op writes.
  const lastSession = useRef('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!state.hydrated || !state.rememberSession) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const snapshot = {
        conversation: state.conversation,
        messages: state.messages,
        partial: state.partial,
        source: state.source,
        groups: state.groups,
        selections: state.selections,
        customExtras: state.customExtras,
        marks: state.marks,
      };
      const signature = JSON.stringify(snapshot);
      if (signature === lastSession.current) return;
      lastSession.current = signature;
      void saveSession(snapshot);
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [
    state.hydrated,
    state.rememberSession,
    state.conversation,
    state.messages,
    state.partial,
    state.source,
    state.groups,
    state.selections,
    state.customExtras,
    state.marks,
  ]);

  /**
   * Outcome of a load, returned so the caller can show a transient hint.
   *
   * `quiet` keeps the panel in its loading state on failure instead of flipping to
   * the error screen — used for every attempt but the last, so a slow / still-
   * loading page doesn't flash "读取失败" while we're patiently retrying.
   */
  const loadConversation = useCallback(
    async (
      quiet = false,
      opts?: { background?: boolean; merge?: boolean; domOnly?: boolean; force?: boolean },
    ): Promise<{
      ok: boolean;
      count: number;
      partial: boolean;
      error?: string;
      code?: UIKey;
      /** True when the read-gate refused the backend read (throttle policy). */
      skipped?: boolean;
    }> => {
      // READ GATE: every BACKEND read shares the user's ChatGPT rate-limit
      // budget with the page itself, so automatic triggers (stream poll,
      // catch-up, growth upgrade) may be REFUSED when one just ran or is still
      // running. domOnly reads are pure DOM — never gated. User-invoked reads
      // pass `force` (skips the gap, still never concurrent).
      const backend = opts?.domOnly !== true;
      if (backend && !readGate.admit(opts?.force === true)) {
        return { ok: false, count: 0, partial: false, skipped: true };
      }
      try {
        dispatch({ type: 'load-start', background: opts?.background === true });
        const res = await sendToActiveTab({ kind: 'get-conversation', domOnly: opts?.domOnly === true });
        if (res.kind === 'conversation' && res.ok) {
          if (opts?.merge && res.partial) {
            // DEEP LOAD step: grow the list instead of replacing it, so walking
            // the page accumulates the whole thread across partial reads.
            dispatch({ type: 'merge-messages', messages: res.messages });
          } else {
            dispatch({
              type: 'load-success',
              conversation: res.conversation,
              messages: res.messages,
              partial: res.partial,
              source: res.source,
            });
          }
          return { ok: true, count: res.messages.length, partial: res.partial };
        }
        const failed =
          (res.kind === 'conversation' && !res.ok) || res.kind === 'error' ? res : undefined;
        const error = failed?.error ?? '读取对话失败。';
        const code = failed?.code ?? 'err.readFailed';
        // Quiet/background failures are invisible BY DESIGN in the UI — leave a
        // trace in the panel console so a "nothing happened" report is diagnosable
        // (panel DevTools → console).
        console.warn(`[Context Distiller] read failed (${code}): ${error}`);
        if (!quiet) dispatch({ type: 'load-error', error, code });
        else if (opts?.background) dispatch({ type: 'load-abort' });
        return { ok: false, count: 0, partial: false, error, code };
      } finally {
        // A failed request consumed rate-limit budget just the same — stamp it.
        if (backend) readGate.release();
      }
    },
    [],
  );

  /**
   * "重试" WITHOUT touching the user's tab: quiet in-place attempts with a
   * short backoff. v1.3 reloaded the ChatGPT tab for the user and polled it up
   * to 30 times — hostile when they were mid-something in that tab. Self-heal
   * already re-injects an orphaned content script transparently; anything
   * deeper (stale page, logged out) needs a human at the keyboard anyway, and
   * the error screen says so. Early attempts are DOM-only (instant once the
   * page has anything mounted); the final attempt may hit the backend.
   */
  const retryRead = useCallback(
    async (): Promise<{ ok: boolean; count: number; partial: boolean }> => {
      dispatch({ type: 'load-start' });
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (attempt > 0) await delay(800 * attempt);
        const res = await sendToActiveTab({
          kind: 'get-conversation',
          domOnly: attempt < 2,
        });
        if (res.kind === 'conversation' && res.ok) {
          dispatch({
            type: 'load-success',
            conversation: res.conversation,
            messages: res.messages,
            partial: res.partial,
            source: res.source,
          });
          return { ok: true, count: res.messages.length, partial: res.partial };
        }
      }
      dispatch({ type: 'load-error', error: '未读取到消息。', code: 'err.noMessages' });
      return { ok: false, count: 0, partial: false };
    },
    [],
  );

  const addMessageFragment = useCallback(
    (message: ConversationMessage, groupId: string) => {
      const fragment: Fragment = {
        id: createId('f'),
        messageId: message.id,
        role: message.role === 'system' ? 'assistant' : message.role,
        text: message.text,
        sourceOrder: message.order,
        whole: true,
      };
      dispatch({ type: 'add-fragment', groupId, fragment });
    },
    [],
  );

  const addSelection = useCallback((groupId: string, payload: SelectionInput) => {
    dispatch({
      type: 'add-fragment',
      groupId,
      fragment: {
        id: createId('f'),
        messageId: payload.messageId,
        role: payload.role,
        text: payload.text,
        sourceOrder: payload.sourceOrder,
        whole: false,
        note: payload.note,
      },
    });
  }, []);

  /**
   * Paste import — the product's floor when reading is unavailable. Turns join
   * state.messages as real rows, so every downstream behavior (pins, Q&A
   * pairing, fragments, snapshot) works unchanged. Returns how many landed.
   */
  const addPastedMessages = useCallback((turns: PastedTurn[]): number => {
    if (turns.length === 0) return 0;
    const messages: ConversationMessage[] = turns.map((turn) => ({
      id: createId('paste'),
      role: turn.role,
      text: turn.text,
      order: 0, // assigned by the reducer, continuing after what's on screen
      source: 'pasted',
    }));
    dispatch({ type: 'paste-messages', messages });
    return messages.length;
  }, []);

  const actions = useMemo(
    () => ({
      loadConversation,
      retryRead,
      addMessageFragment,
      addSelection,
      addPastedMessages,
      removeFragment: (groupId: string, fragmentId: string) =>
        dispatch({ type: 'remove-fragment', groupId, fragmentId }),
      moveFragment: (groupId: string, fragmentId: string, dir: -1 | 1) =>
        dispatch({ type: 'move-fragment', groupId, fragmentId, dir }),
      moveToGroup: (fromGroupId: string, toGroupId: string, fragmentId: string) =>
        dispatch({ type: 'move-to-group', fromGroupId, toGroupId, fragmentId }),
      setNote: (groupId: string, fragmentId: string, note: string) =>
        dispatch({ type: 'set-note', groupId, fragmentId, note }),
      setText: (groupId: string, fragmentId: string, text: string) =>
        dispatch({ type: 'set-text', groupId, fragmentId, text }),
      /** Create a module; returns its id so the caller can make it active. */
      addGroup: (title: string, persist = false): string => {
        const id = createId('g');
        dispatch({ type: 'add-group', id, title, persist });
        return id;
      },
      removeGroup: (groupId: string) => dispatch({ type: 'remove-group', groupId }),
      setSingle: (key: SingleKey, presetId: string) =>
        dispatch({ type: 'set-single', key, presetId }),
      toggleExtra: (presetId: string) => dispatch({ type: 'toggle-extra', presetId }),
      addCustomExtra: (name: string, text: string, scope: PresetScope): string => {
        const id = createId('ex');
        dispatch({
          type: 'add-custom-extra',
          option: { id, name, text, group: 'extras', version: 1, custom: true, scope },
        });
        return id;
      },
      updateCustomExtra: (id: string, name: string, text: string) =>
        dispatch({ type: 'update-custom-extra', id, name, text }),
      removeCustomExtra: (id: string) => dispatch({ type: 'remove-custom-extra', id }),
      /** 读时标记: toggle a message's mark, edit its note, or remove it. Never compiled. */
      toggleMark: (messageId: string) => dispatch({ type: 'toggle-mark', messageId }),
      setMarkNote: (messageId: string, note: string) =>
        dispatch({ type: 'set-mark', messageId, note }),
      removeMark: (messageId: string) => dispatch({ type: 'remove-mark', messageId }),
      clearMaterial: () => dispatch({ type: 'clear-material' }),
      reset: () => dispatch({ type: 'reset' }),
      /** Toggle opt-in session persistence; turning it off purges the snapshot. */
      setRemember: (value: boolean) => {
        dispatch({ type: 'set-remember', value });
        if (!value) {
          lastSession.current = '';
          void clearSession();
        }
      },
      /** 便签: update the private annotation pad. Never compiled into the output. */
      setScratchpad: (text: string) => dispatch({ type: 'set-scratchpad', text }),
      /** Pin the interface + compiled-prompt language (persisted as config). */
      setLang: (pref: LangPref) => dispatch({ type: 'set-lang', pref }),
    }),
    [loadConversation, retryRead, addMessageFragment, addSelection, addPastedMessages],
  );

  return { state, actions };
}

