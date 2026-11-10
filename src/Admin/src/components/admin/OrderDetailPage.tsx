/**
 * OrderDetailPage — Trang CHI TIẾT ĐƠN HÀNG riêng (đợt 21).
 *
 * Thay Drawer FormShell 680px cũ (AdminPage.tsx, testid admin-order-detail):
 * route thật /orders/:code, breadcrumb về danh sách đơn, header có 2 nút
 * [Hủy đơn] / [Đổi trạng thái] ngay đầu trang, panel đổi trạng thái + panel
 * hủy đơn mở NGAY DƯỚI HEADER (không modal, không ConfirmDialog D1/D2/D3 —
 * panel chính là bước xác nhận), grid 2 cột 1.65fr/1fr.
 *
 * Resolve :code → id (GET /api/admin/orders/{id} chỉ nhận Guid):
 *   1. Ưu tiên location.state.orderId (bấm đơn ở danh sách / dashboard).
 *   2. Không có state (vào thẳng URL / refresh): GET /api/admin/orders
 *      ?search={code}&pageSize=100 rồi tìm orderDisplayCode === code
 *      (hoặc `#${orderCode}`) để lấy id, rồi GET detail. BE search khớp
 *      OrderDisplayCode (Contains, không phân biệt hoa thường —
 *      ListAdminOrdersQueryHandler). Không tìm thấy → lỗi + link về danh sách.
 *
 * "Tình trạng thanh toán" KHÔNG phải field BE — SUY RA từ paymentMethod +
 * status (paymentStatusOf, xem ghi chú ở hàm): PayOS: Pending → "Chờ thanh
 * toán", Paid trở đi → "Đã thanh toán", Cancelled/Expired → "Chưa thanh toán";
 * COD: Delivered/Completed/ReturnRequested → "Đã thanh toán",
 * Cancelled/Expired → "Chưa thanh toán", còn lại → "Thu khi giao hàng".
 * (ReturnRequested tính là đã thanh toán vì đơn đã giao rồi mới yêu cầu trả.)
 *
 * Quy tắc hủy đơn (đợt 21, theo prompt — THU HẸP so với drawer cũ):
 * chỉ Pending + Confirmed mới bấm được [Hủy đơn]. Drawer cũ cho hủy ở
 * Pending/Paid/Confirmed/Preparing; BE AdminCanCancel vẫn cho cả 4 trạng
 * thái đó (AdminGuard.cs) nhưng UI đợt 21 ẩn Paid/Preparing theo prompt.
 *
 * Các helper/label/map trạng thái ở đây là BẢN COPY từ AdminPage.tsx
 * (AdminPage giữ bản của nó cho tab danh sách — worker danh sách sở hữu
 * phần đó, không đụng vào đây để tránh xung đột merge). Nếu worker danh
 * sách export map dùng chung qua shared.tsx thì file này nên import lại
 * từ đó và xóa bản copy — ghi chú để đợt sau dọn.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin } from 'lucide-react';
import { apiJson } from '../../../../Shared/utils/api';
import { Badge } from './shared';
import { fmt, messages } from './messages.vi';
import { notify } from './notify';
import './order-detail.css';

// ---------- DTO (tên field theo đúng record C# — JSON camelCase) ----------
interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  productImageUrl?: string | null;
  unitPrice: number;
  quantity: number;
}
interface StatusHistory {
  status: string | number;
  note?: string | null;
  timestamp: string;
}
interface OrderDetail {
  id: string;
  orderCode: number;
  orderDisplayCode?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress?: string;
  subTotal: number;
  discountAmount?: number;
  voucherCode?: string | null;
  totalAmount: number;
  status: string;
  statusLabel?: string;
  createdAt: string;
  paymentMethod?: string;
  shippingFee?: number;
  cancelReason?: string | null;
  pointsUsed?: number;
  pointsDiscount?: number;
  pointsEarned?: number;
  freeShipVoucherCode?: string | null;
  trackingCode?: string | null;
  carrier?: string | null;
  deliveredAt?: string | null;
  completedAt?: string | null;
  shipProvinceName?: string | null;
  shipDistrictName?: string | null;
  shipWardName?: string | null;
  shipDetailAddress?: string | null;
  shipNote?: string | null;
  items?: OrderItem[];
  statusHistories?: StatusHistory[];
}
interface AdminOrderDetailData {
  order: OrderDetail;
  internalNote?: string | null;
  userId?: string | null;
}
interface AdminOrderRow {
  id: string;
  orderDisplayCode?: string | null;
  orderCode: number;
}

// ---------- Map trạng thái (copy từ AdminPage.tsx — xem ghi chú đầu file) ----------
export const ORDER_STATUS_LABELS: Record<string, string> = {
  Pending: 'Chờ xử lý', Paid: 'Đã thanh toán', Confirmed: 'Đã xác nhận', Preparing: 'Đang chuẩn bị',
  Shipping: 'Đang giao', Delivered: 'Đã giao', Completed: 'Hoàn tất', ReturnRequested: 'Yêu cầu trả hàng',
  Cancelled: 'Đã hủy', Expired: 'Đã hết hạn',
};
/** Máy trạng thái trong AdminGuard.OrderStateMachine (BE) — chỉ cho chọn đích hợp lệ. */
export const ALLOWED_NEXT: Record<string, string[]> = {
  Pending: ['Paid', 'Confirmed', 'Expired'],
  Paid: ['Confirmed', 'Preparing'],
  Confirmed: ['Preparing', 'Shipping'],
  Preparing: ['Shipping'],
  Shipping: ['Delivered'],
  Delivered: ['Completed', 'ReturnRequested'],
  Completed: [], ReturnRequested: ['Delivered'], Cancelled: [], Expired: [],
};
/** Thứ tự enum OrderStatus ở BE — lịch sử trạng thái có thể trả status dạng số. */
const ORDER_STATUS_BY_INDEX = ['Pending', 'Paid', 'Cancelled', 'Expired', 'Preparing', 'Shipping', 'Delivered', 'Confirmed', 'Completed', 'ReturnRequested'];
/** Hủy đơn (đợt 21): CHỈ Pending + Confirmed — thu hẹp so với drawer cũ (xem đầu file). */
export const CANCELLABLE_STATUSES = ['Pending', 'Confirmed'];
/** Đơn đã kết thúc: không đổi trạng thái nữa. */
export const TERMINAL_STATUSES = ['Completed', 'Cancelled', 'Expired'];

