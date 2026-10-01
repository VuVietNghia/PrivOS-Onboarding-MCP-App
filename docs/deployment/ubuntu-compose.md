# Chạy trên Ubuntu bằng Docker Compose

Server cần Docker Engine đang chạy và Docker Compose v2 trở lên. Không cần cài Node.js hoặc npm trên server.

## Cài lần đầu

Chuyển `privos-onboarding-ubuntu.tar.gz` và file `.sha256` cùng thư mục lên server, rồi chạy:

```bash
sha256sum -c privos-onboarding-ubuntu.tar.gz.sha256
mkdir -p privos-onboarding
tar -xzf privos-onboarding-ubuntu.tar.gz -C privos-onboarding
cd privos-onboarding
cp compose.env.example .env
```

Sửa `.env` nếu cổng 3000 đã được sử dụng:

```dotenv
COMPOSE_PROJECT_NAME=privos-onboarding
APP_PORT=3001
```

Cổng trong container luôn là 3000; `APP_PORT` là cổng phía server. Mỗi installation trên cùng server cần `COMPOSE_PROJECT_NAME` và `APP_PORT` riêng. Giữ tên project khi cập nhật để tiếp tục dùng cùng volume identity.

Tên image mặc định là `privos-onboarding-app:local`; nếu đổi tên project, image sẽ mang tên `${COMPOSE_PROJECT_NAME}-app:local`.

Build image bằng script này để gắn manifest và digest vào image:

```bash
bash scripts/build-compose.sh
docker compose run --rm --no-deps pair
```

Lệnh `pair` hỏi URL pairing một lần do Hub Admin cấp. Dán URL vào terminal, duyệt permission ceiling trong Hub Admin > Apps và giữ terminal mở trong lúc chờ. Khi identity đã được lưu, lệnh kết thúc với exit code 0.

Khởi động app:

```bash
docker compose up -d --no-build
docker compose ps
curl -i http://localhost:3001/ready
```

Thay `3001` bằng `APP_PORT` đã chọn; mặc định là `3000`. `/ready` phải trả HTTP 200 trước khi dùng app trong Hub. App sử dụng Relay ra Hub qua mạng; cổng HTTP này phục vụ các endpoint của app, không phải giao diện web onboarding độc lập. Mở app qua Hub đã pair.

## Identity và vận hành

Compose tạo volume `${COMPOSE_PROJECT_NAME}_identity`, gắn tại `/var/lib/privos/identity`. Cả container pairing và app chạy bằng user `node`; thư mục này ghi được để SDK lưu và xoay credentials bằng atomic rename. Credentials không nằm trong image, file `.env` hoặc gói source.

```bash
docker compose logs --tail=100 app
docker compose restart app
docker compose down
docker compose up -d --no-build
```

`down` giữ volume identity. `down -v` xóa identity và buộc pairing lại. Pairing đã hoàn tất chỉ cần chạy một lần; chạy `pair` khi identity đã tồn tại sẽ bị SDK từ chối.

Nếu khởi động trước pairing, `/health` trả 200 nhưng `/ready` trả 503 với `PRODUCTION_WITHOUT_IDENTITY`. Container chưa sẵn sàng sử dụng; hoàn tất pairing rồi restart app.

## Cập nhật

Thay source bằng gói mới, giữ `.env`, tên project và volume identity, rồi chạy:

```bash
bash scripts/build-compose.sh
docker compose up -d --no-build
docker compose ps
```

Nếu manifest thay đổi và `/ready` báo `MANIFEST_DRIFT`, Refresh và duyệt lại quyền của app trong Hub trước khi kiểm tra `/ready` lần nữa.

## Tạo lại gói source

Tại thư mục source:

```bash
bash scripts/package-ubuntu.sh
```

Output: `dist-deploy/privos-onboarding-ubuntu.tar.gz` và `.sha256`. Script dùng danh sách input cố định, loại `.env`, identity, private keys, credentials, cache, dependencies và thư mục Git. Các shell script trong gói dùng LF.
