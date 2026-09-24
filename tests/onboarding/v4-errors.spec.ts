import { describe, expect, it } from 'vitest';
import { PrivosRestError } from '../../src/ui/privos-rest';
import { describeError, OnboardingError } from '../../src/ui/onboarding/domain/errors';

describe('v4 catalog errors', () => {
  it('shows an authorization message without leaking the Hub response', () => {
    expect(describeError(new PrivosRestError('internal details', 403, 'error-forbidden'))).toEqual({
      code: 'NOT_ALLOWED', message: 'Bạn không có quyền thực hiện thao tác này.',
    });
  });

  it('reports invalid pagination as a recoverable list error', () => {
    expect(describeError(new OnboardingError('PAGINATION_INVALID'))).toEqual({
      code: 'PAGINATION_INVALID', message: 'Phân trang không còn hợp lệ. Tải lại danh sách.',
    });
  });

  it('reports Hub throttling without exposing the response body', () => {
    expect(describeError(new PrivosRestError('internal rate details', 429, 'too-many-requests'))).toEqual({
      code: 'RATE_LIMITED', message: 'Đang có quá nhiều yêu cầu. Thử lại sau.',
    });
  });
});
