# DAFL — Sàn thương mại điện tử (repo Source: `linh1912/DAFL-Source`)

Ứng dụng thương mại điện tử DAFL (bản fork mỹ phẩm đa gian hàng "GlowMart"),
là hệ thống được kiểm thử (SUT) của đồ án tốt nghiệp Continuous Testing với
Quality Gate tự động. Repo này chứa **mã nguồn FE + BE của SUT + Gateway +
CI/CD** (pipeline tổng). Repo test nằm riêng ở
`linh1912/DAFL_DO_AN_TOT_NGHIEP`.

> **Repo chính từ đợt 14 là `linh1912/DAFL-Source`.** Repo cũ
> `linh1912/DAFL` chỉ còn làm bản lưu, không cập nhật nữa — xem mục
> "Sửa giao diện sau đợt 14" bên dưới.

## Kiến trúc (đợt 14: thêm Gateway YARP)

```text
                    ┌──────────────────────────────┐
                    │  Gateway YARP (.NET 8) :8080 │
                    │  /api, /uploads, /health,    │
                    │  /swagger → backend          │
                    │  / → shop                    │
                    │  /gateway → trang trạng thái │
                    └──────┬───────────────┬───────┘
                           │               │
              ┌────────────┴───┐  ┌────────┴────────┐
              │ Backend :5000  │  │ Shop :3000      │
              │ .NET 8 API     │  │ React + Vite    │
              │ + Postgres,    │  └─────────────────┘
              │   Kafka        │
              └────────────────┘
                    ┌──────────────────────────────┐
                    │  Admin :3001 — ĐI THẲNG,     │
                    │  KHÔNG qua gateway (entry    │
                    │  riêng vì lý do bảo mật)     │
                    └──────────────────────────────┘
```

| Service | Container | Cổng | Ghi chú |
|---|---|---|---|
| Gateway (YARP .NET 8) | `dafl-gateway` | `${GATEWAY_PORT:-8080}` | Điểm vào chung shop + API; xem `src/Gateway/README.md` |
| Shop (web bán hàng) | `dafl-frontend` | `${FRONTEND_PORT:-3000}` | Qua gateway `/` hoặc trực tiếp `:3000` |
| Admin (trang quản trị) | `dafl-admin` | `${ADMIN_PORT:-3001}` | **Chỉ trực tiếp `:3001`, không qua gateway** |
| Backend API | `dafl-backend` | `${BACKEND_PORT:-5000}` | Qua gateway `/api` hoặc trực tiếp `:5000` |
| PostgreSQL 16 | `dafl-postgres` | 5432 | Database `dafl_db` |
| Kafka (KRaft) | `dafl-kafka` | 9092 | Hàng đợi sự kiện |

**Cổng trực tiếp `:3000` / `:3001` / `:5000` giữ nguyên** để test Selenium
không đổi — Gateway là thêm vào, không thay thế. Admin không có route qua
gateway (quyết định có chủ ý, xem `src/Gateway/README.md`).

Routes qua gateway (`src/Gateway/appsettings.json`): `/api/{**catch-all}`,
`/uploads/{**catch-all}`, `/health`, `/swagger/{**catch-all}` → backend;
`/{**catch-all}` → shop (route cuối, ưu tiên thấp nhất). Endpoint riêng
của gateway (không proxy): `GET /gateway/health` → `Healthy`, và
`GET /gateway` → trang trạng thái HTML đẹp (thẻ trạng thái từng service +
bảng routes + nút kiểm tra, trạng thái tô bằng fetch thật).

## Quick start

```bash
# Copy file môi trường mẫu rồi điền key thật (PayOS, SMTP, JWT...)
cp .env.example .env

# Chạy tất cả service (postgres, kafka, backend, gateway, shop :3000, admin :3001)
docker compose up -d --build

# Kiểm tra nhanh
curl http://localhost:5000/health            # Healthy (backend trực tiếp)
curl http://localhost:8080/gateway/health    # Healthy (gateway)
curl http://localhost:8080/health            # Healthy (backend qua gateway)
# Mở trình duyệt: shop http://localhost:3000, admin http://localhost:3001,
# trang trạng thái gateway http://localhost:8080/gateway
```

Build/test FE trực tiếp bằng npm (ở `src/` — workspace root, chạy
`npm install` 1 lần ở đây; không dùng tiền tố `VAR=value` kiểu Unix nên
chạy được cả trên Windows lẫn Linux/CI):

```bash
cd src
npm run build:web    # build app shop (tsc + vite build, workspace dafl-frontend)
npm run build:admin  # build app admin riêng (workspace dafl-admin)
npm run test:web     # vitest app shop
npm run test:admin   # vitest app admin riêng
```

