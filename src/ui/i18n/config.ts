import { createInstance, type i18n } from 'i18next';
import type { UiLocale } from './locale';
import { defaultNS, namespaces, resources } from './resources';

export function createUiI18n(locale: UiLocale): i18n {
  const instance = createInstance();
  void instance.init({
    lng: locale,
    fallbackLng: 'vi',
    supportedLngs: ['vi', 'en'],
    ns: [...namespaces],
    defaultNS,
    resources,
    showSupportNotice: false,
    initImmediate: false,
    returnNull: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    parseMissingKeyHandler: (key) => {
      if (import.meta.env.DEV) throw new Error(`Missing translation: ${key}`);
      return resources.vi.common.genericError;
    },
  });
  return instance;
}
