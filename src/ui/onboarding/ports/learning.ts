import type { KeyedLock } from '../../../shared/ports/effects';
import type { Hire, Roadmap, RoomBinding } from '../domain/models';
import type { Answers, GradeResult } from '../domain/quiz';
import type { ListReadPort, ListWritePort } from './lists';
import type { ActorSession } from './session';

export interface PendingQuizSubmission {
  dayId: string;
  operationId: string;
  answeredQuestions: number;
}
export interface LoadedLearning { hire: Hire; roadmap: Roadmap; pendingSubmission: PendingQuizSubmission | null }
export interface MemberRoadmapOption {
  hireId: string;
  positionName: string;
  startDate: string;
  status: 'learning' | 'done';
  doneDays: number;
  totalDays: number;
}
export interface SubmitQuizInput { userId: string; hireId: string; dayId: string; operationId: string; answers: Answers }
export interface SubmitQuizResult { hire: Hire; grade: GradeResult; attempt: number }
export interface SubmissionJournal { version: 1; operationId: string; dayId: string; previousScores: string; answers: Record<string, string[]> }

export interface LearningDeps {
  actor: ActorSession;
  binding: RoomBinding;
  read: Pick<ListReadPort, 'readListInfo' | 'readItem' | 'readAllItems' | 'queryItems'>;
  write: Pick<ListWritePort, 'patchFields' | 'moveItemToStage'>;
  lock: KeyedLock;
}

export interface LearningService {
  listMine(): Promise<readonly MemberRoadmapOption[]>;
  load(hireId?: string): Promise<LoadedLearning | null>;
  markRead(hireId: string, lessonId: string): Promise<LoadedLearning>;
  submit(input: Omit<SubmitQuizInput, 'userId'>): Promise<SubmitQuizResult>;
  resume(hireId: string): Promise<SubmitQuizResult>;
}
