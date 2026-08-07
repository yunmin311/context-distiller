/**
 * Local config for the user's own reusable bits — long-term custom modules and
 * custom requirements. This is CONFIG, never conversation data: selected
 * material and compiled text are still session-only and never persisted, so the
 * privacy promise holds. Session-scoped items never touch storage at all.
 */

const KEY = 'cd-prefs-v1';

/** A requirement the user chose to remember long-term. */
export interface StoredExtra {
  id: string;
  name: string;
  text: string;
}

export interface Prefs {
  /** Long-term custom module titles, recreated at the start of each session. */
  modules: string[];
  /** Long-term custom requirements. */
  extras: StoredExtra[];
}

const EMPTY: Prefs = { modules: [], extras: [] };

// Defensive caps: config could be corrupted (hand-edited storage, an older bug,
// a pathological accumulation). Bound counts and lengths so a bad blob can never
// bloat memory or the render, and coerce every field to the expected type.
const MAX_ITEMS = 50;
const clampStr = (s: unknown, max: number): string =>
  typeof s === 'string' ? s.slice(0, max) : '';

export async function loadPrefs(): Promise<Prefs> {
  try {
    const got = await browser.storage?.local?.get(KEY);
    const p = got?.[KEY] as Partial<Prefs> | undefined;
    const rawModules = Array.isArray(p?.modules) ? p!.modules : [];
    const rawExtras = Array.isArray(p?.extras) ? p!.extras : [];
    return {
      modules: rawModules
        .filter((m): m is string => typeof m === 'string' && m.length > 0)
        .map((m) => m.slice(0, 80))
        .slice(0, MAX_ITEMS),
      extras: rawExtras
        .filter(
          (e): e is StoredExtra =>
            !!e && typeof e.id === 'string' && typeof e.text === 'string',
        )
        .slice(0, MAX_ITEMS)
        .map((e) => {
          const text = clampStr(e.text, 4000);
          return {
            id: e.id,
            text,
            name: clampStr(e.name, 40) || text.trim().slice(0, 14) || '要求',
          };
        }),
    };
  } catch {
    return EMPTY;
  }
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  try {
    await browser.storage?.local?.set({ [KEY]: prefs });
  } catch {
    // Storage unavailable — long-term memory silently degrades to session-only.
  }
}
