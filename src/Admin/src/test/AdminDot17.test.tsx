import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminPage from '../components/admin/AdminPage';

/**
 * Đợt 17 — nâng cấp giao diện + nghiệp vụ Admin theo SRS (mẫu VCB).
 * Đợt 18 cập nhật lại theo UI mới: form Drawer/Modal (bỏ trang riêng 2 cột,
 * bỏ nút Quay lại admin-form-back-btn), mọi popup qua ConfirmDialog duy nhất
 * (testid confirm-dialog, đúng 2 nút), khóa KH / tắt KM bắt buộc lý do trong
 * popup, chặn xóa BR-04 cũng qua ConfirmDialog [Hủy] + [Chuyển sang Ngừng
 * hoạt động], toast qua messages.vi (tiêu đề ngắn + mô tả).
 * - STT liên tục theo trang (trang 2 bắt đầu 11), cột Mã SP/DM/KH.
 * - Switch trạng thái + popup xác nhận (Ẩn/Hiển thị, Khóa/Mở khóa, Tắt/Bật KM).
 * - Menu tài khoản + trang Hồ sơ quản trị (FR-ACC) + đổi mật khẩu (FormShell modal).
 * - Form sửa khách hàng (Q1): Mã KH disable, Email chỉ xem.
 * - Validate mẫu VCB §2: trống → "Vui lòng bổ sung thông tin bắt buộc.";
 *   SĐT sai → "Số điện thoại không đúng định dạng."; trùng mã → CẢ toast
 *   CẢ message đỏ inline dưới ô Mã, nguyên văn chuỗi BE trả về.
 *
 * Switch implement: <button role="switch" aria-checked> (xem StatusSwitch trong
 * FormControls.tsx) — selector: getByTestId('admin-<loai>-status-switch-{id}'),
 * trạng thái đọc qua getAttribute('aria-checked') === 'true'/'false'.
 */

const respond = (status: number, body: unknown) =>
  Promise.resolve({ status, json: () => Promise.resolve(body) } as unknown as Response);

const ok = (data: unknown) => ({ success: true, data });
const fail = (message: string) => ({ success: false, message, data: null });

const adminProfile = {
  id: 'admin-1', email: 'admin@dafl.vn', fullName: 'Super Admin', role: 'SuperAdmin',
  createdAt: '2026-01-15T08:00:00Z', lastLoginAt: '2026-11-10T08:00:00Z',
};

function mockFetchAdmin(extra?: (urlStr: string, init?: { method?: string }) => unknown) {
  globalThis.fetch = vi.fn((url: any, init?: any) => {
    const urlStr = typeof url === 'string' ? url : url.url;
    const method = (init?.method ?? 'GET') as string;
    if (urlStr.includes('/api/admin/profile')) {
      if (method === 'PUT') return respond(200, { success: true, message: 'Đã cập nhật thông tin cá nhân.', data: null });
      return respond(200, ok(adminProfile));
    }
    if (urlStr.includes('/api/admin/change-password')) {
      return respond(200, { success: true, message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.', data: null });
    }
    if (urlStr.includes('/api/admin/dashboard')) {
      return respond(200, ok({ revenueToday: 0, revenueThisMonth: 0, pendingOrders: 0, newCustomers30d: 0, ordersByStatus: {}, lowStockProducts: [], expiringVouchers: [] }));
    }
    if (urlStr.includes('/api/admin/reports/revenue')) {
      return respond(200, ok({ byDay: [], topProducts: [], totalOrders: 0, cancelledOrders: 0, cancelRate: 0, voucherOrders: 0, voucherUsageRate: 0 }));
    }
    if (extra) {
      const data = extra(urlStr, init);
      if (data !== undefined) return respond(200, data);
    }
    return respond(200, ok([]));
  });
}

function renderAdmin() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
        {/* Đợt 21 — route KM full page (giữ đồng bộ với App.tsx). */}
        <Route path="/promotions/new" element={<AdminPage />} />
        <Route path="/promotions/:code/usages" element={<AdminPage />} />
        <Route path="/promotions/:code/edit" element={<AdminPage />} />
        <Route path="/promotions/:code" element={<AdminPage />} />
        {/* Đợt 21 — route DM/KH/Trả hàng/Đánh giá full page (giữ đồng bộ với App.tsx). */}
        <Route path="/categories/new" element={<AdminPage />} />
        <Route path="/categories/:code/edit" element={<AdminPage />} />
        <Route path="/categories/:code" element={<AdminPage />} />
        <Route path="/customers/:code/edit" element={<AdminPage />} />
        <Route path="/customers/:code" element={<AdminPage />} />
        <Route path="/returns/:code" element={<AdminPage />} />
        <Route path="/reviews/:id" element={<AdminPage />} />
        {/* Đợt 21 — route SP full page (giữ đồng bộ với App.tsx). */}
        <Route path="/products/new" element={<AdminPage />} />
        <Route path="/products/:code/edit" element={<AdminPage />} />
        <Route path="/products/:code" element={<AdminPage />} />
        <Route path="/login" element={<div data-testid="login-page">Đăng nhập</div>} />
        <Route path="/" element={<div data-testid="home-page">Trang chủ</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const fetchCalls = () => (globalThis.fetch as unknown as { mock: { calls: Array<[unknown, { method?: string; body?: string } | undefined]> } }).mock.calls;
const calledWith = (urlPart: string, method: string) =>
  fetchCalls().some(([url, init]) => String(url).includes(urlPart) && (init?.method ?? 'GET') === method);
const callBody = (urlPart: string, method: string) => {
  const call = fetchCalls().find(([url, init]) => String(url).includes(urlPart) && (init?.method ?? 'GET') === method);
  return call?.[1]?.body ? JSON.parse(String(call[1].body)) : null;
};

const mkProducts = (n: number, isActive = true) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`, code: `SP-00${i + 1}`, categoryId: 'c1', categoryName: 'Son môi',
    name: `Sản phẩm ${String(i + 1).padStart(2, '0')}`,
    price: 100000 + i * 1000, originalPrice: 150000, availableStock: 10, stock: 10,
    isActive, imageUrl: '', rating: 4.5, reviewCount: 3,
  }));
const mkCategories = (n: number, isActive = true) =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`, code: `DM-00${i + 1}`, name: `Danh mục ${String(i + 1).padStart(2, '0')}`,
    slug: `danh-muc-${i + 1}`, description: `Mô tả ${i + 1}`,
    isActive, sortOrder: i + 1, productCount: 0,
  }));
