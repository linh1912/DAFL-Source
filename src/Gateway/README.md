# DAFL Gateway — YARP reverse proxy (.NET 8, đợt 14)

Gateway là điểm vào chung duy nhất cho **shop + API**, chạy ở
http://localhost:8080 (service `gateway`, container `dafl-gateway`).
Nó chỉ proxy request, không chứa logic nghiệp vụ, không chạm database,
không xác thực (JWT vẫn do backend kiểm tra như trước).

## Routes (cấu hình trong `appsettings.json`, mục `ReverseProxy`)

| Route | Path | Đích (tên host trong mạng Docker) | Ghi chú |
|---|---|---|---|
| `api` | `/api/{**catch-all}` | `http://backend:8080` | Mọi API |
| `uploads` | `/uploads/{**catch-all}` | `http://backend:8080` | Ảnh admin upload |
| `health` | `/health` | `http://backend:8080` | Healthcheck backend |
| `swagger` | `/swagger/{**catch-all}` | `http://backend:8080` | Swagger UI |
| `frontend` | `/{**catch-all}` | `http://frontend:80` | Shop — route cuối cùng, ưu tiên thấp nhất (`Order: 100`) |

Endpoint riêng của gateway (không proxy): `GET /gateway/health` → trả
`Healthy`, dùng cho healthcheck Docker và stage Jenkins
"Gateway Smoke Test".

## Trang trạng thái `GET /gateway`

Trang HTML tĩnh do chính Gateway serve (không proxy qua shop), mở ở
http://localhost:8080/gateway: tiêu đề DAFL Gateway, thẻ trạng thái từng
service (Gateway :8080, Shop :3000, Backend :5000, Admin :3001, Postgres,
Kafka) với chấm xanh/xám + tên route, bảng routes và nút "Kiểm tra tất cả".

- Trạng thái **thật, không hard-code**: trang tự `fetch('/gateway/health')`
  và `fetch('/health')` qua gateway để tô chấm Gateway/Backend; Shop kiểm
  tra bằng `HEAD /` qua gateway (thử lại bằng `GET` nếu server không hỗ
  trợ HEAD). Chấm xám = chưa kiểm tra; xanh = đang chạy; đỏ = lỗi/không
  kết nối được.
- Admin/Postgres/Kafka **không có HTTP endpoint để fetch** nên luôn chấm
  xám + hướng dẫn kiểm tra thủ công (Admin: nút "Mở :3001"; Postgres/
  Kafka: `docker compose ps`) — không tô xanh giả.
- Style đúng brief: vàng `#FFD900` + hồng `#D81B60`, font Be Vietnam Pro /
  Plus Jakarta Sans, bo góc 12–16px, responsive mobile.
- `MapGet("/gateway")` và `MapGet("/gateway/health")` đăng ký **trước**
  `MapReverseProxy` trong `Program.cs` để route catch-all `/` của shop
  không nuốt mất. Trang này chỉ thuộc về Gateway — **không sửa giao diện
  shop/admin hiện tại**.

## Cổng — cổng trực tiếp vẫn giữ nguyên

Gateway là **thêm vào**, không thay thế: shop `:3000`, admin `:3001`,
backend `:5000` vẫn chạy như trước để test Selenium không đổi.

| | Cổng |
|---|---|
| Gateway | `${GATEWAY_PORT:-8080}` |
| Shop (trực tiếp) | `${FRONTEND_PORT:-3000}` |
| Admin (trực tiếp) | `${ADMIN_PORT:-3001}` |
| Backend (trực tiếp) | `${BACKEND_PORT:-5000}` |

## Admin KHÔNG qua gateway (quyết định có chủ ý)

Không có route `/admin` trong `appsettings.json`. Trang quản trị giữ
cổng riêng trực tiếp `:3001` (service `dafl-admin`) như một entry riêng,
tách khỏi lưu lượng shop công khai vì lý do bảo mật; test Selenium admin
cũng chạy thẳng `:3001`, không đổi.

## Kiểm chứng nhanh (sau `docker compose up -d --build`)

```bash
curl http://localhost:8080/gateway/health   # Healthy (gateway tự trả)
curl http://localhost:8080/health           # Healthy (proxy về backend)
curl -o NUL -w "%{http_code}" http://localhost:8080/   # 200 (proxy về shop)
```

Mở trang trạng thái đẹp ở trình duyệt: http://localhost:8080/gateway
(trang HTML do Gateway serve trực tiếp, không proxy qua shop).

## Giới hạn đã biết

- **Chưa biên dịch .NET thật trên VM này** (VM không có dotnet/docker):
  lần biên dịch thật đầu tiên là `docker compose build gateway` trên máy
  Acer. Code theo đúng mẫu `src/Backend/Dockerfile` + `Backend.csproj`
  (đã chạy thật), gói `Yarp.ReverseProxy 2.2.0` cho .NET 8.
- Không có rate-limiting / CORS phức tạp: gateway chỉ proxy; CORS (nếu
  cần) vẫn do backend cấu hình như trước.
- Gateway chỉ chạy trong Docker Compose (dùng tên host `backend`,
  `frontend` trong mạng `dafl-network`); chạy tay ngoài Docker cần sửa
  `Address` trong `appsettings.json` thành `localhost`.
