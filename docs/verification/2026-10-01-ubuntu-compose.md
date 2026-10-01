# Ubuntu Docker Compose packaging verification

Date: 2026-10-01. Local Windows host, Docker Engine 29.8.1 running Linux containers, Compose v5.5.1. Linux TypeScript/tests and tar verification ran in WSL; the Ubuntu operator workflow uses only Docker, Compose and standard shell tools.

## Delivered

- `compose.yaml`: production app, host `APP_PORT`, project-scoped image and named identity volume, non-root/read-only runtime, restart policy.
- `scripts/build-compose.sh`: canonical manifest/digest computed with a Node container, Compose build, exact image-label verification. No host Node/npm required.
- `scripts/pair.ts --pair-only`: waits for approved pairing-v2 identity, exits without spawning an app server.
- `scripts/package-ubuntu.sh`: allowlisted source tarball, no Git commands, credentials excluded, staged inside project, bundled shell scripts normalized to LF, SHA256 sidecar.
- `docs/deployment/ubuntu-compose.md`: installation, pairing, port configuration and upgrade commands.

## Evidence

- Pair-only test failed before implementation because it started the server and returned exit code 9; passed afterward. Default pairing still propagates the server's exit code.
- Packaging test failed before implementation (missing command), then passed using actual tar output and independently computed checksum. Final archive regenerated after removing test fixtures.
- `npm run typecheck:all`: passed.
- `npm run architecture:check`: 188 files, zero violations.
- Initial `npm test`: 767 passed, two failures in `tests/packaging.spec.ts`: `keeps every .env path out of the Marketplace ZIP` and `rejects a planted credential-like file`. Existing `scripts/package-source.sh` fails on CRLF (`pipefail\r: invalid option name`) before its Git operations. Source script was left unchanged.
- Final `npm test -- --exclude tests/packaging.spec.ts`: 121 files, 767 tests passed. Those Marketplace tests were excluded because their script invokes Git mutations prohibited by this session's AGENTS instructions.
- Compose configuration validates; `-p installation-a/b` resolves distinct image tags.
- Image built and labels verified against manifest digest `sha256:cd9e76969202b4d7e4e376f0bea0009d30d83202f7d34098ee149bcb96209c00`.
- Runtime initially failed on missing `zod`: production server imports it while it was a devDependency. Moved the existing version to production dependencies with matching lockfile; rebuilt runtime starts without crashes (`restartCount=0`).
- Container runtime: user `node`, read-only root, host 31303 mapped to container 3000. `/health` returned 200; `/ready` returned 503 with `PRODUCTION_WITHOUT_IDENTITY`, as expected before real Hub pairing.
- Pairing container executes its real CLI and rejects an empty URL with exit code 1. Its user UID 1000 can write and atomically rename a temporary probe file inside the shared identity volume. Probe removed afterward.
- Verification containers/network stopped and removed with Compose `down`; named identity volume persists.
- Initial source archive: 260 entries, 259453 bytes; no credentials, test fixtures, dependencies, Git or cache entries. All bundled `.sh` files use LF; SHA256 check passed.
- Extracted the actual tarball inside project `.cache`, then successfully built its image and verified labels again.
- Read-only code review: no remaining Critical/Important findings after image-tag and dependency corrections.

## Live boundary

No Ubuntu SSH target or live Hub pairing URL was supplied. Production readiness after real Hub approval, Relay connectivity and actual SDK credential rotation remain untested. The approved pairing command and persistent writable volume are included in the deliverable; local tests do not assert `/ready` is 200 before that operator step.

## Image name update

At the user's request, the retained image was renamed to `privos-onboarding-app:local` (same image ID `90393a39d776`). Its old tag was removed. Compose now declares default project name `privos-onboarding` and resolves images as `${COMPOSE_PROJECT_NAME}-app:local`; configuration validation and separate `installation-a/b` image resolution passed. The Ubuntu archive and checksum were regenerated: 260 entries, 259526 bytes, no excluded secrets or fixtures, all shell scripts LF, checksum valid. No image rebuild was required for the tag-only rename.