## Kiểm chứng Gateway (sau `docker compose up -d --build`)

```bash
curl http://localhost:8080/gateway/health   # Healthy (gateway tự trả)
curl http://localhost:8080/health           # Healthy (proxy về backend)
curl http://localhost:8080/ -o NUL -w "%{http_code}"   # 200 (proxy về shop, Windows PowerShell)
# Linux/macOS: curl -o /dev/null -w "%{http_code}" http://localhost:8080/
```

Mở trang trạng thái ở trình duyệt: http://localhost:8080/gateway
(trang HTML do Gateway serve trực tiếp, không proxy qua shop).

## Tạo repo DAFL-Source (làm 1 lần, trên máy Acer)

Muse không tự push lên GitHub của bạn được — bạn tạo repo và push bằng
các lệnh sau (repo này trên máy Muse chỉ là cây làm việc, KHÔNG commit /
KHÔNG push từ đây):

```powershell
# 1. Tạo repo TRỐNG trên GitHub: https://github.com/new
#    Owner: linh1912, tên: DAFL-Source, KHÔNG tick README / .gitignore / license.

# 2. Trong thư mục DAFL cũ (C:\Users\Acer\DAFL, nhánh local linh-develop,
#    đã có code đợt 14 gồm Gateway):
cd C:\Users\Acer\DAFL
git remote -v
git remote add source https://github.com/linh1912/DAFL-Source.git
git push source linh-develop:main
git ls-remote source   # kiểm chứng: phải thấy nhánh main

# 3. Clone bản làm việc MỚI (thư mục riêng, từ nay làm việc ở đây,
#    không sửa trong thư mục DAFL cũ nữa):
cd C:\Users\Acer
git clone https://github.com/linh1912/DAFL-Source.git DAFL-Source
cd DAFL-Source
Copy-Item C:\Users\Acer\DAFL\.env .\.env   # file .env KHÔNG lên git, phải copy tay
docker compose up -d --build
```

Sau bước này, remote `linh` (repo cũ `linh1912/DAFL`) chỉ còn là bản lưu —
không push code mới lên đó nữa. Trong thư mục `DAFL-Source` mới, remote
mặc định là `origin` trỏ tới `linh1912/DAFL-Source`, nhánh làm việc là
`main`.

## Sửa giao diện sau đợt 14

Quy trình chuẩn mỗi lần sửa giao diện (nút, chữ, màu, layout...) sau đợt 14:

1. **Repo chính là `linh1912/DAFL-Source`** — repo cũ `linh1912/DAFL` chỉ
   còn làm bản lưu, không cập nhật nữa.
2. **Sửa code trong bản clone mới `C:\Users\Acer\DAFL-Source`** (thư mục
   riêng vừa clone ở trên), **không sửa trong thư mục `DAFL` cũ**.
3. **Sau khi sửa, kiểm chứng rồi mới push:**

   ```powershell
   cd C:\Users\Acer\DAFL-Source
   cd src
   npm run test:web      # sửa shop: chạy Vitest web (sửa admin: npm run test:admin)
   npm run build:web     # sửa shop: build web (sửa admin: npm run build:admin)
   cd ..
   docker compose up -d --build --force-recreate   # xem giao diện mới ở :3000 / :3001
   git add <file đã sửa>   # chỉ add file mình sửa, KHÔNG git add -A bừa
   git commit -m "Mo ta ngan gon ve thay doi giao dien"
   git push origin main   # Jenkins sẽ tự chạy test + Quality Gate
   ```

4. **⚠️ Cảnh báo — đừng đổi tên nút / chữ hiển thị / `data-testid` tùy
   tiện:** test Selenium bám vào đúng các tên đó (nút bấm, chữ hiển thị,
   `data-testid` trong code). Đổi 1 cái tên là test liên quan sẽ fail, và
   Quality Gate sẽ chặn deploy. Nếu thật sự cần đổi, phải **cập nhật test
   tương ứng trong repo `linh1912/DAFL_DO_AN_TOT_NGHIEP`** rồi chạy lại
   suite đó trước khi push code giao diện.

## CI/CD — phân công 2 repo (đừng nhầm)

Luồng CI tổng (pipeline trong `Jenkinsfile` của repo này):

