import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminPage from '../components/admin/AdminPage';

/**
 * Mục "Đánh giá" (đợt 16) — nav thứ 9 của admin.
 * GET /api/admin/evaluations?page=&pageSize=10&search=&rating=
 * DELETE /api/admin/evaluations/{id}
 * Mock fetch mô phỏng đúng BE: lọc server-side theo `search`/`rating`
 * và xóa thật khỏi danh sách để lần fetch lại sau xóa phản ánh đúng.
 */
interface AdminReview {
  id: string; productId: string; productName: string;
  userId: string; userName: string;
  rating: number; comment: string; createdAt: string;
}

const adminProfile = { id: 'admin-1', email: 'admin@dafl.vn', fullName: 'Super Admin', role: 'SuperAdmin' };

const longComment =
  'Son lên màu đẹp, mịn môi, giữ màu cả ngày không khô môi, mùi nhẹ dễ chịu, sẽ mua lại lần sau cho cả bạn bè cùng dùng thử.';
const shortComment = 'Kem bết dính, gây mụn sau 2 ngày dùng.';

const mkReviews = (): AdminReview[] => [
  {
    id: 'rv-1', productId: 'p1', productName: 'Son kem 3CE',
    userId: 'u1', userName: 'Lan Anh', rating: 5, comment: longComment,
    createdAt: '2026-11-08T10:00:00Z',
  },
  {
    id: 'rv-2', productId: 'p2', productName: 'Kem dưỡng ẩm La Roche',
    userId: 'u2', userName: 'Minh Quân', rating: 1, comment: shortComment,
    createdAt: '2026-11-09T10:00:00Z',
  },
];

const respond = (status: number, body: unknown) =>
  Promise.resolve({ status, json: () => Promise.resolve(body) } as unknown as Response);

function mockFetchReviews(initial: AdminReview[]) {
  let current = [...initial];
  globalThis.fetch = vi.fn((url: any, init?: any) => {
    const urlStr = typeof url === 'string' ? url : url.url;
    const method = (init?.method ?? 'GET') as string;
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
    if (urlStr.includes('/api/admin/evaluations/') && method === 'DELETE') {
      const id = urlStr.split('/api/admin/evaluations/')[1].split('?')[0];
      current = current.filter(r => r.id !== id);
      return respond(200, { success: true, message: 'Đã xóa đánh giá.', data: 'Đã xóa đánh giá.' });
    }
    if (urlStr.includes('/api/admin/evaluations')) {
      const q = new URL(urlStr, 'http://localhost').searchParams;
      const search = (q.get('search') ?? '').toLowerCase();
      const rating = q.get('rating');
      let rows = [...current];
      if (rating) rows = rows.filter(r => String(r.rating) === rating);
      if (search) {
        rows = rows.filter(r =>
          [r.productName, r.userName, r.comment].some(v => (v ?? '').toLowerCase().includes(search)),
        );
      }
      return respond(200, { success: true, data: rows });
    }
    return respond(200, { success: true, data: [] });
  });
}

const fetchCalls = () =>
  (globalThis.fetch as unknown as { mock: { calls: Array<[string, RequestInit?]> } }).mock.calls;
const evaluationListCalls = () =>
  fetchCalls().filter(([url]) => String(url).includes('/api/admin/evaluations?'));
const evaluationQuery = (url: string) => new URL(url, 'http://localhost').searchParams;

function renderAdmin() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
        {/* Đợt 21 — route chi tiết đánh giá full page (giữ đồng bộ với App.tsx). */}
        <Route path="/reviews/:id" element={<AdminPage />} />
        <Route path="/login" element={<div data-testid="login-page">Đăng nhập</div>} />
        <Route path="/" element={<div data-testid="home-page">Trang chủ</div>} />
      </Routes>
    </MemoryRouter>
  );
}

async function openReviews() {
  renderAdmin();
  await waitFor(() => {
    expect(screen.getByTestId('admin-nav-reviews')).toBeInTheDocument();
  });
  fireEvent.click(screen.getByTestId('admin-nav-reviews'));
  await waitFor(() => {
    expect(screen.getByTestId('admin-reviews-section')).toBeInTheDocument();
  });
}

