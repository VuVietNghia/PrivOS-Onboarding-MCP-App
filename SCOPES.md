# Permission justifications

`privos-app.json` is the authoritative declaration. This table maps every permission to a shipped
call site and explains the behavior when an optional permission is absent. Calls run as the
logged-in user through `app.callServerTool`, `app.uploadFile` or documented `app.rest` routes; no internal or service-key route is used.

| Permission | Requirement | Execution | Why / call site | Behavior when absent |
|---|---|---|---|---|
| `basic:information` | Required | Room; user + background | `src/ui/composition/PrivosOnboardingRoot.tsx` binds verified `roomId`, `userId` and `userRoles` to the session services and selects the Admin/HR or hire screen. | Installation is cancelled if rejected. |
| `lists:read` | Required | Room; user | Reads onboarding registries, template Lists, Stage metadata and Items through `mcpapp.lists.getAll/get/getItem` and `mcpapp.stages.getByList` (`src/ui/onboarding/data/isolated-lists.ts`, `onboarding-lists.ts`). | Installation is cancelled if rejected. |
| `lists:query` | Required | Room; user | Filters and pages v4 Items with `mcpapp.lists.queryItems` (`src/ui/onboarding/data/v2-lists.ts`); P0 ACL probe also uses the tool. Legacy paging and P0.3 limit measurement use documented `POST items.query`. | Installation is cancelled if rejected. |
| `lists:write` | Required | Room; user | Creates Lists and Items and updates Item fields through `mcpapp.lists.*` (`src/ui/onboarding/data/onboarding-lists.ts`, `isolated-lists.ts`). | Installation is cancelled if rejected. |
| `files:read` | Required | Room; user | `src/ui/onboarding/data/privos/files-adapter.ts` re-reads linked file metadata through `mcpapp.files.get` before opening or downloading. | Installation is cancelled if rejected. |
| `files:write` | Required | Room; user | `src/ui/onboarding/data/files.ts` uploads lesson files through `app.uploadFile` and verifies `Onboarding/<position>` room folders through `mcpapp.folders.*`; the P0 probe exercises the same transport. | Installation is cancelled if rejected. |
| `rooms:read` | Optional | Room; user | Lists only current-room members: `GET channels.members` for room type `c`, `GET groups.members` for `p`. The Hub installation must actually grant this scope; the manifest request is insufficient. Verify the private-group route against the live bridge allowlist. | HR types the hire's username or user ID. |
| `users:read` | Optional | Room; user | Resolves a typed username or user ID when the member list is unavailable (`lookupUser` in `src/ui/onboarding/data/room-members.ts`, `GET users.info` with the typed value as `userId`). The live public `users.list` route did not apply its username filter, so the app verifies the returned ID or username exactly. | HR must type the hire's user ID. |

## What enforces access

The hire screen only offers checkboxes for the hire's own tasks (`canToggle` in
`src/ui/onboarding/domain/progress.ts`). That is a user-interface check. Actual write enforcement on
isolated-list items is the Hub's, based on the `ASSIGNEE` field, and has not yet been verified on a
live Hub — see `docs/superpowers/specs/2026-09-21-onboarding-manual-check.md` row 4 in the parent
workspace.

Refresh the app installation grant in Hub before testing the new required query and Files scopes. The existing `listAllItems` fallback is legacy behavior until the v4 data layer is replaced; it is not a valid v4 path.
