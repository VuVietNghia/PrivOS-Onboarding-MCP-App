import { describe, expect, it } from 'vitest';
import { buildP0InlineHtml } from '../../src/p0-inline-ui';
import { handleMcpMessage, setDevUiHtml } from '../../src/mcp-message-handlers';
import manifest from '../../privos-app.json';

const resourceUri = (manifest.tools as { ui?: { resourceUri?: string } }[])
  .find((tool) => tool.ui?.resourceUri)?.ui?.resourceUri;

describe('paired Relay P0 UI delivery', () => {
  it('embeds the P0 controls and all executable assets in the Hub shell', async () => {
    expect(resourceUri).toBeTruthy();
    const html = await buildP0InlineHtml();
    expect(html).toContain('P0 Hub contract tests');
    expect(html).toContain('P0.1 Hub contract');
    expect(html).toContain('P0.2 ACL and Files');
    expect(html).toContain('P0.3 limits');
    expect(html).toMatch(/<style>[^]*<\/style>/);
    expect(html).toMatch(/<script>[^]*<\/script>/);
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+href=/);
    expect(html).not.toContain('localhost:5179');

    setDevUiHtml(html);
    const result = await handleMcpMessage('resources/read', 1, { uri: resourceUri });
    expect(result.contents[0].text).toBe(html);
  }, 20_000);
});
