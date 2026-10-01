#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
inputs=(Dockerfile .dockerignore compose.yaml compose.env.example privos-app.json
  package.json package-lock.json tsconfig.json tsconfig.scripts.json vite.config.ts
  src public scripts docs/deployment/ubuntu-compose.md README.md)
for entry in "${inputs[@]}"; do
  [[ -e "$entry" ]] || { echo "Missing deployment input: $entry" >&2; exit 1; }
done
# No symlinks: the bundle contains only files from this source tree.
if [[ -n "$(find "${inputs[@]}" -type l -print -quit)" ]]; then
  echo 'Deployment inputs contain a symlink; refusing to package.' >&2
  exit 1
fi

mkdir -p dist-deploy
archive=dist-deploy/privos-onboarding-ubuntu.tar.gz
mkdir -p .cache
staging_dir="$(mktemp -d "$project_root/.cache/ubuntu-package.XXXXXX")"
trap 'rm -rf -- "$staging_dir"' EXIT
tar --exclude='.env' --exclude='.env.*' \
  --exclude='*identity*.json' --exclude='*credentials*' \
  --exclude='*.pem' --exclude='*.key' --exclude='id_rsa*' \
  --exclude='*.tsbuildinfo' --exclude='node_modules' --exclude='.cache' \
  --exclude='.git' --exclude='dist-deploy' --exclude='docker-data' \
  -cf - "${inputs[@]}" | tar -xf - -C "$staging_dir"
# Windows source checkouts may use CRLF; every bundled shell script must run on Ubuntu.
find "$staging_dir" -type f -name '*.sh' -exec sed -i 's/\r$//' {} +
tar -czf "$archive" -C "$staging_dir" "${inputs[@]}"
(cd dist-deploy && sha256sum privos-onboarding-ubuntu.tar.gz > privos-onboarding-ubuntu.tar.gz.sha256)
echo "Created $archive"
