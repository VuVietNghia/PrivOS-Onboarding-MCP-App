// src/ui/onboarding/views/template-form.ts
import { z } from 'zod';
import { OWNER_OPTIONS } from '../domain/fields';

export function parseStageNames(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split('\n')) {
    const name = line.trim();
    if (name && !seen.has(name)) { seen.add(name); out.push(name); }
  }
  return out;
}

const DAY_OFFSET_MESSAGE = 'Nhập hạn: số ngày làm việc (0 trở lên).';

/** A blank box must be an error, never `Number('') === 0` — D+0 is a real deadline, not "unset". */
const dayOffset = z.preprocess(
  (v) => (v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? Number.NaN : v),
  z.coerce.number({ invalid_type_error: DAY_OFFSET_MESSAGE }).int(DAY_OFFSET_MESSAGE).min(0, DAY_OFFSET_MESSAGE),
);

export const taskFormSchema = z.object({
  name: z.string().trim().min(1),
  dayOffset,
  owner: z.enum(OWNER_OPTIONS),
  stageId: z.string().min(1),
});

export type TaskForm = z.infer<typeof taskFormSchema>;
