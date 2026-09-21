// tests/onboarding/fake-app.ts
import type { McpApp, RestRequestParams, RestResponse } from '@privos_ai/app-react';

export interface FakeRoute {
  method: RestRequestParams['method'];
  path: string;
  reply: (req: RestRequestParams, callIndex: number) => RestResponse;
}

export function fakeRestApp(routes: FakeRoute[]): { app: McpApp; calls: RestRequestParams[] } {
  const calls: RestRequestParams[] = [];
  const counters = new Map<string, number>();
  const rest = async (req: RestRequestParams): Promise<RestResponse> => {
    calls.push(req);
    const route = routes.find((r) => r.method === req.method && r.path === req.path);
    if (!route) return { statusCode: 404, body: { success: false, error: `no fake route ${req.method} ${req.path}` } };
    const key = `${req.method} ${req.path}`;
    const n = counters.get(key) ?? 0;
    counters.set(key, n + 1);
    return route.reply(req, n);
  };
  return { app: { rest } as unknown as McpApp, calls };
}

export const ok = (body: Record<string, unknown>): RestResponse => ({ statusCode: 200, body: { success: true, ...body } });
export const forbidden = (): RestResponse => ({ statusCode: 403, body: { success: false, error: 'scope' } });
