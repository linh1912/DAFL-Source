import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminPage from '../components/admin/AdminPage';
import { paymentStatusOf } from '../components/admin/OrderDetailPage';

/**
 * Đợt 21 — Trang CHI TIẾT ĐƠN HÀNG riêng /orders/:code (bỏ Drawer).
 * Render qua AdminPage + MemoryRouter với đúng route như App.tsx
 * (/admin và /orders/:code), mock fetch như AdminDot18.test.tsx.
 */

const respond = (status: number, body: unknown) =>
  Promise.resolve({ status, json: () => Promise.resolve(body) } as unknown as Response);

const ok = (data: unknown) => ({ success: true, data });

const adminProfile = { id: 'admin-1', email: 'admin@dafl.vn', fullName: 'Super Admin', role: 'SuperAdmin' };

interface DetailMocks {
  pendingOrders?: number;
  orders?: Array<Record<string, unknown>>;
  orderDetail?: Record<string, unknown>;
}

function mockFetchDetail(m: DetailMocks = {}) {
  globalThis.fetch = vi.fn((url: any, init?: any) => {
    const urlStr = typeof url === 'string' ? url : url.url;
    const method = (init?.method ?? 'GET') as string;
    if (urlStr.includes('/api/admin/profile')) return respond(200, ok(adminProfile));
    if (urlStr.includes('/api/admin/dashboard')) {
      return respond(200, ok({
        revenueToday: 0, revenueThisMonth: 0, pendingOrders: m.pendingOrders ?? 0,
        newCustomers30d: 0, ordersByStatus: {}, lowStockProducts: [], expiringVouchers: [],
      }));
    }
    if (urlStr.includes('/api/admin/reports/revenue')) {
      return respond(200, ok({ byDay: [], topProducts: [], totalOrders: 0, cancelledOrders: 0, cancelRate: 0, voucherOrders: 0, voucherUsageRate: 0 }));
    }
    if (urlStr.includes('/api/admin/returns')) return respond(200, ok([]));
    if (urlStr.includes('/api/admin/evaluations')) return respond(200, ok([]));
    if (urlStr.includes('/api/admin/orders/') && urlStr.includes('/cancel')) return respond(200, ok(null));
    if (urlStr.includes('/api/admin/orders/') && urlStr.includes('/status')) return respond(200, ok(null));
    if (urlStr.includes('/api/admin/orders/')) return respond(200, ok(m.orderDetail ?? { order: null }));
    if (urlStr.includes('/api/admin/orders')) return respond(200, ok(m.orders ?? []));
    return respond(200, ok([]));
  });
}

const fetchCalls = () => (globalThis.fetch as unknown as { mock: { calls: Array<[unknown, { method?: string; body?: string } | undefined]> } }).mock.calls;
const calledWith = (urlPart: string, method: string) =>
  fetchCalls().some(([url, init]) => String(url).includes(urlPart) && (init?.method ?? 'GET') === method);