const mkCustomers = () => [
  { id: 'u1', code: 'KH-001', email: 'lan@example.com', fullName: 'Lan Anh', phoneNumber: '0912345678', role: 'Customer', isLocked: false, membershipTier: 'Gold', totalSpent12m: 6000000, orderCount: 3, availablePoints: 250, createdAt: '2026-11-01T10:00:00Z', lastLoginAt: '2026-11-08T10:00:00Z' },
  { id: 'u2', code: 'KH-002', email: 'minh@example.com', fullName: 'Minh Quân', phoneNumber: null, role: 'Customer', isLocked: true, membershipTier: 'Member', totalSpent12m: 0, orderCount: 0, availablePoints: 0, createdAt: '2026-11-02T10:00:00Z', lastLoginAt: null },
];
const mkPromos = () => [
  { id: 'promo-draft', code: 'SALE10', description: 'Giảm 10%', discountType: 'Percentage', discountValue: 10, minOrderAmount: 0, maxDiscountAmount: null, startDate: null, expiryDate: '2026-12-31T00:00:00Z', maxUses: 100, usedCount: 0, maxUsesPerUser: 1, minTier: null, scopeType: 'All', status: 'Draft' },
  { id: 'promo-active', code: 'SALE20', description: 'Giảm 20%', discountType: 'Percentage', discountValue: 20, minOrderAmount: 100000, maxDiscountAmount: null, startDate: null, expiryDate: '2026-12-31T00:00:00Z', maxUses: 100, usedCount: 5, maxUsesPerUser: 1, minTier: null, scopeType: 'All', status: 'Active' },
  { id: 'promo-disabled', code: 'SALE30', description: 'Giảm 30%', discountType: 'Percentage', discountValue: 30, minOrderAmount: 0, maxDiscountAmount: null, startDate: null, expiryDate: '2026-12-31T00:00:00Z', maxUses: 100, usedCount: 2, maxUsesPerUser: 1, minTier: null, scopeType: 'All', status: 'Disabled', disabledReason: 'Hết ngân sách' },
];

const openTab = async (testid: string) => {
  await waitFor(() => {
    expect(screen.getByTestId(testid)).toBeInTheDocument();
  });
  fireEvent.click(screen.getByTestId(testid));
};

