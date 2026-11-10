/**
 * PromoPages — Các trang full page của module Khuyến mãi (đợt 21).
 *
 *   /promotions/:code         → PromoDetailPage (chỉ xem, 4 card)
 *   /promotions/:code/usages → PromoUsagesPage (bảng lượt dùng thật)
 *
 * Trang Thêm mới / Chỉnh sửa dùng lại PromoForm variant="page" (AdminForms.tsx),
 * không nằm ở file này. Sidebar + topbar do AdminPage giữ; các trang ở đây chỉ
 * render breadcrumb + nội dung trong <main>.
 *
 * LƯU Ý DỮ LIỆU (không bịa): DTO lượt dùng GET /api/admin/promotions/{id}/usage
 * chỉ có { Id, UserId, UserEmail, OrderId, OrderDisplayCode, DiscountAmount,
 * CreatedAt } — KHÔNG có tên khách (chỉ email), KHÔNG có giá trị đơn hàng,
 * KHÔNG có trạng thái lượt dùng. 2 cột đó hiện "—" và được ghi rõ trong UI.
 * Endpoint cũng KHÔNG có tham số tìm/lọc nên tìm + lọc ngày ở trang Lượt sử
 * dụng chỉ lọc client-side trên trang hiện tại (ghi rõ giới hạn trong UI).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import { apiJson } from '../../../../Shared/utils/api';
import { Badge, EmptyState, Pagination } from './shared';
import { DISCOUNT_TYPE_LABEL } from './AdminForms';

/** Tóm tắt KM dùng cho các trang con (cấu trúc khớp Promotion ở AdminPage). */
export interface PromoSummary {
  id: string; code: string; description?: string; discountType: string; discountValue: number;
  minOrderAmount?: number; maxDiscountAmount?: number | null; startDate?: string | null;
  expiryDate?: string | null; maxUses?: number | null; usedCount?: number; maxUsesPerUser?: number | null;
  minTier?: string | null; scopeType?: string; status: string; disabledReason?: string | null; createdAt?: string;
}

/** 1 lượt dùng — đúng DTO PromotionUsageDto (AdminPromotionFeatures.cs:260). */
export interface PromoUsageRow {
  id: string; userId: string; userEmail: string; orderId: string;
  orderDisplayCode?: string | null; discountAmount: number; createdAt: string;
}

const PROMO_STATUS_LABELS: Record<string, string> = { Draft: 'Nháp', Active: 'Đang chạy', Disabled: 'Đã tắt', Expired: 'Hết hạn' };
const PROMO_STATUS_TONE: Record<string, 'yellow' | 'green' | 'red' | 'gray'> = {
  Draft: 'yellow', Active: 'green', Disabled: 'red', Expired: 'gray',
};
const TIER_LABELS: Record<string, string> = { Member: 'Thường', Silver: 'Bạc', Gold: 'Vàng', Diamond: 'Kim cương' };
const SCOPE_LABELS: Record<string, string> = { All: 'Toàn sàn', Category: 'Theo danh mục', Product: 'Theo sản phẩm' };

const fmtMoney = (n?: number | null) => `${(n ?? 0).toLocaleString('vi-VN')}₫`;
const fmtDateShort = (s?: string | null): string => {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleDateString('vi-VN');
};
const fmtDateTime = (s?: string | null): string => {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleString('vi-VN');
};
const discountValueText = (p: PromoSummary): string =>
  p.discountType === 'Percentage' ? `${p.discountValue}%`
  : p.discountType === 'FreeShip' ? 'Miễn phí ship'
  : fmtMoney(p.discountValue);

/** Breadcrumb "Quản lý khuyến mãi / <trang hiện tại>" — bấm mục đầu về danh sách. */
export function PromoBreadcrumb({ current, onBackToList }: { current: string; onBackToList: () => void }) {
  return (
    <nav className="sa-breadcrumb" aria-label="Breadcrumb" data-testid="admin-promo-breadcrumb">
      <button type="button" className="sa-breadcrumb-link" onClick={onBackToList}>Quản lý khuyến mãi</button>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{current}</span>
    </nav>
  );
}