function renderAt(entries: Array<string | { pathname: string; state?: unknown }>) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/orders/:code" element={<AdminPage />} />
        <Route path="/login" element={<div data-testid="login-page">Đăng nhập</div>} />
        <Route path="/" element={<div data-testid="home-page">Trang chủ</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const orderDetailFor = (status: string, overrides: Record<string, unknown> = {}) => ({
  order: {
    id: 'o1', orderCode: 1001, orderDisplayCode: 'DH-1001', customerName: 'Khách 01',
    customerEmail: 'khach1@example.com', customerPhone: '0900000001', subTotal: 500000,
    shippingFee: 30000, totalAmount: 530000, discountAmount: 0, status,
    createdAt: '2026-11-08T10:00:00Z', paymentMethod: 'COD',
    shipDetailAddress: '123 Nguyễn Trãi', shipWardName: 'Phường 5', shipDistrictName: 'Quận 5',
    shipProvinceName: 'TP. Hồ Chí Minh',
    items: [
      { id: 'i1', productId: 'p1', productName: 'Son kem 3CE', productImageUrl: 'https://img.example/son.jpg', unitPrice: 250000, quantity: 2 },
    ],
    // BE trả tăng dần theo thời gian — trang phải đảo ngược (mới nhất trước).
    statusHistories: [
      { status: 'Pending', note: null, timestamp: '2026-11-08T10:00:00Z' },
      { status: 'Confirmed', note: 'Khách yêu cầu giao nhanh', timestamp: '2026-11-08T11:00:00Z' },
    ],
    ...overrides,
  },
  internalNote: 'Khách VIP, giao giờ hành chính.',
});

const mkOrders = () => ([
  {
    id: 'o1', orderDisplayCode: 'DH-1001', orderCode: 1001, customerName: 'Khách 01',
    customerEmail: 'khach1@example.com', status: 'Pending', paymentMethod: 'COD',
    totalAmount: 530000, createdAt: '2026-11-08T10:00:00Z',
  },
]);

const openDetailWithState = async (status = 'Pending', overrides: Record<string, unknown> = {}) => {
  mockFetchDetail({ orders: mkOrders(), orderDetail: orderDetailFor(status, overrides) });
  renderAt([{ pathname: '/orders/DH-1001', state: { orderId: 'o1' } }]);
  await waitFor(() => {
    expect(screen.getByTestId('admin-order-detail-title')).toBeInTheDocument();
  });
};

describe('OrderDetailPage — route /orders/:code (đợt 21)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('route với state.orderId: hiện tiêu đề + pill + dòng đặt lúc, mục Đơn hàng active, không hiện bảng đơn', async () => {
    await openDetailWithState('Pending');
    const title = screen.getByTestId('admin-order-detail-title');
    expect(title).toHaveTextContent('Đơn DH-1001');
    expect(screen.getByTestId('admin-order-detail-status')).toHaveTextContent('Chờ xử lý');
    // "Đặt lúc HH:mm ngày dd/mm/yyyy · COD · 1 sản phẩm" (giờ UTC trong jsdom).
    expect(screen.getByTestId('admin-order-detail')).toHaveTextContent('Đặt lúc');
    expect(screen.getByTestId('admin-order-detail')).toHaveTextContent('COD');
    expect(screen.getByTestId('admin-order-detail')).toHaveTextContent('1 sản phẩm');
    expect(screen.getByTestId('admin-nav-orders')).toHaveClass('sa-active');
    expect(screen.getByTestId('admin-nav-dashboard')).not.toHaveClass('sa-active');
    expect(screen.queryByTestId('orders-search-input')).toBeNull();
    // Breadcrumb về danh sách đơn — đợt 25/26: mục đầu là <span> chữ thường
    // (không còn là nút bấm); testid giữ nguyên tên breadcrumb mới.
    expect(screen.getByTestId('admin-order-detail-breadcrumb')).toHaveTextContent('Đơn hàng');
    expect(screen.getByTestId('admin-order-detail-back-btn')).toHaveTextContent('Quay lại');
  });

  it('không có state (vào thẳng URL / refresh): resolve qua GET /api/admin/orders?search={code}&pageSize=100 rồi GET detail', async () => {
    mockFetchDetail({ orders: mkOrders(), orderDetail: orderDetailFor('Pending') });
    renderAt(['/orders/DH-1001']);
    await waitFor(() => {
      expect(screen.getByTestId('admin-order-detail-title')).toHaveTextContent('Đơn DH-1001');
    });
    expect(fetchCalls().some(([u]) => String(u).includes('/api/admin/orders?search=DH-1001&pageSize=100'))).toBe(true);
    expect(calledWith('/api/admin/orders/o1', 'GET')).toBe(true);
  });

  it('không tìm thấy mã: hiện lỗi + nút về danh sách; bấm nút thì về tab Đơn hàng', async () => {
    mockFetchDetail({ orders: [], orderDetail: orderDetailFor('Pending') });
    renderAt(['/orders/DH-9999']);
    await waitFor(() => {
      expect(screen.getByTestId('admin-order-detail-error')).toHaveTextContent('Không tìm thấy đơn DH-9999.');
    });
    fireEvent.click(screen.getByTestId('admin-order-detail-back-to-list'));
    await waitFor(() => {
      expect(screen.getByTestId('orders-search-input')).toBeInTheDocument();
    });
  });

  it('nút "← Quay lại" về danh sách đơn (tab Đơn hàng) — breadcrumb chỉ là chữ (đợt 25/26)', async () => {
    await openDetailWithState('Pending');
    expect(screen.getByTestId('admin-order-detail-breadcrumb')).toHaveTextContent('Đơn hàng');
    fireEvent.click(screen.getByTestId('admin-order-detail-back-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('orders-search-input')).toBeInTheDocument();
    });
  });

  it('grid nội dung: Sản phẩm + 3 dòng tiền, Lịch sử mới nhất trước, Khách hàng, Địa chỉ, Thanh toán', async () => {
    await openDetailWithState('Confirmed', { voucherCode: 'SALE10', discountAmount: 50000, pointsUsed: 100, pointsDiscount: 10000, pointsEarned: 53, carrier: 'GHN', trackingCode: 'GHN123456' });
    const products = screen.getByTestId('admin-order-detail-products');
    expect(products).toHaveTextContent('Son kem 3CE');
    expect(products).toHaveTextContent('2 × 250.000₫');
    expect(products).toHaveTextContent('500.000₫');
    expect(products).toHaveTextContent('Tạm tính');
    expect(products).toHaveTextContent('Phí vận chuyển');
    expect(products).toHaveTextContent('Tổng cộng');
    expect(products).toHaveTextContent('530.000₫');
    expect(products).toHaveTextContent('Voucher: SALE10 (giảm 50.000₫)');
    expect(products).toHaveTextContent('Điểm đã dùng: 100 (giảm 10.000₫) — Điểm nhận: 53');
    expect(products).toHaveTextContent('Ghi chú nội bộ: Khách VIP, giao giờ hành chính.');

    // Lịch sử: mới nhất (Đã xác nhận 11:00) đứng trước Chờ xử lý (10:00).
    const history = screen.getByTestId('admin-order-detail-history');
    expect(history).toHaveTextContent('Lịch sử trạng thái');
    const confirmedAt = history.textContent!.indexOf('Đã xác nhận');
    const pendingAt = history.textContent!.indexOf('Chờ xử lý');
    expect(confirmedAt).toBeGreaterThan(-1);
    expect(pendingAt).toBeGreaterThan(-1);
    expect(confirmedAt).toBeLessThan(pendingAt);
    expect(history).toHaveTextContent('Khách yêu cầu giao nhanh');
    // Thời gian "HH:mm:ss · dd/mm/yyyy" — chỉ assert định dạng + ngày (giờ
    // phụ thuộc timezone máy chạy test).
    expect(history.textContent).toMatch(/\d{2}:\d{2}:\d{2} · 08\/11\/2026/);

    const customer = screen.getByTestId('admin-order-detail-customer');
    expect(customer).toHaveTextContent('Khách 01');
    expect(customer).toHaveTextContent('khach1@example.com');
    expect(customer).toHaveTextContent('0900000001');

    const address = screen.getByTestId('admin-order-detail-address');
    expect(address).toHaveTextContent('123 Nguyễn Trãi, Phường 5, Quận 5, TP. Hồ Chí Minh');

    const payment = screen.getByTestId('admin-order-detail-payment');
    expect(payment).toHaveTextContent('COD');
    expect(payment).toHaveTextContent('Thu khi giao hàng');
    expect(payment).toHaveTextContent('530.000₫');
    expect(payment).toHaveTextContent('Vận chuyển: GHN — Mã vận đơn: GHN123456');
  });

  it('lịch sử trống thì hiện "Chưa có lịch sử trạng thái."', async () => {
    mockFetchDetail({ orders: mkOrders(), orderDetail: orderDetailFor('Pending', { statusHistories: [] }) });
    renderAt([{ pathname: '/orders/DH-1001', state: { orderId: 'o1' } }]);
    await waitFor(() => {
      expect(screen.getByTestId('admin-order-detail-history')).toHaveTextContent('Chưa có lịch sử trạng thái.');
    });
  });

  it('paymentStatusOf (suy ra, không phải field BE): PayOS/COD theo đúng quy tắc', () => {
    expect(paymentStatusOf({ paymentMethod: 'PayOS', status: 'Pending' })).toBe('Chờ thanh toán');
    expect(paymentStatusOf({ paymentMethod: 'PayOS', status: 'Confirmed' })).toBe('Đã thanh toán');
    expect(paymentStatusOf({ paymentMethod: 'PayOS', status: 'Cancelled' })).toBe('Chưa thanh toán');
    expect(paymentStatusOf({ paymentMethod: 'PayOS', status: 'Expired' })).toBe('Chưa thanh toán');
    expect(paymentStatusOf({ paymentMethod: 'COD', status: 'Pending' })).toBe('Thu khi giao hàng');
    expect(paymentStatusOf({ paymentMethod: 'COD', status: 'Confirmed' })).toBe('Thu khi giao hàng');
    expect(paymentStatusOf({ paymentMethod: 'COD', status: 'Delivered' })).toBe('Đã thanh toán');
    expect(paymentStatusOf({ paymentMethod: 'COD', status: 'Completed' })).toBe('Đã thanh toán');
    expect(paymentStatusOf({ paymentMethod: 'COD', status: 'Cancelled' })).toBe('Chưa thanh toán');
  });

  it('disable rules: đơn Pending thì cả 2 nút đều bấm được', async () => {
    await openDetailWithState('Pending');
    expect(screen.getByTestId('admin-order-cancel-btn')).toBeEnabled();
    expect(screen.getByTestId('admin-order-change-status-btn')).toBeEnabled();
  });

  it('disable rules: đơn Paid thì Hủy disable (prompt đợt 21 thu hẹp), Đổi vẫn bấm được', async () => {
    mockFetchDetail({ orders: mkOrders(), orderDetail: orderDetailFor('Paid') });
    renderAt([{ pathname: '/orders/DH-1001', state: { orderId: 'o1' } }]);
    await waitFor(() => {
      expect(screen.getByTestId('admin-order-detail-title')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-order-cancel-btn')).toBeDisabled();
    expect(screen.getByTestId('admin-order-cancel-btn')).toHaveAttribute('title', expect.stringContaining('không thể hủy'));
    expect(screen.getByTestId('admin-order-change-status-btn')).toBeEnabled();
  });

  it('disable rules: đơn Completed/Cancelled thì cả 2 nút đều disable', async () => {
    mockFetchDetail({ orders: mkOrders(), orderDetail: orderDetailFor('Completed') });
    renderAt([{ pathname: '/orders/DH-1001', state: { orderId: 'o1' } }]);
    await waitFor(() => {
      expect(screen.getByTestId('admin-order-detail-title')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-order-cancel-btn')).toBeDisabled();
    expect(screen.getByTestId('admin-order-change-status-btn')).toBeDisabled();
    expect(screen.getByTestId('admin-order-change-status-btn')).toHaveAttribute('title', expect.stringContaining('không đổi được nữa'));
  });
});

describe('OrderDetailPage — panel đổi trạng thái (đợt 21, không popup D2/D3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('mở panel: select chỉ có đích ALLOWED_NEXT (không có Cancelled); [Đóng] đóng panel; ESC đóng panel', async () => {
    await openDetailWithState('Pending');
    expect(screen.queryByTestId('admin-order-status-panel')).toBeNull();
    fireEvent.click(screen.getByTestId('admin-order-change-status-btn'));
    const panel = screen.getByTestId('admin-order-status-panel');
    expect(panel).toBeInTheDocument();
    const options = within(screen.getByTestId('admin-order-status-select')).getAllByRole('option').map(o => o.textContent);
    expect(options).toEqual(['— Chọn trạng thái đích —', 'Đã thanh toán', 'Đã xác nhận', 'Đã hết hạn']);
    // Nút [Xác nhận đổi] disable đến khi chọn trạng thái.
    expect(screen.getByTestId('admin-order-status-confirm-btn')).toBeDisabled();

    fireEvent.click(screen.getByTestId('admin-order-status-close-btn'));
    expect(screen.queryByTestId('admin-order-status-panel')).toBeNull();

    fireEvent.click(screen.getByTestId('admin-order-change-status-btn'));
    expect(screen.getByTestId('admin-order-status-panel')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('admin-order-status-panel')).toBeNull();
  });

  it('xác nhận đổi: gọi POST trực tiếp, KHÔNG mở ConfirmDialog, hiện toast', async () => {
    await openDetailWithState('Pending');
    fireEvent.click(screen.getByTestId('admin-order-change-status-btn'));
    fireEvent.change(screen.getByTestId('admin-order-status-select'), { target: { value: 'Confirmed' } });
    expect(screen.getByTestId('admin-order-status-confirm-btn')).toBeEnabled();
    fireEvent.click(screen.getByTestId('admin-order-status-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/orders/o1/status', 'POST')).toBe(true);
    });
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đã cập nhật đơn hàng');
    });
    expect(screen.queryByTestId('admin-order-status-panel')).toBeNull();
    const [, init] = fetchCalls().find(([u, i]) => String(u).includes('/api/admin/orders/o1/status') && (i?.method ?? 'GET') === 'POST')!;
    expect(JSON.parse(init!.body!)).toEqual({ toStatus: 'Confirmed' });
  });

  it('đích Shipping: bắt buộc carrier + tracking 6–30 ký tự, giữ nguyên message lỗi cũ, không gọi POST khi sai', async () => {
    await openDetailWithState('Confirmed');
    fireEvent.click(screen.getByTestId('admin-order-change-status-btn'));
    fireEvent.change(screen.getByTestId('admin-order-status-select'), { target: { value: 'Shipping' } });
    expect(screen.getByTestId('admin-order-carrier-input')).toBeInTheDocument();
    expect(screen.getByTestId('admin-order-tracking-input')).toBeInTheDocument();

    // Trống carrier + tracking.
    fireEvent.click(screen.getByTestId('admin-order-status-confirm-btn'));
    expect(screen.getByTestId('admin-order-status-error')).toHaveTextContent(
      'Chuyển sang Đang giao bắt buộc có đơn vị vận chuyển và mã vận đơn 6–30 ký tự.');
    expect(calledWith('/api/admin/orders/o1/status', 'POST')).toBe(false);

    // Tracking 5 ký tự.
    fireEvent.change(screen.getByTestId('admin-order-carrier-input'), { target: { value: 'GHN' } });
    fireEvent.change(screen.getByTestId('admin-order-tracking-input'), { target: { value: 'GHN12' } });
    fireEvent.click(screen.getByTestId('admin-order-status-confirm-btn'));
    expect(screen.getByTestId('admin-order-status-error')).toHaveTextContent(
      'Chuyển sang Đang giao bắt buộc có đơn vị vận chuyển và mã vận đơn 6–30 ký tự.');
    expect(calledWith('/api/admin/orders/o1/status', 'POST')).toBe(false);

    // Hợp lệ → POST kèm carrier/tracking/note.
    fireEvent.change(screen.getByTestId('admin-order-tracking-input'), { target: { value: 'GHN123456' } });
    fireEvent.change(screen.getByTestId('admin-order-status-note-input'), { target: { value: 'Giao nhanh' } });
    fireEvent.click(screen.getByTestId('admin-order-status-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/orders/o1/status', 'POST')).toBe(true);
    });
    const [, init] = fetchCalls().find(([u, i]) => String(u).includes('/api/admin/orders/o1/status') && (i?.method ?? 'GET') === 'POST')!;
    expect(JSON.parse(init!.body!)).toEqual({ toStatus: 'Shipping', carrier: 'GHN', trackingCode: 'GHN123456', note: 'Giao nhanh' });
  });

  it('đổi đích khác thì 2 ô vận chuyển biến mất', async () => {
    await openDetailWithState('Confirmed');
    fireEvent.click(screen.getByTestId('admin-order-change-status-btn'));
    fireEvent.change(screen.getByTestId('admin-order-status-select'), { target: { value: 'Shipping' } });
    expect(screen.getByTestId('admin-order-carrier-input')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('admin-order-status-select'), { target: { value: 'Preparing' } });
    expect(screen.queryByTestId('admin-order-carrier-input')).toBeNull();
    expect(screen.queryByTestId('admin-order-tracking-input')).toBeNull();
  });
});

