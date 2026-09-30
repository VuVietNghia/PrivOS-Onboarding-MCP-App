import { describe, expect, it } from 'vitest';
import { PrivosRestError } from '../../src/ui/privos-rest';
import { ONBOARDING_ERROR_CODES, OnboardingError } from '../../src/ui/onboarding/domain/errors';
import enErrors from '../../src/ui/i18n/locales/en/errors.json';
import viErrors from '../../src/ui/i18n/locales/vi/errors.json';
import { toUiError } from '../../src/ui/i18n/ui-error';

describe('localized error descriptors', () => {
  it('normalizes known errors without leaking detail', () => {
    expect(toUiError(new OnboardingError('QUIZ_INCOMPLETE', 'q-secret'))).toEqual({ code: 'QUIZ_INCOMPLETE' });
    expect(toUiError(new PrivosRestError('private payload', 401, 'error-unauthorized'))).toEqual({ code: 'NOT_ALLOWED' });
    expect(toUiError(new PrivosRestError('private payload', 403, 'error-forbidden'))).toEqual({ code: 'NOT_ALLOWED' });
    expect(toUiError(new PrivosRestError('private payload', 429, 'rate-limit'))).toEqual({ code: 'RATE_LIMITED' });
    expect(toUiError(new PrivosRestError('database details', 500, 'internal'))).toEqual({ code: 'HUB_REJECTED' });
    expect(toUiError(new Error('Mongo E11000 password=secret'))).toEqual({ code: 'UNKNOWN' });
    expect(toUiError('malicious raw message')).toEqual({ code: 'UNKNOWN' });
  });

  it('has Vietnamese and English copy for every onboarding error code', () => {
    for (const code of ONBOARDING_ERROR_CODES) {
      expect(viErrors).toHaveProperty(code);
      expect(enErrors).toHaveProperty(code);
    }
  });
});
