# Hub atomic contract qualification

Ngày: 2026-10-01. Chỉ kiểm tra source và tài liệu trong workspace; chưa gửi mutation Hub.

| Capability | Status | Evidence |
|---|---|---|
| learningAtomic | UNVERIFIED | Không tìm thấy public Lists snapshot/conditional multi-item commit/receipt contract trong docs hiện có |
| provisionGuard | UNVERIFIED | Không tìm thấy public create-once/fenced lifecycle contract |
| Hub version/request limit | UNVERIFIED | Không có endpoint atomic được xác định để đọc schema/version/limit |
| Transaction rollback / concurrent submit | NOT RUN | Cần API mapping và tenant test |
| Lost response / original receipt replay | NOT RUN | Cần persistent receipt contract |
| Native writer invalidation / ACL revocation | NOT RUN | Không được suy từ fake local |
| Expired worker after cancel | NOT RUN | Cần server-side guard kiểm tra từng lifecycle mutation |

## Nguồn đã kiểm tra

- `privos-dev-docs/mcp-app-platform/auth-and-rest-integration.md:240-259`: operationId/idempotency ở đây dành cho agents.sandbox.generate-async, không phải Lists.
- `privos-dev-docs/mcp-app-platform/apis/items-query.md`: public paginated read; không định nghĩa transaction snapshot/commit.
- `privos-dev-docs/mcp-app-platform/api-reference.md:217`: lists:query là scope query; không có bằng chứng atomic từ scope này.
- `privos-dev-docs/room-scoped-apis/items.md:7` và `lists.md:9`: tài liệu mô tả internal routes; không dùng cho onboarding app.
- `docs/superpowers/specs/2026-09-23-onboarding-v4-hub-contracts.md:62,69` ở workspace root: CAS/atomic append/idempotency Lists đã được ghi CHƯA XÁC MINH.
- `src/ui/onboarding/data/v2-lists.ts:78`: patchFields đọc, merge customFields rồi updateItem và readback; không cung cấp transaction/version guard.

User đã chọn hướng Hub atomic. Điều đó xác nhận quyết định kiến trúc; tên endpoint, request/response schema, token coverage, receipt retention, limit và fencing vẫn cần contract để nối adapter thật. Đã hỏi đường dẫn contract/source trong lúc tiếp tục các fix độc lập.

Không đánh UNSUPPORTED chỉ vì docs chưa có. Không tạo endpoint giả hoặc gọi internal API. Local contract fake, nếu pass, không đổi status VERIFIED tại đây.

Browser read-only check: connection khả dụng chỉ có tab about:blank; connection còn lại báo profile đang được sử dụng. Không có phiên Hub test đang mở được xác nhận qua các connection này; không đóng browser hoặc thay đổi profile để thử tiếp.

## Contract handoff còn thiếu

| Điều khoản cần Hub xác nhận | Trạng thái |
|---|---|
| Public API names, Hub version, scopes, request/response/error schemas, byte/item limits | UNVERIFIED |
| Snapshot hire/run + membership + field definitions + stages; native/lifecycle writers invalidate token | UNVERIFIED |
| Session/ACL/token checks và patches+receipt cùng transaction; rollback toàn phần | UNVERIFIED |
| In-flight dedupe, canonical intent, changed-intent rejection, replay original result sau commit mới | UNVERIFIED |
| Current ACL khi đọc receipt; retention suốt installation lifetime | UNVERIFIED |
| Create-once scope/payload mismatch, acquire/renew/release/takeover, server-clock expiry | UNVERIFIED |
| Fence được kiểm tra tại từng item/list lifecycle mutation | UNVERIFIED |
| Concurrent submit, lost response, native edit, revoke ACL, rollback, oversize và stale-worker probes | NOT RUN |

Independent review H3 xác nhận kết luận UNVERIFIED và phân biệt internal batch errors với atomic contract. Local implementation chỉ được dùng contract đề xuất dưới port; không nâng status ở bảng này.
