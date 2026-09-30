# Frontend i18n and UI DevTools evidence

Date: 2026-09-29

## Local production CSS fixture

The fixture used the Vite-loaded production styles and representative admin/member DOM. It is not live workflow evidence.

| Width | Coverage | Result |
| ---: | --- | --- |
| 390 px | admin/member x vi/en x light/dark/brand | 12/12 no document overflow; body margin 0; primary colors resolved; member quiz choices 65 px high |
| 768 px | admin, vi, dark | no document overflow; 850 px table stayed inside a 705 px horizontal scroll region |
| 1440 px | admin, vi, dark | no document overflow; table used the available 1278 px width |

The final responsive cascade check used the actual Vite-loaded CSS. At 390 px, `.v4-app` resolved to `display: block`, `.v4-builder-grid` resolved to one 390 px column, and document overflow was false. At 768 px, `.v4-app` resolved to a 72 px sidebar plus a 681 px content column, and document overflow was false.

Dark theme foreground/background resolved to `rgb(232, 233, 232)` / `rgb(8, 13, 15)`. Brand primary controls resolved to dark text over a yellow-to-light-gray gradient. DevTools exposed and verified a native-button foreground regression before the CSS fix; stat values now inherit the dark foreground.

## Live PrivOS room

- URL: `https://roxane-dev.privos.io/group/test-apps-6dps39/mcpapp/6ab0d302ffc839e229eebbe0`
- Result: BLOCKED before frontend render.
- Host message: `App did not respond in time. Try again later.`
- `mcp-apps.ui-resource`: HTTP 400.
- `mcp-apps.relay-status`: HTTP 200.
- Rechecked after the final production build with the same timeout and HTTP statuses.
- No credentials, cookies, authorization headers, or raw request bodies are stored here.

## Postman

Read-only discovery found two accessible workspaces and no onboarding collection or runnable onboarding suite. No Postman resource was mutated.

## Final verification

- `npm run typecheck:all`: passed.
- `npm run typecheck:strict-unused`: passed.
- `npm run i18n:check`: passed for 118 reachable modules.
- `npm run architecture:check`: passed for 181 files with 0 violations.
- `npm run build`: passed for 339 modules; manifest lint valid.
- Frontend suite: 103 files and 616 tests passed.
- Whole repository: 113 files and 652 tests passed; the same 3 baseline failures remain in the manifest and CRLF packaging tests.
- Final production bundle boundary: passed after restoring the production build.
- Backend and business-flow diff scope: empty.
