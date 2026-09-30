import 'i18next';
import { defaultNS, resources } from './resources';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    returnNull: false;
    strictKeyChecks: true;
    enableSelector: false;
    resources: typeof resources.vi;
  }
}
