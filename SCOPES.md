# Permission justifications

`privos-app.json` is the authoritative declaration. This table maps every permission to a shipped
call site and explains the behavior when an optional permission is absent. Calls run as the
logged-in user through `app.callServerTool`, `app.uploadFile` or documented `app.rest` routes; no internal or service-key route is used.

| Permission | Requirement | Execution | Why / call site | Behavior when absent |
|---|---|---|---|---|
| `basic:information` | Required | Room; user + background | Reads the installation and room context (`roomId`, `userId`, `userRoles`) that `src/ui/onboarding/views/OnboardingPanel.tsx` uses to pick the Admin/HR or hire screen. | Installation is cancelled if rejected. |
| `lists:read` | Required | Room; user | Reads onboarding registries, template Lists, Stage metadata and Items through `mcpapp.lists.getAll/get/getItem` and `mcpapp.stages.getByList` (`src/ui/onboarding/data/isolated-lists.ts`, `onboarding-lists.ts`). | Installation is cancelled if rejected. |
| `lists:query` | Required | Room; user | Filters and pages v4 Items with `mcpapp.lists.queryItems` (`src/ui/onboarding/data/v2-lists.ts`); P0 ACL probe also uses the tool. Legacy paging and P0.3 limit measurement use documented `POST items.query`. | Installation is cancelled if rejected. |
| `lists:write` | Required | Room; user | Creates Lists and Items and updates Item fields through `mcpapp.lists.*` (`src/ui/onboarding/data/onboarding-lists.ts`, `isolated-lists.ts`). | Installation is cancelled if rejected. |
| `files:read` | Required | Room; user | Reads linked file metadata through `mcpapp.files.get` in `src/ui/onboarding/dev/P02ContractProbe.tsx`; P3 viewer is pending. | Installation is cancelled if rejected. |
| `files:write` | Required | Room; user | Uploads test documents through `app.uploadFile` and creates room folders through `mcpapp.folders.*` in the P0 probe; P3 editor is pending. | Installation is cancelled if rejected. |
| `rooms:read` | Optional | Room; user | Lists the current room's members so HR picks the hire from a dropdown (`listRoomMembers` in `src/ui/onboarding/data/room-members.ts`, `GET rooms.membersOrderedByRole`), and shows names instead of user ids in the hire table. Not yet confirmed against the live Portal permission catalog. | HR types the hire's username (or user id) instead; the hire table shows user ids. |
| `users:read` | Optional | Room; user | Resolves a typed username to its user id when the member list is unavailable (`lookupUser` in `src/ui/onboarding/data/room-members.ts`, `GET users.info`). | HR must type the hire's user id. |

## What enforces access

The hire screen only offers checkboxes for the hire's own tasks (`canToggle` in
`src/ui/onboarding/domain/progress.ts`). That is a user-interface check. Actual write enforcement on
isolated-list items is the Hub's, based on the `ASSIGNEE` field, and has not yet been verified on a
live Hub — see `docs/superpowers/specs/2026-09-21-onboarding-manual-check.md` row 4 in the parent
workspace.

Refresh the app installation grant in Hub before testing the new required query and Files scopes. The existing `listAllItems` fallback is legacy behavior until the v4 data layer is replaced; it is not a valid v4 path.
