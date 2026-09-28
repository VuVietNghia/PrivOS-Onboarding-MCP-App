import type { Prompt } from './ports';

export interface ApprovedPairing { pairingVersion?: number; identityFilePath?: string }

export async function pairAndStart(deps: {
  prompt: Prompt;
  readManifest(): Promise<Record<string, unknown>>;
  pair(url: string, manifest: Record<string, unknown>): Promise<ApprovedPairing>;
  onApproved?(identityFilePath: string): void;
  start(): Promise<number>;
}): Promise<{ identityFilePath: string; exitCode: number }> {
  const pairUrl = (await deps.prompt.ask('Enter the one-time pairing URL from Hub Admin: ')).trim();
  if (!pairUrl) throw new Error('No pairing URL provided');
  const manifest = await deps.readManifest();
  const paired = await deps.pair(pairUrl, manifest);
  if (paired.pairingVersion !== 2 || !paired.identityFilePath) {
    throw new Error('This Hub did not return standalone dispatch trust (pairingVersion 2). Standalone production requires a Hub that supports standalone pairing.');
  }
  deps.onApproved?.(paired.identityFilePath);
  return { identityFilePath: paired.identityFilePath, exitCode: await deps.start() };
}