```text
Source checkout code (DAFL-Source, nhánh main)
  → clone repo test (linh1912/DAFL_DO_AN_TOT_NGHIEP, nhánh main)
      vào build-worktree/dafl-tests
  → build source + Gateway (docker compose build backend frontend admin gateway)
  → Gateway Smoke Test (curl /gateway/health, /health, shop qua gateway)
  → chạy suite Selenium TỪ repo test (không copy test sang repo Source):
      dafl-tests/automation/testng-web.xml   (web :3000)
      dafl-tests/automation/testng-admin.xml (admin :3001)
  → Functional Quality Gate (fail 1 test → dừng pipeline)
  → chạy JMeter TỪ repo test: dafl-tests/performance/dafl-loadtest.jmx
  → Performance Quality Gate (lỗi ≤ 2%, avg RT ≤ 1000ms;
      script dafl-tests/quality-gate/check_performance_gate.sh)
  → deploy (stop/rm/up backend frontend admin gateway)
```

Phân công rõ ràng:

| | Repo Source (`linh1912/DAFL-Source`) | Repo test (`linh1912/DAFL_DO_AN_TOT_NGHIEP`) |
|---|---|---|
| Chứa | Mã nguồn FE + BE + Gateway + CI/CD tổng | Test Selenium + JMeter + tài liệu test |
| Jenkinsfile | 1 file `Jenkinsfile` — pipeline **tổng** (checkout source + clone test + build + chạy test + Quality Gate + deploy) | 3 file riêng: `Jenkinsfile`, `Jenkinsfile.auto`, `Jenkinsfile.pt` — chạy test **độc lập** (tự clone SUT vào `sut/`) |
| JMeter | Không có file `.jmx` — dùng file của repo test | `performance/dafl-loadtest.jmx` (giữ nguyên ở đây, **không tách ra repo riêng**) |

Nói ngắn gọn: **Jenkinsfile của repo test chạy test độc lập; Jenkinsfile
của Source chạy toàn trình và tái dùng test từ repo test.** Không copy test
sang repo Source, không viết lại/duplicat CI/CD test từ đầu, không sửa các
Jenkinsfile trong repo test.

> **Lưu ý:** `Jenkinsfile` ở repo này hiện chưa chạy thật trên máy chủ
> Jenkins nào — Jenkins là file cấu hình, chưa có server Jenkins nào được
> cài/chạy. Push code lên GitHub hiện tại chưa tự kích hoạt gì; để xem thay
> đổi vẫn cần `docker compose up -d --build` tay trên máy Acer + chạy test
> tay. Dựng Jenkins thật là bước tiếp theo sau đợt 14.

## Tách Web / Admin — cấu trúc thư mục riêng (đợt 13)

Shop và admin **tách hẳn thành 2 app riêng** dưới `src/` (npm workspaces),
code dùng chung để ở `src/Shared/`; backend vẫn 1 API chung:

| | Shop (web) | Admin | Dùng chung |
|---|---|---|---|
| Thư mục | `src/Frontend/` | `src/Admin/` | `src/Shared/` |
| Service Docker | `frontend` (`dafl-frontend`) | `admin` (`dafl-admin`) | — |
| Cổng | `${FRONTEND_PORT:-3000}` | `${ADMIN_PORT:-3001}` | — |
| Dockerfile | `src/Frontend/Dockerfile` | `src/Admin/Dockerfile` | — |
| Script npm (chạy ở `src/`) | `npm run build:web` / `npm run test:web` | `npm run build:admin` / `npm run test:admin` | — |

```text
src/
├── Frontend/        ← app shop: App.tsx, components/ (shop, giỏ, checkout, hội viên...), test/
├── Admin/           ← app admin riêng: App.tsx, components/admin/AdminPage.tsx, test/
├── Gateway/         ← Gateway YARP .NET 8 (đợt 14): Program.cs, appsettings.json, Dockerfile
├── Shared/          ← dùng chung: components/auth/AuthModal.tsx (đăng nhập + quên mật khẩu),
│                      utils/api.ts, styles/auth.css, types.ts
├── package.json     ← npm workspaces: ["Frontend", "Admin", "Shared"]
└── node_modules/    ← hoist chung (chạy `npm install` 1 lần ở src/)
```

`src/Shared/components/auth/AuthModal.tsx` là form đăng nhập dùng chung cả
shop lẫn admin (kể cả luồng "Quên mật khẩu" đợt 13); ở admin nó render dạng
trang (`isModal={false}`, `adminOnly`) với khung `.auth-page-wrapper` căn
giữa và **không có nút quay lại**. Trang Hội viên riêng (`/membership`) chỉ
có ở shop. Xem `src/package.json` (scripts `build:web`, `build:admin`,
`test:web`, `test:admin`).

### Backend KHÔNG tách

Chỉ có **1 API chung** phục vụ cả 2 app (cùng container `dafl-backend`, cùng
database PostgreSQL). Tách backend thành 2 service là việc khác, chưa làm.

