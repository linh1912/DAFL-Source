import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminPage from '../components/admin/AdminPage';

const respond = (status: number, body: unknown) =>
  Promise.resolve({ status, json: () => Promise.resolve(body) } as unknown as Response);

function mockFetchFor(profile: { status: number; body: unknown }) {
  globalThis.fetch = vi.fn((url: any) => {
    const urlStr = typeof url === 'string' ? url : url.url;
    if (urlStr.includes('/api/admin/profile')) return respond(profile.status, profile.body);
    if (urlStr.includes('/api/admin/reports/revenue')) {
      const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
      const iso = (d: Date) => d.toISOString().slice(0, 10) + 'T00:00:00Z';
      return respond(200, {
        success: true,
        data: {
          byDay: [
            { date: iso(yesterday), revenue: 2000000, orders: 4 },
            { date: iso(today), revenue: 3500000, orders: 6 },
          ],
          topProducts: [{ productId: 'p1', productName: 'Son kem 3CE', quantity: 12, revenue: 3000000 }],
          totalOrders: 10, cancelledOrders: 1, cancelRate: 10,
          voucherOrders: 4, voucherUsageRate: 40,
        },
      });
    }
    if (urlStr.includes('/api/admin/dashboard')) {
      return respond(200, {
        success: true,
        data: {
          revenueToday: 1250000,
          revenueThisMonth: 45000000,
          pendingOrders: 3,
          newCustomers30d: 12,
          ordersByStatus: { Pending: 2, Paid: 1 },
          lowStockProducts: [{ id: 'p1', name: 'Son 3CE', stock: 2 }],
          expiringVouchers: [{ code: 'SALE10', usedCount: 8, maxUses: 10, expiryDate: '2026-12-31T00:00:00Z' }],
        },
      });
    }
    return respond(200, { success: true, data: [] });
  });
}

