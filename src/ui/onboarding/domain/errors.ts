// src/ui/onboarding/domain/errors.ts

export const ONBOARDING_ERROR_CODES = [
  'NOT_ADMIN', 'TEMPLATE_INVALID', 'HIRE_EXISTS', 'SCHEMA_DRIFT', 'SCHEMA_MIGRATION_REQUIRED',
  'SCORES_INVALID', 'ROOM_NOT_CONFIGURED', 'PAGINATION_INVALID', 'FILTER_INVALID',
  'START_NOT_WORKING_DAY', 'PROVISION_FAILED', 'HIRE_NOT_ACTIVE', 'HIRE_NOT_OWNED',
  'HIRE_CANCELLING', 'RUN_INVALID', 'DAY_NOT_FOUND', 'LESSON_NOT_FOUND', 'QUIZ_INVALID',
  'QUIZ_INCOMPLETE', 'WRITE_CONFLICT', 'SCORE_HISTORY_LIMIT',
] as const;

export type OnboardingErrorCode = typeof ONBOARDING_ERROR_CODES[number];

const ONBOARDING_MESSAGES: Record<OnboardingErrorCode, string> = {
  NOT_ADMIN: 'Chỉ owner/admin của room mới làm được việc này.',
  TEMPLATE_INVALID: 'Template không hợp lệ hoặc thiếu field bắt buộc.',
  HIRE_EXISTS: 'Nhân sự này đã có lộ trình onboarding đang chạy.',
  SCHEMA_DRIFT: 'Cấu trúc list bị sửa ngoài app. Kiểm tra lại field bắt buộc.',
  SCHEMA_MIGRATION_REQUIRED: 'List cũ cần được chuyển sang cấu trúc v2 trước khi dùng.',
  SCORES_INVALID: 'Dữ liệu điểm không hợp lệ. Dừng cập nhật để tránh mất lịch sử.',
  ROOM_NOT_CONFIGURED: 'Room chưa có cấu hình list onboarding.',
  PAGINATION_INVALID: 'Phân trang không còn hợp lệ. Tải lại danh sách.',
  FILTER_INVALID: 'Bộ lọc không hợp lệ. Tải lại danh sách.',
  START_NOT_WORKING_DAY: 'Ngày bắt đầu phải là ngày làm việc (thứ 2 đến thứ 6).',
  PROVISION_FAILED: 'Khởi tạo lộ trình bị lỗi giữa chừng. Bạn có thể tiếp tục hoặc hủy.',
  HIRE_NOT_ACTIVE: 'Lộ trình này không còn ở trạng thái học.',
  HIRE_NOT_OWNED: 'Bạn không có quyền truy cập lộ trình này.',
  HIRE_CANCELLING: 'Lộ trình đang được hủy. Không thể cập nhật.',
  RUN_INVALID: 'Nội dung lộ trình không hợp lệ. Hãy tải lại.',
  DAY_NOT_FOUND: 'Không tìm thấy ngày onboarding đã chọn.',
  LESSON_NOT_FOUND: 'Không tìm thấy bài học đã chọn.',
  QUIZ_INVALID: 'Bài kiểm tra hoặc câu trả lời không hợp lệ.',
  QUIZ_INCOMPLETE: 'Hãy trả lời đủ câu hỏi trước khi nộp.',
  WRITE_CONFLICT: 'Dữ liệu vừa được cập nhật ở nơi khác. Hãy tải lại.',
  SCORE_HISTORY_LIMIT: 'Lịch sử điểm đã đạt giới hạn lưu trữ.',
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

export function classifyError(err: unknown): { code: string } {
  if (err instanceof OnboardingError) return { code: err.code };
  if (err instanceof Error && err.name === 'OptionalFeatureUnavailableError') return { code: 'SCOPE_MISSING' };
  if (err instanceof Error && err.name === 'PrivosRestError') {
    const detail = err as Error & { statusCode?: unknown; code?: unknown };
    const statusCode = typeof detail.statusCode === 'number' ? detail.statusCode : undefined;
    const code = typeof detail.code === 'string' ? detail.code : undefined;
    if (statusCode === 429) return { code: 'RATE_LIMITED' };
    if (code === 'error-not-allowed' || code === 'error-unauthorized' || statusCode === 401 || statusCode === 403) {
      return { code: 'NOT_ALLOWED' };
    }
    // Never echo the Hub's own `errorType`: it is a server-internal identifier, and it also lands in
    // the hire record's `Mã lỗi` field via markFailed. The HTTP status is enough to act on.
    return { code: `HTTP_${statusCode ?? 'ERR'}` };
  }
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) return { code: 'NETWORK' };
  if (err instanceof Error && err.message === 'START_NOT_WORKING_DAY') return { code: 'START_NOT_WORKING_DAY' };
  if (err instanceof Error) {
    const matched = DOMAIN_ERROR_CODES.find((code) => err.message.startsWith(code));
    if (matched) return { code: matched };
  }
  return { code: 'UNKNOWN' };
}

export function describeError(err: unknown): { message: string; code: string } {
  const { code } = classifyError(err);
  if (code in ONBOARDING_MESSAGES) {
    return { code, message: ONBOARDING_MESSAGES[code as OnboardingErrorCode] };
  }
  if (code in DOMAIN_ERROR_MESSAGES) return { code, message: DOMAIN_ERROR_MESSAGES[code] ?? 'Có lỗi không xác định. Thử lại sau.' };
  const messages: Readonly<Record<string, string>> = {
    SCOPE_MISSING: 'App chưa được cấp quyền cần thiết. Hãy nhờ admin bật quyền trong cài đặt app.',
    RATE_LIMITED: 'Đang có quá nhiều yêu cầu. Thử lại sau.',
    NOT_ALLOWED: 'Bạn không có quyền thực hiện thao tác này.',
    NETWORK: 'Mất kết nối. Thử lại.',
    UNKNOWN: 'Có lỗi không xác định. Thử lại sau.',
  };
  return { code, message: messages[code] ?? 'Hub từ chối thao tác. Thử lại sau.' };
}
