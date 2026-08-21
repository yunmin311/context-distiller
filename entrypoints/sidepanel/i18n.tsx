import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { t as translate, type Lang, type TVars, type UIKey } from '../../lib/i18n';

/**
 * Panel-wide language context.
 *
 * The memoized rows (MessageRow, FragmentRow, Scratchpad) read the language
 * through this context rather than a prop, so switching language re-renders the
 * whole tree exactly once, and an ordinary keystroke still can't.
 */
const LangContext = createContext<Lang>('zh');

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

/** The language the panel is currently showing. */
export function useLang(): Lang {
  return useContext(LangContext);
}

export type TFn = (key: UIKey, vars?: TVars) => string;

/** `t('some.key', { n: 3 })` — stable per language, so it's safe in deps. */
export function useT(): TFn {
  const lang = useLang();
  return useMemo<TFn>(() => (key, vars) => translate(lang, key, vars), [lang]);
}
