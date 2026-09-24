import type { McpApp } from '@privos_ai/app-react';
import { OnboardingError } from '../domain/errors';
import { PrivosRestError, restCall } from '../../privos-rest';
import type { CreateListInput } from './onboarding-lists';
import { registryListInput } from '../domain/v2-registry-schema';
import { idOf, unwrapToolResult } from './tool-result';

export interface IsolatedListInfo {
  _id: string;
  name: string;
  roomId: string;
  isolatedList: boolean;
  fieldDefinitions: { _id: string; name: string; type: string; options?: { _id?: string; value: string }[] }[];
  stages: { _id: string; name: string; order: number }[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function listRecord(value: unknown): { _id: string; name: string; roomId: string; isolatedList: boolean } {
  const list = record(value);
  const id = idOf(list);
  if (!list || !id || typeof list.name !== 'string' ||
    typeof list.roomId !== 'string' || !list.roomId || typeof list.isolatedList !== 'boolean') {
    throw new OnboardingError('SCHEMA_DRIFT');
  }
  return { _id: id, name: list.name, roomId: list.roomId, isolatedList: list.isolatedList };
}

export async function listRoomListsViaTool(app: McpApp, roomId: string): Promise<ReturnType<typeof listRecord>[]> {
  const response: unknown = await app.callServerTool({ name: 'mcpapp.lists.getAll', arguments: { roomId } });
  const payload = unwrapToolResult(response);
  const data = record(payload);
  const lists = Array.isArray(payload) ? payload : Array.isArray(data?.lists) ? data.lists : Array.isArray(data?.data) ? data.data : Array.isArray(record(data?.data)?.lists) ? record(data?.data)?.lists : null;
  if (!Array.isArray(lists)) throw new OnboardingError('SCHEMA_DRIFT');
  const registryNames = new Set([registryListInput(roomId, 'positions').name, registryListInput(roomId, 'hires').name]);
  return lists.filter((value) => registryNames.has(String(record(value)?.name ?? ''))).map(listRecord).filter((list) => list.roomId === roomId);
}

export async function getIsolatedListViaTool(app: McpApp, listId: string): Promise<IsolatedListInfo> {
  const response: unknown = await app.callServerTool({ name: 'mcpapp.lists.get', arguments: { listId } });
  const payload = unwrapToolResult(response);
  const data = record(payload);
  const root = record(data?.data) ?? data;
  const list = record(root?.list) ?? root;
  const base = listRecord(list);
  if (base._id !== listId || !Array.isArray(list?.fieldDefinitions)) throw new OnboardingError('SCHEMA_DRIFT');
  const fields = list.fieldDefinitions.map((value) => {
    const field = record(value);
    const fieldId = idOf(field);
    if (!field || !fieldId || typeof field.name !== 'string' || typeof field.type !== 'string') throw new OnboardingError('SCHEMA_DRIFT');
    const options = Array.isArray(field.options) ? field.options.map((option) => {
      const entry = record(option);
      if (!entry || typeof entry.value !== 'string') throw new OnboardingError('SCHEMA_DRIFT');
      return { ...(idOf(entry) ? { _id: idOf(entry) } : {}), value: entry.value };
    }) : undefined;
    return { _id: fieldId, name: field.name, type: field.type, ...(options ? { options } : {}) };
  });
  let rawStages = root?.stages ?? list?.stages;
  if (!Array.isArray(rawStages)) {
    try {
      const stageResponse: unknown = await app.callServerTool({ name: 'mcpapp.stages.getByList', arguments: { listId } });
      const stagePayload = unwrapToolResult(stageResponse);
      const stageRoot = record(stagePayload);
      rawStages = Array.isArray(stagePayload) ? stagePayload : stageRoot?.stages;
    } catch (error) {
      const missingTool = error instanceof PrivosRestError && error.statusCode === 404 ||
        error instanceof Error && /unknown tool|unexpected tool|tool not found/i.test(error.message);
      if (!missingTool) throw error;
    }
    if (!Array.isArray(rawStages)) {
      const info = record(await restCall<unknown>(app, 'GET', 'lists.info', { query: { listId } }));
      const detail = record(info?.data) ?? info;
      const readback = record(detail?.list);
      if (idOf(readback) !== listId || (typeof readback?.roomId === 'string' && readback.roomId !== base.roomId)) throw new OnboardingError('SCHEMA_DRIFT');
      rawStages = detail?.stages;
    }
  }
  if (!Array.isArray(rawStages)) throw new OnboardingError('SCHEMA_DRIFT');
  const stages = rawStages.map((value) => {
    const stage = record(value);
    const stageId = idOf(stage);
    if (!stage || !stageId || typeof stage.name !== 'string' || typeof stage.order !== 'number') throw new OnboardingError('SCHEMA_DRIFT');
    return { _id: stageId, name: stage.name, order: stage.order };
  });
  return { ...base, fieldDefinitions: fields, stages };
}

export async function createIsolatedListViaTool(app: McpApp, input: CreateListInput): Promise<{ _id: string }> {
  if (!input.isolated || !input.roomId || !input.name) throw new OnboardingError('SCHEMA_DRIFT');
  const response: unknown = await app.callServerTool({ name: 'mcpapp.lists.create', arguments: {
    roomId: input.roomId, name: input.name, key: input.key, isolatedList: true, crossTeamWorkflow: false,
    fieldDefinitions: input.fields.map((field) => ({ name: field.name, type: field.type,
      ...(field.options ? { options: field.options.map((value) => ({ value })) } : {}) })),
    stages: input.stages.map((stage) => ({ name: stage.name, color: stage.color })),
  } });
  const payload = unwrapToolResult(response);
  const data = record(payload);
  const list = record(record(data?.data)?.list) ?? record(data?.list) ?? data;
  const listId = idOf(list);
  if (!listId) throw new OnboardingError('SCHEMA_DRIFT');
  return { _id: listId };
}
