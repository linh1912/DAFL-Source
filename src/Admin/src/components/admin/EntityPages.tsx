/**
 * EntityPages — Các trang full page của module Trả hàng + Đánh giá (đợt 21).
 *
 *   /returns/:code → ReturnDetailPage (duyệt/từ chối + ghi nhận hoàn tiền)
 *   /reviews/:id   → ReviewDetailPage (chỉ xem + xóa)
 *
 * Sidebar + topbar do AdminPage giữ; các trang ở đây chỉ render breadcrumb
 * + nội dung trong <main>. Tái dùng class layout full page của Promo
 * (.sa-promo-page / .sa-promo-page-head / .sa-promo-detail-grid / .sa-promo-kv
 * trong AdminPage.css) và panel inline của OrderDetailPage
 * (.sa-entity-panel trong AdminPage.css).
 *
 * Trả hàng — panel xác nhận INLINE (không ConfirmDialog mới, theo mẫu trang
 * chi tiết đơn): nút [Duyệt]/[Từ chối] ở ĐẦU trang, bấm thì panel mở ngay
 * dưới header; panel chính là bước xác nhận, gọi thẳng onResolve. Văn bản
 * panel tái dùng messages.confirm.approveReturn / rejectReturn (E1/E2).
 * Nghiệp vụ giữ nguyên: duyệt → POST /api/admin/returns/{id}/resolve
 * {approve:true}; từ chối → {approve:false, adminNote} (lý do bắt buộc);
 * ghi nhận hoàn tiền → POST /api/admin/refunds/{refundId}/record (modal
 * hoàn tiền cũ ở AdminPage, không đổi).
 *
 * Đánh giá — chỉ xem + xóa (không tạo/sửa, như Drawer cũ): nút [Xóa đánh giá]
 * giữ popup A6 (messages.confirm.deleteReview) qua onDelete của cha.
 */

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Star } from 'lucide-react';
import { Badge } from './shared';
import { fmt, messages, shortName } from './messages.vi';

// ---------- Kiểu dữ liệu (khớp DTO ở AdminPage) ----------
export interface ReturnDetailRow {
  id: string;
  orderId: string;
  orderDisplayCode?: string | null;
  productId: string;
  productName: string;
  quantity: number;
  reason: string;
  note?: string | null;
  status: string;
  adminNote?: string | null;
  refundAmount?: number;
  refundStatus?: string | null;
  refundId?: string | null;
  createdAt: string;
}

export interface ReviewDetailRow {
  id: string;
  productId: string;
  productName?: string | null;
  userId?: string | null;
  userName?: string | null;
  rating: number;
  comment?: string | null;
  createdAt: string;
}

export const RETURN_STATUS_LABELS: Record<string, string> = {
  Pending: 'Chờ duyệt',
  Approved: 'Đã duyệt',
  Rejected: 'Đã từ chối',
};
export const returnStatusTone = (v: string): 'yellow' | 'green' | 'red' | 'gray' =>
  v === 'Approved' ? 'green' : v === 'Rejected' ? 'red' : v === 'Pending' ? 'yellow' : 'gray';

const fmtMoney = (n?: number | null) => `${(n ?? 0).toLocaleString('vi-VN')}₫`;
const fmtDate = (s?: string | null) => {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleString('vi-VN');
};

/** Breadcrumb "Quản lý ... > <trang hiện tại>" — dấu ">" như trang Sản phẩm
 *  (đợt 21); bấm mục đầu về danh sách. */
