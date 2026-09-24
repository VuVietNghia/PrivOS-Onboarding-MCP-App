export interface ProbeSafetyState {
  confirmed: boolean;
  openUrl: string;
  downloadConfirmation: 'not-run' | 'confirmed' | 'failed';
}

export type ProbeSafetyAction =
  | { type: 'target-change' }
  | { type: 'confirm'; value: boolean }
  | { type: 'open-url'; value: string }
  | { type: 'download-confirmation'; value: ProbeSafetyState['downloadConfirmation'] };

export const initialProbeSafety: ProbeSafetyState = { confirmed: false, openUrl: '', downloadConfirmation: 'not-run' };

export function probeSafetyReducer(state: ProbeSafetyState, action: ProbeSafetyAction): ProbeSafetyState {
  switch (action.type) {
    case 'target-change': return initialProbeSafety;
    case 'confirm': return { ...state, confirmed: action.value };
    case 'open-url': return { ...state, openUrl: action.value };
    case 'download-confirmation': return { ...state, downloadConfirmation: action.value };
  }
}
