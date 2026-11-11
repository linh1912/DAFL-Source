import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiJson, clearToken } from '../../../../Shared/utils/api';
import type { NotificationItem } from '../../../../Shared/types';
import { CategoryForm, CustomerForm, ProductForm, PromoForm, DISCOUNT_TYPE_LABEL } from './AdminForms';
import type { CategorySavePayload, CustomerSavePayload, FormSaveResult, ProductSavePayload, PromoSavePayload } from './AdminForms';
import { REQUIRED_MSG, duplicateFieldOf, formatDateTimeVN } from './formUtils';
import { StatusSwitch } from './FormControls';
import AdminProfilePage from './AdminProfilePage';
import OrderDetailPage from './OrderDetailPage';
import { AdminDashboard } from './Dashboard';
import type { DashboardNavFilter, DashboardTab } from './Dashboard';
import { PromoBreadcrumb, PromoDetailPage, PromoUsagesPage } from './PromoPages';
import { EntityBreadcrumb, ReturnDetailPage, ReviewDetailPage } from './EntityPages';
import { ProductBreadcrumb, ProductDetailPage } from './ProductPages';
import { ToastHost } from './Toast';
import { ConfirmDialogHost, confirmAction } from './ConfirmDialog';
import { notify, notifyHttpError } from './notify';
import { fmt, messages, shortName } from './messages.vi';
import { PageToolbar } from './PageToolbar';
import { Badge, EmptyState, Pagination } from './shared';
import { Bell, ChevronDown, Copy, Eye, History, Lock, Maximize2, Menu, Pencil, RotateCcw, ShoppingBag, Star, Trash2, X } from 'lucide-react';
import { FormShell } from './FormShell';
import type { CategoryFormInitial, CustomerFormInitial, ProductFormInitial, PromoFormInitial } from './AdminForms';
import './AdminPage.css';

/**
 * Trang quản trị DAFL — dùng các endpoint /api/admin/* đã có ở backend
 * (Program.cs § Admin, Features/Admin/*). Mọi lỗi hiển thị nguyên văn
 * message backend trả về; field nào không chắc chắn thì đọc phòng thủ (?./fallback).
 */

// ---------- DTO (tên field theo đúng record C# — JSON camelCase) ----------
interface AdminProfile { id: string; email: string; fullName: string; phoneNumber?: string | null; address?: string | null; role: string; createdAt?: string | null; lastLoginAt?: string | null; }
interface DashboardData {
  revenueToday?: number; revenueThisMonth?: number; pendingOrders?: number; newCustomers30d?: number;
  ordersByStatus?: Record<string, number>;
  lowStockProducts?: Array<{ id: string; name: string; stock: number }>;
  expiringVouchers?: Array<{ code: string; usedCount: number; maxUses?: number | null; expiryDate?: string | null }>;
}
interface AdminOrderRow {
  id: string; orderDisplayCode?: string | null; orderCode: number; customerName: string;
  customerEmail: string; customerPhone?: string; status: string; statusLabel?: string;
  paymentMethod: string; totalAmount: number; subTotal?: number; discountAmount?: number;
  voucherCode?: string | null; pointsUsed?: number; createdAt: string;
}
// (Đợt 21) DTO chi tiết đơn (OrderItem/StatusHistory/OrderDetail/
// AdminOrderDetailData) đã chuyển sang OrderDetailPage.tsx.
interface PublicProduct {
  id: string; code?: string | null; categoryId: string; categoryName?: string; name: string; slug?: string;
  description?: string; price: number; originalPrice?: number | null; availableStock?: number;
  stock?: number; isActive?: boolean;
  imageUrl?: string; rating?: number; reviewCount?: number;
}
interface AdminCategory { id: string; code?: string | null; name: string; slug?: string; description?: string | null; isActive: boolean; sortOrder?: number; productCount?: number; iconUrl?: string; }
interface Promotion {
  id: string; code: string; description?: string; discountType: string; discountValue: number;
  minOrderAmount?: number; maxDiscountAmount?: number | null; startDate?: string | null;
  expiryDate?: string | null; maxUses?: number | null; usedCount?: number; maxUsesPerUser?: number | null;
  minTier?: string | null; scopeType?: string; status: string; isActive?: boolean;
  disabledReason?: string | null; createdAt?: string;
}
interface Customer {
  id: string; code?: string | null; email: string; fullName: string; phoneNumber?: string | null; role?: string;
  isLocked?: boolean; membershipTier?: string; totalSpent12m?: number; orderCount?: number;
  availablePoints?: number; address?: string | null;
  createdAt?: string; lastLoginAt?: string | null;
}
interface MembershipTier { tier: string; minSpent: number; spendPerPoint: number; maxPointsPercent: number; freeShipThreshold?: number | null; }
interface ReturnReq {
  id: string; orderId: string; orderDisplayCode?: string | null; productId: string; productName: string;
  quantity: number; reason: string; note?: string | null; status: string; adminNote?: string | null;
  refundAmount?: number; refundStatus?: string | null; refundId?: string | null; createdAt: string;
}
interface AuditLog {
  id: string; actorEmail: string; action: string; entityType?: string | null; entityId?: string | null;
  oldValueJson?: string | null; newValueJson?: string | null; ipAddress?: string | null; createdAt: string;
}
/** Đánh giá của khách (đợt 16): đúng hợp đồng GET /api/admin/evaluations —
 *  mỗi item { id, productId, productName, userId, userName, rating, comment, createdAt },
 *  trả trong ApiResponse<List<...>>. productName/userName đọc phòng thủ vì
 *  EvaluationDto ở shop (GET /api/products/{id}) chưa có 2 field này. */
interface AdminReview {
  id: string; productId: string; productName?: string | null;
  userId?: string | null; userName?: string | null;
  rating: number; comment?: string | null; createdAt: string;
}

// ---------- Hằng số ----------
// Palette admin (đợt 22): sidebar SÁNG nền trắng, điểm nhấn xanh lá #16A34A/#15803D
// (cột biểu đồ doanh thu dùng lime; pill trạng thái giữ xanh lá/cam/đỏ theo ngữ nghĩa).
const LIME = '#b4f105';
/** Đợt 21 — nhóm lọc trạng thái CHỈ cho trang danh sách Đơn hàng (nhãn theo
 *  prompt, KHÔNG sửa ORDER_STATUS_LABELS dùng chung): "Chờ xác nhận" gộp
 *  Pending + Paid (BE: Pending+COD "Chờ xác nhận", Pending+PayOS "Chờ thanh
 *  toán", Paid "Chờ xác nhận"); "Hoàn thành" = Completed (khác nhãn "Hoàn tất"
 *  của ORDER_STATUS_LABELS); "Hết hạn thanh toán" = Expired. Các nhóm còn lại
 *  lấy value = tên enum BE. */
const ORDER_STATUS_GROUPS: Array<{ value: string; label: string; statuses: string[] }> = [
  { value: 'awaiting', label: 'Chờ xác nhận', statuses: ['Pending', 'Paid'] },
  { value: 'Confirmed', label: 'Đã xác nhận', statuses: ['Confirmed'] },
  { value: 'Shipping', label: 'Đang giao', statuses: ['Shipping'] },
  { value: 'Completed', label: 'Hoàn thành', statuses: ['Completed'] },
  { value: 'Cancelled', label: 'Đã hủy', statuses: ['Cancelled'] },
  { value: 'Expired', label: 'Hết hạn thanh toán', statuses: ['Expired'] },
];
/** Trạng thái BE (vd Dashboard điều hướng sang tab Đơn với status 'Pending')
 *  → value nhóm lọc ở dropdown đơn. '' = không thuộc nhóm nào. */
const orderGroupValueForStatus = (s: string): string => {
  if (['Pending', 'Paid'].includes(s)) return 'awaiting';
  return ORDER_STATUS_GROUPS.some(g => g.value === s) ? s : '';
};
const ORDER_STATUS_LABELS: Record<string, string> = {
  Pending: 'Chờ xử lý', Paid: 'Đã thanh toán', Confirmed: 'Đã xác nhận', Preparing: 'Đang chuẩn bị',
  Shipping: 'Đang giao', Delivered: 'Đã giao', Completed: 'Hoàn tất', ReturnRequested: 'Yêu cầu trả hàng',
  Cancelled: 'Đã hủy', Expired: 'Đã hết hạn',
};
// (Đợt 21) ALLOWED_NEXT đã chuyển sang OrderDetailPage.tsx (trang chi tiết
// đơn là nơi duy nhất dùng máy trạng thái này).
/** Thứ tự enum OrderStatus ở BE (AppDbContext) — lịch sử trạng thái có thể trả status dạng số. */
const ORDER_STATUS_BY_INDEX = ['Pending', 'Paid', 'Cancelled', 'Expired', 'Preparing', 'Shipping', 'Delivered', 'Confirmed', 'Completed', 'ReturnRequested'];
const TIER_LABELS: Record<string, string> = { Member: 'Thường', Silver: 'Bạc', Gold: 'Vàng', Diamond: 'Kim cương' };

const fmtMoney = (n?: number | null) => `${(n ?? 0).toLocaleString('vi-VN')}₫`;
/** Đợt 21 — fold dấu tiếng Việt để tìm/lọc client-side không dấu: NFD bỏ dấu
 *  kết hợp, đ→d, lowercase ("nguyen" khớp "Nguyễn"). BE search phân biệt dấu
 *  nên chỉ lọc client-side mới làm được. */
