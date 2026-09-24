import { describe, expect, it } from 'vitest';
import { bindingForRoom } from '../../src/ui/onboarding/domain/room-binding';

describe('room binding', () => {
  it('selects only the current room and rejects an unconfigured room', () => {
    const config: unknown = [{ roomId: 'room-a', positionsListId: 'positions-a', hiresListId: 'hires-a' }];
    expect(bindingForRoom(config, 'room-a').positionsListId).toBe('positions-a');
    expect(() => bindingForRoom(config, 'room-b')).toThrow('ROOM_NOT_CONFIGURED');
  });

  it('rejects duplicate room IDs and missing registry IDs', () => {
    const duplicate: unknown = [
      { roomId: 'room-a', positionsListId: 'positions-a', hiresListId: 'hires-a' },
      { roomId: 'room-a', positionsListId: 'positions-b', hiresListId: 'hires-b' },
    ];
    expect(() => bindingForRoom(duplicate, 'room-a')).toThrow('SCHEMA_DRIFT');
    expect(() => bindingForRoom([{ roomId: 'room-a', positionsListId: '', hiresListId: 'hires-a' }], 'room-a')).toThrow('SCHEMA_DRIFT');
  });
});
