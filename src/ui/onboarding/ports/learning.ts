import type { KeyedLock } from '../../../shared/ports/effects';
import type { Hire, Roadmap, RoomBinding } from '../domain/models';
import type { Answers, GradeResult } from '../domain/quiz';
import type { ListReadPort, ListWritePort } from './lists';
import type { ActorSession } from './session';

export interface LoadedLearning { hire: Hire; roadmap: Roadmap }
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
  load(): Promise<LoadedLearning | null>;
  markRead(hireId: string, lessonId: string): Promise<LoadedLearning>;
  submit(input: Omit<SubmitQuizInput, 'userId'>): Promise<SubmitQuizResult>;
}