const Kv = ({ label, value, testid }: { label: string; value: React.ReactNode; testid?: string }) => (
  <div className="sa-promo-kv" data-testid={testid}>
    <span className="sa-promo-kv-label">{label}</span>
    <span className="sa-promo-kv-value">{value}</span>
  </div>
);

// ============================================================================
// TRANG CHI TIẾT — /promotions/:code (chỉ xem, không sửa tại đây)
// ============================================================================

export function PromoDetailPage({ promo, onBackToList, onEdit }: {
  promo: PromoSummary;
  onBackToList: () => void;
  onEdit: () => void;
}) {
  // Chỉ sửa được voucher Nháp (quy tắc Draft-only hiện có — BE cũng chặn sửa
  // voucher không còn Nháp); voucher khác trạng thái thì ẩn nút Chỉnh sửa.
  const canEdit = promo.status === 'Draft';
  const remaining = promo.maxUses != null ? Math.max(0, promo.maxUses - (promo.usedCount ?? 0)) : null;
  return (
    <section className="sa-promo-page" data-testid="admin-promo-detail-page">
      <PromoBreadcrumb current="Chi tiết" onBackToList={onBackToList} />
      <div className="sa-promo-page-head">
        <div className="sa-promo-page-head-text">
          <h2>Chi tiết khuyến mãi</h2>
          <p>Mã <span className="sa-coupon-tag">{promo.code}</span></p>
        </div>
        <div className="sa-promo-page-head-actions">
          <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-promo-detail-back-btn" onClick={onBackToList}>
            <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" /> Quay lại
          </button>
          {canEdit && (
            <button type="button" className="sa-btn" data-testid="admin-promo-detail-edit-btn" onClick={onEdit}>
              <Pencil size={16} strokeWidth={2} aria-hidden="true" /> Chỉnh sửa
            </button>
          )}
        </div>
      </div>

      <div className="sa-promo-detail-grid">
        <div className="sa-list-card sa-promo-detail-card" data-testid="admin-promo-detail-general">
          <h3>Thông tin chung</h3>
          <Kv label="Mã khuyến mãi" value={<span className="sa-coupon-tag">{promo.code}</span>} testid="admin-promo-detail-code" />
          <Kv label="Mô tả" value={promo.description || '—'} />
          <Kv label="Loại giảm" value={DISCOUNT_TYPE_LABEL[promo.discountType] ?? promo.discountType} />
          <Kv label="Giá trị" value={discountValueText(promo)} />
          <Kv
            label="Trạng thái"
            value={<Badge tone={PROMO_STATUS_TONE[promo.status] ?? 'gray'}>{PROMO_STATUS_LABELS[promo.status] ?? promo.status}</Badge>}
          />
          {promo.disabledReason && <Kv label="Lý do tắt" value={promo.disabledReason} />}
        </div>

        <div className="sa-list-card sa-promo-detail-card" data-testid="admin-promo-detail-conditions">
          <h3>Điều kiện áp dụng</h3>
          <Kv label="Đơn hàng tối thiểu" value={fmtMoney(promo.minOrderAmount)} />
          <Kv label="Giảm tối đa" value={promo.maxDiscountAmount != null ? fmtMoney(promo.maxDiscountAmount) : '—'} />
          <Kv label="Số lượt dùng tối đa" value={promo.maxUses != null ? String(promo.maxUses) : 'Không giới hạn'} />
          <Kv label="Lượt dùng / người" value={promo.maxUsesPerUser != null ? String(promo.maxUsesPerUser) : '—'} />
          <Kv label="Phạm vi áp dụng" value={SCOPE_LABELS[promo.scopeType ?? 'All'] ?? (promo.scopeType ?? '—')} />
          <Kv label="Đối tượng áp dụng" value={promo.minTier ? `Hạng ${TIER_LABELS[promo.minTier] ?? promo.minTier} trở lên` : 'Mọi khách hàng'} />
        </div>

        <div className="sa-list-card sa-promo-detail-card" data-testid="admin-promo-detail-time">
          <h3>Thời gian</h3>
          <Kv label="Ngày bắt đầu" value={fmtDateTime(promo.startDate)} />
          <Kv label="Ngày hết hạn" value={fmtDateTime(promo.expiryDate)} />
          <Kv label="Ngày tạo" value={fmtDateTime(promo.createdAt)} />
        </div>

        <div className="sa-list-card sa-promo-detail-card" data-testid="admin-promo-detail-stats">
          <h3>Thống kê sử dụng</h3>
          <Kv label="Tổng lượt đã dùng" value={String(promo.usedCount ?? 0)} testid="admin-promo-detail-used-count" />
          <Kv label="Lượt còn lại" value={remaining != null ? String(remaining) : 'Không giới hạn'} />
          <Kv label="Giới hạn lượt dùng" value={promo.maxUses != null ? String(promo.maxUses) : 'Không giới hạn'} />
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// TRANG LỊCH SỬ SỬ DỤNG — /promotions/:code/usages
// ============================================================================

const USAGE_PAGE_SIZE = 10;

export function PromoUsagesPage({ promo, onBackToList }: {
  promo: PromoSummary;
  onBackToList: () => void;
}) {
  const [rows, setRows] = useState<PromoUsageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadUsages = useCallback(async (p: number) => {
    setLoading(true); setError(null);
    try {
      const { body } = await apiJson<PromoUsageRow[] | { items?: PromoUsageRow[]; total?: number }>(
        `/api/admin/promotions/${promo.id}/usage?page=${p}&pageSize=${USAGE_PAGE_SIZE}`,
        { skipAuthHandler: true },
      );
      const raw = body?.data;
      const list = Array.isArray(raw) ? raw : (raw?.items ?? null);
      if (body?.success && Array.isArray(list)) {
        setRows(list);
        setHasNext(list.length === USAGE_PAGE_SIZE);
      } else {
        setError((body as { message?: string } | null)?.message || 'Không tải được lịch sử sử dụng.');
        setRows([]);
      }
    } catch {
      setError('Không thể kết nối đến máy chủ.');
      setRows([]);
    } finally { setLoading(false); }
  }, [promo.id]);

  useEffect(() => { void loadUsages(page); }, [page, loadUsages]);
  useEffect(() => { setPage(1); }, [promo.id]);

  // Lọc client-side TRÊN TRANG HIỆN TẠI (endpoint không có tham số tìm/lọc):
  // mã đơn hoặc email khách chứa từ khóa (không phân biệt hoa/thường),
  // ngày sử dụng trong khoảng đã chọn (so theo ngày YYYY-MM-DD).
  const q = search.trim().toLowerCase();
  const filtered = rows.filter(u => {
    if (q) {
      const orderCode = (u.orderDisplayCode ?? u.orderId ?? '').toLowerCase();
      if (!orderCode.includes(q) && !(u.userEmail ?? '').toLowerCase().includes(q)) return false;
    }
    const day = (u.createdAt || '').slice(0, 10);
    if (dateFrom && day < dateFrom) return false;
    if (dateTo && day > dateTo) return false;
    return true;
  });

  // Phân trang kiểu reviews: tổng = số dòng đã thấy (+1 dòng ảo khi còn trang sau).
  const totalPages = hasNext ? page + 1 : page;
  const totalForPager = (page - 1) * USAGE_PAGE_SIZE + rows.length + (hasNext ? 1 : 0);

  return (
    <section className="sa-promo-page" data-testid="admin-promo-usages-page">
      <PromoBreadcrumb current="Lượt sử dụng" onBackToList={onBackToList} />
      <div className="sa-promo-page-head">
        <div className="sa-promo-page-head-text">
          <h2>Lịch sử sử dụng khuyến mãi</h2>
          <p>Mã <span className="sa-coupon-tag">{promo.code}</span></p>
        </div>
        <div className="sa-promo-page-head-actions">
          <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-promo-usages-back-btn" onClick={onBackToList}>
            <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" /> Quay lại
          </button>
        </div>
      </div>

      <div className="sa-list-card sa-promo-usages-overview" data-testid="admin-promo-usages-overview">
        <Kv label="Mã khuyến mãi" value={<span className="sa-coupon-tag">{promo.code}</span>} />
        <Kv label="Mô tả" value={promo.description || '—'} />
        <Kv label="Loại giảm" value={DISCOUNT_TYPE_LABEL[promo.discountType] ?? promo.discountType} />
        <Kv label="Giá trị" value={discountValueText(promo)} />
        <Kv label="Tổng lượt đã dùng" value={String(promo.usedCount ?? 0)} testid="admin-promo-usages-total" />
      </div>

      <div className="sa-list-card">
        <div className="sa-promo-usages-toolbar">
          <input
            type="search"
            className="sa-input"
            placeholder="Tìm theo mã đơn, email khách..."
            value={search}
            data-testid="admin-promo-usages-search-input"
            aria-label="Tìm theo mã đơn, email khách"
            onChange={e => setSearch(e.target.value)}
          />
          <label className="sa-promo-usages-date">
            <span>Từ ngày</span>
            <input type="date" className="sa-input" value={dateFrom} data-testid="admin-promo-usages-date-from" aria-label="Lọc từ ngày" onChange={e => setDateFrom(e.target.value)} />
          </label>
          <label className="sa-promo-usages-date">
            <span>Đến ngày</span>
            <input type="date" className="sa-input" value={dateTo} data-testid="admin-promo-usages-date-to" aria-label="Lọc đến ngày" onChange={e => setDateTo(e.target.value)} />
          </label>
        </div>
        <p className="sa-muted-text sa-promo-usages-note">
          Tìm/lọc chỉ áp dụng trên trang hiện tại — API lượt dùng chưa hỗ trợ tham số tìm kiếm/lọc.
        </p>
        {loading ? (
          <p className="sa-muted-text">Đang tải lịch sử sử dụng...</p>
        ) : error ? (
          <p className="sa-error">{error}</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={q || dateFrom || dateTo ? 'Không tìm thấy lượt sử dụng' : 'Chưa có lượt sử dụng nào'}
            desc={q || dateFrom || dateTo ? 'Thử đổi từ khóa hoặc khoảng ngày khác.' : 'Mã này chưa được khách hàng sử dụng.'}
          />
        ) : (
          <div className="sa-table-wrap">
            <table>
              <thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>Giá trị đơn hàng</th><th>Số tiền giảm</th><th>Thời gian sử dụng</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id}>
                    <td><span className="sa-code">{u.orderDisplayCode ?? u.orderId}</span></td>
                    <td>{u.userEmail}</td>
                    <td>—</td>
                    <td className="sa-cell-money"><span className="sa-money">{fmtMoney(u.discountAmount)}</span></td>
                    <td>{fmtDateTime(u.createdAt)}</td>
                    <td>—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="sa-muted-text sa-promo-usages-note">
          Cột “Giá trị đơn hàng” và “Trạng thái” hiện “—” vì API lượt dùng không trả 2 trường này (chỉ có email khách, mã đơn, số tiền giảm, thời gian sử dụng).
        </p>
        {filtered.length > 0 && (
          <Pagination page={page} totalPages={totalPages} total={totalForPager} pageSize={USAGE_PAGE_SIZE} testid="admin-promo-usages-pagination" onPage={setPage} />
        )}
      </div>
    </section>
  );
}
