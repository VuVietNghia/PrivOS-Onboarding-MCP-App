import type { OnboardingLocale } from '../OnboardingShell';

export interface LearningCopy {
  roadmapRegion: string;
  loadingRoadmap: string;
  roadmapTitle: string;
  noRoadmap: string;
  loadFailed: string;
  retry: string;
  selectRoadmap: string;
  learningStatus: string;
  doneStatus: string;
  startDate: string;
  completedDays: string;
  noDays: string;
  completed: string;
  inProgress: string;
  notStarted: string;
  firstScore: string;
  continueSaving: string;
  saving: string;
  dayRegion: string;
  backRoadmap: string;
  backDay: string;
  emptyDay: string;
  openVideo: string;
  read: string;
  markRead: string;
  takeQuiz: string;
  quizRegion: string;
  quizTitle: string;
  invalidQuiz: string;
  answered: string;
  question: string;
  saveFailed: string;
  submit: string;
  resultRegion: string;
  invalidResult: string;
  resultAttempt: string;
  attempts: string;
  correct: string;
  incorrect: string;
  correctAnswer: string;
  retake: string;
  noAttachments: string;
  openFile: string;
  downloadFile: string;
  unlinkFile: string;
  fileFailed: string;
  fileNotAllowed: string;
}

const copy = {
  vi: {
    roadmapRegion: 'Lộ trình học', loadingRoadmap: 'Đang tải lộ trình', roadmapTitle: 'Lộ trình của tôi',
    noRoadmap: 'Bạn chưa có lộ trình onboarding trong room này.', loadFailed: 'Không tải được lộ trình. Thử lại.', retry: 'Thử lại',
    selectRoadmap: 'Lộ trình onboarding', learningStatus: 'Đang học', doneStatus: 'Hoàn tất', startDate: 'Bắt đầu',
    completedDays: 'ngày hoàn thành', noDays: 'Chưa có ngày học trong lộ trình.', completed: 'Đã hoàn thành',
    inProgress: 'Đang học', notStarted: 'Chưa bắt đầu', firstScore: 'Điểm lần đầu', continueSaving: 'Tiếp tục lưu bài',
    saving: 'Đang lưu…', dayRegion: 'Học', backRoadmap: 'Về lộ trình', backDay: 'Về ngày học',
    emptyDay: 'Ngày học chưa có nội dung.', openVideo: 'Mở video', read: 'Đã đọc', markRead: 'Đánh dấu đã đọc',
    takeQuiz: 'Làm quiz', quizRegion: 'Làm quiz', quizTitle: 'Quiz', invalidQuiz: 'Dữ liệu quiz không hợp lệ. Liên hệ HR.',
    answered: 'Đã trả lời', question: 'Câu', saveFailed: 'Không lưu được bài làm. Thử lại.', submit: 'Nộp bài',
    resultRegion: 'Kết quả quiz', invalidResult: 'Kết quả quiz không hợp lệ.', resultAttempt: 'Kết quả lần',
    attempts: 'Các lượt', correct: 'Đúng', incorrect: 'Chưa đúng', correctAnswer: 'Đáp án đúng', retake: 'Làm lại',
    noAttachments: 'Chưa có file đính kèm.', openFile: 'Mở', downloadFile: 'Tải xuống',
    unlinkFile: 'Bỏ liên kết', fileFailed: 'Không mở được file. Thử lại.', fileNotAllowed: 'Bạn không có quyền mở file này.',
  },
  en: {
    roadmapRegion: 'Learning roadmap', loadingRoadmap: 'Loading roadmap', roadmapTitle: 'My roadmap',
    noRoadmap: 'You do not have an onboarding roadmap in this room.', loadFailed: 'Could not load the roadmap. Try again.', retry: 'Retry',
    selectRoadmap: 'Onboarding roadmap', learningStatus: 'Learning', doneStatus: 'Completed', startDate: 'Started',
    completedDays: 'days completed', noDays: 'This roadmap has no learning days.', completed: 'Completed',
    inProgress: 'In progress', notStarted: 'Not started', firstScore: 'First score', continueSaving: 'Continue saving',
    saving: 'Saving…', dayRegion: 'Learning', backRoadmap: 'Back to roadmap', backDay: 'Back to day',
    emptyDay: 'This learning day has no content.', openVideo: 'Open video', read: 'Read', markRead: 'Mark as read',
    takeQuiz: 'Take quiz', quizRegion: 'Take quiz', quizTitle: 'Quiz', invalidQuiz: 'The quiz data is invalid. Contact HR.',
    answered: 'Answered', question: 'Question', saveFailed: 'Could not save the answers. Try again.', submit: 'Submit answers',
    resultRegion: 'Quiz result', invalidResult: 'The quiz result is invalid.', resultAttempt: 'Attempt result',
    attempts: 'Attempts', correct: 'Correct', incorrect: 'Incorrect', correctAnswer: 'Correct answer', retake: 'Retake quiz',
    noAttachments: 'No attachments.', openFile: 'Open', downloadFile: 'Download', unlinkFile: 'Unlink',
    fileFailed: 'Could not open the file. Try again.', fileNotAllowed: 'You do not have permission to open this file.',
  },
} satisfies Record<OnboardingLocale, LearningCopy>;

export function learningCopy(locale: OnboardingLocale): LearningCopy {
  return copy[locale];
}
