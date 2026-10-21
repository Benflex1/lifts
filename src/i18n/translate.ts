import { catalogs, DEFAULT_LOCALE, type Locale, type MessageKey } from './catalog';

export type MessageParams = Record<string, string | number>;

/**
 * Resolves a message key for the given locale, falling back to English and
 * finally to the key itself. `{name}` placeholders are interpolated; unknown
 * placeholders are left untouched so missing params are visible in tests.
 */
export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const template = catalogs[locale]?.[key] ?? catalogs[DEFAULT_LOCALE][key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  );
}