export const statusName = (v: string | number | undefined | null): string => {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number') return ORDER_STATUS_BY_INDEX[v] ?? String(v);
  return v;
};
export const statusLabel = (v: string | number | undefined | null) =>
  ORDER_STATUS_LABELS[statusName(v)] ?? statusName(v) ?? '—';
export const orderStatusTone = (v: string | number | undefined | null): 'yellow' | 'blue' | 'green' | 'red' | 'gray' | 'orange' => {
  const n = statusName(v);
  if (['Paid', 'Delivered', 'Completed'].includes(n)) return 'green';
  if (['Cancelled', 'Expired'].includes(n)) return 'red';
  if (n === 'Shipping') return 'blue';
  if (n === 'ReturnRequested') return 'orange';
  return 'yellow';
};

const fmtMoney = (n?: number | null) => `${(n ?? 0).toLocaleString('vi-VN')}₫`;
const pad2 = (n: number) => String(n).padStart(2, '0');
/** "HH:mm ngày dd/mm/yyyy" cho dòng "Đặt lúc ...". */
const fmtPlacedAt = (s?: string | null): string => {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())} ngày ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};
/** "HH:mm:ss · dd/mm/yyyy" cho dòng thời gian trong timeline lịch sử. */
const fmtHistoryTime = (s?: string | null): string => {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} · ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const AVATAR_COLORS = ['#051c12', '#0e7490', '#b45309', '#be185d', '#4d7c0f', '#1d4ed8', '#7c3aed', '#9f1239'];
const avatarColor = (name: string) => {
  let h = 0;
  for (const ch of (name || '?')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
const avatarInitial = (name: string) => (name?.trim()?.[0] ?? '?').toUpperCase();

const apiErr = (body: { message?: string; errors?: string[] } | null, fallback: string) => {
  if (body?.errors?.length) return body.errors.join(' ');
  return body?.message || fallback;
};

/**
 * Tình trạng thanh toán — SUY RA, KHÔNG phải field BE (BE không có field
 * riêng cho tình trạng thanh toán; Order chỉ có paymentMethod + status).
 * Xem quy tắc đầy đủ ở ghi chú đầu file.
 */
export function paymentStatusOf(order: { paymentMethod?: string | null; status: string | number }): string {
  const cur = statusName(order.status);
  if (cur === 'Cancelled' || cur === 'Expired') return 'Chưa thanh toán';
  const isPayOS = (order.paymentMethod ?? '').trim().toLowerCase() === 'payos';
  if (isPayOS) return cur === 'Pending' ? 'Chờ thanh toán' : 'Đã thanh toán';
  // COD (mặc định khi phương thức không phải PayOS).
  return ['Delivered', 'Completed', 'ReturnRequested'].includes(cur) ? 'Đã thanh toán' : 'Thu khi giao hàng';
}

export default function OrderDetailPage({ onDataChanged }: { onDataChanged?: () => void }) {
  const { code } = useParams<{ code: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const stateOrderId = (location.state as { orderId?: string } | null)?.orderId ?? null;

  const [data, setData] = useState<AdminOrderDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusPanelOpen, setStatusPanelOpen] = useState(false);
  const [cancelPanelOpen, setCancelPanelOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState('');
  const [shipCarrier, setShipCarrier] = useState('');
  const [shipTracking, setShipTracking] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [statusError, setStatusError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const backToList = useCallback(() => {
    navigate('/admin', { state: { tab: 'orders' } });
  }, [navigate]);

  const loadDetail = useCallback(async () => {
    if (!code) {
      setError('Không tìm thấy mã đơn.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    try {
      // Resolve :code → id: ưu tiên state.orderId, không có thì search theo mã.
      let id = stateOrderId;
      if (!id) {
        const params = new URLSearchParams({ search: code, pageSize: '100' });
        const { body } = await apiJson<AdminOrderRow[]>(`/api/admin/orders?${params.toString()}`, { skipAuthHandler: true });
        const rows = body?.success && Array.isArray(body.data) ? body.data : [];
        const found = rows.find(r => (r.orderDisplayCode ?? '') === code || `#${r.orderCode}` === code);
        if (!found) {
          setError(`Không tìm thấy đơn ${code}.`);
          return;
        }
        id = found.id;
      }
      const { body } = await apiJson<AdminOrderDetailData>(`/api/admin/orders/${id}`, { skipAuthHandler: true });
      if (body?.success && body.data?.order) setData(body.data);
      else setError(apiErr(body, 'Không tải được chi tiết đơn.'));
    } catch {
      setError('Không thể kết nối đến máy chủ.');
    } finally {
      setLoading(false);
    }
  }, [code, stateOrderId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  // ESC đóng panel đang mở (đổi trạng thái / hủy đơn).
  useEffect(() => {
    if (!statusPanelOpen && !cancelPanelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setStatusPanelOpen(false);
        setCancelPanelOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [statusPanelOpen, cancelPanelOpen]);

  if (loading) {
    return (
      <div className="od-page" data-testid="admin-order-detail">
        <p>Đang tải chi tiết đơn...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="od-page" data-testid="admin-order-detail">
        <nav className="od-breadcrumb" aria-label="Breadcrumb">
          <button type="button" className="od-breadcrumb-back" data-testid="admin-order-detail-back" onClick={backToList}>
            <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" /> Đơn hàng
          </button>
        </nav>
        <p className="sa-error" data-testid="admin-order-detail-error">{error ?? 'Không tải được chi tiết đơn.'}</p>
        <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-order-detail-back-to-list" onClick={backToList}>
          Về danh sách đơn
        </button>
      </div>
    );
  }

  const order = data.order;
  const displayCode = order.orderDisplayCode ?? `#${order.orderCode}`;
  const cur = statusName(order.status);
  const targets = (ALLOWED_NEXT[cur] ?? []).filter(s => s !== 'Cancelled');
  const cancellable = CANCELLABLE_STATUSES.includes(cur);
  const changeDisabled = TERMINAL_STATUSES.includes(cur) || targets.length === 0;
  const items = order.items ?? [];
  const histories = [...(order.statusHistories ?? [])].reverse(); // BE trả tăng dần → hiện mới nhất trước
  const fullAddress = order.shipDetailAddress
    ? [order.shipDetailAddress, order.shipWardName, order.shipDistrictName, order.shipProvinceName].filter(Boolean).join(', ')
    : (order.shippingAddress ?? '—');

  const openStatusPanel = () => {
    setCancelPanelOpen(false);
    setStatusError(null);
    setStatusPanelOpen(true);
  };
  const openCancelPanel = () => {
    setStatusPanelOpen(false);
    setCancelError(null);
    setCancelPanelOpen(true);
  };

  // Đổi trạng thái: panel chính là bước xác nhận — KHÔNG mở thêm
  // ConfirmDialog D2/D3 (đợt 21). Gọi API trực tiếp rồi toast + reload.
  const confirmChangeStatus = async () => {
    if (!nextStatus) return;
    if (nextStatus === 'Shipping' && (shipCarrier.trim().length === 0 || shipTracking.trim().length < 6 || shipTracking.trim().length > 30)) {
      setStatusError('Chuyển sang Đang giao bắt buộc có đơn vị vận chuyển và mã vận đơn 6–30 ký tự.');
      return;
    }
    setBusy(true);
    setStatusError(null);
    try {
      const { body } = await apiJson<string>(`/api/admin/orders/${order.id}/status`, {
        method: 'POST', skipAuthHandler: true,
        body: JSON.stringify({ toStatus: nextStatus, carrier: shipCarrier.trim() || undefined, trackingCode: shipTracking.trim() || undefined, note: statusNote.trim() || undefined }),
      });
      if (body?.success) {
        notify.success(
          messages.toast.order.statusChanged.title,
          fmt(messages.toast.order.statusChanged.desc, {
            'mã đơn': displayCode,
            'trạng thái': ORDER_STATUS_LABELS[nextStatus] ?? nextStatus,
          }),
        );
        setStatusPanelOpen(false);
        setNextStatus('');
        setShipCarrier('');
        setShipTracking('');
        setStatusNote('');
        await loadDetail();
        onDataChanged?.();
      } else setStatusError(apiErr(body, 'Không đổi được trạng thái đơn.'));
    } catch {
      setStatusError('Không thể kết nối đến máy chủ.');
    } finally {
      setBusy(false);
    }
  };

  // Hủy đơn: panel chính là bước xác nhận — KHÔNG mở thêm ConfirmDialog D1
  // (đợt 21). Lý do bắt buộc, giữ nguyên message lỗi D1 cũ.
  const confirmCancel = async () => {
    if (!cancelReason.trim()) {
      setCancelError(messages.validate.cancelOrderReasonEmpty);
      return;
    }
    setBusy(true);
    setCancelError(null);
    try {
      const { body } = await apiJson<string>(`/api/admin/orders/${order.id}/cancel`, {
        method: 'POST', skipAuthHandler: true, body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      if (body?.success) {
        notify.success(
          messages.toast.order.cancelled.title,
          fmt(messages.toast.order.cancelled.desc, { 'mã đơn': displayCode }),
        );
        setCancelPanelOpen(false);
        setCancelReason('');
        await loadDetail();
        onDataChanged?.();
      } else setCancelError(apiErr(body, 'Không hủy được đơn hàng.'));
    } catch {
      setCancelError('Không thể kết nối đến máy chủ.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="od-page" data-testid="admin-order-detail">
      <nav className="od-breadcrumb" aria-label="Breadcrumb">
        <button type="button" className="od-breadcrumb-back" data-testid="admin-order-detail-back" onClick={backToList}>
          <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" /> Đơn hàng
        </button>
        <span aria-hidden="true">/</span>
        <span className="od-breadcrumb-current">{displayCode}</span>
      </nav>

      <header className="od-header">
        <div className="od-header-main">
          <h1 data-testid="admin-order-detail-title">
            Đơn {displayCode}{' '}
            <Badge tone={orderStatusTone(cur)} testid="admin-order-detail-status">{statusLabel(cur)}</Badge>
          </h1>
          <p className="od-sub">
            Đặt lúc {fmtPlacedAt(order.createdAt)} · {order.paymentMethod ?? '—'} · {items.length} sản phẩm
          </p>
        </div>
        <div className="od-header-actions">
          <button
            type="button"
            className="sa-btn sa-btn-danger-ghost"
            data-testid="admin-order-cancel-btn"
            disabled={!cancellable || busy}
            title={cancellable ? 'Hủy đơn hàng này' : `Đơn ở trạng thái “${statusLabel(cur)}” không thể hủy.`}
            onClick={openCancelPanel}
          >
            Hủy đơn
          </button>
          <button
            type="button"
            className="sa-btn"
            data-testid="admin-order-change-status-btn"
            disabled={changeDisabled || busy}
            title={changeDisabled ? 'Đơn ở trạng thái này không đổi được nữa.' : 'Đổi trạng thái đơn hàng'}
            onClick={openStatusPanel}
          >
            Đổi trạng thái
          </button>
        </div>
      </header>

      {statusPanelOpen && (
        <section className="od-panel" data-testid="admin-order-status-panel" aria-label="Đổi trạng thái đơn hàng">
          <h2>Đổi trạng thái</h2>
          <p className="od-panel-sub">
            Đơn {displayCode} đang ở trạng thái “{statusLabel(cur)}”.
          </p>
          <label className="od-field">
            <span>Trạng thái đích</span>
            <select
              className="sa-input"
              value={nextStatus}
              onChange={e => setNextStatus(e.target.value)}
              data-testid="admin-order-status-select"
              aria-label="Trạng thái mới"
            >
              <option value="">— Chọn trạng thái đích —</option>
              {targets.map(s => <option key={s} value={s}>{ORDER_STATUS_LABELS[s] ?? s}</option>)}
            </select>
          </label>
          {nextStatus === 'Shipping' && (
            <>
              <label className="od-field">
                <span>Đơn vị vận chuyển *</span>
                <input
                  className="sa-input"
                  placeholder="Đơn vị vận chuyển"
                  value={shipCarrier}
                  onChange={e => setShipCarrier(e.target.value)}
                  data-testid="admin-order-carrier-input"
                />
              </label>
              <label className="od-field">
                <span>Mã vận đơn (6–30 ký tự) *</span>
                <input
                  className="sa-input"
                  placeholder="Mã vận đơn (6–30 ký tự)"
                  value={shipTracking}
                  onChange={e => setShipTracking(e.target.value)}
                  data-testid="admin-order-tracking-input"
                />
              </label>
            </>
          )}
          <label className="od-field">
            <span>Ghi chú (không bắt buộc)</span>
            <input
              className="sa-input"
              placeholder="Ghi chú (không bắt buộc)"
              value={statusNote}
              onChange={e => setStatusNote(e.target.value)}
              data-testid="admin-order-status-note-input"
            />
          </label>
          {statusError && <p className="sa-error" data-testid="admin-order-status-error">{statusError}</p>}
          <div className="od-panel-actions">
            <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-order-status-close-btn" onClick={() => setStatusPanelOpen(false)}>
              Đóng
            </button>
            <button
              type="button"
              className="sa-btn"
              data-testid="admin-order-status-confirm-btn"
              disabled={!nextStatus || busy}
              onClick={() => void confirmChangeStatus()}
            >
              Xác nhận đổi
            </button>
          </div>
        </section>
      )}

      {cancelPanelOpen && (
        <section className="od-panel od-panel--danger" data-testid="admin-order-cancel-panel" aria-label="Hủy đơn hàng">
          <h2>Hủy đơn hàng?</h2>
          <p className="od-panel-sub">
            Bạn sắp hủy đơn <strong>{displayCode}</strong> của <strong>{order.customerName}</strong> ({fmtMoney(order.totalAmount)}).
            Khách hàng sẽ nhận được thông báo hủy đơn.
          </p>
          <label className="od-field">
            <span>Lý do hủy đơn *</span>
            <input
              className="sa-input"
              placeholder="Nhập lý do hủy đơn..."
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              data-testid="admin-order-cancel-reason-input"
            />
          </label>
          {cancelError && <p className="sa-error" data-testid="admin-order-cancel-error">{cancelError}</p>}
          <div className="od-panel-actions">
            <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-order-cancel-keep-btn" onClick={() => setCancelPanelOpen(false)}>
              Giữ đơn
            </button>
            <button
              type="button"
              className="sa-btn sa-btn-danger"
              data-testid="admin-order-cancel-confirm-btn"
              disabled={busy}
              onClick={() => void confirmCancel()}
            >
              Xác nhận hủy đơn
            </button>
          </div>
        </section>
      )}

      <div className="od-grid">
        <div className="od-col-main">
          <section className="od-card" data-testid="admin-order-detail-products" aria-label="Sản phẩm">
            <h2>Sản phẩm</h2>
            {items.length === 0 ? (
              <p className="od-muted">Đơn này không có sản phẩm.</p>
            ) : (
              <ul className="od-product-list">
                {items.map(i => (
                  <li key={i.id} className="od-product-row">
                    {i.productImageUrl ? (
                      <img src={i.productImageUrl} alt="" className="od-product-thumb" />
                    ) : (
                      <span className="od-product-thumb od-product-thumb--empty" aria-hidden="true">—</span>
                    )}
                    <span className="od-product-info">
                      <strong>{i.productName}</strong>
                      <small>{i.quantity} × {fmtMoney(i.unitPrice)}</small>
                    </span>
                    <span className="od-product-total">{fmtMoney(i.unitPrice * i.quantity)}</span>
                  </li>
                ))}
              </ul>
            )}
            <dl className="od-totals">
              <div className="od-totals-row">
                <dt>Tạm tính</dt>
                <dd>{fmtMoney(order.subTotal)}</dd>
              </div>
              <div className="od-totals-row">
                <dt>Phí vận chuyển</dt>
                <dd>{fmtMoney(order.shippingFee)}</dd>
              </div>
              <div className="od-totals-row od-totals-grand">
                <dt>Tổng cộng</dt>
                <dd>{fmtMoney(order.totalAmount)}</dd>
              </div>
            </dl>
            {order.voucherCode && (
              <p className="od-note-line">Voucher: {order.voucherCode} (giảm {fmtMoney(order.discountAmount)})</p>
            )}
            {order.pointsUsed ? (
              <p className="od-note-line">
                Điểm đã dùng: {order.pointsUsed} (giảm {fmtMoney(order.pointsDiscount)}) — Điểm nhận: {order.pointsEarned ?? 0}
              </p>
            ) : null}
            {data.internalNote && <p className="od-note-line">Ghi chú nội bộ: {data.internalNote}</p>}
          </section>

          <section className="od-card" data-testid="admin-order-detail-history" aria-label="Lịch sử trạng thái">
            <h2>Lịch sử trạng thái</h2>
            {histories.length === 0 ? (
              <p className="od-muted">Chưa có lịch sử trạng thái.</p>
            ) : (
              <ol className="od-timeline">
                {histories.map((h, idx) => (
                  <li key={idx} className="od-timeline-item">
                    <span className={`od-timeline-dot od-timeline-dot--${orderStatusTone(h.status)}`} aria-hidden="true" />
                    <span className="od-timeline-body">
                      <strong>{statusLabel(h.status)}</strong>
                      {h.note ? <small>{h.note}</small> : null}
                    </span>
                    <time className="od-timeline-time">{fmtHistoryTime(h.timestamp)}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="od-col-side">
          <section className="od-card" data-testid="admin-order-detail-customer" aria-label="Khách hàng">
            <h2>Khách hàng</h2>
            <div className="od-customer">
              <span className="sa-avatar" style={{ background: avatarColor(order.customerName) }} aria-hidden="true">
                {avatarInitial(order.customerName)}
              </span>
              <span className="od-customer-info">
                <strong>{order.customerName}</strong>
                <small>{order.customerEmail}</small>
                {order.customerPhone && <small>{order.customerPhone}</small>}
              </span>
            </div>
          </section>

          <section className="od-card" data-testid="admin-order-detail-address" aria-label="Địa chỉ giao hàng">
            <h2>Địa chỉ giao hàng</h2>
            <p className="od-address">
              <MapPin size={16} strokeWidth={2} aria-hidden="true" /> {fullAddress}
            </p>
            {order.shipNote && <p className="od-note-line">Ghi chú giao hàng: {order.shipNote}</p>}
          </section>

          <section className="od-card" data-testid="admin-order-detail-payment" aria-label="Thanh toán">
            <h2>Thanh toán</h2>
            <dl className="od-kv">
              <div className="od-kv-row">
                <dt>Phương thức</dt>
                <dd>{order.paymentMethod ?? '—'}</dd>
              </div>
              <div className="od-kv-row">
                <dt>Tình trạng thanh toán</dt>
                <dd>{paymentStatusOf(order)}</dd>
              </div>
              <div className="od-kv-row">
                <dt>Tổng tiền</dt>
                <dd>{fmtMoney(order.totalAmount)}</dd>
              </div>
            </dl>
            <p className="od-note-line od-note-line--muted">
              Tình trạng thanh toán được suy ra từ phương thức và trạng thái đơn.
            </p>
            {order.carrier && (
              <p className="od-note-line">Vận chuyển: {order.carrier} — Mã vận đơn: {order.trackingCode ?? '—'}</p>
            )}
            {order.cancelReason && <p className="od-note-line">Lý do hủy: {order.cancelReason}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
