/**
 * AdminDashboard.test.tsx — Vitest cho trang Tổng quan mới (đợt 18).
 * Mock global fetch theo URL (như AdminPage.test.tsx); KHÔNG chạm BE thật.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  AdminDashboard,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
  comparePeriods,
  buildDailySeries,
  bucketizeDaily,
  groupOrdersByStatus,
  validateCustomRange,
  resolveRange,
  previousRange,
  isoDateLocal,
} from '../components/admin/Dashboard';

const isoDay = (d: Date) => d.toISOString().slice(0, 10) + 'T00:00:00Z';
const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const daysAgo = (n: number) => {
  const d = today();
  d.setDate(d.getDate() - n);
  return d;
};

const respond = (status: number, body: unknown) =>
  Promise.resolve({ status, json: () => Promise.resolve(body) } as unknown as Response);

interface FetchLog { url: string }
let fetchLog: FetchLog[] = [];
let revenueMode: 'ok' | 'error' = 'ok';
let emptyMode = false;

function installFetch() {
  fetchLog = [];
  globalThis.fetch = vi.fn((url: any) => {
    const urlStr = typeof url === 'string' ? url : url.url;
    fetchLog.push({ url: urlStr });
    const u = new URL(urlStr, 'http://localhost');
    if (urlStr.includes('/api/admin/dashboard')) {
      return respond(200, {
        success: true,
        data: emptyMode
          ? { revenueToday: 0, revenueThisMonth: 0, pendingOrders: 0, newCustomers30d: 0, ordersByStatus: {}, lowStockProducts: [], expiringVouchers: [] }
          : {
            revenueToday: 1250000,
            revenueThisMonth: 45000000,
            pendingOrders: 3,
            newCustomers30d: 2,
            ordersByStatus: { Pending: 2, Paid: 1, Completed: 5 },
            lowStockProducts: [
              { id: 'p1', name: 'Son kem 3CE', stock: 2 },
              { id: 'p2', name: 'Kem dưỡng La Roche', stock: 0 },
            ],
            expiringVouchers: [{ code: 'SALE10', usedCount: 8, maxUses: 10, expiryDate: '2026-12-31T00:00:00Z' }],
          },
      });
    }
    if (urlStr.includes('/api/admin/reports/revenue')) {
      if (revenueMode === 'error') return respond(500, { success: false, message: 'Lỗi hệ thống.' });
      const from = u.searchParams.get('from') ?? '';
      const isPrev = from <= isoDateLocal(daysAgo(30));
      if (emptyMode) {
        return respond(200, { success: true, data: { byDay: [], topProducts: [], totalOrders: 0, cancelledOrders: 0, cancelRate: 0, voucherOrders: 0, voucherUsageRate: 0 } });
      }
      if (isPrev) {
        return respond(200, {
          success: true,
          data: {
            byDay: [
              { date: isoDay(daysAgo(31)), revenue: 1000000, orders: 4 },
              { date: isoDay(daysAgo(30)), revenue: 1000000, orders: 4 },
            ],
            topProducts: [],
            totalOrders: 8, cancelledOrders: 1, cancelRate: 10, voucherOrders: 2, voucherUsageRate: 25,
          },
        });
      }
      return respond(200, {
        success: true,
        data: {
          byDay: [
            { date: isoDay(daysAgo(1)), revenue: 2000000, orders: 4 },
            { date: isoDay(daysAgo(0)), revenue: 3000000, orders: 6 },
          ],
          topProducts: [
            { productId: 'p1', productName: 'Son kem 3CE', quantity: 12, revenue: 3000000 },
            { productId: 'p2', productName: 'Kem dưỡng La Roche', quantity: 5, revenue: 1500000 },
          ],
          totalOrders: 10, cancelledOrders: 1, cancelRate: 5, voucherOrders: 4, voucherUsageRate: 40,
        },
      });
    }
    if (urlStr.includes('/api/admin/orders')) {
      return respond(200, {
        success: true,
        data: emptyMode ? [] : [
          {
            id: 'o1', orderDisplayCode: 'DH-0001', orderCode: 1, customerName: 'Nguyễn Văn A',
            customerEmail: 'a@example.com', status: 'Pending', statusLabel: 'Chờ xử lý',
            paymentMethod: 'COD', totalAmount: 319000, createdAt: isoDay(daysAgo(0)),
          },
          {
            id: 'o2', orderDisplayCode: 'DH-0002', orderCode: 2, customerName: 'Trần Thị B',
            customerEmail: 'b@example.com', status: 'Completed', statusLabel: 'Hoàn tất',
            paymentMethod: 'PayOS', totalAmount: 550000, createdAt: isoDay(daysAgo(1)),
          },
        ],
      });
    }
    if (urlStr.includes('/api/admin/customers')) {
      return respond(200, {
        success: true,
        data: emptyMode ? [] : [
          { id: 'c1', email: 'a@example.com', fullName: 'Nguyễn Văn A', membershipTier: 'Member', createdAt: isoDay(daysAgo(0)) },
          { id: 'c2', email: 'b@example.com', fullName: 'Trần Thị B', membershipTier: 'Silver', createdAt: isoDay(daysAgo(1)) },
          { id: 'c3', email: 'c@example.com', fullName: 'Lê Văn C', membershipTier: 'Gold', createdAt: isoDay(daysAgo(40)) },
          { id: 'c4', email: 'd@example.com', fullName: 'Phạm Thị D', membershipTier: 'Member', createdAt: isoDay(daysAgo(60)) },
        ],
      });
    }
    if (urlStr.includes('/api/admin/promotions')) {
      const exp = new Date();
      exp.setDate(exp.getDate() + 3);
      return respond(200, {
        success: true,
        data: emptyMode ? [] : [
          { id: 'v1', code: 'SALE10', discountType: 'Percentage', discountValue: 10, expiryDate: exp.toISOString(), maxUses: 10, usedCount: 8, status: 'Active' },
        ],
      });
    }
    if (urlStr.includes('/api/admin/evaluations')) {
      return respond(200, {
        success: true,
        data: emptyMode ? [] : [
          { id: 'r1', createdAt: isoDay(daysAgo(0)) },
          { id: 'r2', createdAt: isoDay(daysAgo(30)) },
        ],
      });
    }
    if (urlStr.includes('/api/admin/returns')) {
      return respond(200, {
        success: true,
        data: emptyMode ? [] : [
          { id: 'ret1', status: 'Pending', createdAt: isoDay(daysAgo(0)) },
          { id: 'ret2', status: 'Approved', createdAt: isoDay(daysAgo(20)) },
        ],
      });
    }
    if (urlStr.includes('/api/admin/products')) {
      return respond(200, {
        success: true,
        data: emptyMode ? [] : [
          { id: 'p1', name: 'Son kem 3CE', imageUrl: 'https://example.com/son.jpg' },
          { id: 'p2', name: 'Kem dưỡng La Roche', imageUrl: 'https://example.com/kem.jpg' },
        ],
      });
    }
    return respond(200, { success: true, data: [] });
  });
}

function renderDashboard(overrides: Partial<Parameters<typeof AdminDashboard>[0]> = {}) {
  const onNavigateTab = vi.fn();
  const onOpenOrder = vi.fn();
  const onOpenProduct = vi.fn();
  const onOpenPromotion = vi.fn();
  render(
    <AdminDashboard
      onNavigateTab={onNavigateTab}
      onOpenOrder={onOpenOrder}
      onOpenProduct={onOpenProduct}
      onOpenPromotion={onOpenPromotion}
      {...overrides}
    />,
  );
  return { onNavigateTab, onOpenOrder, onOpenProduct, onOpenPromotion };
}

describe('format helpers', () => {
  it('formatMoney: 319.000₫', () => {
    expect(formatMoney(319000)).toBe('319.000₫');
    expect(formatMoney(0)).toBe('0₫');
  });

  it('formatMoneyCompact: rút gọn từ 1 triệu, giữ đủ số dưới 1 triệu', () => {
    expect(formatMoneyCompact(12400000)).toBe('12,4 triệu ₫');
    expect(formatMoneyCompact(1200000000)).toBe('1,2 tỷ ₫');
    expect(formatMoneyCompact(500000)).toBe('500.000₫');
  });

  it('formatPercent: 1 thập phân, phẩy VN', () => {
    expect(formatPercent(12.5)).toBe('12,5%');
  });
});

describe('comparePeriods', () => {
  it('tăng tốt / giảm xấu theo chiều thường', () => {
    expect(comparePeriods(150, 100)).toEqual({ text: '↑ 50,0% so với kỳ trước', tone: 'good' });
    expect(comparePeriods(50, 100)).toEqual({ text: '↓ 50,0% so với kỳ trước', tone: 'bad' });
  });

  it('tỷ lệ hủy/trả đảo chiều: tăng xấu, giảm tốt', () => {
    expect(comparePeriods(10, 5, true)).toEqual({ text: '↑ 100,0% so với kỳ trước', tone: 'bad' });
    expect(comparePeriods(5, 10, true)).toEqual({ text: '↓ 50,0% so với kỳ trước', tone: 'good' });
  });

  it('kỳ trước 0 → Mới; không có dữ liệu kỳ trước → —; bằng nhau → Không đổi', () => {
    expect(comparePeriods(5, 0)).toEqual({ text: 'Mới so với kỳ trước', tone: 'good' });
    expect(comparePeriods(0, 0)).toEqual({ text: '—', tone: 'neutral' });
    expect(comparePeriods(5, null)).toEqual({ text: '—', tone: 'neutral' });
    expect(comparePeriods(100, 100)).toEqual({ text: 'Không đổi so với kỳ trước', tone: 'neutral' });
  });
});

describe('chart series helpers', () => {
  it('buildDailySeries lấp đủ ngày, ngày không đơn = 0', () => {
    const from = new Date(2026, 10, 1);
    const to = new Date(2026, 10, 3);
    const s = buildDailySeries([{ date: '2026-11-02T00:00:00Z', revenue: 1000, orders: 2 }], from, to);
    expect(s).toHaveLength(3);
    expect(s[0]).toMatchObject({ revenue: 0, orders: 0 });
    expect(s[1]).toMatchObject({ revenue: 1000, orders: 2 });
    expect(s[2]).toMatchObject({ revenue: 0, orders: 0 });
  });

  it('bucketizeDaily gom tuần / tháng', () => {
    const daily = Array.from({ length: 10 }, (_, i) => ({
      key: `2026-11-${String(i + 1).padStart(2, '0')}`, label: `${i + 1}/11`, revenue: 100, orders: 1,
    }));
    const weeks = bucketizeDaily(daily, 'week');
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({ revenue: 700, orders: 7 });
    expect(weeks[1]).toMatchObject({ revenue: 300, orders: 3 });
    const months = bucketizeDaily(daily, 'month');
    expect(months).toHaveLength(1);
    expect(months[0]).toMatchObject({ revenue: 1000, orders: 10, label: '11/2026' });
  });

  it('groupOrdersByStatus gom đúng 5 nhóm, trạng thái lạ bị bỏ qua', () => {
    const g = groupOrdersByStatus([
      { status: 'Pending' }, { status: 'Paid' }, { status: 'Shipping' },
      { status: 'Completed' }, { status: 'Cancelled' }, { status: 'ReturnRequested' },
      { status: 'WeirdStatus' },
    ]);
    expect(g.find(x => x.key === 'pending')?.count).toBe(2);
    expect(g.find(x => x.key === 'processing')?.count).toBe(1);
    expect(g.find(x => x.key === 'completed')?.count).toBe(1);
    expect(g.find(x => x.key === 'cancelled')?.count).toBe(1);
    expect(g.find(x => x.key === 'returns')?.count).toBe(1);
    expect(g.reduce((s, x) => s + x.count, 0)).toBe(6);
  });
});

describe('range helpers', () => {
  it('resolveRange 30d mặc định = 30 ngày tính đến hôm nay', () => {
    const r = resolveRange('30d');
    expect(r.to.toDateString()).toBe(today().toDateString());
    expect(r.from.toDateString()).toBe(daysAgo(29).toDateString());
  });

  it('previousRange: kỳ trước cùng độ dài, kết thúc ngay trước kỳ hiện tại', () => {
    const r = resolveRange('7d');
    const p = previousRange(r);
    expect(p.to.toDateString()).toBe(daysAgo(7).toDateString());
    expect(p.from.toDateString()).toBe(daysAgo(13).toDateString());
  });

  it('validateCustomRange: tương lai / ngược / quá 365 ngày đều sai', () => {
    expect(validateCustomRange('2026-11-10', '2026-11-01')).toBe('Khoảng thời gian không hợp lệ.');
    expect(validateCustomRange('2026-11-01', '2099-01-01')).toBe('Khoảng thời gian không hợp lệ.');
    expect(validateCustomRange('2025-01-01', '2026-11-10')).toBe('Khoảng thời gian không hợp lệ.');
    expect(validateCustomRange('2026-11-01', '2026-11-10')).toBeNull();
  });
});

describe('AdminDashboard', () => {
  beforeEach(() => {
    revenueMode = 'ok';
    emptyMode = false;
    window.sessionStorage.clear();
    installFetch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('KPI tính đúng + so sánh kỳ trước đúng chiều', async () => {
    renderDashboard();
    // Doanh thu kỳ này 5.000.000 (2M + 3M) vs kỳ trước 2.000.000 → ↑ 150,0% tốt
    const revenue = await screen.findByTestId('admin-dashboard-kpi-revenue');
    expect(within(revenue).getByText('5 triệu ₫')).toBeTruthy();
    expect(within(revenue).getByText('↑ 150,0% so với kỳ trước')).toBeTruthy();
    // Đơn hàng 10 vs 8 → ↑ 25,0%; dòng phụ "3 chờ xác nhận"
    const orders = await screen.findByTestId('admin-dashboard-kpi-orders');
    expect(within(orders).getByText('10')).toBeTruthy();
    expect(within(orders).getByText('↑ 25,0% so với kỳ trước')).toBeTruthy();
    expect(within(orders).getByText('3 chờ xác nhận')).toBeTruthy();
    // AOV 500.000 vs 250.000 → ↑ 100,0%
    const aov = await screen.findByTestId('admin-dashboard-kpi-aov');
    expect(within(aov).getByText('500.000₫')).toBeTruthy();
    expect(within(aov).getByText('↑ 100,0% so với kỳ trước')).toBeTruthy();
    // Khách mới 2 vs 1 → ↑ 100,0%; tổng 4 khách
    const customers = await screen.findByTestId('admin-dashboard-kpi-customers');
    expect(within(customers).getByText('2')).toBeTruthy();
    expect(within(customers).getByText('Tổng 4 khách hàng')).toBeTruthy();
    // Tỷ lệ hủy 5% vs 10% → giảm = TỐT (đảo chiều), dòng phụ có số đơn hủy + trả hàng
    const cancel = await screen.findByTestId('admin-dashboard-kpi-cancel-rate');
    expect(within(cancel).getByText('5,0%')).toBeTruthy();
    const cmp = within(cancel).getByText('↓ 50,0% so với kỳ trước');
    expect(cmp.className).toContain('db-compare--good');
    expect(within(cancel).getByText(/1 đơn đã hủy · 2 yêu cầu trả hàng trong kỳ/)).toBeTruthy();
  });

  it('bấm thẻ KPI / dòng donut / dòng đơn / SP bán chạy thì điều hướng đúng', async () => {
    const { onNavigateTab, onOpenOrder, onOpenProduct } = renderDashboard();
    await screen.findByTestId('admin-dashboard-kpi-revenue');
    fireEvent.click(screen.getByTestId('admin-dashboard-kpi-revenue'));
    expect(onNavigateTab).toHaveBeenCalledWith('orders', expect.objectContaining({ from: expect.any(String), to: expect.any(String) }));
    // Donut: bấm dòng "Hoàn thành" → tab orders lọc Completed
    const doneBtn = await screen.findByTestId('admin-dashboard-donut-completed');
    fireEvent.click(doneBtn);
    expect(onNavigateTab).toHaveBeenCalledWith('orders', expect.objectContaining({ status: 'Completed' }));
    // Đơn gần đây: bấm dòng → onOpenOrder với đúng đơn
    const row = await screen.findByTestId('admin-dashboard-order-o1');
    fireEvent.click(row);
    expect(onOpenOrder).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1', orderDisplayCode: 'DH-0001' }));
    // Bán chạy: bấm SP đầu → onOpenProduct
    const top = await screen.findByTestId('admin-dashboard-top-product-p1');
    fireEvent.click(top);
    expect(onOpenProduct).toHaveBeenCalledWith({ id: 'p1', name: 'Son kem 3CE' });
  });

  it('Cần xử lý ngay: đếm đúng từng dòng, tất cả 0 thì hiện câu tất cả ổn', async () => {
    renderDashboard();
    const block = await screen.findByTestId('admin-dashboard-action-needed');
    expect(within(block).getByTestId('admin-dashboard-action-pending-orders-count')).toHaveTextContent('3');
    expect(within(block).getByTestId('admin-dashboard-action-pending-returns-count')).toHaveTextContent('1');
    expect(within(block).getByTestId('admin-dashboard-action-new-reviews-count')).toHaveTextContent('1');
    expect(within(block).getByTestId('admin-dashboard-action-low-stock-count')).toHaveTextContent('2');
    expect(within(block).getByTestId('admin-dashboard-action-out-of-stock-count')).toHaveTextContent('1');
    expect(within(block).getByTestId('admin-dashboard-action-expiring-promos-count')).toHaveTextContent('1');
    expect(within(block).getByText('Số liệu hiện tại')).toBeTruthy();
  });

  it('bộ lọc đổi số liệu: chọn 7 ngày thì gọi revenue/orders với khoảng 7 ngày', async () => {
    renderDashboard();
    await screen.findByTestId('admin-dashboard-kpi-revenue');
    fetchLog = [];
    fireEvent.click(screen.getByTestId('admin-dashboard-range-7d'));
    await waitFor(() => {
      const rev = fetchLog.find(l => l.url.includes('/api/admin/reports/revenue'));
      expect(rev).toBeTruthy();
      expect(rev!.url).toContain(`from=${isoDateLocal(daysAgo(6))}`);
      expect(rev!.url).toContain(`to=${isoDateLocal(daysAgo(0))}`);
    });
    const ordersCall = fetchLog.find(l => l.url.includes('/api/admin/orders'));
    expect(ordersCall).toBeTruthy();
    expect(decodeURIComponent(ordersCall!.url)).toContain('pageSize=100');
  });

  it('Tùy chọn sai thì báo inline đúng chuỗi spec', async () => {
    renderDashboard();
    await screen.findByTestId('admin-dashboard-kpi-revenue');
    fireEvent.click(screen.getByTestId('admin-dashboard-range-custom'));
    const from = screen.getByTestId('admin-dashboard-custom-from');
    const to = screen.getByTestId('admin-dashboard-custom-to');
    fireEvent.change(from, { target: { value: '2026-11-10' } });
    fireEvent.change(to, { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByTestId('admin-dashboard-custom-apply'));
    expect(await screen.findByTestId('admin-dashboard-custom-error')).toHaveTextContent('Khoảng thời gian không hợp lệ.');
  });

  it('revenue lỗi (BUG_DAFL_003): chỉ khối doanh thu lỗi + Thử lại, khối khác vẫn chạy', async () => {
    revenueMode = 'error';
    renderDashboard();
    // Khối doanh thu + KPI doanh thu lỗi
    expect(await screen.findByTestId('admin-dashboard-revenue-error')).toHaveTextContent('Không tải được dữ liệu.');
    expect(await screen.findByTestId('admin-dashboard-kpi-revenue-error')).toBeTruthy();
    expect(screen.getByTestId('admin-dashboard-revenue-bug-note')).toBeTruthy();
    // KPI Đơn hàng dự phòng theo danh sách (2 đơn) — không lỗi theo
    const orders = await screen.findByTestId('admin-dashboard-kpi-orders');
    expect(within(orders).getByText('2')).toBeTruthy();
    // Đơn gần đây + Cần xử lý vẫn có dữ liệu
    expect(await screen.findByTestId('admin-dashboard-order-o1')).toBeTruthy();
    expect(await screen.findByTestId('admin-dashboard-action-needed')).toBeTruthy();
    // Bấm Thử lại ở khối doanh thu → gọi lại revenue
    const before = fetchLog.filter(l => l.url.includes('/api/admin/reports/revenue')).length;
    fireEvent.click(within(screen.getByTestId('admin-dashboard-revenue-error')).getByText('Thử lại'));
    await waitFor(() => {
      expect(fetchLog.filter(l => l.url.includes('/api/admin/reports/revenue')).length).toBeGreaterThan(before);
    });
  });

  it('không có dữ liệu: khối rỗng hiện EmptyState, Cần xử lý hiện câu tất cả ổn', async () => {
    emptyMode = true;
    renderDashboard();
    expect(await screen.findByTestId('admin-dashboard-revenue-empty')).toHaveTextContent('Chưa có dữ liệu trong khoảng thời gian này');
    expect(await screen.findByTestId('admin-dashboard-recent-orders-empty')).toBeTruthy();
    expect(await screen.findByTestId('admin-dashboard-top-products-empty')).toBeTruthy();
    expect(await screen.findByTestId('admin-dashboard-donut-empty')).toBeTruthy();
    const block = await screen.findByTestId('admin-dashboard-action-needed');
    expect(within(block).getByText('Không có việc cần xử lý. Mọi thứ đang ổn.')).toBeTruthy();
  });

  it('Xem dạng bảng hiện bảng doanh thu theo ngày (kỳ này + kỳ trước)', async () => {
    renderDashboard();
    await screen.findByTestId('admin-dashboard-kpi-revenue');
    fireEvent.click(screen.getByTestId('admin-dashboard-chart-table-btn'));
    const table = await screen.findByTestId('admin-dashboard-chart-table');
    // 30 ngày → 30 dòng; ngày có đơn hiện đủ tiền
    expect(within(table).getAllByRole('row')).toHaveLength(31);
    expect(within(table).getByText('3.000.000₫')).toBeTruthy();
    expect(within(table).getByText('2.000.000₫')).toBeTruthy();
  });

  it('phân bổ hạng + KM đang chạy hiển thị đúng', async () => {
    renderDashboard();
    await screen.findByTestId('admin-dashboard-kpi-revenue');
    const tier = screen.getByTestId('admin-dashboard-tier-Member');
    expect(tier).toHaveTextContent('Thường');
    expect(tier).toHaveTextContent('2');
    const promo = await screen.findByTestId('admin-dashboard-promo-v1');
    expect(promo).toHaveTextContent('SALE10');
    expect(promo).toHaveTextContent('Giảm 10%');
    expect(promo).toHaveTextContent('Sắp hết hạn');
    expect(promo).toHaveTextContent('Đã dùng 8/10');
  });
});

// ============================================================================
// Bản vá 18.1 — dashboard FULL MÀN HÌNH (Matthew 10/11, ghi đè prompt cũ
// giới hạn 1440px căn giữa: dashboard.css đổi .sa-dashboard từ
// "max-width: 1440px; margin: 0 auto;" thành "max-width: none; margin: 0;").
// GIỚI HẠN jsdom: jsdom không áp stylesheet vào layout nên không đo được
// computed max-width/margin hay chiều rộng thật của khối KPI/biểu đồ/bảng;
// các test dưới đây khẳng định (a) rule CSS mới tồn tại trong dashboard.css,
// (b) không còn khai báo 1440px nào, (c) component render đúng class
// .sa-dashboard mang rule đó và không bị inline style giới hạn bề rộng.
// Kiểm tra bằng mắt ở màn rộng vẫn cần làm trên Acer sau khi rebuild.
// ============================================================================
describe('AdminDashboard — full màn hình (bản vá 18.1)', () => {
  beforeEach(() => {
    revenueMode = 'ok';
    emptyMode = false;
    window.sessionStorage.clear();
    installFetch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Doc CSS tu source (import.meta.url trong Vitest khong phai scheme file:
  // nen resolve tu process.cwd() voi fallback ca 2 cach chay: tu thu muc
  // workspace Admin (npm run test:admin) hoac tu thu muc src/ goc).
  const dashboardCss = () => {
    const candidates = [
      path.resolve(process.cwd(), 'src/components/admin/dashboard.css'),
      path.resolve(process.cwd(), 'src/Admin/src/components/admin/dashboard.css'),
    ];
    const found = candidates.find((p) => existsSync(p));
    if (!found) throw new Error(`Không tìm thấy dashboard.css (cwd=${process.cwd()})`);
    return readFileSync(found, 'utf-8');
  };

  it('dashboard.css: .sa-dashboard không giới hạn bề rộng (max-width: none; margin: 0)', () => {
    const css = dashboardCss();
    const rule = css.match(/\.sa-dashboard\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain('max-width: none');
    expect(rule![1]).toContain('margin: 0');
  });

  it('dashboard.css: không còn khai báo max-width 1440px nào (chỉ còn nhắc 1440px trong comment giải thích)', () => {
    const css = dashboardCss();
    expect(css).not.toMatch(/max-width:\s*1440px/);
  });

  it('component: container dashboard mang class .sa-dashboard, không bị inline style giới hạn bề rộng; KPI/biểu đồ/bảng đều render trong container đó', async () => {
    renderDashboard();
    const root = await screen.findByTestId('admin-dashboard');
    expect(root.className).toContain('sa-dashboard');
    // Không có inline max-width/margin nào thu hẹp container.
    expect((root as HTMLElement).style.maxWidth).toBe('');
    expect((root as HTMLElement).style.margin).toBe('');
    // Các khối chính đều nằm trong container full-width (giãn theo container).
    expect(within(root).getByTestId('admin-dashboard-kpi-revenue')).toBeInTheDocument();
    expect(within(root).getByTestId('admin-dashboard-kpi-orders')).toBeInTheDocument();
    expect(within(root).getByTestId('admin-dashboard-action-needed')).toBeInTheDocument();
  });
});
