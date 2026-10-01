import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { it, expect } from 'vitest';

it('packages deployable source without embedded credentials and emits its SHA256 checksum', () => {
  const fixture = path.join('public', `deploy-package-fixture-${process.pid}`);
  mkdirSync(fixture, { recursive: true });
  try {
    for (const name of ['ordinary.txt', '.env', '.env.production', 'private.key', 'certificate.pem',
      'id_rsa', 'service-credentials.json', 'privos-standalone-identity.json', 'privos-standalone-identity.pending.json']) {
      writeFileSync(path.join(fixture, name), 'packaging-test-fixture');
    }
    const result = spawnSync('bash', ['scripts/package-ubuntu.sh'], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    const archive = 'dist-deploy/privos-onboarding-ubuntu.tar.gz';
    const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
    expect(entries).toContain(`${fixture}/ordinary.txt`);
    expect(entries).toContain('compose.yaml');
    expect(entries).toContain('scripts/build-compose.sh');
    expect(entries).toContain('docs/deployment/ubuntu-compose.md');
    expect(entries.filter((entry) => /(^|\/)\.env|identity.*\.json$|credentials|\.key$|\.pem$|id_rsa/.test(entry))).toEqual([]);
    expect(entries.filter((entry) => /(^|\/)(node_modules|\.git|\.cache|dist-deploy)(\/|$)/.test(entry))).toEqual([]);
    const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
    expect(readFileSync(`${archive}.sha256`, 'utf8')).toBe(`${digest}  privos-onboarding-ubuntu.tar.gz\n`);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
