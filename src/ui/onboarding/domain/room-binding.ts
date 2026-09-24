import { z } from 'zod';
import type { RoomBinding } from './models';
import { OnboardingError } from './errors';

const bindingSchema = z.object({
  roomId: z.string().min(1),
  positionsListId: z.string().min(1),
  hiresListId: z.string().min(1),
}).strict();

export function bindingForRoom(raw: unknown, roomId: string): RoomBinding {
  const parsed = z.array(bindingSchema).safeParse(raw);
  if (!parsed.success) throw new OnboardingError('SCHEMA_DRIFT', 'Invalid room bindings');
  const seen = new Set<string>();
  for (const binding of parsed.data) {
    if (seen.has(binding.roomId)) throw new OnboardingError('SCHEMA_DRIFT', 'Duplicate room binding');
    seen.add(binding.roomId);
  }
  const binding = parsed.data.find((entry) => entry.roomId === roomId);
  if (!binding) throw new OnboardingError('ROOM_NOT_CONFIGURED');
  return binding;
}
