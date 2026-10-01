# Onboarding reliability — execution evidence

Ngày: 2026-10-01. Plan: workspace `docs/superpowers/plans/2026-10-01-onboarding-reliability.md`. Git base: `97665ba6464f7c5bd8b6ff0ab60138d10b653c3b`. Không tạo commit, branch, worktree hoặc thao tác remote.

## Fix coverage

| ID | Trạng thái hiện tại | Evidence |
|---|---|---|
| R1 Atomic learning | BLOCKED | Public Lists snapshot/commit/receipt contract chưa xác minh; xem hub-atomic-contract report |
| R2 Files binary | LOCAL_PASS | T2 17 focused tests; independent review PASS, gồm JSON business keys và exact bytes |
| R3 Ready template partial write | LOCAL_PASS | T3 19 focused tests; independent review PASS, verified Draft và semantic publish readback |
| R4 Provision recovery/cancel | BLOCKED | Cần Hub-side lifecycle fencing/create-once; không dùng local lock thay thế |
| R5 Duplicate day order | LOCAL_PASS | T1 44 focused tests; independent review PASS, malformed run zero writes |
| R6 Cancel cleanup retry | LOCAL_PASS | T5 cleanup 16 focused tests; independent review PASS; pending clear được retry trước recount |
| R7 Manifest test | LOCAL_PASS | T6 2 tests và manifest:lint pass; independent review PASS |

## Integration verification

Các command chạy từ app root qua WSL, dùng dependencies hiện có; cache và log nằm trong project. Lần chạy cuối sau hai regression mới của H2: 119 test files / 755 tests pass, runner exit 0.

| Command | Exit code | Kết quả lần chạy cuối |
|---|---|---|
| `npm run typecheck:all` | 0 | Source, scripts và tests pass |
| `npm run architecture:check` | 0 | 187 files, 0 violations |
| `npm run i18n:check` | 0 | 116 reachable modules pass |
| `./node_modules/.bin/vitest run --exclude tests/packaging.spec.ts` | 0 | 119 files / 755 tests pass, 121.35s |
| `npm run manifest:lint` | 0 | T6 focused verification pass; runtime manifest không đổi |
| `git diff --check` | 0 | Không có whitespace error |

Log integration: `2026-10-01-typecheck.log`, `2026-10-01-architecture.log`, `2026-10-01-i18n.log`, `2026-10-01-vitest.log` trong cùng thư mục. Lần chạy cuối có warning `NO_I18NEXT_INSTANCE` từ test có sẵn `tests/onboarding/provision-form-default-date.spec.tsx`; test đó vẫn pass.

H1: 16/16 local contract tests và strict TypeScript pass. H2: 9/9 local contract tests và strict TypeScript pass. Hai port chưa được nối vào runtime; fake chỉ nằm trong tests. Review từng task đã pass. Review tổng thể độc lập (gpt-6-astra) APPROVE phần đã triển khai, không có finding Critical/Important; không mở rộng kết luận sang R1/R4 hoặc live acceptance.

Đã đối chiếu SHA-256: cả 7 file source/test có thay đổi sẵn của người dùng giữ nguyên nội dung so với lúc bắt đầu. HEAD vẫn là commit base ở đầu report. Không tạo commit hoặc thay đổi Git state.

## Hub acceptance

Live tests NOT RUN: concurrent submit, lost commit response, revoke ACL, native writer invalidation, PNG/PDF trên Hub, guarded provision/cancel, stale worker và cleanup retry live. Một browser connection chỉ có about:blank; connection còn lại bị profile lock. Không thay đổi browser profile hoặc tạo dữ liệu Hub để thay thế contract còn thiếu.

Các báo cáo task và review artifacts nằm tại workspace `docs/superpowers/execution/2026-10-01-onboarding-reliability/`. Local fake contract, nếu pass, chỉ chứng minh harness và không chứng minh capability server.

## Phạm vi còn thiếu

R1/R4 chưa được tuyên bố fixed. Các API public, request/response schemas, token invalidation, idempotency retention và fencing phải được cung cấp/verified trước integration. Không có Hub source checkout trong workspace này. Không packaging, publish, deployment hoặc preflight.

## Quyết định thực thi

- Dùng checkout hiện tại và scoped diff vì Git chỉ được phép đọc. Giữ ledger/review artifacts tại workspace `docs/superpowers/execution/`; không có commit làm bản ghi thay thế.
- Chạy focused tests theo task và suite tổng hợp ở cuối; mọi test lại phải gắn với sửa đổi mới hoặc kết quả cần xác minh.
- Giữ wiring runtime hiện tại khi chưa có contract Hub. R1/R4 vẫn còn lỗi concurrency đã xác định; contract fake không thay thế server implementation.
- Tách cleanup R6 để sửa độc lập; phần provision recovery R4 vẫn cần fencing của Hub.
- Giữ week/child order bắt đầu từ 0 như schema và dữ liệu provision hiện tại; chỉ day order bắt buộc dương và duy nhất. Ép toàn bộ order dương sẽ cần migration schema ngoài phạm vi này.
