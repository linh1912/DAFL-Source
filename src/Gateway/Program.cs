// DAFL Gateway — YARP reverse proxy (.NET 8, đợt 14).
//
// Vai trò duy nhất: nhận request ở cổng 8080 và chuyển tiếp (proxy) về
// backend / shop theo cấu hình "ReverseProxy" trong appsettings.json.
// Gateway KHÔNG chứa logic nghiệp vụ, KHÔNG chạm database, KHÔNG xác thực
// (JWT vẫn do backend kiểm tra như trước).
//
// QUYẾT ĐỊNH CÓ CHỦ Ý — admin KHÔNG đi qua gateway: trang quản trị giữ
// cổng riêng trực tiếp :3001 (service dafl-admin), không có route /admin
// trong appsettings.json. Lý do: admin là entry riêng, tách khỏi lưu lượng
// shop công khai vì lý do bảo mật; test Selenium admin cũng chạy thẳng
// :3001, không đổi (xem README.md gốc + src/Gateway/README.md).
//
// Endpoint riêng (KHÔNG proxy, đăng ký TRƯỚC MapReverseProxy để route
// catch-all "/" của shop không nuốt mất):
//   GET /gateway/health — trả "Healthy" (healthcheck Docker + Jenkins).
//   GET /gateway        — trang trạng thái HTML tĩnh do chính Gateway serve
//                         (xem GatewayStatusHtml bên dưới): thẻ trạng thái
//                         từng service + bảng routes + nút kiểm tra.
//                         Trang tự fetch /gateway/health và /health qua
//                         gateway để tô trạng thái THẬT — không hard-code
//                         "đang chạy" giả. Admin/Postgres/Kafka không có
//                         HTTP endpoint để fetch nên hiển thị chấm xám +
//                         hướng dẫn kiểm tra thủ công, không tô xanh giả.

var builder = WebApplication.CreateBuilder(args);

// Nạp cấu hình Routes + Clusters từ appsettings.json (mục "ReverseProxy").
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

var app = builder.Build();

// Healthcheck riêng của gateway (không proxy về backend).
app.MapGet("/gateway/health", () => Results.Text("Healthy"));

// Trang trạng thái Gateway (HTML tĩnh, serve trực tiếp — không proxy).
app.MapGet("/gateway", () => Results.Content(GatewayStatusHtml, "text/html; charset=utf-8"));
app.MapGet("/gateway/", () => Results.Content(GatewayStatusHtml, "text/html; charset=utf-8"));

// Mọi request còn lại: YARP proxy theo Routes trong appsettings.json.
app.MapReverseProxy();

app.Run();

