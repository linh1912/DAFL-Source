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
    expect(screen.getByText('★★★★★ (5/5)')).toBeInTheDocument();
    expect(screen.getByText('★☆☆☆☆ (1/5)')).toBeInTheDocument();
    // Nội dung dài (> 80 ký tự) chỉ hiện 80 ký tự đầu + "..." trong bảng.
    expect(screen.getByText(`${longComment.slice(0, 80)}...`)).toBeInTheDocument();
    expect(screen.queryByText(longComment)).toBeNull();
    // Nội dung ngắn hiện nguyên vẹn.
    expect(screen.getByText(shortComment)).toBeInTheDocument();
    // Toolbar chuẩn của mục: tìm kiếm + lọc sao + Tìm + Đặt lại + Làm mới + Export.
    expect(screen.getByTestId('admin-review-search')).toBeInTheDocument();
    expect(screen.getByTestId('admin-review-rating-filter')).toBeInTheDocument();
    expect(screen.getByTestId('admin-reviews-search-btn')).toBeInTheDocument();
    expect(screen.getByTestId('admin-reviews-reset-btn')).toBeInTheDocument();
    expect(screen.getByTestId('admin-reviews-refresh-btn')).toBeInTheDocument();
    expect(screen.getByTestId('admin-reviews-export-btn')).toBeInTheDocument();
    // Không có nút Thêm mới: admin không tạo đánh giá (đánh giá là của khách).
    expect(document.querySelector('.sa-toolbar .sa-btn-add')).toBeNull();
    expect(screen.getByTestId('admin-reviews-pagination')).toBeInTheDocument();
    expect(screen.getByText(/Trang 1 \/ 1/)).toBeInTheDocument();
    expect(screen.getByText(/Tổng 2 dòng/)).toBeInTheDocument();
  });

  it('Đánh giá: lọc 1 sao gọi fetch với rating=1 và bảng chỉ hiện đánh giá 1 sao', async () => {
    mockFetchReviews(mkReviews());
    await openReviews();

    await waitFor(() => {
      expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('admin-review-rating-filter'), { target: { value: '1' } });
    expect(screen.getByTestId('admin-review-rating-filter')).toHaveValue('1');
    fireEvent.click(screen.getByTestId('admin-reviews-search-btn'));

    await waitFor(() => {
      expect(screen.queryByText('Son kem 3CE')).toBeNull();
    });
    expect(screen.getByText('Kem dưỡng ẩm La Roche')).toBeInTheDocument();
    expect(screen.getByText('Minh Quân')).toBeInTheDocument();
    expect(screen.getByText('★☆☆☆☆ (1/5)')).toBeInTheDocument();
    expect(screen.queryByText('★★★★★ (5/5)')).toBeNull();
    expect(
      evaluationListCalls().some(([url]) => evaluationQuery(url).get('rating') === '1'),
    ).toBe(true);
  });

  it('Đánh giá: gõ tên SP + bấm Tìm gọi fetch với search=<tên SP> và bảng hiện đúng dòng', async () => {
    mockFetchReviews(mkReviews());
    await openReviews();

    await waitFor(() => {
      expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('admin-review-search'), { target: { value: 'Son kem' } });
    fireEvent.click(screen.getByTestId('admin-reviews-search-btn'));

    await waitFor(() => {
      expect(screen.queryByText('Kem dưỡng ẩm La Roche')).toBeNull();
    });
    expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    expect(screen.getByText('Lan Anh')).toBeInTheDocument();
    expect(
      evaluationListCalls().some(([url]) => evaluationQuery(url).get('search') === 'Son kem'),
    ).toBe(true);
  });

  it('Đánh giá: bấm xem mở modal chi tiết chứa TOÀN BỘ nội dung, tên SP, tên khách, sao', async () => {
    mockFetchReviews(mkReviews());
    await openReviews();

    await waitFor(() => {
      expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Xem đánh giá của Lan Anh'));

    await waitFor(() => {
      expect(screen.getByTestId('admin-review-detail-modal')).toBeInTheDocument();
    });
    const modal = within(screen.getByTestId('admin-review-detail-modal'));
    expect(modal.getByText(longComment)).toBeInTheDocument();
    expect(modal.getByText('Son kem 3CE')).toBeInTheDocument();
    expect(modal.getByText('Lan Anh')).toBeInTheDocument();
    expect(modal.getByText('★★★★★ (5/5)')).toBeInTheDocument();
    expect(modal.getByTestId('admin-review-delete-btn')).toBeInTheDocument();
  });

  it('Đánh giá: xóa trong modal phải qua hộp xác nhận, gọi DELETE rồi dòng biến mất + toast thành công', async () => {
    mockFetchReviews(mkReviews());
    await openReviews();

    await waitFor(() => {
      expect(screen.getByText('Kem dưỡng ẩm La Roche')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Xem đánh giá của Minh Quân'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-review-detail-modal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-review-delete-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('admin-confirm-modal')).toBeInTheDocument();
    });
    expect(screen.getByText('Xác nhận xóa đánh giá')).toBeInTheDocument();
    expect(screen.getByText('Xóa đánh giá này? Đánh giá sẽ bị xóa khỏi sản phẩm và không thể hoàn tác.')).toBeInTheDocument();
    const calledDelete = () =>
      fetchCalls().some(
        ([url, init]) =>
          String(url).includes('/api/admin/evaluations/rv-2') && (init?.method ?? 'GET') === 'DELETE',
      );
    expect(calledDelete()).toBe(false);

    fireEvent.click(screen.getByTestId('admin-confirm-yes-btn'));
    await waitFor(() => {
      expect(calledDelete()).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByText('Kem dưỡng ẩm La Roche')).toBeNull();
    });
    expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-review-detail-modal')).toBeNull();
    expect(screen.queryByTestId('admin-confirm-modal')).toBeNull();
    expect(screen.getByTestId('admin-toast')).toHaveTextContent('Đã xóa đánh giá.');
  });

  it('Đánh giá: API trả [] thì hiện thông báo trống, không có bảng/phân trang', async () => {
    mockFetchReviews([]);
    await openReviews();

    await waitFor(() => {
      expect(screen.getByText('Chưa có đánh giá nào.')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-reviews-section')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-reviews-pagination')).toBeNull();
    expect(screen.queryByText('Son kem 3CE')).toBeNull();
  });
});