describe('OrderDetailPage — panel hủy đơn (đợt 21, không popup D1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('lý do bắt buộc: trống thì báo đúng message D1 cũ, không gọi POST; [Giữ đơn] đóng panel không gọi API; ESC đóng panel', async () => {
    await openDetailWithState('Pending');
    fireEvent.click(screen.getByTestId('admin-order-cancel-btn'));
    const panel = screen.getByTestId('admin-order-cancel-panel');
    expect(panel).toBeInTheDocument();
    expect(screen.getByTestId('admin-order-cancel-reason-input')).toBeInTheDocument();
    expect(screen.getByTestId('admin-order-cancel-keep-btn')).toHaveTextContent('Giữ đơn');
    expect(screen.getByTestId('admin-order-cancel-confirm-btn')).toHaveTextContent('Xác nhận hủy đơn');

    fireEvent.click(screen.getByTestId('admin-order-cancel-confirm-btn'));
    expect(screen.getByTestId('admin-order-cancel-error')).toHaveTextContent('Vui lòng nhập lý do hủy đơn.');
    expect(calledWith('/api/admin/orders/o1/cancel', 'POST')).toBe(false);
    expect(screen.getByTestId('admin-order-cancel-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('admin-order-cancel-keep-btn'));
    expect(screen.queryByTestId('admin-order-cancel-panel')).toBeNull();
    expect(calledWith('/api/admin/orders/o1/cancel', 'POST')).toBe(false);

    fireEvent.click(screen.getByTestId('admin-order-cancel-btn'));
    expect(screen.getByTestId('admin-order-cancel-panel')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('admin-order-cancel-panel')).toBeNull();
  });

  it('xác nhận hủy: gọi POST /cancel trực tiếp, KHÔNG mở ConfirmDialog, hiện toast', async () => {
    await openDetailWithState('Pending');
    fireEvent.click(screen.getByTestId('admin-order-cancel-btn'));
    fireEvent.change(screen.getByTestId('admin-order-cancel-reason-input'), { target: { value: 'Khách đổi ý' } });
    fireEvent.click(screen.getByTestId('admin-order-cancel-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/orders/o1/cancel', 'POST')).toBe(true);
    });
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đã hủy đơn hàng');
    });
    expect(screen.queryByTestId('admin-order-cancel-panel')).toBeNull();
    const [, init] = fetchCalls().find(([u, i]) => String(u).includes('/api/admin/orders/o1/cancel') && (i?.method ?? 'GET') === 'POST')!;
    expect(JSON.parse(init!.body!)).toEqual({ reason: 'Khách đổi ý' });
  });
});
