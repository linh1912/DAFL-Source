import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminPage from '../components/admin/AdminPage';
import { formatDateTimeVN } from '../components/admin/formUtils';

/**
 * Đợt 24 (giai đoạn 2) + đợt 25 + đợt 26 — test MỚI cho những gì worker A/B
 * đổi mà chưa có test: nút Quay lại/sticky bar + dialog dirty-confirm, nút
 * reset chỉ icon, nhãn dropdown mới, ô Mã SP bị khóa, MoneyInput addon ₫/%,
 * chip "-xx%", stepper + nhãn trạng thái kho, dropzone không còn dán link,
 * không còn text phụ dưới ô, khối "Giá trị giảm" KM giai đoạn 1, và kiểm tra
 * tích hợp A↔B (token #166534, sticky-head, var(--sa-*) fallback).
 */

const respond = (status: number, body: unknown) =>
  Promise.resolve({ status, json: () => Promise.resolve(body) } as unknown as Response);

const adminProfile = { id: 'admin-1', email: 'admin@dafl.vn', fullName: 'Super Admin', role: 'SuperAdmin' };

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

function renderAdmin() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/orders/:code" element={<AdminPage />} />
        <Route path="/promotions/new" element={<AdminPage />} />
        <Route path="/promotions/:code/usages" element={<AdminPage />} />
        <Route path="/promotions/:code/edit" element={<AdminPage />} />
        <Route path="/promotions/:code" element={<AdminPage />} />
        <Route path="/products/new" element={<AdminPage />} />
        <Route path="/products/:code/edit" element={<AdminPage />} />
        <Route path="/products/:code" element={<AdminPage />} />
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

const fetchCalls = () => (globalThis.fetch as unknown as { mock: { calls: Array<[unknown, { method?: string } | undefined]> } }).mock.calls;
const calledWith = (urlPart: string, method: string) =>
  fetchCalls().some(([url, init]) => String(url).includes(urlPart) && (init?.method ?? 'GET') === method);

const mkProducts = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`, code: `SP-00${i + 1}`, categoryId: 'c1', categoryName: 'Son môi',
    name: `Sản phẩm ${String(i + 1).padStart(2, '0')}`,
    price: 100000 + i * 1000, originalPrice: 150000, availableStock: 10,
    imageUrl: '', rating: 4.5, reviewCount: 3, isActive: true,
  }));

const mkCategories = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`, name: `Danh mục ${String(i + 1).padStart(2, '0')}`,
    slug: `danh-muc-${i + 1}`, description: `Mô tả ${i + 1}`,
    isActive: true, sortOrder: i + 1, productCount: 0,
  }));

const mkPromos = () => [
  { id: 'promo-draft', code: 'SALE10', description: 'Giảm 10%', discountType: 'Percentage', discountValue: 10, minOrderAmount: 0, maxDiscountAmount: null, startDate: null, expiryDate: '2026-12-31T00:00:00Z', maxUses: 100, usedCount: 0, maxUsesPerUser: 1, minTier: null, scopeType: 'All', status: 'Draft' },
  { id: 'promo-active', code: 'SALE20', description: 'Giảm 20%', discountType: 'Percentage', discountValue: 20, minOrderAmount: 100000, maxDiscountAmount: null, startDate: null, expiryDate: '2026-12-31T00:00:00Z', maxUses: 100, usedCount: 5, maxUsesPerUser: 1, minTier: null, scopeType: 'All', status: 'Active' },
];

