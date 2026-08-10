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
import { createId } from '../../lib/utils/id';
import { reloadActiveTab, sendToActiveTab } from './messaging';
import { loadPrefs, savePrefs, type Prefs } from './prefs';
import { loadSession, saveSession, clearSession, type SessionSnapshot } from './session';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The five default modules from 计划书 §6.3. */
const DEFAULT_GROUP_TITLES = ['框架', '正文内容', '补充', '复盘', '关键语句'] as const;

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
  conversation?: ConversationInfo;
  messages: ConversationMessage[];
  partial: boolean;
  source?: MessageSource;
  groups: FragmentGroup[];
  selections: PromptSelections;
  /** User-defined requirements (session + long-term), appended after built-ins. */
  customExtras: PresetOption[];
  /** Opt-in: persist this session (conversation + material) and restore on reopen. */
  rememberSession: boolean;
  /** True once long-term config has been loaded, so we don't save over it. */
  hydrated: boolean;
}

function createDefaultGroups(): FragmentGroup[] {
  return DEFAULT_GROUP_TITLES.map((title, index) => ({
    id: createId('g'),
    title,
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
  return {
    status: 'idle',
    messages: [],
    partial: false,
    groups: createDefaultGroups(),
    selections: emptySelections(),
    customExtras: [],
    rememberSession: false,
    hydrated: false,
  };
}

type Action =
  | { type: 'load-start' }
  | {
      type: 'load-success';
      conversation: ConversationInfo;
      messages: ConversationMessage[];
      partial: boolean;
      source: MessageSource;
    }
  | { type: 'load-error'; error: string }
  | { type: 'reset' }
  | { type: 'add-fragment'; groupId: string; fragment: Fragment }
  | { type: 'remove-fragment'; groupId: string; fragmentId: string }
  | { type: 'move-fragment'; groupId: string; fragmentId: string; dir: -1 | 1 }
  | { type: 'move-to-group'; fromGroupId: string; toGroupId: string; fragmentId: string }
  | { type: 'set-note'; groupId: string; fragmentId: string; note: string }
  | { type: 'add-group'; id: string; title: string; persist: boolean }
  | { type: 'remove-group'; groupId: string }
  | { type: 'set-single'; key: SingleKey; presetId: string }
  | { type: 'toggle-extra'; presetId: string }
  | { type: 'add-custom-extra'; option: PresetOption }
  | { type: 'update-custom-extra'; id: string; name: string; text: string }
  | { type: 'remove-custom-extra'; id: string }
  | { type: 'hydrate-prefs'; prefs: Prefs; snapshot: SessionSnapshot | null }
  | { type: 'set-remember'; value: boolean }
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
      return { ...state, status: 'loading', error: undefined };

    case 'load-success':
      return {
        ...state,
        status: 'ready',
        error: undefined,
        conversation: action.conversation,
        messages: action.messages,
        partial: action.partial,
        source: action.source,
      };

    case 'load-error':
      return { ...state, status: 'error', error: action.error };

    case 'reset':
      return {
        ...state,
        status: 'idle',
        error: undefined,
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

    case 'add-group':
      return {
        ...state,
        groups: [
          ...state.groups,
          {
            id: action.id,
            title: action.title.trim() || `模块 ${state.groups.length + 1}`,
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

    case 'hydrate-prefs': {
      const { prefs, snapshot } = action;
      // Opt-in full restore: use the saved working set verbatim ("原样恢复").
      if (snapshot) {
        return {
          ...state,
          rememberSession: prefs.rememberSession,
          conversation: snapshot.conversation,
          messages: snapshot.messages,
          partial: snapshot.partial,
          source: snapshot.source,
          status: snapshot.messages.length > 0 ? 'ready' : state.status,
          groups: snapshot.groups.length > 0 ? snapshot.groups : state.groups,
          selections: snapshot.selections,
          customExtras: snapshot.customExtras,
          hydrated: true,
        };
      }
      // Default path: only long-term modules / requirements come back.
      const titles = new Set(state.groups.map((g) => g.title));
      const restored: FragmentGroup[] = [];
      prefs.modules.forEach((title, i) => {
        if (titles.has(title)) return;
        titles.add(title);
        restored.push({
          id: createId('g'),
          title,
          order: state.groups.length + i,
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
        rememberSession: prefs.rememberSession,
        groups: [...state.groups, ...restored],
        customExtras,
        hydrated: true,
      };
    }

    case 'set-remember':
      return { ...state, rememberSession: action.value };

    case 'clear-material':
      // Clear MATERIAL only — keep the module structure and custom requirements.
      return {
        ...state,
        groups: state.groups.map((g) => ({ ...g, fragments: [] })),
        selections: emptySelections(),
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
    };
    const signature = JSON.stringify(prefs);
    if (signature === lastSaved.current) return;
    lastSaved.current = signature;
    void savePrefs(prefs);
  }, [state.groups, state.customExtras, state.hydrated, state.rememberSession]);

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
  ]);

  /** Outcome of a load, returned so the caller can show a transient hint. */
  const loadConversation = useCallback(
    async (): Promise<{ ok: boolean; count: number; partial: boolean }> => {
      dispatch({ type: 'load-start' });
      const res = await sendToActiveTab({ kind: 'get-conversation' });
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
      const error =
        res.kind === 'conversation' && !res.ok
          ? res.error
          : res.kind === 'error'
            ? res.error
            : '读取对话失败。';
      dispatch({ type: 'load-error', error });
      return { ok: false, count: 0, partial: false };
    },
    [],
  );

  /**
   * Reload the page for the user, then poll until the freshly loaded content
   * script answers (re-injects at document_idle, then ChatGPT renders — a few
   * seconds). Saves the user a manual refresh after a read failure.
   */
  const retryWithReload = useCallback(
    async (): Promise<{ ok: boolean; count: number; partial: boolean }> => {
      dispatch({ type: 'load-start' });
      const reloaded = await reloadActiveTab();
      if (!reloaded) {
        dispatch({
          type: 'load-error',
          error: '请先切换到并聚焦 ChatGPT 对话标签页（chatgpt.com），再点重试。',
        });
        return { ok: false, count: 0, partial: false };
      }
      for (let attempt = 0; attempt < 14; attempt += 1) {
        await delay(700);
        const res = await sendToActiveTab({ kind: 'get-conversation' });
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
      dispatch({
        type: 'load-error',
        error: '刷新后仍未读取到消息，请确认页面已打开一个对话后再重试。',
      });
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

  const actions = useMemo(
    () => ({
      loadConversation,
      retryWithReload,
      addMessageFragment,
      addSelection,
      removeFragment: (groupId: string, fragmentId: string) =>
        dispatch({ type: 'remove-fragment', groupId, fragmentId }),
      moveFragment: (groupId: string, fragmentId: string, dir: -1 | 1) =>
        dispatch({ type: 'move-fragment', groupId, fragmentId, dir }),
      moveToGroup: (fromGroupId: string, toGroupId: string, fragmentId: string) =>
        dispatch({ type: 'move-to-group', fromGroupId, toGroupId, fragmentId }),
      setNote: (groupId: string, fragmentId: string, note: string) =>
        dispatch({ type: 'set-note', groupId, fragmentId, note }),
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
    }),
    [loadConversation, retryWithReload, addMessageFragment, addSelection],
  );

  return { state, actions };
}
