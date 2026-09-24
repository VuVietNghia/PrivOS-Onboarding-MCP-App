import type { McpApp } from '@privos_ai/app-react';
import { describe, expect, it } from 'vitest';
import { resolveRoomBinding } from '../../src/ui/onboarding/data/room-bootstrap';
import { PrivosRestError } from '../../src/ui/privos-rest';

interface FakeList {
  _id: string;
  roomId: string;
  name: string;
  isolatedList: boolean;
  fieldDefinitions: { _id: string; name: string; type: string; options?: { value: string }[] }[];
  stages: { _id: string; name: string; order: number }[];
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid test payload');
  return value as Record<string, unknown>;
}

function toolResult(value: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

function fakeTools(initial: FakeList[] = [], options: { loseFirstCreateResponse?: boolean; hideFromEmployee?: boolean } = {}) {
  const lists = [...initial];
  const calls: { name: string; arguments: Record<string, unknown> }[] = [];
  let createCount = 0;
  const app = {
    async callServerTool(input: { name: string; arguments: Record<string, unknown> }) {
      calls.push(input);
      if (input.name === 'mcpapp.lists.getAll') {
        return toolResult({ lists: options.hideFromEmployee ? [] : lists.filter((list) => list.roomId === input.arguments.roomId) });
      }
      if (input.name === 'mcpapp.lists.get') {
        const list = lists.find((entry) => entry._id === input.arguments.listId);
        return toolResult(list ? { list, stages: list.stages } : { error: 'not found' });
      }
      if (input.name === 'mcpapp.lists.create') {
        const args = input.arguments;
        const fields = (args.fieldDefinitions as unknown[]).map((field, index) => {
          const spec = object(field);
          return { _id: `field-${lists.length}-${index}`, name: spec.name as string, type: spec.type as string,
            ...(Array.isArray(spec.options) ? { options: spec.options as { value: string }[] } : {}) };
        });
        const stages = (args.stages as unknown[]).map((stage, index) => {
          const spec = object(stage);
          return { _id: `stage-${lists.length}-${index}`, name: spec.name as string, order: index };
        });
        const list: FakeList = { _id: `list-${lists.length + 1}`, roomId: args.roomId as string,
          name: args.name as string, isolatedList: args.isolatedList === true, fieldDefinitions: fields, stages };
        lists.push(list);
        createCount += 1;
        if (options.loseFirstCreateResponse && createCount === 1) throw new Error('response lost');
        return toolResult({ list });
      }
      throw new Error(`unexpected tool ${input.name}`);
    },
  } as unknown as McpApp;
  return { app, lists, calls };
}

describe('room bootstrap', () => {
  it('creates two isolated registries on the first owner opening and reuses them on reload', async () => {
    const fake = fakeTools();
    const actor = { userId: 'admin-a', canManage: true };

    const first = await resolveRoomBinding(fake.app, 'room-a', actor);
    const second = await resolveRoomBinding(fake.app, 'room-a', actor);

    expect(first).toEqual({ state: 'ready', binding: { roomId: 'room-a', positionsListId: 'list-1', hiresListId: 'list-2' } });
    expect(second).toEqual(first);
    expect(fake.lists.map((list) => list.name)).toEqual(['Onboarding positions', 'Onboarding hires']);
    expect(fake.lists.every((list) => list.isolatedList && list.roomId === 'room-a')).toBe(true);
    expect(fake.calls.filter((call) => call.name === 'mcpapp.lists.create')).toHaveLength(2);
  });

  it('does not create registries when an employee opens an empty room first', async () => {
    const fake = fakeTools();

    expect(await resolveRoomBinding(fake.app, 'room-a', { userId: 'employee-b', canManage: false })).toEqual({ state: 'needs-admin' });
    expect(fake.calls.filter((call) => call.name === 'mcpapp.lists.create')).toHaveLength(0);
  });

  it('lets a member resolve the hire registry without reading private position metadata', async () => {
    const fake = fakeTools();
    await resolveRoomBinding(fake.app, 'room-a', { userId: 'admin-a', canManage: true });
    fake.calls.length = 0;
    const original = fake.app.callServerTool.bind(fake.app);
    fake.app.callServerTool = async (input) => {
      if (input.name === 'mcpapp.lists.get' && input.arguments?.listId === 'list-1') {
        throw new PrivosRestError('forbidden', 403, 'error-not-allowed');
      }
      return original(input);
    };

    expect(await resolveRoomBinding(fake.app, 'room-a', { userId: 'employee-b', canManage: false }))
      .toEqual({ state: 'ready', binding: { roomId: 'room-a', positionsListId: 'list-1', hiresListId: 'list-2' } });
    expect(fake.calls.some((call) => call.name === 'mcpapp.lists.get' && call.arguments.listId === 'list-1')).toBe(false);
  });

  it('ignores unrelated ordinary Lists that omit isolatedList', async () => {
    const fake = fakeTools();
    const original = fake.app.callServerTool.bind(fake.app);
    fake.app.callServerTool = async (input) => input.name === 'mcpapp.lists.getAll'
      ? toolResult({ lists: [{ _id: 'ordinary-1', roomId: 'room-a', name: 'Tasks' }, ...fake.lists.filter((list) => list.roomId === input.arguments?.roomId)] })
      : original(input);
    expect(await resolveRoomBinding(fake.app, 'room-a', { userId: 'admin-a', canManage: true })).toMatchObject({ state: 'ready' });
    expect(fake.lists).toHaveLength(2);
  });

  it('lets an employee discover the two verified registries without writing', async () => {
    const fake = fakeTools();
    const ready = await resolveRoomBinding(fake.app, 'room-a', { userId: 'admin-a', canManage: true });
    const employee = await resolveRoomBinding(fake.app, 'room-a', { userId: 'employee-b', canManage: false });
    expect(employee).toEqual(ready);
    expect(fake.calls.filter((call) => call.name === 'mcpapp.lists.create')).toHaveLength(2);
  });

  it('reports duplicate registries and missing stages without changing existing Lists', async () => {
    const fake = fakeTools();
    await resolveRoomBinding(fake.app, 'room-a', { userId: 'admin-a', canManage: true });
    fake.lists[0].stages = [];
    expect(await resolveRoomBinding(fake.app, 'room-a', { userId: 'admin-a', canManage: true })).toEqual({ state: 'blocked', code: 'BOOTSTRAP_STAGE_UNAVAILABLE' });
    fake.lists[0].stages = fake.lists[1].stages;
    fake.lists.push({ ...fake.lists[0], _id: 'duplicate' });
    expect(await resolveRoomBinding(fake.app, 'room-a', { userId: 'admin-a', canManage: true })).toEqual({ state: 'blocked', code: 'DUPLICATE_REGISTRY' });
    expect(fake.calls.filter((call) => call.name === 'mcpapp.lists.create')).toHaveLength(2);
  });

  it('reconciles a created List after its response is lost', async () => {
    const fake = fakeTools([], { loseFirstCreateResponse: true });
    expect(await resolveRoomBinding(fake.app, 'room-a', { userId: 'admin-a', canManage: true })).toMatchObject({ state: 'ready' });
    expect(fake.lists).toHaveLength(2);
    expect(fake.calls.filter((call) => call.name === 'mcpapp.lists.create')).toHaveLength(2);
  });

  it('preserves a permission failure from List readback', async () => {
    const fake = fakeTools();
    const original = fake.app.callServerTool.bind(fake.app);
    fake.app.callServerTool = async (input) => {
      if (input.name === 'mcpapp.lists.get') throw new PrivosRestError('denied', 403);
      return original(input);
    };
    await expect(resolveRoomBinding(fake.app, 'room-a', { userId: 'admin-a', canManage: true })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('reads stages separately when the MCP List response omits them', async () => {
    const fake = fakeTools();
    const actor = { userId: 'admin-a', canManage: true };
    await resolveRoomBinding(fake.app, 'room-a', actor);
    fake.lists[0].stages = [{ _id: 'ungroup', name: 'Ungroup', order: 0 }];
    const original = fake.app.callServerTool.bind(fake.app);
    fake.app.callServerTool = async (input) => {
      if (input.name !== 'mcpapp.lists.get') return original(input);
      const list = fake.lists.find((entry) => entry._id === input.arguments?.listId);
      if (!list) throw new Error('list missing');
      return toolResult({ list: { _id: list._id, name: list.name, roomId: list.roomId, isolatedList: list.isolatedList, fieldDefinitions: list.fieldDefinitions } });
    };
    const stageReads: string[] = [];
    fake.app.rest = async (request) => {
      if (request.path !== 'lists.info' || typeof request.query?.listId !== 'string') throw new Error('unexpected stage request');
      stageReads.push(request.query.listId);
      const list = fake.lists.find((entry) => entry._id === request.query?.listId);
      return { statusCode: 200, body: { success: true, list: { _id: list?._id, roomId: list?.roomId }, stages: list?.stages } };
    };

    expect(await resolveRoomBinding(fake.app, 'room-a', actor)).toEqual({ state: 'blocked', code: 'BOOTSTRAP_STAGE_UNAVAILABLE' });
    expect(stageReads).toEqual(['list-1']);
  });

  it('does not guess registry IDs when an employee cannot discover isolated metadata', async () => {
    const fake = fakeTools([], { hideFromEmployee: true });
    expect(await resolveRoomBinding(fake.app, 'room-a', { userId: 'employee-b', canManage: false })).toEqual({ state: 'needs-admin' });
    expect(fake.calls.map((call) => call.name)).toEqual(['mcpapp.lists.getAll']);
  });

  it('creates stages with colors and reads their IDs through the stage tool', async () => {
    const fake = fakeTools();
    const original = fake.app.callServerTool.bind(fake.app);
    const stageReads: string[] = [];
    fake.app.callServerTool = async (input) => {
      if (input.name === 'mcpapp.lists.get') {
        const list = fake.lists.find((entry) => entry._id === input.arguments?.listId);
        if (!list) throw new Error('list missing');
        return toolResult({ list: { id: list._id, name: list.name, roomId: list.roomId, isolatedList: true,
          fieldDefinitions: list.fieldDefinitions } });
      }
      if (input.name === 'mcpapp.stages.getByList') {
        stageReads.push(String(input.arguments?.listId));
        const list = fake.lists.find((entry) => entry._id === input.arguments?.listId);
        return toolResult({ stages: list?.stages.map((stage) => ({ id: stage._id, name: stage.name, order: stage.order })) ?? [] });
      }
      return original(input);
    };
    const ready = await resolveRoomBinding(fake.app, 'room-a', { userId: 'owner-a', canManage: true });
    expect(ready).toMatchObject({ state: 'ready' });
    const creates = fake.calls.filter((call) => call.name === 'mcpapp.lists.create');
    expect(creates).toHaveLength(2);
    expect((creates[0].arguments.stages as unknown[]).every((stage) => typeof object(stage).color === 'string')).toBe(true);
    expect(stageReads).toEqual(['list-1', 'list-2']);
  });

  it('does not mask a stage permission error with a REST fallback', async () => {
    const fake = fakeTools();
    await resolveRoomBinding(fake.app, 'room-a', { userId: 'owner-a', canManage: true });
    const original = fake.app.callServerTool.bind(fake.app);
    fake.app.callServerTool = async (input) => {
      if (input.name === 'mcpapp.lists.get') {
        const list = fake.lists.find((entry) => entry._id === input.arguments?.listId);
        return toolResult({ list: { _id: list?._id, name: list?.name, roomId: list?.roomId,
          isolatedList: true, fieldDefinitions: list?.fieldDefinitions } });
      }
      if (input.name === 'mcpapp.stages.getByList') return { isError: true,
        content: [{ type: 'text', text: JSON.stringify({ success: false, errorType: 'error-not-allowed', statusCode: 403 }) }] };
      return original(input);
    };
    let restCalls = 0;
    fake.app.rest = async () => { restCalls++; throw new Error('REST stage fallback must not run'); };
    await expect(resolveRoomBinding(fake.app, 'room-a', { userId: 'owner-a', canManage: true })).rejects.toMatchObject({ statusCode: 403 });
    expect(restCalls).toBe(0);
  });
});
