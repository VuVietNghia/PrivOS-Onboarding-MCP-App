import type { Hire, Page, Position } from '../domain/models';

export interface HrHireRecord {
  hire: Hire;
  runKey: string;
  pendingSubmission: boolean;
}

export interface HrRun {
  id: string;
  roomId: string;
  isolated: boolean;
  key: string;
}

export interface HrV4Gateway {
  readHire(hireId: string): Promise<HrHireRecord>;
  readPosition(positionId: string): Promise<Position>;
  listHires(positionId: string, cursor?: string): Promise<Page<Hire>>;
  readRun(runId: string): Promise<HrRun | null>;
  markCancelPending(hireId: string): Promise<void>;
  clearCancelPending(hireId: string): Promise<void>;
  deleteRun(runId: string): Promise<void>;
  markHireCancelled(hireId: string): Promise<void>;
  deleteFailedHire(hireId: string): Promise<void>;
  markPositionDisabled(positionId: string): Promise<void>;
  writeInUse(positionId: string, count: number): Promise<void>;
}

export interface CancelOutcome { hire: Hire; needsRecount: boolean }

export interface HrActions {
  cancelActive(hireId: string): Promise<CancelOutcome>;
  cancelFailed(hireId: string): Promise<void>;
  disablePosition(positionId: string): Promise<void>;
  recountPosition(positionId: string): Promise<number>;
}
