import { expect, it } from 'vitest';
import { probeIdentityKey, probeSurfaceKey } from '../../src/ui/onboarding/views/OnboardingPanel';

it('changes the probe mount identity when the room or user changes', () => {
  const original = probeIdentityKey('room-a', 'user-a');
  expect(probeIdentityKey('room-b', 'user-a')).not.toBe(original);
  expect(probeIdentityKey('room-a', 'user-b')).not.toBe(original);
});

it('remounts the P0 selector when an actor gains or loses admin role', () => {
  expect(probeSurfaceKey('room-a', 'user-a', false)).not.toBe(probeSurfaceKey('room-a', 'user-a', true));
});