// Trang trạng thái: vàng #FFD900 + hồng #D81B60, font Be Vietnam Pro /
// Plus Jakarta Sans, bo góc 12–16px, responsive mobile (đúng brief của
// Matthew). Raw string KHÔNG nội suy ($) nên ${...} trong JS giữ nguyên.
const string GatewayStatusHtml = """
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DAFL Gateway — Trạng thái hệ thống</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;700&family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Be Vietnam Pro', 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif; background: #FFFBEA; color: #1A1A1A; }
  header { background: #FFD900; padding: 28px 20px 24px; text-align: center; border-bottom: 4px solid #D81B60; }
  header h1 { margin: 0; font-family: 'Plus Jakarta Sans', 'Be Vietnam Pro', sans-serif; font-size: 28px; font-weight: 800; }
  header h1 span { color: #D81B60; }
  header p { margin: 8px 0 0; font-size: 14px; opacity: .85; }
  main { max-width: 960px; margin: 0 auto; padding: 24px 16px 40px; }
  h2 { font-family: 'Plus Jakarta Sans', 'Be Vietnam Pro', sans-serif; font-size: 18px; margin: 28px 0 12px; }
  h2:first-child { margin-top: 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
  .card { background: #FFFFFF; border: 1px solid #F0E6B8; border-radius: 16px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
  .card-head { display: flex; align-items: center; gap: 8px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; background: #9CA3AF; flex-shrink: 0; }
  .dot.up { background: #16A34A; }
  .dot.down { background: #DC2626; }
  .dot.checking { background: #F59E0B; animation: pulse 1s infinite; }
  @keyframes pulse { 50% { opacity: .4; } }
  .card h3 { margin: 0; font-size: 16px; }
  .port { margin-left: auto; font-size: 13px; font-weight: 700; color: #D81B60; }
  .card p { margin: 10px 0 4px; font-size: 13px; color: #555; }
  .status-text { font-size: 13px; font-weight: 700; }
  .status-text.up { color: #16A34A; }
  .status-text.down { color: #DC2626; }
  .card-actions { margin-top: 12px; display: flex; gap: 8px; }
  .btn { display: inline-block; background: #D81B60; color: #FFFFFF; border: none; border-radius: 12px; padding: 8px 14px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; text-decoration: none; text-align: center; }
  .btn:hover { opacity: .9; }
  .btn-outline { background: #FFFFFF; color: #D81B60; border: 2px solid #D81B60; }
  .btn-check-all { font-size: 14px; padding: 10px 18px; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; background: #FFFFFF; border: 1px solid #F0E6B8; border-radius: 16px; overflow: hidden; font-size: 14px; }
  th, td { padding: 10px 12px; text-align: left; }
  th { background: #FFD900; }
  tr + tr td { border-top: 1px solid #F0E6B8; }
  td code, .card code { background: #FFF3C4; border-radius: 6px; padding: 1px 6px; font-size: 13px; }
  .note { background: #FFFFFF; border: 1px solid #F0E6B8; border-left: 4px solid #D81B60; border-radius: 12px; padding: 12px 16px; font-size: 13px; color: #555; }
  .table-wrap { overflow-x: auto; border-radius: 16px; }
  footer { text-align: center; font-size: 12px; color: #888; padding-bottom: 24px; }
  @media (max-width: 640px) {
    header h1 { font-size: 22px; }
    main { padding: 16px 12px 32px; }
    table { font-size: 13px; }
  }
</style>
</head>
<body>
<header>
  <h1>DAFL <span>Gateway</span></h1>
  <p>YARP reverse proxy &middot; .NET 8 &middot; Cổng 8080 &middot; Đợt 14</p>
</header>
<main>
  <h2>Trạng thái các service</h2>
  <div class="grid">
    <div class="card" id="card-gateway">
      <div class="card-head"><span class="dot" id="dot-gateway"></span><h3>Gateway</h3><span class="port">:8080</span></div>
      <p>Route: <code>/gateway/health</code> (tự trả)</p>
      <div class="status-text" id="status-gateway">Chưa kiểm tra</div>
      <div class="card-actions"><button class="btn" onclick="checkGateway()">Kiểm tra</button></div>
    </div>
    <div class="card" id="card-shop">
      <div class="card-head"><span class="dot" id="dot-shop"></span><h3>Shop</h3><span class="port">:3000</span></div>
      <p>Route: <code>/</code> &rarr; frontend:80</p>
      <div class="status-text" id="status-shop">Chưa kiểm tra</div>
      <div class="card-actions"><button class="btn" onclick="checkShop()">Kiểm tra</button></div>
    </div>
    <div class="card" id="card-backend">
      <div class="card-head"><span class="dot" id="dot-backend"></span><h3>Backend API</h3><span class="port">:5000</span></div>
      <p>Route: <code>/api</code>, <code>/health</code> &rarr; backend:8080</p>
      <div class="status-text" id="status-backend">Chưa kiểm tra</div>
      <div class="card-actions"><button class="btn" onclick="checkBackend()">Kiểm tra</button></div>
    </div>
    <div class="card" id="card-admin">
      <div class="card-head"><span class="dot"></span><h3>Admin</h3><span class="port">:3001</span></div>
      <p>Không qua gateway (entry riêng) &mdash; đi thẳng <code>:3001</code>.</p>
      <div class="status-text">Mở link để kiểm tra</div>
      <div class="card-actions"><a class="btn btn-outline" href="http://localhost:3001" target="_blank" rel="noopener">Mở :3001</a></div>
    </div>
    <div class="card" id="card-postgres">
      <div class="card-head"><span class="dot"></span><h3>Postgres</h3><span class="port">:5432</span></div>
      <p>Cơ sở dữ liệu &mdash; không có HTTP endpoint.</p>
      <div class="status-text">Kiểm tra bằng <code>docker compose ps</code></div>
    </div>
    <div class="card" id="card-kafka">
      <div class="card-head"><span class="dot"></span><h3>Kafka</h3><span class="port">:9092</span></div>
      <p>Hàng đợi sự kiện &mdash; không có HTTP endpoint.</p>
      <div class="status-text">Kiểm tra bằng <code>docker compose ps</code></div>
    </div>
  </div>
  <div style="margin-top:16px"><button class="btn btn-check-all" onclick="checkAll()">Kiểm tra tất cả</button></div>

  <h2>Bảng routes qua gateway</h2>
  <div class="table-wrap">
  <table>
    <tr><th>Path</th><th>Đích (mạng Docker)</th><th>Ghi chú</th></tr>
    <tr><td><code>/api/{**catch-all}</code></td><td>backend:8080</td><td>Mọi API</td></tr>
    <tr><td><code>/uploads/{**catch-all}</code></td><td>backend:8080</td><td>Ảnh admin upload</td></tr>
    <tr><td><code>/health</code></td><td>backend:8080</td><td>Healthcheck backend</td></tr>
    <tr><td><code>/swagger/{**catch-all}</code></td><td>backend:8080</td><td>Swagger UI</td></tr>
    <tr><td><code>/gateway/health</code></td><td>gateway (tự trả)</td><td>Không proxy</td></tr>
    <tr><td><code>/gateway</code></td><td>gateway (tự trả)</td><td>Trang này &mdash; không proxy</td></tr>
    <tr><td><code>/{**catch-all}</code></td><td>frontend:80</td><td>Shop &mdash; route cuối, ưu tiên thấp nhất</td></tr>
  </table>
  </div>
  <p class="note" style="margin-top:16px">Admin <b>không</b> có route qua gateway: trang quản trị giữ cổng riêng trực tiếp <code>:3001</code> (entry riêng vì lý do bảo mật), test Selenium admin vẫn chạy thẳng <code>:3001</code>, không đổi.</p>
</main>
<footer>DAFL Gateway &middot; YARP 2.2.0 &middot; Xem chi tiết trong <code>src/Gateway/README.md</code></footer>
<script>
  function setStatus(id, state, text) {
    var dot = document.getElementById('dot-' + id);
    var el = document.getElementById('status-' + id);
    dot.className = 'dot' + (state ? ' ' + state : '');
    el.textContent = text;
    el.className = 'status-text' + (state === 'up' ? ' up' : state === 'down' ? ' down' : '');
  }
  async function checkUrl(id, url, options) {
    setStatus(id, 'checking', 'Đang kiểm tra…');
    try {
      var res = await fetch(url, options);
      if (res.ok) { setStatus(id, 'up', 'Đang chạy'); return true; }
      setStatus(id, 'down', 'Lỗi HTTP ' + res.status); return false;
    } catch (e) {
      setStatus(id, 'down', 'Không kết nối được'); return false;
    }
  }
  function checkGateway() { return checkUrl('gateway', '/gateway/health'); }
  function checkBackend() { return checkUrl('backend', '/health'); }
  async function checkShop() {
    // HEAD cho nhẹ (chỉ cần biết shop trả 200); nếu server không hỗ trợ HEAD thì thử lại bằng GET.
    var ok = await checkUrl('shop', '/', { method: 'HEAD' });
    if (!ok) { await checkUrl('shop', '/', { method: 'GET' }); }
  }
  function checkAll() { checkGateway(); checkBackend(); checkShop(); }
  document.addEventListener('DOMContentLoaded', checkAll);
</script>
</body>
</html>
""";
