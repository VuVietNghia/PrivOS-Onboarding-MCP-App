import { describe, expect, it } from 'vitest';
import manifest from '../privos-app.json';
import { handleMcpMessage, TOOL_NAME } from '../src/mcp-message-handlers';

describe('JSON-RPC handlers', () => {
  it('initialize báo đúng tên app và danh sách quyền của manifest', async () => {
    const init = await handleMcpMessage('initialize', 1, {});
    expect(init.serverInfo.name).toBe(manifest.name);
    expect(init.serverInfo.permissions.map((p: { scope: string }) => p.scope)).toEqual(manifest.permissions.map((p) => p.scope));
  });

  it('tools/list chỉ có đúng tool mở giao diện Onboarding, ui nằm dưới _meta', async () => {
    const listed = await handleMcpMessage('tools/list', 2, {});
    expect(listed.tools.map((tool: { name: string }) => tool.name)).toEqual([TOOL_NAME]);
    const tool = listed.tools[0];
    expect(tool.ui).toBeUndefined();
    expect(tool._meta.ui.resourceUri).toBe(`ui://${manifest.name}/form.html`);
  });

  it('từ chối tool không tồn tại', async () => {
    await expect(handleMcpMessage('tools/call', 3, { name: 'hr_whoami', arguments: {} })).rejects.toThrow('Unknown tool: hr_whoami');
  });

  it('từ chối resource URI lạ, kể cả URI của tên app cũ', async () => {
    await expect(handleMcpMessage('resources/read', 4, { uri: 'ui://ai.privos.mcp-app-demo/form.html' })).rejects.toThrow('Unknown resource');
  });

  it('từ chối method lạ', async () => {
    await expect(handleMcpMessage('nope', 5, {})).rejects.toThrow('Unknown method: nope');
  });
});
