// tests/onboarding/small-domain.spec.ts
import { describe, expect, it } from 'vitest';
import { OptionalFeatureUnavailableError, PrivosRestError } from '../../src/ui/privos-rest';
import { OnboardingError, describeError } from '../../src/ui/onboarding/domain/errors';
import { isRoomAdmin } from '../../src/ui/onboarding/domain/roles';
import { runKey, slugify, templateKey } from '../../src/ui/onboarding/domain/keys';

describe('describeError', () => {
  it('403 thiếu scope', () => {
    expect(describeError(new OptionalFeatureUnavailableError('lists:write')).code).toBe('SCOPE_MISSING');
  });
  it('error-not-allowed của Hub thành thông báo quyền', () => {
    const r = describeError(new PrivosRestError('not allowed', 400, 'error-not-allowed'));
    expect(r).toEqual({ code: 'NOT_ALLOWED', message: 'Bạn không có quyền thực hiện thao tác này.' });
  });
  it('mã lỗi nội bộ của Hub (errorType) KHÔNG lộ ra ngoài, chỉ còn mã HTTP', () => {
    const r = describeError(new PrivosRestError('Mongo E11000 duplicate key on items_list_1', 500, 'error-internal-mongo-dup'));
    expect(r).toEqual({ code: 'HTTP_500', message: 'Hub từ chối thao tác. Thử lại sau.' });
    expect(JSON.stringify(r)).not.toContain('mongo');
    expect(describeError(new PrivosRestError('x', undefined, 'error-anything')).code).toBe('HTTP_ERR');
  });
  it('OnboardingError giữ code và có message tiếng Việt', () => {
    expect(describeError(new OnboardingError('HIRE_EXISTS'))).toEqual({ code: 'HIRE_EXISTS', message: 'Nhân sự này đã có lộ trình onboarding đang chạy.' });
  });
  it('lỗi mạng', () => {
    expect(describeError(new TypeError('Failed to fetch')).code).toBe('NETWORK');
  });
  it('lỗi lạ không lộ nội dung thô', () => {
    const r = describeError(new Error('Mongo duplicate key at 0x1'));
    expect(r.code).toBe('UNKNOWN');
    expect(r.message).not.toContain('Mongo');
  });
  it('INVALID_DATE từ working-days.ts', () => {
    expect(describeError(new Error('INVALID_DATE')).code).toBe('INVALID_DATE');
  });
  it('NEGATIVE_WORKING_DAYS từ addWorkingDays', () => {
    expect(describeError(new Error('NEGATIVE_WORKING_DAYS')).code).toBe('NEGATIVE_WORKING_DAYS');
  });
  it('TEMPLATE_STAGE_MISSING không lộ taskId thô', () => {
    const r = describeError(new Error('TEMPLATE_STAGE_MISSING:t1'));
    expect(r.code).toBe('TEMPLATE_STAGE_MISSING');
    expect(r.message).not.toContain('t1');
  });
  it('RUN_STAGE_MISSING không lộ order thô', () => {
    const r = describeError(new Error('RUN_STAGE_MISSING:2'));
    expect(r.code).toBe('RUN_STAGE_MISSING');
    expect(r.message).not.toContain(':2');
  });
});

describe('isRoomAdmin', () => {
  it('chỉ owner/admin là admin', () => {
    expect(isRoomAdmin(['owner'])).toBe(true);
    expect(isRoomAdmin(['user', 'admin'])).toBe(true);
    expect(isRoomAdmin(['moderator'])).toBe(false);
    expect(isRoomAdmin(['user'])).toBe(false);
    expect(isRoomAdmin([])).toBe(false);
  });
});

describe('keys', () => {
  it('slugify bỏ dấu và ký tự lạ', () => {
    expect(slugify('Kỹ sư Backend (Node.js)')).toBe('ky-su-backend-node-js');
    expect(slugify('  Đội QA  ')).toBe('doi-qa');
  });
  it('templateKey và runKey đúng tiền tố', () => {
    expect(templateKey('Kỹ sư Backend')).toBe('onb-tpl-ky-su-backend');
    expect(runKey('u1', '2026-09-21')).toBe('onb-run-u1-20260921');
  });
});
