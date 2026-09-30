import viCommon from './locales/vi/common.json';
import viAdmin from './locales/vi/admin.json';
import viTemplates from './locales/vi/templates.json';
import viProvision from './locales/vi/provision.json';
import viLearning from './locales/vi/learning.json';
import viErrors from './locales/vi/errors.json';
import enCommon from './locales/en/common.json';
import enAdmin from './locales/en/admin.json';
import enTemplates from './locales/en/templates.json';
import enProvision from './locales/en/provision.json';
import enLearning from './locales/en/learning.json';
import enErrors from './locales/en/errors.json';

export const defaultNS = 'common';

export const resources = {
  vi: {
    common: viCommon,
    admin: viAdmin,
    templates: viTemplates,
    provision: viProvision,
    learning: viLearning,
    errors: viErrors,
  },
  en: {
    common: enCommon,
    admin: enAdmin,
    templates: enTemplates,
    provision: enProvision,
    learning: enLearning,
    errors: enErrors,
  },
} as const;

export const namespaces = ['common', 'admin', 'templates', 'provision', 'learning', 'errors'] as const;