const foldVietnamese = (s?: string | null): string =>
  (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
// Đợt 26 — ngày-giờ dd/mm/yyyy HH:mm (dùng sẵn formatDateTimeVN của formUtils;
// toLocaleString cũ kèm giây, vd "09/11/2026, 17:18:22").
const fmtDate = (s?: string | null) => formatDateTimeVN(s ?? '');
/** Ngày dạng dd/mm/yyyy + giờ HH:mm (2 dòng trong bảng). */
const fmtDateShort = (s?: string | null): string => {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleDateString('vi-VN');
};
const fmtTimeShort = (s?: string | null): string => {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
};
/** Ô ngày trong bảng: "09/11/2026" dòng trên + "17:18" xám dòng dưới. */
const DateCell = ({ value }: { value?: string | null }) => {
  if (!value) return <>—</>;
  const t = fmtTimeShort(value);
  return (
    <span className="sa-date-cell">
      <span>{fmtDateShort(value)}</span>
      {t && <small>{t}</small>}
    </span>
  );
};
/** Skeleton 5 dòng khi đang tải bảng (đợt 18). */
const TableSkeleton = () => (
  <div className="sa-skeleton-table" aria-busy="true" aria-label="Đang tải dữ liệu">
    {[0, 1, 2, 3, 4].map(i => <div key={i} className="sa-skeleton-row" />)}
  </div>
);
/** Tone badge trạng thái đơn (vàng chờ, xanh dương đang giao, xanh lá xong, đỏ hủy). */
const orderStatusTone = (v: string | number | undefined | null): 'yellow' | 'blue' | 'green' | 'red' | 'gray' | 'orange' => {
  const n = statusName(v);
  if (['Paid', 'Delivered', 'Completed'].includes(n)) return 'green';
  if (['Cancelled', 'Expired'].includes(n)) return 'red';
  if (n === 'Shipping') return 'blue';
  if (n === 'ReturnRequested') return 'orange';
  return 'yellow';
};
const PROMO_STATUS_LABELS: Record<string, string> = { Draft: 'Nháp', Active: 'Đang chạy', Disabled: 'Đã tắt', Expired: 'Hết hạn' };
const RETURN_STATUS_LABELS: Record<string, string> = { Pending: 'Chờ duyệt', Approved: 'Đã duyệt', Rejected: 'Đã từ chối' };
const returnStatusTone = (v: string): 'yellow' | 'green' | 'red' | 'gray' =>
  v === 'Approved' ? 'green' : v === 'Rejected' ? 'red' : v === 'Pending' ? 'yellow' : 'gray';
/** % giảm giá SP (giá gốc > giá bán), null khi không có giá gốc. */
const discountPct = (price: number, originalPrice?: number | null): number | null => {
  if (!originalPrice || originalPrice <= price) return null;
  return Math.round((1 - price / originalPrice) * 100);
};
/** Ngày-giờ cho <input type="datetime-local"> của form KM. */
const toLocalInput = (s?: string | null) => (s ? new Date(s).toISOString().slice(0, 16) : '');
/** Hiển thị badge đếm: null khi 0/không rõ, tối đa "99+". */
const badgeText = (n: number | null | undefined): string | null =>
  n == null || n <= 0 ? null : n > 99 ? '99+' : String(n);

const statusName = (v: string | number | undefined | null): string => {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number') return ORDER_STATUS_BY_INDEX[v] ?? String(v);
  return v;
};
const statusLabel = (v: string | number | undefined | null) => ORDER_STATUS_LABELS[statusName(v)] ?? statusName(v) ?? '—';
const apiErr = (body: { message?: string; errors?: string[] } | null, fallback: string) => {
  if (body?.errors?.length) return body.errors.join(' ');
  return body?.message || fallback;
};

/** Lỗi lưu form từ BE → { error, fieldErrors }: message trùng mã/slug/email/SĐT
 *  map xuống đúng field để hiện message đỏ inline dưới đúng ô (đợt 17, mẫu VCB §2).
 *  FE hiển thị NGUYÊN VĂN chuỗi BE trả về ở cả 2 kênh (toast + inline) — không tự
 *  bịa chuỗi khác (voucher giữ nguyên: "Mã khuyến mãi đã tồn tại (không phân biệt hoa thường).").
 *  Field nào form không có (vd slug ở form SP) thì không map — caller hiện toast/formError,
 *  KHÔNG lỗi nào được im lặng. */
const toFormSaveError = (message: string, allowedFields: string[]): { error: string; fieldErrors?: Record<string, string> } => {
  const field = duplicateFieldOf(message);
  if (field && allowedFields.includes(field)) return { error: message, fieldErrors: { [field]: message } };
  return { error: message };
};

/** Hiển thị số sao dạng 5 icon Star Lucide (kẹp 0–5, làm tròn xuống số nguyên):
 *  sao đầy = fill vàng, sao rỗng = chỉ viền xám. */
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
/** Cắt ngắn nội dung đánh giá trong bảng: tối đa 80 ký tự + "...". */
const shortComment = (comment?: string | null) => {
  const s = comment ?? '';
  return s.length > 80 ? `${s.slice(0, 80)}...` : s;
};

// ---------- Helper giao diện Spark (không đổi hành vi) ----------
/** Màu nền avatar: hash tên → 1 trong 8 màu, ổn định theo tên. */
const AVATAR_COLORS = ['#051c12', '#0e7490', '#b45309', '#be185d', '#4d7c0f', '#1d4ed8', '#7c3aed', '#9f1239'];
const avatarColor = (name: string) => {
  let h = 0;
  for (const ch of (name || '?')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
const avatarInitial = (name: string) => (name?.trim()?.[0] ?? '?').toUpperCase();

/* Đợt 26 — MAP PILL DUY NHẤT cho trạng thái đơn (đã gộp, xóa statusPillClass
 *  cũ: Paid xanh lá / Cancelled đỏ — mâu thuẫn với map này): Chờ xác nhận
 *  vàng (Pending + Paid), Đã xác nhận xanh dương, Đang giao tím chàm, Hoàn
 *  thành xanh lá, Đã hủy xám, Hết hạn thanh toán đỏ; Preparing xanh dương
 *  nhạt (sky), Delivered xanh lá, Yêu cầu trả hàng cam. Nhãn pill lấy từ
 *  statusLabel (ORDER_STATUS_LABELS), không đổi. */
const orderListPillClass = (s: string | number | undefined | null): string => {
  const n = statusName(s);
  if (n === 'Pending' || n === 'Paid') return 'sa-pill sa-pill-amber';
  if (n === 'Confirmed') return 'sa-pill sa-pill-blue';
  if (n === 'Preparing') return 'sa-pill sa-pill-sky';
  if (n === 'Shipping') return 'sa-pill sa-pill-purple';
  if (n === 'Delivered' || n === 'Completed') return 'sa-pill sa-pill-green';
  if (n === 'Cancelled') return 'sa-pill sa-pill-gray';
  if (n === 'Expired') return 'sa-pill sa-pill-red';
  if (n === 'ReturnRequested') return 'sa-pill sa-pill-orange';
  return 'sa-pill sa-pill-amber';
};

const promoPillClass = (s: string) =>
  s === 'Active' ? 'sa-pill sa-pill-green'
  : s === 'Draft' ? 'sa-pill sa-pill-amber'
  : s === 'Disabled' ? 'sa-pill sa-pill-red' : 'sa-pill sa-pill-gray';
const returnPillClass = (s: string) =>
  s === 'Approved' ? 'sa-pill sa-pill-green'
  : s === 'Rejected' ? 'sa-pill sa-pill-red' : 'sa-pill sa-pill-amber';

/** Modal chi tiết dùng chung cho mọi mục (Spark): overlay + card trắng,
 *  header có tiêu đề + nút đóng X, footer có nút Đóng + nút thao tác chính.
 *  Đóng bằng nút X, nút Đóng hoặc bấm ra ngoài overlay. */
function SparkModal({ title, onClose, children, footer, testid, hideFooter }: {
  title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; testid?: string;
  /** Ẩn footer mặc định (nút Đóng) — form trong modal tự có nút Lưu/Đóng của nó. */
  hideFooter?: boolean;
}) {
  return (
    <div className="sa-modal-overlay" onClick={onClose}>
      <div className="sa-modal" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()} data-testid={testid}>
        <div className="sa-modal-head">
          <h3>{title}</h3>
          <button type="button" className="sa-modal-close" onClick={onClose} aria-label="Đóng"><X size={18} strokeWidth={2} /></button>
        </div>
        <div className="sa-modal-body">{children}</div>
        {!hideFooter && (
          <div className="sa-modal-foot">
            <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose}>Đóng</button>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** 1 dòng label / giá trị trong modal chi tiết. */
const KvRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="sa-kv"><span>{label}</span><div>{value}</div></div>
);

/** Số dòng mỗi trang cho mọi bảng admin (phân trang client-side trên dữ liệu đã tải). */
const PAGE_SIZE = 10;



type Tab = 'dashboard' | 'orders' | 'products' | 'categories' | 'promotions' | 'customers' | 'reviews' | 'membership' | 'returns' | 'logs';
const NAV: Array<{ key: Tab; label: string; testid: string }> = [
  { key: 'dashboard', label: 'Tổng quan', testid: 'admin-nav-dashboard' },
  { key: 'orders', label: 'Đơn hàng', testid: 'admin-nav-orders' },
  { key: 'products', label: 'Sản phẩm', testid: 'admin-nav-products' },
  { key: 'categories', label: 'Danh mục', testid: 'admin-nav-categories' },
  { key: 'promotions', label: 'Khuyến mãi', testid: 'admin-nav-promotions' },
  { key: 'customers', label: 'Khách hàng', testid: 'admin-nav-customers' },
  { key: 'reviews', label: 'Đánh giá', testid: 'admin-nav-reviews' },
  { key: 'membership', label: 'Hội viên', testid: 'admin-nav-membership' },
  { key: 'returns', label: 'Trả hàng', testid: 'admin-nav-returns' },
  { key: 'logs', label: 'Nhật ký hệ thống', testid: 'admin-nav-logs' },
];
/**
 * Nhóm menu sidebar — DẠNG DROPDOWN (Matthew chốt 22:18, đợt 21, ghi đè
 * menu phẳng đợt 18/20): Tổng quan đứng riêng trên cùng (không tiêu đề nhóm)
 * rồi tới 4 nhóm Bán hàng / Quản lý sản phẩm / Quản trị / Hệ thống. Tiêu đề
 * nhóm là <button> có chevron phải, bấm để thu/mở các mục con; trạng thái
 * mở/đóng từng nhóm nhớ qua localStorage 'dafl_admin_nav_groups'.
 */
const NAV_GROUPS: Array<{ key: string; title: string; keys: Tab[] }> = [
  { key: 'sales', title: 'Bán hàng', keys: ['orders', 'returns', 'promotions'] },
  { key: 'products', title: 'Quản lý sản phẩm', keys: ['products', 'categories', 'reviews'] },
  { key: 'customers', title: 'Quản trị', keys: ['customers', 'membership'] },
  { key: 'system', title: 'Hệ thống', keys: ['logs'] },
];
/** Nhóm chứa 1 tab (null với Tổng quan — đứng riêng, không thuộc nhóm nào). */
const groupOfTab = (t: Tab): string | null =>
  (NAV_GROUPS.find(g => g.keys.includes(t)) ?? null)?.key ?? null;
/** Mặc định: chỉ nhóm chứa tab hiện tại MỞ, các nhóm khác ĐÓNG. */
const defaultOpenGroups = (t: Tab): Record<string, boolean> => {
  const open: Record<string, boolean> = {};
  for (const g of NAV_GROUPS) open[g.key] = g.keys.includes(t);
  return open;
};
const NAV_BY_KEY: Record<Tab, (typeof NAV)[number]> = Object.fromEntries(NAV.map(i => [i.key, i])) as Record<Tab, (typeof NAV)[number]>;
const TAB_META: Record<Tab, { title: string }> = {
  dashboard: { title: 'Tổng quan' },
  orders: { title: 'Đơn hàng' },
  products: { title: 'Sản phẩm' },
  categories: { title: 'Danh mục' },
  promotions: { title: 'Khuyến mãi' },
  customers: { title: 'Khách hàng' },
  reviews: { title: 'Đánh giá' },
  membership: { title: 'Hội viên' },
  returns: { title: 'Trả hàng' },
  logs: { title: 'Nhật ký hệ thống' },
};

export default function AdminPage() {
  const [gate, setGate] = useState<'checking' | 'ok' | 'forbidden' | 'no-admin' | 'unauthorized'>('checking');
  const [gateMsg, setGateMsg] = useState('');
  const [currentEmail, setCurrentEmail] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  // Đợt 21: route thật /orders/:code — AdminPage hiển thị trang chi tiết đơn
  // (OrderDetailPage) thay vì nội dung tab; sidebar vẫn hiện, mục Đơn hàng active.
  // Đợt 21 — route Khuyến mãi dùng chung param :code với /orders/:code nên
  // phân biệt bằng pathname: /promotions/new → tạo mới; /promotions/:code →
  // chi tiết; .../edit → chỉnh sửa; .../usages → lịch sử sử dụng.
  // LƯU Ý: route /promotions/new KHÔNG có param :code nên useParams trả
  // undefined ở đó — phải suy 'new' từ pathname, không được so routeCode.
  const { code: routeCode, id: routeId } = useParams<{ code: string; id: string }>();
  const isPromoRoute = location.pathname.startsWith('/promotions/');
  const isProductRoute = location.pathname.startsWith('/products/');
  // Đợt 21 — orderCode CHỈ có khi pathname bắt đầu /orders/: các route con
  // khác (/promotions/*, /products/*, /categories/*, /customers/*,
  // /returns/*) cũng có param :code nên không được suy orderCode từ routeCode
  // chung (logic cũ "(promo||product) ? undefined : routeCode" sẽ bắt nhầm
  // /categories/:code thành chi tiết đơn).
  const isOrderRoute = location.pathname.startsWith('/orders/');
  const orderCode = isOrderRoute ? routeCode : undefined;
  const promoSubPage: 'list' | 'new' | 'detail' | 'edit' | 'usages' =
    !isPromoRoute ? 'list'
    : location.pathname === '/promotions/new' ? 'new'
    : location.pathname.endsWith('/edit') ? 'edit'
    : location.pathname.endsWith('/usages') ? 'usages'
    : 'detail';
  const promoCode = isPromoRoute && promoSubPage !== 'list' && promoSubPage !== 'new' ? routeCode : undefined;
  // Đợt 21 — route Sản phẩm dùng chung param :code với /orders/:code nên
  // phân biệt bằng pathname: /products/new → tạo mới; /products/:code →
  // chi tiết; .../edit → chỉnh sửa. /products/new KHÔNG có param :code nên
  // phải suy 'new' từ pathname, không được so routeCode.
  const productSubPage: 'list' | 'new' | 'detail' | 'edit' =
    !isProductRoute ? 'list'
    : location.pathname === '/products/new' ? 'new'
    : location.pathname.endsWith('/edit') ? 'edit'
    : 'detail';
  const productCode = isProductRoute && productSubPage !== 'list' && productSubPage !== 'new' ? routeCode : undefined;
  // Đợt 21 — 4 module DM/KH/Trả/Đánh giá cũng là route thật, phân biệt bằng
  // pathname: /categories/new → tạo mới; /categories/:code → chi tiết;
  // .../edit → chỉnh sửa; /customers/:code → chi tiết; .../edit → chỉnh sửa;
  // /returns/:code → chi tiết (code = mã đơn hiển thị, nhất quán /orders/:code);
  // /reviews/:id → chi tiết (id = Guid đánh giá, param :id riêng).
  // LƯU Ý: /categories/new KHÔNG có param :code nên phải suy 'new' từ pathname.
  const isCategoryRoute = location.pathname.startsWith('/categories/');
  const isCustomerRoute = location.pathname.startsWith('/customers/');
  const isReturnRoute = location.pathname.startsWith('/returns/');
  const isReviewRoute = location.pathname.startsWith('/reviews/');
  const categorySubPage: 'list' | 'new' | 'detail' | 'edit' =
    !isCategoryRoute ? 'list'
    : location.pathname === '/categories/new' ? 'new'
    : location.pathname.endsWith('/edit') ? 'edit'
    : 'detail';
  const categoryCode = isCategoryRoute && categorySubPage !== 'list' && categorySubPage !== 'new' ? routeCode : undefined;
  const customerSubPage: 'list' | 'detail' | 'edit' =
    !isCustomerRoute ? 'list'
    : location.pathname.endsWith('/edit') ? 'edit'
    : 'detail';
  const customerCode = isCustomerRoute && customerSubPage !== 'list' ? routeCode : undefined;
  const returnCode = isReturnRoute ? routeCode : undefined;
  const reviewId = isReviewRoute ? routeId : undefined;
  /** Đang ở 1 trong 4 trang con DM/KH/Trả/Đánh giá: ẩn pagehead chung +
   *  ẩn danh sách tab (tab state cũ vẫn giữ khi navigate từ danh sách). */
  const onEntitySubPage = isCategoryRoute || isCustomerRoute || isReturnRoute || isReviewRoute;
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  // Tab mặc định: 'dashboard', trừ khi về từ trang chi tiết đơn
  // (navigate('/admin', { state: { tab: 'orders' } }) — xem effect dưới).
  const [tab, setTab] = useState<Tab>(() => {
    const t = (location.state as { tab?: unknown } | null)?.tab;
    return typeof t === 'string' && NAV.some(n => n.key === t) ? (t as Tab) : 'dashboard';
  });
  // Về từ trang chi tiết đơn (breadcrumb): location.state.tab cho biết mở lại
  // tab nào — chỉ áp khi navigation mang theo state.
  useEffect(() => {
    const t = (location.state as { tab?: unknown } | null)?.tab;
    if (typeof t === 'string' && NAV.some(n => n.key === t)) setTab(t as Tab);
  }, [location]);
  // Trang Hồ sơ quản trị (đợt 17, FR-ACC): mở từ menu tài khoản ở topbar,
  // thay thế nội dung tab (sidebar/topbar giữ nguyên), Quay lại → về tab cũ.
  const [profileView, setProfileView] = useState(false);
  // Menu dropdown (đợt 21, 22:18 — ghi đè menu phẳng đợt 18/20): trạng thái
  // mở/đóng từng nhóm nhớ qua localStorage 'dafl_admin_nav_groups' (theo
  // kiểu state sidebarHidden); chưa có thì mặc định chỉ nhóm chứa tab hiện
  // tại mở, các nhóm khác đóng.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const fallback = defaultOpenGroups(tab);
    try {
      const raw = window.localStorage.getItem('dafl_admin_nav_groups');
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      if (!parsed || typeof parsed !== 'object') return fallback;
      const merged: Record<string, boolean> = {};
      for (const g of NAV_GROUPS) merged[g.key] = typeof parsed[g.key] === 'boolean' ? parsed[g.key] : fallback[g.key];
      return merged;
    } catch { return fallback; }
  });
  const persistOpenGroups = (next: Record<string, boolean>) => {
    try { window.localStorage.setItem('dafl_admin_nav_groups', JSON.stringify(next)); } catch { /* bỏ qua */ }
  };
  const toggleGroup = (key: string) => {
    const next = { ...openGroups, [key]: !openGroups[key] };
    setOpenGroups(next);
    persistOpenGroups(next);
  };
  // Điều hướng sang tab thuộc nhóm đang đóng thì TỰ MỞ nhóm đó (đợt 21).
  // Bỏ qua lần chạy đầu (mount): trạng thái localStorage đã lưu được tôn
  // trọng. Đặt cùng các hook khác, TRƯỚC mọi return sớm (gate) để số hook
  // không đổi giữa các lần render. effectiveTab = orderCode ? 'orders' :
  // isPromoRoute ? 'promotions' : isProductRoute ? 'products' :
  // isCategoryRoute ? 'categories' : isCustomerRoute ? 'customers' :
  // isReturnRoute ? 'returns' : isReviewRoute ? 'reviews' : tab nên effect
  // theo dõi [tab, orderCode, isPromoRoute, isProductRoute, isCategoryRoute,
  // isCustomerRoute, isReturnRoute, isReviewRoute] thay vì
  // effectiveTab (khai báo sau).
  const prevEffTabRef = useRef<Tab>(orderCode ? 'orders' : isPromoRoute ? 'promotions' : isProductRoute ? 'products' : isCategoryRoute ? 'categories' : isCustomerRoute ? 'customers' : isReturnRoute ? 'returns' : isReviewRoute ? 'reviews' : tab);
  useEffect(() => {
    const eff: Tab = orderCode ? 'orders' : isPromoRoute ? 'promotions' : isProductRoute ? 'products' : isCategoryRoute ? 'categories' : isCustomerRoute ? 'customers' : isReturnRoute ? 'returns' : isReviewRoute ? 'reviews' : tab;
    const prev = prevEffTabRef.current;
    prevEffTabRef.current = eff;
    if (prev === eff) return;
    const groupKey = groupOfTab(eff);
    if (!groupKey || openGroups[groupKey]) return;
    const next = { ...openGroups, [groupKey]: true };
    setOpenGroups(next);
    persistOpenGroups(next);
  }, [tab, orderCode, isPromoRoute, isProductRoute, isCategoryRoute, isCustomerRoute, isReturnRoute, isReviewRoute]); // eslint-disable-line react-hooks/exhaustive-deps
  // Hàng vừa lưu xong highlight 2 giây (class sa-row-highlight).
  const [highlightId, setHighlightId] = useState<string | null>(null);
  useEffect(() => {
    if (!highlightId) return;
    const t = window.setTimeout(() => setHighlightId(null), 2000);
    return () => window.clearTimeout(t);
  }, [highlightId]);
  const loadedRef = useRef<Set<Tab>>(new Set());

  // Giao diện Spark: sidebar ẩn hẳn (desktop, nhớ trạng thái) / drawer (mobile),
  // chuông, menu avatar, menu tài khoản ở chân sidebar (đợt 20).
  const [sidebarHidden, setSidebarHidden] = useState<boolean>(() => {
    try { return window.localStorage.getItem('dafl_admin_sidebar_hidden') === '1'; } catch { return false; }
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [sidebarUserMenuOpen, setSidebarUserMenuOpen] = useState(false);
  const [profilePwOpen, setProfilePwOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const sidebarUserMenuRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const [navFadeTop, setNavFadeTop] = useState(false);
  const [navFadeBottom, setNavFadeBottom] = useState(false);
  /** Chống hiện chồng popup G4 khi nhiều API cùng trả 401. */
  const sessionExpiredShownRef = useRef(false);
  // Bấm ra ngoài thì đóng menu tài khoản (đợt 17, FR-ACC).
  useEffect(() => {
    if (!avatarMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setAvatarMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [avatarMenuOpen]);
  // Bấm ra ngoài / ESC thì đóng menu tài khoản ở chân sidebar (đợt 20).
  useEffect(() => {
    if (!sidebarUserMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (sidebarUserMenuRef.current && !sidebarUserMenuRef.current.contains(e.target as Node)) setSidebarUserMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarUserMenuOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey); };
  }, [sidebarUserMenuOpen]);
  // Drawer mobile: ESC đóng + khóa cuộn trang nền (đợt 20, prompt §10).
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [sidebarOpen]);
  // Đóng drawer thì đóng luôn menu tài khoản ở chân sidebar.
  useEffect(() => { if (!sidebarOpen) setSidebarUserMenuOpen(false); }, [sidebarOpen]);
  // Hiệu ứng mờ 2 mép vùng cuộn menu + cuộn mục đang chọn vào vùng nhìn thấy
  // khi tải trang (đợt 20, prompt §9).
  useEffect(() => {
    const el = navRef.current;
    const updateNavFade = () => {
      if (!el) return;
      setNavFadeTop(el.scrollTop > 0);
      setNavFadeBottom(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    };
    updateNavFade();
    const active = el?.querySelector('.sa-nav-btn.sa-active') as HTMLElement | null;
    if (active && typeof active.scrollIntoView === 'function') {
      try { active.scrollIntoView({ block: 'nearest' }); } catch { /* jsdom không hỗ trợ cuộn */ }
    }
    if (!el) return;
    el.addEventListener('scroll', updateNavFade, { passive: true });
    window.addEventListener('resize', updateNavFade);
    return () => { el.removeEventListener('scroll', updateNavFade); window.removeEventListener('resize', updateNavFade); };
  }, []);
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [notifsLoaded, setNotifsLoaded] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const unreadNotifCount = notifs.filter(n => !n.isRead).length;

  // Tổng quan
  const [dash, setDash] = useState<DashboardData | null>(null);

  // Doanh thu (biểu đồ) — chỉ đọc GET /api/admin/reports/revenue

  // Đơn hàng
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState('');
  // Đợt 21 — từ khóa đã debounce 300ms: bảng chỉ lọc lại khi người dùng ngừng
  // gõ 300ms (lọc client-side, không gọi API mỗi phím).
  const [orderSearchDebounced, setOrderSearchDebounced] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('');
  // (Đợt 21) State/hàm chi tiết đơn đã chuyển sang OrderDetailPage.tsx
  // (route /orders/:code) — không còn Drawer chi tiết đơn ở file này.

  // Sản phẩm + danh mục
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  // Đợt 21 — từ khóa SP đã debounce 300ms (như đơn hàng): bảng chỉ lọc lại
  // khi người dùng ngừng gõ 300ms (lọc client-side, không gọi API mỗi phím).
  const [productSearchDebounced, setProductSearchDebounced] = useState('');
  const [productCatFilter, setProductCatFilter] = useState('');
  // Đợt 21 — form Thêm/Sửa SP là trang full page (/products/new, /products/:code/edit)
  // nên KHÔNG còn state productForm/productFormOpen/productFormMode (Drawer đã bỏ).
  // Đợt 21 — resolve :code → PublicProduct cho các trang con SP (chi tiết/sửa).
  // Dropdown Trạng thái ở toolbar SP (đợt 17, FR-COM-02/03): '' = Tất cả,
  // 'true' = Hoạt động, 'false' = Ngừng hoạt động. Lọc client-side như cũ.
  const [productStatusFilter, setProductStatusFilter] = useState('');
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [catsLoading, setCatsLoading] = useState(false);
  const [catsError, setCatsError] = useState<string | null>(null);
  const [catSearch, setCatSearch] = useState('');
  // Đợt 21 — từ khóa đã debounce 300ms (như đơn hàng): bảng chỉ lọc lại khi
  // người dùng ngừng gõ 300ms (lọc client-side, không gọi API mỗi phím).
  const [catSearchDebounced, setCatSearchDebounced] = useState('');
  const [catStatusFilter, setCatStatusFilter] = useState('');
  // Đợt 21 — resolve :code → AdminCategory cho các trang con DM (chi tiết/sửa).
  // Form DM không còn Drawer (catForm/catFormOpen/catFormMode đã BỎ):
  // thêm/sửa/chi tiết là trang full page /categories/* (CategoryForm variant="page").
  const [categoryResolved, setCategoryResolved] = useState<AdminCategory | null>(null);
  const [categoryResolveError, setCategoryResolveError] = useState<string | null>(null);

  // Khuyến mãi
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [promosLoading, setPromosLoading] = useState(false);
  const [promosError, setPromosError] = useState<string | null>(null);
  const [promoStatusFilter, setPromoStatusFilter] = useState('');
  const [promoSearch, setPromoSearch] = useState('');
  // Đợt 21 — resolve :code → Promotion cho các trang con KM (chi tiết/sửa/
  // lượt dùng). Khu vực "Lượt dùng của {mã}" dưới bảng + state promoUsage/
  // promoUsageFor đã BỎ (đã có trang Lượt sử dụng riêng /promotions/:code/usages).
  const [promoResolved, setPromoResolved] = useState<Promotion | null>(null);
  const [promoResolveLoading, setPromoResolveLoading] = useState(false);
  const [promoResolveError, setPromoResolveError] = useState<string | null>(null);
  const [productResolved, setProductResolved] = useState<PublicProduct | null>(null);
  const [productResolveLoading, setProductResolveLoading] = useState(false);
  const [productResolveError, setProductResolveError] = useState<string | null>(null);

  // Khách hàng
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  // Đợt 21 — từ khóa đã debounce 300ms: tìm server-side (loadCustomers) chỉ
  // chạy khi người dùng ngừng gõ 300ms, không gọi API mỗi phím.
  const [customerSearchDebounced, setCustomerSearchDebounced] = useState('');
  const [customerTierFilter, setCustomerTierFilter] = useState('');
  // Dropdown Trạng thái ở toolbar KH (đợt 17): '' = Tất cả, 'active' = Hoạt động, 'locked' = Đã khoá.
  const [customerStatusFilter, setCustomerStatusFilter] = useState('');
  // Đợt 21 — resolve :code → Customer cho các trang con KH (chi tiết/sửa).
  // Form KH không còn Drawer (customerForm/customerFormOpen/customerFormMode
  // đã BỎ): xem/sửa là trang full page /customers/* (CustomerForm variant="page").
  const [customerResolved, setCustomerResolved] = useState<Customer | null>(null);
  const [customerResolveError, setCustomerResolveError] = useState<string | null>(null);

  // Đánh giá (đợt 16): admin chỉ xem/xóa, KHÔNG tạo/sửa (đánh giá là của khách).
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [reviewSearch, setReviewSearch] = useState('');
  // Đợt 21 — từ khóa đã debounce 300ms: tìm server-side (loadReviews) chỉ
  // chạy khi người dùng ngừng gõ 300ms, không gọi API mỗi phím.
  const [reviewSearchDebounced, setReviewSearchDebounced] = useState('');
  const [reviewRatingFilter, setReviewRatingFilter] = useState('');
  // Đợt 21 — resolve :id → AdminReview cho trang con /reviews/:id.
  // Chi tiết đánh giá không còn Drawer/Modal (selectedReview đã BỎ):
  // xem là trang full page (ReviewDetailPage), xóa giữ popup A6.
  const [reviewResolved, setReviewResolved] = useState<AdminReview | null>(null);
  const [reviewResolveLoading, setReviewResolveLoading] = useState(false);
  const [reviewResolveError, setReviewResolveError] = useState<string | null>(null);
  const [reviewsPage, setReviewsPage] = useState(1);
  // API đợt 16 không trả total → "còn trang sau" = trang hiện tại đủ 10 dòng.
  const [reviewsHasNext, setReviewsHasNext] = useState(false);
  // Nếu BE sau này trả dạng trang { items, total } thì dùng total thật.
  const [reviewsTotal, setReviewsTotal] = useState<number | null>(null);

  // Hội viên
  const [tiers, setTiers] = useState<MembershipTier[]>([]);
  const [tiersLoading, setTiersLoading] = useState(false);
  const [tiersError, setTiersError] = useState<string | null>(null);
  const [tierDraft, setTierDraft] = useState<MembershipTier[]>([]);
  const [selectedTier, setSelectedTier] = useState<MembershipTier | null>(null);
  const [adjustId, setAdjustId] = useState('');
  const [adjustPointsValue, setAdjustPointsValue] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustBusy, setAdjustBusy] = useState(false);

  // Trả hàng + audit
  const [returnsList, setReturnsList] = useState<ReturnReq[]>([]);
  const [returnsLoading, setReturnsLoading] = useState(false);
  const [returnsError, setReturnsError] = useState<string | null>(null);
  const [returnStatusFilter, setReturnStatusFilter] = useState('');
  const [returnSearch, setReturnSearch] = useState('');
  // Đợt 21 — từ khóa đã debounce 300ms (như đơn hàng): bảng chỉ lọc lại khi
  // người dùng ngừng gõ 300ms (lọc client-side, không gọi API mỗi phím).
  const [returnSearchDebounced, setReturnSearchDebounced] = useState('');
  const [returnResolved, setReturnResolved] = useState<ReturnReq | null>(null);
  const [returnResolveError, setReturnResolveError] = useState<string | null>(null);
  // Đợt 21 — resolve :code → ReturnReq cho trang con /returns/:code.
  // Chi tiết trả hàng không còn Drawer (returnTarget đã BỎ): xem/duyệt/từ chối
  // là trang full page (ReturnDetailPage, panel xác nhận inline).
  // Ghi nhận đã hoàn tiền (§9.2, đợt 13): nhập mã giao dịch hoàn → POST /api/admin/refunds/{refundId}/record.
  const [refundTarget, setRefundTarget] = useState<ReturnReq | null>(null);
  const [refundTxCode, setRefundTxCode] = useState('');
  const [refundError, setRefundError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditSearch, setAuditSearch] = useState('');
  // Lọc nhật ký theo khoảng ngày (đợt 13 mục 7): ô nhập là bản nháp,
  // chỉ áp dụng khi bấm icon Tìm / Enter ở toolbar Nhật ký (đợt 18).
  const [auditDateFromInput, setAuditDateFromInput] = useState('');
  const [auditDateToInput, setAuditDateToInput] = useState('');
  const [auditDateFrom, setAuditDateFrom] = useState('');
  const [auditDateTo, setAuditDateTo] = useState('');

  // Phân trang client-side: 10 dòng/trang cho mỗi bảng (Pagination dùng chung, đợt 18).
  const [ordersPage, setOrdersPage] = useState(1);
  const [productsPage, setProductsPage] = useState(1);
  const [categoriesPage, setCategoriesPage] = useState(1);
  const [promosPage, setPromosPage] = useState(1);
  const [customersPage, setCustomersPage] = useState(1);
  const [returnsPage, setReturnsPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);

  // ---------- Bảo vệ: xác định quyền admin ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status, body } = await apiJson<AdminProfile>('/api/admin/profile', { skipAuthHandler: true });
      if (cancelled) return;
      if (status === 401) { setGate('unauthorized'); return; }
      if (status === 403) {
        setGateMsg(body?.message || 'Bạn không có quyền truy cập trang quản trị.');
        // Lấy email tài khoản đang đăng nhập để hiện trong trang 403 (phòng thủ:
        // /api/auth/me trả envelope { success, data: { email } } như App.tsx dùng).
        try {
          const me = await apiJson<{ email?: string }>('/api/auth/me', { skipAuthHandler: true });
          const email = me.body?.data?.email;
          if (typeof email === 'string' && email) setCurrentEmail(email);
        } catch { /* không lấy được email thì vẫn hiện trang 403 bình thường */ }
        setGate('forbidden');
        return;
      }
      if (body?.success && body.data && (body.data.role === 'SuperAdmin' || body.data.role === 'Admin')) {
        setProfile(body.data);
        setGate('ok');
        return;
      }
      // Lỗi khác (vd: token đúng nhưng tài khoản admin chưa tồn tại trong DB —
      // DbInitializer chỉ seed admin@dafl.vn khi Users trống).
      setGateMsg(apiErr(body, 'Không xác định được quyền quản trị.'));
      setGate('no-admin');
    })();
    return () => { cancelled = true; };
  }, []);

  // ---------- Loaders ----------
  // Chỉ còn phục vụ badge đơn chờ xác nhận ở sidebar (Dashboard mới tự tải dữ liệu).
  const loadDashboard = useCallback(async () => {
    try {
      const { body } = await apiJson<DashboardData>('/api/admin/dashboard', { skipAuthHandler: true });
      if (body?.success && body.data) setDash(body.data);
    } catch { /* badge giữ số cũ; Dashboard mới tự hiện lỗi riêng */ }
  }, []);

  const loadCategories = useCallback(async (): Promise<AdminCategory[] | null> => {
    setCatsLoading(true); setCatsError(null);
    try {
      const { body } = await apiJson<AdminCategory[]>('/api/admin/categories', { skipAuthHandler: true });
      if (body?.success && Array.isArray(body.data)) { setCategories(body.data); return body.data; }
      setCatsError(apiErr(body, 'Không tải được danh mục.'));
      return null;
    } catch { setCatsError('Không thể kết nối đến máy chủ.'); return null; }
    finally { setCatsLoading(false); }
  }, []);

  /** Chuẩn hoá 1 dòng SP: endpoint admin mới trả `code` + `isActive` + `stock`
   *  (AdminProductDto); API công khai cũ trả `availableStock`, không có code/isActive.
   *  Thiếu field → tồn kho = availableStock ?? stock ?? 0; isActive giữ undefined
   *  (hiển thị mặc định Hoạt động, xoá đi qua hộp xác nhận như cũ — chỉ chặn xoá
   *  khi isActive === true rõ ràng). */
  const normalizeProduct = (p: PublicProduct): PublicProduct => ({
    ...p,
    availableStock: p.availableStock ?? p.stock ?? 0,
  });

  const loadProducts = useCallback(async (overrides?: { search?: string; categoryId?: string; isActive?: string }): Promise<PublicProduct[] | null> => {
    setProductsLoading(true); setProductsError(null);
    try {
      // Đợt 17: bảng SP dùng endpoint admin mới GET /api/admin/products
      // (search, categoryId, isActive, page, pageSize) — thấy cả SP ngừng bán,
      // kèm `code` + `isActive` mỗi dòng.
      const params = new URLSearchParams({ page: '1', pageSize: '100' });
      const search = overrides?.search ?? productSearch;
      const categoryId = overrides?.categoryId ?? productCatFilter;
      const isActive = overrides?.isActive ?? productStatusFilter;
      if (search.trim()) params.set('search', search.trim());
      if (categoryId) params.set('categoryId', categoryId);
      if (isActive) params.set('isActive', isActive);
      const { status, body } = await apiJson<PublicProduct[] | { items?: PublicProduct[]; total?: number }>(`/api/admin/products?${params.toString()}`, { skipAuthHandler: true });
      const raw = body?.data;
      const rows = Array.isArray(raw) ? raw : (raw?.items ?? null);
      if (body?.success && Array.isArray(rows)) {
        const normalized = rows.map(normalizeProduct);
        setProducts(normalized);
        return normalized;
      }
      setProductsError(apiErr(body, 'Không tải được sản phẩm.'));
      return null;
    } catch { setProductsError('Không thể kết nối đến máy chủ.'); return null; }
    finally { setProductsLoading(false); }
  }, [productSearch, productCatFilter, productStatusFilter]);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true); setOrdersError(null);
    try {
      // Đợt 21 — danh sách đơn lọc CLIENT-SIDE: chỉ tải tối đa 100 đơn (cùng
      // endpoint, dashboard đã dùng pageSize=100), KHÔNG gửi status/search lên
      // server — BE search phân biệt dấu tiếng Việt và BE list chỉ nhận 1
      // Status, trong khi "Chờ xác nhận" gộp Pending+Paid và tìm không dấu
      // cần fold. GIỚI HẠN: tìm/lọc chỉ phủ tối đa 100 đơn đã tải; đơn cũ hơn
      // không tìm được nếu không có hỗ trợ unaccent ở BE.
      const { body } = await apiJson<AdminOrderRow[]>('/api/admin/orders?page=1&pageSize=100', { skipAuthHandler: true });
      if (body?.success && Array.isArray(body.data)) setOrders(body.data);
      else setOrdersError(apiErr(body, 'Không tải được đơn hàng.'));
    } catch { setOrdersError('Không thể kết nối đến máy chủ.'); }
    finally { setOrdersLoading(false); }
  }, []);

  const loadPromos = useCallback(async (overrides?: { status?: string }): Promise<Promotion[] | null> => {
    setPromosLoading(true); setPromosError(null);
    try {
      const status = overrides?.status ?? promoStatusFilter;
      const params = new URLSearchParams({ page: '1', pageSize: '20' });
      if (status) params.set('status', status);
      const { body } = await apiJson<Promotion[]>(`/api/admin/promotions?${params.toString()}`, { skipAuthHandler: true });
      if (body?.success && Array.isArray(body.data)) { setPromos(body.data); return body.data; }
      setPromosError(apiErr(body, 'Không tải được khuyến mãi.'));
      return null;
    } catch { setPromosError('Không thể kết nối đến máy chủ.'); return null; }
    finally { setPromosLoading(false); }
  }, [promoStatusFilter]);

  const loadCustomers = useCallback(async (overrides?: { tier?: string; search?: string }) => {
    setCustomersLoading(true); setCustomersError(null);
    try {
      const tier = overrides?.tier ?? customerTierFilter;
      const search = overrides?.search ?? customerSearch;
      const params = new URLSearchParams({ page: '1', pageSize: '20' });
      if (tier) params.set('tier', tier);
      if (search.trim()) params.set('search', search.trim());
      const { body } = await apiJson<Customer[]>(`/api/admin/customers?${params.toString()}`, { skipAuthHandler: true });
      if (body?.success && Array.isArray(body.data)) setCustomers(body.data);
      else setCustomersError(apiErr(body, 'Không tải được khách hàng.'));
    } catch { setCustomersError('Không thể kết nối đến máy chủ.'); }
    finally { setCustomersLoading(false); }
  }, [customerTierFilter, customerSearch]);

  /** Đánh giá (đợt 16): phân trang server-side, 10 dòng/trang.
   *  GET /api/admin/evaluations?page=&pageSize=10&search=&rating= — search lọc theo
   *  tên sản phẩm / tên khách / nội dung, rating lọc theo số sao (1–5).
   *  Hợp đồng trả ApiResponse<List<AdminReview>>; đọc phòng thủ cả dạng trang
   *  { items, total } nếu BE sau này đổi sang trả total. */
  const loadReviews = useCallback(async (overrides?: { search?: string; rating?: string; page?: number }): Promise<AdminReview[] | null> => {
    setReviewsLoading(true); setReviewsError(null);
    try {
      const search = overrides?.search ?? reviewSearch;
      const rating = overrides?.rating ?? reviewRatingFilter;
      const page = overrides?.page ?? reviewsPage;
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search.trim()) params.set('search', search.trim());
      if (rating) params.set('rating', rating);
      const { body } = await apiJson<AdminReview[] | { items?: AdminReview[]; total?: number }>(`/api/admin/evaluations?${params.toString()}`, { skipAuthHandler: true });
      const raw = body?.data;
      const rows = Array.isArray(raw) ? raw : (raw?.items ?? null);
      if (body?.success && Array.isArray(rows)) {
        setReviews(rows);
        if (!Array.isArray(raw) && typeof raw?.total === 'number') {
          setReviewsTotal(raw.total);
          setReviewsHasNext(page * PAGE_SIZE < raw.total);
        } else {
          setReviewsTotal(null);
          setReviewsHasNext(rows.length === PAGE_SIZE);
        }
        return rows;
      }
      setReviewsError(apiErr(body, 'Không tải được đánh giá.'));
      return null;
    } catch { setReviewsError('Không thể kết nối đến máy chủ.'); return null; }
    finally { setReviewsLoading(false); }
  }, [reviewSearch, reviewRatingFilter, reviewsPage]);

  const loadTiers = useCallback(async () => {
    setTiersLoading(true); setTiersError(null);
    try {
      const { body } = await apiJson<MembershipTier[]>('/api/admin/membership/config', { skipAuthHandler: true });
      if (body?.success && Array.isArray(body.data)) { setTiers(body.data); setTierDraft(body.data); }
      else setTiersError(apiErr(body, 'Không tải được cấu hình hội viên.'));
    } catch { setTiersError('Không thể kết nối đến máy chủ.'); }
    finally { setTiersLoading(false); }
  }, []);

  const loadReturns = useCallback(async () => {
    setReturnsLoading(true); setReturnsError(null);
    try {
      const params = new URLSearchParams();
      if (returnStatusFilter) params.set('status', returnStatusFilter);
      const q = params.toString();
      const { body } = await apiJson<ReturnReq[]>(`/api/admin/returns${q ? `?${q}` : ''}`, { skipAuthHandler: true });
      if (body?.success && Array.isArray(body.data)) setReturnsList(body.data);
      else setReturnsError(apiErr(body, 'Không tải được yêu cầu trả hàng.'));
    } catch { setReturnsError('Không thể kết nối đến máy chủ.'); }
    finally { setReturnsLoading(false); }
  }, [returnStatusFilter]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true); setAuditError(null);
    try {
      const { body } = await apiJson<AuditLog[]>('/api/admin/audit-log?page=1&pageSize=20', { skipAuthHandler: true });
      if (body?.success && Array.isArray(body.data)) setAuditLogs(body.data);
      else setAuditError(apiErr(body, 'Không tải được nhật ký.'));
    } catch { setAuditError('Không thể kết nối đến máy chủ.'); }
    finally { setAuditLoading(false); }
  }, []);

  // Tải lười theo tab (mỗi tab 1 lần, có nút tải lại).
  useEffect(() => {
    if (gate !== 'ok') return;
    if (tab === 'orders' && !loadedRef.current.has('orders')) { loadedRef.current.add('orders'); void loadOrders(); }
    if (tab === 'products' && !loadedRef.current.has('products')) { loadedRef.current.add('products'); void loadProducts(); void loadCategories(); }
    if (tab === 'categories' && !loadedRef.current.has('categories')) { loadedRef.current.add('categories'); void loadCategories(); }
    if (tab === 'promotions' && !loadedRef.current.has('promotions')) { loadedRef.current.add('promotions'); void loadPromos(); void loadCategories(); }
    if (tab === 'customers' && !loadedRef.current.has('customers')) { loadedRef.current.add('customers'); void loadCustomers(); }
    if (tab === 'reviews' && !loadedRef.current.has('reviews')) { loadedRef.current.add('reviews'); void loadReviews(); }
    if (tab === 'membership' && !loadedRef.current.has('membership')) { loadedRef.current.add('membership'); void loadTiers(); }
    if (tab === 'returns' && !loadedRef.current.has('returns')) { loadedRef.current.add('returns'); void loadReturns(); }
    if (tab === 'logs' && !loadedRef.current.has('logs')) { loadedRef.current.add('logs'); void loadAudit(); }
  }, [tab, gate, loadOrders, loadProducts, loadCategories, loadPromos, loadCustomers, loadReviews, loadTiers, loadReturns, loadAudit]);

  // Đợt 21 — vào thẳng URL trang con KM (/promotions/...) thì tải danh sách KM
  // + danh mục (form cần categories) dù tab mặc định vẫn là dashboard.
  useEffect(() => {
    if (gate !== 'ok' || !isPromoRoute) return;
    if (!loadedRef.current.has('promotions')) { loadedRef.current.add('promotions'); void loadPromos(); void loadCategories(); }
  }, [gate, isPromoRoute, loadPromos, loadCategories]);

  // Đợt 21 — resolve :code → Promotion cho trang con KM (chi tiết/sửa/lượt dùng):
  // 1) tìm trong danh sách đã tải; 2) chưa thấy thì quét các trang list
  // (pageSize=100, tối đa 5 trang = 500 voucher) vì BE ListPromotions KHÔNG
  // có tham số search — chỉ nhận Status/Page/PageSize (AdminPromotionFeatures.cs).
  // Không tìm thấy thì lỗi + link về danh sách (trang con tự hiển thị).
  useEffect(() => {
    if (!isPromoRoute || promoSubPage === 'new' || !promoCode) {
      setPromoResolved(null); setPromoResolveError(null); return;
    }
    const found = promos.find(p => p.code.toLowerCase() === promoCode.toLowerCase());
    if (found) { setPromoResolved(found); setPromoResolveError(null); return; }
    if (promosLoading) return;
    let cancelled = false;
    setPromoResolveLoading(true); setPromoResolveError(null);
    (async () => {
      try {
        for (let pg = 1; pg <= 5; pg++) {
          const { body } = await apiJson<Promotion[]>(`/api/admin/promotions?page=${pg}&pageSize=100`, { skipAuthHandler: true });
          const rows = body?.success && Array.isArray(body.data) ? body.data : [];
          const hit = rows.find(p => p.code.toLowerCase() === promoCode.toLowerCase());
          if (hit) { if (!cancelled) { setPromoResolved(hit); setPromoResolveLoading(false); } return; }
          if (rows.length < 100) break;
        }
        if (!cancelled) { setPromoResolved(null); setPromoResolveError(`Không tìm thấy khuyến mãi có mã “${promoCode}”.`); setPromoResolveLoading(false); }
      } catch {
        if (!cancelled) { setPromoResolved(null); setPromoResolveError('Không thể kết nối đến máy chủ.'); setPromoResolveLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [isPromoRoute, promoSubPage, promoCode, promos, promosLoading]);

  // Đợt 21 — vào thẳng URL trang con SP (/products/...) thì tải danh sách SP
  // + danh mục (form cần categories) dù tab mặc định vẫn là dashboard.
  useEffect(() => {
    if (gate !== 'ok' || !isProductRoute) return;
    if (!loadedRef.current.has('products')) { loadedRef.current.add('products'); void loadProducts(); void loadCategories(); }
  }, [gate, isProductRoute, loadProducts, loadCategories]);

  // Đợt 21 — resolve :code → PublicProduct cho trang con SP (chi tiết/sửa):
  // 1) tìm trong danh sách đã tải (khớp code, không phân biệt hoa/thường,
  //    hoặc khớp id khi code trống/dữ liệu cũ chưa có code); 2) chưa thấy thì
  // quét các trang list (pageSize=100, tối đa 5 trang = 500 SP) vì BE
  // ListProducts KHÔNG có tham số search theo mã. Không tìm thấy thì lỗi +
  // link về danh sách (trang con tự hiển thị).
  useEffect(() => {
    if (!isProductRoute || productSubPage === 'new' || !productCode) {
      setProductResolved(null); setProductResolveError(null); return;
    }
    const matchCode = (p: PublicProduct) =>
      (p.code ?? '').toLowerCase() === productCode.toLowerCase() || p.id === productCode;
    const found = products.find(matchCode);
    if (found) { setProductResolved(found); setProductResolveError(null); return; }
    if (productsLoading) return;
    let cancelled = false;
    setProductResolveLoading(true); setProductResolveError(null);
    (async () => {
      try {
        for (let pg = 1; pg <= 5; pg++) {
          const { body } = await apiJson<PublicProduct[] | { items?: PublicProduct[]; total?: number }>(
            `/api/admin/products?page=${pg}&pageSize=100`, { skipAuthHandler: true });
          const raw = body?.data;
          const rows = Array.isArray(raw) ? raw : (raw?.items ?? []);
          const hit = (body?.success && Array.isArray(rows)) ? rows.map(normalizeProduct).find(matchCode) : undefined;
          if (hit) { if (!cancelled) { setProductResolved(hit); setProductResolveLoading(false); } return; }
          if (rows.length < 100) break;
        }
        if (!cancelled) { setProductResolved(null); setProductResolveError(`Không tìm thấy sản phẩm có mã “${productCode}”.`); setProductResolveLoading(false); }
      } catch {
        if (!cancelled) { setProductResolved(null); setProductResolveError('Không thể kết nối đến máy chủ.'); setProductResolveLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [isProductRoute, productSubPage, productCode, products, productsLoading]);

  // Đợt 21 — vào thẳng URL trang con DM/KH/Trả/Đánh giá thì tải danh sách
  // tương ứng dù tab mặc định vẫn là dashboard (theo mẫu trang con KM/SP).
  useEffect(() => {
    if (gate !== 'ok') return;
    if (isCategoryRoute && !loadedRef.current.has('categories')) { loadedRef.current.add('categories'); void loadCategories(); }
    if (isCustomerRoute && !loadedRef.current.has('customers')) { loadedRef.current.add('customers'); void loadCustomers(); }
    if (isReturnRoute && !loadedRef.current.has('returns')) { loadedRef.current.add('returns'); void loadReturns(); }
    if (isReviewRoute && !loadedRef.current.has('reviews')) { loadedRef.current.add('reviews'); void loadReviews(); }
  }, [gate, isCategoryRoute, isCustomerRoute, isReturnRoute, isReviewRoute, loadCategories, loadCustomers, loadReturns, loadReviews]);

  // Đợt 21 — resolve :code → AdminCategory cho trang con DM (chi tiết/sửa):
  // khớp code (không phân biệt hoa/thường) hoặc khớp id khi code trống/dữ
  // liệu cũ chưa có code; ưu tiên state.categoryId khi navigate từ danh sách.
  // GET /api/admin/categories trả toàn bộ danh sách nên chỉ cần tìm trong đó.
  useEffect(() => {
    if (!isCategoryRoute || categorySubPage === 'new' || !categoryCode) {
      setCategoryResolved(null); setCategoryResolveError(null); return;
    }
    const stateId = (location.state as { categoryId?: string } | null)?.categoryId;
    const found = categories.find(c =>
      (c.code ?? '').toLowerCase() === categoryCode.toLowerCase()
      || c.id === categoryCode
      || (stateId !== undefined && c.id === stateId));
    if (found) { setCategoryResolved(found); setCategoryResolveError(null); return; }
    if (catsLoading) return;
    if (!loadedRef.current.has('categories')) return;
    setCategoryResolved(null);
    setCategoryResolveError(`Không tìm thấy danh mục có mã “${categoryCode}”.`);
  }, [isCategoryRoute, categorySubPage, categoryCode, categories, catsLoading, location.state]);

  // Đợt 21 — resolve :code → Customer cho trang con KH (chi tiết/sửa):
  // khớp CustomerCode (không phân biệt hoa/thường) hoặc id; ưu tiên
  // state.customerId khi navigate từ danh sách. Danh sách KH phân trang
  // server-side (pageSize=20) nên chưa thấy trong trang đã tải thì thử tìm
  // qua search API 1 lần (BE search khớp email/tên/SĐT; mã KH có thể không
  // khớp — khi đó trang báo không tìm thấy, ghi rõ giới hạn trong báo cáo).
  useEffect(() => {
    if (!isCustomerRoute || !customerCode) {
      setCustomerResolved(null); setCustomerResolveError(null); return;
    }
    const stateId = (location.state as { customerId?: string } | null)?.customerId;
    const found = customers.find(c =>
      (c.code ?? '').toLowerCase() === customerCode.toLowerCase()
      || c.id === customerCode
      || (stateId !== undefined && c.id === stateId));
    if (found) { setCustomerResolved(found); setCustomerResolveError(null); return; }
    if (customersLoading) return;
    if (!loadedRef.current.has('customers')) return;
    let cancelled = false;
    (async () => {
      try {
        const { body } = await apiJson<Customer[]>(`/api/admin/customers?search=${encodeURIComponent(customerCode)}&page=1&pageSize=5`, { skipAuthHandler: true });
        const rows = body?.success && Array.isArray(body.data) ? body.data : [];
        const hit = rows.find(c => (c.code ?? '').toLowerCase() === customerCode.toLowerCase() || c.id === customerCode);
        if (!cancelled) {
          if (hit) { setCustomerResolved(hit); setCustomerResolveError(null); }
          else { setCustomerResolved(null); setCustomerResolveError(`Không tìm thấy khách hàng có mã “${customerCode}”.`); }
        }
      } catch {
        if (!cancelled) { setCustomerResolved(null); setCustomerResolveError('Không thể kết nối đến máy chủ.'); }
      }
    })();
    return () => { cancelled = true; };
  }, [isCustomerRoute, customerCode, customers, customersLoading, location.state]);

  // Đợt 21 — resolve :code → ReturnReq cho trang con /returns/:code:
  // :code là mã đơn hiển thị (orderDisplayCode, nhất quán /orders/:code);
  // fallback khớp orderId rồi id khi navigate kèm state.returnId.
  // GET /api/admin/returns trả toàn bộ danh sách nên chỉ cần tìm trong đó.
  useEffect(() => {
    if (!isReturnRoute || !returnCode) {
      setReturnResolved(null); setReturnResolveError(null); return;
    }
    const stateId = (location.state as { returnId?: string } | null)?.returnId;
    const found = returnsList.find(r =>
      (r.orderDisplayCode ?? '').toLowerCase() === returnCode.toLowerCase()
      || r.orderId === returnCode
      || r.id === returnCode
      || (stateId !== undefined && r.id === stateId));
    if (found) { setReturnResolved(found); setReturnResolveError(null); return; }
    if (returnsLoading) return;
    if (!loadedRef.current.has('returns')) return;
    setReturnResolved(null);
    setReturnResolveError(`Không tìm thấy yêu cầu trả hàng của đơn “${returnCode}”.`);
  }, [isReturnRoute, returnCode, returnsList, returnsLoading, location.state]);

  // Đợt 21 — resolve :id → AdminReview cho trang con /reviews/:id:
  // ưu tiên state.review khi navigate từ danh sách; chưa thấy trong trang đã
  // tải thì quét các trang evaluations (pageSize=100, tối đa 10 trang) vì BE
  // KHÔNG có endpoint GET 1 đánh giá theo id. Không tìm thấy thì lỗi.
  useEffect(() => {
    if (!isReviewRoute || !reviewId) {
      setReviewResolved(null); setReviewResolveError(null); return;
    }
    const stateReview = (location.state as { review?: AdminReview } | null)?.review;
    if (stateReview && stateReview.id === reviewId) { setReviewResolved(stateReview); setReviewResolveError(null); return; }
    const found = reviews.find(r => r.id === reviewId);
    if (found) { setReviewResolved(found); setReviewResolveError(null); return; }
    if (reviewsLoading) return;
    let cancelled = false;
    setReviewResolveLoading(true); setReviewResolveError(null);
    (async () => {
      try {
        for (let pg = 1; pg <= 10; pg++) {
          const { body } = await apiJson<AdminReview[] | { items?: AdminReview[]; total?: number }>(
            `/api/admin/evaluations?page=${pg}&pageSize=100`, { skipAuthHandler: true });
          const raw = body?.data;
          const rows = Array.isArray(raw) ? raw : (raw?.items ?? []);
          const hit = (body?.success && Array.isArray(rows)) ? rows.find(r => r.id === reviewId) : undefined;
          if (hit) { if (!cancelled) { setReviewResolved(hit); setReviewResolveLoading(false); } return; }
          if (rows.length < 100) break;
        }
        if (!cancelled) { setReviewResolved(null); setReviewResolveError(`Không tìm thấy đánh giá “${reviewId}”.`); setReviewResolveLoading(false); }
      } catch {
        if (!cancelled) { setReviewResolved(null); setReviewResolveError('Không thể kết nối đến máy chủ.'); setReviewResolveLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [isReviewRoute, reviewId, reviews, reviewsLoading, location.state]);

  // ---------- Badge đếm trên menu (đợt 18): số liệu THẬT, tải khi vào admin ----------
  // Đợt 21: BỎ badge menu "Đơn hàng" (không còn đếm pendingOrders cho menu).
  // Trả hàng chờ duyệt: GET /api/admin/returns trả toàn bộ danh sách (không phân trang)
  // nên đếm chính xác từ returnsList. Đánh giá mới: "mới = tạo trong 7 ngày qua"
  // (entity Evaluation không có cờ đã xử lý); đếm bằng cách quét các trang
  // pageSize=100 cho tới trang ngắn, tối đa 10 trang (1000 đánh giá) — quá thì ẩn.
  const [newReviewsCount, setNewReviewsCount] = useState<number | null>(null);
  const loadNewReviewsCount = useCallback(async () => {
    try {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      let count = 0;
      for (let page = 1; page <= 10; page++) {
        const { body } = await apiJson<AdminReview[] | { items?: AdminReview[]; total?: number }>(
          `/api/admin/evaluations?page=${page}&pageSize=100`, { skipAuthHandler: true });
        const raw = body?.data;
        const rows = Array.isArray(raw) ? raw : (raw?.items ?? []);
        if (!body?.success || !Array.isArray(rows)) { setNewReviewsCount(null); return; }
        count += rows.filter(r => {
          const t = new Date(r.createdAt).getTime();
          return !Number.isNaN(t) && t >= cutoff;
        }).length;
        if (rows.length < 100) break;
        if (page === 10) { setNewReviewsCount(null); return; } // quá 1000 đánh giá: không đếm chính xác được → ẩn badge
      }
      setNewReviewsCount(count);
    } catch { setNewReviewsCount(null); }
  }, []);
  useEffect(() => {
    if (gate !== 'ok') return;
    void loadDashboard();
    if (!loadedRef.current.has('returns')) { loadedRef.current.add('returns'); void loadReturns(); }
    void loadNewReviewsCount();
  }, [gate, loadDashboard, loadReturns, loadNewReviewsCount]);

  // Đợt 21 — debounce 300ms cho ô tìm đơn (lọc client-side, không gọi API).
  useEffect(() => {
    const t = setTimeout(() => setOrderSearchDebounced(orderSearch), 300);
    return () => clearTimeout(t);
  }, [orderSearch]);

  // Đợt 21 — debounce 300ms cho ô tìm SP (lọc client-side theo tên/mã,
  // không gọi API mỗi phím; xem filteredProducts).
  useEffect(() => {
    const t = setTimeout(() => setProductSearchDebounced(productSearch), 300);
    return () => clearTimeout(t);
  }, [productSearch]);

  // Đợt 21 — debounce 300ms cho ô tìm DM + ô tìm trả hàng (lọc client-side,
  // không gọi API mỗi phím; xem filteredCategories / filteredReturns).
  useEffect(() => {
    const t = setTimeout(() => setCatSearchDebounced(catSearch), 300);
    return () => clearTimeout(t);
  }, [catSearch]);
  useEffect(() => {
    const t = setTimeout(() => setReturnSearchDebounced(returnSearch), 300);
    return () => clearTimeout(t);
  }, [returnSearch]);

  // Đợt 21 — debounce 300ms cho ô tìm KH + ô tìm đánh giá (tìm server-side).
  useEffect(() => {
    const t = setTimeout(() => setCustomerSearchDebounced(customerSearch), 300);
    return () => clearTimeout(t);
  }, [customerSearch]);
  useEffect(() => {
    const t = setTimeout(() => setReviewSearchDebounced(reviewSearch), 300);
    return () => clearTimeout(t);
  }, [reviewSearch]);

  // Đợt 21 — tìm/lọc KH + đánh giá TỰ ĐỘNG (không cần bấm Tìm/Enter):
  // ngừng gõ 300ms (debounce) hoặc đổi dropdown hạng/sao thì tải lại
  // server-side. BUG #2 (đợt 24/25/26) — dropdown trạng thái KM cũng tự
  // động theo cùng pattern này (xem effect promoStatusFilter bên dưới):
  // trước đây đổi dropdown KM xong phải bấm nút Tìm mới tải lại, nút Tìm
  // đã bỏ nên dropdown chết hẳn. Bỏ qua lần chạy đầu (mount) để không tải
  // trùng với tải lười theo tab; chỉ chạy khi đang ở đúng tab/trang con đó.
  // Lưu ý: loadCustomers/loadReviews/loadPromos là useCallback phụ thuộc vào
  // customerSearch/reviewSearch/promoStatusFilter nên identity đổi theo MỖI
  // phím gõ / lần đổi dropdown — nếu đưa loader vào deps của effect này thì
  // mỗi phím gõ lại kích effect (tải lại với từ khóa debounce CŨ, bảng nhấp
  // nháy skeleton, debounce coi như mất tác dụng). Vì vậy effect gọi loader
  // qua ref, deps chỉ gồm giá trị đã debounce + bộ lọc + vị trí; loader luôn
  // nhận overrides đầy đủ nên không dính state cũ trong closure.
  const loadCustomersRef = useRef(loadCustomers);
  loadCustomersRef.current = loadCustomers;
  const loadReviewsRef = useRef(loadReviews);
  loadReviewsRef.current = loadReviews;
  const loadPromosRef = useRef(loadPromos);
  loadPromosRef.current = loadPromos;
  const autoSearchInitRef = useRef({ customers: false, reviews: false, promos: false });
  useEffect(() => {
    if (!autoSearchInitRef.current.customers) { autoSearchInitRef.current.customers = true; return; }
    if (gate !== 'ok' || (tab !== 'customers' && !isCustomerRoute)) return;
    setCustomersPage(1);
    void loadCustomersRef.current({ tier: customerTierFilter, search: customerSearchDebounced });
  }, [customerSearchDebounced, customerTierFilter, gate, tab, isCustomerRoute]);
  useEffect(() => {
    if (!autoSearchInitRef.current.reviews) { autoSearchInitRef.current.reviews = true; return; }
    if (gate !== 'ok' || (tab !== 'reviews' && !isReviewRoute)) return;
    setReviewsPage(1);
    void loadReviewsRef.current({ search: reviewSearchDebounced, rating: reviewRatingFilter, page: 1 });
  }, [reviewSearchDebounced, reviewRatingFilter, gate, tab, isReviewRoute]);
  // BUG #2 (đợt 24/25/26) — dropdown trạng thái KM CHẾT: đổi dropdown chỉ
  // setPromoStatusFilter (ô select ở toolbar KM) mà không có effect nào gọi loadPromos()
  // — trước đây đổi xong bấm nút Tìm (PageToolbar onSearch) mới tải lại, nút
  // Tìm đã bỏ ở đợt 24/26 nên đổi dropdown không tải gì cả; filteredPromos
  // cũng chỉ lọc client-side theo promoSearch (không lọc status), nên bảng
  // đứng yên. Nay đổi dropdown thì tự tải lại server-side với status mới,
  // cùng pattern KH/đánh giá ở trên (ref + bỏ qua lần chạy đầu + về trang 1).
  // Ô tìm KM vẫn lọc client-side ngay khi gõ (filteredPromos) nên promoSearch
  // KHÔNG nằm trong deps ở đây — gõ tìm không gọi API.
  useEffect(() => {
    if (!autoSearchInitRef.current.promos) { autoSearchInitRef.current.promos = true; return; }
    if (gate !== 'ok' || (tab !== 'promotions' && !isPromoRoute)) return;
    setPromosPage(1);
    void loadPromosRef.current({ status: promoStatusFilter });
  }, [promoStatusFilter, gate, tab, isPromoRoute]);

  // Đổi bộ lọc/tìm kiếm thì quay về trang 1 (phân trang client-side).
  useEffect(() => { setOrdersPage(1); }, [orderSearchDebounced, orderStatusFilter]);
  useEffect(() => { setProductsPage(1); }, [productSearchDebounced, productCatFilter, productStatusFilter]);
  useEffect(() => { setCategoriesPage(1); }, [catSearchDebounced, catStatusFilter]);
  useEffect(() => { setPromosPage(1); }, [promoSearch, promoStatusFilter]);
  useEffect(() => { setCustomersPage(1); }, [customerSearch, customerTierFilter, customerStatusFilter]);
  useEffect(() => { setReviewsPage(1); }, [reviewSearch, reviewRatingFilter]);
  useEffect(() => { setReturnsPage(1); }, [returnSearchDebounced, returnStatusFilter]);
  useEffect(() => { setAuditPage(1); }, [auditSearch, auditDateFrom, auditDateTo]);

  // ---------- Nút "Đặt lại" ở toolbar từng mục: xóa sạch bộ lọc/tìm kiếm về mặc định.
  // Mục lọc ở server (khách hàng/đánh giá/khuyến mãi): tải lại với bộ lọc đã
  // xóa — qua effect tự động (loader nhận overrides để không dính state cũ
  // trong closure). Mục lọc client-side (đơn hàng từ đợt 21, sản phẩm,
  // danh mục...) thì chỉ cần xóa state — bảng tự lọc lại trên dữ liệu đã tải.
  // Đợt 21 — đơn hàng lọc client-side nên Đặt lại chỉ xóa state, không tải lại
  // (dữ liệu đã tải đủ 100 đơn); các mục lọc server (khách hàng/đánh giá,
  // và khuyến mãi từ BUG #2) tải lại với bộ lọc đã xóa — qua effect tự động,
  // không gọi loader trực tiếp (xem resetPromos/resetCustomers/resetReviews).
  const resetOrders = () => { setOrderSearch(''); setOrderSearchDebounced(''); setOrderStatusFilter(''); setOrdersPage(1); };
  const resetProducts = () => { setProductSearch(''); setProductSearchDebounced(''); setProductCatFilter(''); setProductStatusFilter(''); setProductsPage(1); };
  const resetCategories = () => { setCatSearch(''); setCatSearchDebounced(''); setCatStatusFilter(''); setCategoriesPage(1); };
  // BUG #2 — KM nay lọc TỰ ĐỘNG như KH/đánh giá: Đặt lại chỉ xóa state,
  // effect promoStatusFilter tự tải lại với status '' (không gọi loader trực
  // tiếp để tránh tải trùng 2 lần) — trừ khi status vốn đã '' thì effect
  // không kích (filter không đổi) nên vẫn gọi loader trực tiếp 1 lần để tải
  // lại danh sách đầy đủ (toolbar KM không có resetDisabled như các mục khác,
  // nút Đặt lại bấm được cả khi chưa có bộ lọc nào).
  const resetPromos = () => { const hadStatus = promoStatusFilter !== ''; setPromoSearch(''); setPromoStatusFilter(''); setPromosPage(1); if (!hadStatus) void loadPromos({ status: '' }); };
  // Đợt 21 — KH/đánh giá tìm/lọc TỰ ĐỘNG (debounce 300ms): Đặt lại chỉ xóa
  // state, effect tự động tải lại với bộ lọc đã xóa (không gọi loader trực
  // tiếp để tránh tải trùng 2 lần).
  const resetCustomers = () => { setCustomerSearch(''); setCustomerSearchDebounced(''); setCustomerTierFilter(''); setCustomerStatusFilter(''); setCustomersPage(1); };
  const resetReviews = () => { setReviewSearch(''); setReviewSearchDebounced(''); setReviewRatingFilter(''); setReviewsPage(1); };
  const resetReturns = () => { setReturnSearch(''); setReturnSearchDebounced(''); setReturnStatusFilter(''); setReturnsPage(1); };
  const resetAudit = () => { setAuditSearch(''); setAuditDateFromInput(''); setAuditDateToInput(''); setAuditDateFrom(''); setAuditDateTo(''); setAuditPage(1); };
  // Hội viên không có bộ lọc/tìm kiếm: Đặt lại = hủy thay đổi cấu hình hạng chưa lưu.
  const resetMembers = () => { setTierDraft(tiers); };

  // Dashboard mới (đợt 18): điều hướng từ KPI/biểu đồ/dòng dữ liệu.
  const handleDashboardNavigate = (tab: DashboardTab, filter?: DashboardNavFilter) => {
    setSidebarOpen(false);
    if (tab === 'orders') {
      // Đợt 21 — Dashboard truyền trạng thái BE ('Pending'/'Cancelled'...):
      // map sang value nhóm lọc của dropdown đơn ('Pending' → 'awaiting').
      setOrderStatusFilter(orderGroupValueForStatus(filter?.status ?? ''));
      setOrderSearch(filter?.search ?? '');
      setTab('orders');
      void loadOrders();
    } else if (tab === 'products') {
      setProductSearch(filter?.search ?? '');
      setTab('products');
      void loadProducts({ search: filter?.search ?? '' });
    } else if (tab === 'promotions') {
      setPromoSearch(filter?.search ?? '');
      setTab('promotions');
      void loadPromos({ status: '' });
    } else if (tab === 'customers') {
      setCustomerTierFilter(filter?.tier ?? '');
      setTab('customers');
      void loadCustomers({ tier: filter?.tier ?? '', search: '' });
    } else {
      setTab(tab); // reviews / membership / returns / logs / categories: tải lười theo tab
    }
  };

  // ---------- Gate ----------
  if (gate === 'checking') return <div className="spark-admin sa-gate-page" data-testid="admin-page"><div className="sa-checking">Đang kiểm tra quyền...</div></div>;
  if (gate === 'unauthorized') return <Navigate to="/login" replace />;
  if (gate === 'forbidden') {
    const sqlEmail = currentEmail || 'email-cua-ban';
    return (
      <div className="spark-admin sa-gate-page" data-testid="admin-forbidden">
        <div className="sa-gate-inner">
          <div className="sa-gate-card sa-gate-danger">
            <div className="sa-gate-icon" aria-hidden="true"><Lock size={36} strokeWidth={2} /></div>
            <h1>Bạn không có quyền truy cập trang quản trị</h1>
            <p>{gateMsg || 'Chỉ tài khoản Super Admin mới được vào khu vực này.'}</p>
            {currentEmail && (
              <p>Tài khoản đang đăng nhập: <strong>{currentEmail}</strong> (vai trò Khách hàng).</p>
            )}
          </div>
          <div className="sa-gate-steps">
            <h2>Cách cấp quyền Super Admin</h2>
            <ol>
              <li>Mở PowerShell tại thư mục <code>C:\Users\Acer\DAFL</code>.</li>
              <li>Chạy lệnh SQL sau (đổi email thành email tài khoản của bạn):</li>
            </ol>
            <pre>
              {`docker compose exec postgres psql -U dafl -d dafl_db -c "UPDATE "Users" SET "Role"='SuperAdmin' WHERE "Email"='${sqlEmail}';"`}
            </pre>
            <ol start={3}>
              <li>Đăng xuất khỏi web rồi đăng nhập lại bằng đúng tài khoản đó.</li>
              <li>Mở lại địa chỉ <code>/admin</code>.</li>
            </ol>
            <div className="sa-gate-actions">
              <button type="button" onClick={() => navigate('/')} className="sa-btn">Về trang chủ</button>
              <button type="button" onClick={() => { clearToken(); navigate('/login'); }} className="sa-btn sa-btn-ghost">Đăng nhập tài khoản khác</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (gate === 'no-admin') {
    return (
      <div className="spark-admin sa-gate-page" data-testid="admin-page">
        <div className="sa-gate-inner">
          <div className="sa-gate-card sa-gate-danger">
            <div className="sa-gate-icon" aria-hidden="true"><Lock size={36} strokeWidth={2} /></div>
            <h1>Chưa có tài khoản Super Admin</h1>
            <p>{gateMsg}</p>
          </div>
          <div className="sa-gate-steps">
            <h2>Cách tạo Super Admin</h2>
            <p style={{ lineHeight: 1.8, margin: '0 0 0.75rem' }}>Đăng nhập bằng tài khoản của bạn rồi chạy SQL trong PowerShell tại <code>C:\Users\Acer\DAFL</code>:</p>
            <pre>
              {`docker compose exec postgres psql -U dafl -d dafl_db -c "UPDATE "Users" SET "Role"='SuperAdmin' WHERE "Email"='email-cua-ban';"}`}
            </pre>
            <p style={{ lineHeight: 1.8 }}>Sau đó đăng nhập lại rồi mở <code>/admin</code>.</p>
            <div className="sa-gate-actions">
              <button type="button" onClick={() => navigate('/')} className="sa-btn">Về trang chủ</button>
              <button type="button" onClick={() => { clearToken(); navigate('/login'); }} className="sa-btn sa-btn-ghost">Đăng nhập tài khoản khác</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /** G4 — phiên hết hạn (đợt 18, spec A–H): popup KHÔNG đóng được (không ESC,
   *  không bấm nền mờ, không nút Hủy), CHỈ 1 nút [Đăng nhập lại] → xóa token
   *  rồi về /login. Thay cho hành vi cũ: toast + tự về /login sau 3 giây.
   *  Chỉ áp cho 401 của các API admin (đi qua failOp, skipAuthHandler);
   *  401 ở màn hình gate lúc tải trang vẫn hiện màn hình "unauthorized". */
  const showSessionExpired = async () => {
    if (sessionExpiredShownRef.current) return;
    sessionExpiredShownRef.current = true;
    await confirmAction({
      title: messages.confirm.sessionExpired.title,
      message: messages.confirm.sessionExpired.message,
      confirmText: messages.confirm.sessionExpired.confirmText,
      variant: 'warning',
      singleButton: true,
      nonDismissable: true,
    });
    clearToken();
    navigate('/login');
  };

  /** G5 — mất mạng khi lưu (đợt 18, spec A–H): chỉ gọi khi fetch NÉM lỗi
   *  (mất mạng/timeout) trong khối catch của hàm lưu; lỗi validate hay lỗi
   *  server (body.success = false) đã có message riêng, không hiện popup này.
   *  Trả true khi admin bấm [Thử lại] (caller lưu lại từ đầu). */
  const confirmOfflineRetry = async (): Promise<boolean> => {
    const { confirmed } = await confirmAction({
      title: messages.confirm.offlineRetry.title,
      message: messages.confirm.offlineRetry.message,
      confirmText: messages.confirm.offlineRetry.confirmText,
      cancelText: 'Đóng',
      variant: 'warning',
    });
    return confirmed;
  };

  /** G3 — đăng xuất (đợt 18, spec A–H): hỏi trước khi xóa token + về /login. */
  const requestLogout = async () => {
    const { confirmed } = await confirmAction({
      title: messages.confirm.logout.title,
      message: fmt(messages.confirm.logout.message, {
        tên: shortName(profile?.fullName ?? profile?.email ?? 'quản trị viên'),
      }),
      confirmText: messages.confirm.logout.confirmText,
      cancelText: 'Hủy',
      variant: 'info',
    });
    if (!confirmed) return;
    setAvatarMenuOpen(false);
    clearToken();
    navigate('/login');
  };

  /** Lỗi thao tác (đợt 18): toast theo bảng §4 — KHÔNG hiện mã HTTP;
   *  401 → popup G4 "Phiên đăng nhập đã hết hạn" (không đóng được, chỉ nút
   *  [Đăng nhập lại]) thay cho toast + tự về /login sau 3 giây. */
  const failOp = (status?: number, apiMessage?: string) => {
    if (status === 401) {
      void showSessionExpired();
      return;
    }
    notifyHttpError(status, apiMessage);
  };

  /** Tone badge hành động nhật ký: LOCK đỏ, UNLOCK xanh lá, DELETE đỏ đậm, khác xám. */
  const auditActionTone = (action: string): 'red' | 'green' | 'gray' =>
    /UNLOCK/i.test(action) ? 'green' : /LOCK|DELETE/i.test(action) ? 'red' : 'gray';

  // Badge menu: trả hàng chờ duyệt (từ danh sách), đánh giá mới 7 ngày (đếm
  // riêng). Đợt 21: BỎ badge số bên cạnh menu "Đơn hàng" (không còn đếm
  // pendingOrders cho menu). null = chưa tải/không đếm được → ẩn badge.
  const pendingReturnsCount = returnsList.filter(r => r.status === 'Pending').length;

  // Đợt 21 — lọc SP CLIENT-SIDE trên tối đa 100 SP đã tải (xem loadProducts):
  // 3 bộ lọc KẾT HỢP đồng thời (AND), không ghi đè nhau: (a) từ khóa đã
  // debounce + fold dấu khớp tên HOẶC mã SP, (b) danh mục, (c) trạng thái
  // isActive. GIỚI HẠN: tìm/lọc chỉ phủ tối đa 100 SP đã tải; SP cũ hơn
  // không tìm được nếu không có hỗ trợ search theo mã ở BE.
  const filteredProducts = products.filter(p => {
    const q = foldVietnamese(productSearchDebounced.trim());
    const matchesSearch = !q
      || foldVietnamese(p.name).includes(q)
      || foldVietnamese(p.code ?? '').includes(q);
    return matchesSearch
      && (!productCatFilter || p.categoryId === productCatFilter)
      && (!productStatusFilter || String(p.isActive ?? true) === productStatusFilter);
  });
  /** Có bộ lọc SP nào đang bật không (để disable nút "Đặt lại bộ lọc"). */
  const productsHasFilter = !!productSearch.trim() || !!productCatFilter || !!productStatusFilter;

  // Lọc client-side cho các bảng chưa có tham số search ở backend.
  // Đợt 21 — DM/trả hàng dùng từ khóa ĐÃ DEBOUNCE + tìm không dấu
  // (foldVietnamese, như đơn hàng): "danh muc" khớp "Danh mục".
  const filteredCategories = categories.filter(c => {
    if (catStatusFilter && String(c.isActive) !== catStatusFilter) return false;
    const q = foldVietnamese(catSearchDebounced.trim());
    if (!q) return true;
    return foldVietnamese(c.name).includes(q) || foldVietnamese(c.slug).includes(q);
  });
  const filteredPromos = promos.filter(p =>
    !promoSearch.trim() || p.code.toLowerCase().includes(promoSearch.trim().toLowerCase()) || (p.description ?? '').toLowerCase().includes(promoSearch.trim().toLowerCase())
  );
  // Lọc trạng thái khách client-side (BE ListCustomers chỉ nhận search/tier):
  // 'active' = đang hoạt động (không khoá), 'locked' = đã khoá.
  const filteredCustomers = customers.filter(c =>
    (!customerStatusFilter || (customerStatusFilter === 'locked' ? !!c.isLocked : !c.isLocked))
  );
  // Đợt 21 — lọc trả hàng TỰ ĐỘNG (không cần bấm Tìm): trạng thái lọc
  // client-side trên danh sách đã tải (như DM/đơn), từ khóa lọc sau debounce
  // 300ms, tìm không dấu. (Trước đợt 21, dropdown chỉ có tác dụng khi bấm
  // nút Tìm gọi lại API; nút Tìm đã bỏ nên trạng thái PHẢI lọc client-side
  // ở đây, nếu không dropdown sẽ chết.)
  const filteredReturns = returnsList.filter(r => {
    if (returnStatusFilter && r.status !== returnStatusFilter) return false;
    if (!returnSearchDebounced.trim()) return true;
    const q = foldVietnamese(returnSearchDebounced.trim());
    return foldVietnamese(r.orderDisplayCode ?? r.orderId).includes(q)
      || foldVietnamese(r.productName).includes(q)
      || foldVietnamese(r.reason).includes(q);
  });
  const filteredAudit = auditLogs.filter(a => {
    const matchesSearch =
      !auditSearch.trim() ||
      a.actorEmail.toLowerCase().includes(auditSearch.trim().toLowerCase()) ||
      a.action.toLowerCase().includes(auditSearch.trim().toLowerCase()) ||
      (a.entityType ?? '').toLowerCase().includes(auditSearch.trim().toLowerCase());
    // So sánh theo ngày (YYYY-MM-DD) của createdAt (ISO) với khoảng đã áp dụng.
    const day = (a.createdAt || '').slice(0, 10);
    const matchesDate =
      (!auditDateFrom || day >= auditDateFrom) &&
      (!auditDateTo || day <= auditDateTo);
    return matchesSearch && matchesDate;
  });

  // ---------- Phân trang client-side (10 dòng/trang) trên dữ liệu đã tải ----------
  const paginate = <T,>(rows: T[], page: number) => {
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    return { totalPages, safePage, paged: rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE) };
  };
  // Đợt 21 — lọc đơn CLIENT-SIDE trên tối đa 100 đơn đã tải (xem loadOrders):
  // (a) nhóm trạng thái ("Chờ xác nhận" = Pending+Paid), (b) từ khóa đã fold
  // dấu khớp mã đơn (cả dạng "DH-..." lẫn "#<orderCode>"), tên khách, email.
  // Phân trang chạy trên danh sách ĐÃ LỌC này, không phải orders gốc.
  const filteredOrders = orders.filter(o => {
    const group = ORDER_STATUS_GROUPS.find(g => g.value === orderStatusFilter);
    if (group && !group.statuses.includes(statusName(o.status))) return false;
    const q = foldVietnamese(orderSearchDebounced.trim());
    if (!q) return true;
    const code = o.orderDisplayCode ?? `#${o.orderCode}`;
    return foldVietnamese(code).includes(q)
      || foldVietnamese(`#${o.orderCode}`).includes(q)
      || foldVietnamese(o.customerName).includes(q)
      || foldVietnamese(o.customerEmail).includes(q);
  });
  const ordersHasFilter = !!orderSearchDebounced.trim() || !!orderStatusFilter;
  // Đợt 21 — DM/KH/Trả/Đánh giá: có bộ lọc đang bật thì EmptyState hiện nút "Xóa bộ lọc".
  const categoriesHasFilter = !!catSearchDebounced.trim() || !!catStatusFilter;
  const customersHasFilter = !!customerSearchDebounced.trim() || !!customerTierFilter || !!customerStatusFilter;
  const reviewsHasFilter = !!reviewSearchDebounced.trim() || !!reviewRatingFilter;
  const returnsHasFilter = !!returnSearchDebounced.trim() || !!returnStatusFilter;
  const ordersPaging = paginate(filteredOrders, ordersPage);
  const productsPaging = paginate(filteredProducts, productsPage);
  const categoriesPaging = paginate(filteredCategories, categoriesPage);
  const promosPaging = paginate(filteredPromos, promosPage);
  const customersPaging = paginate(filteredCustomers, customersPage);
  const returnsPaging = paginate(filteredReturns, returnsPage);
  const auditPaging = paginate(filteredAudit, auditPage);

  // Phân trang server-side cho đánh giá (Pagination dùng chung): API không trả
  // total nên "Tổng N dòng" là số dòng đã thấy trên các trang đã tải (+1 dòng ảo
  // khi còn trang sau, để Pagination hiện được nút/trang kế tiếp); tổng số
  // trang = trang hiện tại + 1 khi còn trang sau. Khi BE trả total thì dùng
  // total thật (xem loadReviews).
  const reviewsTotalPages = reviewsTotal != null
    ? Math.max(1, Math.ceil(reviewsTotal / PAGE_SIZE))
    : reviewsPage + (reviewsHasNext ? 1 : 0);
  const reviewsTotalForPager = reviewsTotal
    ?? (reviewsPage - 1) * PAGE_SIZE + reviews.length + (reviewsHasNext ? 1 : 0);

  /**
   * Mở trang chi tiết đơn (đợt 21): route thật /orders/:code, kèm state.orderId
   * để trang chi tiết khỏi phải resolve code → id. Bấm đơn ở danh sách gọi
   * openOrderDetail(o.id) — code tự tra từ bảng orders đã tải; dashboard
   * truyền code thẳng vì dòng dashboard không có trong state orders.
   * Browser back hoạt động vì đây là route thật (không còn Drawer).
   * LƯU Ý cho worker danh sách: cứ gọi navigate(`/orders/${code}`,
   * { state: { orderId: id } }) trực tiếp cũng được — cùng contract này.
   */
  const openOrderDetail = (id: string, code?: string | null) => {
    const row = orders.find(o => o.id === id);
    const displayCode = code ?? row?.orderDisplayCode ?? (row ? `#${row.orderCode}` : null);
    if (!displayCode) return;
    navigate(`/orders/${displayCode}`, { state: { orderId: id } });
  };

  /**
   * Lưu sản phẩm (đợt 17, sửa đợt 21): form đã validate xong, chỉ gọi API.
   * Trả { ok, error, fieldErrors } để form biết có đóng hay hiện lỗi trong form;
   * thành công thì về danh sách SP (route /admin, tab products) + toast (form
   * tự toast qua notify + messages.vi) + reload + highlight hàng vừa lưu.
   * Payload giữ nguyên field cũ + thêm code (để trống khi tạo → BE tự sinh SP-xxxx;
   * khi sửa không gửi code vì ô Mã đã disable) + imageUrls (ảnh chính đầu tiên) và
   * isActive cả khi tạo (BE bỏ qua field lạ nếu request DTO chưa có).
   * Lỗi trùng mã: map xuống field 'code' (message đỏ dưới ô Mã) + toast cùng nội dung;
   * lỗi khác không map được field: hiện toast (không lỗi nào im lặng).
   */
  const saveProduct = async (payload: ProductSavePayload): Promise<FormSaveResult> => {
    const body2 = {
      name: payload.name, categoryId: payload.categoryId, price: payload.price,
      originalPrice: payload.originalPrice, stock: payload.stock,
      description: payload.description, imageUrl: payload.imageUrl,
      imageUrls: payload.imageUrls, isActive: payload.isActive,
      ...(payload.code ? { code: payload.code } : {}),
    };
    try {
      const { body } = payload.id
        ? await apiJson<unknown>(`/api/admin/products/${payload.id}`, { method: 'PUT', skipAuthHandler: true, body: JSON.stringify(body2) })
        : await apiJson<unknown>('/api/admin/products', { method: 'POST', skipAuthHandler: true, body: JSON.stringify(body2) });
      if (body?.success) {
        const rows = await loadProducts();
        const createdId = (body.data as { id?: string } | null)?.id ?? rows?.find(r => r.name === payload.name)?.id;
        if (createdId) setHighlightId(createdId);
        navigate('/admin', { state: { tab: 'products' } });
        return { ok: true };
      }
      const err = apiErr(body, 'Không lưu được sản phẩm.');
      return { ok: false, ...toFormSaveError(err, ['code']) };
    } catch {
      // G5: mất mạng khi lưu — hỏi [Đóng][Thử lại]; Thử lại thì lưu lại từ đầu.
      if (await confirmOfflineRetry()) return saveProduct(payload);
      return { ok: false, error: 'Không thể kết nối đến máy chủ.' };
    }
  };

  /** Gạt Switch SP (đợt 21, 22:37): modal xác nhận CHUNG (messages.confirm.
   *  statusChange: "Xác nhận thay đổi trạng thái?" + "Bạn có chắc chắn muốn
   *  thay đổi trạng thái của sản phẩm [Tên SP] không?", đúng 2 nút Hủy/Xác
   *  nhận) — KHÔNG dùng nội dung C1/C2 cũ "Ẩn sản phẩm?"/"Hiển thị sản phẩm?"
   *  ở toggle nữa (key hideProduct/showProduct giữ lại trong messages.vi.ts,
   *  không xóa). Xác nhận mới gọi API (switch giữ nguyên khi Hủy). */
  const requestToggleProduct = async (p: PublicProduct, next: boolean) => {
    const { confirmed } = await confirmAction({
      title: messages.confirm.statusChange.title,
      message: fmt(messages.confirm.statusChange.message, { loại: 'sản phẩm', tên: shortName(p.name) }),
      confirmText: messages.confirm.statusChange.confirmText,
      cancelText: 'Hủy',
      variant: 'info',
    });
    if (!confirmed) return;
    await toggleProductStatus(p, next);
  };

  /** Gạt Switch SP: PUT toàn bộ field hiện có + isActive đảo ngược.
   *  Thành công → toast chung messages.toast.product.statusChanged
   *  ("Đổi trạng thái sản phẩm thành công!"); lỗi → toast lỗi + giữ nguyên
   *  trạng thái cũ (không đổi Toggle). */
  const toggleProductStatus = async (p: PublicProduct, next: boolean) => {
    try {
      const { status, body } = await apiJson<unknown>(`/api/admin/products/${p.id}`, {
        method: 'PUT', skipAuthHandler: true,
        body: JSON.stringify({
          name: p.name, categoryId: p.categoryId, price: p.price,
          originalPrice: p.originalPrice ?? null, stock: p.availableStock ?? p.stock ?? 0,
          description: p.description ?? '', imageUrl: p.imageUrl ?? '', isActive: next,
        }),
      });
      if (body?.success) {
        notify.success(messages.toast.product.statusChanged.title, fmt(messages.toast.product.statusChanged.desc, { tên: shortName(p.name) }));
        await loadProducts();
      } else failOp(status, body?.message);
    } catch { failOp(0); }
  };

  /** Xoá SP (đợt 18, §6.1/§6.6 + BR-04): đang Hoạt động → popup CHẶN xoá đúng 2 nút
   *  [Hủy] + [Chuyển sang Ngừng hoạt động]; đã Ngừng → popup xoá (danger, không hoàn tác).
   *  isActive chưa rõ (dữ liệu cũ chưa có field) → cho xoá qua hộp xác nhận như cũ. */
  const requestDeleteProduct = async (p: PublicProduct) => {
    if (p.isActive === true) {
      const { confirmed } = await confirmAction({
        title: 'Không thể xóa sản phẩm',
        message: `Không thể xóa sản phẩm **${shortName(p.name)}** đang hoạt động. Vui lòng chuyển trạng thái sang Ngừng hoạt động trước.`,
        confirmText: 'Chuyển sang Ngừng hoạt động',
        cancelText: 'Hủy',
        variant: 'warning',
      });
      if (!confirmed) return;
      await requestToggleProduct(p, false);
      return;
    }
    const { confirmed } = await confirmAction({
      title: messages.confirm.deleteProduct.title,
      message: fmt(messages.confirm.deleteProduct.message, { tên: shortName(p.name) }),
      confirmText: messages.confirm.deleteProduct.confirmText,
      cancelText: 'Hủy',
      variant: 'danger',
      irreversible: true,
    });
    if (!confirmed) return;
    await deleteProduct(p);
  };

  const deleteProduct = async (p: PublicProduct) => {
    try {
      const { status, body } = await apiJson<string>(`/api/admin/products/${p.id}`, { method: 'DELETE', skipAuthHandler: true });
      if (body?.success) {
        notify.success(messages.toast.product.deleted.title, fmt(messages.toast.product.deleted.desc, { tên: shortName(p.name) }));
        await loadProducts();
      } else failOp(status, body?.message);
    } catch { failOp(0); }
  };

  /** Lưu danh mục: giữ field cũ + thêm code (để trống khi tạo → BE tự sinh DM-xxxx;
   *  khi sửa không gửi code) + slug, iconUrl (ảnh).
   *  Backend cũ chưa có Slug/IconUrl trong UpdateCategoryRequest sẽ bỏ qua
   *  field lạ; worker backend đang bổ sung song song.
   *  Lỗi trùng mã/slug: map xuống đúng field + toast cùng nội dung (mẫu VCB §2). */
  const saveCategory = async (payload: CategorySavePayload): Promise<FormSaveResult> => {
    const body2 = {
      name: payload.name, description: payload.description || null,
      isActive: payload.isActive, sortOrder: payload.sortOrder,
      slug: payload.slug || null, iconUrl: payload.iconUrl || null,
      ...(payload.code ? { code: payload.code } : {}),
    };
    try {
      const { body } = payload.id
        ? await apiJson<unknown>(`/api/admin/categories/${payload.id}`, { method: 'PUT', skipAuthHandler: true, body: JSON.stringify(body2) })
        : await apiJson<unknown>('/api/admin/categories', { method: 'POST', skipAuthHandler: true, body: JSON.stringify(body2) });
      if (body?.success) {
        const rows = await loadCategories();
        const createdId = (body.data as { id?: string } | null)?.id ?? rows?.find(r => r.name === payload.name)?.id;
        if (createdId) setHighlightId(createdId);
        // Đợt 21 — trang full page: cha (wrapper saveCategoryPage) về danh
        // sách sau khi lưu; form tự toast tên DM trong handleSubmit.
        return { ok: true };
      }
      const err = apiErr(body, 'Không lưu được danh mục.');
      return { ok: false, ...toFormSaveError(err, ['code', 'slug']) };
    } catch {
      // G5: mất mạng khi lưu — hỏi [Đóng][Thử lại]; Thử lại thì lưu lại từ đầu.
      if (await confirmOfflineRetry()) return saveCategory(payload);
      return { ok: false, error: 'Không thể kết nối đến máy chủ.' };
    }
  };

  /** Gạt Switch DM (đợt 21): modal xác nhận CHUNG thay popup C6/C7 cũ ở
   *  toggle — messages.confirm.statusChange {loại: 'danh mục', tên}; đúng 2
   *  nút [Hủy] + [Xác nhận]. Key C6/C7 (hideCategory/showCategory) GIỮ LẠI
   *  trong messages.vi.ts, không xóa (spec 22:37 §B). */
  const requestToggleCategory = async (c: AdminCategory, next: boolean) => {
    const { confirmed } = await confirmAction({
      title: messages.confirm.statusChange.title,
      message: fmt(messages.confirm.statusChange.message, { loại: 'danh mục', tên: shortName(c.name) }),
      confirmText: messages.confirm.statusChange.confirmText,
      cancelText: 'Hủy',
      variant: 'info',
    });
    if (!confirmed) return;
    await toggleCategoryStatus(c, next);
  };

  /** Gạt Switch DM: PUT toàn bộ field hiện có + isActive đảo ngược.
   *  Toast chung đợt 21: "Đổi trạng thái danh mục thành công!" (có "!"). */
  const toggleCategoryStatus = async (c: AdminCategory, next: boolean) => {
    try {
      const { status, body } = await apiJson<unknown>(`/api/admin/categories/${c.id}`, {
        method: 'PUT', skipAuthHandler: true,
        body: JSON.stringify({
          name: c.name, description: c.description ?? null, isActive: next,
          sortOrder: c.sortOrder ?? 0, slug: c.slug ?? null, iconUrl: c.iconUrl ?? null,
        }),
      });
      if (body?.success) {
        notify.success(
          messages.toast.category.statusChanged.title,
          fmt(messages.toast.category.statusChanged.desc, { tên: shortName(c.name) }),
        );
        await loadCategories();
      } else failOp(status, body?.message);
    } catch { failOp(0); }
  };

  /** Xoá DM (đợt 18, spec A–H A2/A3 + BR-04): đang Hoạt động → popup CHẶN xoá
   *  [Hủy] + [Chuyển sang Ngừng hoạt động]; đã Ngừng mà còn SP → popup CHẶN A3
   *  CHỈ 1 nút [Đã hiểu] + link "Xem sản phẩm trong danh mục" (sang tab SP lọc
   *  theo DM đó); đã Ngừng + không còn SP → popup xoá (danger, không hoàn tác).
   *  BE cũng chặn cả 2 trường hợp (DeleteCategoryCommand). */
  const requestDeleteCategory = async (c: AdminCategory) => {
    if (c.isActive === true) {
      const { confirmed } = await confirmAction({
        title: 'Không thể xóa danh mục',
        message: `Không thể xóa danh mục **${shortName(c.name)}** đang hoạt động. Vui lòng chuyển trạng thái sang Ngừng hoạt động trước.`,
        confirmText: 'Chuyển sang Ngừng hoạt động',
        cancelText: 'Hủy',
        variant: 'warning',
      });
      if (!confirmed) return;
      await requestToggleCategory(c, false);
      return;
    }
    if ((c.productCount ?? 0) > 0) {
      await confirmAction({
        title: messages.confirm.deleteCategoryBlocked.title,
        message: fmt(messages.confirm.deleteCategoryBlocked.message, { tên: shortName(c.name), n: c.productCount ?? 0 }),
        confirmText: messages.confirm.deleteCategoryBlocked.confirmText,
        variant: 'warning',
        singleButton: true,
        linkLabel: 'Xem sản phẩm trong danh mục',
        onLinkClick: () => { setProductCatFilter(c.id); setProductsPage(1); setTab('products'); },
      });
      return;
    }
    const { confirmed } = await confirmAction({
      title: messages.confirm.deleteCategory.title,
      message: fmt(messages.confirm.deleteCategory.message, { tên: shortName(c.name) }),
      confirmText: messages.confirm.deleteCategory.confirmText,
      cancelText: 'Hủy',
      variant: 'danger',
      irreversible: true,
    });
    if (!confirmed) return;
    await deleteCategory(c);
  };

  const deleteCategory = async (c: AdminCategory) => {
    try {
      const { status, body } = await apiJson<string>(`/api/admin/categories/${c.id}`, { method: 'DELETE', skipAuthHandler: true });
      if (body?.success) {
        notify.success(messages.toast.category.deleted.title, fmt(messages.toast.category.deleted.desc, { tên: shortName(c.name) }));
        await loadCategories();
      } else failOp(status, body?.message);
    } catch { failOp(0); }
  };

  /** Lưu khuyến mãi: form đã validate xong, chỉ gọi API (luật giữ nguyên).
   *  Sửa voucher Draft: chỉ sửa mô tả/giá trị/hạn/lượt/đơn tối thiểu/trần giảm —
   *  mã, loại giảm, phạm vi và hạng không đổi (BE cũng từ chối sửa các trường đó ở Draft).
   *  PUT chỉ gửi các field sửa được nên field không đổi KHÔNG bị ghi đè bằng rỗng
   *  (form sửa nạp sẵn giá trị hiện tại; startDate/minTier/scope không gửi đi).
   *  Đợt 21 — tạo mới mặc định Nháp, KHÔNG tự kích hoạt: đã BỎ toggle
   *  "Kích hoạt ngay sau khi tạo" + BỎ gọi POST .../activate sau tạo.
   *  Lưu xong (tạo/sửa) thì về danh sách KM (route /admin, tab promotions),
   *  highlight dòng vừa lưu. */
  const savePromo = async (payload: PromoSavePayload): Promise<FormSaveResult> => {
    if (payload.id) {
      const discountValue = Number(payload.discountValue);
      const minOrderAmount = Number(payload.minOrderAmount) || 0;
      try {
        const { body } = await apiJson<unknown>(`/api/admin/promotions/${payload.id}`, {
          method: 'PUT', skipAuthHandler: true,
          body: JSON.stringify({
            description: payload.description,
            discountValue,
            minOrderAmount,
            maxDiscountAmount: payload.maxDiscountAmount.trim() === '' ? null : Number(payload.maxDiscountAmount),
            expiryDate: payload.expiryDate ? new Date(payload.expiryDate).toISOString() : null,
            maxUses: payload.maxUses.trim() === '' ? null : Number(payload.maxUses),
          }),
        });
        if (body?.success) {
          await loadPromos();
          setHighlightId(payload.id);
          navigate('/admin', { state: { tab: 'promotions' } });
          return { ok: true };
        }
        const err = apiErr(body, 'Không sửa được khuyến mãi.');
        return { ok: false, ...toFormSaveError(err, ['code']) };
      } catch {
        // G5: mất mạng khi lưu — hỏi [Đóng][Thử lại]; Thử lại thì lưu lại từ đầu.
        if (await confirmOfflineRetry()) return savePromo(payload);
        return { ok: false, error: 'Không thể kết nối đến máy chủ.' };
      }
    }
    const code = payload.code.trim().toUpperCase();
    const discountValue = Number(payload.discountValue);
    const createPayload = {
      code, description: payload.description, discountType: payload.discountType, discountValue,
      minOrderAmount: Number(payload.minOrderAmount) || 0,
      maxDiscountAmount: payload.maxDiscountAmount.trim() === '' ? null : Number(payload.maxDiscountAmount),
      startDate: payload.startDate ? new Date(payload.startDate).toISOString() : null,
      expiryDate: payload.expiryDate ? new Date(payload.expiryDate).toISOString() : null,
      maxUses: payload.maxUses.trim() === '' ? null : Number(payload.maxUses),
      maxUsesPerUser: payload.maxUsesPerUser.trim() === '' ? null : Number(payload.maxUsesPerUser),
      minTier: payload.minTier || null, scopeType: payload.scopeType,
      scopeCategoryId: payload.scopeType === 'Category' ? payload.scopeCategoryId : null,
      scopeProductIds: payload.scopeType === 'Product' ? payload.scopeProductIds.trim() : null,
    };
    try {
      const { body } = await apiJson<unknown>('/api/admin/promotions', { method: 'POST', skipAuthHandler: true, body: JSON.stringify(createPayload) });
      if (body?.success) {
        let createdId = (body.data as { id?: string } | null)?.id;
        const rows = await loadPromos();
        if (!createdId) createdId = rows?.find(p => p.code === code)?.id;
        if (createdId) setHighlightId(createdId);
        navigate('/admin', { state: { tab: 'promotions' } });
        return { ok: true };
      }
      // Trùng mã voucher: BE giữ nguyên "Mã khuyến mãi đã tồn tại (không phân biệt hoa thường)."
      // → map xuống ô Mã (message đỏ inline) + toast cùng nội dung (mẫu VCB §2).
      const err = apiErr(body, 'Không tạo được khuyến mãi.');
      return { ok: false, ...toFormSaveError(err, ['code']) };
    } catch {
      // G5: mất mạng khi lưu — hỏi [Đóng][Thử lại]; Thử lại thì lưu lại từ đầu.
      if (await confirmOfflineRetry()) return savePromo(payload);
      return { ok: false, error: 'Không thể kết nối đến máy chủ.' };
    }
  };

  /** Đóng form: nếu đã sửa (dirty) thì hỏi "chưa lưu" qua ConfirmDialog có sẵn
   *  (nút Ở lại / Rời trang); chưa sửa thì đóng luôn. */
  /** Về danh sách SP (đợt 21): route /admin + state.tab='products' (mở lại
   *  đúng tab SP). Dùng cho breadcrumb, nút Quay lại, nút Hủy ở trang form. */
  const backToProductList = () => navigate('/admin', { state: { tab: 'products' } });
  /** Đợt 26 — Quay lại dùng chung cho các trang CHI TIẾT: có lịch sử thì
   *  history.back() (vd từ danh sách vào chi tiết, hoặc từ chi tiết sang
   *  trang con), không có lịch sử (vào thẳng URL) thì về danh sách của tab. */
  const goBackOrList = (tab: Tab) => {
    if (window.history.length > 1) window.history.back();
    else navigate('/admin', { state: { tab } });
  };
  const backToProductDetail = () => goBackOrList('products');
  const backToPromoDetail = () => goBackOrList('promotions');
  const backToReturnDetail = () => goBackOrList('returns');
  const backToReviewDetail = () => goBackOrList('reviews');
  /** Đóng trang form SP (đợt 21, thay requestCloseProduct của Drawer cũ):
   *  chưa sửa thì về danh sách luôn; đã sửa (dirty) thì hỏi "chưa lưu" qua
   *  ConfirmDialog (đúng 2 nút [Ở lại] + [Rời trang]) rồi mới về danh sách. */
  const closeProductPage = async (dirty: boolean) => {
    if (!dirty) { backToProductList(); return; }
    const { confirmed } = await confirmAction({
      title: messages.confirm.discardForm.title,
      message: messages.confirm.discardForm.message,
      confirmText: messages.confirm.discardForm.confirmText,
      cancelText: 'Ở lại',
      variant: 'warning',
    });
    if (confirmed) backToProductList();
  };
  /** Về danh sách DM (đợt 21): route /admin + state.tab='categories' (mở lại
   *  đúng tab DM). Dùng cho breadcrumb, nút Quay lại, nút Hủy ở trang form. */
  const backToCategoryList = () => navigate('/admin', { state: { tab: 'categories' } });
  /** Đóng trang form DM (đợt 21, thay requestCloseCategory của Drawer cũ):
   *  chưa sửa thì về danh sách luôn; đã sửa (dirty) thì hỏi "chưa lưu" qua
   *  ConfirmDialog (đúng 2 nút [Ở lại] + [Rời trang]) rồi mới về danh sách. */
  const closeCategoryPage = async (dirty: boolean) => {
    if (!dirty) { backToCategoryList(); return; }
    const { confirmed } = await confirmAction({
      title: messages.confirm.discardForm.title,
      message: messages.confirm.discardForm.message,
      confirmText: messages.confirm.discardForm.confirmText,
      cancelText: 'Ở lại',
      variant: 'warning',
    });
    if (confirmed) backToCategoryList();
  };
  /** Lưu DM từ trang full page: saveCategory gọi API + reload; thành công
   *  thì về danh sách (toast tên DM do CategoryForm tự hiện). */
  const saveCategoryPage = async (payload: CategorySavePayload): Promise<FormSaveResult> => {
    const r = await saveCategory(payload);
    if (r.ok) backToCategoryList();
    return r;
  };
  /** Về danh sách KM (đợt 21): route /admin + state.tab='promotions' (mở lại
   *  đúng tab KM). Dùng cho breadcrumb, nút Quay lại, nút Hủy ở trang form. */
  const backToPromoList = () => navigate('/admin', { state: { tab: 'promotions' } });
  /** Đóng trang form KM (đợt 21, thay requestClosePromo của Drawer cũ):
   *  chưa sửa thì về danh sách luôn; đã sửa (dirty) thì hỏi "chưa lưu" qua
   *  ConfirmDialog (đúng 2 nút [Ở lại] + [Rời trang]) rồi mới về danh sách. */
  const closePromoPage = async (dirty: boolean) => {
    if (!dirty) { backToPromoList(); return; }
    const { confirmed } = await confirmAction({
      title: messages.confirm.discardForm.title,
      message: messages.confirm.discardForm.message,
      confirmText: messages.confirm.discardForm.confirmText,
      cancelText: 'Ở lại',
      variant: 'warning',
    });
    if (confirmed) backToPromoList();
  };
  /** Về danh sách KH (đợt 21): route /admin + state.tab='customers' (mở lại
   *  đúng tab KH). Dùng cho breadcrumb, nút Quay lại, nút Hủy ở trang form. */
  const backToCustomerList = () => navigate('/admin', { state: { tab: 'customers' } });
  /** Đóng trang form KH (đợt 21, thay requestCloseCustomer của Drawer cũ):
   *  chưa sửa thì về danh sách luôn; đã sửa (dirty) thì hỏi "chưa lưu" qua
   *  ConfirmDialog (đúng 2 nút [Ở lại] + [Rời trang]) rồi mới về danh sách. */
  const closeCustomerPage = async (dirty: boolean) => {
    if (!dirty) { backToCustomerList(); return; }
    const { confirmed } = await confirmAction({
      title: messages.confirm.discardForm.title,
      message: messages.confirm.discardForm.message,
      confirmText: messages.confirm.discardForm.confirmText,
      cancelText: 'Ở lại',
      variant: 'warning',
    });
    if (confirmed) backToCustomerList();
  };
  /** Lưu KH từ trang full page: saveCustomer gọi API + reload; thành công
   *  thì về danh sách (toast tên KH do CustomerForm tự hiện). */
  const saveCustomerPage = async (payload: CustomerSavePayload): Promise<FormSaveResult> => {
    const r = await saveCustomer(payload);
    if (r.ok) backToCustomerList();
    return r;
  };

  /** Giá trị ban đầu cho CustomerForm (view/edit): Mã KH + Email chỉ xem. */
  const customerFormInitial = (c: Customer): CustomerFormInitial => ({
    id: c.id, code: c.code ?? '', fullName: c.fullName, email: c.email,
    phoneNumber: c.phoneNumber ?? '', address: c.address ?? '', createdAt: c.createdAt,
  });
  /** Mở trang sửa khách (đợt 21): route thật /customers/:code/edit (dùng
   *  CustomerCode, fallback id khi KH cũ chưa có mã), kèm state.customerId. */
  const openCustomerEdit = (c: Customer) => {
    navigate(`/customers/${c.code ?? c.id}/edit`, { state: { customerId: c.id } });
  };
  /** Mở trang xem khách (đợt 21): route thật /customers/:code. */
  const openCustomerView = (c: Customer) => {
    navigate(`/customers/${c.code ?? c.id}`, { state: { customerId: c.id } });
  };

  /** Giá trị ban đầu cho ProductForm (view/edit). BE chỉ trả 1 imageUrl nên
   *  gallery chế độ xem chỉ có 1 ảnh (imageUrls = [imageUrl]). */
  const productFormInitial = (p: PublicProduct): ProductFormInitial => ({
    id: p.id, code: p.code ?? '', name: p.name, categoryId: p.categoryId,
    price: String(p.price), originalPrice: p.originalPrice ? String(p.originalPrice) : '',
    stock: String(p.availableStock ?? p.stock ?? 0), description: p.description ?? '',
    imageUrl: p.imageUrl ?? '', imageUrls: p.imageUrl ? [p.imageUrl] : [], isActive: p.isActive ?? true,
  });
  /** Giá trị ban đầu cho trang thêm mới SP (đợt 21): danh mục mặc định là
   *  danh mục đầu tiên (như Drawer cũ), trạng thái mặc định đang bán. */
  const productCreateInitial: ProductFormInitial = {
    id: '', code: '', name: '', categoryId: categories[0]?.id ?? '', price: '', originalPrice: '',
    stock: '', description: '', imageUrl: '', imageUrls: [], isActive: true,
  };
  /** Mở trang thêm mới SP (đợt 21): route thật /products/new. */
  const openProductCreate = () => {
    navigate('/products/new');
  };
  /** Mở trang chi tiết SP (đợt 21): route thật /products/:code (dùng code,
   *  fallback id khi SP cũ chưa có code). */
  const openProductView = (p: PublicProduct) => {
    navigate(`/products/${p.code ?? p.id}`);
  };
  /** Mở trang chỉnh sửa SP (đợt 21): route thật /products/:code/edit. */
  const openProductEdit = (p: PublicProduct) => {
    navigate(`/products/${p.code ?? p.id}/edit`);
  };

  /** Giá trị ban đầu cho CategoryForm (view/edit). */
  const categoryFormInitial = (c: AdminCategory): CategoryFormInitial => ({
    id: c.id, code: c.code ?? '', name: c.name, description: c.description ?? '',
    sortOrder: String(c.sortOrder ?? 0), isActive: c.isActive, slug: c.slug ?? '', iconUrl: c.iconUrl ?? '',
  });
  /** Giá trị ban đầu cho trang thêm mới DM (đợt 21): trạng thái mặc định hiển thị. */
  const categoryCreateInitial: CategoryFormInitial = {
    id: '', code: '', name: '', description: '', sortOrder: '0', isActive: true, slug: '', iconUrl: '',
  };
  /** Mở trang thêm mới DM (đợt 21): route thật /categories/new. */
  const openCategoryCreate = () => {
    navigate('/categories/new');
  };
  /** Mở trang chi tiết DM (đợt 21): route thật /categories/:code (dùng code,
   *  fallback id khi DM cũ chưa có code), kèm state.categoryId. */
  const openCategoryView = (c: AdminCategory) => {
    navigate(`/categories/${c.code ?? c.id}`, { state: { categoryId: c.id } });
  };
  /** Mở trang chỉnh sửa DM (đợt 21): route thật /categories/:code/edit. */
  const openCategoryEdit = (c: AdminCategory) => {
    navigate(`/categories/${c.code ?? c.id}/edit`, { state: { categoryId: c.id } });
  };

  /** Lưu khách hàng (đợt 17): PUT /api/admin/customers/{id} (BE follow-up đợt 17).
   *  Lỗi trùng mã/SĐT map xuống đúng ô + toast cùng nội dung (mẫu VCB §2). */
  const saveCustomer = async (payload: CustomerSavePayload): Promise<FormSaveResult> => {
    try {
      const { status, body } = await apiJson<unknown>(`/api/admin/customers/${payload.id}`, {
        method: 'PUT', skipAuthHandler: true,
        body: JSON.stringify({ fullName: payload.fullName, phoneNumber: payload.phoneNumber, address: payload.address }),
      });
      if (body?.success) {
        // Thành công: form tự toast qua notify + messages.vi (W2) — cha chỉ reload.
        await loadCustomers();
        setHighlightId(payload.id);
        return { ok: true };
      }
      const err = apiErr(body, 'Không lưu được thông tin khách hàng.');
      return { ok: false, ...toFormSaveError(err, ['code', 'phoneNumber', 'fullName']) };
    } catch {
      // G5: mất mạng khi lưu — hỏi [Đóng][Thử lại]; Thử lại thì lưu lại từ đầu.
      if (await confirmOfflineRetry()) return saveCustomer(payload);
      return { ok: false, error: 'Không thể kết nối đến máy chủ.' };
    }
  };

  /** Giá trị ban đầu cho PromoForm trang chỉnh sửa (đợt 21): nạp giá trị hiện có
   *  (mã/loại/phạm vi chỉ xem khi sửa). Trang sửa tự load từ promoResolved. */
  const promoFormInitial = (p: Promotion): PromoFormInitial => ({
    id: p.id, code: p.code, description: p.description ?? '', discountType: p.discountType,
    discountValue: String(p.discountValue), minOrderAmount: String(p.minOrderAmount ?? 0),
    maxDiscountAmount: p.maxDiscountAmount != null ? String(p.maxDiscountAmount) : '',
    startDate: toLocalInput(p.startDate), expiryDate: toLocalInput(p.expiryDate),
    maxUses: p.maxUses != null ? String(p.maxUses) : '', maxUsesPerUser: p.maxUsesPerUser != null ? String(p.maxUsesPerUser) : '1',
    minTier: p.minTier ?? '', scopeType: p.scopeType ?? 'All', scopeCategoryId: '', scopeProductIds: '',
    statusLabel: PROMO_STATUS_LABELS[p.status] ?? p.status, createdAt: p.createdAt,
  });
  /** Giá trị ban đầu cho trang thêm mới KM (đợt 21): mặc định loại Phần trăm,
   *  đơn tối thiểu 0, lượt dùng/người 1, phạm vi Toàn sàn. */
  const promoCreateInitial: PromoFormInitial = {
    id: '', code: '', description: '', discountType: 'Percentage', discountValue: '', minOrderAmount: '0',
    maxDiscountAmount: '', startDate: '', expiryDate: '', maxUses: '', maxUsesPerUser: '1',
    minTier: '', scopeType: 'All', scopeCategoryId: '', scopeProductIds: '',
    statusLabel: '', createdAt: '',
  };
  /** Mở trang chỉnh sửa KM (đợt 21): route thật /promotions/:code/edit.
   *  Dùng cho nút Sửa ở bảng + nút phải [Chỉnh sửa khuyến mãi] của popup C5. */
  const openPromoEdit = (p: Promotion) => {
    navigate(`/promotions/${p.code}/edit`);
  };
  /** Mở trang chi tiết KM (đợt 21): route thật /promotions/:code. */
  const openPromoView = (p: Promotion) => {
    navigate(`/promotions/${p.code}`);
  };
  /** Mở trang thêm mới KM (đợt 21): route thật /promotions/new. */
  const openPromoCreate = () => {
    navigate('/promotions/new');
  };

  /** Xóa voucher (đợt 18, spec A–H A4/A5): đã có lượt dùng hoặc không còn ở
   *  Nháp → popup CHẶN A5 [Đóng] + [Tắt khuyến mãi] (nút phải mở thẳng popup
   *  tắt C3); Draft chưa dùng → popup xoá (danger, không hoàn tác).
   *  BE cũng chặn (DeletePromotionCommand: chỉ Draft + UsedCount = 0). */
  const requestDeletePromo = async (p: Promotion) => {
    if (p.status !== 'Draft' || (p.usedCount ?? 0) > 0) {
      const { confirmed } = await confirmAction({
        title: messages.confirm.deletePromoBlocked.title,
        message: fmt(messages.confirm.deletePromoBlocked.message, { mã: p.code, n: p.usedCount ?? 0 }),
        confirmText: messages.confirm.deletePromoBlocked.confirmText,
        cancelText: 'Đóng',
        variant: 'warning',
      });
      if (!confirmed) return;
      await requestDisablePromo(p);
      return;
    }
    const { confirmed } = await confirmAction({
      title: messages.confirm.deletePromo.title,
      message: fmt(messages.confirm.deletePromo.message, { mã: p.code }),
      confirmText: messages.confirm.deletePromo.confirmText,
      cancelText: 'Hủy',
      variant: 'danger',
      irreversible: true,
    });
    if (!confirmed) return;
    await deletePromo(p);
  };

  const deletePromo = async (p: Promotion) => {
    try {
      const { status, body } = await apiJson<string>(`/api/admin/promotions/${p.id}`, { method: 'DELETE', skipAuthHandler: true });
      if (body?.success) {
        notify.success(messages.toast.promo.deleted.title, fmt(messages.toast.promo.deleted.desc, { mã: p.code }));
        await loadPromos();
      } else failOp(status, body?.message);
    } catch { failOp(0); }
  };

  /** Xóa đánh giá (đợt 18, §6.1): popup xoá (danger, không hoàn tác), đúng 2 nút. */
  const requestDeleteReview = async (r: AdminReview) => {
    const { confirmed } = await confirmAction({
      title: messages.confirm.deleteReview.title,
      message: fmt(messages.confirm.deleteReview.message, {
        'tên khách': shortName(r.userName ?? 'khách hàng'),
        'tên sản phẩm': shortName(r.productName ?? 'sản phẩm'),
      }),
      confirmText: messages.confirm.deleteReview.confirmText,
      cancelText: 'Hủy',
      variant: 'danger',
      irreversible: true,
    });
    if (!confirmed) return;
    await doDeleteReview(r);
  };

  const doDeleteReview = async (r: AdminReview) => {
    try {
      const { status, body } = await apiJson<string>(`/api/admin/evaluations/${r.id}`, { method: 'DELETE', skipAuthHandler: true });
      if (body?.success) {
        // Đợt 21 — xóa từ trang chi tiết full page thì về danh sách đánh giá;
        // xóa từ danh sách thì ở lại danh sách (toast ghi tên khách giữ nguyên).
        if (isReviewRoute) navigate('/admin', { state: { tab: 'reviews' } });
        notify.success(
          messages.toast.review.deleted.title,
          fmt(messages.toast.review.deleted.desc, { 'tên khách': shortName(r.userName ?? 'khách hàng') }),
        );
        const rows = await loadReviews();
        void loadNewReviewsCount(); // làm mới badge đánh giá mới
        // Xóa dòng cuối của trang > 1 thì lùi về trang trước cho khỏi trắng bảng.
        if (rows && rows.length === 0 && reviewsPage > 1) {
          const prev = reviewsPage - 1;
          setReviewsPage(prev);
          await loadReviews({ page: prev });
        }
      } else failOp(status, body?.message);
    } catch { failOp(0); }
  };

  /** Chuyển trang đánh giá (phân trang server-side — tải lại đúng trang đó). */
  const goReviewsPage = (p: number) => { setReviewsPage(p); void loadReviews({ page: p }); };

  /** Bật khuyến mãi (đợt 18, spec A–H C5; đợt 21 22:37 GHI ĐÈ C4): đã hết hạn
   *  (trạng thái Expired hoặc quá ngày hết hạn) → popup CHẶN C5 [Đóng] +
   *  [Chỉnh sửa khuyến mãi] (nút phải mở trang sửa KM full page); còn hạn →
   *  modal xác nhận CHUNG messages.confirm.statusChange (2 nút Hủy/Xác nhận),
   *  KHÔNG dùng popup C4 cũ nữa. BE cũng chặn bật KM hết hạn
   *  (ActivatePromotionCommand). */
  const requestEnablePromo = async (p: Promotion) => {
    const expired = p.status === 'Expired' || (!!p.expiryDate && new Date(p.expiryDate).getTime() < Date.now());
    if (expired) {
      const { confirmed } = await confirmAction({
        title: messages.confirm.enablePromoBlocked.title,
        message: fmt(messages.confirm.enablePromoBlocked.message, {
          mã: p.code,
          ngày: p.expiryDate ? new Date(p.expiryDate).toLocaleDateString('vi-VN') : '—',
        }),
        confirmText: messages.confirm.enablePromoBlocked.confirmText,
        cancelText: 'Đóng',
        variant: 'warning',
      });
      if (!confirmed) return;
      openPromoEdit(p);
      return;
    }
    const { confirmed } = await confirmAction({
      title: messages.confirm.statusChange.title,
      message: fmt(messages.confirm.statusChange.message, { loại: 'khuyến mãi', tên: p.code }),
      confirmText: messages.confirm.statusChange.confirmText,
      cancelText: 'Hủy',
      variant: 'info',
    });
    if (!confirmed) return;
    await activatePromo(p);
  };

  const activatePromo = async (p: Promotion) => {
    try {
      const { status, body } = await apiJson<string>(`/api/admin/promotions/${p.id}/activate`, { method: 'POST', skipAuthHandler: true, body: JSON.stringify({}) });
      if (body?.success) {
        // Đợt 21 (22:37): toast toggle chung statusChanged (có "!" theo chữ
        // Matthew), KHÔNG dùng toast enabled cũ ở toggle nữa.
        notify.success(messages.toast.promo.statusChanged.title, fmt(messages.toast.promo.statusChanged.desc, { mã: p.code }));
        await loadPromos();
      } else failOp(status, body?.message);
    } catch { failOp(0); }
  };

  /** Lý do tắt mặc định khi gạt toggle KM (đợt 21 22:37): modal xác nhận CHUNG
   *  statusChange không có ô nhập lý do, nhưng endpoint POST /disable bắt
   *  Reason NotEmpty (validator BE; handler còn .Trim() nên null sẽ lỗi) —
   *  gửi lý do hệ thống. Luồng chặn xóa A5 vẫn dùng popup C3 có ô lý do thật
   *  (requestDisablePromo) nên lý do do admin nhập vẫn được giữ ở đó. */
  const TOGGLE_DISABLE_REASON = 'Tắt bởi quản trị viên.';

  /** Tắt khuyến mãi bằng TOGGLE (đợt 21 22:37): modal xác nhận CHUNG
   *  messages.confirm.statusChange, KHÔNG dùng popup C3 (lý do bắt buộc) nữa. */
  const requestToggleDisablePromo = async (p: Promotion) => {
    const { confirmed } = await confirmAction({
      title: messages.confirm.statusChange.title,
      message: fmt(messages.confirm.statusChange.message, { loại: 'khuyến mãi', tên: p.code }),
      confirmText: messages.confirm.statusChange.confirmText,
      cancelText: 'Hủy',
      variant: 'info',
    });
    if (!confirmed) return;
    await doDisablePromo(p, TOGGLE_DISABLE_REASON);
  };

  /** Tắt khuyến mãi (đợt 18, §6.3 — giữ cơ chế lý do tắt đợt 17): popup xác nhận
   *  C3 với ô lý do BẮT BUỘC trong popup, đúng 2 nút. Đợt 21 (22:37): CHỈ còn
   *  dùng ở luồng chặn xóa A5 (nút phải [Tắt khuyến mãi]); toggle tắt đã
   *  chuyển sang modal chung statusChange (requestToggleDisablePromo). */
  const requestDisablePromo = async (p: Promotion) => {
    const { confirmed, reason } = await confirmAction({
      title: messages.confirm.disablePromo.title,
      message: fmt(messages.confirm.disablePromo.message, { mã: p.code }),
      confirmText: messages.confirm.disablePromo.confirmText,
      cancelText: 'Hủy',
      variant: 'warning',
      requireReason: true,
      reasonLabel: 'Lý do tắt',
      reasonPlaceholder: 'Nhập lý do tắt khuyến mãi...',
      reasonError: REQUIRED_MSG,
    });
    if (!confirmed) return;
    await doDisablePromo(p, reason ?? '');
  };

  const doDisablePromo = async (p: Promotion, reason: string) => {
    try {
      const { status, body } = await apiJson<string>(`/api/admin/promotions/${p.id}/disable`, { method: 'POST', skipAuthHandler: true, body: JSON.stringify({ reason: reason.trim() }) });
      if (body?.success) {
        // Đợt 21 (22:37): toast toggle chung statusChanged (có "!" theo chữ
        // Matthew), KHÔNG dùng toast disabled cũ ở toggle nữa. Luồng A5 cũng
        // đi qua đây nên toast tắt của nó cũng là statusChanged.
        notify.success(messages.toast.promo.statusChanged.title, fmt(messages.toast.promo.statusChanged.desc, { mã: p.code }));
        await loadPromos();
      } else failOp(status, body?.message);
    } catch { failOp(0); }
  };

  // Đợt 21 — viewPromoUsage + khu vực "Lượt dùng của {mã}" dưới bảng đã BỎ:
  // lượt dùng xem ở trang riêng /promotions/:code/usages (PromoUsagesPage),
  // gọi cùng endpoint GET /api/admin/promotions/{id}/usage.

  /** Gạt Switch KH (đợt 18, §6.2): khóa bắt buộc lý do trong popup, mở khóa không cần lý do. */
  const requestToggleCustomerLock = async (c: Customer) => {
    if (c.isLocked) {
      const { confirmed } = await confirmAction({
        title: messages.confirm.unlockCustomer.title,
        message: fmt(messages.confirm.unlockCustomer.message, { tên: shortName(c.fullName), email: c.email }),
        confirmText: messages.confirm.unlockCustomer.confirmText,
        cancelText: 'Hủy',
        variant: 'info',
      });
      if (!confirmed) return;
      await lockCustomer(c, false);
    } else {
      const { confirmed, reason } = await confirmAction({
        title: messages.confirm.lockCustomer.title,
        message: fmt(messages.confirm.lockCustomer.message, { tên: shortName(c.fullName), email: c.email }),
        confirmText: messages.confirm.lockCustomer.confirmText,
        cancelText: 'Hủy',
        variant: 'warning',
        requireReason: true,
        reasonLabel: messages.validate.lockReasonLabel,
        reasonPlaceholder: 'Nhập lý do khóa tài khoản...',
        reasonError: messages.validate.lockReasonEmpty,
        reasonMaxLength: 300,
      });
      if (!confirmed) return;
      await lockCustomer(c, true, reason ?? '');
    }
  };

  const lockCustomer = async (c: Customer, lock: boolean, reason?: string) => {
    try {
      const { status, body } = lock
        ? await apiJson<string>(`/api/admin/customers/${c.id}/lock`, { method: 'POST', skipAuthHandler: true, body: JSON.stringify({ reason: reason?.trim() || 'Khóa bởi quản trị viên' }) })
        : await apiJson<string>(`/api/admin/customers/${c.id}/unlock`, { method: 'POST', skipAuthHandler: true, body: JSON.stringify({}) });
      if (body?.success) {
        if (lock) notify.success(messages.toast.customer.locked.title, fmt(messages.toast.customer.locked.desc, { email: c.email }));
        else notify.success(messages.toast.customer.unlocked.title, fmt(messages.toast.customer.unlocked.desc, { email: c.email }));
        await loadCustomers();
      } else failOp(status, body?.message);
    } catch { failOp(0); }
  };

  // ---------- Hồ sơ quản trị (đợt 17, FR-ACC) ----------
  /** Tải lại hồ sơ admin (sau khi lưu) để topbar + trang hồ sơ đồng bộ. */
  const refreshProfile = async () => {
    try {
      const { body } = await apiJson<AdminProfile>('/api/admin/profile', { skipAuthHandler: true });
      if (body?.success && body.data) setProfile(body.data);
    } catch { /* giữ hồ sơ cũ khi tải lại lỗi */ }
  };

  /** Lưu thông tin cá nhân admin: PUT /api/admin/profile. Lỗi trùng SĐT map
   *  xuống ô SĐT + toast cùng nội dung (mẫu VCB §2); lỗi khác → toast. */
  const saveAdminProfile = async (payload: { fullName: string; phoneNumber: string | null; address: string | null }): Promise<FormSaveResult> => {
    try {
      const { body } = await apiJson<unknown>('/api/admin/profile', {
        method: 'PUT', skipAuthHandler: true,
        body: JSON.stringify({ fullName: payload.fullName, phoneNumber: payload.phoneNumber, address: payload.address }),
      });
      if (body?.success) {
        await refreshProfile();
        notify.success('Đã cập nhật thông tin cá nhân.');
        return { ok: true };
      }
      const err = apiErr(body, 'Không lưu được thông tin cá nhân.');
      return { ok: false, ...toFormSaveError(err, ['fullName', 'phoneNumber', 'email']) };
    } catch {
      // G5: mất mạng khi lưu — hỏi [Đóng][Thử lại]; Thử lại thì lưu lại từ đầu.
      if (await confirmOfflineRetry()) return saveAdminProfile(payload);
      return { ok: false, error: 'Không thể kết nối đến máy chủ.' };
    }
  };

  /** Đổi mật khẩu admin: POST /api/admin/change-password. Thành công → BE vô hiệu
   *  mọi JWT (TokenVersion tăng) nên đăng xuất ngay về /login (kèm toast). */
  const changeAdminPassword = async (payload: { currentPassword: string; newPassword: string; confirmNewPassword: string }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const { body } = await apiJson<unknown>('/api/admin/change-password', {
        method: 'POST', skipAuthHandler: true,
        body: JSON.stringify(payload),
      });
      if (body?.success) {
        notify.success('Đổi mật khẩu thành công.', 'Vui lòng đăng nhập lại.');
        clearToken();
        navigate('/login');
        return { ok: true };
      }
      const err = apiErr(body, 'Không đổi được mật khẩu.');
      return { ok: false, error: err };
    } catch {
      // G5: mất mạng khi lưu — hỏi [Đóng][Thử lại]; Thử lại thì đổi lại từ đầu.
      if (await confirmOfflineRetry()) return changeAdminPassword(payload);
      return { ok: false, error: 'Không thể kết nối đến máy chủ.' };
    }
  };

  /** Lưu cấu hình hạng (đợt 18, §6.5): kiểm tra ngưỡng tăng dần Thường → Bạc →
   *  Vàng → Kim cương, sai thì báo inline (không gọi API); đúng thì hỏi qua
   *  ConfirmDialog rồi mới PUT. */
  const saveTiers = async () => {
    const order = ['Member', 'Silver', 'Gold', 'Diamond'];
    const sorted = [...tierDraft].sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier));
    const thresholdsOk = sorted.every((t, i) => i === 0 || Number(sorted[i - 1].minSpent) < Number(t.minSpent));
    if (!thresholdsOk) {
      setTiersError(messages.toast.membership.thresholdOrder.desc);
      return;
    }
    const { confirmed } = await confirmAction({
      title: messages.confirm.saveMembershipConfig.title,
      message: messages.confirm.saveMembershipConfig.message,
      confirmText: messages.confirm.saveMembershipConfig.confirmText,
      cancelText: 'Hủy',
      variant: 'info',
    });
    if (!confirmed) return;
    try {
      const { status, body } = await apiJson<MembershipTier[]>('/api/admin/membership/config', {
        method: 'PUT', skipAuthHandler: true,
        body: JSON.stringify({ tiers: tierDraft.map(t => ({ tier: t.tier, minSpent: Number(t.minSpent) || 0, spendPerPoint: Number(t.spendPerPoint) || 1, maxPointsPercent: Number(t.maxPointsPercent) || 0, freeShipThreshold: t.freeShipThreshold === null || t.freeShipThreshold === undefined ? null : Number(t.freeShipThreshold) })) }),
      });
      if (body?.success && Array.isArray(body.data)) {
        setTiers(body.data); setTierDraft(body.data); setTiersError(null);
        notify.success(messages.toast.membership.configSaved.title, messages.toast.membership.configSaved.desc);
      } else failOp(status, body?.message);
    } catch { failOp(0); }
  };

  /** Điều chỉnh điểm (đợt 18, §6.5/§3.7): bắt buộc email/ID + số điểm + lý do;
   *  tra cứu khách để biết email + số dư thật, trừ quá số dư thì báo inline,
   *  rồi hỏi qua ConfirmDialog (hiện rõ cộng/trừ bao nhiêu điểm + số dư mới). */
  const adjustPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustError(null);
    const points = Number(adjustPointsValue);
    if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 1000) { setAdjustError('Số điểm điều chỉnh phải là số nguyên khác 0, tối đa 1000/lần.'); return; }
    if (!adjustReason.trim()) { setAdjustError('Điều chỉnh điểm bắt buộc phải có lý do.'); return; }
    const idInput = adjustId.trim();
    if (!idInput) { setAdjustError('Vui lòng nhập email hoặc ID khách hàng.'); return; }
    setAdjustBusy(true);
    try {
      let found: Customer | undefined;
      if (idInput.includes('@')) {
        const { body } = await apiJson<Customer[]>(`/api/admin/customers?search=${encodeURIComponent(idInput)}&page=1&pageSize=5`, { skipAuthHandler: true });
        found = body?.success && Array.isArray(body.data) ? body.data.find(c => c.email.toLowerCase() === idInput.toLowerCase()) ?? body.data[0] : undefined;
      } else {
        const { body } = await apiJson<{ customer: Customer }>(`/api/admin/customers/${encodeURIComponent(idInput)}`, { skipAuthHandler: true });
        found = body?.success ? body.data?.customer : undefined;
      }
      if (!found) { setAdjustError(messages.toast.membership.customerNotFound.desc); setAdjustBusy(false); return; }
      const balance = found.availablePoints ?? 0;
      const newBalance = balance + points;
      if (newBalance < 0) { setAdjustError(fmt(messages.toast.membership.overBalance.desc, { m: balance })); setAdjustBusy(false); return; }
      // F2/F3 (spec A–H): cộng và trừ là 2 popup riêng — cộng
      // [Hủy][Xác nhận cộng điểm] (info), trừ [Hủy][Xác nhận trừ điểm] (cam).
      const isAdd = points > 0;
      const cfg = isAdd ? messages.confirm.addPoints : messages.confirm.subtractPoints;
      const { confirmed } = await confirmAction({
        title: cfg.title,
        message: fmt(cfg.message, {
          n: Math.abs(points),
          email: found.email,
          m: newBalance,
          'lý do': adjustReason.trim(),
        }),
        confirmText: cfg.confirmText,
        cancelText: 'Hủy',
        variant: isAdd ? 'info' : 'warning',
      });
      if (!confirmed) { setAdjustBusy(false); return; }
      const { status, body } = await apiJson<string>(`/api/admin/membership/${found.id}/adjust-points`, {
        method: 'POST', skipAuthHandler: true, body: JSON.stringify({ points, reason: adjustReason.trim() }),
      });
      if (body?.success) {
        notify.success(
          messages.toast.membership.pointsAdjusted.title,
          fmt(messages.toast.membership.pointsAdjusted.desc, {
            'cộng | trừ': points > 0 ? 'Cộng' : 'Trừ',
            n: Math.abs(points),
            email: found.email,
            m: newBalance,
          }),
        );
        setAdjustPointsValue(''); setAdjustReason(''); setAdjustId('');
      } else failOp(status, body?.message);
    } catch { failOp(0); }
    finally { setAdjustBusy(false); }
  };

  /** Mở trang chi tiết đánh giá (đợt 21): route thật /reviews/:id (id Guid),
   *  kèm state.review để trang chi tiết khỏi phải resolve id → bản ghi. */
  const openReviewDetail = (r: AdminReview) => {
    navigate(`/reviews/${r.id}`, { state: { review: r } });
  };

  /** Mở trang chi tiết trả hàng (đợt 21): route thật /returns/:code (code =
   *  mã đơn hiển thị, nhất quán /orders/:code), kèm state.returnId. */
  const openReturnDetail = (r: ReturnReq) => {
    navigate(`/returns/${r.orderDisplayCode ?? r.orderId}`, { state: { returnId: r.id } });
  };
  /** Về danh sách trả hàng (đợt 21): route /admin + state.tab='returns'. */
  const backToReturnList = () => navigate('/admin', { state: { tab: 'returns' } });
  /** Về danh sách đánh giá (đợt 21): route /admin + state.tab='reviews'. */
  const backToReviewList = () => navigate('/admin', { state: { tab: 'reviews' } });

  /** Ghi nhận đã hoàn tiền (§9.2, đợt 13): nhập mã giao dịch hoàn (3–100 ký tự, khớp
   *  RecordRefundCommandValidator ở BE) → POST /api/admin/refunds/{refundId}/record. */
  const recordRefund = async () => {
    if (!refundTarget?.refundId) return;
    const code = refundTxCode.trim();
    if (code.length < 3 || code.length > 100) { setRefundError('Mã giao dịch hoàn tiền phải có từ 3 đến 100 ký tự.'); return; }
    try {
      const { body } = await apiJson<string>(`/api/admin/refunds/${refundTarget.refundId}/record`, {
        method: 'POST', skipAuthHandler: true, body: JSON.stringify({ transactionCode: code }),
      });
      if (body?.success) {
        notify.success('Đã ghi nhận hoàn tiền.');
        setRefundTarget(null); setRefundTxCode(''); setRefundError(null);
        // Đợt 21 — trang chi tiết trả hàng là route thật nên KHÔNG đóng gì thêm;
        // chỉ reload danh sách để returnResolved cập nhật trạng thái hoàn tiền.
        await loadReturns();
      } else setRefundError(apiErr(body, 'Không ghi nhận được hoàn tiền.'));
    } catch { setRefundError('Không thể kết nối đến máy chủ.'); }
  };

  /** Duyệt/từ chối trả hàng (đợt 21): panel xác nhận INLINE ở trang chi tiết
   *  full page (ReturnDetailPage) — KHÔNG mở ConfirmDialog E1/E2 nữa (panel
   *  chính là bước xác nhận, theo mẫu trang chi tiết đơn; văn bản panel tái
   *  dùng messages.confirm.approveReturn/rejectReturn). Lý do từ chối bắt
   *  buộc (panel tự kiểm tra trước khi gọi tới đây). Nghiệp vụ + toast giữ
   *  nguyên; xong thì reload danh sách (trang chi tiết tự cập nhật trạng thái
   *  qua returnResolved). */
  const resolveReturn = async (r: ReturnReq, approve: boolean, reason?: string) => {
    try {
      const { status, body } = await apiJson<string>(`/api/admin/returns/${r.id}/resolve`, {
        method: 'POST', skipAuthHandler: true, body: JSON.stringify({ approve, adminNote: reason?.trim() || undefined }),
      });
      if (body?.success) {
        const code = r.orderDisplayCode ?? r.orderId;
        if (approve) notify.success(messages.toast.returns.approved.title, fmt(messages.toast.returns.approved.desc, { 'mã đơn': code }));
        else notify.success(messages.toast.returns.rejected.title, fmt(messages.toast.returns.rejected.desc, { 'mã đơn': code }));
        await loadReturns();
      } else failOp(status, body?.message);
    } catch { failOp(0); }
  };

  // ---------- Chuông thông báo: nối API thật GET /api/notifications (App.tsx
  // fetchNotifications dùng cùng endpoint; ở đây lấy theo userId của admin).
  // Không có SignalR ở trang admin — bấm chuông mới tải 1 lần, không live.
  // (Hàm thường, KHÔNG useCallback: khối này nằm sau các early-return của
  // gate nên không được gọi thêm hook ở đây — lần render gate='checking'
  // return sớm, lần sau render đủ sẽ lệch số hook.)
  const loadNotifications = async () => {
    if (notifsLoaded) return;
    setNotifLoading(true);
    try {
      const q = profile?.id ? `?userId=${encodeURIComponent(profile.id)}` : '';
      const { body } = await apiJson<NotificationItem[]>(`/api/notifications${q}`, { skipAuthHandler: true });
      if (body?.success && Array.isArray(body.data)) setNotifs(body.data);
      setNotifsLoaded(true);
    } catch { setNotifsLoaded(true); }
    finally { setNotifLoading(false); }
  };

  const markAllNotifRead = async () => {
    setNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
    try {
      await apiJson('/api/notifications/read-all', { method: 'PUT', skipAuthHandler: true });
    } catch { /* đánh dấu cục bộ đã xong; lỗi API không chặn giao diện */ }
  };


  // Nút "+ Thêm mới" giờ nằm cuối nhóm PHẢI của toolbar từng mục có tạo mới
  // (Sản phẩm / Danh mục / Khuyến mãi) qua PageToolbar, testid {prefix}-add-btn (đợt 18).
  // Topbar không còn nút Tạo mới hay ô tìm kiếm nữa.
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };


  const meta = profileView
    ? { title: 'Hồ sơ quản trị' }
    : TAB_META[tab];
  // Đợt 21: đang ở trang chi tiết đơn (/orders/:code) thì mục Đơn hàng active;
  // đang ở trang con KM (/promotions/...) thì mục Khuyến mãi active;
  // đang ở trang con SP (/products/...) thì mục Sản phẩm active;
  // đang ở trang con DM/KH/Trả/Đánh giá thì mục tương ứng active.
  const effectiveTab: Tab = orderCode ? 'orders' : isPromoRoute ? 'promotions' : isProductRoute ? 'products' : isCategoryRoute ? 'categories' : isCustomerRoute ? 'customers' : isReturnRoute ? 'returns' : isReviewRoute ? 'reviews' : tab;
  // Đổi tab từ sidebar: đang ở trang chi tiết đơn hoặc trang con KM/SP/DM/KH/Trả/
  // Đánh giá thì phải navigate về /admin (chỉ setTab không đổi route, trang con vẫn hiện) kèm state.tab.
  const goTab = (key: Tab) => {
    setProfileView(false);
    setSidebarOpen(false);
    if (orderCode || isPromoRoute || isProductRoute || onEntitySubPage) navigate('/admin', { state: { tab: key } });
    else setTab(key);
  };
  // Form nay là Drawer/Modal (đợt 18) nên KHÔNG thay thế nội dung tab nữa;
  // chỉ trang Hồ sơ mới thay thế nội dung tab (sidebar + topbar giữ nguyên).
  const profileName = profile?.fullName ?? profile?.email ?? '?';
  // Badge từng mục menu (null = ẩn): trả hàng chờ duyệt, đánh giá mới 7 ngày
  // (badgeText: tối đa "99+", 0 thì ẩn). Đợt 21: menu "Đơn hàng" KHÔNG còn badge.
  const navBadgeOf = (key: Tab): number | null =>
    key === 'returns' ? pendingReturnsCount : key === 'reviews' ? newReviewsCount : null;
  return (
    <div data-testid="admin-page" className={`spark-admin${sidebarHidden ? ' sa-sidebar-hidden' : ''}${sidebarOpen ? ' sa-drawer-open' : ''}`}>
      {/* Host toast + popup xác nhận (đợt 18, W1): mount MỘT LẦN ở gốc. */}
      <ToastHost />
      <ConfirmDialogHost />
      {/* ---------- Sidebar TỐI (đợt 23: gradient tối đợt 20, tiêu đề nhóm
        15px/600 #e6f0ea, menu con 14px/500 #b9cdc0 + đường dọc trái, active
        nền xanh đậm + chữ lime #bff53c; drawer <960px) ---------- */}
      <aside className="sa-sidebar">
        <button
          type="button"
          className="sa-logo"
          onClick={() => { goTab('dashboard'); }}
          aria-label="Về trang Tổng quan"
          title="DAFL Admin — Tổng quan"
        >
          <span className="sa-logo-star" aria-hidden="true"><Star size={20} strokeWidth={2} fill="currentColor" /></span>
          <span className="sa-logo-text">DAFL Admin</span>
        </button>
        <nav
          ref={navRef}
          className={`sa-nav${navFadeTop ? ' sa-nav-fade-top' : ''}${navFadeBottom ? ' sa-nav-fade-bottom' : ''}`}
          aria-label="Menu chính"
        >
          {/* Tổng quan đứng riêng trên cùng, không tiêu đề nhóm, cách các nhóm 14px (đợt 23). */}
          <button
            type="button"
            data-testid={NAV_BY_KEY.dashboard.testid}
            onClick={() => { goTab('dashboard'); }}
            className={`sa-nav-btn sa-nav-overview${effectiveTab === 'dashboard' ? ' sa-active' : ''}`}
            aria-current={effectiveTab === 'dashboard' ? 'page' : undefined}
          >
            <span className="sa-nav-label">Tổng quan</span>
          </button>
          {NAV_GROUPS.map(g => {
            // Nhóm rỗng (không còn mục hiển thị — vd mục không quyền bị ẩn hết)
            // thì ẩn luôn tiêu đề nhóm.
            const items = g.keys.map(key => NAV_BY_KEY[key]);
            if (items.length === 0) return null;
            // Dropdown (đợt 21): tiêu đề nhóm là <button> có chevron phải,
            // aria-expanded; các mục con nằm trong .sa-nav-group-items (mở
            // mượt bằng CSS grid-rows, thu lại thì visibility:hidden).
            const open = openGroups[g.key] ?? false;
            return (
              <div key={g.key} className={`sa-nav-group${open ? ' sa-open' : ''}`} role="group" aria-labelledby={`admin-nav-group-title-${g.key}`}>
                <button
                  type="button"
                  className="sa-nav-group-title"
                  data-testid={`admin-nav-group-${g.key}`}
                  aria-expanded={open}
                  aria-controls={`admin-nav-group-items-${g.key}`}
                  onClick={() => toggleGroup(g.key)}
                >
                  <span id={`admin-nav-group-title-${g.key}`}>{g.title}</span>
                  <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className="sa-nav-group-chevron" />
                </button>
                <div className="sa-nav-group-items" id={`admin-nav-group-items-${g.key}`}>
                  <div className="sa-nav-group-items-inner">
                    {items.map(item => {
                      const badge = badgeText(navBadgeOf(item.key));
                      return (
                        <button
                          key={item.key}
                          type="button"
                          data-testid={item.testid}
                          onClick={() => { goTab(item.key); }}
                          className={`sa-nav-btn${effectiveTab === item.key ? ' sa-active' : ''}`}
                          aria-current={effectiveTab === item.key ? 'page' : undefined}
                        >
                          <span className="sa-nav-label">{item.label}</span>
                          {badge && (
                            <span key={badge} className="sa-nav-badge" data-testid={`admin-nav-${item.key}-badge`}>{badge}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
        <div className="sa-sidebar-user" ref={sidebarUserMenuRef}>
          <button
            type="button"
            className="sa-sidebar-user-card"
            data-testid="admin-sidebar-user-btn"
            onClick={() => setSidebarUserMenuOpen(v => !v)}
            aria-label="Menu tài khoản quản trị"
            aria-expanded={sidebarUserMenuOpen}
            aria-haspopup="menu"
          >
            <span className="sa-avatar sa-sidebar-avatar" aria-hidden="true">{avatarInitial(profileName)}</span>
            <span className="sa-sidebar-user-info">
              <span className="sa-sidebar-user-name">{profile?.fullName ?? profile?.email}</span>
              <span className="sa-sidebar-user-email">{profile?.email}</span>
            </span>
            <span className="sa-sidebar-user-chevron" aria-hidden="true">▾</span>
          </button>
          {sidebarUserMenuOpen && (
            <div className="sa-sidebar-user-menu" role="menu" aria-label="Tài khoản quản trị" data-testid="admin-sidebar-user-menu">
              <button
                type="button"
                role="menuitem"
                data-testid="admin-sidebar-user-menu-profile"
                onClick={() => { setSidebarUserMenuOpen(false); setProfilePwOpen(false); setProfileView(true); setSidebarOpen(false); }}
              >
                Hồ sơ
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="admin-sidebar-user-menu-change-password"
                onClick={() => { setSidebarUserMenuOpen(false); setProfilePwOpen(true); setProfileView(true); setSidebarOpen(false); }}
              >
                Đổi mật khẩu
              </button>
              <div className="sa-sidebar-user-menu-sep" aria-hidden="true" />
              <button
                type="button"
                role="menuitem"
                className="sa-sidebar-user-menu-logout"
                data-testid="admin-sidebar-user-menu-logout"
                onClick={() => { setSidebarUserMenuOpen(false); void requestLogout(); }}
              >
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </aside>
      {sidebarOpen && <div className="sa-overlay" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}

      {/* ---------- Cột chính: topbar + nội dung ---------- */}
      <div className="sa-main">
        <header className="sa-topbar">
          <button
            type="button"
            className="sa-topbar-btn"
            onClick={() => {
              // Mobile (<960px — đợt 23 đổi từ 1024px): mở/đóng drawer. Desktop: ẨN HẲN sidebar (đợt 20 —
              // bỏ chế độ thu về cột icon), nhớ trạng thái vào localStorage.
              if (window.matchMedia('(max-width: 959px)').matches) setSidebarOpen(v => !v);
              else {
                setSidebarHidden(v => {
                  const next = !v;
                  try { window.localStorage.setItem('dafl_admin_sidebar_hidden', next ? '1' : '0'); } catch { /* bỏ qua */ }
                  return next;
                });
              }
            }}
            aria-label="Thu gọn / mở menu"
            title="Thu gọn / mở menu"
          >
            <Menu size={18} strokeWidth={2} />
          </button>
          <div className="sa-topbar-spacer" />
          <button type="button" className="sa-topbar-btn" onClick={toggleFullscreen} aria-label="Toàn màn hình" title="Toàn màn hình">
            <Maximize2 size={18} strokeWidth={2} />
          </button>
          <div className="sa-popover-wrap">
            <button
              type="button"
              className="sa-topbar-btn"
              onClick={() => {
                const next = !notifOpen;
                setNotifOpen(next);
                setAvatarMenuOpen(false);
                if (next) void loadNotifications();
              }}
              aria-label="Thông báo"
              title="Thông báo"
            >
              <Bell size={18} strokeWidth={2} />
              {unreadNotifCount > 0 && <span className="sa-notif-dot" aria-hidden="true" />}
            </button>
            {notifOpen && (
              <div className="sa-popover" role="dialog" aria-label="Thông báo">
                <div className="sa-popover-head">
                  <span>Thông báo</span>
                  {unreadNotifCount > 0 && (
                    <button type="button" onClick={() => void markAllNotifRead()}>Đánh dấu đã đọc</button>
                  )}
                </div>
                {notifLoading ? (
                  <div className="sa-popover-empty">Đang tải thông báo...</div>
                ) : notifs.length === 0 ? (
                  <div className="sa-popover-empty">Chưa có thông báo mới</div>
                ) : (
                  notifs.map(n => (
                    <div key={n.id} className={`sa-notif-item${n.isRead ? '' : ' sa-unread'}`}>
                      <div className="sa-notif-title">{n.title}</div>
                      <div className="sa-notif-msg">{n.message}</div>
                      <div className="sa-notif-time">{fmtDate(n.createdAt)}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="sa-popover-wrap" ref={userMenuRef}>
            <button
              type="button"
              className="sa-topbar-user"
              data-testid="admin-user-menu-btn"
              onClick={() => { setAvatarMenuOpen(v => !v); setNotifOpen(false); }}
              aria-label="Menu tài khoản"
              aria-expanded={avatarMenuOpen}
              aria-haspopup="menu"
            >
              <span className="sa-avatar sa-avatar-sm" style={{ background: avatarColor(profileName) }}>{avatarInitial(profileName)}</span>
              <span className="sa-topbar-user-name">{profile?.fullName ?? profile?.email}</span>
              <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
            </button>
            {avatarMenuOpen && (
              /* Đợt 21: menu topbar gọn — CHỈ 2 mục, không còn khối tiêu đề
               * (tên/email/vai trò) ở đầu menu; divider trước Đăng xuất. */
              <div className="sa-popover sa-topbar-user-menu" role="menu" aria-label="Tài khoản" data-testid="admin-user-menu">
                <button
                  type="button"
                  className="sa-topbar-user-menu-item"
                  data-testid="admin-user-menu-profile"
                  role="menuitem"
                  onClick={() => { setAvatarMenuOpen(false); setProfilePwOpen(false); setProfileView(true); }}
                >
                  Thông tin cá nhân
                </button>
                <div className="sa-topbar-user-menu-sep" aria-hidden="true" />
                <button
                  type="button"
                  className="sa-topbar-user-menu-item sa-topbar-user-menu-logout"
                  data-testid="admin-user-menu-logout"
                  role="menuitem"
                  onClick={() => void requestLogout()}
                >
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="sa-content">
          {/* Đợt 21: trang con KM/SP có breadcrumb + tiêu đề riêng nên ẩn pagehead
            * chung của tab khi đang ở /promotions/... hoặc /products/...
            * (chỉ hiện ở danh sách). */}
          {!profileView && !orderCode && !onEntitySubPage && tab !== 'dashboard' && promoSubPage === 'list' && productSubPage === 'list' && (
            <div className="sa-pagehead">
              <div>
                <h1>{meta.title}</h1>
              </div>
            </div>
          )}

          <main>
            {/* Đợt 21: route /orders/:code — trang chi tiết đơn thay nội dung tab. */}
            {orderCode && (
              <OrderDetailPage
                onDataChanged={() => {
                  void loadOrders();
                  void loadDashboard();
                }}
              />
            )}
            {/* Đợt 21: các trang con Khuyến mãi full page — thay nội dung tab,
              * sidebar + topbar giữ nguyên, mục Khuyến mãi active. */}
            {isPromoRoute && promoSubPage === 'new' && (
              <section className="sa-promo-page-wrap" data-testid="admin-promo-create-page">
                <PromoBreadcrumb current="Thêm mới" onBackToList={backToPromoList} />
                <PromoForm
                  key="promo-create"
                  variant="page"
                  initial={promoCreateInitial}
                  categories={categories}
                  onSave={savePromo}
                  onRequestClose={closePromoPage}
                  mode="create"
                />
              </section>
            )}
            {isPromoRoute && promoSubPage === 'edit' && (
              promoResolveLoading ? (
                <p className="sa-muted-text" data-testid="admin-promo-loading">Đang tải khuyến mãi...</p>
              ) : !promoResolved ? (
                <section className="sa-promo-page" data-testid="admin-promo-not-found">
                  <PromoBreadcrumb current="Chỉnh sửa" onBackToList={backToPromoList} />
                  <p className="sa-error" role="alert">{promoResolveError ?? 'Không tìm thấy khuyến mãi.'}</p>
                  <button type="button" className="sa-btn" onClick={backToPromoList}>Về danh sách khuyến mãi</button>
                </section>
              ) : (
                <section className="sa-promo-page-wrap" data-testid="admin-promo-edit-page">
                  <PromoBreadcrumb current="Chỉnh sửa" onBackToList={backToPromoList} />
                  <PromoForm
                    key={`promo-edit-${promoResolved.id}`}
                    variant="page"
                    initial={promoFormInitial(promoResolved)}
                    categories={categories}
                    onSave={savePromo}
                    onRequestClose={closePromoPage}
                    mode="edit"
                  />
                </section>
              )
            )}
            {isPromoRoute && promoSubPage === 'detail' && (
              promoResolveLoading ? (
                <p className="sa-muted-text" data-testid="admin-promo-loading">Đang tải khuyến mãi...</p>
              ) : !promoResolved ? (
                <section className="sa-promo-page" data-testid="admin-promo-not-found">
                  <PromoBreadcrumb current="Chi tiết" onBackToList={backToPromoList} />
                  <p className="sa-error" role="alert">{promoResolveError ?? 'Không tìm thấy khuyến mãi.'}</p>
                  <button type="button" className="sa-btn" onClick={backToPromoList}>Về danh sách khuyến mãi</button>
                </section>
              ) : (
                <PromoDetailPage
                  promo={promoResolved}
                  onBackToList={backToPromoDetail}
                  onEdit={() => openPromoEdit(promoResolved)}
                />
              )
            )}
            {isPromoRoute && promoSubPage === 'usages' && (
              promoResolveLoading ? (
                <p className="sa-muted-text" data-testid="admin-promo-loading">Đang tải khuyến mãi...</p>
              ) : !promoResolved ? (
                <section className="sa-promo-page" data-testid="admin-promo-not-found">
                  <PromoBreadcrumb current="Lượt sử dụng" onBackToList={backToPromoList} />
                  <p className="sa-error" role="alert">{promoResolveError ?? 'Không tìm thấy khuyến mãi.'}</p>
                  <button type="button" className="sa-btn" onClick={backToPromoList}>Về danh sách khuyến mãi</button>
                </section>
              ) : (
                <PromoUsagesPage promo={promoResolved} onBackToList={backToPromoDetail} />
              )
            )}
            {/* Đợt 21: các trang con Sản phẩm full page — thay nội dung tab,
              * sidebar + topbar giữ nguyên, mục Sản phẩm active. */}
            {isProductRoute && productSubPage === 'new' && (
              <section className="sa-product-page-wrap" data-testid="admin-product-create-page">
                <ProductBreadcrumb current="Thêm mới" onBackToList={backToProductList} />
                <ProductForm
                  key="product-create"
                  variant="page"
                  initial={productCreateInitial}
                  categories={categories}
                  onSave={saveProduct}
                  onRequestClose={closeProductPage}
                  mode="create"
                />
              </section>
            )}
            {isProductRoute && productSubPage === 'edit' && (
              productResolveLoading ? (
                <p className="sa-muted-text" data-testid="admin-product-loading">Đang tải sản phẩm...</p>
              ) : !productResolved ? (
                <section className="sa-product-page" data-testid="admin-product-not-found">
                  <ProductBreadcrumb current="Chỉnh sửa" onBackToList={backToProductList} />
                  <p className="sa-error" role="alert">{productResolveError ?? 'Không tìm thấy sản phẩm.'}</p>
                  <button type="button" className="sa-btn" onClick={backToProductList}>Về danh sách sản phẩm</button>
                </section>
              ) : (
                <section className="sa-product-page-wrap" data-testid="admin-product-edit-page">
                  <ProductBreadcrumb current="Chỉnh sửa" onBackToList={backToProductList} />
                  <ProductForm
                    key={`product-edit-${productResolved.id}`}
                    variant="page"
                    initial={productFormInitial(productResolved)}
                    categories={categories}
                    onSave={saveProduct}
                    onRequestClose={closeProductPage}
                    mode="edit"
                  />
                </section>
              )
            )}
            {isProductRoute && productSubPage === 'detail' && (
              productResolveLoading ? (
                <p className="sa-muted-text" data-testid="admin-product-loading">Đang tải sản phẩm...</p>
              ) : !productResolved ? (
                <section className="sa-product-page" data-testid="admin-product-not-found">
                  <ProductBreadcrumb current="Chi tiết sản phẩm" onBackToList={backToProductList} />
                  <p className="sa-error" role="alert">{productResolveError ?? 'Không tìm thấy sản phẩm.'}</p>
                  <button type="button" className="sa-btn" onClick={backToProductList}>Về danh sách sản phẩm</button>
                </section>
              ) : (
                <ProductDetailPage
                  product={productResolved}
                  onBackToList={backToProductDetail}
                  onEdit={() => openProductEdit(productResolved)}
                />
              )
            )}
            {/* Đợt 21: các trang con Danh mục full page — thay nội dung tab,
              * sidebar + topbar giữ nguyên, mục Danh mục active. Breadcrumb
              * "Quản lý danh mục > ..." dùng dấu ">" như trang Sản phẩm. */}
            {isCategoryRoute && categorySubPage === 'new' && (
              <section className="sa-promo-page-wrap" data-testid="admin-category-create-page">
                <EntityBreadcrumb root="Quản lý danh mục" current="Thêm mới" onBackToList={backToCategoryList} />
                <CategoryForm
                  key="category-create"
                  variant="page"
                  initial={categoryCreateInitial}
                  onSave={saveCategoryPage}
                  onRequestClose={closeCategoryPage}
                  mode="create"
                />
              </section>
            )}
            {isCategoryRoute && categorySubPage === 'edit' && (
              catsLoading && !categoryResolved ? (
                <p className="sa-muted-text" data-testid="admin-category-loading">Đang tải danh mục...</p>
              ) : !categoryResolved ? (
                <section className="sa-promo-page" data-testid="admin-category-not-found">
                  <EntityBreadcrumb root="Quản lý danh mục" current="Chỉnh sửa" onBackToList={backToCategoryList} />
                  <p className="sa-error" role="alert">{categoryResolveError ?? 'Không tìm thấy danh mục.'}</p>
                  <button type="button" className="sa-btn" onClick={backToCategoryList}>Về danh sách danh mục</button>
                </section>
              ) : (
                <section className="sa-promo-page-wrap" data-testid="admin-category-edit-page">
                  <EntityBreadcrumb root="Quản lý danh mục" current="Chỉnh sửa" onBackToList={backToCategoryList} />
                  <CategoryForm
                    key={`category-edit-${categoryResolved.id}`}
                    variant="page"
                    initial={categoryFormInitial(categoryResolved)}
                    onSave={saveCategoryPage}
                    onRequestClose={closeCategoryPage}
                    mode="edit"
                  />
                </section>
              )
            )}
            {isCategoryRoute && categorySubPage === 'detail' && (
              catsLoading && !categoryResolved ? (
                <p className="sa-muted-text" data-testid="admin-category-loading">Đang tải danh mục...</p>
              ) : !categoryResolved ? (
                <section className="sa-promo-page" data-testid="admin-category-not-found">
                  <EntityBreadcrumb root="Quản lý danh mục" current="Chi tiết" onBackToList={backToCategoryList} />
                  <p className="sa-error" role="alert">{categoryResolveError ?? 'Không tìm thấy danh mục.'}</p>
                  <button type="button" className="sa-btn" onClick={backToCategoryList}>Về danh sách danh mục</button>
                </section>
              ) : (
                <section className="sa-promo-page-wrap" data-testid="admin-category-detail-page">
                  <EntityBreadcrumb root="Quản lý danh mục" current="Chi tiết" onBackToList={backToCategoryList} />
                  <CategoryForm
                    key={`category-view-${categoryResolved.id}`}
                    variant="page"
                    initial={categoryFormInitial(categoryResolved)}
                    onSave={saveCategoryPage}
                    onRequestClose={closeCategoryPage}
                    mode="view"
                    onSwitchToEdit={() => navigate(`/categories/${categoryResolved.code ?? categoryResolved.id}/edit`, { state: { categoryId: categoryResolved.id } })}
                  />
                </section>
              )
            )}
            {/* Đợt 21: các trang con Khách hàng full page — thay nội dung tab,
              * sidebar + topbar giữ nguyên, mục Khách hàng active. KHÔNG có
              * trang thêm mới (khách tự đăng ký); KHÔNG có nút xóa (A7 chưa
              * có endpoint — giữ nguyên, không bịa chức năng xóa). */}
            {isCustomerRoute && customerSubPage === 'edit' && (
              customersLoading && !customerResolved ? (
                <p className="sa-muted-text" data-testid="admin-customer-loading">Đang tải khách hàng...</p>
              ) : !customerResolved ? (
                <section className="sa-promo-page" data-testid="admin-customer-not-found">
                  <EntityBreadcrumb root="Quản trị" current="Chỉnh sửa" onBackToList={backToCustomerList} />
                  <p className="sa-error" role="alert">{customerResolveError ?? 'Không tìm thấy khách hàng.'}</p>
                  <button type="button" className="sa-btn" onClick={backToCustomerList}>Về danh sách khách hàng</button>
                </section>
              ) : (
                <section className="sa-promo-page-wrap" data-testid="admin-customer-edit-page">
                  <EntityBreadcrumb root="Quản trị" current="Chỉnh sửa" onBackToList={backToCustomerList} />
                  <CustomerForm
                    key={`customer-edit-${customerResolved.id}`}
                    variant="page"
                    initial={customerFormInitial(customerResolved)}
                    onSave={saveCustomerPage}
                    onRequestClose={closeCustomerPage}
                    mode="edit"
                  />
                </section>
              )
            )}
            {isCustomerRoute && customerSubPage === 'detail' && (
              customersLoading && !customerResolved ? (
                <p className="sa-muted-text" data-testid="admin-customer-loading">Đang tải khách hàng...</p>
              ) : !customerResolved ? (
                <section className="sa-promo-page" data-testid="admin-customer-not-found">
                  <EntityBreadcrumb root="Quản trị" current="Chi tiết" onBackToList={backToCustomerList} />
                  <p className="sa-error" role="alert">{customerResolveError ?? 'Không tìm thấy khách hàng.'}</p>
                  <button type="button" className="sa-btn" onClick={backToCustomerList}>Về danh sách khách hàng</button>
                </section>
              ) : (
                <section className="sa-promo-page-wrap" data-testid="admin-customer-detail-page">
                  <EntityBreadcrumb root="Quản trị" current="Chi tiết" onBackToList={backToCustomerList} />
                  <CustomerForm
                    key={`customer-view-${customerResolved.id}`}
                    variant="page"
                    initial={customerFormInitial(customerResolved)}
                    onSave={saveCustomerPage}
                    onRequestClose={closeCustomerPage}
                    mode="view"
                    onSwitchToEdit={() => navigate(`/customers/${customerResolved.code ?? customerResolved.id}/edit`, { state: { customerId: customerResolved.id } })}
                  />
                </section>
              )
            )}
            {/* Đợt 21: trang con Trả hàng full page — thay nội dung tab,
              * sidebar + topbar giữ nguyên, mục Trả hàng active. */}
            {isReturnRoute && (
              returnsLoading && !returnResolved ? (
                <p className="sa-muted-text" data-testid="admin-return-loading">Đang tải yêu cầu trả hàng...</p>
              ) : !returnResolved ? (
                <section className="sa-promo-page" data-testid="admin-return-not-found">
                  <EntityBreadcrumb root="Trả hàng" current="Chi tiết" onBackToList={backToReturnList} />
                  <p className="sa-error" role="alert">{returnResolveError ?? 'Không tìm thấy yêu cầu trả hàng.'}</p>
                  <button type="button" className="sa-btn" onClick={backToReturnList}>Về danh sách trả hàng</button>
                </section>
              ) : (
                <ReturnDetailPage
                  key={returnResolved.id}
                  ret={returnResolved}
                  onBackToList={backToReturnDetail}
                  onResolve={(r, approve, reason) => void resolveReturn(r, approve, reason)}
                  onRecordRefund={r => { setRefundTarget(r); setRefundTxCode(''); setRefundError(null); }}
                />
              )
            )}
            {/* Đợt 21: trang con Đánh giá full page — thay nội dung tab,
              * sidebar + topbar giữ nguyên, mục Đánh giá active. */}
            {isReviewRoute && (
              reviewResolveLoading && !reviewResolved ? (
                <p className="sa-muted-text" data-testid="admin-review-loading">Đang tải đánh giá...</p>
              ) : !reviewResolved ? (
                <section className="sa-promo-page" data-testid="admin-review-not-found">
                  <EntityBreadcrumb root="Đánh giá" current="Chi tiết" onBackToList={backToReviewList} />
                  <p className="sa-error" role="alert">{reviewResolveError ?? 'Không tìm thấy đánh giá.'}</p>
                  <button type="button" className="sa-btn" onClick={backToReviewList}>Về danh sách đánh giá</button>
                </section>
              ) : (
                <ReviewDetailPage
                  key={reviewResolved.id}
                  review={reviewResolved}
                  onBackToList={backToReviewDetail}
                  onDelete={r => void requestDeleteReview(r)}
                />
              )
            )}
            {!orderCode && profileView && profile && (
              <AdminProfilePage
                profile={profile}
                onSaveProfile={saveAdminProfile}
                onChangePassword={changeAdminPassword}
                onBack={() => setProfileView(false)}
                initialPwOpen={profilePwOpen}
              />
            )}
            {!profileView && !orderCode && !isProductRoute && !onEntitySubPage && tab === 'dashboard' && (
              <AdminDashboard
                onNavigateTab={handleDashboardNavigate}
                onOpenOrder={order => openOrderDetail(order.id, order.orderDisplayCode ?? `#${order.orderCode}`)}
                onOpenProduct={p => { setProductSearch(p.name); setTab('products'); void loadProducts({ search: p.name }); }}
                onOpenPromotion={p => { setPromoSearch(p.code); setTab('promotions'); void loadPromos({ status: '' }); }}
              />
            )}

            {!profileView && !orderCode && tab === 'orders' && (
              <section className="sa-list-section">
                {/* Đợt 21 — danh sách đơn lọc client-side (xem loadOrders /
                  filteredOrders): toolbar không nút Tìm, dropdown nhóm trạng
                  thái, số kết quả "N / M đơn", bảng sa-orders-*. Chi tiết đơn
                  (openOrderDetail) giữ nguyên — worker chi tiết lo. */}
                <div className="sa-list-card sa-orders-card">
                  <PageToolbar
                    testidPrefix="orders"
                    searchValue={orderSearch}
                    onSearchChange={setOrderSearch}
                    searchPlaceholder="Tìm mã đơn, tên khách, email..."
                    onReset={resetOrders}
                    showSearchClear
                    onClearSearch={() => { setOrderSearch(''); setOrderSearchDebounced(''); }}
                    resetDisabled={!orderSearch.trim() && !orderStatusFilter}
                    filters={(
                      <select
                        className={`sa-input sa-filter-select sa-orders-status-filter${orderStatusFilter === '' ? ' sa-filter-select--placeholder' : ''}`}
                        value={orderStatusFilter}
                        onChange={e => setOrderStatusFilter(e.target.value)}
                        data-testid="admin-order-status-filter"
                        aria-label="Lọc trạng thái"
                      >
                        <option value="">Trạng thái</option>
                        {ORDER_STATUS_GROUPS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                      </select>
                    )}
                  />
                  {!ordersLoading && !ordersError && (
                    <p className="sa-orders-result-count" data-testid="admin-orders-result-count" role="status">
                      {filteredOrders.length} / {orders.length} đơn
                    </p>
                  )}
                  {ordersLoading ? (
                    <TableSkeleton />
                  ) : ordersError ? (
                    <p className="sa-error">{ordersError}</p>
                  ) : filteredOrders.length === 0 ? (
                    <EmptyState
                      title={ordersHasFilter ? 'Không tìm thấy đơn hàng' : 'Chưa có đơn hàng nào'}
                      desc={ordersHasFilter ? 'Thử đổi từ khóa hoặc bộ lọc khác.' : 'Đơn hàng mới sẽ hiển thị tại đây.'}
                      action={ordersHasFilter ? (
                        <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-orders-clear-filters-btn" onClick={resetOrders}>
                          Xóa bộ lọc
                        </button>
                      ) : undefined}
                    />
                  ) : (
                    <div className="sa-table-wrap sa-orders-table-wrap">
                      <table>
                        <thead><tr><th>STT</th><th>Mã đơn</th><th>Khách hàng</th><th>Trạng thái</th><th>Thanh toán</th><th className="sa-cell-money">Tổng tiền</th><th>Ngày đặt</th><th>Thao tác</th></tr></thead>
                        <tbody>
                          {ordersPaging.paged.map((o, idx) => (
                            <tr key={o.id} onClick={() => void openOrderDetail(o.id)} className="sa-clickable" data-testid={`admin-order-row-${o.id}`}>
                              <td>{(ordersPaging.safePage - 1) * PAGE_SIZE + idx + 1}</td>
                              <td><span className="sa-code sa-orders-code">{o.orderDisplayCode ?? `#${o.orderCode}`}</span></td>
                              <td>
                                <span className="sa-user-cell">
                                  <span className="sa-avatar sa-avatar-sm" style={{ background: avatarColor(o.customerName) }}>{avatarInitial(o.customerName)}</span>
                                  <span className="sa-user-cell-names"><strong>{o.customerName}</strong><small>{o.customerEmail}</small></span>
                                </span>
                              </td>
                              <td><span className={orderListPillClass(o.status)}>{o.statusLabel ?? statusLabel(o.status)}</span></td>
                              <td><span className="sa-orders-pay-badge">{o.paymentMethod}</span></td>
                              <td className="sa-cell-money"><span className="sa-money">{fmtMoney(o.totalAmount)}</span></td>
                              <td><DateCell value={o.createdAt} /></td>
                              <td className="sa-actions">
                                <button
                                  type="button"
                                  className="sa-icon-btn"
                                  title="Xem chi tiết đơn"
                                  aria-label={`Xem chi tiết đơn ${o.orderDisplayCode ?? `#${o.orderCode}`}`}
                                  onClick={e => { e.stopPropagation(); void openOrderDetail(o.id); }}
                                >
                                  <Eye size={16} strokeWidth={2} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {filteredOrders.length > 0 && (
                    <Pagination page={ordersPaging.safePage} totalPages={ordersPaging.totalPages} total={filteredOrders.length} pageSize={PAGE_SIZE} testid="admin-orders-pagination" onPage={setOrdersPage} />
                  )}
                </div>
              </section>
            )}
            {!profileView && !orderCode && !isProductRoute && tab === 'products' && (
              <section className="sa-list-section">
                <div className="sa-list-card">
                  <PageToolbar
                    testidPrefix="products"
                    searchValue={productSearch}
                    onSearchChange={setProductSearch}
                    searchPlaceholder="Tìm tên hoặc mã sản phẩm..."
                    onReset={resetProducts}
                    showSearchClear
                    onClearSearch={() => { setProductSearch(''); setProductSearchDebounced(''); }}
                    resetDisabled={!productsHasFilter}
                    filters={(
                      <>
                        <select className={`sa-input sa-filter-select${productCatFilter === '' ? ' sa-filter-select--placeholder' : ''}`} value={productCatFilter} onChange={e => setProductCatFilter(e.target.value)} aria-label="Lọc danh mục">
                          <option value="">Danh mục</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <select className={`sa-input sa-filter-select${productStatusFilter === '' ? ' sa-filter-select--placeholder' : ''}`} value={productStatusFilter} onChange={e => setProductStatusFilter(e.target.value)} data-testid="admin-status-filter" aria-label="Lọc trạng thái sản phẩm">
                          <option value="">Trạng thái</option>
                          <option value="true">Đang hoạt động</option>
                          <option value="false">Ngừng hoạt động</option>
                        </select>
                      </>
                    )}
                    addLabel="Thêm mới"
                    onAdd={openProductCreate}
                  />
                  {productsLoading ? (
                    <TableSkeleton />
                  ) : productsError ? (
                    <p className="sa-error">{productsError}</p>
                  ) : filteredProducts.length === 0 ? (
                    <EmptyState
                      title={productsHasFilter ? 'Không tìm thấy sản phẩm' : 'Chưa có sản phẩm nào'}
                      desc={productsHasFilter ? 'Thử đổi từ khóa hoặc bộ lọc khác.' : 'Thêm sản phẩm mới để bắt đầu bán hàng.'}
                      action={productsHasFilter ? (
                        <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-products-clear-filters-btn" onClick={resetProducts}>
                          Xóa bộ lọc
                        </button>
                      ) : undefined}
                    />
                  ) : (
                    <div className="sa-table-wrap">
                      <table>
                        <thead><tr><th>STT</th><th>Mã SP</th><th>Sản phẩm</th><th>Danh mục</th><th>Giá</th><th>Tồn kho</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                        <tbody>
                          {productsPaging.paged.map((p, idx) => {
                            const pct = discountPct(p.price, p.originalPrice);
                            const stock = p.availableStock ?? 0;
                            return (
                              <tr key={p.id} className={highlightId === p.id ? 'sa-row-highlight' : undefined}>
                                <td>{(productsPaging.safePage - 1) * PAGE_SIZE + idx + 1}</td>
                                <td data-testid="admin-product-code"><span className="sa-code">{p.code ?? '—'}</span></td>
                                <td>
                                  <span className="sa-user-cell">
                                    {p.imageUrl
                                      ? <img src={p.imageUrl} alt={p.name} className="sa-thumb" />
                                      : <span className="sa-thumb sa-thumb-ph" aria-hidden="true"><ShoppingBag size={24} strokeWidth={1.8} /></span>}
                                    <span className="sa-user-cell-names"><strong className="sa-cell-clamp">{p.name}</strong></span>
                                  </span>
                                </td>
                                <td>{p.categoryName ?? '—'}</td>
                                <td className="sa-cell-money">
                                  <span className="sa-money">{fmtMoney(p.price)}</span>
                                  {p.originalPrice ? (
                                    <>
                                      <br />
                                      <small className="sa-original-price"><s>{fmtMoney(p.originalPrice)}</s></small>
                                      {pct != null && <span className="sa-discount-badge">-{pct}%</span>}
                                    </>
                                  ) : null}
                                </td>
                                <td>
                                  <span>{p.availableStock ?? '—'}</span>
                                  {stock === 0 ? (
                                    <><br /><Badge tone="red">Hết hàng</Badge></>
                                  ) : stock < 20 ? (
                                    <><br /><Badge tone="orange">Sắp hết</Badge></>
                                  ) : null}
                                </td>
                                <td>
                                  <StatusSwitch
                                    checked={p.isActive ?? true}
                                    testid={`admin-product-status-switch-${p.id}`}
                                    label={`Đổi trạng thái sản phẩm ${p.name} (${(p.isActive ?? true) ? 'đang Hoạt động' : 'đang Ngừng hoạt động'})`}
                                    onToggle={() => void requestToggleProduct(p, !(p.isActive ?? true))}
                                  />
                                </td>
                                <td className="sa-actions">
                                  <button type="button" className="sa-icon-btn" title="Xem chi tiết sản phẩm" aria-label={`Xem chi tiết sản phẩm ${p.name}`} onClick={() => openProductView(p)}><Eye size={16} strokeWidth={2} /></button>
                                  <button type="button" className="sa-icon-btn" title="Sửa sản phẩm" aria-label={`Sửa sản phẩm ${p.name}`} onClick={() => openProductEdit(p)}><Pencil size={16} strokeWidth={2} /></button>
                                  <button type="button" className="sa-icon-btn sa-icon-danger" title="Xóa sản phẩm" aria-label={`Xóa sản phẩm ${p.name}`} onClick={() => void requestDeleteProduct(p)}><Trash2 size={16} strokeWidth={2} /></button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {filteredProducts.length > 0 && (
                    <Pagination page={productsPaging.safePage} totalPages={productsPaging.totalPages} total={filteredProducts.length} pageSize={PAGE_SIZE} testid="admin-products-pagination" onPage={setProductsPage} />
                  )}
                </div>
              </section>
            )}
            {!profileView && !orderCode && !onEntitySubPage && tab === 'categories' && (
              <section className="sa-list-section">
                <div className="sa-list-card">
                  {/* Đợt 21 — tìm/lọc DM TỰ ĐỘNG: gõ là lọc (debounce 300ms,
                    * tìm không dấu), không cần bấm Tìm/Enter — như đơn hàng. */}
                  <PageToolbar
                    testidPrefix="categories"
                    searchValue={catSearch}
                    onSearchChange={setCatSearch}
                    searchPlaceholder="Tìm tên, slug danh mục..."
                    onReset={resetCategories}
                    showSearchClear
                    onClearSearch={() => { setCatSearch(''); setCatSearchDebounced(''); }}
                    resetDisabled={!catSearch.trim() && !catStatusFilter}
                    filters={(
                      <select className={`sa-input sa-filter-select${catStatusFilter === '' ? ' sa-filter-select--placeholder' : ''}`} value={catStatusFilter} onChange={e => setCatStatusFilter(e.target.value)} data-testid="admin-status-filter" aria-label="Lọc trạng thái danh mục">
                        <option value="">Trạng thái</option>
                        <option value="true">Hoạt động</option>
                        <option value="false">Ngừng hoạt động</option>
                      </select>
                    )}
                    addLabel="Thêm mới"
                    onAdd={openCategoryCreate}
                  />
                  {!catsLoading && !catsError && (
                    <p className="sa-orders-result-count" data-testid="admin-categories-result-count" role="status">
                      {filteredCategories.length} / {categories.length} danh mục
                    </p>
                  )}
                  {catsLoading ? (
                    <TableSkeleton />
                  ) : catsError ? (
                    <p className="sa-error">{catsError}</p>
                  ) : filteredCategories.length === 0 ? (
                    <EmptyState
                      title={categoriesHasFilter ? 'Không tìm thấy danh mục' : 'Chưa có danh mục nào'}
                      desc={categoriesHasFilter ? 'Thử đổi từ khóa hoặc bộ lọc khác.' : 'Thêm danh mục để nhóm sản phẩm.'}
                      action={categoriesHasFilter ? (
                        <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-categories-clear-filters-btn" onClick={resetCategories}>
                          Xóa bộ lọc
                        </button>
                      ) : undefined}
                    />
                  ) : (
                    <div className="sa-table-wrap">
                      <table>
                        <thead><tr><th>STT</th><th>Mã DM</th><th>Tên</th><th>Slug</th><th>Mô tả</th><th>Số SP</th><th>Thứ tự</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                        <tbody>
                          {categoriesPaging.paged.map((c, idx) => (
                            <tr key={c.id} className={highlightId === c.id ? 'sa-row-highlight' : undefined}>
                              <td>{(categoriesPaging.safePage - 1) * PAGE_SIZE + idx + 1}</td>
                              <td data-testid="admin-category-code"><span className="sa-code">{c.code ?? '—'}</span></td>
                              <td><strong className="sa-cell-clamp">{c.name}</strong></td>
                              <td><span className="sa-code sa-code-mono">{c.slug ?? '—'}</span></td>
                              <td><span className="sa-cell-clamp">{c.description ?? '—'}</span></td>
                              <td>{c.productCount ?? 0}</td>
                              <td>{c.sortOrder ?? 0}</td>
                              <td>
                                <StatusSwitch
                                  checked={c.isActive}
                                  testid={`admin-category-status-switch-${c.id}`}
                                  label={`Đổi trạng thái danh mục ${c.name} (${c.isActive ? 'đang Hoạt động' : 'đang Ngừng hoạt động'})`}
                                  onToggle={() => void requestToggleCategory(c, !c.isActive)}
                                />
                              </td>
                              <td className="sa-actions">
                                <button type="button" className="sa-icon-btn" title="Xem chi tiết danh mục" aria-label={`Xem chi tiết danh mục ${c.name}`} onClick={() => openCategoryView(c)}><Eye size={16} strokeWidth={2} /></button>
                                <button type="button" className="sa-icon-btn" title="Sửa danh mục" aria-label={`Sửa danh mục ${c.name}`} onClick={() => openCategoryEdit(c)}><Pencil size={16} strokeWidth={2} /></button>
                                <button type="button" className="sa-icon-btn sa-icon-danger" title="Xóa danh mục" aria-label={`Xóa danh mục ${c.name}`} onClick={() => void requestDeleteCategory(c)}><Trash2 size={16} strokeWidth={2} /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {filteredCategories.length > 0 && (
                    <Pagination page={categoriesPaging.safePage} totalPages={categoriesPaging.totalPages} total={filteredCategories.length} pageSize={PAGE_SIZE} testid="admin-categories-pagination" onPage={setCategoriesPage} />
                  )}
                </div>
              </section>
            )}
            {!profileView && !orderCode && tab === 'promotions' && promoSubPage === 'list' && (
              <section className="sa-list-section">
                <div className="sa-list-card">
                  <PageToolbar
                    testidPrefix="promotions"
                    searchValue={promoSearch}
                    onSearchChange={setPromoSearch}
                    searchPlaceholder="Tìm mã, mô tả khuyến mãi..."
                    onReset={resetPromos}
                    filters={(
                      <select className={`sa-input sa-filter-select${promoStatusFilter === '' ? ' sa-filter-select--placeholder' : ''}`} value={promoStatusFilter} onChange={e => setPromoStatusFilter(e.target.value)} data-testid="admin-status-filter" aria-label="Lọc trạng thái voucher">
                        <option value="">Trạng thái</option>
                        <option value="Draft">Nháp</option>
                        <option value="Active">Đang hoạt động</option>
                        <option value="Disabled">Tạm ngưng</option>
                        <option value="Expired">Đã hết hạn</option>
                      </select>
                    )}
                    addLabel="Thêm mới"
                    onAdd={openPromoCreate}
                  />
                  {promosLoading ? (
                    <TableSkeleton />
                  ) : promosError ? (
                    <p className="sa-error">{promosError}</p>
                  ) : filteredPromos.length === 0 ? (
                    <EmptyState
                      title={promoSearch.trim() || promoStatusFilter ? 'Không tìm thấy khuyến mãi' : 'Chưa có khuyến mãi nào'}
                      desc={promoSearch.trim() || promoStatusFilter ? 'Thử đổi từ khóa hoặc bộ lọc khác.' : 'Tạo khuyến mãi để thu hút khách hàng.'}
                      action={promoSearch.trim() || promoStatusFilter ? (
                        <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-promos-clear-filters-btn" onClick={resetPromos}>
                          Xóa bộ lọc
                        </button>
                      ) : undefined}
                    />
                  ) : (
                    <div className="sa-table-wrap">
                      <table>
                        <thead><tr><th>STT</th><th>Mã</th><th>Mô tả</th><th>Loại giảm</th><th>Giá trị</th><th>Đơn tối thiểu</th><th>Đã dùng</th><th>Hạn sử dụng</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                        <tbody>
                          {promosPaging.paged.map((p, idx) => {
                            const expired = !!p.expiryDate && new Date(p.expiryDate).getTime() < Date.now();
                            const expiringSoon = !expired && !!p.expiryDate && new Date(p.expiryDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
                            const usagePct = p.maxUses ? Math.min(100, Math.round(((p.usedCount ?? 0) / p.maxUses) * 100)) : null;
                            return (
                              <tr key={p.id} className={highlightId === p.id ? 'sa-row-highlight' : undefined}>
                                <td>{(promosPaging.safePage - 1) * PAGE_SIZE + idx + 1}</td>
                                <td><span className="sa-coupon-tag">{p.code}</span></td>
                                <td><span className="sa-cell-clamp">{p.description ?? '—'}</span></td>
                                <td>{DISCOUNT_TYPE_LABEL[p.discountType] ?? p.discountType}{p.minTier ? <><br /><small>Hạng {TIER_LABELS[p.minTier] ?? p.minTier}+</small></> : null}</td>
                                <td className="sa-cell-money"><span className="sa-money">{p.discountType === 'Percentage' ? `${p.discountValue}%` : p.discountType === 'FreeShip' ? 'Freeship' : fmtMoney(p.discountValue)}</span></td>
                                <td className="sa-cell-money"><span className="sa-money">{fmtMoney(p.minOrderAmount)}</span></td>
                                <td>
                                  <span>{p.usedCount ?? 0}{p.maxUses ? `/${p.maxUses}` : ''}</span>
                                  {usagePct != null && (
                                    <span className="sa-usage-bar" role="img" aria-label={`Đã dùng ${usagePct}%`}>
                                      <span className="sa-usage-fill" style={{ width: `${usagePct}%` }} />
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <span>{p.expiryDate ? fmtDateShort(p.expiryDate) : '—'}</span>
                                  {expired ? (
                                    <><br /><Badge tone="red">Đã hết hạn</Badge></>
                                  ) : expiringSoon ? (
                                    <><br /><Badge tone="orange">Sắp hết hạn</Badge></>
                                  ) : null}
                                </td>
                                <td>
                                  {/* Đợt 21 — Trạng thái là TOGGLE (22:37 GHI ĐÈ C3/C4):
                                    Active ↔ Disabled gạt qua lại, Draft bấm để
                                    kích hoạt — tất cả qua modal xác nhận CHUNG
                                    messages.confirm.statusChange (2 nút) +
                                    toast statusChanged; C5 vẫn chặn bật KM hết
                                    hạn (Draft/Disabled quá hạn). Expired:
                                    toggle DISABLE + tooltip.
                                    Nhãn Nháp/Hết hạn giữ lại dưới toggle để vẫn đọc được trạng thái. */}
                                  {p.status === 'Expired' ? (
                                    <span title="Không thể bật khuyến mãi đã hết hạn">
                                      <StatusSwitch
                                        checked={false}
                                        disabled
                                        testid={`admin-promo-status-switch-${p.id}`}
                                        label={`Khuyến mãi ${p.code} đã hết hạn, không thể bật`}
                                        onToggle={() => {}}
                                      />
                                    </span>
                                  ) : p.status === 'Draft' ? (
                                    <StatusSwitch
                                      checked={false}
                                      testid={`admin-promo-status-switch-${p.id}`}
                                      label={`Kích hoạt khuyến mãi ${p.code} (đang Nháp)`}
                                      onToggle={() => void requestEnablePromo(p)}
                                    />
                                  ) : (
                                    <StatusSwitch
                                      checked={p.status === 'Active'}
                                      testid={`admin-promo-status-switch-${p.id}`}
                                      label={`Đổi trạng thái khuyến mãi ${p.code} (${p.status === 'Active' ? 'đang Hoạt động' : 'đang Ngừng hoạt động'})`}
                                      onToggle={() => {
                                        if (p.status === 'Active') void requestToggleDisablePromo(p);
                                        else void requestEnablePromo(p);
                                      }}
                                    />
                                  )}
                                  {p.status === 'Draft' && (<><br /><Badge tone="yellow">Nháp</Badge></>)}
                                  {p.status === 'Expired' && (<><br /><Badge tone="gray">Hết hạn</Badge></>)}
                                  {p.disabledReason ? <><br /><small>{p.disabledReason}</small></> : null}
                                </td>
                                <td className="sa-actions">
                                  <button type="button" className="sa-icon-btn" title="Xem chi tiết khuyến mãi" aria-label={`Xem chi tiết khuyến mãi ${p.code}`} onClick={() => openPromoView(p)}><Eye size={16} strokeWidth={2} /></button>
                                  {p.status === 'Draft' && (
                                    <button type="button" className="sa-icon-btn" title="Sửa khuyến mãi" aria-label={`Sửa khuyến mãi ${p.code}`} onClick={() => openPromoEdit(p)} data-testid="admin-promo-edit-btn"><Pencil size={16} strokeWidth={2} /></button>
                                  )}
                                  <button type="button" className="sa-icon-btn" title="Xem lượt sử dụng" aria-label={`Xem lượt sử dụng khuyến mãi ${p.code}`} onClick={() => navigate(`/promotions/${p.code}/usages`)} data-testid="admin-promo-usages-btn"><History size={16} strokeWidth={2} /></button>
                                  {/* Đợt 21 — spec chỉ liệt kê 3 icon thao tác nhưng GIỮ thêm nút Xóa
                                    (icon thứ 4, chỉ Draft) để không mất chức năng xóa Draft-only
                                    (A4/A5) đang tồn tại; parent xác nhận với Matthew nếu muốn bỏ. */}
                                  {p.status === 'Draft' && (
                                    <button type="button" className="sa-icon-btn sa-icon-danger" title="Xóa khuyến mãi" aria-label={`Xóa khuyến mãi ${p.code}`} onClick={() => void requestDeletePromo(p)} data-testid="admin-promo-delete-btn"><Trash2 size={16} strokeWidth={2} /></button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {filteredPromos.length > 0 && (
                    <Pagination page={promosPaging.safePage} totalPages={promosPaging.totalPages} total={filteredPromos.length} pageSize={PAGE_SIZE} testid="admin-promos-pagination" onPage={setPromosPage} />
                  )}
                </div>
                {/* Đợt 21 — khu vực "Lượt dùng của {mã}" dưới bảng đã BỎ: xem lượt dùng
                  ở trang riêng /promotions/:code/usages (icon History ở cột Thao tác). */}
              </section>
            )}
            {!profileView && !orderCode && !onEntitySubPage && tab === 'customers' && (
              <section className="sa-list-section">
                <div className="sa-list-card">
                  {/* Đợt 21 — tìm/lọc KH TỰ ĐỘNG: gõ là tìm (debounce 300ms,
                    * server-side), đổi dropdown hạng/trạng thái là lọc ngay,
                    * không cần bấm Tìm/Enter. Khóa/mở khóa GIỮ NGUYÊN B1/B2. */}
                  <PageToolbar
                    testidPrefix="customers"
                    searchValue={customerSearch}
                    onSearchChange={setCustomerSearch}
                    searchPlaceholder="Tìm email, tên, SĐT..."
                    onReset={resetCustomers}
                    showSearchClear
                    onClearSearch={() => { setCustomerSearch(''); setCustomerSearchDebounced(''); }}
                    resetDisabled={!customerSearch.trim() && !customerTierFilter && !customerStatusFilter}
                    filters={(
                      <>
                        <select className={`sa-input sa-filter-select${customerTierFilter === '' ? ' sa-filter-select--placeholder' : ''}`} value={customerTierFilter} onChange={e => setCustomerTierFilter(e.target.value)} aria-label="Lọc hạng">
                          <option value="">Hạng</option>
                          <option value="Member">Thường</option>
                          <option value="Silver">Bạc</option>
                          <option value="Gold">Vàng</option>
                          <option value="Diamond">Kim cương</option>
                        </select>
                        <select className={`sa-input sa-filter-select${customerStatusFilter === '' ? ' sa-filter-select--placeholder' : ''}`} value={customerStatusFilter} onChange={e => setCustomerStatusFilter(e.target.value)} data-testid="admin-status-filter" aria-label="Lọc trạng thái khách hàng">
                          <option value="">Trạng thái</option>
                          <option value="active">Hoạt động</option>
                          <option value="locked">Đã khoá</option>
                        </select>
                      </>
                    )}
                  />
                  {customersLoading ? (
                    <TableSkeleton />
                  ) : customersError ? (
                    <p className="sa-error">{customersError}</p>
                  ) : customers.length === 0 ? (
                    <EmptyState
                      title={customersHasFilter ? 'Không tìm thấy khách hàng' : 'Chưa có khách hàng nào'}
                      desc={customersHasFilter ? 'Thử đổi từ khóa hoặc bộ lọc khác.' : 'Khách hàng đăng ký mới sẽ hiển thị tại đây.'}
                      action={customersHasFilter ? (
                        <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-customers-clear-filters-btn" onClick={resetCustomers}>
                          Xóa bộ lọc
                        </button>
                      ) : undefined}
                    />
                  ) : (
                    <div className="sa-table-wrap">
                      <table>
                        <thead><tr><th>STT</th><th>Mã KH</th><th>Khách hàng</th><th>Điện thoại</th><th>Hạng</th><th>Chi tiêu 12 tháng</th><th>Điểm</th><th>Số đơn</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                        <tbody>
                          {customersPaging.paged.map((c, idx) => (
                            <tr key={c.id} className={highlightId === c.id ? 'sa-row-highlight' : undefined}>
                              <td>{(customersPaging.safePage - 1) * PAGE_SIZE + idx + 1}</td>
                              <td data-testid="admin-customer-code"><span className="sa-code">{c.code ?? '—'}</span></td>
                              <td>
                                <span className="sa-user-cell">
                                  <span className="sa-avatar sa-avatar-sm" style={{ background: avatarColor(c.fullName) }}>{avatarInitial(c.fullName)}</span>
                                  <span className="sa-user-cell-names"><strong>{c.fullName}</strong><small>{c.email}</small></span>
                                </span>
                              </td>
                              <td>{c.phoneNumber ?? '—'}</td>
                              <td>{TIER_LABELS[c.membershipTier ?? ''] ?? c.membershipTier ?? '—'}</td>
                              <td className="sa-cell-money"><span className="sa-money">{fmtMoney(c.totalSpent12m)}</span></td>
                              <td data-testid={`admin-customer-points-${c.id}`}>{(c.availablePoints ?? 0).toLocaleString('vi-VN')}</td>
                              <td>{c.orderCount ?? 0}</td>
                              <td>
                                <StatusSwitch
                                  checked={!c.isLocked}
                                  testid={`admin-customer-status-switch-${c.id}`}
                                  label={`${c.isLocked ? 'Mở khóa' : 'Khóa'} tài khoản ${c.fullName}`}
                                  onToggle={() => void requestToggleCustomerLock(c)}
                                />
                              </td>
                              <td className="sa-actions">
                                <button type="button" className="sa-icon-btn" title="Xem chi tiết khách hàng" aria-label={`Xem khách hàng ${c.fullName}`} onClick={() => openCustomerView(c)}><Eye size={16} strokeWidth={2} /></button>
                                <button type="button" className="sa-icon-btn" title="Sửa thông tin khách hàng" aria-label={`Sửa khách hàng ${c.fullName}`} onClick={() => openCustomerEdit(c)}><Pencil size={16} strokeWidth={2} /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {customers.length > 0 && (
                    <Pagination page={customersPaging.safePage} totalPages={customersPaging.totalPages} total={filteredCustomers.length} pageSize={PAGE_SIZE} testid="admin-customers-pagination" onPage={setCustomersPage} />
                  )}
                </div>
              </section>
            )}
            {!profileView && !orderCode && !onEntitySubPage && tab === 'reviews' && (
              <section className="sa-list-section" data-testid="admin-reviews-section">
                <div className="sa-list-card">
                  {/* Đợt 21 — tìm/lọc đánh giá TỰ ĐỘNG: gõ là tìm (debounce
                    * 300ms, server-side), đổi dropdown sao là lọc ngay, không
                    * cần bấm Tìm/Enter. Bấm dòng → trang chi tiết full page. */}
                  <PageToolbar
                    testidPrefix="reviews"
                    searchValue={reviewSearch}
                    onSearchChange={setReviewSearch}
                    searchPlaceholder="Tìm tên sản phẩm, khách hàng, nội dung..."
                    onReset={resetReviews}
                    showSearchClear
                    onClearSearch={() => { setReviewSearch(''); setReviewSearchDebounced(''); }}
                    resetDisabled={!reviewSearch.trim() && !reviewRatingFilter}
                    filters={(
                      <select className={`sa-input sa-filter-select${reviewRatingFilter === '' ? ' sa-filter-select--placeholder' : ''}`} value={reviewRatingFilter} onChange={e => setReviewRatingFilter(e.target.value)} data-testid="admin-review-rating-filter" aria-label="Lọc theo số sao">
                        <option value="">Số sao</option>
                        <option value="5">5 sao</option>
                        <option value="4">4 sao</option>
                        <option value="3">3 sao</option>
                        <option value="2">2 sao</option>
                        <option value="1">1 sao</option>
                      </select>
                    )}
                  />
                  {reviewsLoading ? (
                    <TableSkeleton />
                  ) : reviewsError ? (
                    <p className="sa-error">{reviewsError}</p>
                  ) : reviews.length === 0 ? (
                    <EmptyState
                      title={reviewsHasFilter ? 'Không tìm thấy đánh giá' : 'Chưa có đánh giá nào'}
                      desc={reviewsHasFilter ? 'Thử đổi từ khóa hoặc bộ lọc khác.' : 'Đánh giá của khách hàng sẽ hiển thị tại đây.'}
                      action={reviewsHasFilter ? (
                        <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-reviews-clear-filters-btn" onClick={resetReviews}>
                          Xóa bộ lọc
                        </button>
                      ) : undefined}
                    />
                  ) : (
                    <div className="sa-table-wrap">
                      <table>
                        <thead><tr><th>STT</th><th>Sản phẩm</th><th>Khách hàng</th><th>Sao</th><th>Nội dung</th><th>Ngày</th><th>Thao tác</th></tr></thead>
                        <tbody>
                          {reviews.map((r, idx) => (
                            <tr key={r.id} onClick={() => openReviewDetail(r)} style={{ cursor: 'pointer' }} data-testid={`admin-review-row-${r.id}`}>
                              <td>{(reviewsPage - 1) * PAGE_SIZE + idx + 1}</td>
                              <td><strong className="sa-cell-clamp">{r.productName ?? '—'}</strong></td>
                              <td>{r.userName ?? '—'}</td>
                              <td><span aria-label={`${r.rating} trên 5 sao`}>{reviewStars(r.rating)} ({r.rating}/5)</span></td>
                              <td><span className="sa-cell-clamp">{shortComment(r.comment)}</span></td>
                              <td><DateCell value={r.createdAt} /></td>
                              <td className="sa-actions" onClick={e => e.stopPropagation()}>
                                <button type="button" className="sa-icon-btn" title="Xem chi tiết đánh giá" aria-label={`Xem đánh giá của ${r.userName ?? 'khách hàng'}`} onClick={() => openReviewDetail(r)}><Eye size={16} strokeWidth={2} /></button>
                                <button type="button" className="sa-icon-btn sa-icon-danger" title="Xóa đánh giá" aria-label={`Xóa đánh giá của ${r.userName ?? 'khách hàng'}`} onClick={() => void requestDeleteReview(r)}><Trash2 size={16} strokeWidth={2} /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {reviews.length > 0 && (
                    <Pagination page={reviewsPage} totalPages={reviewsTotalPages} total={reviewsTotalForPager} pageSize={PAGE_SIZE} testid="admin-reviews-pagination" onPage={goReviewsPage} />
                  )}
                </div>
              </section>
            )}
            {!profileView && !orderCode && tab === 'membership' && (
              <section className="sa-list-section">
                <div className="sa-list-card">
                  <div className="sa-toolbar">
                    <div className="sa-toolbar-right">
                      <button type="button" className="sa-page-toolbar-icon-btn" title="Đặt lại cấu hình (hủy thay đổi chưa lưu)" aria-label="Đặt lại cấu hình" onClick={resetMembers} data-testid="admin-members-reset-btn"><RotateCcw size={18} strokeWidth={2} /></button>
                      <button type="button" className="sa-page-toolbar-icon-btn" title="Làm mới" aria-label="Làm mới" onClick={() => void loadTiers()} data-testid="admin-members-refresh-btn"><RotateCcw size={18} strokeWidth={2} /></button>
                    </div>
                  </div>
                  {tiersLoading ? (
                    <TableSkeleton />
                  ) : tierDraft.length === 0 ? (
                    <>
                      {tiersError && <p className="sa-error">{tiersError}</p>}
                      <EmptyState title="Chưa có cấu hình hạng" desc="Cấu hình hạng hội viên sẽ hiển thị tại đây." />
                    </>
                  ) : (
                    <>
                      {tiersError && <p className="sa-error">{tiersError}</p>}
                      <div className="sa-table-wrap" style={{ marginBottom: '1rem' }}>
                        <table>
                          <thead><tr><th>STT</th><th>Hạng</th><th>Ngưỡng chi tiêu</th><th>Chi tiêu / 1 điểm</th><th>Trần dùng điểm (%)</th><th>Ngưỡng freeship</th><th>Thao tác</th></tr></thead>
                          <tbody>
                            {tierDraft.map((t, i) => (
                              <tr key={t.tier}>
                                <td>{i + 1}</td>
                                <td>{TIER_LABELS[t.tier] ?? t.tier} ({t.tier})</td>
                                <td><input className="sa-input" type="number" min={0} value={t.minSpent} onChange={e => setTierDraft(prev => prev.map((x, j) => j === i ? { ...x, minSpent: Number(e.target.value) || 0 } : x))} aria-label={`Ngưỡng ${t.tier}`} /></td>
                                <td><input className="sa-input" type="number" min={1} value={t.spendPerPoint} onChange={e => setTierDraft(prev => prev.map((x, j) => j === i ? { ...x, spendPerPoint: Number(e.target.value) || 1 } : x))} aria-label={`Tích điểm ${t.tier}`} /></td>
                                <td><input className="sa-input" type="number" min={0} max={100} value={t.maxPointsPercent} onChange={e => setTierDraft(prev => prev.map((x, j) => j === i ? { ...x, maxPointsPercent: Number(e.target.value) || 0 } : x))} aria-label={`Trần điểm ${t.tier}`} /></td>
                                <td><input className="sa-input" type="number" min={0} value={t.freeShipThreshold ?? ''} placeholder="Không đặt" onChange={e => setTierDraft(prev => prev.map((x, j) => j === i ? { ...x, freeShipThreshold: e.target.value === '' ? null : Number(e.target.value) } : x))} aria-label={`Freeship ${t.tier}`} /></td>
                                <td className="sa-actions">
                                  <button type="button" className="sa-icon-btn" title="Xem chi tiết hạng" aria-label={`Xem chi tiết hạng ${TIER_LABELS[t.tier] ?? t.tier}`} onClick={() => setSelectedTier(t)}><Eye size={16} strokeWidth={2} /></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="sa-muted-text">Lưu ý: ngưỡng chi tiêu phải tăng dần theo thứ tự Thường → Bạc → Vàng → Kim cương; thay đổi chỉ áp dụng cho đơn phát sinh sau thời điểm sửa.</p>
                      <div className="sa-actions-right">
                        <button type="button" onClick={() => void saveTiers()} className="sa-btn" data-testid="admin-save-tiers-btn">Lưu cấu hình hạng</button>
                      </div>
                    </>
                  )}
                </div>
                <div className="sa-list-card">
                  <h3 className="sa-section-title">Điều chỉnh điểm cho 1 khách</h3>
                  <form onSubmit={adjustPoints} data-testid="admin-adjust-points-form" noValidate>
                    {adjustError && <p className="sa-error">{adjustError}</p>}
                    <div className="sa-form-grid">
                      <label className="sa-field"><span>Email hoặc ID khách hàng</span>
                        <input className="sa-input" value={adjustId} onChange={e => setAdjustId(e.target.value)} data-testid="admin-adjust-user-input" />
                      </label>
                      <label className="sa-field"><span>Số điểm (dương = cộng, âm = trừ; tối đa 1000/lần)</span>
                        <input className="sa-input" type="number" value={adjustPointsValue} onChange={e => setAdjustPointsValue(e.target.value)} data-testid="admin-adjust-points-input" />
                      </label>
                      <label className="sa-field sa-field-wide"><span>Lý do (bắt buộc)</span>
                        <input className="sa-input" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} data-testid="admin-adjust-reason-input" />
                      </label>
                    </div>
                    <div className="sa-actions-right">
                      <button type="submit" disabled={adjustBusy} className="sa-btn" data-testid="admin-adjust-points-btn">Điều chỉnh điểm</button>
                    </div>
                  </form>
                </div>
              </section>
            )}
            {!profileView && !orderCode && !onEntitySubPage && tab === 'returns' && (
              <section className="sa-list-section">
                <div className="sa-list-card">
                  {/* Đợt 21 — tìm/lọc trả hàng TỰ ĐỘNG: gõ là lọc (debounce
                    * 300ms, tìm không dấu, client-side), không cần bấm Tìm/Enter.
                    * Danh sách chỉ đổi điều hướng (bấm dòng → trang chi tiết
                    * full page), không đổi cột/lọc. */}
                  <PageToolbar
                    testidPrefix="returns"
                    searchValue={returnSearch}
                    onSearchChange={setReturnSearch}
                    searchPlaceholder="Tìm mã đơn, sản phẩm, lý do..."
                    onReset={resetReturns}
                    showSearchClear
                    onClearSearch={() => { setReturnSearch(''); setReturnSearchDebounced(''); }}
                    resetDisabled={!returnSearch.trim() && !returnStatusFilter}
                    filters={(
                      <select className={`sa-input sa-filter-select${returnStatusFilter === '' ? ' sa-filter-select--placeholder' : ''}`} value={returnStatusFilter} onChange={e => setReturnStatusFilter(e.target.value)} aria-label="Lọc trạng thái trả hàng">
                        <option value="">Trạng thái</option>
                        <option value="Pending">Chờ duyệt</option>
                        <option value="Approved">Đã duyệt</option>
                        <option value="Rejected">Đã từ chối</option>
                      </select>
                    )}
                  />
                  {!returnsLoading && !returnsError && (
                    <p className="sa-orders-result-count" data-testid="admin-returns-result-count" role="status">
                      {filteredReturns.length} / {returnsList.length} yêu cầu
                    </p>
                  )}
                  {returnsLoading ? (
                    <TableSkeleton />
                  ) : returnsError ? (
                    <p className="sa-error">{returnsError}</p>
                  ) : filteredReturns.length === 0 ? (
                    <EmptyState
                      title={returnsHasFilter ? 'Không tìm thấy yêu cầu trả hàng' : 'Chưa có yêu cầu trả hàng nào'}
                      desc={returnsHasFilter ? 'Thử đổi từ khóa hoặc bộ lọc khác.' : 'Yêu cầu trả hàng của khách sẽ hiển thị tại đây.'}
                      action={returnsHasFilter ? (
                        <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-returns-clear-filters-btn" onClick={resetReturns}>
                          Xóa bộ lọc
                        </button>
                      ) : undefined}
                    />
                  ) : (
                    <div className="sa-table-wrap">
                      <table>
                        <thead><tr><th>STT</th><th>Mã đơn</th><th>Sản phẩm</th><th>SL</th><th>Lý do</th><th>Trạng thái</th><th>Hoàn tiền</th><th>Thao tác</th></tr></thead>
                        <tbody>
                          {returnsPaging.paged.map((r, idx) => (
                            <tr key={r.id} onClick={() => openReturnDetail(r)} className="sa-clickable" style={{ cursor: 'pointer' }} data-testid={`admin-return-row-${r.id}`}>
                              <td>{(returnsPaging.safePage - 1) * PAGE_SIZE + idx + 1}</td>
                              <td><span className="sa-code">{r.orderDisplayCode ?? r.orderId}</span></td>
                              <td><span className="sa-cell-clamp">{r.productName}</span></td>
                              <td>{r.quantity}</td>
                              <td><span className="sa-cell-clamp">{r.reason}</span>{r.note ? <><br /><small>{r.note}</small></> : null}</td>
                              <td><Badge tone={returnStatusTone(r.status)}>{RETURN_STATUS_LABELS[r.status] ?? r.status}</Badge>{r.adminNote ? <><br /><small>{r.adminNote}</small></> : null}</td>
                              <td>{r.refundStatus ?? '—'}{r.refundAmount ? <><br /><small className="sa-money">{fmtMoney(r.refundAmount)}</small></> : null}</td>
                              <td className="sa-actions" onClick={e => e.stopPropagation()}>
                                {r.status === 'Pending' && (
                                  <button type="button" className="sa-btn sa-btn-ghost" style={{ padding: '0.4rem 0.8rem' }} onClick={() => openReturnDetail(r)}>Duyệt / Từ chối</button>
                                )}
                                {r.status === 'Approved' && r.refundStatus === 'PendingRefund' && r.refundId && (
                                  <button type="button" className="sa-btn" style={{ padding: '0.4rem 0.8rem' }} onClick={() => { setRefundTarget(r); setRefundTxCode(''); setRefundError(null); }} data-testid="admin-return-record-refund-btn">Ghi nhận đã hoàn tiền</button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {filteredReturns.length > 0 && (
                    <Pagination page={returnsPaging.safePage} totalPages={returnsPaging.totalPages} total={filteredReturns.length} pageSize={PAGE_SIZE} testid="admin-returns-pagination" onPage={setReturnsPage} />
                  )}
                </div>
              </section>
            )}
            {!profileView && !orderCode && tab === 'logs' && (
              <section className="sa-list-section">
                <div className="sa-list-card">
                  <PageToolbar
                    testidPrefix="logs"
                    searchValue={auditSearch}
                    onSearchChange={setAuditSearch}
                    searchPlaceholder="Tìm người thực hiện, hành động..."
                    onReset={resetAudit}
                    filters={(
                      <>
                        <input type="date" className="sa-input sa-filter-date" value={auditDateFromInput} onChange={e => { setAuditDateFromInput(e.target.value); setAuditDateFrom(e.target.value); }} aria-label="Từ ngày" data-testid="admin-log-date-from" />
                        <input type="date" className="sa-input sa-filter-date" value={auditDateToInput} onChange={e => { setAuditDateToInput(e.target.value); setAuditDateTo(e.target.value); }} aria-label="Đến ngày" data-testid="admin-log-date-to" />
                      </>
                    )}
                  />
                  {auditLoading ? (
                    <TableSkeleton />
                  ) : auditError ? (
                    <p className="sa-error">{auditError}</p>
                  ) : filteredAudit.length === 0 ? (
                    <EmptyState
                      title={auditSearch.trim() || auditDateFrom || auditDateTo ? 'Không tìm thấy nhật ký' : 'Chưa có nhật ký nào'}
                      desc={auditSearch.trim() || auditDateFrom || auditDateTo ? 'Thử đổi từ khóa hoặc khoảng ngày khác.' : 'Thao tác quản trị sẽ được ghi lại tại đây.'}
                    />
                  ) : (
                    <div className="sa-table-wrap">
                      <table>
                        <thead><tr><th>STT</th><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th></tr></thead>
                        <tbody>
                          {auditPaging.paged.map((a, idx) => (
                            <tr key={a.id}>
                              <td>{(auditPaging.safePage - 1) * PAGE_SIZE + idx + 1}</td>
                              <td><DateCell value={a.createdAt} /></td>
                              <td>{a.actorEmail}</td>
                              <td>
                                {/DELETE/i.test(a.action) ? (
                                  <span className="sa-badge sa-badge--darkred">{a.action}</span>
                                ) : (
                                  <Badge tone={auditActionTone(a.action)}>{a.action}</Badge>
                                )}
                              </td>
                              <td>
                                {a.entityType ?? '—'}
                                {a.entityId ? (
                                  <span className="sa-entity-id">
                                    {' '}({String(a.entityId).slice(0, 8)}…)
                                    <button
                                      type="button"
                                      className="sa-copy-btn"
                                      title="Sao chép ID đối tượng"
                                      aria-label={`Sao chép ID ${a.entityId}`}
                                      onClick={() => { try { void navigator.clipboard?.writeText(String(a.entityId)); } catch { /* không sao chép được thì thôi */ } }}
                                    >
                                      <Copy size={16} strokeWidth={2} />
                                    </button>
                                  </span>
                                ) : ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {filteredAudit.length > 0 && (
                    <Pagination page={auditPaging.safePage} totalPages={auditPaging.totalPages} total={filteredAudit.length} pageSize={PAGE_SIZE} testid="admin-returns-audit-pagination" onPage={setAuditPage} />
                  )}
                </div>
              </section>
            )}
            {/* Đợt 21 — Drawer chi tiết trả hàng đã BỎ: xem/duyệt/từ chối là
              * trang full page /returns/:code (ReturnDetailPage ở khối trang
              * con phía trên, panel xác nhận inline). */}

            {refundTarget && (
              <FormShell
                width={680}
                testid="admin-refund-record-modal"
                title={`Ghi nhận hoàn tiền — ${refundTarget.orderDisplayCode ?? refundTarget.orderId}`}
                onClose={() => { setRefundTarget(null); setRefundTxCode(''); setRefundError(null); }}
                footer={(
                  <>
                    <button type="button" className="sa-btn sa-btn-ghost" onClick={() => { setRefundTarget(null); setRefundTxCode(''); setRefundError(null); }}>Hủy</button>
                    <button type="button" className="sa-btn" data-testid="admin-refund-record-confirm-btn" onClick={() => void recordRefund()}>Xác nhận đã hoàn tiền</button>
                  </>
                )}
              >
                <KvRow label="Sản phẩm" value={<strong>{refundTarget.productName} × {refundTarget.quantity}</strong>} />
                <KvRow label="Số tiền hoàn" value={refundTarget.refundAmount ? fmtMoney(refundTarget.refundAmount) : '—'} />
                <KvRow label="Trạng thái hoàn tiền" value={refundTarget.refundStatus ?? '—'} />
                <p className="sa-muted-text">Nhập mã giao dịch hoàn tiền thực tế (3–100 ký tự) để chuyển bản ghi hoàn tiền sang “Đã hoàn tiền”.</p>
                {refundError && <p className="sa-error">{refundError}</p>}
                <input className="sa-input" placeholder="Mã giao dịch hoàn tiền" value={refundTxCode} onChange={e => setRefundTxCode(e.target.value)} data-testid="admin-refund-transaction-input" />
              </FormShell>
            )}

            {/* Đợt 21 — Drawer/Modal chi tiết đánh giá đã BỎ: xem là trang
              * full page /reviews/:id (ReviewDetailPage ở khối trang con
              * phía trên); xóa giữ popup A6 (requestDeleteReview). */}

            {selectedTier && (
              <SparkModal
                testid="admin-tier-detail"
                title={`Hạng ${TIER_LABELS[selectedTier.tier] ?? selectedTier.tier}`}
                onClose={() => setSelectedTier(null)}
              >
                <KvRow label="Mã hạng" value={selectedTier.tier} />
                <KvRow label="Ngưỡng chi tiêu" value={fmtMoney(selectedTier.minSpent)} />
                <KvRow label="Chi tiêu / 1 điểm" value={fmtMoney(selectedTier.spendPerPoint)} />
                <KvRow label="Trần dùng điểm" value={`${selectedTier.maxPointsPercent}%`} />
                <KvRow label="Ngưỡng freeship" value={selectedTier.freeShipThreshold != null ? fmtMoney(selectedTier.freeShipThreshold) : 'Không đặt'} />
                <p className="sa-muted-text">Ngưỡng chi tiêu tăng dần theo thứ tự Thường → Bạc → Vàng → Kim cương.</p>
              </SparkModal>
            )}

            {/* Đợt 21 — Drawer CategoryForm đã BỎ: thêm/sửa/xem DM là trang
              * full page /categories/* (CategoryForm variant="page" ở khối
              * trang con phía trên). */}
            {/* Đợt 21 — Drawer CustomerForm đã BỎ: xem/sửa KH là trang full
              * page /customers/* (CustomerForm variant="page" ở khối trang
              * con phía trên). */}
          </main>
        </div>
      </div>
    </div>
  );
}
