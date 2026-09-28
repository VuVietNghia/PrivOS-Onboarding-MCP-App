// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProvisionForm } from '../../src/ui/onboarding/views/ProvisionForm';

const { services } = vi.hoisted(() => ({ services: {
  clock: { now: () => new Date() },
  legacyData: { discovery: { listTemplateLists: async () => [] } },
  members: { lookup: async () => ({ kind: 'unavailable' }) },
} }));
vi.mock('../../src/ui/composition/PrivosOnboardingRoot', () => ({
  useOnboardingServices: () => services,
  useOnboardingSession: () => ({ actor: { roles: [] } }),
}));
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('shows local today and permits another working date', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 25, 9));
  render(<ProvisionForm roomId="R1" members={[]} onDone={() => {}} />);
  const input = screen.getByLabelText('Ngày bắt đầu') as HTMLInputElement;
  expect(input.value).toBe('2026-09-25');
  fireEvent.change(input, { target: { value: '2026-09-28' } });
  expect(input.value).toBe('2026-09-28');
});
