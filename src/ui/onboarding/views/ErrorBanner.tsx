// src/ui/onboarding/views/ErrorBanner.tsx
import { describeError } from '../domain/errors';

export function ErrorBanner({ error }: { error: unknown | null }) {
  if (error === null || error === undefined) return null;
  const { message, code } = describeError(error);
  return <div className="error-message">{message} <span className="items-count">({code})</span></div>;
}
