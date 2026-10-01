# Owner template ordering

Approved bounded design: Owner Template tab orders by latest registry-item update, including creation, save and status changes. Hub performs `_updatedAt` descending sorting before pagination. The timestamp also changes for other registry writes such as in-use recounts, as stated in the approved design.

## Implementation

- `V4Onboarding.tsx`: Template screen requests `updated-desc`; search/status state survives editor navigation and mutation-triggered catalog remounts. Existing remount/reload resets to page one. Filters reset on user/room/role change.
- `ports/catalogs.ts` and `data/catalogs.ts`: optional template catalog ordering; existing consumers keep default order.
- `ports/lists.ts`, `data/privos/lists-adapter.ts`, `data/v2-lists.ts`: typed optional query sort reaches the public Lists tool, retaining default order ascending for other reads.
- Public contract: sibling `privos-dev-docs/mcp-app-platform/apis/items-query.md`, sort fields at line 42 and cursor reset rules at lines 89–95.

## Verification

RED: `vitest run tests/onboarding/catalogs.spec.ts tests/onboarding/v4-bootstrap.spec.tsx` exited 1, with 3 new tests failing because the requested updated-desc sort was absent; 18 existing tests passed. Log: `2026-10-01-template-order-red.log`.

GREEN focused: `vitest run tests/onboarding/catalogs.spec.ts tests/onboarding/v4-bootstrap.spec.tsx tests/onboarding/v2-lists-tool.spec.ts tests/onboarding/catalog-page-race.spec.tsx` exited 0, 27 tests passed across 4 files. Coverage: emitted Hub sort on both pages, retained filters after saving a new draft, and discarded cursor with retained filter after disabling a template. Log: `2026-10-01-template-order-focused.log`.

Independent reviewer `/root/review_template_order`: APPROVE, no actionable findings in the eight-file diff. Confirmed server sort propagation, default-order compatibility, filter retention and pagination reset. Reviewer did not rerun tests or assert live acceptance.

Final verification (WSL, project-local cache), command chain exited 0:

- `npm run typecheck:all`: PASS.
- `npm run architecture:check`: PASS, 187 files / 0 violations.
- `npm run i18n:check`: PASS, 116 reachable modules.
- `npm test -- --exclude tests/packaging.spec.ts`: PASS, 119 files / 758 tests, 115.81s.
- `git diff --check`: exit 0.

Combined log: `2026-10-01-template-order-verification.log`. Existing `NO_I18NEXT_INSTANCE` warning from `tests/onboarding/provision-form-default-date.spec.tsx` remains; that test passes. Packaging excluded from the current verification scope.

No live Hub acceptance performed. Tests verify emitted public-tool arguments and local UI behavior with controlled dependencies. No Git mutations. Seven pre-existing user-owned source/test file hashes remain unchanged.
