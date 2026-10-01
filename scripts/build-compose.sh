#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

# Generate the canonical manifest using Docker: Ubuntu needs no host Node/npm.
manifest_output="$(docker run --rm -i \
  --mount "type=bind,src=$project_root/privos-app.json,dst=/manifest.json,readonly" \
  node:22-alpine node --input-type=module <<'NODE'
import crypto from 'node:crypto';
import fs from 'node:fs';
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
}
const manifest = JSON.stringify(canonicalize(JSON.parse(fs.readFileSync('/manifest.json', 'utf8'))));
console.log(Buffer.from(manifest).toString('base64'));
console.log(`sha256:${crypto.createHash('sha256').update(manifest).digest('hex')}`);
NODE
)"
mapfile -t manifest_values <<< "$manifest_output"
[[ ${#manifest_values[@]} == 2 ]] || { echo 'Invalid canonical manifest output' >&2; exit 1; }
export PRIVOS_MCP_MANIFEST_JSON
export PRIVOS_MCP_MANIFEST_DIGEST
PRIVOS_MCP_MANIFEST_JSON="$(printf '%s' "${manifest_values[0]}" | base64 --decode)"
PRIVOS_MCP_MANIFEST_DIGEST="${manifest_values[1]}"

docker compose config --quiet
docker compose build app
image_tag="$(docker compose config --images | sort -u)"
actual_manifest="$(docker image inspect "$image_tag" --format '{{ index .Config.Labels "io.privos.mcp.manifest" }}')"
actual_digest="$(docker image inspect "$image_tag" --format '{{ index .Config.Labels "io.privos.mcp.manifest-digest" }}')"
[[ "$actual_manifest" == "$PRIVOS_MCP_MANIFEST_JSON" ]] || { echo 'Image manifest mismatch' >&2; exit 1; }
[[ "$actual_digest" == "$PRIVOS_MCP_MANIFEST_DIGEST" ]] || { echo 'Image manifest digest mismatch' >&2; exit 1; }
echo "Built $image_tag ($actual_digest)"
