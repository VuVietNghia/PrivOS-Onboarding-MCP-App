import type { LookupResult, RoomMember } from '../domain/pick-employee';

export interface MembersGateway {
  list(): Promise<RoomMember[] | null>;
  lookup(value: string): Promise<LookupResult>;
}
