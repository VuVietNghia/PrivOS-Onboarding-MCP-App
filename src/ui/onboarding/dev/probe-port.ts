import type { ReactNode } from 'react';
import type { CreateItemInput, CreateListInput, HubList } from '../ports/lists';
import type { HubItem } from '../domain/fields';
import type { StageRef } from '../domain/roadmap-plan';

export interface ProbeTransport {
  rest(request: { method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string;
    query?: Record<string, string | number | boolean>; body?: unknown; timeoutMs?: number }): Promise<{ statusCode: number; body: unknown }>;
  callServerTool(request: { name: string; arguments: Record<string, unknown>; timeoutMs?: number }): Promise<unknown>;
  uploadFile(request: { channelId: string; fileName: string; base64Data: string; mimeType?: string;
    folderId?: string; enableEmbedding?: boolean; duplicateAction?: 'replace' | 'keep_both' | 'cancel' }): Promise<unknown>;
  listRoomLists(roomId: string): Promise<HubList[]>;
  getListInfo(listId: string): Promise<{ list: HubList; stages: StageRef[] }>;
  createList(input: CreateListInput): Promise<HubList>;
  createItem(input: CreateItemInput): Promise<HubItem>;
  updateItem(input: { itemId: string; name?: string; description?: string; stageId?: string;
    customFields?: { fieldId: string; value: unknown }[] }): Promise<void>;
}

export interface ProbeEnvironment {
  transport: ProbeTransport;
  actor: { roomId: string; userId: string; roles: readonly string[]; effectiveScopes: readonly string[] };
  nowIso(): string;
  nowMs(): number;
  hostLanguage: string;
  timeZone: string;
  readDataUrl(file: File): Promise<string>;
  EmbedCheck: (props: { url: string }) => ReactNode;
}
