import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanUiCopy, validateCopyAllowlist } from '../../scripts/i18n/check-ui-copy';

describe('UI copy coverage scanner', () => {
  it('finds visible literals and ignores translations, styling, URLs, machine values, and authored values', () => {
    const file = resolve(process.cwd(), 'tests/fixtures/i18n/ui-copy.tsx');
    const findings = scanUiCopy([file]);
    expect(findings.map(({ text, reason }) => ({ text, reason }))).toEqual([
      { text: 'Đang tải', reason: 'jsx-text' },
      { text: 'Reload', reason: 'jsx-attribute' },
      { text: 'Tiếp tục', reason: 'jsx-expression' },
      { text: 'Có lỗi', reason: 'error-literal' },
    ]);
  });

  it('rejects broad whole-file allowlist entries', () => {
    expect(() => validateCopyAllowlist([{ file: 'src/ui/onboarding/views/V4Onboarding.tsx', text: '*', reason: 'legacy' }]))
      .toThrow('exact file, text, and reason');
  });
});
