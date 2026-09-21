// src/ui/onboarding/domain/errors.ts
import { OptionalFeatureUnavailableError, PrivosRestError } from '../../privos-rest';

export type OnboardingErrorCode = 'NOT_ADMIN' | 'TEMPLATE_INVALID' | 'HIRE_EXISTS' | 'SCHEMA_DRIFT' | 'START_NOT_WORKING_DAY' | 'PROVISION_FAILED';

const ONBOARDING_MESSAGES: Record<OnboardingErrorCode, string> = {
  NOT_ADMIN: 'Chỉ owner/admin của room mới làm được việc này.',
  TEMPLATE_INVALID: 'Template không hợp lệ hoặc thiếu field bắt buộc.',
  HIRE_EXISTS: 'Nhân sự này đã có lộ trình onboarding đang chạy.',
  SCHEMA_DRIFT: 'Cấu trúc list bị sửa ngoài app. Kiểm tra lại field bắt buộc.',
  START_NOT_WORKING_DAY: 'Ngày bắt đầu phải là ngày làm việc (thứ 2 đến thứ 6).',
  PROVISION_FAILED: 'Khởi tạo lộ trình bị lỗi giữa chừng. Bạn có thể tiếp tục hoặc hủy.',
};

export class OnboardingError extends Error {
  constructor(readonly code: OnboardingErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'OnboardingError';
  }
}

// Mã lỗi domain ném ra bởi working-days.ts và roadmap-plan.ts dưới dạng
// `new Error(CODE)` hoặc `new Error(\`CODE:<data>\`)`. So khớp theo tiền tố vì
// hai mã cuối kèm dữ liệu động (taskId / order) không được lộ ra message.
const DOMAIN_ERROR_MESSAGES: Record<string, string> = {
  INVALID_DATE: 'Ngày không hợp lệ.',
  NEGATIVE_WORKING_DAYS: 'Số ngày không được âm.',
  TEMPLATE_STAGE_MISSING: 'Template có task trỏ vào giai đoạn không còn tồn tại. Mở lại template và gán lại giai đoạn cho task đó.',
  RUN_STAGE_MISSING: 'Không map được giai đoạn của lộ trình. Cấu trúc list lộ trình có thể đã bị sửa ngoài app.',
};
const DOMAIN_ERROR_CODES = Object.keys(DOMAIN_ERROR_MESSAGES);

export function describeError(err: unknown): { message: string; code: string } {
  if (err instanceof OnboardingError) return { code: err.code, message: ONBOARDING_MESSAGES[err.code] };
  if (err instanceof OptionalFeatureUnavailableError) return { code: 'SCOPE_MISSING', message: 'App chưa được cấp quyền cần thiết. Hãy nhờ admin bật quyền trong cài đặt app.' };
  if (err instanceof PrivosRestError) {
    if (err.code === 'error-not-allowed' || err.code === 'error-unauthorized' || err.statusCode === 401) {
      return { code: 'NOT_ALLOWED', message: 'Bạn không có quyền thực hiện thao tác này.' };
    }
    // Never echo the Hub's own `errorType`: it is a server-internal identifier, and it also lands in
    // the hire record's `Mã lỗi` field via markFailed. The HTTP status is enough to act on.
    return { code: `HTTP_${err.statusCode ?? 'ERR'}`, message: 'Hub từ chối thao tác. Thử lại sau.' };
  }
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) return { code: 'NETWORK', message: 'Mất kết nối. Thử lại.' };
  if (err instanceof Error && err.message === 'START_NOT_WORKING_DAY') return { code: 'START_NOT_WORKING_DAY', message: ONBOARDING_MESSAGES.START_NOT_WORKING_DAY };
  if (err instanceof Error) {
    const matched = DOMAIN_ERROR_CODES.find((code) => err.message.startsWith(code));
    if (matched) return { code: matched, message: DOMAIN_ERROR_MESSAGES[matched] };
  }
  return { code: 'UNKNOWN', message: 'Có lỗi không xác định. Thử lại sau.' };
}