function renderAdmin() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/orders/:code" element={<AdminPage />} />
        {/* Đợt 21 — route KM full page (giữ đồng bộ với App.tsx). */}
        <Route path="/promotions/new" element={<AdminPage />} />
        <Route path="/promotions/:code/usages" element={<AdminPage />} />
        <Route path="/promotions/:code/edit" element={<AdminPage />} />
        <Route path="/promotions/:code" element={<AdminPage />} />
        {/* Đợt 21 — route SP full page (giữ đồng bộ với App.tsx). */}
        <Route path="/products/new" element={<AdminPage />} />
        <Route path="/products/:code/edit" element={<AdminPage />} />
        <Route path="/products/:code" element={<AdminPage />} />
        {/* Đợt 21 — route DM/KH/Trả hàng/Đánh giá full page (giữ đồng bộ với App.tsx). */}
        <Route path="/categories/new" element={<AdminPage />} />
        <Route path="/categories/:code/edit" element={<AdminPage />} />
        <Route path="/categories/:code" element={<AdminPage />} />
        <Route path="/customers/:code/edit" element={<AdminPage />} />
        <Route path="/customers/:code" element={<AdminPage />} />
        <Route path="/returns/:code" element={<AdminPage />} />
        <Route path="/reviews/:id" element={<AdminPage />} />
        <Route path="/login" element={<div data-testid="login-page">Đăng nhập</div>} />
        <Route path="/" element={<div data-testid="home-page">Trang chủ</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('smoke (đợt 18, đợt 21 bỏ badge đơn): menu 10 mục đúng thứ tự nhóm mới + dashboard riêng, KHÔNG còn badge menu Đơn hàng', async () => {
    mockFetchFor({
      status: 200,
      body: {
        success: true,
        data: { id: 'admin-1', email: 'admin@dafl.vn', fullName: 'Super Admin', role: 'SuperAdmin' },
      },
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-dashboard')).toBeInTheDocument();
    });
    // Thứ tự mục menu trong DOM theo nhóm mới: Tổng quan → BÁN HÀNG
    // (Đơn, Trả, KM) → SẢN PHẨM (SP, DM, Đánh giá) → QUẢN TRỊ (KH, Hội viên)
    // → HỆ THỐNG (Nhật ký).
    const navIds = Array.from(document.querySelectorAll('.sa-nav [data-testid]'))
      .map(el => el.getAttribute('data-testid')!)
      .filter(id => id.startsWith('admin-nav-') && !id.includes('group') && !id.endsWith('-badge'));
    expect(navIds).toEqual([
      'admin-nav-dashboard', 'admin-nav-orders', 'admin-nav-returns', 'admin-nav-promotions',
      'admin-nav-products', 'admin-nav-categories', 'admin-nav-reviews',
      'admin-nav-customers', 'admin-nav-membership', 'admin-nav-logs',
    ]);
    // Đợt 21 (22:18): menu DROPDOWN — tiêu đề nhóm là <button> có chevron
    // phải (svg), aria-expanded; mặc định ở tab Tổng quan (không thuộc nhóm
    // nào) thì mọi nhóm ĐÓNG; nhóm "Quản lý khách hàng" đổi tên → "Quản trị".
    for (const [testid, label] of [
      ['admin-nav-group-sales', 'Bán hàng'],
      ['admin-nav-group-products', 'Quản lý sản phẩm'],
      ['admin-nav-group-customers', 'Quản trị'],
      ['admin-nav-group-system', 'Hệ thống'],
    ] as const) {
      const group = screen.getByTestId(testid);
      expect(group.tagName).toBe('BUTTON');
      expect(group).toHaveTextContent(label);
      expect(group).toHaveAttribute('aria-expanded', 'false');
      expect(group.querySelector('svg')).not.toBeNull();
      expect(group.querySelector('button')).toBeNull();
    }
    // Bấm tiêu đề nhóm Bán hàng → mở (aria-expanded=true, ghi localStorage);
    // bấm lại → đóng.
    const salesGroup = screen.getByTestId('admin-nav-group-sales');
    fireEvent.click(salesGroup);
    expect(salesGroup).toHaveAttribute('aria-expanded', 'true');
    expect(salesGroup.closest('.sa-nav-group')).toHaveClass('sa-open');
    expect(JSON.parse(localStorage.getItem('dafl_admin_nav_groups') ?? '{}')).toMatchObject({ sales: true });
    fireEvent.click(salesGroup);
    expect(salesGroup).toHaveAttribute('aria-expanded', 'false');
    expect(salesGroup.closest('.sa-nav-group')).not.toHaveClass('sa-open');
    // Không có icon/svg trước tên các mục con (quy tắc đợt 18/20 vẫn giữ).
    for (const id of ['admin-nav-orders', 'admin-nav-products', 'admin-nav-customers']) {
      expect(screen.getByTestId(id).querySelector('svg')).toBeNull();
    }
    // Đợt 21: BỎ badge số bên cạnh menu "Đơn hàng" — dù dashboard trả
    // pendingOrders: 3 thì menu Đơn hàng cũng không còn badge.
    await waitFor(() => {
      expect(screen.getByTestId('admin-dashboard')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('admin-nav-orders-badge')).toBeNull();
    // Dashboard nay là component riêng (AdminDashboard), không còn 4 thẻ số cũ.
    expect(screen.getByTestId('admin-dashboard')).toBeInTheDocument();
    expect(screen.getAllByText('Doanh thu').length).toBeGreaterThan(0);
    expect(screen.getByText('Cần xử lý ngay')).toBeInTheDocument();
    expect(screen.getByText('Đơn chờ xác nhận')).toBeInTheDocument();
  });

  it('403: tài khoản thường thấy trang không có quyền', async () => {
    mockFetchFor({
      status: 403,
      body: { success: false, message: 'Bạn không có quyền truy cập khu vực quản trị.' },
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-forbidden')).toBeInTheDocument();
    });
    expect(screen.getByText('Bạn không có quyền truy cập trang quản trị')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-nav-dashboard')).not.toBeInTheDocument();
  });

  it('403 đợt 4: trang cấm có hướng dẫn cấp quyền từng bước + nút đổi tài khoản', async () => {
    mockFetchFor({
      status: 403,
      body: { success: false, message: 'Bạn không có quyền truy cập khu vực quản trị.' },
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-forbidden')).toBeInTheDocument();
    });
    expect(screen.getByText('Cách cấp quyền Super Admin')).toBeInTheDocument();
    expect(screen.getByText(/UPDATE "Users"/)).toBeInTheDocument();
    expect(screen.getByText('Về trang chủ')).toBeInTheDocument();
    expect(screen.getByText('Đăng nhập tài khoản khác')).toBeInTheDocument();
  });

  // (XÓA đợt 18) Test dashboard cũ "biểu đồ cột + nút chọn 7/30 ngày" đã bỏ:
  // dashboard nay là component riêng AdminDashboard, phủ bởi
  // AdminDashboard.test.tsx (21 test) + smoke test menu/dashboard ở trên.

  it('401: chưa đăng nhập thì chuyển về /login', async () => {
    mockFetchFor({
      status: 401,
      body: { success: false, message: 'Bạn cần đăng nhập để truy cập khu vực quản trị.' },
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
  });

  it('Sản phẩm (đợt 21): bấm mắt mở TRANG CHI TIẾT full page /products/:code (không Drawer) + [Chỉnh sửa] sang trang sửa giữ dữ liệu', async () => {
    const products = [{
      id: 'p1', code: 'SP-001', categoryId: 'c1', categoryName: 'Son môi', name: 'Son kem 3CE',
      price: 250000, originalPrice: 300000, availableStock: 5, imageUrl: 'https://example.com/son.jpg',
      rating: 4.5, reviewCount: 12, isActive: true,
    }];
    globalThis.fetch = vi.fn((url: any) => {
      const urlStr = typeof url === 'string' ? url : url.url;
      if (urlStr.includes('/api/admin/profile')) {
        return respond(200, {
          success: true,
          data: { id: 'admin-1', email: 'admin@dafl.vn', fullName: 'Super Admin', role: 'SuperAdmin' },
        });
      }
      if (urlStr.includes('/api/admin/dashboard')) {
        return respond(200, {
          success: true,
          data: { revenueToday: 0, revenueThisMonth: 0, pendingOrders: 0, newCustomers30d: 0, ordersByStatus: {}, lowStockProducts: [], expiringVouchers: [] },
        });
      }
      if (urlStr.includes('/api/admin/reports/revenue')) {
        return respond(200, {
          success: true,
          data: { byDay: [], topProducts: [], totalOrders: 0, cancelledOrders: 0, cancelRate: 0, voucherOrders: 0, voucherUsageRate: 0 },
        });
      }
      if (urlStr.includes('/api/products') || urlStr.includes('/api/admin/products')) {
        return respond(200, { success: true, data: products });
      }
      if (urlStr.includes('/api/admin/categories')) {
        return respond(200, {
          success: true,
          data: [{ id: 'c1', name: 'Son môi', slug: 'son-moi', isActive: true, productCount: 1 }],
        });
      }
      return respond(200, { success: true, data: [] });
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-products')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-products'));
    await waitFor(() => {
      expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    });
    // Bảng KHÔNG còn cột Đánh giá (đợt 21) — chỉ còn 8 cột, không ô .sa-rating-cell.
    const headers = Array.from(document.querySelectorAll('table thead th')).map(th => th.textContent);
    expect(headers).toEqual(['STT', 'Mã SP', 'Sản phẩm', 'Danh mục', 'Giá', 'Tồn kho', 'Trạng thái', 'Thao tác']);
    expect(document.querySelector('.sa-rating-cell')).toBeNull();
    expect(screen.getByText('250.000₫')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Xem chi tiết sản phẩm Son kem 3CE'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-product-detail-page')).toBeInTheDocument();
    });
    // Không còn Drawer/form xem cũ; bảng danh sách bị thay bằng trang chi tiết.
    expect(screen.queryByTestId('admin-product-form-modal')).toBeNull();
    expect(screen.queryByTestId('products-search-input')).toBeNull();
    // Breadcrumb "Quản lý sản phẩm > Chi tiết sản phẩm" (dấu ">" như spec).
    const crumb = screen.getByTestId('admin-product-breadcrumb');
    expect(crumb).toHaveTextContent('Quản lý sản phẩm');
    expect(crumb).toHaveTextContent('Chi tiết sản phẩm');
    expect(crumb.textContent).toContain('>');
    // Đầy đủ nhóm: mã/tên/DM/trạng thái/đánh giá/giá/giá gốc/tồn kho/mô tả.
    expect(screen.getByTestId('admin-product-detail-code')).toHaveTextContent('SP-001');
    expect(screen.getByTestId('admin-product-detail-name')).toHaveTextContent('Son kem 3CE');
    expect(screen.getByTestId('admin-product-detail-category')).toHaveTextContent('Son môi');
    expect(screen.getByTestId('admin-product-detail-status')).toHaveTextContent('Đang hoạt động');
    // Đánh giá VẪN CÒN ở trang chi tiết (chỉ bỏ cột ở bảng): sao Lucide + số.
    const rating = screen.getByTestId('admin-product-detail-rating');
    expect(rating.textContent).toContain('4.5');
    expect(rating.textContent).toContain('(12 đánh giá)');
    expect(rating.textContent).not.toContain('★');
    expect(rating.querySelector('svg.lucide-star')).not.toBeNull();
    expect(screen.getByTestId('admin-product-detail-price')).toHaveTextContent('250.000₫');
    expect(screen.getByTestId('admin-product-detail-original-price')).toHaveTextContent('300.000₫');
    expect(screen.getByTestId('admin-product-detail-original-price')).toHaveTextContent('-17%');
    expect(screen.getByTestId('admin-product-detail-stock')).toHaveTextContent('5');
    expect(screen.getByTestId('admin-product-detail-stock')).toHaveTextContent('Sắp hết');
    // Gallery: 1 ảnh → thumb không hậu tố -0, bấm phóng to ra lightbox.
    expect(screen.getByTestId('admin-product-image-thumb')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('admin-product-image-thumb'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-product-image-lightbox')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-product-image-lightbox-img')).toHaveAttribute('src', 'https://example.com/son.jpg');
    fireEvent.click(screen.getByTestId('admin-product-image-lightbox-close-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('admin-product-image-lightbox')).toBeNull();
    });
    // Header trang chi tiết CHỈ đúng 2 nút [Quay lại] + [Chỉnh sửa].
    expect(screen.getByTestId('admin-product-detail-back-btn')).toHaveTextContent('Quay lại');
    expect(screen.getByTestId('admin-product-detail-edit-btn')).toHaveTextContent('Chỉnh sửa');
    // Bấm [Chỉnh sửa] sang TRANG sửa full page, giữ nguyên dữ liệu, ô Mã disable.
    fireEvent.click(screen.getByTestId('admin-product-detail-edit-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-product-edit-page')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-product-form')).toHaveAttribute('data-form-mode', 'edit');
    expect(screen.getByTestId('admin-product-form-title')).toHaveTextContent('Chỉnh sửa sản phẩm');
    expect(screen.getByTestId('admin-product-code-input')).toBeDisabled();
    expect(screen.getByTestId('admin-product-code-input')).toHaveValue('SP-001');
    expect(screen.getByTestId('admin-product-name-input')).toHaveValue('Son kem 3CE');
    expect(screen.getByTestId('admin-product-name-input')).not.toHaveAttribute('readonly');
    expect(screen.getByTestId('admin-product-price-input')).toHaveValue('250.000');
    expect(screen.getByTestId('admin-product-save-btn')).toHaveTextContent('Lưu thay đổi');
    // Hủy khi chưa sửa → về thẳng danh sách SP.
    fireEvent.click(screen.getByTestId('admin-product-cancel-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('products-add-btn')).toBeInTheDocument();
    });
    expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
  });

  it('Danh mục (đợt 18 + đợt 21): bấm mắt mở TRANG XEM full page (readonly) + [Chỉnh sửa] sang edit giữ dữ liệu', async () => {
    globalThis.fetch = vi.fn((url: any) => {
      const urlStr = typeof url === 'string' ? url : url.url;
      if (urlStr.includes('/api/admin/profile')) {
        return respond(200, {
          success: true,
          data: { id: 'admin-1', email: 'admin@dafl.vn', fullName: 'Super Admin', role: 'SuperAdmin' },
        });
      }
      if (urlStr.includes('/api/admin/dashboard')) {
        return respond(200, {
          success: true,
          data: { revenueToday: 0, revenueThisMonth: 0, pendingOrders: 0, newCustomers30d: 0, ordersByStatus: {}, lowStockProducts: [], expiringVouchers: [] },
        });
      }
      if (urlStr.includes('/api/admin/reports/revenue')) {
        return respond(200, {
          success: true,
          data: { byDay: [], topProducts: [], totalOrders: 0, cancelledOrders: 0, cancelRate: 0, voucherOrders: 0, voucherUsageRate: 0 },
        });
      }
      if (urlStr.includes('/api/admin/categories')) {
        return respond(200, {
          success: true,
          data: [{ id: 'c1', name: 'Son môi', slug: 'son-moi', description: 'Son các loại', isActive: true, sortOrder: 1, productCount: 3 }],
        });
      }
      return respond(200, { success: true, data: [] });
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-categories')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-categories'));
    await waitFor(() => {
      expect(screen.getByText('Son môi')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Xem chi tiết danh mục Son môi'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-category-detail-page')).toBeInTheDocument();
    });
    // Đợt 21: xem là TRANG full page, không còn Drawer/Modal form.
    expect(screen.queryByTestId('admin-category-form-modal')).toBeNull();
    // Không còn modal chi tiết riêng (admin-category-detail đã bỏ): mắt mở form view.
    expect(screen.queryByTestId('admin-category-detail')).toBeNull();
    const form = screen.getByTestId('admin-category-form');
    expect(form).toHaveAttribute('data-form-mode', 'view');
    expect(screen.getByTestId('admin-category-form-title')).toHaveTextContent('Chi tiết danh mục');
    expect(screen.getByTestId('admin-category-name-input')).toHaveAttribute('readonly');
    expect(screen.getByTestId('admin-category-name-input')).toHaveValue('Son môi');
    expect(screen.getByTestId('admin-category-slug-input')).toHaveValue('son-moi');
    expect(screen.getByTestId('admin-category-description-input')).toHaveValue('Son các loại');
    expect(screen.getByTestId('admin-category-status-badge')).toHaveTextContent('Hiển thị');
    expect(screen.queryByTestId('admin-category-image-dropzone')).toBeNull();
    // Footer view ở header sticky của trang ([Đóng] + [Chỉnh sửa]), không còn .fs-foot.
    const footerBtns = within(screen.getByTestId('admin-category-detail-page')).getAllByRole('button')
      .filter(b => b.closest('.sa-promo-page-head-actions'));
    // Đợt 25/26: header sticky có thêm nút [← Quay lại] đầu tiên.
    expect(footerBtns).toHaveLength(3);
    expect(screen.getByTestId('admin-category-form-back-btn')).toHaveTextContent('Quay lại');
    expect(screen.getByTestId('admin-category-cancel-btn')).toHaveTextContent('Đóng');
    expect(screen.getByTestId('admin-category-edit-btn')).toHaveTextContent('Chỉnh sửa');
    expect(screen.queryByTestId('admin-category-save-btn')).toBeNull();
    // Bấm [Chỉnh sửa] sang TRANG edit, giữ nguyên dữ liệu, ô Mã disable.
    fireEvent.click(screen.getByTestId('admin-category-edit-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-category-edit-page')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-category-form')).toHaveAttribute('data-form-mode', 'edit');
    expect(screen.getByTestId('admin-category-code-input')).toBeDisabled();
    expect(screen.getByTestId('admin-category-name-input')).toHaveValue('Son môi');
    expect(screen.getByTestId('admin-category-name-input')).not.toHaveAttribute('readonly');
    expect(screen.getByTestId('admin-category-save-btn')).toHaveTextContent('Lưu thay đổi');
  });

  // ---------- Helper cho các test giao diện mới (toolbar / phân trang / modal) ----------
  const adminProfile = { id: 'admin-1', email: 'admin@dafl.vn', fullName: 'Super Admin', role: 'SuperAdmin' };

  /** Mock fetch cho trang Admin: profile/dashboard/revenue mặc định + `extra` cho từng endpoint. */
  function mockFetchAdmin(extra?: (urlStr: string) => unknown) {
    globalThis.fetch = vi.fn((url: any) => {
      const urlStr = typeof url === 'string' ? url : url.url;
      if (urlStr.includes('/api/admin/profile')) return respond(200, { success: true, data: adminProfile });
      if (urlStr.includes('/api/admin/dashboard')) {
        return respond(200, {
          success: true,
          data: { revenueToday: 0, revenueThisMonth: 0, pendingOrders: 0, newCustomers30d: 0, ordersByStatus: {}, lowStockProducts: [], expiringVouchers: [] },
        });
      }
      if (urlStr.includes('/api/admin/reports/revenue')) {
        return respond(200, {
          success: true,
          data: { byDay: [], topProducts: [], totalOrders: 0, cancelledOrders: 0, cancelRate: 0, voucherOrders: 0, voucherUsageRate: 0 },
        });
      }
      if (extra) {
        const data = extra(urlStr);
        if (data !== undefined) return respond(200, { success: true, data });
      }
      return respond(200, { success: true, data: [] });
    });
  }

  const mkProducts = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `p${i + 1}`, categoryId: 'c1', categoryName: 'Son môi',
      name: `Sản phẩm ${String(i + 1).padStart(2, '0')}`,
      price: 100000 + i * 1000, originalPrice: 150000, availableStock: 10,
      imageUrl: '', rating: 4.5, reviewCount: 3,
    }));

  const mkOrders = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `o${i + 1}`, orderDisplayCode: `DH-${1001 + i}`, orderCode: 1001 + i,
      customerName: `Khách ${String(i + 1).padStart(2, '0')}`,
      customerEmail: `khach${i + 1}@example.com`,
      status: 'Pending', paymentMethod: 'COD', totalAmount: 500000, createdAt: '2026-11-08T10:00:00Z',
    }));

  const mkCategories = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `c${i + 1}`, name: `Danh mục ${String(i + 1).padStart(2, '0')}`,
      slug: `danh-muc-${i + 1}`, description: `Mô tả ${i + 1}`,
      isActive: true, sortOrder: i + 1, productCount: 0,
    }));

  const mkReturns = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `r${i + 1}`, orderId: `o${i + 1}`, orderDisplayCode: `DH-${2000 + i}`,
      productId: 'p1', productName: `SP trả ${String(i + 1).padStart(2, '0')}`,
      quantity: 1, reason: 'Lỗi sản phẩm', status: 'Pending', createdAt: '2026-11-08T10:00:00Z',
    }));

  const mkAudit = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `a${i + 1}`, actorEmail: 'admin@dafl.vn',
      action: `Cập nhật đơn DH-${2000 + i}`, entityType: 'Order',
      entityId: `o${i + 1}`, createdAt: '2026-11-08T10:00:00Z',
    }));

  const mkTiers = () => [
    { tier: 'Member', minSpent: 0, spendPerPoint: 10000, maxPointsPercent: 10, freeShipThreshold: 299000 },
    { tier: 'Silver', minSpent: 5000000, spendPerPoint: 10000, maxPointsPercent: 15, freeShipThreshold: 299000 },
    { tier: 'Gold', minSpent: 15000000, spendPerPoint: 8000, maxPointsPercent: 20, freeShipThreshold: 199000 },
    { tier: 'Diamond', minSpent: 30000000, spendPerPoint: 5000, maxPointsPercent: 30, freeShipThreshold: 0 },
  ];

  it('Topbar mới: không còn nút Tạo mới / ô tìm kiếm; không còn breadcrumb', async () => {
    mockFetchFor({
      status: 200,
      body: { success: true, data: adminProfile },
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-dashboard')).toBeInTheDocument();
    });
    const topbar = screen.getByRole('banner');
    // Topbar chỉ còn: thu gọn sidebar, toàn màn hình, chuông, avatar/tên.
    expect(within(topbar).queryByRole('textbox')).toBeNull();
    expect(within(topbar).queryByText(/Tạo mới/)).toBeNull();
    expect(screen.queryByText('+ Tạo mới')).toBeNull();
    expect(screen.getByLabelText('Thu gọn / mở menu')).toBeInTheDocument();
    expect(screen.getByLabelText('Thông báo')).toBeInTheDocument();
    expect(screen.getByLabelText('Menu tài khoản')).toBeInTheDocument();
    // Breadcrumb "Trang chủ / Quản trị / ..." đã bỏ ở mọi mục.
    expect(screen.queryByText(/Trang chủ\s*\//)).toBeNull();
    expect(document.querySelector('.sa-breadcrumb, [class*="breadcrumb"]')).toBeNull();
  });

  it('Toolbar Sản phẩm (đợt 21 + đợt 24/26): PageToolbar lọc ngay — tìm trái, Đặt lại bộ lọc (chỉ icon, disable khi chưa lọc)/+ Thêm mới phải, KHÔNG nút Tìm, KHÔNG Export', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/products') || urlStr.includes('/api/admin/products')) return mkProducts(1);
      if (urlStr.includes('/api/admin/categories')) return mkCategories(1);
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-products')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-products'));
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm 01')).toBeInTheDocument();
    });
    const addBtn = screen.getByTestId('products-add-btn');
    expect(addBtn).toHaveTextContent('+ Thêm mới');
    expect(addBtn).toHaveClass('sa-page-toolbar-add-btn');
    const right = addBtn.closest('.sa-page-toolbar-right');
    expect(right).not.toBeNull();
    // Nút Thêm mới là phần tử cuối cùng của nhóm phải.
    expect(right!.lastElementChild).toBe(addBtn);
    // Ô tìm ở nhóm trái, placeholder tìm theo tên hoặc mã; KHÔNG còn nút icon Tìm
    // (lọc áp dụng ngay khi gõ/đổi dropdown, debounce 300ms).
    const searchInput = screen.getByTestId('products-search-input');
    expect(searchInput.closest('.sa-page-toolbar-left')).not.toBeNull();
    expect(searchInput).toHaveAttribute('placeholder', 'Tìm tên hoặc mã sản phẩm...');
    expect(screen.queryByTestId('products-search-btn')).toBeNull();
    // Chưa gõ thì không có nút × xóa nhanh; nút Đặt lại đợt 24/26 chỉ còn icon
    // RotateCcw 38px (không còn chữ) — tooltip + aria-label "Đặt lại bộ lọc", disable khi chưa lọc.
    expect(screen.queryByTestId('products-search-clear-btn')).toBeNull();
    const resetBtn = screen.getByTestId('products-reset-btn');
    expect(resetBtn).toHaveTextContent('');
    expect(resetBtn).toHaveAttribute('aria-label', 'Đặt lại bộ lọc');
    expect(resetBtn).toHaveAttribute('title', 'Đặt lại bộ lọc');
    expect(resetBtn.querySelector('svg.lucide-rotate-ccw')).not.toBeNull();
    expect(resetBtn).toBeDisabled();
    expect(resetBtn.closest('.sa-page-toolbar-right')).not.toBeNull();
    // Dropdown Trạng thái mặc định "Trạng thái" (Trạng thái / Đang hoạt động / Ngừng hoạt động).
    const statusFilter = screen.getByTestId('admin-status-filter');
    expect(statusFilter).toHaveValue('');
    expect(within(statusFilter).getByText('Trạng thái')).toBeInTheDocument();
    expect(within(statusFilter).getByText('Đang hoạt động')).toBeInTheDocument();
    expect(within(statusFilter).getByText('Ngừng hoạt động')).toBeInTheDocument();
    // BỎ HẲN Export (đợt 18): không còn nút Export nào, không còn nút Làm mới riêng.
    expect(screen.queryByRole('button', { name: /Export/ })).toBeNull();
    expect(screen.queryByTestId('products-refresh-btn')).toBeNull();
    expect(screen.queryByTestId('admin-product-add-btn')).toBeNull();
    expect(screen.getByTestId('admin-products-pagination')).toBeInTheDocument();
  });

  it('Toolbar (đợt 21 + đợt 24/26): toolbar SP không nút icon Tìm — chỉ icon Lucide Search trong ô tìm + icon RotateCcw ở nút Đặt lại, KHÔNG còn emoji 🔍/↺ trong toolbar admin', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/products') || urlStr.includes('/api/admin/products')) return mkProducts(1);
      if (urlStr.includes('/api/admin/categories')) return mkCategories(1);
      return undefined;
    });
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-products')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-products'));
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm 01')).toBeInTheDocument();
    });
    const toolbar = document.querySelector('.sa-page-toolbar')!;
    expect(toolbar).not.toBeNull();
    // Không còn ký tự emoji trong toàn bộ toolbar.
    expect(toolbar.textContent).not.toContain('🔍');
    expect(toolbar.textContent).not.toContain('↺');
    // Đợt 24/26: toolbar SP lọc ngay nên KHÔNG còn nút icon Tìm (Search);
    // nút Đặt lại CHỈ còn icon RotateCcw (không còn chữ "Đặt lại bộ lọc").
    expect(screen.queryByTestId('products-search-btn')).toBeNull();
    expect(toolbar.querySelector('svg.lucide-rotate-ccw')).not.toBeNull();
    const resetBtn = screen.getByTestId('products-reset-btn');
    expect(resetBtn).toHaveTextContent('');
    expect(resetBtn).toHaveAttribute('aria-label', 'Đặt lại bộ lọc');
    // Icon kính lúp trong ô tìm vẫn là Lucide Search.
    const inputIcon = document.querySelector('.sa-page-toolbar-search-icon svg.lucide-search');
    expect(inputIcon).not.toBeNull();
  });

  it('Sản phẩm (đợt 21): lọc KẾT HỢP (tìm tên/mã + danh mục + trạng thái, AND) + empty state khi không khớp', async () => {
    const products = [
      { id: 'p1', code: 'SP-001', categoryId: 'c1', categoryName: 'Son môi', name: 'Son kem 3CE', price: 250000, originalPrice: 300000, availableStock: 5, rating: 4.5, reviewCount: 12, isActive: true },
      { id: 'p2', code: 'SP-002', categoryId: 'c1', categoryName: 'Son môi', name: 'Son lì MAC', price: 200000, originalPrice: null, availableStock: 8, rating: null, reviewCount: 0, isActive: false },
      { id: 'p3', code: 'SP-003', categoryId: 'c2', categoryName: 'Dưỡng da', name: 'Kem dưỡng A', price: 150000, originalPrice: null, availableStock: 20, rating: 5, reviewCount: 2, isActive: true },
    ];
    const categories = [
      { id: 'c1', name: 'Son môi', slug: 'son-moi', isActive: true, productCount: 2 },
      { id: 'c2', name: 'Dưỡng da', slug: 'duong-da', isActive: true, productCount: 1 },
    ];
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/products') || urlStr.includes('/api/admin/products')) return products;
      if (urlStr.includes('/api/admin/categories')) return categories;
      return undefined;
    });
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-products')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-products'));
    await waitFor(() => {
      expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    });
    expect(screen.getByText('Son lì MAC')).toBeInTheDocument();
    expect(screen.getByText('Kem dưỡng A')).toBeInTheDocument();

    // (a) Tìm theo tên (không dấu, debounce 300ms): 'son' khớp 2 SP Son, không khớp Kem.
    fireEvent.change(screen.getByTestId('products-search-input'), { target: { value: 'son' } });
    await waitFor(() => {
      expect(screen.queryByText('Kem dưỡng A')).toBeNull();
    });
    expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    expect(screen.getByText('Son lì MAC')).toBeInTheDocument();
    // Nút × xóa nhanh hiện khi có từ khóa; bấm × thì về đủ 3 dòng.
    expect(screen.getByTestId('products-search-clear-btn')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('products-search-clear-btn'));
    await waitFor(() => {
      expect(screen.getByText('Kem dưỡng A')).toBeInTheDocument();
    });

    // (b) Tìm theo MÃ: 'SP-003' chỉ khớp Kem dưỡng A.
    fireEvent.change(screen.getByTestId('products-search-input'), { target: { value: 'SP-003' } });
    await waitFor(() => {
      expect(screen.queryByText('Son kem 3CE')).toBeNull();
    });
    expect(screen.getByText('Kem dưỡng A')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('products-search-clear-btn'));
    await waitFor(() => {
      expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    });

    // (c) Lọc danh mục + trạng thái KẾT HỢP (AND): DM 'Dưỡng da' + 'Ngừng hoạt
    // động' → 0 dòng (Kem dưỡng đang hoạt động) + empty state "Không tìm thấy".
    fireEvent.change(screen.getByLabelText('Lọc danh mục'), { target: { value: 'c2' } });
    await waitFor(() => {
      expect(screen.queryByText('Son kem 3CE')).toBeNull();
    });
    expect(screen.getByText('Kem dưỡng A')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('admin-status-filter'), { target: { value: 'false' } });
    await waitFor(() => {
      expect(screen.queryByText('Kem dưỡng A')).toBeNull();
    });
    expect(screen.getByText('Không tìm thấy sản phẩm')).toBeInTheDocument();
    expect(screen.getByText('Thử đổi từ khóa hoặc bộ lọc khác.')).toBeInTheDocument();

    // (d) Nút "Đặt lại bộ lọc" xóa hết → về đủ 3 dòng, nút lại disable.
    const resetBtn = screen.getByTestId('products-reset-btn');
    expect(resetBtn).not.toBeDisabled();
    fireEvent.click(resetBtn);
    await waitFor(() => {
      expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    });
    expect(screen.getByText('Son lì MAC')).toBeInTheDocument();
    expect(screen.getByText('Kem dưỡng A')).toBeInTheDocument();
    expect(screen.getByTestId('products-reset-btn')).toBeDisabled();

    // (e) Từ khóa lạ → 0 dòng + empty state.
    fireEvent.change(screen.getByTestId('products-search-input'), { target: { value: 'zzzz-khong-co' } });
    await waitFor(() => {
      expect(screen.getByText('Không tìm thấy sản phẩm')).toBeInTheDocument();
    });
  });

  it('Sản phẩm (đợt 21): gạt toggle → modal CHUNG statusChange (không còn "Ẩn/Hiển thị sản phẩm?") → Hủy giữ nguyên, Xác nhận gọi PUT + toast statusChanged (có "!")', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/products') || urlStr.includes('/api/admin/products')) return mkProducts(1).map(p => ({ ...p, isActive: true }));
      if (urlStr.includes('/api/admin/categories')) return mkCategories(1);
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-products')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-products'));
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm 01')).toBeInTheDocument();
    });
    const sw = screen.getByTestId('admin-product-status-switch-p1');
    expect(sw).toHaveAttribute('aria-checked', 'true');
    // (1) Gạt → modal chung; bấm Hủy thì không gọi API, Switch giữ nguyên.
    fireEvent.click(sw);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Xác nhận thay đổi trạng thái?');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('Bạn có chắc chắn muốn thay đổi trạng thái của sản phẩm Sản phẩm 01 không?');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Xác nhận');
    expect(screen.getByTestId('confirm-dialog-cancel-btn')).toHaveTextContent('Hủy');
    expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByText('Ẩn sản phẩm?')).toBeNull();
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    expect(calledWith('/api/admin/products/p1', 'PUT')).toBe(false);
    expect(screen.getByTestId('admin-product-status-switch-p1')).toHaveAttribute('aria-checked', 'true');
    // (2) Gạt lại → modal chung → Xác nhận → PUT + toast "Đổi trạng thái sản phẩm thành công!".
    fireEvent.click(screen.getByTestId('admin-product-status-switch-p1'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/products/p1', 'PUT')).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đổi trạng thái sản phẩm thành công!');
    });
    expect(screen.getByTestId('admin-toast-desc')).toHaveTextContent("Sản phẩm 'Sản phẩm 01' đã được cập nhật trạng thái.");
  });

  it('Form Sản phẩm (đợt 21): bấm "+ Thêm mới" mở TRANG full page /products/new (không Drawer/Modal); lưu thiếu trường báo lỗi đỏ từng trường', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/products') || urlStr.includes('/api/admin/products')) return mkProducts(1);
      if (urlStr.includes('/api/admin/categories')) return mkCategories(1);
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-products')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-products'));
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm 01')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('products-add-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-product-create-page')).toBeInTheDocument();
    });
    // Trang full page: breadcrumb + tiêu đề + form, KHÔNG còn Drawer/Modal.
    expect(screen.queryByTestId('admin-product-form-modal')).toBeNull();
    expect(screen.getByTestId('admin-product-breadcrumb')).toHaveTextContent('Thêm mới');
    expect(screen.getByTestId('admin-product-form-title')).toHaveTextContent('Thêm mới sản phẩm');
    expect(screen.getByTestId('admin-product-form')).toHaveAttribute('data-form-mode', 'create');
    expect(screen.getByTestId('admin-product-name-input')).toBeInTheDocument();
    // Danh sách đã bị thay bằng trang form (không còn trong DOM).
    expect(screen.queryByTestId('products-search-input')).toBeNull();
    // Ô Mã SP được focus khi mở trang (autofocus trang full page).
    expect(document.activeElement).toBe(screen.getByTestId('admin-product-code-input'));

    // Lưu khi để trống → lỗi đỏ từng trường bắt buộc, form vẫn mở, không gọi POST.
    fireEvent.click(screen.getByTestId('admin-product-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-product-name-error')).toHaveTextContent('Vui lòng bổ sung thông tin bắt buộc.');
    });
    expect(screen.getByTestId('admin-product-price-error')).toHaveTextContent('Vui lòng bổ sung thông tin bắt buộc.');
    expect(screen.getByTestId('admin-product-stock-error')).toHaveTextContent('Vui lòng bổ sung thông tin bắt buộc.');
    expect(screen.getByTestId('admin-product-create-page')).toBeInTheDocument();
    expect(calledWith('/api/admin/products', 'POST')).toBe(false);
    // Lưu thiếu trường còn hiện toast cảnh báo chung (đợt 25).
    expect(screen.getByText('Vui lòng kiểm tra lại các trường bắt buộc')).toBeInTheDocument();

    // Điền đủ trường hợp lệ → lưu thành công: POST + toast + về danh sách.
    fireEvent.change(screen.getByTestId('admin-product-name-input'), { target: { value: 'Son kem test' } });
    fireEvent.change(screen.getByTestId('admin-product-price-input'), { target: { value: '99000' } });
    fireEvent.change(screen.getByTestId('admin-product-stock-input'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('admin-product-save-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/products', 'POST')).toBe(true);
    });
    // Đợt 25/26: toast lưu chung "Đã lưu sản phẩm" (không nêu tên); dùng
    // getByText vì toast cảnh báo lúc lưu thiếu vẫn còn trong host.
    await waitFor(() => {
      expect(screen.getByText('Đã lưu sản phẩm')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId('products-add-btn')).toBeInTheDocument();
    });
  });

  it('Toolbar Đơn hàng (đợt 21 + đợt 24/26): không nút Thêm mới/Tìm; ô tìm + nút × khi gõ + dropdown "Trạng thái" + nút Đặt lại chỉ icon (disable khi chưa lọc) + số kết quả, KHÔNG Export', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/orders')) return mkOrders(1);
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-orders')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-orders'));
    await waitFor(() => {
      expect(screen.getByText('Khách 01')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('orders-add-btn')).toBeNull();
    expect(document.querySelector('.sa-page-toolbar .sa-page-toolbar-add-btn')).toBeNull();
    expect(screen.getByTestId('orders-search-input').closest('.sa-page-toolbar-left')).not.toBeNull();
    // Không còn nút icon Tìm kiếm (lọc áp dụng ngay khi gõ/đổi dropdown).
    expect(screen.queryByTestId('orders-search-btn')).toBeNull();
    // Nút Đặt lại đợt 24/26 chỉ còn icon RotateCcw, disable khi chưa có từ khóa/trạng thái.
    const resetBtn = screen.getByTestId('orders-reset-btn');
    expect(resetBtn).toHaveTextContent('');
    expect(resetBtn).toHaveAttribute('aria-label', 'Đặt lại bộ lọc');
    expect(resetBtn.querySelector('svg.lucide-rotate-ccw')).not.toBeNull();
    expect(resetBtn).toBeDisabled();
    expect(resetBtn.closest('.sa-page-toolbar-right')).not.toBeNull();
    // Chưa gõ thì không có nút × xóa nhanh; số kết quả "1 / 1 đơn".
    expect(screen.queryByTestId('orders-search-clear-btn')).toBeNull();
    expect(screen.getByTestId('admin-orders-result-count')).toHaveTextContent('1 / 1 đơn');
    // Dropdown mặc định "Trạng thái" (option đầu, màu nhạt placeholder-like).
    const filter = screen.getByTestId('admin-order-status-filter');
    expect(filter).toHaveValue('');
    expect(filter).toHaveClass('sa-filter-select--placeholder');
    expect(screen.queryByRole('button', { name: /Export/ })).toBeNull();
  });

  it('Phân trang Sản phẩm (đợt 18): 12 SP → 2 trang, bấm Sau/Trước, "Hiển thị 1–10 / 12 kết quả"', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/products') || urlStr.includes('/api/admin/products')) return mkProducts(12);
      if (urlStr.includes('/api/admin/categories')) return mkCategories(1);
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-products')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-products'));
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm 01')).toBeInTheDocument();
    });
    const pager = screen.getByTestId('admin-products-pagination');
    expect(within(pager).getByText('Hiển thị 1–10 / 12 kết quả')).toBeInTheDocument();
    expect(screen.getByTestId('admin-products-pagination-range')).toHaveTextContent('Trang 1 / 2');
    expect(screen.getByTestId('admin-products-pagination-prev')).toBeDisabled();
    expect(screen.queryByText('Sản phẩm 11')).toBeNull();

    fireEvent.click(screen.getByTestId('admin-products-pagination-next'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-products-pagination-range')).toHaveTextContent('Trang 2 / 2');
    });
    expect(within(pager).getByText('Hiển thị 11–12 / 12 kết quả')).toBeInTheDocument();
    expect(screen.getByText('Sản phẩm 11')).toBeInTheDocument();
    expect(screen.getByText('Sản phẩm 12')).toBeInTheDocument();
    expect(screen.queryByText('Sản phẩm 01')).toBeNull();
    expect(screen.getByTestId('admin-products-pagination-next')).toBeDisabled();

    fireEvent.click(screen.getByTestId('admin-products-pagination-prev'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-products-pagination-range')).toHaveTextContent('Trang 1 / 2');
    });
    expect(screen.getByText('Sản phẩm 01')).toBeInTheDocument();
    expect(screen.queryByText('Sản phẩm 11')).toBeNull();
  });

  it('Phân trang Đơn hàng (đợt 18): 15 đơn → 2 trang, "Hiển thị 1–10 / 15 kết quả"', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/orders')) return mkOrders(15);
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-orders')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-orders'));
    await waitFor(() => {
      expect(screen.getByText('Khách 01')).toBeInTheDocument();
    });
    const pager = screen.getByTestId('admin-orders-pagination');
    expect(within(pager).getByText('Hiển thị 1–10 / 15 kết quả')).toBeInTheDocument();
    expect(screen.getByTestId('admin-orders-pagination-range')).toHaveTextContent('Trang 1 / 2');
    expect(screen.getByTestId('admin-orders-pagination-prev')).toBeDisabled();
    expect(screen.queryByText('Khách 11')).toBeNull();

    fireEvent.click(screen.getByTestId('admin-orders-pagination-next'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-orders-pagination-range')).toHaveTextContent('Trang 2 / 2');
    });
    expect(screen.getByText('Khách 11')).toBeInTheDocument();
    expect(screen.getByText('Khách 15')).toBeInTheDocument();
    expect(screen.queryByText('Khách 01')).toBeNull();
    expect(screen.getByTestId('admin-orders-pagination-next')).toBeDisabled();

    fireEvent.click(screen.getByTestId('admin-orders-pagination-prev'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-orders-pagination-range')).toHaveTextContent('Trang 1 / 2');
    });
    expect(screen.getByText('Khách 01')).toBeInTheDocument();
  });

  // ---------- Đợt 21 — danh sách Đơn hàng: lọc client-side ----------
  // Dữ liệu trộn trạng thái + tên có dấu để kiểm tra nhóm lọc và tìm không dấu.
  const mkOrdersMixed = () => [
    { id: 'o1', orderDisplayCode: 'DH-1001', orderCode: 1001, customerName: 'Nguyễn Văn A', customerEmail: 'a@example.com', status: 'Pending', statusLabel: 'Chờ xác nhận', paymentMethod: 'COD', totalAmount: 100000, createdAt: '2026-11-08T10:00:00Z' },
    { id: 'o2', orderDisplayCode: 'DH-1002', orderCode: 1002, customerName: 'Trần Thị B', customerEmail: 'b@example.com', status: 'Paid', statusLabel: 'Chờ xác nhận', paymentMethod: 'PayOS', totalAmount: 200000, createdAt: '2026-11-08T10:00:00Z' },
    { id: 'o3', orderDisplayCode: 'DH-1003', orderCode: 1003, customerName: 'Lê Văn C', customerEmail: 'c@example.com', status: 'Shipping', statusLabel: 'Đang giao', paymentMethod: 'COD', totalAmount: 300000, createdAt: '2026-11-08T10:00:00Z' },
    { id: 'o4', orderDisplayCode: 'DH-1004', orderCode: 1004, customerName: 'Phạm Thị D', customerEmail: 'd@example.com', status: 'Cancelled', statusLabel: 'Đã hủy', paymentMethod: 'COD', totalAmount: 400000, createdAt: '2026-11-08T10:00:00Z' },
  ];

  const openOrdersTab = async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-orders')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-orders'));
  };

  it('Lọc trạng thái đơn (đợt 21 + đợt 26): dropdown 7 lựa chọn "Trạng thái" + 6 nhóm; "Chờ xác nhận" gộp Pending+Paid, pill KHÔNG chấm + màu đúng', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/orders')) return mkOrdersMixed();
      return undefined;
    });
    await openOrdersTab();
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    });

    // Đủ 7 lựa chọn theo đúng thứ tự; option đầu "Trạng thái" (value="").
    const options = within(screen.getByTestId('admin-order-status-filter')).getAllByRole('option').map(o => o.textContent);
    expect(options).toEqual(['Trạng thái', 'Chờ xác nhận', 'Đã xác nhận', 'Đang giao', 'Hoàn thành', 'Đã hủy', 'Hết hạn thanh toán']);
    expect(screen.getByTestId('admin-orders-result-count')).toHaveTextContent('4 / 4 đơn');
    // Pill trạng thái KHÔNG còn chấm tròn (đợt 26); PayOS hiện badge viền.
    // (Scope vào bảng để không dính option "Chờ xác nhận" trong dropdown lọc.)
    const awaitingPills = Array.from(document.querySelectorAll('.sa-orders-table-wrap .sa-pill'))
      .filter(p => p.textContent === 'Chờ xác nhận');
    expect(awaitingPills).toHaveLength(2);
    awaitingPills.forEach(p => {
      expect(p).toHaveClass('sa-pill-amber');
      expect(p!.querySelector('.sa-dot')).toBeNull();
    });
    expect(screen.getByText('PayOS')).toHaveClass('sa-orders-pay-badge');

    // "Chờ xác nhận" gộp cả Pending (DH-1001) lẫn Paid (DH-1002); lọc ngay
    // khi đổi dropdown, không cần bấm nút; nút Đặt lại bật lên.
    fireEvent.change(screen.getByTestId('admin-order-status-filter'), { target: { value: 'awaiting' } });
    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    expect(screen.getByText('Trần Thị B')).toBeInTheDocument();
    expect(screen.queryByText('Lê Văn C')).toBeNull();
    expect(screen.queryByText('Phạm Thị D')).toBeNull();
    expect(screen.getByTestId('admin-orders-result-count')).toHaveTextContent('2 / 4 đơn');
    expect(screen.getByTestId('orders-reset-btn')).not.toBeDisabled();

    // "Đã hủy" chỉ còn đơn hủy.
    fireEvent.change(screen.getByTestId('admin-order-status-filter'), { target: { value: 'Cancelled' } });
    expect(screen.getByText('Phạm Thị D')).toBeInTheDocument();
    expect(screen.queryByText('Nguyễn Văn A')).toBeNull();
    expect(screen.getByTestId('admin-orders-result-count')).toHaveTextContent('1 / 4 đơn');
  });

  it('Tìm đơn (đợt 21 + đợt 24/26): gõ "nguyen" (không dấu) khớp "Nguyễn Văn A"; debounce 300ms nên bảng chưa đổi ngay; nút × xóa nhanh khôi phục', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/orders')) return mkOrdersMixed();
      return undefined;
    });
    await openOrdersTab();
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    });
    const input = screen.getByTestId('orders-search-input');
    fireEvent.change(input, { target: { value: 'nguyen' } });
    // Debounce: ngay sau khi gõ, bảng vẫn hiện đủ 4 đơn (chưa lọc).
    expect(screen.getByText('Trần Thị B')).toBeInTheDocument();
    expect(screen.getByTestId('admin-orders-result-count')).toHaveTextContent('4 / 4 đơn');
    // Nút × đã hiện ngay khi có chữ (không chờ debounce).
    expect(screen.getByTestId('orders-search-clear-btn')).toBeInTheDocument();
    // Sau 300ms: chỉ còn đơn khớp không dấu.
    await waitFor(() => {
      expect(screen.queryByText('Trần Thị B')).toBeNull();
    });
    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    expect(screen.getByTestId('admin-orders-result-count')).toHaveTextContent('1 / 4 đơn');
    // Bấm × xóa nhanh: ô tìm trống, bảng về đủ 4 đơn.
    fireEvent.click(screen.getByTestId('orders-search-clear-btn'));
    await waitFor(() => {
      expect(screen.getByText('Trần Thị B')).toBeInTheDocument();
    });
    expect(screen.getByTestId('orders-search-input')).toHaveValue('');
    expect(screen.queryByTestId('orders-search-clear-btn')).toBeNull();
  });

  it('Tìm đơn (đợt 21): tìm theo mã "DH-1003", "#1002" và email đều khớp đúng đơn', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/orders')) return mkOrdersMixed();
      return undefined;
    });
    await openOrdersTab();
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    });
    const input = screen.getByTestId('orders-search-input');
    fireEvent.change(input, { target: { value: 'DH-1003' } });
    // Chờ đơn KHÔNG khớp biến mất (debounce 300ms) — không chờ 'Lê Văn C'
    // vì đơn này đã hiện sẵn trước khi lọc.
    await waitFor(() => {
      expect(screen.queryByText('Nguyễn Văn A')).toBeNull();
    });
    expect(screen.getByText('Lê Văn C')).toBeInTheDocument();
    expect(screen.getByTestId('admin-orders-result-count')).toHaveTextContent('1 / 4 đơn');

    fireEvent.click(screen.getByTestId('orders-search-clear-btn'));
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    });
    fireEvent.change(input, { target: { value: '#1002' } });
    await waitFor(() => {
      expect(screen.queryByText('Nguyễn Văn A')).toBeNull();
    });
    expect(screen.getByText('Trần Thị B')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('orders-search-clear-btn'));
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    });
    fireEvent.change(input, { target: { value: 'c@example.com' } });
    await waitFor(() => {
      expect(screen.queryByText('Nguyễn Văn A')).toBeNull();
    });
    expect(screen.getByText('Lê Văn C')).toBeInTheDocument();
  });

  it('Empty state đơn (đợt 21): tìm "ZZZ999" → "Không tìm thấy đơn hàng" + nút "Xóa bộ lọc"; bấm nút khôi phục đủ đơn', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/orders')) return mkOrders(2);
      return undefined;
    });
    await openOrdersTab();
    await waitFor(() => {
      expect(screen.getByText('Khách 01')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('orders-search-input'), { target: { value: 'ZZZ999' } });
    await waitFor(() => {
      expect(screen.getByText('Không tìm thấy đơn hàng')).toBeInTheDocument();
    });
    expect(screen.getByText('Thử đổi từ khóa hoặc bộ lọc khác.')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-orders-pagination')).toBeNull();
    expect(screen.getByTestId('admin-orders-result-count')).toHaveTextContent('0 / 2 đơn');
    fireEvent.click(screen.getByTestId('admin-orders-clear-filters-btn'));
    await waitFor(() => {
      expect(screen.getByText('Khách 01')).toBeInTheDocument();
    });
    expect(screen.getByTestId('orders-search-input')).toHaveValue('');
    expect(screen.getByTestId('admin-order-status-filter')).toHaveValue('');
    expect(screen.getByTestId('admin-orders-result-count')).toHaveTextContent('2 / 2 đơn');
  });

  it('Phân trang đơn (đợt 21): phân trang chạy trên danh sách ĐÃ LỌC — tìm "khach 1" trên 15 đơn chỉ còn 6 đơn, 1 trang', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/orders')) return mkOrders(15);
      return undefined;
    });
    await openOrdersTab();
    await waitFor(() => {
      expect(screen.getByText('Khách 01')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-orders-result-count')).toHaveTextContent('15 / 15 đơn');
    fireEvent.change(screen.getByTestId('orders-search-input'), { target: { value: 'khach 1' } });
    await waitFor(() => {
      expect(screen.getByTestId('admin-orders-result-count')).toHaveTextContent('6 / 15 đơn');
    });
    const pager = screen.getByTestId('admin-orders-pagination');
    expect(within(pager).getByText('Hiển thị 1–6 / 6 kết quả')).toBeInTheDocument();
    expect(screen.getByTestId('admin-orders-pagination-range')).toHaveTextContent('Trang 1 / 1');
    expect(screen.getByText('Khách 10')).toBeInTheDocument();
    expect(screen.queryByText('Khách 01')).toBeNull();
  });

  it('Form Sản phẩm (đợt 21): bấm Thêm mới mở TRANG full page /products/new (thay bảng, có breadcrumb, không Drawer)', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/products') || urlStr.includes('/api/admin/products')) return mkProducts(1);
      if (urlStr.includes('/api/admin/categories')) return mkCategories(1);
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-products')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-products'));
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm 01')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('admin-product-form-modal')).toBeNull();

    fireEvent.click(screen.getByTestId('products-add-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-product-create-page')).toBeInTheDocument();
    });
    // Trang full page, KHÔNG Drawer: không role dialog, không fs-drawer, không nút X.
    expect(screen.queryByTestId('admin-product-form-modal')).toBeNull();
    expect(screen.queryByTestId('admin-product-form-modal-close-btn')).toBeNull();
    expect(screen.getByTestId('admin-product-form-title')).toHaveTextContent('Thêm mới sản phẩm');
    expect(screen.getByTestId('admin-product-form')).toHaveAttribute('data-form-mode', 'create');
    expect(screen.getByTestId('admin-product-breadcrumb')).toHaveTextContent('Thêm mới');
    expect(screen.getByTestId('admin-product-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('admin-product-price-input')).toBeInTheDocument();
    // Trang form THAY bảng danh sách (không còn trong DOM).
    expect(screen.queryByText('Sản phẩm 01')).toBeNull();
    expect(screen.queryByTestId('products-search-input')).toBeNull();
    // Header sticky đúng 2 nút [Hủy] + [Lưu].
    expect(screen.getByTestId('admin-product-cancel-btn')).toHaveTextContent('Hủy');
    expect(screen.getByTestId('admin-product-save-btn')).toHaveTextContent('Lưu');
  });

  it('Form Danh mục (đợt 21): bấm "+ Thêm mới" mở TRANG full page /categories/new (không Drawer/Modal, không nút Quay lại)', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/categories')) return mkCategories(1);
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-categories')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-categories'));
    await waitFor(() => {
      expect(screen.getByText('Danh mục 01')).toBeInTheDocument();
    });
    expect(screen.getByTestId('categories-add-btn')).toHaveTextContent('Thêm mới');
    expect(screen.queryByTestId('admin-category-form-modal')).toBeNull();

    fireEvent.click(screen.getByTestId('categories-add-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-category-create-page')).toBeInTheDocument();
    });
    // Trang full page: breadcrumb + tiêu đề + form, KHÔNG còn Drawer/Modal.
    expect(screen.queryByTestId('admin-category-form-modal')).toBeNull();
    expect(screen.getByTestId('admin-entity-breadcrumb')).toHaveTextContent('Thêm mới');
    expect(screen.getByTestId('admin-category-form-title')).toHaveTextContent('Thêm mới danh mục');
    expect(screen.getByTestId('admin-category-form')).toHaveAttribute('data-form-mode', 'create');
    expect(screen.getByTestId('admin-category-name-input')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-form-back-btn')).toBeNull();
    // Danh sách đã bị thay bằng trang form (không còn trong DOM).
    expect(screen.queryByText('Danh mục 01')).toBeNull();

    // Hủy khi chưa sửa → về thẳng danh sách DM.
    fireEvent.click(screen.getByTestId('admin-category-cancel-btn'));
    await waitFor(() => {
      expect(screen.getByText('Danh mục 01')).toBeInTheDocument();
    });
  });

  it('Form Khuyến mãi (đợt 21): bấm "+ Thêm mới" mở TRANG full page /promotions/new (không Drawer/Modal)', async () => {
    mockFetchAdmin();
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-promotions')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-promotions'));
    await waitFor(() => {
      expect(screen.getByTestId('promotions-add-btn')).toBeInTheDocument();
    });
    expect(screen.getByTestId('promotions-add-btn')).toHaveTextContent('Thêm mới');
    expect(screen.getByText('Chưa có khuyến mãi nào')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-promo-form-modal')).toBeNull();

    fireEvent.click(screen.getByTestId('promotions-add-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-promo-create-page')).toBeInTheDocument();
    });
    // Trang full page: breadcrumb + tiêu đề + form, KHÔNG còn Drawer/Modal.
    expect(screen.queryByTestId('admin-promo-form-modal')).toBeNull();
    expect(screen.getByTestId('admin-promo-breadcrumb')).toHaveTextContent('Thêm mới');
    expect(screen.getByTestId('admin-promo-form-title')).toHaveTextContent('Thêm mới khuyến mãi');
    expect(screen.getByTestId('admin-promo-form')).toHaveAttribute('data-form-mode', 'create');
    expect(screen.getByTestId('admin-promo-code-input')).toBeInTheDocument();
    // Đợt 21: trang KM KHÔNG có nút "Tạo mã ngẫu nhiên" và KHÔNG có toggle
    // "Kích hoạt ngay sau khi tạo" (tạo mới mặc định Nháp).
    expect(screen.queryByTestId('admin-promo-generate-code-btn')).toBeNull();
    expect(screen.queryByTestId('admin-promo-status-toggle')).toBeNull();
    // Đợt 24/26: trang tạo KM không còn dòng trạng thái (mới tạo mặc định Nháp
    // ở BE, không hiện toggle/text trạng thái trên form full page).
    expect(screen.queryByTestId('admin-promo-status-text')).toBeNull();
    // Danh sách đã bị thay bằng trang form (không còn trong DOM).
    expect(screen.queryByText('Chưa có khuyến mãi nào')).toBeNull();
    expect(screen.queryByTestId('admin-form-back-btn')).toBeNull();

    // Hủy khi chưa sửa → về thẳng danh sách KM.
    fireEvent.click(screen.getByTestId('admin-promo-cancel-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('promotions-add-btn')).toBeInTheDocument();
    });
    expect(screen.getByText('Chưa có khuyến mãi nào')).toBeInTheDocument();
  });

  it('Hội viên: form điều chỉnh điểm VẪN inline (không modal); bảng 4 hạng không phân trang', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/membership/config')) return mkTiers();
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-membership')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-membership'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-adjust-points-form')).toBeInTheDocument();
    });
    const form = screen.getByTestId('admin-adjust-points-form');
    expect(form.closest('.sa-modal')).toBeNull();
    expect(form.closest('.sa-modal-overlay')).toBeNull();
    expect(screen.getByTestId('admin-adjust-user-input')).toBeInTheDocument();
    expect(screen.getByTestId('admin-adjust-points-input')).toBeInTheDocument();
    // Bảng hạng chỉ 4 dòng nên không có phân trang; toolbar vẫn có Đặt lại/Làm mới.
    expect(screen.getByText('Thường (Member)')).toBeInTheDocument();
    expect(screen.getByText('Kim cương (Diamond)')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-members-pagination')).toBeNull();
    expect(screen.queryByTestId('admin-membership-pagination')).toBeNull();
    expect(screen.getByTestId('admin-members-reset-btn')).toBeInTheDocument();
    expect(screen.getByTestId('admin-members-refresh-btn')).toBeInTheDocument();
  });

  it('Tổng quan: không có toolbar chuẩn, không có phân trang', async () => {
    mockFetchFor({
      status: 200,
      body: { success: true, data: adminProfile },
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-dashboard')).toBeInTheDocument();
    });
    expect(document.querySelector('.sa-toolbar')).toBeNull();
    expect(screen.queryByTestId('admin-orders-pagination')).toBeNull();
    expect(screen.queryByTestId('admin-products-pagination')).toBeNull();
    expect(screen.queryByTestId('admin-orders-reset-btn')).toBeNull();
    expect(screen.queryByTestId('admin-orders-refresh-btn')).toBeNull();
  });

  it('Trả hàng (đợt 18 + đợt 21): PageToolbar Đặt lại (không nút Tìm — tìm tự động) + phân trang riêng bảng trả hàng', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/returns')) return mkReturns(12);
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-returns')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-returns'));
    await waitFor(() => {
      expect(screen.getByText('SP trả 01')).toBeInTheDocument();
    });
    expect(screen.getByTestId('returns-search-input')).toBeInTheDocument();
    // Đợt 21: tìm/lọc TỰ ĐỘNG (debounce 300ms) nên KHÔNG còn nút icon Tìm;
    // nút Đặt lại đợt 24/26 chỉ còn icon RotateCcw.
    expect(screen.queryByTestId('returns-search-btn')).toBeNull();
    const returnsResetBtn = screen.getByTestId('returns-reset-btn');
    expect(returnsResetBtn).toHaveTextContent('');
    expect(returnsResetBtn).toHaveAttribute('aria-label', 'Đặt lại bộ lọc');
    expect(screen.queryByTestId('returns-refresh-btn')).toBeNull();
    expect(screen.queryByRole('button', { name: /Export/ })).toBeNull();
    // Trang Trả hàng không còn chứa bảng nhật ký nữa.
    expect(screen.queryByTestId('admin-returns-audit-pagination')).toBeNull();
    const returnsPaging = screen.getByTestId('admin-returns-pagination');
    expect(within(returnsPaging).getByText('Hiển thị 1–10 / 12 kết quả')).toBeInTheDocument();
    expect(screen.getByTestId('admin-returns-pagination-range')).toHaveTextContent('Trang 1 / 2');
    expect(screen.queryByText('SP trả 11')).toBeNull();

    fireEvent.click(screen.getByTestId('admin-returns-pagination-next'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-returns-pagination-range')).toHaveTextContent('Trang 2 / 2');
    });
    expect(screen.getByText('SP trả 11')).toBeInTheDocument();
  });

  it('Nhật ký hệ thống (đợt 18 + đợt 24/26): PageToolbar Đặt lại (chỉ icon, không nút Tìm) + phân trang riêng bảng nhật ký', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/audit-log')) return mkAudit(12);
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-logs')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-logs'));
    await waitFor(() => {
      expect(screen.getByText('Cập nhật đơn DH-2000')).toBeInTheDocument();
    });
    expect(screen.getByTestId('logs-search-input')).toBeInTheDocument();
    // Đợt 24/26: KHÔNG còn nút Tìm (lọc tự động); nút Đặt lại chỉ còn icon.
    expect(screen.queryByTestId('logs-search-btn')).toBeNull();
    const logsResetBtn = screen.getByTestId('logs-reset-btn');
    expect(logsResetBtn).toHaveTextContent('');
    expect(logsResetBtn).toHaveAttribute('aria-label', 'Đặt lại bộ lọc');
    expect(screen.queryByTestId('logs-refresh-btn')).toBeNull();
    expect(screen.queryByRole('button', { name: /Export/ })).toBeNull();
    // Trang Nhật ký không còn chứa bảng trả hàng nữa.
    expect(screen.queryByTestId('admin-returns-pagination')).toBeNull();
    const auditPaging = screen.getByTestId('admin-returns-audit-pagination');
    expect(within(auditPaging).getByText('Hiển thị 1–10 / 12 kết quả')).toBeInTheDocument();
    expect(screen.getByTestId('admin-returns-audit-pagination-range')).toHaveTextContent('Trang 1 / 2');
    expect(screen.queryByText('Cập nhật đơn DH-2010')).toBeNull();

    fireEvent.click(screen.getByTestId('admin-returns-audit-pagination-next'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-returns-audit-pagination-range')).toHaveTextContent('Trang 2 / 2');
    });
    expect(screen.getByText('Cập nhật đơn DH-2010')).toBeInTheDocument();
  });


  it('Khách hàng (đợt 18 + đợt 21): bảng có cột Điểm; TRANG XEM full page không còn số dư điểm chi tiết/đơn gần đây', async () => {
    const customers = [
      { id: 'u1', code: 'KH-001', email: 'lan@example.com', fullName: 'Lan Anh', phoneNumber: '0912345678', role: 'Customer', isLocked: false, membershipTier: 'Gold', totalSpent12m: 6000000, orderCount: 3, availablePoints: 250, createdAt: '2026-11-01T10:00:00Z', lastLoginAt: '2026-11-08T10:00:00Z' },
      { id: 'u2', code: 'KH-002', email: 'minh@example.com', fullName: 'Minh Quân', phoneNumber: null, role: 'Customer', isLocked: false, membershipTier: 'Member', totalSpent12m: 0, orderCount: 0, availablePoints: 0, createdAt: '2026-11-02T10:00:00Z', lastLoginAt: null },
    ];
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/customers')) return customers;
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-customers')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-customers'));
    await waitFor(() => {
      expect(screen.getByText('Lan Anh')).toBeInTheDocument();
    });
    // Cột "Điểm" nằm sau "Chi tiêu 12 tháng", hiển thị số dư từng khách.
    expect(screen.getByText('Điểm')).toBeInTheDocument();
    expect(screen.getByTestId('admin-customer-points-u1')).toHaveTextContent('250');
    expect(screen.getByTestId('admin-customer-points-u2')).toHaveTextContent('0');

    // Mở TRANG XEM khách (đợt 21): không còn modal chi tiết cũ (admin-customer-detail đã bỏ),
    // không còn khối số dư điểm chi tiết / đơn gần đây trong form (điểm vẫn ở cột Điểm).
    fireEvent.click(screen.getByLabelText('Xem khách hàng Lan Anh'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-customer-detail-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('admin-customer-form-page')).toBeNull();
    expect(screen.queryByTestId('admin-customer-detail')).toBeNull();
    expect(screen.queryByTestId('admin-customer-detail-points')).toBeNull();
    const form = screen.getByTestId('admin-customer-form');
    expect(form).toHaveAttribute('data-form-mode', 'view');
    expect(screen.getByTestId('admin-customer-name-input')).toHaveAttribute('readonly');
    expect(screen.getByTestId('admin-customer-name-input')).toHaveValue('Lan Anh');
    expect(screen.getByTestId('admin-customer-email-input')).toHaveValue('lan@example.com');
    expect(screen.queryByText(/đơn gần đây/i)).toBeNull();
    // Footer view ở header sticky của trang ([Đóng] + [Chỉnh sửa]), không còn .fs-foot.
    const footerBtns = within(screen.getByTestId('admin-customer-detail-page')).getAllByRole('button')
      .filter(b => b.closest('.sa-promo-page-head-actions'));
    // Đợt 25/26: header sticky có thêm nút [← Quay lại] đầu tiên.
    expect(footerBtns).toHaveLength(3);
    expect(screen.getByTestId('admin-customer-form-back-btn')).toHaveTextContent('Quay lại');
    expect(screen.getByTestId('admin-customer-cancel-btn')).toHaveTextContent('Đóng');
    expect(screen.getByTestId('admin-customer-edit-btn')).toHaveTextContent('Chỉnh sửa');
    // Bấm [Chỉnh sửa] sang TRANG edit giữ dữ liệu, Mã KH + Email vẫn disable.
    fireEvent.click(screen.getByTestId('admin-customer-edit-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-customer-edit-page')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-customer-form')).toHaveAttribute('data-form-mode', 'edit');
    expect(screen.getByTestId('admin-customer-code-input')).toBeDisabled();
    expect(screen.getByTestId('admin-customer-code-input')).toHaveValue('KH-001');
    expect(screen.getByTestId('admin-customer-email-input')).toBeDisabled();
  });

  it('Nhật ký (đợt 18 + đợt 24/26): lọc theo khoảng ngày (đổi ngày ở toolbar, lọc ngay không cần bấm Tìm) chỉ giữ các dòng trong khoảng', async () => {
    const auditRows = [
      { id: 'a1', actorEmail: 'admin@dafl.vn', action: 'Xóa sản phẩm SP-01', entityType: 'Product', entityId: 'p1', createdAt: '2026-11-01T10:00:00Z' },
      { id: 'a2', actorEmail: 'admin@dafl.vn', action: 'Cập nhật đơn DH-2001', entityType: 'Order', entityId: 'o1', createdAt: '2026-11-05T10:00:00Z' },
      { id: 'a3', actorEmail: 'admin@dafl.vn', action: 'Cập nhật đơn DH-2002', entityType: 'Order', entityId: 'o2', createdAt: '2026-11-08T10:00:00Z' },
      { id: 'a4', actorEmail: 'admin@dafl.vn', action: 'Duyệt trả hàng TH-01', entityType: 'Return', entityId: 'r1', createdAt: '2026-11-10T10:00:00Z' },
    ];
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/audit-log')) return auditRows;
      if (urlStr.includes('/api/admin/returns')) return [];
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-logs')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-logs'));
    await waitFor(() => {
      expect(screen.getByText('Xóa sản phẩm SP-01')).toBeInTheDocument();
    });
    // Chưa nhập khoảng ngày: cả 4 dòng đều hiện.
    expect(screen.getByText('Duyệt trả hàng TH-01')).toBeInTheDocument();
    expect(screen.getByTestId('admin-log-date-from')).toBeInTheDocument();
    expect(screen.getByTestId('admin-log-date-to')).toBeInTheDocument();

    // Đợt 24/26: khoảng ngày Từ/Đến áp dụng NGAY khi đổi (không còn nút Tìm).
    expect(screen.queryByTestId('logs-search-btn')).toBeNull();
    expect(screen.queryByTestId('admin-log-filter-btn')).toBeNull();
    fireEvent.change(screen.getByTestId('admin-log-date-from'), { target: { value: '2026-11-05' } });
    fireEvent.change(screen.getByTestId('admin-log-date-to'), { target: { value: '2026-11-08' } });

    await waitFor(() => {
      expect(screen.queryByText('Xóa sản phẩm SP-01')).toBeNull();
    });
    expect(screen.getByText('Cập nhật đơn DH-2001')).toBeInTheDocument();
    expect(screen.getByText('Cập nhật đơn DH-2002')).toBeInTheDocument();
    expect(screen.queryByText('Duyệt trả hàng TH-01')).toBeNull();

    // Đặt lại xóa cả khoảng ngày → cả 4 dòng hiện lại.
    fireEvent.click(screen.getByTestId('logs-reset-btn'));
    await waitFor(() => {
      expect(screen.getByText('Xóa sản phẩm SP-01')).toBeInTheDocument();
    });
    expect(screen.getByText('Duyệt trả hàng TH-01')).toBeInTheDocument();
  });

  // (XÓA đợt 18) Test Export CSV nhật ký đã bỏ: nút Export bị BỎ HẲN khỏi mọi
  // toolbar admin theo quyết định đợt 18 (xem COORDINATOR.md checklist B).

  // ---------- Đợt 13 (mục 4, 5 + voucher Draft): ghi nhận hoàn tiền / sửa-xóa voucher Draft / hộp xác nhận ----------
  const mkPromos = () => [
    { id: 'promo-draft', code: 'SALE10', description: 'Giảm 10%', discountType: 'Percentage', discountValue: 10, minOrderAmount: 0, maxDiscountAmount: null, startDate: null, expiryDate: '2026-12-31T00:00:00Z', maxUses: 100, usedCount: 0, maxUsesPerUser: 1, minTier: null, scopeType: 'All', status: 'Draft' },
    { id: 'promo-active', code: 'SALE20', description: 'Giảm 20%', discountType: 'Percentage', discountValue: 20, minOrderAmount: 100000, maxDiscountAmount: null, startDate: null, expiryDate: '2026-12-31T00:00:00Z', maxUses: 100, usedCount: 5, maxUsesPerUser: 1, minTier: null, scopeType: 'All', status: 'Active' },
  ];

  const fetchCalls = () => (globalThis.fetch as unknown as { mock: { calls: Array<[unknown, { method?: string } | undefined]> } }).mock.calls;
  const calledWith = (urlPart: string, method: string) =>
    fetchCalls().some(([url, init]) => String(url).includes(urlPart) && (init?.method ?? 'GET') === method);
  const callBody = (urlPart: string, method: string) => {
    const call = fetchCalls().find(([url, init]) => String(url).includes(urlPart) && (init?.method ?? 'GET') === method);
    return call ? JSON.parse(String((call as [unknown, { body: string }])[1].body)) : null;
  };

  it('Trả hàng: yêu cầu đã duyệt + chờ hoàn tiền có nút Ghi nhận; xác nhận gọi POST record', async () => {
    const refundRow = {
      id: 'r1', orderId: 'o1', orderDisplayCode: 'DH-2001', productId: 'p1', productName: 'Son kem 3CE',
      quantity: 1, reason: 'Lỗi sản phẩm', status: 'Approved', refundAmount: 250000,
      refundStatus: 'PendingRefund', refundId: 'ref-1', createdAt: '2026-11-08T10:00:00Z',
    };
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/returns')) return [refundRow];
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-returns')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-returns'));
    await waitFor(() => {
      expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-return-record-refund-btn')).toHaveTextContent('Ghi nhận đã hoàn tiền');

    fireEvent.click(screen.getByTestId('admin-return-record-refund-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-refund-record-modal')).toBeInTheDocument();
    });
    const modal = screen.getByTestId('admin-refund-record-modal');
    expect(within(modal).getByText('250.000₫')).toBeInTheDocument();
    // Modal ghi nhận hoàn tiền: footer đúng 2 nút [Hủy] + [Xác nhận đã hoàn tiền].
    fireEvent.change(screen.getByTestId('admin-refund-transaction-input'), { target: { value: 'TX123456' } });
    fireEvent.click(screen.getByTestId('admin-refund-record-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/refunds/ref-1/record', 'POST')).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByText('Đã ghi nhận hoàn tiền.')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('admin-refund-record-modal')).toBeNull();
  });

  it('Trả hàng: chưa có refundId (hoặc chưa duyệt) thì KHÔNG có nút Ghi nhận hoàn tiền', async () => {
    const rows = [
      { id: 'r1', orderId: 'o1', orderDisplayCode: 'DH-2001', productId: 'p1', productName: 'Son kem 3CE', quantity: 1, reason: 'Lỗi sản phẩm', status: 'Approved', refundAmount: 250000, refundStatus: 'PendingRefund', refundId: null, createdAt: '2026-11-08T10:00:00Z' },
      { id: 'r2', orderId: 'o2', orderDisplayCode: 'DH-2002', productId: 'p1', productName: 'Son lì 3CE', quantity: 1, reason: 'Đổi ý', status: 'Pending', createdAt: '2026-11-08T10:00:00Z' },
    ];
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/returns')) return rows;
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-returns')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-returns'));
    await waitFor(() => {
      expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('admin-return-record-refund-btn')).toBeNull();
  });

  it('Khuyến mãi: chỉ voucher Draft có nút Sửa/Xóa; voucher Active không có', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/promotions')) return mkPromos();
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-promotions')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-promotions'));
    await waitFor(() => {
      expect(screen.getByText('SALE10')).toBeInTheDocument();
    });
    expect(screen.getByText('SALE20')).toBeInTheDocument();
    expect(screen.getAllByTestId('admin-promo-edit-btn')).toHaveLength(1);
    expect(screen.getAllByTestId('admin-promo-delete-btn')).toHaveLength(1);
    expect(screen.getByLabelText('Sửa khuyến mãi SALE10')).toBeInTheDocument();
    expect(screen.queryByLabelText('Sửa khuyến mãi SALE20')).toBeNull();
    expect(screen.queryByLabelText('Xóa khuyến mãi SALE20')).toBeNull();
    // Đợt 21: dropdown trạng thái dùng nhãn mới; cột Loại giảm hiện tiếng Việt;
    // Nháp + Đang chạy đều có toggle (Nháp tắt, Đang chạy bật); mọi dòng đều có
    // icon Lượt sử dụng (History); không còn nút chữ "Lượt dùng".
    const statusOptions = Array.from(screen.getByTestId('admin-status-filter').querySelectorAll('option')).map(o => o.textContent);
    expect(statusOptions).toEqual(['Trạng thái', 'Nháp', 'Đang hoạt động', 'Tạm ngưng', 'Đã hết hạn']);
    expect(screen.getAllByText('Phần trăm').length).toBeGreaterThan(0);
    expect(screen.getByTestId('admin-promo-status-switch-promo-draft')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('admin-promo-status-switch-promo-active')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByTestId('admin-promo-usages-btn')).toHaveLength(2);
    expect(screen.queryByText('Lượt dùng')).toBeNull();
  });

  it('Khuyến mãi (đợt 21): Sửa voucher Draft mở TRANG full page (mã bị khóa), đổi mô tả rồi Lưu gọi PUT + toast đúng mẫu', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/promotions')) return mkPromos();
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-promotions')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-promotions'));
    await waitFor(() => {
      expect(screen.getByText('SALE10')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-promo-edit-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-promo-edit-page')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-promo-breadcrumb')).toHaveTextContent('Chỉnh sửa');
    expect(screen.getByTestId('admin-promo-form-title')).toHaveTextContent('Chỉnh sửa khuyến mãi');
    expect(screen.getByTestId('admin-promo-form')).toHaveAttribute('data-form-mode', 'edit');
    expect(screen.getByTestId('admin-promo-code-input')).toBeDisabled();
    // Nút Lưu thay đổi khóa tới khi có thay đổi (dirty) — đổi mô tả rồi mới Lưu được.
    expect(screen.getByTestId('admin-promo-save-btn')).toBeDisabled();
    fireEvent.change(screen.getByTestId('admin-promo-description-input'), { target: { value: 'Giảm 10% cho đơn từ 0đ' } });
    await waitFor(() => {
      expect(screen.getByTestId('admin-promo-save-btn')).not.toBeDisabled();
    });

    fireEvent.click(screen.getByTestId('admin-promo-save-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/promotions/promo-draft', 'PUT')).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đã cập nhật khuyến mãi');
    });
    expect(screen.getByTestId('admin-toast-desc')).toHaveTextContent('Cập nhật khuyến mãi SALE10 thành công.');
  });

  it('Khuyến mãi (đợt 18): Xóa voucher Draft phải qua ConfirmDialog 2 nút; Hủy thì không gọi DELETE, Xác nhận thì gọi', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/promotions')) return mkPromos();
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-promotions')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-promotions'));
    await waitFor(() => {
      expect(screen.getByText('SALE10')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-promo-delete-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    const dialog = screen.getByTestId('confirm-dialog');
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Xóa khuyến mãi?');
    expect(within(dialog).getByText('Xóa khuyến mãi')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Xóa khuyến mãi');
    expect(screen.getByTestId('confirm-dialog-cancel-btn')).toHaveTextContent('Hủy');
    // Popup CHỈ đúng 2 nút ở footer.
    expect(within(dialog).getAllByRole('button')).toHaveLength(2);
    expect(calledWith('/api/admin/promotions/promo-draft', 'DELETE')).toBe(false);

    fireEvent.click(screen.getByTestId('confirm-dialog-cancel-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    expect(calledWith('/api/admin/promotions/promo-draft', 'DELETE')).toBe(false);

    fireEvent.click(screen.getByTestId('admin-promo-delete-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/promotions/promo-draft', 'DELETE')).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đã xóa khuyến mãi');
    });
    expect(screen.getByTestId('admin-toast-desc')).toHaveTextContent('Xóa khuyến mãi SALE10 thành công.');
  });

  it('Khuyến mãi (đợt 21, 22:37): xóa voucher Nháp ĐÃ có lượt dùng → popup chặn A5 [Đóng][Tắt khuyến mãi] → C3 nhập lý do → POST disable + toast statusChanged', async () => {
    const promos = [
      { id: 'promo-used', code: 'SALE50', description: 'Đã dùng 5 lượt', discountType: 'Percentage', discountValue: 50, minOrderAmount: 0, maxDiscountAmount: null, startDate: null, expiryDate: '2026-12-31T00:00:00Z', maxUses: 100, usedCount: 5, maxUsesPerUser: 1, minTier: null, scopeType: 'All', status: 'Draft' },
    ];
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/promotions')) return promos;
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-promotions')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-promotions'));
    await waitFor(() => {
      expect(screen.getByText('SALE50')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-promo-delete-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Không thể xóa khuyến mãi');
    expect(screen.getByTestId('confirm-dialog-cancel-btn')).toHaveTextContent('Đóng');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Tắt khuyến mãi');
    // Nút phải mở popup tắt C3 (vẫn có ô lý do bắt buộc) — C3 chỉ còn dùng ở đây.
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog-reason-input')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Tắt khuyến mãi?');
    fireEvent.change(screen.getByTestId('confirm-dialog-reason-input'), { target: { value: 'Đã có lượt dùng, tắt thay vì xóa' } });
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/promotions/promo-used/disable', 'POST')).toBe(true);
    });
    expect(callBody('/api/admin/promotions/promo-used/disable', 'POST').reason).toBe('Đã có lượt dùng, tắt thay vì xóa');
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đổi trạng thái khuyến mãi thành công!');
    });
    expect(screen.getByTestId('admin-toast-desc')).toHaveTextContent('Khuyến mãi SALE50 đã được cập nhật trạng thái.');
  });

  it('Khuyến mãi (đợt 21): trang Thêm mới — radio card loại giảm; FreeShip không cần giá trị, Lưu gọi POST discountValue=0 + toast đúng mẫu', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/promotions')) return mkPromos();
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-promotions')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-promotions'));
    await waitFor(() => {
      expect(screen.getByText('SALE10')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('promotions-add-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-promo-create-page')).toBeInTheDocument();
    });
    const fixed = screen.getByTestId('admin-promo-discount-type-fixed');
    const percent = screen.getByTestId('admin-promo-discount-type-percent');
    const freeship = screen.getByTestId('admin-promo-discount-type-freeship');
    expect(fixed).toHaveAttribute('role', 'radio');
    expect(percent).toHaveAttribute('aria-checked', 'true');
    expect(freeship).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('admin-promo-value-input')).toBeInTheDocument();
    fireEvent.click(freeship);
    expect(freeship).toHaveAttribute('aria-checked', 'true');
    expect(percent).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByTestId('admin-promo-value-input')).toBeNull();
    // Đợt 24 giai đoạn 1: FreeShip không còn ghi chú dưới ô (đã bỏ text phụ);
    // dải xem trước realtime hiện "Miễn phí vận chuyển cho mọi đơn hàng".
    expect(screen.queryByTestId('admin-promo-value-freeship-note')).toBeNull();
    expect(screen.getByTestId('admin-promo-value-preview')).toHaveTextContent('Miễn phí vận chuyển cho mọi đơn hàng');

    fireEvent.change(screen.getByTestId('admin-promo-code-input'), { target: { value: 'FREESHIP1' } });
    fireEvent.click(screen.getByTestId('admin-promo-save-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/promotions', 'POST')).toBe(true);
    });
    const postCall = fetchCalls().find(([url, init]) => String(url).includes('/api/admin/promotions') && (init?.method ?? 'GET') === 'POST');
    const postBody = JSON.parse((postCall?.[1] as { body?: string } | undefined)?.body ?? '{}');
    expect(postBody.discountType).toBe('FreeShip');
    expect(postBody.discountValue).toBe(0);
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-desc')).toHaveTextContent('Thêm khuyến mãi FREESHIP1 thành công.');
    });
  });

  it('Khuyến mãi (đợt 21): validate trang Thêm mới — trống Mã, % vượt 100, hết hạn ≤ bắt đầu đều lỗi đỏ dưới đúng ô, không gọi POST', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/promotions')) return mkPromos();
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-promotions')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-promotions'));
    await waitFor(() => {
      expect(screen.getByText('SALE10')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('promotions-add-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-promo-create-page')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('admin-promo-value-input'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('admin-promo-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-promo-code-error')).toHaveTextContent('Vui lòng bổ sung thông tin bắt buộc.');
    });
    expect(calledWith('/api/admin/promotions', 'POST')).toBe(false);

    fireEvent.change(screen.getByTestId('admin-promo-code-input'), { target: { value: 'TEST101' } });
    fireEvent.change(screen.getByTestId('admin-promo-value-input'), { target: { value: '101' } });
    fireEvent.click(screen.getByTestId('admin-promo-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-promo-value-error')).toHaveTextContent('Giá trị giảm không hợp lệ (giảm % tối đa 100).');
    });
    expect(calledWith('/api/admin/promotions', 'POST')).toBe(false);

    fireEvent.change(screen.getByTestId('admin-promo-value-input'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('admin-promo-start-input'), { target: { value: '2027-01-10T10:00' } });
    fireEvent.change(screen.getByTestId('admin-promo-expiry-input'), { target: { value: '2027-01-01' } });
    fireEvent.click(screen.getByTestId('admin-promo-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-promo-expiry-error')).toHaveTextContent('Ngày hết hạn phải sau ngày bắt đầu.');
    });
    expect(calledWith('/api/admin/promotions', 'POST')).toBe(false);
  });

  it('Khuyến mãi (đợt 21): bấm mắt mở trang Chi tiết full page (4 card + thống kê) + [Chỉnh sửa] sang trang sửa giữ dữ liệu', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/promotions')) return mkPromos();
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-promotions')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-promotions'));
    await waitFor(() => {
      expect(screen.getByText('SALE10')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Xem chi tiết khuyến mãi SALE10'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-promo-detail-page')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-promo-breadcrumb')).toHaveTextContent('Chi tiết');
    expect(screen.getByTestId('admin-promo-detail-code')).toHaveTextContent('SALE10');
    expect(screen.getByTestId('admin-promo-detail-general')).toBeInTheDocument();
    expect(screen.getByTestId('admin-promo-detail-conditions')).toBeInTheDocument();
    expect(screen.getByTestId('admin-promo-detail-time')).toBeInTheDocument();
    expect(screen.getByTestId('admin-promo-detail-stats')).toBeInTheDocument();
    expect(screen.getByTestId('admin-promo-detail-used-count')).toHaveTextContent('0');
    fireEvent.click(screen.getByTestId('admin-promo-detail-edit-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-promo-edit-page')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-promo-form')).toHaveAttribute('data-form-mode', 'edit');
    expect(screen.getByTestId('admin-promo-code-input')).toBeDisabled();
    expect(screen.getByTestId('admin-promo-description-input')).toHaveValue('Giảm 10%');
  });

  it('Khuyến mãi (đợt 21): bấm icon Lượt sử dụng mở trang riêng — bảng đúng field DTO, 2 cột không có dữ liệu hiện "—", tìm client-side', async () => {
    const usageRows = [
      { id: 'u1', userId: 'user-1', userEmail: 'khach1@example.com', orderId: 'o1', orderDisplayCode: 'DH-1001', discountAmount: 50000, createdAt: '2026-11-09T10:00:00Z' },
      { id: 'u2', userId: 'user-2', userEmail: 'khach2@example.com', orderId: 'o2', orderDisplayCode: 'DH-1002', discountAmount: 100000, createdAt: '2026-11-09T11:00:00Z' },
    ];
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/usage')) return usageRows;
      if (urlStr.includes('/api/admin/promotions')) return mkPromos();
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-promotions')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-promotions'));
    await waitFor(() => {
      expect(screen.getByText('SALE10')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Xem lượt sử dụng khuyến mãi SALE10'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-promo-usages-page')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('khach1@example.com')).toBeInTheDocument();
    });
    expect(screen.getByText('DH-1001')).toBeInTheDocument();
    expect(screen.getByText('50.000₫')).toBeInTheDocument();
    expect(screen.getByTestId('admin-promo-usages-total')).toHaveTextContent('0');
    // 2 dòng × 2 cột không có field ở DTO (Giá trị đơn hàng, Trạng thái) = 4 ô "—".
    expect(within(screen.getByTestId('admin-promo-usages-page')).getAllByText('—')).toHaveLength(4);
    fireEvent.change(screen.getByTestId('admin-promo-usages-search-input'), { target: { value: 'DH-1002' } });
    expect(screen.queryByText('khach1@example.com')).toBeNull();
    expect(screen.getByText('khach2@example.com')).toBeInTheDocument();
  });

  it('Khuyến mãi (đợt 21, 22:37): gạt toggle voucher Nháp → modal CHUNG statusChange → xác nhận gọi POST activate + toast statusChanged (có "!")', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/promotions')) return mkPromos();
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-promotions')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-promotions'));
    await waitFor(() => {
      expect(screen.getByText('SALE10')).toBeInTheDocument();
    });
    const sw = screen.getByTestId('admin-promo-status-switch-promo-draft');
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Xác nhận thay đổi trạng thái?');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('Bạn có chắc chắn muốn thay đổi trạng thái của khuyến mãi SALE10 không?');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Xác nhận');
    // Modal chung: footer đúng 2 nút [Hủy] + [Xác nhận], không ô lý do.
    expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByTestId('confirm-dialog-reason-input')).toBeNull();
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/promotions/promo-draft/activate', 'POST')).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đổi trạng thái khuyến mãi thành công!');
    });
    expect(screen.getByTestId('admin-toast-desc')).toHaveTextContent('Khuyến mãi SALE10 đã được cập nhật trạng thái.');
  });

  it('Khuyến mãi (đợt 21): voucher Hết hạn có toggle DISABLE + badge "Hết hạn", bấm không mở popup', async () => {
    const promos = [
      ...mkPromos(),
      { id: 'promo-exp', code: 'OLD99', description: 'Hết hạn', discountType: 'Fixed', discountValue: 50000, minOrderAmount: 0, maxDiscountAmount: null, startDate: null, expiryDate: '2026-01-01T00:00:00Z', maxUses: null, usedCount: 3, maxUsesPerUser: 1, minTier: null, scopeType: 'All', status: 'Expired' },
    ];
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/promotions')) return promos;
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-promotions')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-promotions'));
    await waitFor(() => {
      expect(screen.getByText('OLD99')).toBeInTheDocument();
    });
    const sw = screen.getByTestId('admin-promo-status-switch-promo-exp');
    expect(sw).toBeDisabled();
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(calledWith('/api/admin/promotions/promo-exp/activate', 'POST')).toBe(false);
  });

  it('Hộp xác nhận (đợt 18): Xóa sản phẩm chỉ mở ConfirmDialog 2 nút, chưa gọi DELETE; xác nhận mới gọi', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/products') || urlStr.includes('/api/admin/products')) return mkProducts(1);
      if (urlStr.includes('/api/admin/categories')) return mkCategories(1);
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-products')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-products'));
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm 01')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Xóa sản phẩm Sản phẩm 01'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Xóa sản phẩm?');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('Bạn sắp xóa sản phẩm Sản phẩm 01');
    expect(screen.getByTestId('confirm-dialog')).toHaveTextContent('Hành động này không thể hoàn tác.');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Xóa sản phẩm');
    expect(screen.getByTestId('confirm-dialog-cancel-btn')).toHaveTextContent('Hủy');
    expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(2);
    expect(calledWith('/api/admin/products/p1', 'DELETE')).toBe(false);

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/products/p1', 'DELETE')).toBe(true);
    });
  });

  it('Hộp xác nhận (đợt 18): Xóa danh mục (đã Ngừng hoạt động) phải xác nhận trước khi gọi DELETE', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/categories')) return mkCategories(1).map(c => ({ ...c, isActive: false }));
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-categories')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-categories'));
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
    expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(2);
    expect(calledWith('/api/admin/categories/c1', 'DELETE')).toBe(false);

    fireEvent.click(screen.getByTestId('confirm-dialog-cancel-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    expect(calledWith('/api/admin/categories/c1', 'DELETE')).toBe(false);
  });

  it('Hủy đơn (đợt 21, panel thay popup D1): bắt buộc nhập lý do trong panel; xác nhận mới gọi API hủy', async () => {
    const orderDetail = {
      order: {
        id: 'o1', orderCode: 1001, orderDisplayCode: 'DH-1001', customerName: 'Khách 01',
        customerEmail: 'khach1@example.com', customerPhone: '0900000001', subTotal: 500000,
        totalAmount: 500000, status: 'Pending', createdAt: '2026-11-08T10:00:00Z',
        paymentMethod: 'COD', items: [], statusHistories: [],
      },
    };
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/orders/')) return orderDetail;
      if (urlStr.includes('/api/admin/orders')) return mkOrders(1);
      return undefined;
    });
    renderAdmin();

    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-orders')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-orders'));
    await waitFor(() => {
      expect(screen.getByText('Khách 01')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-order-row-o1'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-order-cancel-btn')).toBeInTheDocument();
    });
    // Đơn Pending: header trang chi tiết có [Hủy đơn] + [Đổi trạng thái].
    expect(screen.getByTestId('admin-order-cancel-btn')).toHaveTextContent('Hủy đơn');
    expect(screen.getByTestId('admin-order-change-status-btn')).toHaveTextContent('Đổi trạng thái');
    fireEvent.click(screen.getByTestId('admin-order-cancel-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-order-cancel-panel')).toBeInTheDocument();
    });
    // Đợt 21: lý do hủy nhập trong panel (không còn popup D1) — nút trái là
    // [Giữ đơn], xác nhận là [Xác nhận hủy đơn]; KHÔNG mở ConfirmDialog.
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(screen.getByTestId('admin-order-cancel-keep-btn')).toHaveTextContent('Giữ đơn');
    expect(screen.getByTestId('admin-order-cancel-confirm-btn')).toHaveTextContent('Xác nhận hủy đơn');
    expect(calledWith('/api/admin/orders/o1/cancel', 'POST')).toBe(false);

    // Bấm xác nhận khi lý do trống → báo lỗi, không gọi API.
    fireEvent.click(screen.getByTestId('admin-order-cancel-confirm-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-order-cancel-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-order-cancel-error')).toHaveTextContent('Vui lòng nhập lý do hủy đơn.');
    expect(calledWith('/api/admin/orders/o1/cancel', 'POST')).toBe(false);

    fireEvent.change(screen.getByTestId('admin-order-cancel-reason-input'), { target: { value: 'Khách đổi ý' } });
    fireEvent.click(screen.getByTestId('admin-order-cancel-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/orders/o1/cancel', 'POST')).toBe(true);
    });
    const cancelCall = fetchCalls().find(([url, init]) => String(url).includes('/api/admin/orders/o1/cancel') && (init as { method?: string } | undefined)?.method === 'POST');
    expect(JSON.parse(String((cancelCall as [unknown, { body: string }])[1].body)).reason).toBe('Khách đổi ý');
  });

  // ---------- Đợt redesign form admin + upload ảnh (drawer/modal, dropzone, validate, toast) ----------
  const openProductAddForm = async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/products') || urlStr.includes('/api/admin/products')) return mkProducts(1);
      if (urlStr.includes('/api/admin/categories')) return mkCategories(1);
      return undefined;
    });
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-products')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-products'));
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm 01')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('products-add-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-product-create-page')).toBeInTheDocument();
    });
  };

  it('Form Sản phẩm mới (đợt 21): trang full page + autofocus ô mã + dropzone có input file thật + preview + toggle', async () => {
    await openProductAddForm();
    // Trang full page, KHÔNG Drawer: không role dialog, không fs-drawer.
    expect(screen.queryByTestId('admin-product-form-modal')).toBeNull();
    expect(screen.getByTestId('admin-product-form-title')).toHaveTextContent('Thêm mới sản phẩm');
    // Autofocus ô đầu tiên (Mã SP) khi mở.
    await waitFor(() => {
      expect(screen.getByTestId('admin-product-code-input')).toHaveFocus();
    });
    // Dropzone + input file thật (visually-hidden, không display:none).
    const dropzone = screen.getByTestId('admin-product-image-dropzone');
    expect(dropzone).toBeInTheDocument();
    const fileInput = screen.getByTestId('admin-product-image-input');
    expect(fileInput).toHaveAttribute('type', 'file');
    expect(fileInput).not.toHaveStyle('display: none');
    expect(dropzone).toContainElement(fileInput);
    // Đợt 25/26: KHÔNG còn bộ đếm tên (0/120) hay dán link ảnh; toggle trạng thái
    // hiện "Đang bán"; preview realtime + nút +/- tồn kho vẫn có; dropzone giữ
    // dòng định dạng (ngoại lệ được giữ) + input file thật.
    expect(screen.queryByTestId('admin-product-name-count')).toBeNull();
    expect(screen.getByTestId('admin-product-name-input')).toHaveAttribute('maxLength', '120');
    expect(screen.getByTestId('admin-product-status-toggle')).toHaveTextContent('Đang bán');
    expect(screen.getByTestId('admin-product-preview')).toBeInTheDocument();
    expect(screen.getByTestId('admin-product-stock-minus-btn')).toBeInTheDocument();
    expect(screen.getByTestId('admin-product-stock-plus-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-product-image-link-toggle')).toBeNull();
    expect(screen.queryByTestId('admin-product-image-url-input')).toBeNull();
    expect(screen.getByText('PNG, JPG, WEBP – tối đa 5MB – tối đa 8 ảnh')).toBeInTheDocument();
  });

  it('Form Sản phẩm: Lưu khi trống hiện lỗi từng ô (tên/giá/danh mục), không gọi POST, form vẫn mở', async () => {
    // Không có danh mục nào -> nút Thêm để trống categoryId, lỗi danh mục mới hiện.
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/products') || urlStr.includes('/api/admin/products')) return mkProducts(1);
      if (urlStr.includes('/api/admin/categories')) return [];
      return undefined;
    });
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-products')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-products'));
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm 01')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('products-add-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-product-create-page')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-product-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-product-name-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-product-name-error')).toHaveTextContent('Vui lòng bổ sung thông tin bắt buộc.');
    expect(screen.getByTestId('admin-product-price-error')).toBeInTheDocument();
    expect(screen.getByTestId('admin-product-category-error')).toBeInTheDocument();
    expect(screen.getByTestId('admin-product-create-page')).toBeInTheDocument();
    expect(calledWith('/api/admin/products', 'POST')).toBe(false);
  });

  it('Form Sản phẩm (đợt 25/26): gõ giá bán + giá gốc tự hiện chip "-20%" + tiền định dạng dấu chấm + +/- tồn kho + nhãn trạng thái kho', async () => {
    await openProductAddForm();
    fireEvent.change(screen.getByTestId('admin-product-price-input'), { target: { value: '200000' } });
    fireEvent.change(screen.getByTestId('admin-product-original-price-input'), { target: { value: '250000' } });
    await waitFor(() => {
      expect(screen.getByTestId('admin-product-discount-badge')).toHaveTextContent('-20%');
    });
    expect(screen.getByTestId('admin-product-price-input')).toHaveValue('200.000');
    expect(screen.getByTestId('admin-product-original-price-input')).toHaveValue('250.000');
    fireEvent.change(screen.getByTestId('admin-product-name-input'), { target: { value: 'Son kem' } });
    expect(screen.queryByTestId('admin-product-name-count')).toBeNull();
    expect(screen.getByTestId('admin-product-preview')).toHaveTextContent('Son kem');
    // Nhãn trạng thái kho (đợt 25): chưa nhập thì chưa hiện; 1 → Sắp hết hàng; 0 → Hết hàng.
    expect(screen.queryByTestId('admin-product-stock-status')).toBeNull();
    fireEvent.click(screen.getByTestId('admin-product-stock-plus-btn'));
    expect(screen.getByTestId('admin-product-stock-input')).toHaveValue('1');
    expect(screen.getByTestId('admin-product-stock-status')).toHaveTextContent('Sắp hết hàng');
    fireEvent.click(screen.getByTestId('admin-product-stock-minus-btn'));
    expect(screen.getByTestId('admin-product-stock-input')).toHaveValue('0');
    expect(screen.getByTestId('admin-product-stock-status')).toHaveTextContent('Hết hàng');
    fireEvent.click(screen.getByTestId('admin-product-stock-minus-btn'));
    expect(screen.getByTestId('admin-product-stock-input')).toHaveValue('0');
  });

  it('Form Sản phẩm: Lưu hợp lệ gọi POST kèm imageUrls + toast thành công + đóng form', async () => {
    await openProductAddForm();
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
      expect(calledWith('/api/admin/products', 'POST')).toBe(true);
    });
    const postCall = fetchCalls().find(([url, init]) => String(url).includes('/api/admin/products') && (init as { method?: string } | undefined)?.method === 'POST');
    expect(postCall).toBeDefined();
    const body = JSON.parse(String((postCall as [unknown, { body: string }])[1].body));
    expect(body.name).toBe('Son kem mới');
    expect(body.price).toBe(250000);
    expect(body.stock).toBe(5);
    expect(body.imageUrls).toEqual([]);
    expect(body.imageUrl).toBe('');
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đã lưu sản phẩm');
      expect(screen.getByTestId('admin-toast-desc')).toHaveTextContent('Sản phẩm đã được lưu.');
    });
    // Lưu xong về danh sách SP (không còn trang form trong DOM).
    await waitFor(() => {
      expect(screen.getByTestId('products-add-btn')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('admin-product-form')).toBeNull();
  });

  it('Form Sản phẩm (đợt 21 + đợt 25/26): đã sửa mà bấm Hủy thì hỏi "Hủy các thay đổi?" — [Ở lại] + [Rời trang], đúng 2 nút', async () => {
    await openProductAddForm();
    fireEvent.change(screen.getByTestId('admin-product-name-input'), { target: { value: 'Son mới' } });
    fireEvent.click(screen.getByTestId('admin-product-cancel-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Hủy các thay đổi?');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('Các thay đổi bạn vừa nhập sẽ bị mất.');
    expect(screen.getByTestId('confirm-dialog-cancel-btn')).toHaveTextContent('Ở lại');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Rời trang');
    expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    expect(screen.getByTestId('admin-product-create-page')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('admin-product-cancel-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('admin-product-form')).toBeNull();
    });
    // Thoát form thì về danh sách SP.
    expect(screen.getByTestId('products-add-btn')).toBeInTheDocument();
  });

  it('Form Sản phẩm: bấm ESC khi chưa sửa thì đóng luôn, không hỏi', async () => {
    await openProductAddForm();
    fireEvent.keyDown(screen.getByTestId('admin-product-name-input'), { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('admin-product-form')).toBeNull();
    });
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(screen.getByTestId('products-add-btn')).toBeInTheDocument();
  });

  it('Form Sản phẩm (đợt 25/26): KHÔNG còn dán link ảnh — chỉ upload file qua dropzone (input file thật + dòng định dạng)', async () => {
    await openProductAddForm();
    const dropzone = screen.getByTestId('admin-product-image-dropzone');
    expect(dropzone).toBeInTheDocument();
    expect(screen.queryByTestId('admin-product-image-link-toggle')).toBeNull();
    expect(screen.queryByTestId('admin-product-image-url-input')).toBeNull();
    // Input file thật (visually-hidden, không display:none) + dòng định dạng (ngoại lệ được giữ).
    const fileInput = screen.getByTestId('admin-product-image-input');
    expect(fileInput).toHaveAttribute('type', 'file');
    expect(fileInput).not.toHaveStyle('display: none');
    expect(dropzone).toContainElement(fileInput);
    expect(screen.getByText('PNG, JPG, WEBP – tối đa 5MB – tối đa 8 ảnh')).toBeInTheDocument();
    // Chưa chọn file thì chưa có thumbnail nào (đặt ảnh chính / đổi thứ tự /
    // xóa ảnh kiểm chứng bằng Selenium với upload thật — xem AdminProductImageTest).
    expect(screen.queryByTestId('admin-product-image-thumb-0')).toBeNull();
  });

  it('Form Danh mục (đợt 25/26): slug tự sinh từ tên, sửa tay slug thì dừng tự sinh; lưu gọi POST kèm slug, iconUrl rỗng (đã bỏ dán link icon)', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/categories')) return mkCategories(1);
      return undefined;
    });
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-categories')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-categories'));
    await waitFor(() => {
      expect(screen.getByText('Danh mục 01')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('categories-add-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-category-create-page')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('admin-category-name-input'), { target: { value: 'Son Môi Mới' } });
    expect(screen.getByTestId('admin-category-slug-input')).toHaveValue('son-moi-moi');
    fireEvent.change(screen.getByTestId('admin-category-slug-input'), { target: { value: 'son-moi-rieng' } });
    fireEvent.change(screen.getByTestId('admin-category-name-input'), { target: { value: 'Son Môi Khác' } });
    expect(screen.getByTestId('admin-category-slug-input')).toHaveValue('son-moi-rieng');
    // Đợt 25/26: KHÔNG còn dán link icon (chỉ upload file qua dropzone).
    expect(screen.queryByTestId('admin-category-image-link-toggle')).toBeNull();
    expect(screen.queryByTestId('admin-category-image-url-input')).toBeNull();
    expect(screen.getByTestId('admin-category-image-dropzone')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('admin-category-save-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/categories', 'POST')).toBe(true);
    });
    const postCall = fetchCalls().find(([url, init]) => String(url).includes('/api/admin/categories') && (init as { method?: string } | undefined)?.method === 'POST');
    expect(postCall).toBeDefined();
    const body = JSON.parse(String((postCall as [unknown, { body: string }])[1].body));
    expect(body.slug).toBe('son-moi-rieng');
    // saveCategory map iconUrl rỗng → null (AdminPage.tsx: iconUrl || null).
    expect(body.iconUrl).toBeNull();
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đã thêm danh mục');
      expect(screen.getByTestId('admin-toast-desc')).toHaveTextContent("Danh mục 'Son Môi Khác' đã được tạo.");
    });
  });

  // ---------- Đợt 21 — toggle DM dùng modal xác nhận CHUNG + toast "!" ----------
  it('Danh mục (đợt 21): gạt Switch → modal xác nhận CHUNG (không còn popup C6/C7) + toast "Đổi trạng thái danh mục thành công!"', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/categories')) return mkCategories(1);
      return undefined;
    });
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-categories')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-categories'));
    await waitFor(() => {
      expect(screen.getByText('Danh mục 01')).toBeInTheDocument();
    });

    // Hủy trong modal chung → không gọi PUT.
    fireEvent.click(screen.getByTestId('admin-category-status-switch-c1'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Xác nhận thay đổi trạng thái?');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('danh mục');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('Danh mục 01');
    // Không còn nội dung popup C6/C7 cũ ("Ẩn danh mục?"/"Hiển thị danh mục?").
    expect(screen.queryByText(/Ẩn danh mục\?/)).toBeNull();
    expect(screen.queryByText(/Hiển thị danh mục\?/)).toBeNull();
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Xác nhận');
    expect(screen.getByTestId('confirm-dialog-cancel-btn')).toHaveTextContent('Hủy');
    expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(2);
    expect(calledWith('/api/admin/categories/c1', 'PUT')).toBe(false);
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    expect(calledWith('/api/admin/categories/c1', 'PUT')).toBe(false);

    // Xác nhận → PUT isActive=false + toast có "!" + ghi tên DM.
    fireEvent.click(screen.getByTestId('admin-category-status-switch-c1'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/categories/c1', 'PUT')).toBe(true);
    });
    const putCall = fetchCalls().find(([url, init]) => String(url).includes('/api/admin/categories/c1') && (init as { method?: string } | undefined)?.method === 'PUT');
    expect(JSON.parse(String((putCall as [unknown, { body: string }])[1].body)).isActive).toBe(false);
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đổi trạng thái danh mục thành công!');
      expect(screen.getByTestId('admin-toast-desc')).toHaveTextContent("Danh mục 'Danh mục 01' đã được cập nhật trạng thái.");
    });
  });

  it('Danh mục (đợt 21 + đợt 24/26): tìm TỰ ĐỘNG debounce 300ms, tìm không dấu + số kết quả + empty state + nút Đặt lại (chỉ icon)', async () => {
    const cats = [
      { id: 'c1', name: 'Son môi', slug: 'son-moi', description: '', isActive: true, sortOrder: 1, productCount: 2 },
      { id: 'c2', name: 'Kem dưỡng', slug: 'kem-duong', description: '', isActive: true, sortOrder: 2, productCount: 1 },
    ];
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/categories')) return cats;
      return undefined;
    });
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-categories')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-categories'));
    await waitFor(() => {
      expect(screen.getByText('Son môi')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-categories-result-count')).toHaveTextContent('2 / 2 danh mục');
    // Nút icon Tìm đã bỏ (tìm tự động); nút Đặt lại đợt 24/26 chỉ còn icon, disable khi chưa lọc.
    expect(screen.queryByTestId('categories-search-btn')).toBeNull();
    const catResetBtn = screen.getByTestId('categories-reset-btn');
    expect(catResetBtn).toHaveTextContent('');
    expect(catResetBtn).toHaveAttribute('aria-label', 'Đặt lại bộ lọc');
    expect(catResetBtn).toBeDisabled();

    // Gõ "son moi" (không dấu) → chưa đủ 300ms thì bảng chưa đổi.
    fireEvent.change(screen.getByTestId('categories-search-input'), { target: { value: 'son moi' } });
    expect(screen.getByText('Kem dưỡng')).toBeInTheDocument();
    // Sau debounce → chỉ còn "Son môi", đếm 1 / 2.
    await waitFor(() => {
      expect(screen.queryByText('Kem dưỡng')).toBeNull();
    });
    expect(screen.getByText('Son môi')).toBeInTheDocument();
    expect(screen.getByTestId('admin-categories-result-count')).toHaveTextContent('1 / 2 danh mục');

    // Gõ từ không khớp → empty state + nút Xóa bộ lọc.
    fireEvent.change(screen.getByTestId('categories-search-input'), { target: { value: 'zzz-khong-co' } });
    await waitFor(() => {
      expect(screen.getByText('Không tìm thấy danh mục')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-categories-clear-filters-btn')).toBeInTheDocument();
    // Bấm Đặt lại → cả 2 dòng hiện lại.
    fireEvent.click(screen.getByTestId('categories-reset-btn'));
    await waitFor(() => {
      expect(screen.getByText('Kem dưỡng')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-categories-result-count')).toHaveTextContent('2 / 2 danh mục');
  });

  it('Trả hàng (đợt 21): bấm dòng mở TRANG CHI TIẾT full page; Duyệt qua panel inline (không modal) → POST resolve + toast', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/returns')) return mkReturns(1);
      return undefined;
    });
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-returns')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-returns'));
    await waitFor(() => {
      expect(screen.getByText('SP trả 01')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-return-row-r1'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-return-detail-page')).toBeInTheDocument();
    });
    // Không còn Drawer chi tiết trả hàng; nút Duyệt/Từ chối ở ĐẦU trang.
    expect(screen.queryByTestId('admin-return-detail')).toBeNull();
    expect(screen.getByTestId('admin-entity-breadcrumb')).toHaveTextContent('Trả hàng');
    expect(screen.getByTestId('admin-entity-breadcrumb')).toHaveTextContent('DH-2000');
    expect(screen.getByTestId('admin-return-approve-btn')).toHaveTextContent('Duyệt');
    expect(screen.getByTestId('admin-return-reject-btn')).toHaveTextContent('Từ chối');
    // Bấm Duyệt → panel xác nhận inline (KHÔNG ConfirmDialog).
    fireEvent.click(screen.getByTestId('admin-return-approve-btn'));
    expect(screen.getByTestId('admin-return-approve-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    fireEvent.click(screen.getByTestId('admin-return-approve-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/returns/r1/resolve', 'POST')).toBe(true);
    });
    const postCall = fetchCalls().find(([url, init]) => String(url).includes('/api/admin/returns/r1/resolve') && (init as { method?: string } | undefined)?.method === 'POST');
    expect(JSON.parse(String((postCall as [unknown, { body: string }])[1].body)).approve).toBe(true);
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đã duyệt yêu cầu trả hàng');
    });
  });

  it('Trả hàng (đợt 21): Từ chối qua panel inline — lý do trống thì báo lỗi, nhập lý do mới POST resolve approve=false', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/returns')) return mkReturns(1);
      return undefined;
    });
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-returns')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-returns'));
    await waitFor(() => {
      expect(screen.getByText('SP trả 01')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-return-row-r1'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-return-detail-page')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-return-reject-btn'));
    expect(screen.getByTestId('admin-return-reject-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    // Chưa nhập lý do → lỗi, không gọi POST.
    fireEvent.click(screen.getByTestId('admin-return-reject-confirm-btn'));
    expect(screen.getByTestId('admin-return-reject-error')).toHaveTextContent('Vui lòng nhập lý do từ chối.');
    expect(calledWith('/api/admin/returns/r1/resolve', 'POST')).toBe(false);
    // Nhập lý do → POST approve=false + toast.
    fireEvent.change(screen.getByTestId('admin-return-reject-reason-input'), { target: { value: 'Sản phẩm không lỗi' } });
    fireEvent.click(screen.getByTestId('admin-return-reject-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/returns/r1/resolve', 'POST')).toBe(true);
    });
    const postCall = fetchCalls().find(([url, init]) => String(url).includes('/api/admin/returns/r1/resolve') && (init as { method?: string } | undefined)?.method === 'POST');
    expect(JSON.parse(String((postCall as [unknown, { body: string }])[1].body)).approve).toBe(false);
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đã từ chối yêu cầu trả hàng');
    });
  });

  it('Trả hàng (đợt 21): dropdown Trạng thái lọc NGAY (client-side, không cần bấm Tìm) + Đặt lại hiện lại toàn bộ', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/returns')) {
        return [
          { id: 'r1', orderId: 'o1', orderDisplayCode: 'DH-2001', productId: 'p1', productName: 'Son kem 3CE', quantity: 1, reason: 'Lỗi sản phẩm', status: 'Pending', createdAt: '2026-11-08T10:00:00Z' },
          { id: 'r2', orderId: 'o2', orderDisplayCode: 'DH-2002', productId: 'p2', productName: 'Kem dưỡng', quantity: 1, reason: 'Đổi ý', status: 'Approved', refundStatus: 'PendingRefund', refundId: 'rf-1', createdAt: '2026-11-08T10:00:00Z' },
        ];
      }
      return undefined;
    });
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-returns')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-returns'));
    await waitFor(() => {
      expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    });
    expect(screen.getByText('Kem dưỡng')).toBeInTheDocument();
    expect(screen.getByTestId('admin-returns-result-count')).toHaveTextContent('2 / 2 yêu cầu');
    // Chọn "Chờ duyệt" → chỉ còn dòng Pending, KHÔNG cần bấm nút nào.
    fireEvent.change(screen.getByLabelText('Lọc trạng thái trả hàng'), { target: { value: 'Pending' } });
    await waitFor(() => {
      expect(screen.queryByText('Kem dưỡng')).toBeNull();
    });
    expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    expect(screen.getByTestId('admin-returns-result-count')).toHaveTextContent('1 / 2 yêu cầu');
    // Đặt lại → cả 2 dòng hiện lại.
    fireEvent.click(screen.getByTestId('returns-reset-btn'));
    await waitFor(() => {
      expect(screen.getByText('Kem dưỡng')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-returns-result-count')).toHaveTextContent('2 / 2 yêu cầu');
  });

  it('Khách hàng (đợt 21): gõ tìm TỰ ĐỘNG debounce 300ms gọi fetch với search + bảng hiện đúng dòng', async () => {
    const customers = [
      { id: 'u1', code: 'KH-001', email: 'lan@example.com', fullName: 'Lan Anh', phoneNumber: '0912345678', role: 'Customer', isLocked: false, membershipTier: 'Gold', totalSpent12m: 6000000, orderCount: 3, availablePoints: 250, createdAt: '2026-11-01T10:00:00Z', lastLoginAt: '2026-11-08T10:00:00Z' },
      { id: 'u2', code: 'KH-002', email: 'minh@example.com', fullName: 'Minh Quân', phoneNumber: null, role: 'Customer', isLocked: false, membershipTier: 'Member', totalSpent12m: 0, orderCount: 0, availablePoints: 0, createdAt: '2026-11-02T10:00:00Z', lastLoginAt: null },
    ];
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/customers')) {
        // Mô phỏng BE lọc server-side theo search.
        const q = new URL(urlStr, 'http://localhost').searchParams.get('search') ?? '';
        if (!q) return customers;
        return customers.filter(c => c.fullName.toLowerCase().includes(q.toLowerCase()));
      }
      return undefined;
    });
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-customers')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-customers'));
    await waitFor(() => {
      expect(screen.getByText('Lan Anh')).toBeInTheDocument();
    });
    expect(screen.getByText('Minh Quân')).toBeInTheDocument();
    // Nút icon Tìm đã bỏ (tìm tự động).
    expect(screen.queryByTestId('customers-search-btn')).toBeNull();
    fireEvent.change(screen.getByTestId('customers-search-input'), { target: { value: 'Lan' } });
    // Sau debounce 300ms → fetch có search=Lan, bảng chỉ còn Lan Anh.
    await waitFor(() => {
      expect(screen.queryByText('Minh Quân')).toBeNull();
    });
    expect(screen.getByText('Lan Anh')).toBeInTheDocument();
    expect(
      fetchCalls().some(([url]) => String(url).includes('/api/admin/customers') && new URL(String(url), 'http://localhost').searchParams.get('search') === 'Lan'),
    ).toBe(true);
  });

  it('Form Khuyến mãi (đợt 21): trang full page — mã tự viết hoa, KHÔNG nút tạo mã ngẫu nhiên/toggle kích hoạt, radio card % hiện Giảm tối đa + expiry kiểu date', async () => {
    mockFetchAdmin();
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-promotions')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-promotions'));
    await waitFor(() => {
      expect(screen.getByTestId('promotions-add-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('promotions-add-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-promo-create-page')).toBeInTheDocument();
    });
    const codeInput = screen.getByTestId('admin-promo-code-input');
    fireEvent.change(codeInput, { target: { value: 'sale10' } });
    expect(codeInput).toHaveValue('SALE10');
    // Đợt 21: trang thêm mới KHÔNG có nút tạo mã ngẫu nhiên, KHÔNG toggle
    // "Kích hoạt ngay sau khi tạo" (tạo mới mặc định Nháp).
    expect(screen.queryByTestId('admin-promo-generate-code-btn')).toBeNull();
    expect(screen.queryByTestId('admin-promo-status-toggle')).toBeNull();
    // Mặc định loại % → ô Giảm tối đa hiện; chuyển Cố định → ẩn; quay lại % → hiện.
    expect(screen.getByTestId('admin-promo-max-discount-input')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('admin-promo-discount-type-fixed'));
    expect(screen.queryByTestId('admin-promo-max-discount-input')).toBeNull();
    fireEvent.click(screen.getByTestId('admin-promo-discount-type-percent'));
    expect(screen.getByTestId('admin-promo-max-discount-input')).toBeInTheDocument();
    expect(screen.getByTestId('admin-promo-expiry-input')).toHaveAttribute('type', 'date');
    // Lưu khi thiếu giá trị giảm → lỗi, không gọi POST.
    fireEvent.click(screen.getByTestId('admin-promo-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-promo-value-error')).toBeInTheDocument();
    });
    expect(calledWith('/api/admin/promotions', 'POST')).toBe(false);
  });

});
