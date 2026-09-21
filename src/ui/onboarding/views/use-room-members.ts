import { useEffect, useMemo, useState } from 'react';
import { usePrivosApp } from '@privos_ai/app-react';
import { listRoomMembers } from '../data/room-members';
import type { RoomMember } from '../domain/pick-employee';

export interface RoomMembersState {
  /** `undefined` while loading; `null` when the member list is not available to this app. */
  members: RoomMember[] | null | undefined;
  /** user id → display name, empty until members load. */
  names: ReadonlyMap<string, string>;
}

export function useRoomMembers(roomId: string): RoomMembersState {
  const app = usePrivosApp();
  const [members, setMembers] = useState<RoomMember[] | null | undefined>(undefined);

  useEffect(() => {
    if (!roomId) { setMembers(null); return; }
    let cancelled = false;
    setMembers(undefined);
    listRoomMembers(app, roomId)
      .then((list) => { if (!cancelled) setMembers(list); })
      .catch(() => { if (!cancelled) setMembers(null); });
    return () => { cancelled = true; };
  }, [app, roomId]);

  const names = useMemo(() => new Map((members ?? []).map((m) => [m.id, m.name] as const)), [members]);
  return { members, names };
}
