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
| `rooms:read` | Required | Room; user | Lists current-room members for the mandatory employee picker: `GET channels.members` for room type `c`, `GET groups.members` for `p`. The Hub installation must actually grant this scope; the manifest request is insufficient. | Installation is cancelled if rejected. |
| `users:read` | Optional | Room; user | Resolves a typed username or user ID when the member list is unavailable (`lookupUser` in `src/ui/onboarding/data/room-members.ts`, `GET users.info` with the typed value as `userId`). The live public `users.list` route did not apply its username filter, so the app verifies the returned ID or username exactly. | HR must type the hire's user ID. |

## Room member integration guard

`@privos_ai/app-react` 0.6.0 can omit `roomType` from `usePrivosContext()` even when the user-session `mcpapp.context.get` result contains it. When the hook has no supported type, `room-members.ts` reads raw context, verifies that its `roomId` equals the bound room, and then selects `channels.members` for `c` or `groups.members` for `p`. A room mismatch or unsupported type is an error. A route denial remains a defensive runtime fallback for stale installations, but new installations must grant `rooms:read`. Do not log or display context tokens.

Check four separate facts after SDK or permission changes: the manifest declaration, the installation's effective grant, the Hub bridge route/status, and the data rendered by the picker. A declared `rooms:read` scope or a successful context call alone does not prove that `groups.members` returns members.

`getCurrentRoomMemberIds(app)` reads the active room ID/type from `mcpapp.context.get` for every
invocation, then reads its members through the corresponding route. This ID-only path requires
effective `rooms:read` on each installation and current-user room access; it does not call
`users.info`, so `users:read` is unnecessary for this function. It rejects invalid member IDs and
incomplete pagination instead of silently dropping rows. A denied member route raises
`ROOM_MEMBERS_UNAVAILABLE`; an empty list is returned only for a valid empty-room response.
The earlier 403 in test apps and success in Inbox were observations of those installations, not
fixed properties of either room.

## What enforces access

The hire screen only offers checkboxes for the hire's own tasks (`canToggle` in
`src/ui/onboarding/domain/progress.ts`). That is a user-interface check. Actual write enforcement on
isolated-list items is the Hub's, based on the `ASSIGNEE` field, and has not yet been verified on a
live Hub — see `docs/superpowers/specs/2026-09-21-onboarding-manual-check.md` row 4 in the parent
workspace.

Refresh the app installation grant in Hub before testing the new required query and Files scopes. The existing `listAllItems` fallback is legacy behavior until the v4 data layer is replaced; it is not a valid v4 path.
