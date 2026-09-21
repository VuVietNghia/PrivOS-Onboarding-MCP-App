# Permission justifications

`privos-app.json` is the authoritative declaration. This table maps every permission to a shipped
call site and explains the behavior when an optional permission is absent. Every call runs as the
logged-in user through `app.rest` (`src/ui/privos-rest.ts`); no internal or service-key route is used.

| Permission | Requirement | Execution | Why / call site | Behavior when absent |
|---|---|---|---|---|
| `basic:information` | Required | Room; user + background | Reads the installation and room context (`roomId`, `userId`, `userRoles`) that `src/ui/onboarding/views/OnboardingPanel.tsx` uses to pick the Admin/HR or hire screen. | Installation is cancelled if rejected. |
| `lists:read` | Required | Room; user | Reads onboarding template lists, the hire-record list and per-hire roadmap lists — fields, stages and items (`src/ui/onboarding/data/onboarding-lists.ts`, `find-lists.ts`). | Installation is cancelled if rejected. |
| `lists:query` | Optional | Room; user | Pages through list items with `POST items.query` (`listAllItems` in `src/ui/onboarding/data/onboarding-lists.ts`). | Falls back to `GET items.listByListId`, which returns at most 500 items; every screen says so instead of showing a silent subset, and provisioning refuses to run when the hire list is capped rather than risk a duplicate. |
| `lists:write` | Required | Room; user | Creates template lists, hire records and per-hire roadmap lists, and lets a hire mark their own tasks done (`src/ui/onboarding/data/onboarding-lists.ts`, `flows/provision-roadmap.ts`, `flows/toggle-task.ts`). | Installation is cancelled if rejected. |
| `rooms:read` | Optional | Room; user | Lists the current room's members so HR picks the hire from a dropdown (`listRoomMembers` in `src/ui/onboarding/data/room-members.ts`, `GET rooms.membersOrderedByRole`), and shows names instead of user ids in the hire table. Not yet confirmed against the live Portal permission catalog. | HR types the hire's username (or user id) instead; the hire table shows user ids. |
| `users:read` | Optional | Room; user | Resolves a typed username to its user id when the member list is unavailable (`lookupUser` in `src/ui/onboarding/data/room-members.ts`, `GET users.info`). | HR must type the hire's user id. |

## What enforces access

The hire screen only offers checkboxes for the hire's own tasks (`canToggle` in
`src/ui/onboarding/domain/progress.ts`). That is a user-interface check. Actual write enforcement on
isolated-list items is the Hub's, based on the `ASSIGNEE` field, and has not yet been verified on a
live Hub — see `docs/superpowers/specs/2026-09-21-onboarding-manual-check.md` row 4 in the parent
workspace.
