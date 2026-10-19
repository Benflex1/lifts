import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, type Locale, type MessageKey } from './catalog';
import { translate, type MessageParams } from './translate';

export type Translate = (key: MessageKey, params?: MessageParams) => string;

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}

const defaultTranslator: Translate = (key, params) => translate(DEFAULT_LOCALE, key, params);

const I18nContext = createContext<I18nValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: defaultTranslator,
});

/**
 * PROD-04: holds the active locale and exposes the translator. Switching the
 * locale re-renders every consumer without touching screen logic.
 */
export function I18nProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const t = useCallback<Translate>((key, params) => translate(locale, key, params), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Returns the active locale and translator. Outside an `I18nProvider` it
 * resolves to the English fallback, which keeps isolated component renders and
 * tests working without a provider.
 */
export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
