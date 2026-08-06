import { useCallback, useMemo, useReducer } from 'react';
import type {
  ConversationInfo,
  ConversationMessage,
  Fragment,
  FragmentGroup,
  MessageSource,
  PromptSelections,
} from '../../lib/core/types';
import { createId } from '../../lib/utils/id';
import { sendToActiveTab } from './messaging';

/** The five default modules from 计划书 §6.3. */
const DEFAULT_GROUP_TITLES = ['框架', '正文内容', '补充', '复盘', '关键语句'] as const;

export type SingleKey = 'intent' | 'density' | 'writingStyle' | 'responseStructure';

/** A local text selection made inside the side panel, ready to become a Fragment. */
export interface SelectionInput {
  text: string;
  role: 'user' | 'assistant';
  messageId?: string;
  sourceOrder: number;
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
  return { intent: '', density: '', writingStyle: '', responseStructure: '', extras: [] };
}

function initialState(): DistillerState {
  return {
    status: 'idle',
    messages: [],
    partial: false,
    groups: createDefaultGroups(),
    selections: emptySelections(),
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
  | { type: 'add-group'; title: string }
  | { type: 'remove-group'; groupId: string }
  | { type: 'set-single'; key: SingleKey; presetId: string }
  | { type: 'toggle-extra'; presetId: string }
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
            id: createId('g'),
            title: action.title.trim() || `模块 ${state.groups.length + 1}`,
            order: state.groups.length,
            fragments: [],
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

    case 'clear-material':
      return {
        ...state,
        groups: createDefaultGroups(),
        selections: emptySelections(),
      };

    default:
      return state;
  }
}

export function useDistiller() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

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
      },
    });
  }, []);

  const actions = useMemo(
    () => ({
      loadConversation,
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
      addGroup: (title: string) => dispatch({ type: 'add-group', title }),
      removeGroup: (groupId: string) => dispatch({ type: 'remove-group', groupId }),
      setSingle: (key: SingleKey, presetId: string) =>
        dispatch({ type: 'set-single', key, presetId }),
      toggleExtra: (presetId: string) => dispatch({ type: 'toggle-extra', presetId }),
      clearMaterial: () => dispatch({ type: 'clear-material' }),
      reset: () => dispatch({ type: 'reset' }),
    }),
    [loadConversation, addMessageFragment, addSelection],
  );

  return { state, actions };
}
