// tests/onboarding/fake-app.ts
import type { McpApp, RestRequestParams, RestResponse } from '@privos_ai/app-react';
import { PrivosRestError } from '../../src/ui/privos-rest';

export interface FakeRoute {
  method: RestRequestParams['method'];
  path: string;
  reply: (req: RestRequestParams, callIndex: number) => RestResponse;
}

export function fakeRestApp(routes: FakeRoute[]): { app: McpApp; calls: RestRequestParams[]; toolCalls: { name: string; arguments: Record<string, unknown> }[] } {
  const calls: RestRequestParams[] = [];
  const toolCalls: { name: string; arguments: Record<string, unknown> }[] = [];
  const counters = new Map<string, number>();
  const itemListIds = new Map<string, string>();
  const listIds = new Set<string>();
  const firstStageIds = new Map<string, string>();
  const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const idOf = (value: unknown): string | undefined => {
    const entry = object(value);
    const id = entry?._id ?? entry?.id;
    return typeof id === 'string' && id ? id : undefined;
  };
  const rememberItems = (value: unknown, listId: string): void => {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      const id = idOf(item);
      if (id) itemListIds.set(id, listId);
    }
  };
  const rest = async (req: RestRequestParams): Promise<RestResponse> => {
    calls.push(req);
    const route = routes.find((r) => r.method === req.method && r.path === req.path);
    if (!route) return { statusCode: 404, body: { success: false, error: `no fake route ${req.method} ${req.path}` } };
    const key = `${req.method} ${req.path}`;
    const n = counters.get(key) ?? 0;
    counters.set(key, n + 1);
    const response = route.reply(req, n);
    if (response.statusCode < 400) {
      const body = object(response.body);
      if (req.path === 'lists.listByRoomId' && Array.isArray(body?.lists)) {
        for (const list of body.lists) { const id = idOf(list); if (id) listIds.add(id); }
      }
      if (req.path === 'lists.create') { const id = idOf(body?.list); if (id) listIds.add(id); }
      if (req.path === 'lists.info') {
        const listId = idOf(body?.list);
        const first = Array.isArray(body?.stages) ? idOf(body.stages[0]) : undefined;
        if (listId && first) firstStageIds.set(listId, first);
      }
      if (req.path === 'items.create') {
        const id = idOf(body?.item);
        const listId = object(req.body)?.listId;
        if (id && typeof listId === 'string') itemListIds.set(id, listId);
      }
      if (req.path === 'items.query' || req.path === 'items.listByListId') {
        const listId = req.path === 'items.query' ? object(req.body)?.listId : req.query?.listId;
        if (typeof listId === 'string') rememberItems(body?.items, listId);
      }
    }
    return response;
  };
  const callRest = async (req: RestRequestParams): Promise<Record<string, unknown>> => {
    const response = await rest(req);
    if (response.statusCode >= 400) throw new PrivosRestError('fake tool failed', response.statusCode);
    return object(response.body) ?? {};
  };
  const listInfo = async (listId: string): Promise<Record<string, unknown>> => {
    const body = await callRest({ method: 'GET', path: 'lists.info', query: { listId } });
    const raw = object(body.list);
    const stages = Array.isArray(body.stages) ? body.stages.map((value, index) => ({ ...object(value), order: object(value)?.order ?? index })) : body.stages;
    return { ...body, list: raw ? { ...raw, roomId: typeof raw.roomId === 'string' ? raw.roomId : 'room-1', isolatedList: raw.isolatedList ?? true } : raw, stages };
  };
  const callServerTool = async (call: { name: string; arguments: Record<string, unknown> }): Promise<unknown> => {
    toolCalls.push(call);
    const args = call.arguments;
    switch (call.name) {
      case 'mcpapp.lists.getAll':
        return callRest({ method: 'GET', path: 'lists.listByRoomId', query: { roomId: String(args.roomId) } });
      case 'mcpapp.lists.get':
        return listInfo(String(args.listId));
      case 'mcpapp.stages.getByList': {
        const info = await listInfo(String(args.listId));
        return { stages: info.stages };
      }
      case 'mcpapp.lists.create':
        return callRest({ method: 'POST', path: 'lists.create', body: args });
      case 'mcpapp.lists.updateList':
        return callRest({ method: 'POST', path: 'lists.update', body: args });
      case 'mcpapp.lists.delete':
        return callRest({ method: 'POST', path: 'lists.delete', body: args });
      case 'mcpapp.lists.queryItems':
        return callRest({ method: 'POST', path: 'items.query', body: args });
      case 'mcpapp.lists.createItem': {
        const listId = String(args.listId);
        const body = { ...args, name: args.title, stageId: firstStageIds.get(listId) };
        return callRest({ method: 'POST', path: 'items.create', body });
      }
      case 'mcpapp.lists.getItem': {
        const itemId = String(args.itemId);
        if (routes.some((route) => route.method === 'GET' && route.path === 'items.get')) {
          return callRest({ method: 'GET', path: 'items.get', query: { itemId } });
        }
        const candidates = itemListIds.has(itemId) ? [itemListIds.get(itemId)!] : [...listIds];
        for (const listId of candidates) {
          const body = await callRest({ method: 'GET', path: 'items.listByListId', query: { listId } });
          const item = Array.isArray(body.items) ? body.items.find((entry) => idOf(entry) === itemId) : undefined;
          if (item) return { item };
        }
        throw new PrivosRestError('fake item not found', 404);
      }
      case 'mcpapp.lists.updateItem':
        return callRest({ method: 'POST', path: 'items.update', body: { ...args, ...(args.title === undefined ? {} : { name: args.title }) } });
      case 'mcpapp.lists.moveItemToStage':
        return callRest({ method: 'POST', path: 'items.update', body: { itemId: args.itemId, stageId: args.stageId } });
      case 'mcpapp.lists.deleteItem':
        return callRest({ method: 'POST', path: 'items.delete', body: args });
      default:
        throw new Error(`unexpected tool ${call.name}`);
    }
  };
  return { app: { rest, callServerTool } as unknown as McpApp, calls, toolCalls };
}

export const ok = (body: Record<string, unknown>): RestResponse => ({ statusCode: 200, body: { success: true, ...body } });
export const forbidden = (): RestResponse => ({ statusCode: 403, body: { success: false, error: 'scope' } });