## Kiểm thử Selenium (repo test riêng)

Bộ test Selenium nằm ở repo đồ án `linh1912/DAFL_DO_AN_TOT_NGHIEP`
(thư mục `automation/`), đã tách thành 2 suite:

- `testng-web.xml` — test web bán hàng (chạy với shop `:3000`).
- `testng-admin.xml` — test admin (chỉ cần app admin `:3001` + tài khoản
  `admin@dafl.vn` đã seed, không mở `:3000`).
- `testng.xml` — chạy cả 2 suite.

Số lượng test từng suite thay đổi theo thời gian — xem `TEST-MAPPING.md`
trong repo test để biết số liệu mới nhất. Chạy tay trên Windows:

```bat
cd automation
run_test_web.bat      :: chi test web (testng-web.xml)
run_test_admin.bat    :: chi test admin (testng-admin.xml)
```

## CI (Jenkins) — 2 stage test nối tiếp

Pipeline tổng trong `Jenkinsfile` (repo này) chạy test chức năng thành 2
stage **nối tiếp** (không song song, vì 2 stage chung 1 workspace Jenkins
— chạy song song sẽ đụng nhau ở `target/surefire-reports`):

1. `Functional Regression - Web` — `mvn clean test -DsuiteXmlFile=testng-web.xml`
2. `Functional Regression - Admin` — `mvn test -DsuiteXmlFile=testng-admin.xml`

Stage Admin **không** `mvn clean` và không xóa `target/` để
`target/surefire-reports` giữ kết quả của cả 2 suite cho stage
`Functional Quality Gate` phía sau kiểm tra. Trước 2 stage này là stage
`Gateway Smoke Test` (đợt 14); sau Quality Gate là JMeter + Performance
Quality Gate rồi mới deploy. Xem mục "CI/CD — phân công 2 repo" ở trên.

## Upload ảnh admin (đợt redesign form admin)

- **Endpoint:** `POST /api/admin/upload` (chỉ admin — SuperAdmin, JWT như mọi
  endpoint `/api/admin/*`), body `multipart/form-data` với field `file`
  (alias `image`). Chỉ nhận ảnh PNG/JPEG/WebP ≤ 5MB (kiểm tra ContentType +
  extension + magic bytes); sai trả 400 kèm message tiếng Việt.
- **Response:** `{ "url": "http://localhost:5000/uploads/<uuid>.<ext>", "path": "/uploads/<uuid>.<ext>" }`
  — `url` là URL **tuyệt đối tới backend :5000** (không phải tương đối), vì ảnh
  hiển thị bằng `<img src={imageUrl}>`: URL tương đối sẽ bị trình duyệt tải từ
  `:3000`/`:3001` mà nginx shop/admin không proxy `/uploads` nên sẽ 404.
  Backend serve thư mục `uploads/` qua `UseStaticFiles` (`/app/uploads` trong
  container, giữ lại bằng volume `uploads_data` trong `docker-compose.yml`).
  Nếu đổi cổng backend (`BACKEND_PORT` khác 5000), đặt biến môi trường cho
  backend `Uploads__PublicBaseUrl=http://localhost:<cổng>` để URL trả về đúng.
- **Sản phẩm:** `POST/PUT /api/admin/products` nhận thêm field tùy chọn
  `imageUrls` (mảng URL, vd URL vừa upload) → lưu vào `ImagesJson`, `imageUrl`
  rỗng thì lấy ảnh đầu tiên làm đại diện; không gửi `imageUrls` thì giữ nguyên
  thư viện cũ. Response admin có thêm `imageUrls` (ảnh đại diện đứng đầu).
- **Danh mục:** `POST /api/admin/categories` nhận thêm `iconUrl` (URL ảnh hoặc
  emoji như seed); `PUT` nhận thêm `slug` + `iconUrl` (null = giữ nguyên,
  `iconUrl: ""` = xóa icon). Response admin có thêm `iconUrl`.
- **Khuyến mãi/voucher: không có field ảnh** ở entity lẫn API nên form khuyến
  mãi không có upload ảnh.

## Giới hạn còn lại

- Backend là 1 service chung, chưa tách.
- Tài khoản admin mặc định được seed bởi backend (`admin@dafl.vn` /
  `Admin@123` khi DB chưa có tài khoản này); đổi mật khẩu admin không nằm
  trong phạm vi đợt này.
- Gateway mới ở đợt 14: chưa biên dịch .NET thật trên VM làm việc (không có
  dotnet/docker) — lần biên dịch thật đầu tiên là
  `docker compose build gateway` trên máy Acer; gateway không có
  rate-limiting / CORS phức tạp, chỉ proxy.