describe('AdminPage — Đánh giá (đợt 16)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('Đánh giá: bảng hiện 2 dòng đủ tên SP, tên khách, sao và nội dung cắt ngắn', async () => {
    mockFetchReviews(mkReviews());
    await openReviews();

    await waitFor(() => {
      expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    });
    expect(screen.getByText('Kem dưỡng ẩm La Roche')).toBeInTheDocument();
    expect(screen.getByText('Lan Anh')).toBeInTheDocument();
    expect(screen.getByText('Minh Quân')).toBeInTheDocument();
    // Sao render bằng icon Lucide Star (đợt 18 wave D), không còn chuỗi '★★★★★ (5/5)':
    // mỗi dòng có span aria-label "{n} trên 5 sao" chứa đúng 5 svg.lucide-star,
    // số sao đầy (fill #f59e0b) = rating, còn lại viền xám (fill none), kèm "(n/5)".
    const assertStars = (rating: number) => {
      const span = document.querySelector(`span[aria-label="${rating} trên 5 sao"]`);
      expect(span).not.toBeNull();
      const stars = span!.querySelectorAll('svg.lucide-star');
      expect(stars).toHaveLength(5);
      const filled = Array.from(stars).filter(s => s.getAttribute('fill') === '#f59e0b');
      expect(filled).toHaveLength(rating);
      expect(span!.textContent).toContain(`(${rating}/5)`);
      expect(span!.textContent).not.toContain('★');
    };
    assertStars(5);
    assertStars(1);
    // Nội dung dài (> 80 ký tự) chỉ hiện 80 ký tự đầu + "..." trong bảng.
    expect(screen.getByText(`${longComment.slice(0, 80)}...`)).toBeInTheDocument();
    expect(screen.queryByText(longComment)).toBeNull();
    // Nội dung ngắn hiện nguyên vẹn.
    expect(screen.getByText(shortComment)).toBeInTheDocument();
    // Toolbar chuẩn đợt 18 (PageToolbar): tìm kiếm + lọc sao + Đặt lại.
    // Đợt 21: tìm/lọc TỰ ĐỘNG (debounce 300ms) nên KHÔNG còn nút icon Tìm;
    // nút Đặt lại đợt 24/26 chỉ còn icon RotateCcw. KHÔNG có nút Export /
    // Làm mới / Thêm mới (admin không tạo đánh giá).
    expect(screen.getByTestId('reviews-search-input')).toBeInTheDocument();
    expect(screen.getByTestId('admin-review-rating-filter')).toBeInTheDocument();
    expect(screen.queryByTestId('reviews-search-btn')).toBeNull();
    const reviewsResetBtn = screen.getByTestId('reviews-reset-btn');
    expect(reviewsResetBtn).toHaveTextContent('');
    expect(reviewsResetBtn).toHaveAttribute('aria-label', 'Đặt lại bộ lọc');
    expect(reviewsResetBtn.querySelector('svg.lucide-rotate-ccw')).not.toBeNull();
    expect(screen.queryByTestId('reviews-refresh-btn')).toBeNull();
    expect(screen.queryByTestId('reviews-add-btn')).toBeNull();
    expect(screen.queryByRole('button', { name: /Export/ })).toBeNull();
    expect(document.querySelector('.sa-page-toolbar .sa-page-toolbar-add-btn')).toBeNull();
    expect(screen.getByTestId('admin-reviews-pagination')).toBeInTheDocument();
    expect(screen.getByTestId('admin-reviews-pagination-range')).toHaveTextContent('Trang 1 / 1');
    expect(screen.getByText('Hiển thị 1–2 / 2 kết quả')).toBeInTheDocument();
  });

  it('Đánh giá: lọc 1 sao TỰ ĐỘNG gọi fetch với rating=1 và bảng chỉ hiện đánh giá 1 sao (đợt 21, không cần bấm Tìm)', async () => {
    mockFetchReviews(mkReviews());
    await openReviews();

    await waitFor(() => {
      expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('admin-review-rating-filter'), { target: { value: '1' } });
    expect(screen.getByTestId('admin-review-rating-filter')).toHaveValue('1');
    // Đợt 21: đổi dropdown là tải lại ngay (không bấm nút Tìm).

    await waitFor(() => {
      expect(screen.queryByText('Son kem 3CE')).toBeNull();
    });
    expect(screen.getByText('Kem dưỡng ẩm La Roche')).toBeInTheDocument();
    expect(screen.getByText('Minh Quân')).toBeInTheDocument();
    expect(document.querySelector('span[aria-label="1 trên 5 sao"]')).not.toBeNull();
    expect(document.querySelector('span[aria-label="5 trên 5 sao"]')).toBeNull();
    expect(
      evaluationListCalls().some(([url]) => evaluationQuery(url).get('rating') === '1'),
    ).toBe(true);
  });

  it('Đánh giá: gõ tên SP thì TỰ ĐỘNG gọi fetch với search=<tên SP> và bảng hiện đúng dòng (đợt 21, debounce 300ms, không cần bấm Tìm)', async () => {
    mockFetchReviews(mkReviews());
    await openReviews();

    await waitFor(() => {
      expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('reviews-search-input'), { target: { value: 'Son kem' } });
    // Đợt 21: ngừng gõ 300ms là tải lại (không bấm nút Tìm).

    await waitFor(() => {
      expect(screen.queryByText('Kem dưỡng ẩm La Roche')).toBeNull();
    });
    expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    expect(screen.getByText('Lan Anh')).toBeInTheDocument();
    expect(
      evaluationListCalls().some(([url]) => evaluationQuery(url).get('search') === 'Son kem'),
    ).toBe(true);
  });

  it('Đánh giá (đợt 21, trang riêng): bấm xem mở TRANG CHI TIẾT full page chứa TOÀN BỘ nội dung, tên SP, tên khách, sao; breadcrumb "Đánh giá > ..." dùng dấu ">"', async () => {
    mockFetchReviews(mkReviews());
    await openReviews();

    await waitFor(() => {
      expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Xem đánh giá của Lan Anh'));

    await waitFor(() => {
      expect(screen.getByTestId('admin-review-detail-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('admin-review-detail-modal')).toBeNull();
    const page = within(screen.getByTestId('admin-review-detail-page'));
    expect(page.getByText(longComment)).toBeInTheDocument();
    // Tên SP xuất hiện ở tiêu đề trang + breadcrumb + dòng "Sản phẩm".
    expect(page.getAllByText('Son kem 3CE').length).toBeGreaterThanOrEqual(1);
    expect(page.getByText('Lan Anh')).toBeInTheDocument();
    // Breadcrumb "Đánh giá > Son kem 3CE" (dấu ">" như trang Sản phẩm).
    expect(screen.getByTestId('admin-entity-breadcrumb')).toHaveTextContent('Đánh giá');
    expect(screen.getByTestId('admin-entity-breadcrumb')).toHaveTextContent('Son kem 3CE');
    // Chi tiết đánh giá cũng dùng icon Star Lucide: 5 sao đầy + "(5/5)".
    const detailPage = screen.getByTestId('admin-review-detail-page');
    const detailStars = detailPage.querySelector('.sa-stars');
    expect(detailStars).not.toBeNull();
    expect(detailStars!.querySelectorAll('svg.lucide-star')).toHaveLength(5);
    expect(Array.from(detailStars!.querySelectorAll('svg.lucide-star')).filter(s => s.getAttribute('fill') === '#f59e0b')).toHaveLength(5);
    expect(detailStars!.parentElement!.textContent).toContain('(5/5)');
    expect(detailStars!.parentElement!.textContent).not.toContain('★');
    expect(page.getByTestId('admin-review-delete-btn')).toBeInTheDocument();
    // Bấm dòng cũng mở trang chi tiết: quay lại danh sách rồi bấm dòng.
    fireEvent.click(screen.getByTestId('admin-review-detail-back-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-reviews-section')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-review-row-rv-1'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-review-detail-page')).toBeInTheDocument();
    });
  });

  it('Đánh giá (đợt 18 + đợt 21): xóa trong TRANG CHI TIẾT phải qua ConfirmDialog 2 nút, gọi DELETE rồi về danh sách + toast', async () => {
    mockFetchReviews(mkReviews());
    await openReviews();

    await waitFor(() => {
      expect(screen.getByText('Kem dưỡng ẩm La Roche')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Xem đánh giá của Minh Quân'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-review-detail-page')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-review-delete-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Xóa đánh giá?');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('Bạn sắp xóa đánh giá của Minh Quân cho sản phẩm Kem dưỡng ẩm La Roche');
    expect(screen.getByTestId('confirm-dialog')).toHaveTextContent('Hành động này không thể hoàn tác.');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Xóa đánh giá');
    expect(screen.getByTestId('confirm-dialog-cancel-btn')).toHaveTextContent('Hủy');
    expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(2);
    const calledDelete = () =>
      fetchCalls().some(
        ([url, init]) =>
          String(url).includes('/api/admin/evaluations/rv-2') && (init?.method ?? 'GET') === 'DELETE',
      );
    expect(calledDelete()).toBe(false);

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(calledDelete()).toBe(true);
    });
    // Đợt 21: xóa từ trang chi tiết thì VỀ DANH SÁCH (không còn modal để đóng).
    await waitFor(() => {
      expect(screen.getByTestId('admin-reviews-section')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('admin-review-detail-page')).toBeNull();
    expect(screen.queryByText('Kem dưỡng ẩm La Roche')).toBeNull();
    expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đã xóa đánh giá');
    expect(screen.getByTestId('admin-toast-desc')).toHaveTextContent('Đánh giá của Minh Quân đã được xóa.');
  });

  it('Đánh giá (đợt 18): API trả [] thì hiện EmptyState "Chưa có đánh giá nào", không có bảng/phân trang', async () => {
    mockFetchReviews([]);
    await openReviews();

    await waitFor(() => {
      expect(screen.getByText('Chưa có đánh giá nào')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-reviews-section')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-reviews-pagination')).toBeNull();
    expect(screen.queryByText('Son kem 3CE')).toBeNull();
  });
});
