import type { VerifiedActor } from '@privos_ai/app-server';
import type { AppManifest } from '../manifest';

export type UiResource =
  | { uri: string; mimeType: string; text: string }
  | { uri: string; mimeType: string; blob: string };

export interface UiAssets {
  renderHtml(): string;
  readAssetsManifest(): unknown;
  readAsset(uri: string): UiResource | null;
}

export type UiMode = { kind: 'built' } | { kind: 'inline'; html: string } | { kind: 'dev-url'; publicUrl: string };
export interface UiModeController { set(mode: UiMode): void }
export type McpHandler = (method: string, id: number, params: unknown, actor?: VerifiedActor) => Promise<unknown>;

export interface McpHandlerDeps {
  assets: UiAssets;
  icon: string | undefined;
  manifest: AppManifest;
  metadata: { name: string; title: string; version: string; permissions?: readonly unknown[] };
}
