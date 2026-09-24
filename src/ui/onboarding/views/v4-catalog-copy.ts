import type { OnboardingLocale } from './OnboardingShell';

const vi = {
  needsAdmin: 'Owner hoặc admin cần mở app để tạo Lists cho room.',
  SCHEMA_DRIFT: 'Cấu trúc Lists không khớp với app. Admin cần kiểm tra Lists của room.',
  BOOTSTRAP_STAGE_UNAVAILABLE: 'PrivOS chưa tạo được các stage bắt buộc cho Lists.',
  ROOM_LIST_DISCOVERY_UNAVAILABLE: 'Không tìm được Lists cô lập của room bằng tài khoản này.',
  DUPLICATE_REGISTRY: 'Room có nhiều Lists onboarding trùng tên. Admin cần kiểm tra.',
  onPage: 'Trong trang này', profiles: 'hồ sơ', positions: 'vị trí',
  manageOnboarding: 'Quản lý onboarding', hiresSubtitle: 'Xem tiến độ và trạng thái của nhân sự trong room.',
  createOnboarding: 'Tạo onboarding', learning: 'Đang onboarding', done: 'Hoàn tất',
  provisioning: 'Đang khởi tạo', attention: 'Cần xử lý',
  searchHires: 'Tìm nhân sự', searchHiresPlaceholder: 'Tìm theo tên',
  filterStatus: 'Lọc trạng thái', filterPosition: 'Lọc theo vị trí', allStatuses: 'Mọi trạng thái', allPositions: 'Mọi vị trí', clearPosition: 'Bỏ lọc vị trí', noMatchingPositions: 'Không có vị trí phù hợp.', reset: 'Đặt lại',
  showing: 'Đang hiển thị', employee: 'Nhân sự', position: 'Vị trí',
  start: 'Bắt đầu', progress: 'Tiến độ lộ trình', quizScores: 'Điểm quiz', noQuizScores: 'Chưa có điểm', actions: 'Thao tác', viewRoadmap: 'Xem lộ trình', openTemplate: 'Mở', status: 'Trạng thái', days: 'ngày',
  previous: 'Trước', next: 'Sau', reload: 'Tải lại', loading: 'Đang tải…', noHires: 'Chưa có hồ sơ phù hợp.',
  noPositions: 'Chưa có vị trí phù hợp.', templateEyebrow: 'Position templates',
  templateTitle: 'Template theo vị trí', templateSubtitle: 'Mỗi vị trí có một template onboarding trong PrivOS Lists.',
  createTemplate: 'Tạo template', searchPosition: 'Tìm vị trí', filterTemplateStatus: 'Lọc trạng thái template',
  stageWeeks: 'Tuần', dayItems: 'Ngày', lessons: 'Bài học', questions: 'Câu hỏi',
  missingAnswers: 'Thiếu đáp án', inUse: 'Đang dùng',
  hireProvisioning: 'Đang khởi tạo', hireLearning: 'Đang học', hireDone: 'Hoàn tất',
  hireFailed: 'Khởi tạo lỗi', hireCancelled: 'Đã huỷ',
  positionDraft: 'Đang soạn', positionReady: 'Sẵn sàng', positionDisabled: 'Ngừng dùng',
  futureProvision: 'Có trong phần tạo lộ trình', futureTemplate: 'Có trong phần template builder',
  roomUnconfigured: 'Room chưa có cấu hình list onboarding.', unavailable: 'Chưa thể tải Lists.',
  futureProvisionScreen: 'Màn tạo onboarding thuộc phần 4.',
  roadmapTitle: 'Lộ trình của tôi', roadmapPending: 'Lộ trình cá nhân sẽ mở sau khi quyền đọc hồ sơ đã được kiểm tra trên Hub.',
} as const;

