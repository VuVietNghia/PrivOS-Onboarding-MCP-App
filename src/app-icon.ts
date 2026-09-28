/**
 * Shared icon-as-data-URI resolution for every entry point that needs to hand
 * this app's icon to the Hub (pairing metadata, MCP `initialize` response).
 * Reads the icon path declared in the reviewed manifest so every surface
 * advertises the exact same icon the Marketplace listing shows.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

import pkg from '../privos-app.json';
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Read the manifest's icon file as a data URI (`data:image/svg+xml;base64,...`). */
export function getAppIconDataUri(): string | undefined {
	const iconPath = pkg.icon?.startsWith('/') ? path.join(moduleDir, '..', pkg.icon) : undefined;
	if (!iconPath || !fs.existsSync(iconPath)) {
		return undefined;
	}
	const ext = path.extname(iconPath).slice(1);
	const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
	const data = fs.readFileSync(iconPath).toString('base64');
	return `data:${mime};base64,${data}`;
}
