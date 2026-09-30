import { createUiI18n } from '../../src/ui/i18n/config';

const instance = createUiI18n('vi');
instance.t('common:dayCount', { count: 1 });
// @ts-expect-error translation keys are checked against bundled resources
instance.t('common:notARealKey');
