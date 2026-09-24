export interface FileRef { id: string; name: string; mimeType?: string; raw?: Record<string, unknown> }
export interface Week { id: string; name: string; order: number }
export interface ItemBase {
  id: string; name: string; stageId: string; order: number;
  parentId: string | null; sourceId?: string;
}
export interface Day extends ItemBase { kind: 'day'; content: string }
export interface Lesson extends ItemBase {
  kind: 'lesson'; content: string; attachments: FileRef[];
  videos: string[]; read: boolean;
}
export interface Question extends ItemBase {
  kind: 'question'; content: string; options: string[];
  correctLabels: string[]; explanation: string;
  selectedLabels: string[]; correct: boolean | null;
}
export type ContentItem = Day | Lesson | Question;
export interface TemplateTree { weeks: Week[]; items: ContentItem[] }
export type PositionStatus = 'draft' | 'ready' | 'disabled';
export interface Position {
  id: string; name: string; templateListId: string; status: PositionStatus;
  weeks: number; days: number; lessons: number; questions: number;
  missingAnswers: number; inUse: number;
}
export interface DayScore { first: string; attempts?: string[] }
export type Scores = Record<string, DayScore>;
export type HireStatus = 'provisioning' | 'learning' | 'done' | 'failed' | 'cancelled';
export interface Hire {
  id: string; employeeId: string; name: string; positionId: string;
  positionName: string; totalDays: number;
  startDate: string; roadmapListId: string | null; status: HireStatus;
  doneDays: number; scores: Scores; errorCode: string | null;
  pendingAction: 'cancel' | null;
}
export interface Roadmap { overviewId: string; templateListId: string; tree: TemplateTree }
export interface Page<T> { items: T[]; nextCursor: string | null }
export interface CatalogFilter { text: string; stageId?: string; status?: PositionStatus | HireStatus; positionId?: string }
export interface RoomBinding { roomId: string; positionsListId: string; hiresListId: string }
