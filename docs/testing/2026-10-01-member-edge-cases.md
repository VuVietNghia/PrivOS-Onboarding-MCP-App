# Edge cases — role member

Ngày kiểm tra: 2026-10-01. Công cụ: Chrome DevTools, evaluate_script, device emulation và press_key.

Đã chạy các component React thật của project (EmployeeRoadmapScreen, QuizView, QuizResult, AttachmentPreviewDialog) qua fixture local. LearningService và FilesGateway là giả lập; không có request đến backend Hub. PASS chỉ xác nhận frontend trong fixture.

**Kết quả: 155/155 assertions đạt.** Kiểm tra 65 trạng thái ở 390 × 844; kiểm tra thêm ở 320 × 568. Console không có error/warning. Light/Dark chạy VI/EN; Brand chạy EN trong bộ chung và VI ở 320px. Tương phản chữ/control thấp nhất tại các trạng thái 390px: Light 4.74:1, Dark 5.82:1, Brand 9.38:1.

| Mã | Bước người dùng thử | Kết quả mong đợi | Kết quả local |
| --- | --- | --- | --- |
| EC01 | Mở quiz trống; chọn đủ rồi bỏ chọn đáp án cuối ở câu nhiều lựa chọn. | Nộp bài chỉ mở khóa khi mọi câu có đáp án. | PASS: 0 request khi bỏ trống; bỏ đáp án cuối khóa lại, Answered 1/2. |
| EC02 | Chọn radio/checkbox, đổi Light → Dark → Brand và VI ↔ EN. | Lựa chọn còn nguyên; chữ/nút nhìn thấy. | PASS: giữ lựa chọn qua theme và locale. |
| EC03 | Giả lập lưu chậm; bấm Nộp bài nhiều lần. | Khóa thao tác trong lúc chờ, chỉ gửi một lần. | PASS: service tăng đúng 1 lần gọi. Đây là chống nộp trùng frontend, chưa chứng minh backend idempotency. |
| EC04 | Giả lập lưu thất bại sau khi chọn đáp án, rồi nộp lại. | Báo lỗi, giữ đáp án, cho retry. | PASS: lựa chọn còn nguyên; retry chuyển sang kết quả. |
| EC05 | Bấm nộp với request còn chờ; bấm Về ngày học; cho request hoàn tất. | Phản hồi muộn không kéo người dùng sang kết quả; cập nhật tiến độ. | PASS: vẫn ở ngày học; quay về roadmap thấy Completed, 1/1 days completed, 100%. |
| EC06 | Có bài nộp đang xử lý; bấm Tiếp tục lưu bài liên tiếp. | Chỉ gửi một request khôi phục; hoàn tất hiện kết quả. | PASS: 1 lần gọi, kết quả 2/2. Pending được dựng sẵn; chưa test reload/persistence trên Hub. |
| EC07 | Giả lập mở/tải file lỗi; thử lại; lúc tải đang chờ bấm thêm. | Báo lỗi, cho retry, không gọi tải trùng khi pending. | PASS: mở lại được; download pending chỉ gọi 1 lần; retry hoạt động. Chưa xác nhận quyền Files hay byte tải về từ Hub. |
| EC08 | Mở preview, Tab qua control cuối, Shift+Tab tại control đầu, Escape. | Focus ở trong popup; đóng thì trả focus về nút Mở. | PASS: dùng phím thật qua DevTools; Tab/Shift+Tab vòng trong popup, Escape trả focus. |
| EC09 | Xem quiz/kết quả ở 320px, câu hỏi dài có chuỗi không dấu cách; cuộn tới đáp án cuối. | Không tràn ngang; câu hỏi/số câu trong card; đáp án cuối bấm được. | PASS trên Light/Dark/Brand, VI; 5 input đều hit-test được. Nội dung dài được thay trong DOM để thử bố cục. |
| EC10 | Lần lượt giả lập không có roadmap và lỗi tải; bấm Retry khi vẫn lỗi. | Empty khác error; lỗi có Retry, app không crash. | PASS: empty không có alert; lỗi và retry thất bại vẫn có alert/Retry. Chuyển fixture ready remount và xóa alert. |

## Tự chạy lại bằng DevTools local

Trong thư mục privos-mcp-app-demo, dùng WSL của project:

```bash
npx vite --config tests/browser/vite.config.ts --host 127.0.0.1 --port 5174 --strictPort
```

Mở http://127.0.0.1:5174/tests/browser/member-theme.html?theme=dark.

Console của fixture có các control dưới; chúng không tồn tại trên app production:

```js
window.__memberTheme.setTheme('dark');
window.__memberTheme.setLocale('vi');
window.__memberTheme.setScenario('ready');

// Chọn đáp án trước, rồi giữ request nộp ở trạng thái chờ.
window.__memberTheme.setGate('quiz', 'hold');
// Bấm Nộp bài bằng UI, thử bấm thêm và quan sát số lần gọi:
window.__memberTheme.calls.quiz;
// Cho request đang chờ thất bại:
window.__memberTheme.release('quiz', false);
// Cho các request tiếp theo thành công:
window.__memberTheme.setGate('quiz', 'resolve');

window.__memberTheme.setScenario('empty');
window.__memberTheme.setScenario('load-error');
window.__memberTheme.setScenario('pending-submission');
```

Có thể giữ/làm lỗi tương tự với read, file-content, file-download. Tải lại fixture trước mỗi nhóm case để xóa gate đang chờ. setScenario('ready') remount component và xóa dữ liệu nộp giả lập; nó không mô phỏng reload rồi đọc lại backend.

Để chạy bộ theme có sẵn: dán nội dung tests/browser/member-theme-checks.js vào Console **sau** khi bật device emulation, rồi chạy:

```js
await window.runMemberThemeChecks(['light', 'dark', 'brand']);
```

## Chưa chạy

Room Hub thật, quyền member/admin, quyền Files, lịch sử sau reload, backend idempotency và concurrent writes chưa được xác nhận. Phần nhập Markdown đang bị comment nên không nằm trong bộ test đang hoạt động.

Hệ thống duyệt tự động đã từ chối mở client.privos.io vì đích SaaS ngoài chưa được chỉ định trong yêu cầu và thao tác có thể gửi cookie/session metadata. Không có thao tác ghi dữ liệu Hub ở lượt này.

Bằng chứng máy đọc được: tests/browser/artifacts/member-theme/2026-10-01-edge-cases.json.