const readCss = (name: string) => {
  const candidates = [
    path.resolve(process.cwd(), `src/components/admin/${name}`),
    path.resolve(process.cwd(), `src/Admin/src/components/admin/${name}`),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Không tìm thấy ${name} (cwd=${process.cwd()})`);
  return readFileSync(found, 'utf-8');
};

const openProductCreate = async () => {
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

const openPromoCreate = async () => {
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
};

// ============================================================================
// A. Tích hợp A↔B: token + sticky-head + var(--sa-*) fallback (đọc CSS thật)
// ============================================================================
describe('Admin đợt 26 — tích hợp A↔B (token + sticky-head + fallback)', () => {
  it('design-tokens: --sa-primary #166534; badge 24px không chấm; chip giảm chỉ 1 định nghĩa; promo-value 38px, không 42px', () => {
    const tokens = readCss('design-tokens.css');
    expect(tokens).toContain('--sa-primary: #166534;');
    expect(tokens).toContain('--sa-primary-hover: #14532d;');
    // Badge trạng thái 1 kiểu duy nhất: cao 24px, bo pill, không chấm tròn.
    const badgeRule = tokens.match(/\.spark-admin\s+\.sa-badge\s*\{([^}]*)\}/);
    expect(badgeRule).not.toBeNull();
    expect(badgeRule![1]).toContain('height: 24px');
    expect(badgeRule![1]).toContain('font-size: 12px');
    expect(badgeRule![1]).toContain('font-weight: 600');
    // Không còn .sa-dot ở bất kỳ CSS admin nào.
    const adminDir = path.resolve(process.cwd(), 'src/components/admin');
    const cssFiles = readdirSync(adminDir).filter(f => f.endsWith('.css'));
    for (const f of cssFiles) {
      expect(readFileSync(path.join(adminDir, f), 'utf-8')).not.toContain('.sa-dot');
    }
    // Chip giảm giá: chỉ 1 rule gốc ".sa-discount-badge {" (AdminPage.css);
    // product-form.css chỉ ghi đè font-weight bằng selector gộp.
    const adminCss = readCss('AdminPage.css');
    expect((adminCss.match(/\.sa-discount-badge\s*\{/g) ?? []).length).toBe(1);
    expect(readCss('product-form.css')).toMatch(/\.sa-discount-badge[\s\S]{0,80}font-weight:\s*600/);
    // promo-value.css: khối Giá trị giảm dùng 38px, không còn 42px.
    const pv = readCss('promo-value.css');
    expect(pv).not.toContain('42px');
    expect(pv).toContain('38px');
  });

  it('sticky-head + token fallback: .sa-page-sticky-head có trong AdminPage.css; product-form.css dùng var(--sa-*, fallback) đúng hợp đồng', () => {
    const adminCss = readCss('AdminPage.css');
    const tokens = readCss('design-tokens.css');
    expect(adminCss).toContain('.sa-page-sticky-head');
    const pf = readCss('product-form.css');
    expect(pf).toContain('var(--sa-primary, #166534)');
    expect(pf).toContain('var(--sa-radius-input, 8px)');
    expect(pf).toContain('var(--sa-radius-card, 12px)');
    // Nút chính dùng token (không còn nút đen): nút "+ Thêm mới" nền var(--sa-primary).
    expect(tokens).toContain('background: var(--sa-primary);');
    // Chiều cao chuẩn 38px (nút/bảng 32px), bo 8px/12px, font Inter duy nhất.
    expect(tokens).toContain('--sa-control-height: 38px;');
    expect(tokens).toContain('--sa-control-height-sm: 32px;');
    expect(tokens).toContain("--sa-font: 'Inter', system-ui, sans-serif;");
  });

  it('formatDateTimeVN (unit): dd/mm/yyyy HH:mm, không giây; ngày-only giữ dd/mm/yyyy; rỗng → "—"', () => {
    expect(formatDateTimeVN('2026-11-08')).toBe('08/11/2026');
    expect(formatDateTimeVN('')).toBe('—');
    expect(formatDateTimeVN('2026-11-08T10:00:00Z')).toMatch(/^\d{2}\/11\/2026 \d{2}:00$/);
    expect(formatDateTimeVN('2026-11-08T10:00:00Z')).not.toMatch(/:\d{2}:\d{2}/);
  });
});

// ============================================================================
// B. Nút Quay lại + sticky bar + dialog dirty-confirm
// ============================================================================
describe('Admin đợt 25/26 — nút Quay lại + sticky bar + dirty-confirm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('Form Thêm SP: header sticky chứa [Quay lại, Hủy, Lưu] đúng thứ tự; Quay lại khi chưa sửa về thẳng danh sách', async () => {
    await openProductCreate();
    const head = screen.getByTestId('admin-product-create-page').querySelector('.sa-page-sticky-head');
    expect(head).not.toBeNull();
    const btns = within(head as HTMLElement).getAllByRole('button').map(b => b.textContent?.trim());
    expect(btns).toEqual(['Quay lại', 'Hủy', 'Lưu']);
    expect(screen.getByTestId('admin-product-form-back-btn')).toHaveTextContent('Quay lại');
    fireEvent.click(screen.getByTestId('admin-product-form-back-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('products-add-btn')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('Form Thêm SP: đã sửa mà bấm Quay lại thì hỏi "Hủy các thay đổi?" — [Ở lại] giữ form, [Rời trang] về danh sách', async () => {
    await openProductCreate();
    fireEvent.change(screen.getByTestId('admin-product-name-input'), { target: { value: 'Son mới' } });
    fireEvent.click(screen.getByTestId('admin-product-form-back-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Hủy các thay đổi?');
    expect(screen.getByTestId('confirm-dialog-cancel-btn')).toHaveTextContent('Ở lại');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Rời trang');
    expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
    expect(screen.getByTestId('admin-product-create-page')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('admin-product-form-back-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('products-add-btn')).toBeInTheDocument();
    });
  });

  // LƯU Ý (worker C, 2026-11-11): test này FAIL cho tới khi sửa BUG trong
  // requestDiscardConfirm (AdminForms.tsx): bấm [Ở lại] trong 300ms đầu thì
  // hàm vẫn gọi onRequestClose(true) sau 300ms → cha mở lại dialog "Hủy các
  // thay đổi?" lần 2 và để lại dialog tồn đọng (đã repro riêng: sau 500ms
  // dialog vẫn mở). KHÔNG tự sửa implementation — chờ parent quyết.
  it('Form KM + Danh mục: nút Quay lại riêng từng form, nằm trong header sticky', async () => {
    await openPromoCreate();
    const promoHead = screen.getByTestId('admin-promo-create-page').querySelector('.sa-page-sticky-head');
    expect(promoHead).not.toBeNull();
    expect(screen.getByTestId('admin-promo-form-back-btn')).toHaveTextContent('Quay lại');
    // Hủy khi chưa sửa → về thẳng danh sách KM, không hỏi.
    expect(screen.getByTestId('admin-promo-cancel-btn')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('admin-promo-cancel-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('promotions-add-btn')).toBeInTheDocument();
    });
    // Dialog (nếu có) phải đóng hẳn — chờ unmount thay vì assert đồng bộ.
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });
  });
});

// ============================================================================
// C. Khối "Giá trị giảm" KM — đợt 24 giai đoạn 1 (chưa có test nào trước đây)
// ============================================================================
describe('Admin đợt 24 giai đoạn 1 — khối Giá trị giảm khuyến mãi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('Mặc định loại Phần trăm: chưa nhập thì dải xem trước muted "Nhập mức giảm để xem trước"', async () => {
    await openPromoCreate();
    expect(screen.getByTestId('admin-promo-discount-type-percent')).toHaveAttribute('aria-checked', 'true');
    const preview = screen.getByTestId('admin-promo-value-preview');
    expect(preview).toHaveTextContent('Nhập mức giảm để xem trước');
    expect(preview).toHaveClass('pv-preview-muted');
  });

  it('Cố định: nhập 1.000.000 → ô hiện dấu chấm + addon ₫, dải xem trước đổi realtime theo đơn tối thiểu', async () => {
    await openPromoCreate();
    fireEvent.click(screen.getByTestId('admin-promo-discount-type-fixed'));
    expect(screen.getByTestId('admin-promo-discount-type-fixed')).toHaveAttribute('aria-checked', 'true');
    const valueInput = screen.getByTestId('admin-promo-value-input');
    const wrap = valueInput.closest('.sa-money-wrap');
    expect(wrap).not.toBeNull();
    expect(wrap!.querySelector('.sa-money-suffix')).toHaveTextContent('₫');
    fireEvent.change(valueInput, { target: { value: '1000000' } });
    expect(valueInput).toHaveValue('1.000.000');
    expect(screen.getByTestId('admin-promo-value-preview')).toHaveTextContent('Giảm 1.000.000₫ cho mọi đơn hàng');
    fireEvent.change(screen.getByTestId('admin-promo-min-order-input'), { target: { value: '50000' } });
    expect(screen.getByTestId('admin-promo-value-preview')).toHaveTextContent('Giảm 1.000.000₫ cho đơn từ 50.000₫');
  });

  it('Phần trăm: nhập 15 → preview "Giảm 15%"; nhập 150 → preview muted lại; nhập Giảm tối đa 50.000 → preview có "(tối đa 50.000₫)"', async () => {
    await openPromoCreate();
    const valueInput = screen.getByTestId('admin-promo-value-input');
    expect(valueInput.closest('.sa-money-wrap')!.querySelector('.sa-money-suffix')).toHaveTextContent('%');
    fireEvent.change(valueInput, { target: { value: '15' } });
    expect(screen.getByTestId('admin-promo-value-preview')).toHaveTextContent('Giảm 15% cho mọi đơn hàng');
    fireEvent.change(screen.getByTestId('admin-promo-max-discount-input'), { target: { value: '50000' } });
    expect(screen.getByTestId('admin-promo-value-preview')).toHaveTextContent('Giảm 15% (tối đa 50.000₫) cho mọi đơn hàng');
    fireEvent.change(valueInput, { target: { value: '150' } });
    expect(screen.getByTestId('admin-promo-value-preview')).toHaveTextContent('Nhập mức giảm để xem trước');
  });

  it('FreeShip: không ô giá trị, preview "Miễn phí vận chuyển…"; chọn bằng phím ArrowRight từ Phần trăm', async () => {
    await openPromoCreate();
    const percent = screen.getByTestId('admin-promo-discount-type-percent');
    fireEvent.keyDown(percent, { key: 'ArrowRight' });
    expect(screen.getByTestId('admin-promo-discount-type-freeship')).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(screen.getByTestId('admin-promo-discount-type-freeship'));
    expect(screen.queryByTestId('admin-promo-value-input')).toBeNull();
    expect(screen.getByTestId('admin-promo-value-preview')).toHaveTextContent('Miễn phí vận chuyển cho mọi đơn hàng');
    fireEvent.change(screen.getByTestId('admin-promo-min-order-input'), { target: { value: '299000' } });
    expect(screen.getByTestId('admin-promo-value-preview')).toHaveTextContent('Miễn phí vận chuyển cho đơn từ 299.000₫');
  });

  it('Để trống giá trị rồi Lưu → lỗi đỏ dưới ô, không gọi POST', async () => {
    await openPromoCreate();
    fireEvent.change(screen.getByTestId('admin-promo-code-input'), { target: { value: 'TEST15' } });
    fireEvent.click(screen.getByTestId('admin-promo-save-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-promo-value-error')).toHaveTextContent('Vui lòng bổ sung thông tin bắt buộc.');
    });
    expect(calledWith('/api/admin/promotions', 'POST')).toBe(false);
    expect(screen.getByTestId('admin-promo-create-page')).toBeInTheDocument();
  });
});

// ============================================================================
// D. Form SP đợt 25/26: mã khóa, MoneyInput, stepper, không text phụ
// ============================================================================
describe('Admin đợt 25/26 — form Sản phẩm (mã khóa, tiền, tồn kho, không text phụ)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('Trang Chỉnh sửa: ô Mã SP disabled + icon khóa + tooltip, không còn hint "không thay đổi khi sửa"', async () => {
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
    fireEvent.click(screen.getByLabelText('Sửa sản phẩm Sản phẩm 01'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-product-edit-page')).toBeInTheDocument();
    });
    const codeInput = screen.getByTestId('admin-product-code-input');
    expect(codeInput).toBeDisabled();
    expect(codeInput).toHaveValue('SP-001');
    expect(screen.getByTitle('Mã sản phẩm không thể thay đổi')).toBeInTheDocument();
    expect(screen.getByTitle('Mã sản phẩm không thể thay đổi').querySelector('svg.lucide-lock')).not.toBeNull();
  });

  it('Giá bán: addon ₫ 44px bên phải + dấu chấm nghìn; Giá gốc: chip "-xx%" cạnh label; toggle "Đang bán"/"Đã ẩn"', async () => {
    await openProductCreate();
    const priceInput = screen.getByTestId('admin-product-price-input');
    const priceWrap = priceInput.closest('.sa-money-wrap');
    expect(priceWrap).not.toBeNull();
    expect(priceWrap!.querySelector('.sa-money-suffix')).toHaveTextContent('₫');
    fireEvent.change(priceInput, { target: { value: '250000' } });
    expect(priceInput).toHaveValue('250.000');
    fireEvent.change(screen.getByTestId('admin-product-original-price-input'), { target: { value: '300000' } });
    expect(screen.getByTestId('admin-product-discount-badge')).toHaveTextContent('-17%');
    // Toggle trạng thái: nhãn đổi theo trạng thái, không còn "Hiển thị".
    const toggle = screen.getByTestId('admin-product-status-toggle');
    expect(toggle).toHaveTextContent('Đang bán');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('Đã ẩn');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('Tồn kho: ArrowUp/Down đổi số; nhãn 3 trạng thái theo ngưỡng 10; không text phụ/counter dưới ô nhập', async () => {
    await openProductCreate();
    const stockInput = screen.getByTestId('admin-product-stock-input');
    fireEvent.keyDown(stockInput, { key: 'ArrowUp' });
    expect(stockInput).toHaveValue('1');
    expect(screen.getByTestId('admin-product-stock-status')).toHaveTextContent('Sắp hết hàng');
    fireEvent.change(stockInput, { target: { value: '10' } });
    expect(screen.getByTestId('admin-product-stock-status')).toHaveTextContent('Còn hàng');
    fireEvent.keyDown(stockInput, { key: 'ArrowDown' });
    expect(stockInput).toHaveValue('9');
    expect(screen.getByTestId('admin-product-stock-status')).toHaveTextContent('Sắp hết hàng');
    // Không còn text phụ/counter dưới các ô nhập của form SP.
    const form = screen.getByTestId('admin-product-form');
    expect(within(form).queryByTestId('admin-product-name-count')).toBeNull();
    expect(within(form).queryByTestId('admin-product-description-count')).toBeNull();
    expect(within(form).queryByText(/không thay đổi khi sửa/i)).toBeNull();
    expect(within(form).queryByText(/dán link/i)).toBeNull();
  });
});

// ============================================================================
// E. Reset icon + dropdown mới + empty state (đợt 24/26)
// ============================================================================
describe('Admin đợt 24/26 — reset icon + dropdown + empty state', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('Danh sách SP: dropdown mặc định "Danh mục"/"Trạng thái"; reset icon disable khi chưa lọc, bật khi gõ, bấm thì khôi phục', async () => {
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
    const catFilter = screen.getByLabelText('Lọc danh mục');
    expect(within(catFilter).getByText('Danh mục')).toBeInTheDocument();
    const statusFilter = screen.getByTestId('admin-status-filter');
    expect(within(statusFilter).getByText('Trạng thái')).toBeInTheDocument();
    const resetBtn = screen.getByTestId('products-reset-btn');
    expect(resetBtn).toBeDisabled();
    expect(resetBtn).toHaveAttribute('aria-label', 'Đặt lại bộ lọc');
    fireEvent.change(screen.getByTestId('products-search-input'), { target: { value: 'zzz-khong-co' } });
    await waitFor(() => {
      expect(screen.getByText('Không tìm thấy sản phẩm')).toBeInTheDocument();
    });
    expect(resetBtn).not.toBeDisabled();
    // Empty state có nút "Xóa bộ lọc" riêng.
    expect(screen.getByTestId('admin-products-clear-filters-btn')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('admin-products-clear-filters-btn'));
    await waitFor(() => {
      expect(screen.getByText('Sản phẩm 01')).toBeInTheDocument();
    });
    expect(screen.getByTestId('products-reset-btn')).toBeDisabled();
  });

  it('Đánh giá: dropdown mặc định "Số sao"; Khách hàng: dropdown hạng mặc định "Hạng"', async () => {
    mockFetchAdmin(urlStr => {
      if (urlStr.includes('/api/admin/reviews')) return [];
      if (urlStr.includes('/api/admin/customers')) return [];
      return undefined;
    });
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-reviews')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-nav-reviews'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-review-rating-filter')).toBeInTheDocument();
    });
    expect(within(screen.getByTestId('admin-review-rating-filter')).getByText('Số sao')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('admin-nav-customers'));
    await waitFor(() => {
      expect(screen.getByLabelText('Lọc hạng')).toBeInTheDocument();
    });
    expect(within(screen.getByLabelText('Lọc hạng')).getByText('Hạng')).toBeInTheDocument();
  });

  it('Danh sách KM: gõ từ không khớp → empty state + nút "Xóa bộ lọc" khôi phục', async () => {
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
    fireEvent.change(screen.getByTestId('promotions-search-input'), { target: { value: 'zzz-khong-co' } });
    await waitFor(() => {
      expect(screen.getByText('Không tìm thấy khuyến mãi')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-promos-clear-filters-btn')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('admin-promos-clear-filters-btn'));
    await waitFor(() => {
      expect(screen.getByText('SALE10')).toBeInTheDocument();
    });
  });
});
