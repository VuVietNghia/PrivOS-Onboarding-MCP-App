import type { Clock, Scheduler } from '../../../../shared/ports/effects';
import { PrivosRestError } from '../../../privos-rest';
import type { BudgetEffects } from '../request-budget';

export function createPrivosBudgetEffects(clock: Clock, scheduler: Scheduler): BudgetEffects {
  return { clock, scheduler,
    isRetryableReadError: (error) => error instanceof PrivosRestError && error.statusCode === 429 };
}
