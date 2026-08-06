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

export async function loadPrefs(): Promise<Prefs> {
  try {
    const got = await browser.storage?.local?.get(KEY);
    const p = got?.[KEY] as Partial<Prefs> | undefined;
    return {
      modules: (p?.modules ?? []).filter((m) => typeof m === 'string' && m.length > 0),
      extras: (p?.extras ?? []).filter(
        (e) => !!e && typeof e.id === 'string' && typeof e.text === 'string',
      ),
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
