export interface UiCopyAllowlistEntry {
  file: string;
  text: string;
  reason: string;
  note?: string;
}

export const uiCopyAllowlist: readonly UiCopyAllowlistEntry[] = [
  {
    file: 'src/ui/onboarding/views/OnboardingShell.tsx',
    text: 'PrivOS Onboarding',
    reason: 'jsx-text',
    note: 'Product name stays identical in every locale.',
  },
];