export function EntityBreadcrumb({ root, current, onBackToList }: {
  root: string;
  current: string;
  onBackToList: () => void;
}) {
  return (
    <nav className="sa-breadcrumb" aria-label="Breadcrumb" data-testid="admin-entity-breadcrumb">
      <button type="button" className="sa-breadcrumb-link" onClick={onBackToList}>{root}</button>
      <span aria-hidden="true">&gt;</span>
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

/** 5 sao Lucide (kẹp 0–5, làm tròn xuống): sao đầy fill vàng, sao rỗng viền xám. */
const reviewStars = (rating: number) => {
  const r = Math.max(0, Math.min(5, Math.floor(rating || 0)));
  return (
    <span className="sa-stars" aria-hidden="true">
      {[0, 1, 2, 3, 4].map(i => (
        <Star key={i} size={14} strokeWidth={2} color={i < r ? '#f59e0b' : '#d1d5db'} fill={i < r ? '#f59e0b' : 'none'} />
      ))}
    </span>
  );
};

// ============================================================================
// TRANG CHI TIẾT TRẢ HÀNG — /returns/:code
// ============================================================================

export function ReturnDetailPage({ ret, onBackToList, onResolve, onRecordRefund }: {
  ret: ReturnDetailRow;
  onBackToList: () => void;
  /** resolve(ret, approve, reason?) — cha gọi POST resolve + toast + reload. */
  onResolve: (ret: ReturnDetailRow, approve: boolean, reason?: string) => void;
  /** Mở modal ghi nhận hoàn tiền cũ (AdminPage giữ refundTarget). */
  onRecordRefund: (ret: ReturnDetailRow) => void;
}) {
  const [approvePanelOpen, setApprovePanelOpen] = useState(false);
  const [rejectPanelOpen, setRejectPanelOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const displayCode = ret.orderDisplayCode ?? ret.orderId;
  const pending = ret.status === 'Pending';
  const canRecordRefund = ret.status === 'Approved' && ret.refundStatus === 'PendingRefund' && !!ret.refundId;

  // ESC đóng panel đang mở (đổi trạng thái / hủy đơn ở OrderDetailPage).
  useEffect(() => {
    if (!approvePanelOpen && !rejectPanelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setApprovePanelOpen(false);
        setRejectPanelOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [approvePanelOpen, rejectPanelOpen]);

  const openApprovePanel = () => {
    setRejectPanelOpen(false);
    setRejectError(null);
    setApprovePanelOpen(true);
  };
  const openRejectPanel = () => {
    setApprovePanelOpen(false);
    setRejectError(null);
    setRejectPanelOpen(true);
  };
  const confirmApprove = () => {
    setBusy(true);
    onResolve(ret, true);
    setApprovePanelOpen(false);
    setBusy(false);
  };
  const confirmReject = () => {
    if (!rejectReason.trim()) {
      setRejectError(messages.validate.rejectReturnReasonEmpty);
      return;
    }
    setBusy(true);
    onResolve(ret, false, rejectReason.trim());
    setRejectPanelOpen(false);
    setRejectReason('');
    setBusy(false);
  };

  return (
    <section className="sa-promo-page" data-testid="admin-return-detail-page">
      <EntityBreadcrumb root="Trả hàng" current={displayCode} onBackToList={onBackToList} />
      <div className="sa-promo-page-head">
        <div className="sa-promo-page-head-text">
          <h2 data-testid="admin-return-detail-title">
            Chi tiết trả hàng {displayCode}{' '}
            <Badge tone={returnStatusTone(ret.status)} testid="admin-return-detail-status">
              {RETURN_STATUS_LABELS[ret.status] ?? ret.status}
            </Badge>
          </h2>
          <p>{ret.productName} × {ret.quantity} · {fmtDate(ret.createdAt)}</p>
        </div>
        <div className="sa-promo-page-head-actions">
          <button
            type="button"
            className="sa-btn sa-btn-danger-ghost"
            data-testid="admin-return-reject-btn"
            disabled={!pending || busy}
            title={pending ? 'Từ chối yêu cầu trả hàng' : `Yêu cầu ở trạng thái “${RETURN_STATUS_LABELS[ret.status] ?? ret.status}” không thể từ chối.`}
            onClick={openRejectPanel}
          >
            Từ chối
          </button>
          <button
            type="button"
            className="sa-btn"
            data-testid="admin-return-approve-btn"
            disabled={!pending || busy}
            title={pending ? 'Duyệt yêu cầu trả hàng' : `Yêu cầu ở trạng thái “${RETURN_STATUS_LABELS[ret.status] ?? ret.status}” không thể duyệt.`}
            onClick={openApprovePanel}
          >
            Duyệt
          </button>
        </div>
      </div>

      {approvePanelOpen && (
        <section className="sa-entity-panel" data-testid="admin-return-approve-panel" aria-label="Duyệt yêu cầu trả hàng">
          <h2>{messages.confirm.approveReturn.title}</h2>
          <p className="sa-entity-panel-sub">
            {fmt(messages.confirm.approveReturn.message, {
              'mã đơn': displayCode,
              'tên sản phẩm': shortName(ret.productName),
              n: ret.quantity,
            })}
          </p>
          <p className="sa-muted-text">Duyệt: hoàn kho + tạo bản ghi hoàn tiền “Chờ hoàn tiền”.</p>
          <div className="sa-entity-panel-actions">
            <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-return-approve-cancel-btn" onClick={() => setApprovePanelOpen(false)}>
              Hủy
            </button>
            <button
              type="button"
              className="sa-btn"
              data-testid="admin-return-approve-confirm-btn"
              disabled={busy}
              onClick={confirmApprove}
            >
              {messages.confirm.approveReturn.confirmText}
            </button>
          </div>
        </section>
      )}

      {rejectPanelOpen && (
        <section className="sa-entity-panel sa-entity-panel--danger" data-testid="admin-return-reject-panel" aria-label="Từ chối yêu cầu trả hàng">
          <h2>{messages.confirm.rejectReturn.title}</h2>
          <p className="sa-entity-panel-sub">
            {fmt(messages.confirm.rejectReturn.message, { 'mã đơn': displayCode })}
          </p>
          <label className="sa-entity-field">
            <span>Lý do từ chối *</span>
            <input
              className="sa-input"
              placeholder="Nhập lý do từ chối yêu cầu trả hàng..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              data-testid="admin-return-reject-reason-input"
            />
          </label>
          {rejectError && <p className="sa-error" data-testid="admin-return-reject-error">{rejectError}</p>}
          <div className="sa-entity-panel-actions">
            <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-return-reject-cancel-btn" onClick={() => setRejectPanelOpen(false)}>
              Hủy
            </button>
            <button
              type="button"
              className="sa-btn sa-btn-danger"
              data-testid="admin-return-reject-confirm-btn"
              disabled={busy}
              onClick={confirmReject}
            >
              {messages.confirm.rejectReturn.confirmText}
            </button>
          </div>
        </section>
      )}

      <div className="sa-promo-detail-grid">
        <div className="sa-list-card sa-promo-detail-card" data-testid="admin-return-detail-request">
          <h3>Yêu cầu trả hàng</h3>
          <Kv label="Sản phẩm" value={<strong>{ret.productName} × {ret.quantity}</strong>} />
          <Kv label="Mã đơn" value={displayCode} />
          <Kv label="Lý do khách" value={ret.reason} />
          {ret.note && <Kv label="Ghi chú khách" value={ret.note} />}
          <Kv label="Ngày tạo" value={fmtDate(ret.createdAt)} />
        </div>
        <div className="sa-list-card sa-promo-detail-card" data-testid="admin-return-detail-handling">
          <h3>Xử lý</h3>
          <Kv label="Trạng thái" value={<Badge tone={returnStatusTone(ret.status)}>{RETURN_STATUS_LABELS[ret.status] ?? ret.status}</Badge>} />
          {ret.adminNote && <Kv label="Ghi chú admin" value={ret.adminNote} />}
          <Kv label="Số tiền hoàn" value={ret.refundAmount ? fmtMoney(ret.refundAmount) : '—'} />
          <Kv label="Trạng thái hoàn tiền" value={ret.refundStatus ?? '—'} />
          {canRecordRefund && (
            <div className="sa-entity-panel-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
              <button
                type="button"
                className="sa-btn"
                data-testid="admin-return-record-refund-btn"
                onClick={() => onRecordRefund(ret)}
              >
                Ghi nhận đã hoàn tiền
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// TRANG CHI TIẾT ĐÁNH GIÁ — /reviews/:id (chỉ xem + xóa)
// ============================================================================

export function ReviewDetailPage({ review, onBackToList, onDelete }: {
  review: ReviewDetailRow;
  onBackToList: () => void;
  /** Xóa qua popup A6 (cha giữ requestDeleteReview). */
  onDelete: (review: ReviewDetailRow) => void;
}) {
  return (
    <section className="sa-promo-page" data-testid="admin-review-detail-page">
      <EntityBreadcrumb root="Đánh giá" current={review.productName ?? 'Sản phẩm'} onBackToList={onBackToList} />
      <div className="sa-promo-page-head">
        <div className="sa-promo-page-head-text">
          <h2 data-testid="admin-review-detail-title">Đánh giá — {review.productName ?? 'Sản phẩm'}</h2>
          <p>{review.userName ?? '—'} · {fmtDate(review.createdAt)}</p>
        </div>
        <div className="sa-promo-page-head-actions">
          <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-review-detail-back-btn" onClick={onBackToList}>
            <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" /> Quay lại
          </button>
          <button
            type="button"
            className="sa-btn sa-btn-danger"
            data-testid="admin-review-delete-btn"
            onClick={() => onDelete(review)}
          >
            Xóa đánh giá
          </button>
        </div>
      </div>

      <div className="sa-list-card sa-promo-detail-card" data-testid="admin-review-detail-info">
        <h3>Chi tiết đánh giá</h3>
        <Kv label="Sản phẩm" value={review.productName ?? '—'} />
        <Kv label="Khách hàng" value={review.userName ?? '—'} />
        <Kv label="Số sao" value={<span>{reviewStars(review.rating)} ({review.rating}/5)</span>} />
        <Kv label="Nội dung" value={review.comment ?? '—'} />
        <Kv label="Ngày tạo" value={fmtDate(review.createdAt)} />
      </div>
    </section>
  );
}
