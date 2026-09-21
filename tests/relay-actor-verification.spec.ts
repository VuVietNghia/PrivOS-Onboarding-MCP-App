import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApplicationMcpRequest, ToolCallContext, VerifiedActor } from '@privos_ai/app-server';

const handleMcpMessage = vi.fn(async () => ({ ok: true }));
vi.mock('../src/mcp-message-handlers', () => ({ handleMcpMessage }));

const { relayMcpHandler } = await import('../src/relay-transport');

/**
 * `relayMcpHandler` is the adapter between the SDK's `AppMcpHandler` contract (invoked by
 * `connectRelay`) and this app's `handleMcpMessage`. These tests prove the adapter forwards exactly
 * the actor the SDK verified — never an identity read from the request params — without booting a
 * real WebSocket relay connection.
 */

function request(params: Record<string, unknown> = { name: 'onboarding_dashboard', arguments: {} }): ApplicationMcpRequest {
  return { jsonrpc: '2.0', id: 7, method: 'tools/call', params };
}

function context(overrides: Partial<ToolCallContext> = {}): ToolCallContext {
  return { transport: 'relay', identityState: 'missing', sessionScope: 'test-scope', ...overrides };
}

function forwardedActor(): unknown {
  expect(handleMcpMessage).toHaveBeenCalledTimes(1);
  return (handleMcpMessage.mock.calls[0] as unknown[])[3];
}

describe('relayMcpHandler actor wiring', () => {
  beforeEach(() => handleMcpMessage.mockClear());

  it('chuyển tiếp đúng actor đã xác thực (user-token) cùng method, id và params', async () => {
    const actor: VerifiedActor = Object.freeze({
      userId: 'user-1',
      username: 'techcomthanh',
      roomId: 'room-1',
      claims: Object.freeze({ sub: 'user-1', rid: 'room-1' }),
      provenance: 'user-token',
    });
    await relayMcpHandler(request(), context({ identityState: 'verified', actor, roomId: 'room-1' }));
    expect(handleMcpMessage).toHaveBeenCalledWith('tools/call', 7, { name: 'onboarding_dashboard', arguments: {} }, actor);
  });

  it('không chuyển actor nào khi không có token (identityState: missing)', async () => {
    await relayMcpHandler(request(), context({ identityState: 'missing' }));
    expect(forwardedActor()).toBeUndefined();
  });

  it('không chuyển actor nào khi token sai (identityState: invalid)', async () => {
    await relayMcpHandler(request(), context({ identityState: 'invalid' }));
    expect(forwardedActor()).toBeUndefined();
  });

  it('không bao giờ lấy danh tính từ _meta.privosUser chưa xác thực', async () => {
    const params = {
      name: 'onboarding_dashboard',
      arguments: {},
      _meta: { privosUser: { userId: 'attacker-claimed-id', username: 'root', userToken: 'not-a-real-jwt' } },
    };
    await relayMcpHandler(request(params), context({ identityState: 'invalid' }));
    expect(forwardedActor()).toBeUndefined();
  });
});