const en: Record<keyof typeof vi, string> = {
  needsAdmin: 'A room owner or admin needs to open the app to create its Lists.',
  SCHEMA_DRIFT: 'The Lists do not match this app. A room admin needs to check them.',
  BOOTSTRAP_STAGE_UNAVAILABLE: 'PrivOS did not create the required List stages.',
  ROOM_LIST_DISCOVERY_UNAVAILABLE: 'This account cannot discover the room’s isolated Lists.',
  DUPLICATE_REGISTRY: 'The room has duplicate onboarding Lists. A room admin needs to check them.',
  onPage: 'On this page', profiles: 'profiles', positions: 'positions',
  manageOnboarding: 'Manage onboarding', hiresSubtitle: 'Track employee progress and status in this room.',
  createOnboarding: 'Create onboarding', learning: 'Onboarding', done: 'Completed',
  provisioning: 'Setting up', attention: 'Needs attention',
  searchHires: 'Search people', searchHiresPlaceholder: 'Search by name',
  filterStatus: 'Filter by status', filterPosition: 'Filter by position', allStatuses: 'All statuses', allPositions: 'All positions', clearPosition: 'Clear position filter', noMatchingPositions: 'No matching positions.', reset: 'Reset',
  showing: 'Showing', employee: 'Employee', position: 'Position',
  start: 'Start date', progress: 'Roadmap progress', quizScores: 'Quiz scores', noQuizScores: 'No scores yet', actions: 'Actions', viewRoadmap: 'View roadmap', openTemplate: 'Open', status: 'Status', days: 'days',
  previous: 'Previous', next: 'Next', reload: 'Reload', loading: 'Loading…', noHires: 'No matching profiles.',
  noPositions: 'No matching positions.', templateEyebrow: 'Position templates',
  templateTitle: 'Templates by position', templateSubtitle: 'Each position has an onboarding template in PrivOS Lists.',
  createTemplate: 'Create template', searchPosition: 'Search positions', filterTemplateStatus: 'Filter template status',
  stageWeeks: 'Weeks', dayItems: 'Days', lessons: 'Lessons', questions: 'Questions',
  missingAnswers: 'Missing answers', inUse: 'In use',
  hireProvisioning: 'Setting up', hireLearning: 'Learning', hireDone: 'Completed',
  hireFailed: 'Setup failed', hireCancelled: 'Cancelled',
  positionDraft: 'Draft', positionReady: 'Ready', positionDisabled: 'Disabled',
  futureProvision: 'Available in the provisioning part', futureTemplate: 'Available in the template builder part',
  roomUnconfigured: 'Onboarding Lists are not configured for this room.', unavailable: 'Cannot load Lists.',
  futureProvisionScreen: 'Create onboarding is part 4.',
  roadmapTitle: 'My roadmap', roadmapPending: 'The personal roadmap opens after Hub access to employee records has been verified.',
};

export function v4CatalogCopy(locale: OnboardingLocale): Record<keyof typeof vi, string> {
  return locale === 'en' ? en : vi;
}

export function translateV4Error(message: string, locale: OnboardingLocale): string {
  if (locale === 'vi') return message;
  if (Object.values(en).includes(message)) return message;
  const errors: Record<string, string> = {
    [vi.roomUnconfigured]: en.roomUnconfigured,
    [vi.unavailable]: en.unavailable,
    'Bạn không có quyền thực hiện thao tác này.': 'You do not have permission to do this.',
    'App chưa được cấp quyền cần thiết. Hãy nhờ admin bật quyền trong cài đặt app.': 'The app needs permission from a room admin.',
    'Hub từ chối thao tác. Thử lại sau.': 'The Hub rejected this request. Try again later.',
    'Mất kết nối. Thử lại.': 'Connection lost. Try again.',
    'Có lỗi không xác định. Thử lại sau.': 'An unknown error occurred. Try again.',
    'Đang có quá nhiều yêu cầu. Thử lại sau.': 'Too many requests. Try again later.',
    'Phân trang không còn hợp lệ. Tải lại danh sách.': 'Pagination is no longer valid. Reload the list.',
    'Cấu trúc list bị sửa ngoài app. Kiểm tra lại field bắt buộc.': 'The List structure has changed. Check the required fields.',
    'List cũ cần được chuyển sang cấu trúc v2 trước khi dùng.': 'This List needs migration to v2 before use.',
  };
  return errors[message] ?? 'Could not load this page.';
}
