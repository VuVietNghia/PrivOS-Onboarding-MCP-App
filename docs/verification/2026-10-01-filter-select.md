# Status filters: native select

Theo yêu cầu điều chỉnh của người dùng, đổi dãy nút trạng thái ở Nhân sự và Template thành native `select/option`, nằm trong thanh lọc với nhãn hiển thị. Các hành vi giữ bộ lọc, reset, query và phân trang giữ nguyên.

`StatusSelect` chỉ chuyển giá trị nằm trong danh sách choices sang `onStatus`, không ép kiểu event value. Desktop giới hạn bề rộng control 220px, mobile dùng 100% hàng; nhãn option dài không làm control nở rộng.

## Verification

- RED trước sửa: 2 tests fail do chưa có select; 2 tests pass. Log `2026-10-01-filter-select-red.log`.
- Focused GREEN: 19 tests / 3 files pass; chọn option, callback, reset, giữ lựa chọn sau navigation/mutation. `npm run typecheck:all` pass. Log `2026-10-01-filter-select-focused.log`.
- Independent reviewer `/root/review_status_select`: APPROVE; không có finding mới.
- `git diff --check`: exit 0.
- `npm run architecture:check` và `npm run i18n:check`: PASS.
- `npm test -- --exclude tests/packaging.spec.ts`: 120 files / 764 tests PASS, 119.15s; command chain exit 0. Log `2026-10-01-filter-select-verification.log`. Warning có sẵn `NO_I18NEXT_INSTANCE` từ `provision-form-default-date.spec.tsx` vẫn xuất hiện; test đó pass.

## Browser stress check

Fixture local dùng component/CSS thật: `tests/browser/catalog-filters.html`. Thêm 100 option bằng DOM trong browser, mỗi option có nhãn dài, chọn option cuối để đo kích thước control đóng:

| Tab / viewport | Tổng options | Width trước / sau | Height | Document scrollWidth |
|---|---:|---|---:|---:|
| Nhân sự / 1440px | 106 | 220 / 220px | 42px | 1440px |
| Nhân sự / 390px | 106 | 358 / 358px | 42px | 390px |
| Template / 390px | 104 | 358 / 358px | 42px | 390px |

Không có tràn ngang trang trong các phép đo trên. Option stress chỉ tồn tại trong DOM fixture, không thêm vào dữ liệu sản phẩm. Server fixture đã dừng. Chưa kiểm thử live Hub.
