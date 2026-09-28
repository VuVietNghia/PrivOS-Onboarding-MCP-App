import { describe, expect, it } from 'vitest';

import { createManifest } from '../src/manifest';
import { createAppMcpHandler } from '../src/mcp-message-handlers';

const handleMcpMessage = createAppMcpHandler().handle;

// The Hub's readiness check for local and publisher-hosted execution: it lifts a served
// tool's `_meta.ui` to `ui` (dropping undefined members) and requires the result to equal the
// reviewed manifest's tools byte for byte in canonical (key-sorted) JSON.
function hubMapping(tool: any) {
	const mapped: Record<string, unknown> = {
		name: tool.name,
		title: tool.title || tool.name,
		description: tool.description || '',
		inputSchema: tool.inputSchema || {},
	};
	if (tool._meta?.ui) {
		const ui: Record<string, unknown> = { resourceUri: tool._meta.ui.resourceUri, csp: tool._meta.ui.csp };
		if (tool._meta.ui.permissions !== undefined) ui.permissions = tool._meta.ui.permissions;
		if (tool._meta.ui.hideAiChat === true) ui.hideAiChat = true;
		mapped.ui = ui;
	}
	return mapped;
}
const canonical = (value: unknown) => JSON.stringify(value, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
const byName = (a: { name?: unknown }, b: { name?: unknown }) => (String(a.name) < String(b.name) ? -1 : String(a.name) > String(b.name) ? 1 : 0);

describe('readiness tool affinity', () => {
	it('tools/list, after the Hub mapping, equals the reviewed manifest tools', async () => {
		const served = (await handleMcpMessage('tools/list', 2, {})) as { tools: any[] };
		expect(canonical([...served.tools].map(hubMapping).sort(byName))).toBe(canonical([...createManifest().tools].sort(byName)));
	});
});