describe('AdminPage — đợt 17', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('STT: bảng Sản phẩm 12 dòng → trang 2 bắt đầu từ 11', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/products')) return ok(mkProducts(12));
      if (urlStr.includes('/api/admin/categories')) return ok(mkCategories(1));
      return undefined;
    });
    renderAdmin();
    await openTab('admin-nav-products');
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm 01')).toBeInTheDocument();
    });
    expect(screen.getByText('STT')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('admin-products-pagination-next'));
    await waitFor(() => {
      expect(screen.getByText(/Trang 2 \/ 2/)).toBeInTheDocument();
    });
    const firstCells = Array.from(document.querySelectorAll('tbody tr td:first-child')).map(td => td.textContent);
    expect(firstCells[0]).toBe('11');
    expect(firstCells[1]).toBe('12');
  });

  it('Cột Mã: bảng SP/DM/KH hiện đúng mã (SP-001 / DM-001 / KH-001)', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/products')) return ok(mkProducts(1));
      if (urlStr.includes('/api/admin/categories')) return ok(mkCategories(1));
      if (urlStr.includes('/api/admin/customers')) return ok(mkCustomers());
      return undefined;
    });
    renderAdmin();
    await openTab('admin-nav-products');
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm 01')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-product-code')).toHaveTextContent('SP-001');
    fireEvent.click(screen.getByTestId('admin-nav-categories'));
    await waitFor(() => {
      expect(screen.getByText('Danh mục 01')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-category-code')).toHaveTextContent('DM-001');
    fireEvent.click(screen.getByTestId('admin-nav-customers'));
    await waitFor(() => {
      expect(screen.getByText('Lan Anh')).toBeInTheDocument();
    });
    expect(screen.getAllByTestId('admin-customer-code')[0]).toHaveTextContent('KH-001');
  });

  it('Dropdown Trạng thái SP: chọn Ngừng hoạt động chỉ hiện SP đã ngừng', async () => {
    const products = [...mkProducts(1, true), { ...mkProducts(1, false)[0], id: 'p2', code: 'SP-002', name: 'Sản phẩm 02' }];
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/products')) return ok(products);
      if (urlStr.includes('/api/admin/categories')) return ok(mkCategories(1));
      return undefined;
    });
    renderAdmin();
    await openTab('admin-nav-products');
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm 02')).toBeInTheDocument();
    });
    const filter = screen.getByTestId('admin-status-filter');
    fireEvent.change(filter, { target: { value: 'false' } });
    await waitFor(() => {
      expect(screen.queryByText('Sản phẩm 01')).toBeNull();
    });
    expect(screen.getByText('Sản phẩm 02')).toBeInTheDocument();
    fireEvent.change(filter, { target: { value: 'true' } });
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm 01')).toBeInTheDocument();
    });
    expect(screen.queryByText('Sản phẩm 02')).toBeNull();
  });

  it('Dropdown Trạng thái KH: chọn Đã khoá chỉ hiện khách bị khoá', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/customers')) return ok(mkCustomers());
      return undefined;
    });
    renderAdmin();
    await openTab('admin-nav-customers');
    await waitFor(() => {
      expect(screen.getByText('Lan Anh')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('admin-status-filter'), { target: { value: 'locked' } });
    await waitFor(() => {
      expect(screen.queryByText('Lan Anh')).toBeNull();
    });
    expect(screen.getByText('Minh Quân')).toBeInTheDocument();
  });

  it('Switch SP (đợt 21): Huỷ ở modal CHUNG thì không gọi PUT; Xác nhận thì PUT isActive=false + toast "!"', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/products')) return ok(mkProducts(1, true));
      if (urlStr.includes('/api/admin/categories')) return ok(mkCategories(1));
      return undefined;
    });
    renderAdmin();
    await openTab('admin-nav-products');
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm 01')).toBeInTheDocument();
    });
    const sw = screen.getByTestId('admin-product-status-switch-p1');
    expect(sw).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Xác nhận thay đổi trạng thái?');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('Sản phẩm 01');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Xác nhận');
    expect(screen.getByTestId('confirm-dialog-cancel-btn')).toHaveTextContent('Hủy');
    expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    expect(calledWith('/api/admin/products/p1', 'PUT')).toBe(false);
    expect(screen.getByTestId('admin-product-status-switch-p1')).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByTestId('admin-product-status-switch-p1'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/products/p1', 'PUT')).toBe(true);
    });
    expect(callBody('/api/admin/products/p1', 'PUT').isActive).toBe(false);
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đổi trạng thái sản phẩm thành công!');
    });
  });

  it('Switch DM (đợt 18 + đợt 21): xác nhận đổi trạng thái qua modal CHUNG gọi PUT isActive=false + toast "!"', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/categories')) return ok(mkCategories(1, true));
      return undefined;
    });
    renderAdmin();
    await openTab('admin-nav-categories');
    await waitFor(() => {
      expect(screen.getByText('Danh mục 01')).toBeInTheDocument();
    });
    const sw = screen.getByTestId('admin-category-status-switch-c1');
    expect(sw).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    // Đợt 21: toggle DM dùng modal xác nhận CHUNG (không còn popup C6/C7
    // "Ẩn danh mục?"/"Hiển thị danh mục?"); key C6/C7 giữ lại trong messages.vi.ts.
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Xác nhận thay đổi trạng thái?');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('danh mục');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('Danh mục 01');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Xác nhận');
    expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/categories/c1', 'PUT')).toBe(true);
    });
    expect(callBody('/api/admin/categories/c1', 'PUT').isActive).toBe(false);
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đổi trạng thái danh mục thành công!');
    });
  });

  it('Switch KH (đợt 18): gạt khách đang hoạt động → khóa bắt buộc lý do; để trống thì chặn, nhập lý do thì POST lock', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/customers')) return ok(mkCustomers());
      return undefined;
    });
    renderAdmin();
    await openTab('admin-nav-customers');
    await waitFor(() => {
      expect(screen.getByText('Lan Anh')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-customer-status-switch-u1')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('admin-customer-status-switch-u2')).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByTestId('admin-customer-status-switch-u1'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Khóa tài khoản?');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('Lan Anh');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Khóa tài khoản');
    expect(screen.getByTestId('confirm-dialog-reason-input')).toBeInTheDocument();
    expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(2);
    // Bấm xác nhận khi lý do trống → báo lỗi "Vui lòng nhập lý do khóa.", không gọi API.
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog-reason-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-reason-error')).toHaveTextContent('Vui lòng nhập lý do khóa.');
    expect(calledWith('/api/admin/customers/u1/lock', 'POST')).toBe(false);

    fireEvent.change(screen.getByTestId('confirm-dialog-reason-input'), { target: { value: 'Vi phạm điều khoản' } });
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/customers/u1/lock', 'POST')).toBe(true);
    });
    expect(callBody('/api/admin/customers/u1/lock', 'POST').reason).toBe('Vi phạm điều khoản');
  });

  it('Switch KH (đợt 18): gạt khách đã khóa → mở khóa không cần lý do, POST unlock', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/customers')) return ok(mkCustomers());
      return undefined;
    });
    renderAdmin();
    await openTab('admin-nav-customers');
    await waitFor(() => {
      expect(screen.getByText('Minh Quân')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-customer-status-switch-u2'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Mở khóa tài khoản?');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Mở khóa');
    expect(screen.queryByTestId('confirm-dialog-reason-input')).toBeNull();
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/customers/u2/unlock', 'POST')).toBe(true);
    });
  });

  it('Switch VC (đợt 18, 22:37): Active gạt → modal CHUNG statusChange (không ô lý do) → xác nhận POST disable với lý do hệ thống + toast statusChanged', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/promotions')) return ok(mkPromos());
      return undefined;
    });
    renderAdmin();
    await openTab('admin-nav-promotions');
    await waitFor(() => {
      expect(screen.getByText('SALE20')).toBeInTheDocument();
    });
    // Đợt 21: voucher Nháp cũng có toggle (đang tắt, bấm để kích hoạt qua
    // modal chung); chỉ voucher Hết hạn mới có toggle disable.
    expect(screen.getByTestId('admin-promo-status-switch-promo-draft')).toHaveAttribute('aria-checked', 'false');
    const sw = screen.getByTestId('admin-promo-status-switch-promo-active');
    expect(sw).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Xác nhận thay đổi trạng thái?');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('Bạn có chắc chắn muốn thay đổi trạng thái của khuyến mãi SALE20 không?');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Xác nhận');
    expect(screen.queryByTestId('confirm-dialog-reason-input')).toBeNull();
    expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/promotions/promo-active/disable', 'POST')).toBe(true);
    });
    // BE bắt Reason NotEmpty nên toggle tắt gửi lý do mặc định của hệ thống.
    expect(callBody('/api/admin/promotions/promo-active/disable', 'POST').reason).toBe('Tắt bởi quản trị viên.');
    // Đợt 21 (22:37): toast toggle chung statusChanged (có "!" theo chữ Matthew).
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đổi trạng thái khuyến mãi thành công!');
    });
    expect(screen.getByTestId('admin-toast-desc')).toHaveTextContent('Khuyến mãi SALE20 đã được cập nhật trạng thái.');
  });

  it('Switch VC (đợt 18, 22:37): Disabled gạt → modal CHUNG statusChange → xác nhận → POST activate + toast statusChanged', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/promotions')) return ok(mkPromos());
      return undefined;
    });
    renderAdmin();
    await openTab('admin-nav-promotions');
    await waitFor(() => {
      expect(screen.getByText('SALE30')).toBeInTheDocument();
    });
    const sw = screen.getByTestId('admin-promo-status-switch-promo-disabled');
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Xác nhận thay đổi trạng thái?');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('Bạn có chắc chắn muốn thay đổi trạng thái của khuyến mãi SALE30 không?');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Xác nhận');
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/promotions/promo-disabled/activate', 'POST')).toBe(true);
    });
    // Đợt 21 (22:37): toast toggle chung statusChanged (có "!" theo chữ Matthew).
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đổi trạng thái khuyến mãi thành công!');
    });
    expect(screen.getByTestId('admin-toast-desc')).toHaveTextContent('Khuyến mãi SALE30 đã được cập nhật trạng thái.');
  });

  it('Chặn xoá BR-04 (đợt 18 + đợt 21): xoá SP đang Hoạt động → popup chặn 2 nút; Hủy thì không gọi gì; [Chuyển sang Ngừng hoạt động] → modal CHUNG xác nhận → PUT isActive=false', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/products')) return ok(mkProducts(1, true));
      if (urlStr.includes('/api/admin/categories')) return ok(mkCategories(1));
      return undefined;
    });
    renderAdmin();
    await openTab('admin-nav-products');
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm 01')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Xóa sản phẩm Sản phẩm 01'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Không thể xóa sản phẩm');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('Không thể xóa sản phẩm Sản phẩm 01 đang hoạt động');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Chuyển sang Ngừng hoạt động');
    expect(screen.getByTestId('confirm-dialog-cancel-btn')).toHaveTextContent('Hủy');
    expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    expect(calledWith('/api/admin/products/p1', 'DELETE')).toBe(false);
    expect(calledWith('/api/admin/products/p1', 'PUT')).toBe(false);

    fireEvent.click(screen.getByLabelText('Xóa sản phẩm Sản phẩm 01'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    // Chuyển trạng thái lại hỏi xác nhận qua modal CHUNG (popup thứ 2, cũng đúng 2 nút).
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Xác nhận thay đổi trạng thái?');
    });
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Xác nhận');
    expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/products/p1', 'PUT')).toBe(true);
    });
    expect(callBody('/api/admin/products/p1', 'PUT').isActive).toBe(false);
    expect(calledWith('/api/admin/products/p1', 'DELETE')).toBe(false);
  });

  it('Modal xoá (đợt 18): xoá DM đã Ngừng → "Xóa danh mục?" + dòng đỏ không hoàn tác', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/categories')) return ok(mkCategories(1, false));
      return undefined;
    });
    renderAdmin();
    await openTab('admin-nav-categories');
    await waitFor(() => {
      expect(screen.getByText('Danh mục 01')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Xóa danh mục Danh mục 01'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Xóa danh mục?');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('Bạn sắp xóa danh mục Danh mục 01');
    expect(screen.getByTestId('confirm-dialog')).toHaveTextContent('Hành động này không thể hoàn tác.');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Xóa danh mục');
    expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/categories/c1', 'DELETE')).toBe(true);
    });
  });

  it('Menu tài khoản: mở menu → 2 mục; bấm Thông tin cá nhân → trang Hồ sơ; bấm ra ngoài thì đóng', async () => {
    mockFetchAdmin();
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-user-menu-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-user-menu-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-user-menu')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-user-menu-profile')).toBeInTheDocument();
    expect(screen.getByTestId('admin-user-menu-logout')).toBeInTheDocument();
    // Đợt 21: menu topbar gọn — đúng 2 mục, nhãn "Thông tin cá nhân", không
    // còn khối tiêu đề (tên/email/Vai trò), có divider trước Đăng xuất đỏ nhạt.
    const menu = screen.getByTestId('admin-user-menu');
    expect(screen.getByTestId('admin-user-menu-profile')).toHaveTextContent('Thông tin cá nhân');
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2);
    expect(within(menu).queryByText(/Vai trò:/)).toBeNull();
    expect(menu.querySelector('.sa-topbar-user-menu-sep')).not.toBeNull();
    expect(screen.getByTestId('admin-user-menu-logout')).toHaveClass('sa-topbar-user-menu-logout');
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByTestId('admin-user-menu')).toBeNull();
    });

    fireEvent.click(screen.getByTestId('admin-user-menu-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-user-menu')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-user-menu-profile'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-profile-page')).toBeInTheDocument();
    });
    expect(screen.getByText('Quản trị hệ thống')).toBeInTheDocument();
    expect(screen.getByTestId('admin-profile-joined-at')).toBeInTheDocument();
    expect(screen.getByTestId('admin-profile-last-login-at')).toBeInTheDocument();
    expect(screen.getByTestId('admin-profile-edit-btn')).toBeInTheDocument();
    expect(screen.getByTestId('admin-change-password-btn')).toBeInTheDocument();
  });

  it('Đợt 21: thẻ Thông tin cá nhân 2 hàng × 2 cột ở cả trạng thái xem lẫn form sửa', async () => {
    mockFetchAdmin();
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-user-menu-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-user-menu-btn'));
    fireEvent.click(await screen.findByTestId('admin-user-menu-profile'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-profile-page')).toBeInTheDocument();
    });
    // Trạng thái xem: grid 2 cột (class sa-profile-info-grid), đủ 4 trường.
    const viewGrid = screen.getByTestId('admin-profile-info-grid');
    expect(viewGrid).toHaveClass('sa-profile-info-grid');
    expect(viewGrid.children).toHaveLength(4);
    expect(viewGrid).toHaveTextContent('Họ tên:');
    expect(viewGrid).toHaveTextContent('Email:');
    expect(viewGrid).toHaveTextContent('Số điện thoại:');
    expect(viewGrid).toHaveTextContent('Địa chỉ:');
    // Form sửa: cùng class grid 2 cột, giữ nguyên field + validate + testid.
    fireEvent.click(screen.getByTestId('admin-profile-edit-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-profile-form')).toBeInTheDocument();
    });
    const formGrid = screen.getByTestId('admin-profile-form-grid');
    expect(formGrid).toHaveClass('sa-profile-info-grid');
    expect(formGrid).toHaveClass('sa-form-grid');
    expect(screen.getByTestId('admin-profile-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('admin-profile-email-input')).toBeDisabled();
  });

  it('Menu tài khoản: Đăng xuất hỏi popup G3 [Hủy][Đăng xuất] trước; xác nhận thì xoá token và về /login', async () => {
    localStorage.setItem('dafl_token', 'fake-jwt');
    mockFetchAdmin();
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-user-menu-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-user-menu-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-user-menu-logout')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-user-menu-logout'));
    // G3 (spec A–H): đăng xuất phải hỏi popup trước, chưa xóa token ngay.
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Đăng xuất?');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('Super Admin');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Đăng xuất');
    expect(screen.getByTestId('confirm-dialog-cancel-btn')).toHaveTextContent('Hủy');
    expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(2);
    expect(localStorage.getItem('dafl_token')).toBe('fake-jwt');
    expect(screen.queryByTestId('login-page')).toBeNull();
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
    expect(localStorage.getItem('dafl_token')).toBeNull();
  });

  it('Menu tài khoản: bấm Hủy ở popup Đăng xuất thì ở lại trang, token còn nguyên', async () => {
    localStorage.setItem('dafl_token', 'fake-jwt');
    mockFetchAdmin();
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-user-menu-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-user-menu-btn'));
    fireEvent.click(await screen.findByTestId('admin-user-menu-logout'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    expect(localStorage.getItem('dafl_token')).toBe('fake-jwt');
    expect(screen.queryByTestId('login-page')).toBeNull();
    expect(screen.getByTestId('admin-nav-dashboard')).toBeInTheDocument();
  });

  it('Hồ sơ: Sửa thông tin — tên trống → message bắt buộc; SĐT sai → message định dạng; hợp lệ → PUT /api/admin/profile', async () => {
    mockFetchAdmin();
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-user-menu-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-user-menu-btn'));
    fireEvent.click(await screen.findByTestId('admin-user-menu-profile'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-profile-page')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-profile-edit-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-profile-form')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-profile-email-input')).toBeDisabled();
    fireEvent.change(screen.getByTestId('admin-profile-name-input'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('admin-profile-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-profile-name-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-profile-name-error')).toHaveTextContent('Vui lòng bổ sung thông tin bắt buộc.');
    expect(calledWith('/api/admin/profile', 'PUT')).toBe(false);

    fireEvent.change(screen.getByTestId('admin-profile-name-input'), { target: { value: 'Super Admin' } });
    fireEvent.change(screen.getByTestId('admin-profile-phone-input'), { target: { value: '123' } });
    fireEvent.click(screen.getByTestId('admin-profile-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-profile-phone-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-profile-phone-error')).toHaveTextContent('Số điện thoại không đúng định dạng.');
    fireEvent.change(screen.getByTestId('admin-profile-phone-input'), { target: { value: '0901234567' } });
    fireEvent.click(screen.getByTestId('admin-profile-save-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/profile', 'PUT')).toBe(true);
    });
    expect(callBody('/api/admin/profile', 'PUT').fullName).toBe('Super Admin');
    expect(callBody('/api/admin/profile', 'PUT').phoneNumber).toBe('0901234567');
  });

  it('Hồ sơ: Đổi mật khẩu — mật khẩu yếu → lỗi policy; xác nhận lệch → lỗi khớp; hợp lệ → POST rồi về /login', async () => {
    mockFetchAdmin();
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-user-menu-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-user-menu-btn'));
    fireEvent.click(await screen.findByTestId('admin-user-menu-profile'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-profile-page')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-change-password-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-change-password-form')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('admin-change-password-current-input'), { target: { value: 'Old@1234' } });
    fireEvent.change(screen.getByTestId('admin-change-password-new-input'), { target: { value: 'ngan' } });
    fireEvent.change(screen.getByTestId('admin-change-password-confirm-input'), { target: { value: 'ngan' } });
    fireEvent.click(screen.getByTestId('admin-change-password-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-change-password-new-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-change-password-new-error')).toHaveTextContent('tối thiểu 8 ký tự');
    expect(calledWith('/api/admin/change-password', 'POST')).toBe(false);

    fireEvent.change(screen.getByTestId('admin-change-password-new-input'), { target: { value: 'Newpass1!' } });
    fireEvent.change(screen.getByTestId('admin-change-password-confirm-input'), { target: { value: 'Khacpass1!' } });
    fireEvent.click(screen.getByTestId('admin-change-password-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-change-password-confirm-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-change-password-confirm-error')).toHaveTextContent('không khớp');
    fireEvent.change(screen.getByTestId('admin-change-password-confirm-input'), { target: { value: 'Newpass1!' } });
    fireEvent.click(screen.getByTestId('admin-change-password-save-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/change-password', 'POST')).toBe(true);
    });
    expect(callBody('/api/admin/change-password', 'POST').newPassword).toBe('Newpass1!');
    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
  });

  it('Form sửa khách: Mã KH + Email disable; tên trống → bắt buộc; SĐT sai → định dạng; hợp lệ → PUT', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/customers')) return ok(mkCustomers());
      return undefined;
    });
    renderAdmin();
    await openTab('admin-nav-customers');
    await waitFor(() => {
      expect(screen.getByText('Lan Anh')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Sửa khách hàng Lan Anh'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-customer-edit-page')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-customer-code-input')).toBeDisabled();
    expect(screen.getByTestId('admin-customer-code-input')).toHaveValue('KH-001');
    expect(screen.getByTestId('admin-customer-email-input')).toBeDisabled();
    expect(screen.getByTestId('admin-customer-email-input')).toHaveValue('lan@example.com');
    fireEvent.change(screen.getByTestId('admin-customer-name-input'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('admin-customer-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-customer-name-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-customer-name-error')).toHaveTextContent('Vui lòng bổ sung thông tin bắt buộc.');
    expect(calledWith('/api/admin/customers/u1', 'PUT')).toBe(false);

    fireEvent.change(screen.getByTestId('admin-customer-name-input'), { target: { value: 'Lan Anh Mới' } });
    fireEvent.change(screen.getByTestId('admin-customer-phone-input'), { target: { value: '12345' } });
    fireEvent.click(screen.getByTestId('admin-customer-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-customer-phone-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-customer-phone-error')).toHaveTextContent('Số điện thoại không đúng định dạng.');
    fireEvent.change(screen.getByTestId('admin-customer-phone-input'), { target: { value: '0901234567' } });
    fireEvent.click(screen.getByTestId('admin-customer-save-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/customers/u1', 'PUT')).toBe(true);
    });
    const body = callBody('/api/admin/customers/u1', 'PUT');
    expect(body.fullName).toBe('Lan Anh Mới');
    expect(body.phoneNumber).toBe('0901234567');
    await waitFor(() => {
      expect(screen.queryByTestId('admin-customer-edit-page')).toBeNull();
    });
    expect(screen.getByText('Lan Anh')).toBeInTheDocument();
  });

  it('Trùng mã SP: BE trả "Mã sản phẩm đã tồn tại." → CẢ toast CẢ message đỏ dưới ô Mã', async () => {
    mockFetchAdmin((urlStr, init) => {
      const method = (init?.method ?? 'GET') as string;
      if (urlStr.includes('/api/admin/products') && method === 'POST') return fail('Mã sản phẩm đã tồn tại.');
      if (urlStr.includes('/api/admin/products')) return ok(mkProducts(1));
      if (urlStr.includes('/api/admin/categories')) return ok(mkCategories(1));
      return undefined;
    });
    renderAdmin();
    await openTab('admin-nav-products');
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm 01')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('products-add-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-product-form')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('admin-product-code-input'), { target: { value: 'SP-001' } });
    fireEvent.change(screen.getByTestId('admin-product-name-input'), { target: { value: 'Son kem mới' } });
    fireEvent.click(screen.getByTestId('admin-product-category-select'));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Tìm danh mục...')).toBeInTheDocument();
    });
    fireEvent.click(within(screen.getByTestId('admin-product-form')).getByRole('option', { name: 'Danh mục 01' }));
    fireEvent.change(screen.getByTestId('admin-product-price-input'), { target: { value: '250000' } });
    fireEvent.change(screen.getByTestId('admin-product-stock-input'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('admin-product-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-product-code-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-product-code-error')).toHaveTextContent('Mã sản phẩm đã tồn tại.');
    expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Mã sản phẩm đã tồn tại.');
    // Form vẫn mở, không đóng sau lỗi trùng mã.
    expect(screen.getByTestId('admin-product-form')).toBeInTheDocument();
  });

  it('Trùng mã voucher: BE giữ nguyên "Mã khuyến mãi đã tồn tại (không phân biệt hoa thường)." → CẢ toast CẢ inline', async () => {
    mockFetchAdmin((urlStr, init) => {
      const method = (init?.method ?? 'GET') as string;
      if (urlStr.includes('/api/admin/promotions') && method === 'POST') return fail('Mã khuyến mãi đã tồn tại (không phân biệt hoa thường).');
      if (urlStr.includes('/api/admin/promotions')) return ok(mkPromos());
      return undefined;
    });
    renderAdmin();
    await openTab('admin-nav-promotions');
    await waitFor(() => {
      expect(screen.getByTestId('promotions-add-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('promotions-add-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-promo-form')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('admin-promo-code-input'), { target: { value: 'SALE10' } });
    fireEvent.change(screen.getByTestId('admin-promo-value-input'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('admin-promo-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-promo-code-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-promo-code-error')).toHaveTextContent('Mã khuyến mãi đã tồn tại (không phân biệt hoa thường).');
    // Toast cảnh báo dùng tiêu đề ngắn theo messages.vi (không kèm ngoặc).
    expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Mã khuyến mãi đã tồn tại');
  });

  it('Form SP (đợt 18): mã sai định dạng → lỗi dưới ô Mã; sửa lại mã hợp lệ thì Lưu gọi POST', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/products')) return ok(mkProducts(1));
      if (urlStr.includes('/api/admin/categories')) return ok(mkCategories(1));
      return undefined;
    });
    renderAdmin();
    await openTab('admin-nav-products');
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm 01')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('products-add-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-product-form')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('admin-product-code-input'), { target: { value: 'ab' } });
    fireEvent.change(screen.getByTestId('admin-product-name-input'), { target: { value: 'Son kem' } });
    fireEvent.click(screen.getByTestId('admin-product-category-select'));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Tìm danh mục...')).toBeInTheDocument();
    });
    fireEvent.click(within(screen.getByTestId('admin-product-form')).getByRole('option', { name: 'Danh mục 01' }));
    fireEvent.change(screen.getByTestId('admin-product-price-input'), { target: { value: '100000' } });
    fireEvent.change(screen.getByTestId('admin-product-stock-input'), { target: { value: '1' } });
    fireEvent.click(screen.getByTestId('admin-product-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-product-code-error')).toBeInTheDocument();
    });
    expect(calledWith('/api/admin/products', 'POST')).toBe(false);

    // Sửa: ô Mã disable, các trường khác sửa bình thường.
    fireEvent.change(screen.getByTestId('admin-product-code-input'), { target: { value: 'SP-001' } });
    fireEvent.click(screen.getByTestId('admin-product-save-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/products', 'POST')).toBe(true);
    });
    expect(callBody('/api/admin/products', 'POST').code).toBe('SP-001');
  });

  it('Form SP sửa (đợt 21): ô Mã disable; nút Hủy khi chưa sửa về danh sách, bảng giữ nguyên, không gọi API', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/products')) return ok(mkProducts(1));
      if (urlStr.includes('/api/admin/categories')) return ok(mkCategories(1));
      return undefined;
    });
    renderAdmin();
    await openTab('admin-nav-products');
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm 01')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Sửa sản phẩm Sản phẩm 01'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-product-form')).toBeInTheDocument();
    });
    const codeInput = screen.getByTestId('admin-product-code-input');
    expect(codeInput).toBeDisabled();
    expect(codeInput).toHaveValue('SP-001');
    // Không còn nút Quay lại (admin-form-back-btn đã XÓA đợt 18): đóng bằng Hủy.
    expect(screen.queryByTestId('admin-form-back-btn')).toBeNull();
    expect(screen.getByTestId('admin-product-cancel-btn')).toHaveTextContent('Hủy');
    fireEvent.click(screen.getByTestId('admin-product-cancel-btn'));
    await waitFor(() => {
      // Đợt 21: form là trang full page — Hủy về danh sách, form unmount.
      expect(screen.queryByTestId('admin-product-form')).toBeNull();
    });
    expect(screen.getByText('Sản phẩm 01')).toBeInTheDocument();
    expect(calledWith('/api/admin/products', 'PUT')).toBe(false);
    expect(calledWith('/api/admin/products', 'POST')).toBe(false);
  });
});
