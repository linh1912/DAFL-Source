import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { apiJson, clearToken } from '../../../../Shared/utils/api';
import type { NotificationItem } from '../../../../Shared/types';
import { CategoryForm, CustomerForm, ProductForm, PromoForm } from './AdminForms';
import type { CategorySavePayload, CustomerSavePayload, FormSaveResult, ProductSavePayload, PromoSavePayload } from './AdminForms';
import { REQUIRED_MSG, duplicateFieldOf } from './formUtils';
import { StatusSwitch } from './FormControls';
import AdminProfilePage from './AdminProfilePage';
import { AdminDashboard } from './Dashboard';
import type { DashboardNavFilter, DashboardTab } from './Dashboard';
import { ToastHost } from './Toast';
import { ConfirmDialogHost, confirmAction } from './ConfirmDialog';
import { notify, notifyHttpError } from './notify';
import { fmt, messages, shortName } from './messages.vi';
import { PageToolbar } from './PageToolbar';
import { Badge, EmptyState, Pagination } from './shared';
import { Bell, ChevronDown, Copy, Eye, Lock, Maximize2, Menu, Pencil, Play, RotateCcw, ShoppingBag, Star, Trash2, X } from 'lucide-react';
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
interface OrderItem { id: string; productId: string; productName: string; productImageUrl?: string | null; unitPrice: number; quantity: number; }
interface StatusHistory { status: string | number; note?: string | null; timestamp: string; }
interface OrderDetail {
  id: string; orderCode: number; orderDisplayCode?: string | null; customerName: string;
  customerEmail: string; customerPhone: string; shippingAddress?: string; subTotal: number;
  discountAmount?: number; voucherCode?: string | null; totalAmount: number; status: string;
  statusLabel?: string; createdAt: string; paymentMethod?: string; shippingFee?: number;
  cancelReason?: string | null; pointsUsed?: number; pointsDiscount?: number; pointsEarned?: number;
  freeShipVoucherCode?: string | null; trackingCode?: string | null; carrier?: string | null;
  deliveredAt?: string | null; completedAt?: string | null;
  shipProvinceName?: string | null; shipDistrictName?: string | null; shipWardName?: string | null;
  shipDetailAddress?: string | null; shipNote?: string | null;
  items?: OrderItem[]; statusHistories?: StatusHistory[];
}
interface AdminOrderDetailData { order: OrderDetail; internalNote?: string | null; userId?: string | null; }
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
interface PromotionUsage { id: string; userId: string; userEmail: string; orderId: string; orderDisplayCode?: string | null; discountAmount: number; createdAt: string; }
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
// Palette admin: sidebar Dark Forest Green #051C12, điểm nhấn Lime Yellow #B4F105
// (cột biểu đồ doanh thu dùng lime; pill trạng thái giữ xanh lá/cam/đỏ theo ngữ nghĩa).
const LIME = '#b4f105';
const ORDER_STATUSES = ['Pending', 'Paid', 'Confirmed', 'Preparing', 'Shipping', 'Delivered', 'Completed', 'Cancelled', 'Expired'];
const ORDER_STATUS_LABELS: Record<string, string> = {
  Pending: 'Chờ xử lý', Paid: 'Đã thanh toán', Confirmed: 'Đã xác nhận', Preparing: 'Đang chuẩn bị',
  Shipping: 'Đang giao', Delivered: 'Đã giao', Completed: 'Hoàn tất', ReturnRequested: 'Yêu cầu trả hàng',
  Cancelled: 'Đã hủy', Expired: 'Đã hết hạn',
};
/** Máy trạng thái trong AdminGuard.OrderStateMachine (BE) — chỉ cho chọn đích hợp lệ. */
const ALLOWED_NEXT: Record<string, string[]> = {
  Pending: ['Paid', 'Confirmed', 'Expired'],
  Paid: ['Confirmed', 'Preparing'],
  Confirmed: ['Preparing', 'Shipping'],
  Preparing: ['Shipping'],
  Shipping: ['Delivered'],
  Delivered: ['Completed', 'ReturnRequested'],
  Completed: [], ReturnRequested: ['Delivered'], Cancelled: [], Expired: [],
};
/** Thứ tự enum OrderStatus ở BE (AppDbContext) — lịch sử trạng thái có thể trả status dạng số. */
const ORDER_STATUS_BY_INDEX = ['Pending', 'Paid', 'Cancelled', 'Expired', 'Preparing', 'Shipping', 'Delivered', 'Confirmed', 'Completed', 'ReturnRequested'];
const TIER_LABELS: Record<string, string> = { Member: 'Thường', Silver: 'Bạc', Gold: 'Vàng', Diamond: 'Kim cương' };

const fmtMoney = (n?: number | null) => `${(n ?? 0).toLocaleString('vi-VN')}₫`;
const fmtDate = (s?: string | null) => {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleString('vi-VN');
};
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

/** Pill trạng thái đơn: xanh lá = đã thanh toán/hoàn tất, cam = đang xử lý,
 *  đỏ = đã hủy/hết hạn, tím = yêu cầu trả hàng. Nhãn lấy từ ORDER_STATUS_LABELS. */
const statusPillClass = (s: string | number | undefined | null) => {
  const n = statusName(s);
  if (['Paid', 'Delivered', 'Completed'].includes(n)) return 'sa-pill sa-pill-green';
  if (['Cancelled', 'Expired'].includes(n)) return 'sa-pill sa-pill-red';
  if (n === 'ReturnRequested') return 'sa-pill sa-pill-purple';
  if (n === 'Shipping') return 'sa-pill sa-pill-blue';
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
 * Nhóm menu sidebar — DẠNG PHẲNG (Matthew chốt 17:42, đợt 18 wave D, ghi đè
 * dropdown 16:31): Tổng quan đứng riêng trên cùng (không tiêu đề nhóm) rồi tới
 * 4 nhóm Bán hàng / Quản lý sản phẩm / Quản lý khách hàng / Hệ thống. Tiêu đề
 * nhóm là chữ thường (không in hoa), KHÔNG nút bấm, KHÔNG chevron, KHÔNG thu
 * gọn/mở — lúc nào cũng hiện đủ 10 mục.
 */
const NAV_GROUPS: Array<{ key: string; title: string; keys: Tab[] }> = [
  { key: 'sales', title: 'Bán hàng', keys: ['orders', 'returns', 'promotions'] },
  { key: 'products', title: 'Quản lý sản phẩm', keys: ['products', 'categories', 'reviews'] },
  { key: 'customers', title: 'Quản lý khách hàng', keys: ['customers', 'membership'] },
  { key: 'system', title: 'Hệ thống', keys: ['logs'] },
];
const NAV_BY_KEY: Record<Tab, (typeof NAV)[number]> = Object.fromEntries(NAV.map(i => [i.key, i])) as Record<Tab, (typeof NAV)[number]>;
const TAB_META: Record<Tab, { title: string; desc: string }> = {
  dashboard: { title: 'Tổng quan', desc: 'Doanh thu, đơn hàng và hoạt động của sàn hôm nay.' },
  orders: { title: 'Đơn hàng', desc: 'Theo dõi và xử lý đơn hàng của khách.' },
  products: { title: 'Sản phẩm', desc: 'Danh sách sản phẩm đang bán trên sàn.' },
  categories: { title: 'Danh mục', desc: 'Quản lý danh mục sản phẩm.' },
  promotions: { title: 'Khuyến mãi', desc: 'Voucher và chương trình giảm giá.' },
  customers: { title: 'Khách hàng', desc: 'Tài khoản khách hàng và lịch sử mua hàng.' },
  reviews: { title: 'Đánh giá', desc: 'Đánh giá của khách hàng về sản phẩm.' },
  membership: { title: 'Hội viên', desc: 'Cấu hình hạng hội viên và điều chỉnh điểm.' },
  returns: { title: 'Trả hàng', desc: 'Yêu cầu trả hàng của khách hàng.' },
  logs: { title: 'Nhật ký hệ thống', desc: 'Lịch sử thao tác quản trị (audit log).' },
};

export default function AdminPage() {
  const [gate, setGate] = useState<'checking' | 'ok' | 'forbidden' | 'no-admin' | 'unauthorized'>('checking');
  const [gateMsg, setGateMsg] = useState('');
  const [currentEmail, setCurrentEmail] = useState('');
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  // Trang Hồ sơ quản trị (đợt 17, FR-ACC): mở từ menu tài khoản ở topbar,
  // thay thế nội dung tab (sidebar/topbar giữ nguyên), Quay lại → về tab cũ.
  const [profileView, setProfileView] = useState(false);
  // Menu phẳng (đợt 18 wave D): không còn thu gọn/mở nhóm — không state,
  // không localStorage 'dafl_admin_nav_groups', không badge tổng nhóm.
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
  const [orderStatusFilter, setOrderStatusFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<AdminOrderDetailData | null>(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [orderDetailError, setOrderDetailError] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState('');
  const [shipCarrier, setShipCarrier] = useState('');
  const [shipTracking, setShipTracking] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [orderBusy, setOrderBusy] = useState(false);

  // Sản phẩm + danh mục
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [productCatFilter, setProductCatFilter] = useState('');
  const [productForm, setProductForm] = useState<ProductFormInitial>({ id: '', code: '', name: '', categoryId: '', price: '', originalPrice: '', stock: '', description: '', imageUrl: '', imageUrls: [], isActive: true });
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [productFormMode, setProductFormMode] = useState<'create' | 'edit' | 'view'>('create');
  // Dropdown Trạng thái ở toolbar SP (đợt 17, FR-COM-02/03): '' = Tất cả,
  // 'true' = Hoạt động, 'false' = Ngừng hoạt động. Lọc client-side như cũ.
  const [productStatusFilter, setProductStatusFilter] = useState('');
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [catsLoading, setCatsLoading] = useState(false);
  const [catsError, setCatsError] = useState<string | null>(null);
  const [catSearch, setCatSearch] = useState('');
  const [catStatusFilter, setCatStatusFilter] = useState('');
  const [catForm, setCatForm] = useState<CategoryFormInitial>({ id: '', code: '', name: '', description: '', sortOrder: '0', isActive: true, slug: '', iconUrl: '' });
  const [catFormOpen, setCatFormOpen] = useState(false);
  const [catFormMode, setCatFormMode] = useState<'create' | 'edit' | 'view'>('create');

  // Khuyến mãi
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [promosLoading, setPromosLoading] = useState(false);
  const [promosError, setPromosError] = useState<string | null>(null);
  const [promoStatusFilter, setPromoStatusFilter] = useState('');
  const [promoSearch, setPromoSearch] = useState('');
  const [promoForm, setPromoForm] = useState<PromoFormInitial>({
    id: '', code: '', description: '', discountType: 'Percentage', discountValue: '', minOrderAmount: '0',
    maxDiscountAmount: '', startDate: '', expiryDate: '', maxUses: '', maxUsesPerUser: '1',
    minTier: '', scopeType: 'All', scopeCategoryId: '', scopeProductIds: '',
    statusLabel: '', createdAt: '',
  });
  const [promoFormOpen, setPromoFormOpen] = useState(false);
  const [promoFormMode, setPromoFormMode] = useState<'create' | 'edit' | 'view'>('create');
  const [promoUsage, setPromoUsage] = useState<PromotionUsage[] | null>(null);
  const [promoUsageFor, setPromoUsageFor] = useState('');

  // Khách hàng
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerTierFilter, setCustomerTierFilter] = useState('');
  // Dropdown Trạng thái ở toolbar KH (đợt 17): '' = Tất cả, 'active' = Hoạt động, 'locked' = Đã khoá.
  const [customerStatusFilter, setCustomerStatusFilter] = useState('');
  // Form sửa khách hàng (MỚI — đợt 17, Q1): trang riêng 2 cột, Mã KH disable, Email chỉ xem.
  const [customerForm, setCustomerForm] = useState<CustomerFormInitial>({ id: '', code: '', fullName: '', email: '', phoneNumber: '', address: '', createdAt: '' });
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [customerFormMode, setCustomerFormMode] = useState<'create' | 'edit' | 'view'>('create');

  // Đánh giá (đợt 16): admin chỉ xem/xóa, KHÔNG tạo/sửa (đánh giá là của khách).
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewRatingFilter, setReviewRatingFilter] = useState('');
  const [selectedReview, setSelectedReview] = useState<AdminReview | null>(null);
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
  const [returnTarget, setReturnTarget] = useState<ReturnReq | null>(null);
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

  const loadOrders = useCallback(async (overrides?: { status?: string; search?: string }) => {
    setOrdersLoading(true); setOrdersError(null);
    try {
      const status = overrides?.status ?? orderStatusFilter;
      const search = overrides?.search ?? orderSearch;
      const params = new URLSearchParams({ page: '1', pageSize: '20' });
      if (status) params.set('status', status);
      if (search.trim()) params.set('search', search.trim());
      const { body } = await apiJson<AdminOrderRow[]>(`/api/admin/orders?${params.toString()}`, { skipAuthHandler: true });
      if (body?.success && Array.isArray(body.data)) setOrders(body.data);
      else setOrdersError(apiErr(body, 'Không tải được đơn hàng.'));
    } catch { setOrdersError('Không thể kết nối đến máy chủ.'); }
    finally { setOrdersLoading(false); }
  }, [orderStatusFilter, orderSearch]);

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

  // ---------- Badge đếm trên menu (đợt 18): số liệu THẬT, tải khi vào admin ----------
  // Đơn chờ xác nhận: lấy từ /api/admin/dashboard (pendingOrders) — endpoint đơn
  // /api/admin/orders phân trang 20 dòng, không trả total nên không đếm chính xác được.
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

  // Đổi bộ lọc/tìm kiếm thì quay về trang 1 (phân trang client-side).
  useEffect(() => { setOrdersPage(1); }, [orderSearch, orderStatusFilter]);
  useEffect(() => { setProductsPage(1); }, [productSearch, productCatFilter, productStatusFilter]);
  useEffect(() => { setCategoriesPage(1); }, [catSearch, catStatusFilter]);
  useEffect(() => { setPromosPage(1); }, [promoSearch, promoStatusFilter]);
  useEffect(() => { setCustomersPage(1); }, [customerSearch, customerTierFilter, customerStatusFilter]);
  useEffect(() => { setReviewsPage(1); }, [reviewSearch, reviewRatingFilter]);
  useEffect(() => { setReturnsPage(1); }, [returnSearch, returnStatusFilter]);
  useEffect(() => { setAuditPage(1); }, [auditSearch, auditDateFrom, auditDateTo]);

  // ---------- Nút "Đặt lại" ở toolbar từng mục: xóa sạch bộ lọc/tìm kiếm về mặc định.
  // Mục lọc ở server (đơn hàng/khách hàng/khuyến mãi): tải lại luôn với bộ lọc đã xóa
  // (loader nhận overrides để không dính state cũ trong closure). Mục lọc client-side
  // thì chỉ cần xóa state — bảng tự lọc lại trên dữ liệu đã tải.
  const resetOrders = () => { setOrderSearch(''); setOrderStatusFilter(''); setOrdersPage(1); void loadOrders({ status: '', search: '' }); };
  const resetProducts = () => { setProductSearch(''); setProductCatFilter(''); setProductStatusFilter(''); setProductsPage(1); };
  const resetCategories = () => { setCatSearch(''); setCatStatusFilter(''); setCategoriesPage(1); };
  const resetPromos = () => { setPromoSearch(''); setPromoStatusFilter(''); setPromosPage(1); void loadPromos({ status: '' }); };
  const resetCustomers = () => { setCustomerSearch(''); setCustomerTierFilter(''); setCustomerStatusFilter(''); setCustomersPage(1); void loadCustomers({ tier: '', search: '' }); };
  const resetReviews = () => { setReviewSearch(''); setReviewRatingFilter(''); setReviewsPage(1); void loadReviews({ search: '', rating: '', page: 1 }); };
  const resetReturns = () => { setReturnSearch(''); setReturnStatusFilter(''); setReturnsPage(1); };
  const resetAudit = () => { setAuditSearch(''); setAuditDateFromInput(''); setAuditDateToInput(''); setAuditDateFrom(''); setAuditDateTo(''); setAuditPage(1); };
  // Hội viên không có bộ lọc/tìm kiếm: Đặt lại = hủy thay đổi cấu hình hạng chưa lưu.
  const resetMembers = () => { setTierDraft(tiers); };

  // Dashboard mới (đợt 18): điều hướng từ KPI/biểu đồ/dòng dữ liệu.
  const handleDashboardNavigate = (tab: DashboardTab, filter?: DashboardNavFilter) => {
    setSidebarOpen(false);
    if (tab === 'orders') {
      setOrderStatusFilter(filter?.status ?? '');
      setOrderSearch(filter?.search ?? '');
      setTab('orders');
      void loadOrders({ status: filter?.status ?? '', search: filter?.search ?? '' });
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

  // Badge menu: đơn chờ xác nhận (từ dashboard), trả hàng chờ duyệt (từ danh sách),
  // đánh giá mới 7 ngày (đếm riêng). null = chưa tải/không đếm được → ẩn badge.
  const pendingOrdersCount: number | null = dash?.pendingOrders ?? null;
  const pendingReturnsCount = returnsList.filter(r => r.status === 'Pending').length;

  const filteredProducts = products.filter(p =>
    (!productCatFilter || p.categoryId === productCatFilter) &&
    (!productStatusFilter || String(p.isActive ?? true) === productStatusFilter) &&
    (!productSearch.trim() || p.name.toLowerCase().includes(productSearch.trim().toLowerCase()))
  );

  // Lọc client-side cho các bảng chưa có tham số search ở backend.
  const filteredCategories = categories.filter(c =>
    (!catStatusFilter || String(c.isActive) === catStatusFilter) &&
    (!catSearch.trim() || c.name.toLowerCase().includes(catSearch.trim().toLowerCase()) || (c.slug ?? '').toLowerCase().includes(catSearch.trim().toLowerCase()))
  );
  const filteredPromos = promos.filter(p =>
    !promoSearch.trim() || p.code.toLowerCase().includes(promoSearch.trim().toLowerCase()) || (p.description ?? '').toLowerCase().includes(promoSearch.trim().toLowerCase())
  );
  // Lọc trạng thái khách client-side (BE ListCustomers chỉ nhận search/tier):
  // 'active' = đang hoạt động (không khoá), 'locked' = đã khoá.
  const filteredCustomers = customers.filter(c =>
    (!customerStatusFilter || (customerStatusFilter === 'locked' ? !!c.isLocked : !c.isLocked))
  );
  const filteredReturns = returnsList.filter(r =>
    !returnSearch.trim() ||
    (r.orderDisplayCode ?? r.orderId).toLowerCase().includes(returnSearch.trim().toLowerCase()) ||
    r.productName.toLowerCase().includes(returnSearch.trim().toLowerCase()) ||
    r.reason.toLowerCase().includes(returnSearch.trim().toLowerCase())
  );
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
  const ordersPaging = paginate(orders, ordersPage);
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

  const openOrderDetail = async (id: string) => {
    setOrderDetailLoading(true); setOrderDetailError(null); setSelectedOrder(null);
    setNextStatus(''); setShipCarrier(''); setShipTracking(''); setStatusNote('');
    try {
      const { body } = await apiJson<AdminOrderDetailData>(`/api/admin/orders/${id}`, { skipAuthHandler: true });
      if (body?.success && body.data?.order) setSelectedOrder(body.data);
      else setOrderDetailError(apiErr(body, 'Không tải được chi tiết đơn.'));
    } catch { setOrderDetailError('Không thể kết nối đến máy chủ.'); }
    finally { setOrderDetailLoading(false); }
  };

  const changeOrderStatus = async () => {
    if (!selectedOrder || !nextStatus) return;
    if (nextStatus === 'Shipping' && (shipCarrier.trim().length === 0 || shipTracking.trim().length < 6 || shipTracking.trim().length > 30)) {
      setOrderDetailError('Chuyển sang Đang giao bắt buộc có đơn vị vận chuyển và mã vận đơn 6–30 ký tự.');
      return;
    }
    setOrderBusy(true); setOrderDetailError(null);
    try {
      const { body } = await apiJson<string>(`/api/admin/orders/${selectedOrder.order.id}/status`, {
        method: 'POST', skipAuthHandler: true,
        body: JSON.stringify({ toStatus: nextStatus, carrier: shipCarrier.trim() || undefined, trackingCode: shipTracking.trim() || undefined, note: statusNote.trim() || undefined }),
      });
      if (body?.success) {
        notify.success(
          messages.toast.order.statusChanged.title,
          fmt(messages.toast.order.statusChanged.desc, {
            'mã đơn': selectedOrder.order.orderDisplayCode ?? `#${selectedOrder.order.orderCode}`,
            'trạng thái': ORDER_STATUS_LABELS[nextStatus] ?? nextStatus,
          }),
        );
        await openOrderDetail(selectedOrder.order.id);
        await loadOrders();
        await loadDashboard(); // làm mới badge đơn chờ xác nhận
      }
      else setOrderDetailError(apiErr(body, 'Không đổi được trạng thái đơn.'));
    } catch { setOrderDetailError('Không thể kết nối đến máy chủ.'); }
    finally { setOrderBusy(false); }
  };

  /** Đổi trạng thái đơn (đợt 18, spec A–H): D2 xác nhận đơn (Chờ xử lý →
   *  Đã xác nhận) dùng riêng [Hủy][Xác nhận đơn]; các đích khác dùng D3
   *  [Hủy][Cập nhật]. Hiện rõ trạng thái cũ → mới rồi mới gọi API. */
  const requestChangeOrderStatus = async () => {
    if (!selectedOrder || !nextStatus) return;
    if (nextStatus === 'Shipping' && (shipCarrier.trim().length === 0 || shipTracking.trim().length < 6 || shipTracking.trim().length > 30)) {
      setOrderDetailError('Chuyển sang Đang giao bắt buộc có đơn vị vận chuyển và mã vận đơn 6–30 ký tự.');
      return;
    }
    const isConfirm = nextStatus === 'Confirmed';
    const cfg = isConfirm ? messages.confirm.confirmOrder : messages.confirm.changeOrderStatus;
    const { confirmed } = await confirmAction({
      title: cfg.title,
      message: fmt(cfg.message, {
        'mã đơn': selectedOrder.order.orderDisplayCode ?? `#${selectedOrder.order.orderCode}`,
        'trạng thái cũ': selectedOrder.order.statusLabel ?? statusLabel(selectedOrder.order.status),
        'trạng thái mới': ORDER_STATUS_LABELS[nextStatus] ?? nextStatus,
      }),
      confirmText: cfg.confirmText,
      cancelText: 'Hủy',
      variant: 'info',
    });
    if (!confirmed) return;
    await changeOrderStatus();
  };

  /** Hủy đơn (đợt 18, spec A–H D1 — cam): nút trái [Giữ đơn hàng], lý do bắt
   *  buộc — nhập trong popup xác nhận, lỗi trống "Vui lòng nhập lý do hủy đơn."
   *  — rồi mới gọi API. */
  const requestCancelOrder = async () => {
    if (!selectedOrder) return;
    const { confirmed, reason } = await confirmAction({
      title: messages.confirm.cancelOrder.title,
      message: fmt(messages.confirm.cancelOrder.message, {
        'mã đơn': selectedOrder.order.orderDisplayCode ?? `#${selectedOrder.order.orderCode}`,
        'tên khách': shortName(selectedOrder.order.customerName),
        'tổng tiền': fmtMoney(selectedOrder.order.totalAmount),
      }),
      confirmText: messages.confirm.cancelOrder.confirmText,
      cancelText: 'Giữ đơn hàng',
      variant: 'warning',
      requireReason: true,
      reasonLabel: 'Lý do hủy đơn',
      reasonPlaceholder: 'Nhập lý do hủy đơn...',
      reasonError: messages.validate.cancelOrderReasonEmpty,
    });
    if (!confirmed) return;
    await doCancelOrder(reason ?? '');
  };

  const doCancelOrder = async (reason: string) => {
    if (!selectedOrder) return;
    setOrderBusy(true); setOrderDetailError(null);
    try {
      const { body } = await apiJson<string>(`/api/admin/orders/${selectedOrder.order.id}/cancel`, {
        method: 'POST', skipAuthHandler: true, body: JSON.stringify({ reason: reason.trim() }),
      });
      if (body?.success) {
        notify.success(
          messages.toast.order.cancelled.title,
          fmt(messages.toast.order.cancelled.desc, { 'mã đơn': selectedOrder.order.orderDisplayCode ?? `#${selectedOrder.order.orderCode}` }),
        );
        await openOrderDetail(selectedOrder.order.id);
        await loadOrders();
        await loadDashboard(); // làm mới badge đơn chờ xác nhận
      } else setOrderDetailError(apiErr(body, 'Không hủy được đơn hàng.'));
    } catch { setOrderDetailError('Không thể kết nối đến máy chủ.'); }
    finally { setOrderBusy(false); }
  };

  /**
   * Lưu sản phẩm (đợt 17): form đã validate xong, chỉ gọi API.
   * Trả { ok, error, fieldErrors } để form biết có đóng hay hiện lỗi trong form;
   * thành công thì đóng form + toast + reload + highlight hàng vừa lưu.
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
        setProductFormOpen(false);
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

  /** Gạt Switch SP (đợt 18, §6.3): popup xác nhận Ẩn/Hiển thị theo messages.vi,
   *  đúng 2 nút; Xác nhận mới gọi API (switch giữ nguyên khi Hủy). */
  const requestToggleProduct = async (p: PublicProduct, next: boolean) => {
    const cfg = next
      ? {
        title: messages.confirm.showProduct.title,
        message: fmt(messages.confirm.showProduct.message, { tên: shortName(p.name) }),
        confirmText: messages.confirm.showProduct.confirmText,
        variant: 'info' as const,
      }
      : {
        title: messages.confirm.hideProduct.title,
        message: fmt(messages.confirm.hideProduct.message, { tên: shortName(p.name) }),
        confirmText: messages.confirm.hideProduct.confirmText,
        variant: 'warning' as const,
      };
    const { confirmed } = await confirmAction({ ...cfg, cancelText: 'Hủy' });
    if (!confirmed) return;
    await toggleProductStatus(p, next);
  };

  /** Gạt Switch SP: PUT toàn bộ field hiện có + isActive đảo ngược. */
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
        if (next) notify.success(messages.toast.product.shown.title, fmt(messages.toast.product.shown.desc, { tên: shortName(p.name) }));
        else notify.success(messages.toast.product.hidden.title, fmt(messages.toast.product.hidden.desc, { tên: shortName(p.name) }));
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
        setCatFormOpen(false);
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

  /** Gạt Switch DM (đợt 18, spec A–H C6/C7): popup xác nhận Ẩn/Hiển thị, đúng 2 nút. */
  const requestToggleCategory = async (c: AdminCategory, next: boolean) => {
    const cfg = next
      ? {
        title: messages.confirm.showCategory.title,
        message: fmt(messages.confirm.showCategory.message, { tên: shortName(c.name) }),
        confirmText: messages.confirm.showCategory.confirmText,
        variant: 'info' as const,
      }
      : {
        title: messages.confirm.hideCategory.title,
        message: fmt(messages.confirm.hideCategory.message, { tên: shortName(c.name), n: c.productCount ?? 0 }),
        confirmText: messages.confirm.hideCategory.confirmText,
        variant: 'warning' as const,
      };
    const { confirmed } = await confirmAction({ ...cfg, cancelText: 'Hủy' });
    if (!confirmed) return;
    await toggleCategoryStatus(c, next);
  };

  /** Gạt Switch DM: PUT toàn bộ field hiện có + isActive đảo ngược. */
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
        if (next) notify.success(messages.toast.category.shown.title, fmt(messages.toast.category.shown.desc, { tên: shortName(c.name) }));
        else notify.success(messages.toast.category.hidden.title, fmt(messages.toast.category.hidden.desc, { tên: shortName(c.name) }));
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
   *  Tạo mới: toggle "Kích hoạt ngay sau khi tạo" (admin-promo-status-toggle)
   *  thì sau khi tạo thành công sẽ gọi thêm POST .../activate cho voucher vừa tạo. */
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
          setPromoFormOpen(false);
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
        if (payload.activateNow && createdId) {
          await apiJson<string>(`/api/admin/promotions/${createdId}/activate`, { method: 'POST', skipAuthHandler: true, body: JSON.stringify({}) });
          await loadPromos();
        }
        if (createdId) setHighlightId(createdId);
        setPromoFormOpen(false);
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
   *  (nút Ở lại / Thoát); chưa sửa thì đóng luôn. */
  /** Đóng form (đợt 18, §6.6): form đã hỏi qua confirmAction trước khi gọi tới đây
   *  (dirty=false khi đã xác nhận); fallback khi host chưa mount thì cha hỏi lại
   *  bằng messages.confirm.discardForm — đúng 2 nút [Ở lại] + [Thoát]. */
  const requestCloseProduct = async (dirty: boolean) => {
    if (!dirty) { setProductFormOpen(false); return; }
    const { confirmed } = await confirmAction({
      title: messages.confirm.discardForm.title,
      message: messages.confirm.discardForm.message,
      confirmText: messages.confirm.discardForm.confirmText,
      cancelText: 'Ở lại',
      variant: 'warning',
    });
    if (confirmed) setProductFormOpen(false);
  };
  /** Đóng form (đợt 18, §6.6): form đã hỏi qua confirmAction trước khi gọi tới đây
   *  (dirty=false khi đã xác nhận); fallback khi host chưa mount thì cha hỏi lại
   *  bằng messages.confirm.discardForm — đúng 2 nút [Ở lại] + [Thoát]. */
  const requestCloseCategory = async (dirty: boolean) => {
    if (!dirty) { setCatFormOpen(false); return; }
    const { confirmed } = await confirmAction({
      title: messages.confirm.discardForm.title,
      message: messages.confirm.discardForm.message,
      confirmText: messages.confirm.discardForm.confirmText,
      cancelText: 'Ở lại',
      variant: 'warning',
    });
    if (confirmed) setCatFormOpen(false);
  };
  /** Đóng form (đợt 18, §6.6): form đã hỏi qua confirmAction trước khi gọi tới đây
   *  (dirty=false khi đã xác nhận); fallback khi host chưa mount thì cha hỏi lại
   *  bằng messages.confirm.discardForm — đúng 2 nút [Ở lại] + [Thoát]. */
  const requestClosePromo = async (dirty: boolean) => {
    if (!dirty) { setPromoFormOpen(false); return; }
    const { confirmed } = await confirmAction({
      title: messages.confirm.discardForm.title,
      message: messages.confirm.discardForm.message,
      confirmText: messages.confirm.discardForm.confirmText,
      cancelText: 'Ở lại',
      variant: 'warning',
    });
    if (confirmed) setPromoFormOpen(false);
  };
  /** Đóng form (đợt 18, §6.6): form đã hỏi qua confirmAction trước khi gọi tới đây
   *  (dirty=false khi đã xác nhận); fallback khi host chưa mount thì cha hỏi lại
   *  bằng messages.confirm.discardForm — đúng 2 nút [Ở lại] + [Thoát]. */
  const requestCloseCustomer = async (dirty: boolean) => {
    if (!dirty) { setCustomerFormOpen(false); return; }
    const { confirmed } = await confirmAction({
      title: messages.confirm.discardForm.title,
      message: messages.confirm.discardForm.message,
      confirmText: messages.confirm.discardForm.confirmText,
      cancelText: 'Ở lại',
      variant: 'warning',
    });
    if (confirmed) setCustomerFormOpen(false);
  };

  /** Giá trị ban đầu cho CustomerForm (view/edit): Mã KH + Email chỉ xem. */
  const customerFormInitial = (c: Customer): CustomerFormInitial => ({
    id: c.id, code: c.code ?? '', fullName: c.fullName, email: c.email,
    phoneNumber: c.phoneNumber ?? '', address: c.address ?? '', createdAt: c.createdAt,
  });
  /** Mở form sửa khách (đợt 17, Q1): nạp giá trị hiện có; Mã KH + Email chỉ xem. */
  const openCustomerEdit = (c: Customer) => {
    setCustomerForm(customerFormInitial(c));
    setCustomerFormMode('edit');
    setCustomerFormOpen(true);
  };
  /** Mở form xem khách (đợt 18): CustomerForm mode="view" — [Đóng] + [Chỉnh sửa]. */
  const openCustomerView = (c: Customer) => {
    setCustomerForm(customerFormInitial(c));
    setCustomerFormMode('view');
    setCustomerFormOpen(true);
  };

  /** Giá trị ban đầu cho ProductForm (view/edit). BE chỉ trả 1 imageUrl nên
   *  gallery chế độ xem chỉ có 1 ảnh (imageUrls = [imageUrl]). */
  const productFormInitial = (p: PublicProduct): ProductFormInitial => ({
    id: p.id, code: p.code ?? '', name: p.name, categoryId: p.categoryId,
    price: String(p.price), originalPrice: p.originalPrice ? String(p.originalPrice) : '',
    stock: String(p.availableStock ?? p.stock ?? 0), description: p.description ?? '',
    imageUrl: p.imageUrl ?? '', imageUrls: p.imageUrl ? [p.imageUrl] : [], isActive: p.isActive ?? true,
  });
  const openProductCreate = () => {
    setProductForm({ id: '', code: '', name: '', categoryId: categories[0]?.id ?? '', price: '', originalPrice: '', stock: '', description: '', imageUrl: '', imageUrls: [], isActive: true });
    setProductFormMode('create');
    setProductFormOpen(true);
  };
  const openProductView = (p: PublicProduct) => {
    setProductForm(productFormInitial(p));
    setProductFormMode('view');
    setProductFormOpen(true);
  };
  const openProductEdit = (p: PublicProduct) => {
    setProductForm(productFormInitial(p));
    setProductFormMode('edit');
    setProductFormOpen(true);
  };

  /** Giá trị ban đầu cho CategoryForm (view/edit). */
  const categoryFormInitial = (c: AdminCategory): CategoryFormInitial => ({
    id: c.id, code: c.code ?? '', name: c.name, description: c.description ?? '',
    sortOrder: String(c.sortOrder ?? 0), isActive: c.isActive, slug: c.slug ?? '', iconUrl: c.iconUrl ?? '',
  });
  const openCategoryCreate = () => {
    setCatForm({ id: '', code: '', name: '', description: '', sortOrder: '0', isActive: true, slug: '', iconUrl: '' });
    setCatFormMode('create');
    setCatFormOpen(true);
  };
  const openCategoryView = (c: AdminCategory) => {
    setCatForm(categoryFormInitial(c));
    setCatFormMode('view');
    setCatFormOpen(true);
  };
  const openCategoryEdit = (c: AdminCategory) => {
    setCatForm(categoryFormInitial(c));
    setCatFormMode('edit');
    setCatFormOpen(true);
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
        // Thành công: form tự toast qua notify + messages.vi (W2) — cha chỉ đóng + reload.
        await loadCustomers();
        setHighlightId(payload.id);
        setCustomerFormOpen(false);
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

  /** Giá trị ban đầu cho PromoForm (view/edit): mã/loại/phạm vi chỉ xem khi sửa. */
  const promoFormInitial = (p: Promotion): PromoFormInitial => ({
    id: p.id, code: p.code, description: p.description ?? '', discountType: p.discountType,
    discountValue: String(p.discountValue), minOrderAmount: String(p.minOrderAmount ?? 0),
    maxDiscountAmount: p.maxDiscountAmount != null ? String(p.maxDiscountAmount) : '',
    startDate: toLocalInput(p.startDate), expiryDate: toLocalInput(p.expiryDate),
    maxUses: p.maxUses != null ? String(p.maxUses) : '', maxUsesPerUser: p.maxUsesPerUser != null ? String(p.maxUsesPerUser) : '1',
    minTier: p.minTier ?? '', scopeType: p.scopeType ?? 'All', scopeCategoryId: '', scopeProductIds: '',
    statusLabel: PROMO_STATUS_LABELS[p.status] ?? p.status, createdAt: p.createdAt,
  });
  /** Mở form sửa voucher Draft: nạp giá trị hiện có vào form (mã/loại/phạm vi chỉ xem, không sửa). */
  const openPromoEdit = (p: Promotion) => {
    setPromoForm(promoFormInitial(p));
    setPromoFormMode('edit');
    setPromoFormOpen(true);
  };
  /** Mở form xem khuyến mãi (đợt 18): PromoForm mode="view" — [Đóng] + [Chỉnh sửa]. */
  const openPromoView = (p: Promotion) => {
    setPromoForm(promoFormInitial(p));
    setPromoFormMode('view');
    setPromoFormOpen(true);
  };
  /** Mở form tạo khuyến mãi mới (đợt 18). */
  const openPromoCreate = () => {
    setPromoForm({
      id: '', code: '', description: '', discountType: 'Percentage', discountValue: '', minOrderAmount: '0',
      maxDiscountAmount: '', startDate: '', expiryDate: '', maxUses: '', maxUsesPerUser: '1',
      minTier: '', scopeType: 'All', scopeCategoryId: '', scopeProductIds: '',
      statusLabel: '', createdAt: '',
    });
    setPromoFormMode('create');
    setPromoFormOpen(true);
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
        setSelectedReview(null);
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

  /** Bật khuyến mãi (đợt 18, spec A–H C4/C5): đã hết hạn (trạng thái Expired
   *  hoặc quá ngày hết hạn) → popup CHẶN C5 [Đóng] + [Chỉnh sửa khuyến mãi]
   *  (nút phải mở form sửa KM); còn hạn → popup xác nhận, đúng 2 nút.
   *  BE cũng chặn bật KM hết hạn (ActivatePromotionCommand). */
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
    const expirySuffix = p.expiryDate ? `, đến hết ngày ${new Date(p.expiryDate).toLocaleDateString('vi-VN')}` : '';
    const { confirmed } = await confirmAction({
      title: messages.confirm.enablePromo.title,
      message: fmt(messages.confirm.enablePromo.message, { mã: p.code, ', đến hết ngày dd/mm/yyyy': expirySuffix }),
      confirmText: messages.confirm.enablePromo.confirmText,
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
        notify.success(messages.toast.promo.enabled.title, fmt(messages.toast.promo.enabled.desc, { mã: p.code }));
        await loadPromos();
      } else failOp(status, body?.message);
    } catch { failOp(0); }
  };

  /** Tắt khuyến mãi (đợt 18, §6.3 — giữ cơ chế lý do tắt đợt 17): popup xác nhận
   *  với ô lý do BẮT BUỘC trong popup, đúng 2 nút. */
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
        notify.success(messages.toast.promo.disabled.title, fmt(messages.toast.promo.disabled.desc, { mã: p.code }));
        await loadPromos();
      } else failOp(status, body?.message);
    } catch { failOp(0); }
  };

  const viewPromoUsage = async (p: Promotion) => {
    setPromoUsage(null); setPromoUsageFor(p.code);
    try {
      const { status, body } = await apiJson<PromotionUsage[]>(`/api/admin/promotions/${p.id}/usage?page=1&pageSize=20`, { skipAuthHandler: true });
      if (body?.success && Array.isArray(body.data)) setPromoUsage(body.data);
      else failOp(status, body?.message);
    } catch { failOp(0); }
  };

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
        setReturnTarget(null);
        await loadReturns();
      } else setRefundError(apiErr(body, 'Không ghi nhận được hoàn tiền.'));
    } catch { setRefundError('Không thể kết nối đến máy chủ.'); }
  };

  /** Duyệt trả hàng (đợt 18, spec A–H E1): popup xác nhận, đúng 2 nút,
   *  nêu rõ tên SP + số lượng. */
  const requestApproveReturn = async () => {
    if (!returnTarget) return;
    const { confirmed } = await confirmAction({
      title: messages.confirm.approveReturn.title,
      message: fmt(messages.confirm.approveReturn.message, {
        'mã đơn': returnTarget.orderDisplayCode ?? returnTarget.orderId,
        'tên sản phẩm': shortName(returnTarget.productName),
        n: returnTarget.quantity,
      }),
      confirmText: messages.confirm.approveReturn.confirmText,
      cancelText: 'Hủy',
      variant: 'info',
    });
    if (!confirmed) return;
    await resolveReturn(true);
  };

  /** Từ chối trả hàng (đợt 18, spec A–H E2 — cam): lý do bắt buộc — nhập trong
   *  popup xác nhận. */
  const requestRejectReturn = async () => {
    if (!returnTarget) return;
    const { confirmed, reason } = await confirmAction({
      title: messages.confirm.rejectReturn.title,
      message: fmt(messages.confirm.rejectReturn.message, { 'mã đơn': returnTarget.orderDisplayCode ?? returnTarget.orderId }),
      confirmText: messages.confirm.rejectReturn.confirmText,
      cancelText: 'Hủy',
      variant: 'warning',
      requireReason: true,
      reasonLabel: 'Lý do từ chối',
      reasonPlaceholder: 'Nhập lý do từ chối yêu cầu trả hàng...',
      reasonError: messages.validate.rejectReturnReasonEmpty,
    });
    if (!confirmed) return;
    await resolveReturn(false, reason ?? '');
  };

  const resolveReturn = async (approve: boolean, reason?: string) => {
    if (!returnTarget) return;
    try {
      const { status, body } = await apiJson<string>(`/api/admin/returns/${returnTarget.id}/resolve`, {
        method: 'POST', skipAuthHandler: true, body: JSON.stringify({ approve, adminNote: reason?.trim() || undefined }),
      });
      if (body?.success) {
        const code = returnTarget.orderDisplayCode ?? returnTarget.orderId;
        if (approve) notify.success(messages.toast.returns.approved.title, fmt(messages.toast.returns.approved.desc, { 'mã đơn': code }));
        else notify.success(messages.toast.returns.rejected.title, fmt(messages.toast.returns.rejected.desc, { 'mã đơn': code }));
        setReturnTarget(null);
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
    ? { title: 'Hồ sơ quản trị', desc: 'Thông tin tài khoản quản trị hệ thống.' }
    : TAB_META[tab];
  // Form nay là Drawer/Modal (đợt 18) nên KHÔNG thay thế nội dung tab nữa;
  // chỉ trang Hồ sơ mới thay thế nội dung tab (sidebar + topbar giữ nguyên).
  const profileName = profile?.fullName ?? profile?.email ?? '?';
  // Badge từng mục menu (null = ẩn): đơn chờ xác nhận, trả hàng chờ duyệt,
  // đánh giá mới 7 ngày (badgeText: tối đa "99+", 0 thì ẩn).
  const navBadgeOf = (key: Tab): number | null =>
    key === 'orders' ? pendingOrdersCount : key === 'returns' ? pendingReturnsCount : key === 'reviews' ? newReviewsCount : null;
  return (
    <div data-testid="admin-page" className={`spark-admin${sidebarHidden ? ' sa-sidebar-hidden' : ''}${sidebarOpen ? ' sa-drawer-open' : ''}`}>
      {/* Host toast + popup xác nhận (đợt 18, W1): mount MỘT LẦN ở gốc. */}
      <ToastHost />
      <ConfirmDialogHost />
      {/* ---------- Sidebar xanh đen đậm (đợt 20: Inter, gradient, mục chọn
        viên thuốc, badge cam tối, chân sidebar thẻ admin + menu bật lên) ---------- */}
      <aside className="sa-sidebar">
        <button
          type="button"
          className="sa-logo"
          onClick={() => { setTab('dashboard'); setProfileView(false); setSidebarOpen(false); }}
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
          {/* Tổng quan đứng riêng trên cùng, không tiêu đề nhóm, cách các nhóm 20px. */}
          <button
            type="button"
            data-testid={NAV_BY_KEY.dashboard.testid}
            onClick={() => { setTab('dashboard'); setSidebarOpen(false); }}
            className={`sa-nav-btn sa-nav-overview${tab === 'dashboard' ? ' sa-active' : ''}`}
            aria-current={tab === 'dashboard' ? 'page' : undefined}
          >
            <span className="sa-nav-label">Tổng quan</span>
          </button>
          {NAV_GROUPS.map(g => {
            // Nhóm rỗng (không còn mục hiển thị — vd mục không quyền bị ẩn hết)
            // thì ẩn luôn tiêu đề nhóm.
            const items = g.keys.map(key => NAV_BY_KEY[key]);
            if (items.length === 0) return null;
            return (
              <div key={g.key} className="sa-nav-group" role="group" aria-labelledby={`admin-nav-group-title-${g.key}`}>
                <div className="sa-nav-group-title" id={`admin-nav-group-title-${g.key}`} data-testid={`admin-nav-group-${g.key}`}>
                  <span>{g.title}</span>
                </div>
                {items.map(item => {
                  const badge = badgeText(navBadgeOf(item.key));
                  return (
                    <button
                      key={item.key}
                      type="button"
                      data-testid={item.testid}
                      onClick={() => { setTab(item.key); setSidebarOpen(false); }}
                      className={`sa-nav-btn${tab === item.key ? ' sa-active' : ''}`}
                      aria-current={tab === item.key ? 'page' : undefined}
                    >
                      <span className="sa-nav-label">{item.label}</span>
                      {badge && (
                        <span key={badge} className="sa-nav-badge" data-testid={`admin-nav-${item.key}-badge`}>{badge}</span>
                      )}
                    </button>
                  );
                })}
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
              // Mobile (<1024px): mở/đóng drawer. Desktop: ẨN HẲN sidebar (đợt 20 —
              // bỏ chế độ thu về cột icon), nhớ trạng thái vào localStorage.
              if (window.matchMedia('(max-width: 1023px)').matches) setSidebarOpen(v => !v);
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
              <div className="sa-popover" role="menu" aria-label="Tài khoản" data-testid="admin-user-menu">
                <div className="sa-notif-item">
                  <div className="sa-notif-title">{profile?.fullName ?? profile?.email}</div>
                  <div className="sa-notif-msg">{profile?.email}</div>
                  <div className="sa-notif-time">Vai trò: {profile?.role}</div>
                </div>
                <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="sa-btn sa-btn-ghost"
                    style={{ width: '100%' }}
                    data-testid="admin-user-menu-profile"
                    role="menuitem"
                    onClick={() => { setAvatarMenuOpen(false); setProfilePwOpen(false); setProfileView(true); }}
                  >
                    Thông tin tài khoản
                  </button>
                  <button
                    type="button"
                    className="sa-btn sa-btn-ghost"
                    style={{ width: '100%' }}
                    data-testid="admin-user-menu-logout"
                    role="menuitem"
                    onClick={() => void requestLogout()}
                  >
                    Đăng xuất
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="sa-content">
          {!profileView && tab !== 'dashboard' && (
            <div className="sa-pagehead">
              <div>
                <h1>{meta.title}</h1>
                <p>{meta.desc}</p>
              </div>
            </div>
          )}

          <main>
            {profileView && profile && (
              <AdminProfilePage
                profile={profile}
                onSaveProfile={saveAdminProfile}
                onChangePassword={changeAdminPassword}
                onBack={() => setProfileView(false)}
                initialPwOpen={profilePwOpen}
              />
            )}
            {!profileView && tab === 'dashboard' && (
              <AdminDashboard
                onNavigateTab={handleDashboardNavigate}
                onOpenOrder={order => void openOrderDetail(order.id)}
                onOpenProduct={p => { setProductSearch(p.name); setTab('products'); void loadProducts({ search: p.name }); }}
                onOpenPromotion={p => { setPromoSearch(p.code); setTab('promotions'); void loadPromos({ status: '' }); }}
              />
            )}

            {!profileView && tab === 'orders' && (
              <section className="sa-list-section">
                <div className="sa-list-card">
                  <PageToolbar
                    testidPrefix="orders"
                    searchValue={orderSearch}
                    onSearchChange={setOrderSearch}
                    searchPlaceholder="Tìm mã đơn, tên khách, email..."
                    onSearch={() => void loadOrders()}
                    onReset={resetOrders}
                    filters={(
                      <select className="sa-input sa-filter-select" value={orderStatusFilter} onChange={e => setOrderStatusFilter(e.target.value)} data-testid="admin-order-status-filter" aria-label="Lọc trạng thái">
                        <option value="">Tất cả trạng thái</option>
                        {ORDER_STATUSES.map(s => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}
                      </select>
                    )}
                  />
                  {ordersLoading ? (
                    <TableSkeleton />
                  ) : ordersError ? (
                    <p className="sa-error">{ordersError}</p>
                  ) : orders.length === 0 ? (
                    <EmptyState
                      title={orderSearch.trim() || orderStatusFilter ? 'Không tìm thấy đơn hàng' : 'Chưa có đơn hàng nào'}
                      desc={orderSearch.trim() || orderStatusFilter ? 'Thử đổi từ khóa hoặc bộ lọc khác.' : 'Đơn hàng mới sẽ hiển thị tại đây.'}
                    />
                  ) : (
                    <div className="sa-table-wrap">
                      <table>
                        <thead><tr><th>STT</th><th>Mã đơn</th><th>Khách hàng</th><th>Trạng thái</th><th>Thanh toán</th><th>Tổng tiền</th><th>Ngày đặt</th><th>Thao tác</th></tr></thead>
                        <tbody>
                          {ordersPaging.paged.map((o, idx) => (
                            <tr key={o.id} onClick={() => void openOrderDetail(o.id)} className="sa-clickable" data-testid={`admin-order-row-${o.id}`}>
                              <td>{(ordersPaging.safePage - 1) * PAGE_SIZE + idx + 1}</td>
                              <td><span className="sa-code">{o.orderDisplayCode ?? `#${o.orderCode}`}</span></td>
                              <td>
                                <span className="sa-user-cell">
                                  <span className="sa-avatar sa-avatar-sm" style={{ background: avatarColor(o.customerName) }}>{avatarInitial(o.customerName)}</span>
                                  <span className="sa-user-cell-names"><strong>{o.customerName}</strong><small>{o.customerEmail}</small></span>
                                </span>
                              </td>
                              <td><Badge tone={orderStatusTone(o.status)}>{o.statusLabel ?? statusLabel(o.status)}</Badge></td>
                              <td>{o.paymentMethod}</td>
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
                  {orders.length > 0 && (
                    <Pagination page={ordersPaging.safePage} totalPages={ordersPaging.totalPages} total={orders.length} pageSize={PAGE_SIZE} testid="admin-orders-pagination" onPage={setOrdersPage} />
                  )}
                </div>
                {orderDetailLoading && <p>Đang tải chi tiết đơn...</p>}
                {orderDetailError && <p className="sa-error">{orderDetailError}</p>}
              </section>
            )}
            {!profileView && tab === 'products' && (
              <section className="sa-list-section">
                <div className="sa-list-card">
                  <PageToolbar
                    testidPrefix="products"
                    searchValue={productSearch}
                    onSearchChange={setProductSearch}
                    searchPlaceholder="Tìm tên sản phẩm..."
                    onSearch={() => setProductsPage(1)}
                    onReset={resetProducts}
                    filters={(
                      <>
                        <select className="sa-input sa-filter-select" value={productCatFilter} onChange={e => setProductCatFilter(e.target.value)} aria-label="Lọc danh mục">
                          <option value="">Tất cả danh mục</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <select className="sa-input sa-filter-select" value={productStatusFilter} onChange={e => setProductStatusFilter(e.target.value)} data-testid="admin-status-filter" aria-label="Lọc trạng thái sản phẩm">
                          <option value="">Tất cả</option>
                          <option value="true">Hoạt động</option>
                          <option value="false">Ngừng hoạt động</option>
                        </select>
                      </>
                    )}
                    addLabel="Thêm sản phẩm"
                    onAdd={openProductCreate}
                  />
                  {productsLoading ? (
                    <TableSkeleton />
                  ) : productsError ? (
                    <p className="sa-error">{productsError}</p>
                  ) : filteredProducts.length === 0 ? (
                    <EmptyState
                      title={productSearch.trim() || productCatFilter || productStatusFilter ? 'Không tìm thấy sản phẩm' : 'Chưa có sản phẩm nào'}
                      desc={productSearch.trim() || productCatFilter || productStatusFilter ? 'Thử đổi từ khóa hoặc bộ lọc khác.' : 'Thêm sản phẩm mới để bắt đầu bán hàng.'}
                    />
                  ) : (
                    <div className="sa-table-wrap">
                      <table>
                        <thead><tr><th>STT</th><th>Mã SP</th><th>Sản phẩm</th><th>Danh mục</th><th>Giá</th><th>Tồn kho</th><th>Đánh giá</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
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
                                <td>{p.rating != null ? <span className="sa-rating-cell"><Star size={14} strokeWidth={2} color="#f59e0b" fill="#f59e0b" aria-hidden="true" /> {p.rating} <small>({p.reviewCount ?? 0} đánh giá)</small></span> : '—'}</td>
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
            {!profileView && tab === 'categories' && (
              <section className="sa-list-section">
                <div className="sa-list-card">
                  <PageToolbar
                    testidPrefix="categories"
                    searchValue={catSearch}
                    onSearchChange={setCatSearch}
                    searchPlaceholder="Tìm tên, slug danh mục..."
                    onSearch={() => setCategoriesPage(1)}
                    onReset={resetCategories}
                    filters={(
                      <select className="sa-input sa-filter-select" value={catStatusFilter} onChange={e => setCatStatusFilter(e.target.value)} data-testid="admin-status-filter" aria-label="Lọc trạng thái danh mục">
                        <option value="">Tất cả</option>
                        <option value="true">Hoạt động</option>
                        <option value="false">Ngừng hoạt động</option>
                      </select>
                    )}
                    addLabel="Thêm danh mục"
                    onAdd={openCategoryCreate}
                  />
                  {catsLoading ? (
                    <TableSkeleton />
                  ) : catsError ? (
                    <p className="sa-error">{catsError}</p>
                  ) : filteredCategories.length === 0 ? (
                    <EmptyState
                      title={catSearch.trim() || catStatusFilter ? 'Không tìm thấy danh mục' : 'Chưa có danh mục nào'}
                      desc={catSearch.trim() || catStatusFilter ? 'Thử đổi từ khóa hoặc bộ lọc khác.' : 'Thêm danh mục để nhóm sản phẩm.'}
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
            {!profileView && tab === 'promotions' && (
              <section className="sa-list-section">
                <div className="sa-list-card">
                  <PageToolbar
                    testidPrefix="promotions"
                    searchValue={promoSearch}
                    onSearchChange={setPromoSearch}
                    searchPlaceholder="Tìm mã, mô tả khuyến mãi..."
                    onSearch={() => void loadPromos()}
                    onReset={resetPromos}
                    filters={(
                      <select className="sa-input sa-filter-select" value={promoStatusFilter} onChange={e => setPromoStatusFilter(e.target.value)} data-testid="admin-status-filter" aria-label="Lọc trạng thái voucher">
                        <option value="">Tất cả trạng thái</option>
                        <option value="Draft">Nháp</option>
                        <option value="Active">Đang chạy</option>
                        <option value="Disabled">Đã tắt</option>
                        <option value="Expired">Hết hạn</option>
                      </select>
                    )}
                    addLabel="Tạo khuyến mãi"
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
                    />
                  ) : (
                    <div className="sa-table-wrap">
                      <table>
                        <thead><tr><th>STT</th><th>Mã</th><th>Mô tả</th><th>Loại giảm</th><th>Giá trị</th><th>Đơn tối thiểu</th><th>Đã dùng</th><th>Hạn</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
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
                                <td>{p.discountType}{p.minTier ? <><br /><small>Hạng {TIER_LABELS[p.minTier] ?? p.minTier}+</small></> : null}</td>
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
                                  {(p.status === 'Active' || p.status === 'Disabled') ? (
                                    <StatusSwitch
                                      checked={p.status === 'Active'}
                                      testid={`admin-promo-status-switch-${p.id}`}
                                      label={`Đổi trạng thái khuyến mãi ${p.code} (${p.status === 'Active' ? 'đang Hoạt động' : 'đang Ngừng hoạt động'})`}
                                      onToggle={() => {
                                        if (p.status === 'Active') void requestDisablePromo(p);
                                        else void requestEnablePromo(p);
                                      }}
                                    />
                                  ) : (
                                    <Badge tone={p.status === 'Draft' ? 'yellow' : 'gray'}>{PROMO_STATUS_LABELS[p.status] ?? p.status}</Badge>
                                  )}
                                  {p.disabledReason ? <><br /><small>{p.disabledReason}</small></> : null}
                                </td>
                                <td className="sa-actions">
                                  <button type="button" className="sa-icon-btn" title="Xem chi tiết khuyến mãi" aria-label={`Xem chi tiết khuyến mãi ${p.code}`} onClick={() => openPromoView(p)}><Eye size={16} strokeWidth={2} /></button>
                                  {p.status === 'Draft' && (
                                    <button type="button" className="sa-icon-btn" title="Kích hoạt khuyến mãi" aria-label={`Kích hoạt khuyến mãi ${p.code}`} onClick={() => void requestEnablePromo(p)}><Play size={16} strokeWidth={2} /></button>
                                  )}
                                  {p.status === 'Draft' && (
                                    <button type="button" className="sa-icon-btn" title="Sửa khuyến mãi" aria-label={`Sửa khuyến mãi ${p.code}`} onClick={() => openPromoEdit(p)} data-testid="admin-promo-edit-btn"><Pencil size={16} strokeWidth={2} /></button>
                                  )}
                                  {p.status === 'Draft' && (
                                    <button type="button" className="sa-icon-btn sa-icon-danger" title="Xóa khuyến mãi" aria-label={`Xóa khuyến mãi ${p.code}`} onClick={() => void requestDeletePromo(p)} data-testid="admin-promo-delete-btn"><Trash2 size={16} strokeWidth={2} /></button>
                                  )}
                                  <button type="button" className="sa-btn sa-btn-ghost" style={{ padding: '0.4rem 0.8rem' }} onClick={() => void viewPromoUsage(p)}>Lượt dùng</button>
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
                {promoUsageFor && (
                  <div className="sa-list-card" style={{ marginTop: '16px' }}>
                    <h3>Lượt dùng của {promoUsageFor}</h3>
                    {promoUsage === null ? <TableSkeleton /> : promoUsage.length === 0 ? <EmptyState title="Chưa có lượt dùng nào" desc="Mã này chưa được khách hàng sử dụng." /> : (
                      <div className="sa-table-wrap">
                        <table>
                          <thead><tr><th>Email</th><th>Mã đơn</th><th>Giảm</th><th>Ngày dùng</th></tr></thead>
                          <tbody>
                            {promoUsage.map(u => (
                              <tr key={u.id}>
                                <td>{u.userEmail}</td>
                                <td>{u.orderDisplayCode ?? u.orderId}</td>
                                <td className="sa-cell-money"><span className="sa-money">{fmtMoney(u.discountAmount)}</span></td>
                                <td><DateCell value={u.createdAt} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
            {!profileView && tab === 'customers' && (
              <section className="sa-list-section">
                <div className="sa-list-card">
                  <PageToolbar
                    testidPrefix="customers"
                    searchValue={customerSearch}
                    onSearchChange={setCustomerSearch}
                    searchPlaceholder="Tìm email, tên, SĐT..."
                    onSearch={() => void loadCustomers()}
                    onReset={resetCustomers}
                    filters={(
                      <>
                        <select className="sa-input sa-filter-select" value={customerTierFilter} onChange={e => setCustomerTierFilter(e.target.value)} aria-label="Lọc hạng">
                          <option value="">Tất cả hạng</option>
                          <option value="Member">Thường</option>
                          <option value="Silver">Bạc</option>
                          <option value="Gold">Vàng</option>
                          <option value="Diamond">Kim cương</option>
                        </select>
                        <select className="sa-input sa-filter-select" value={customerStatusFilter} onChange={e => setCustomerStatusFilter(e.target.value)} data-testid="admin-status-filter" aria-label="Lọc trạng thái khách hàng">
                          <option value="">Tất cả</option>
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
                      title={customerSearch.trim() || customerTierFilter || customerStatusFilter ? 'Không tìm thấy khách hàng' : 'Chưa có khách hàng nào'}
                      desc={customerSearch.trim() || customerTierFilter || customerStatusFilter ? 'Thử đổi từ khóa hoặc bộ lọc khác.' : 'Khách hàng đăng ký mới sẽ hiển thị tại đây.'}
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
            {!profileView && tab === 'reviews' && (
              <section className="sa-list-section" data-testid="admin-reviews-section">
                <div className="sa-list-card">
                  <PageToolbar
                    testidPrefix="reviews"
                    searchValue={reviewSearch}
                    onSearchChange={setReviewSearch}
                    searchPlaceholder="Tìm tên sản phẩm, khách hàng, nội dung..."
                    onSearch={() => { setReviewsPage(1); void loadReviews({ page: 1 }); }}
                    onReset={resetReviews}
                    filters={(
                      <select className="sa-input sa-filter-select" value={reviewRatingFilter} onChange={e => setReviewRatingFilter(e.target.value)} data-testid="admin-review-rating-filter" aria-label="Lọc theo số sao">
                        <option value="">Tất cả số sao</option>
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
                      title={reviewSearch.trim() || reviewRatingFilter ? 'Không tìm thấy đánh giá' : 'Chưa có đánh giá nào'}
                      desc={reviewSearch.trim() || reviewRatingFilter ? 'Thử đổi từ khóa hoặc bộ lọc khác.' : 'Đánh giá của khách hàng sẽ hiển thị tại đây.'}
                    />
                  ) : (
                    <div className="sa-table-wrap">
                      <table>
                        <thead><tr><th>STT</th><th>Sản phẩm</th><th>Khách hàng</th><th>Sao</th><th>Nội dung</th><th>Ngày</th><th>Thao tác</th></tr></thead>
                        <tbody>
                          {reviews.map((r, idx) => (
                            <tr key={r.id} onClick={() => setSelectedReview(r)} style={{ cursor: 'pointer' }}>
                              <td>{(reviewsPage - 1) * PAGE_SIZE + idx + 1}</td>
                              <td><strong className="sa-cell-clamp">{r.productName ?? '—'}</strong></td>
                              <td>{r.userName ?? '—'}</td>
                              <td><span aria-label={`${r.rating} trên 5 sao`}>{reviewStars(r.rating)} ({r.rating}/5)</span></td>
                              <td><span className="sa-cell-clamp">{shortComment(r.comment)}</span></td>
                              <td><DateCell value={r.createdAt} /></td>
                              <td className="sa-actions" onClick={e => e.stopPropagation()}>
                                <button type="button" className="sa-icon-btn" title="Xem chi tiết đánh giá" aria-label={`Xem đánh giá của ${r.userName ?? 'khách hàng'}`} onClick={() => setSelectedReview(r)}><Eye size={16} strokeWidth={2} /></button>
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
            {!profileView && tab === 'membership' && (
              <section className="sa-list-section">
                <div className="sa-list-card">
                  <div className="sa-toolbar">
                    <div className="sa-toolbar-right">
                      <button type="button" className="sa-icon-btn" title="Đặt lại cấu hình (hủy thay đổi chưa lưu)" aria-label="Đặt lại cấu hình" onClick={resetMembers} data-testid="admin-members-reset-btn"><RotateCcw size={16} strokeWidth={2} /></button>
                      <button type="button" className="sa-icon-btn" title="Làm mới" aria-label="Làm mới" onClick={() => void loadTiers()} data-testid="admin-members-refresh-btn">⟳</button>
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
            {!profileView && tab === 'returns' && (
              <section className="sa-list-section">
                <div className="sa-list-card">
                  <PageToolbar
                    testidPrefix="returns"
                    searchValue={returnSearch}
                    onSearchChange={setReturnSearch}
                    searchPlaceholder="Tìm mã đơn, sản phẩm, lý do..."
                    onSearch={() => void loadReturns()}
                    onReset={resetReturns}
                    filters={(
                      <select className="sa-input sa-filter-select" value={returnStatusFilter} onChange={e => setReturnStatusFilter(e.target.value)} aria-label="Lọc trạng thái trả hàng">
                        <option value="">Tất cả trạng thái</option>
                        <option value="Pending">Chờ duyệt</option>
                        <option value="Approved">Đã duyệt</option>
                        <option value="Rejected">Đã từ chối</option>
                      </select>
                    )}
                  />
                  {returnsLoading ? (
                    <TableSkeleton />
                  ) : returnsError ? (
                    <p className="sa-error">{returnsError}</p>
                  ) : filteredReturns.length === 0 ? (
                    <EmptyState
                      title={returnSearch.trim() || returnStatusFilter ? 'Không tìm thấy yêu cầu trả hàng' : 'Chưa có yêu cầu trả hàng nào'}
                      desc={returnSearch.trim() || returnStatusFilter ? 'Thử đổi từ khóa hoặc bộ lọc khác.' : 'Yêu cầu trả hàng của khách sẽ hiển thị tại đây.'}
                    />
                  ) : (
                    <div className="sa-table-wrap">
                      <table>
                        <thead><tr><th>STT</th><th>Mã đơn</th><th>Sản phẩm</th><th>SL</th><th>Lý do</th><th>Trạng thái</th><th>Hoàn tiền</th><th>Thao tác</th></tr></thead>
                        <tbody>
                          {returnsPaging.paged.map((r, idx) => (
                            <tr key={r.id}>
                              <td>{(returnsPaging.safePage - 1) * PAGE_SIZE + idx + 1}</td>
                              <td><span className="sa-code">{r.orderDisplayCode ?? r.orderId}</span></td>
                              <td><span className="sa-cell-clamp">{r.productName}</span></td>
                              <td>{r.quantity}</td>
                              <td><span className="sa-cell-clamp">{r.reason}</span>{r.note ? <><br /><small>{r.note}</small></> : null}</td>
                              <td><Badge tone={returnStatusTone(r.status)}>{RETURN_STATUS_LABELS[r.status] ?? r.status}</Badge>{r.adminNote ? <><br /><small>{r.adminNote}</small></> : null}</td>
                              <td>{r.refundStatus ?? '—'}{r.refundAmount ? <><br /><small className="sa-money">{fmtMoney(r.refundAmount)}</small></> : null}</td>
                              <td className="sa-actions">
                                {r.status === 'Pending' && (
                                  <button type="button" className="sa-btn sa-btn-ghost" style={{ padding: '0.4rem 0.8rem' }} onClick={() => setReturnTarget(r)}>Duyệt / Từ chối</button>
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
            {!profileView && tab === 'logs' && (
              <section className="sa-list-section">
                <div className="sa-list-card">
                  <PageToolbar
                    testidPrefix="logs"
                    searchValue={auditSearch}
                    onSearchChange={setAuditSearch}
                    searchPlaceholder="Tìm người thực hiện, hành động..."
                    onSearch={() => { setAuditDateFrom(auditDateFromInput); setAuditDateTo(auditDateToInput); setAuditPage(1); }}
                    onReset={resetAudit}
                    filters={(
                      <>
                        <input type="date" className="sa-input sa-filter-date" value={auditDateFromInput} onChange={e => setAuditDateFromInput(e.target.value)} aria-label="Từ ngày" data-testid="admin-log-date-from" />
                        <input type="date" className="sa-input sa-filter-date" value={auditDateToInput} onChange={e => setAuditDateToInput(e.target.value)} aria-label="Đến ngày" data-testid="admin-log-date-to" />
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
            {selectedOrder && (
              <FormShell
                width={680}
                testid="admin-order-detail"
                title={`Đơn ${selectedOrder.order.orderDisplayCode ?? `#${selectedOrder.order.orderCode}`} — ${selectedOrder.order.statusLabel ?? statusLabel(selectedOrder.order.status)}`}
                description={`Khách: ${selectedOrder.order.customerName} (${selectedOrder.order.customerEmail})`}
                onClose={() => setSelectedOrder(null)}
                footer={(
                  <>
                    {(() => {
                      const cur = statusName(selectedOrder.order.status);
                      const targets = (ALLOWED_NEXT[cur] ?? []).filter(s => s !== 'Cancelled');
                      const cancellable = ['Pending', 'Paid', 'Confirmed', 'Preparing'].includes(cur);
                      return (
                        <>
                          {cancellable ? (
                            <button type="button" onClick={() => void requestCancelOrder()} disabled={orderBusy} className="sa-btn sa-btn-danger" data-testid="admin-order-cancel-btn">Hủy đơn</button>
                          ) : (
                            <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-order-detail-footer-close-btn" onClick={() => setSelectedOrder(null)}>Đóng</button>
                          )}
                          {targets.length > 0 && (
                            <button type="button" className="sa-btn" data-testid="admin-order-change-status-btn" disabled={!nextStatus || orderBusy} onClick={() => void requestChangeOrderStatus()}>Đổi trạng thái</button>
                          )}
                        </>
                      );
                    })()}
                  </>
                )}
              >
                <div>
                  <p>Địa chỉ: {selectedOrder.order.shipDetailAddress
                    ? [selectedOrder.order.shipDetailAddress, selectedOrder.order.shipWardName, selectedOrder.order.shipDistrictName, selectedOrder.order.shipProvinceName].filter(Boolean).join(', ')
                    : (selectedOrder.order.shippingAddress ?? '—')}</p>
                  <p>Thanh toán: {selectedOrder.order.paymentMethod ?? '—'} — Phí ship: {fmtMoney(selectedOrder.order.shippingFee)} — Tổng: {fmtMoney(selectedOrder.order.totalAmount)}</p>
                  {selectedOrder.order.voucherCode && <p>Voucher: {selectedOrder.order.voucherCode} (giảm {fmtMoney(selectedOrder.order.discountAmount)})</p>}
                  {selectedOrder.order.pointsUsed ? <p>Điểm đã dùng: {selectedOrder.order.pointsUsed} (giảm {fmtMoney(selectedOrder.order.pointsDiscount)}) — Điểm nhận: {selectedOrder.order.pointsEarned ?? 0}</p> : null}
                  {selectedOrder.order.carrier && <p>Vận chuyển: {selectedOrder.order.carrier} — Mã vận đơn: {selectedOrder.order.trackingCode ?? '—'}</p>}
                  {selectedOrder.order.cancelReason && <p>Lý do hủy: {selectedOrder.order.cancelReason}</p>}
                  {selectedOrder.internalNote && <p>Ghi chú nội bộ: {selectedOrder.internalNote}</p>}
                  <h4>Sản phẩm</h4>
                  <ul className="sa-list">{(selectedOrder.order.items ?? []).map(i => <li key={i.id}>{i.productName} × {i.quantity} — {fmtMoney(i.unitPrice)}</li>)}</ul>
                  <h4>Lịch sử trạng thái</h4>
                  {(selectedOrder.order.statusHistories ?? []).length === 0 ? <p>Chưa có lịch sử trạng thái.</p> : (
                    <ul className="sa-list">{selectedOrder.order.statusHistories!.map((h, idx) => (
                      <li key={idx}>{statusLabel(h.status)} — {fmtDate(h.timestamp)}{h.note ? ` — ${h.note}` : ''}</li>
                    ))}</ul>
                  )}
                  <h4>Đổi trạng thái</h4>
                  {(() => {
                    const cur = statusName(selectedOrder.order.status);
                    const targets = (ALLOWED_NEXT[cur] ?? []).filter(s => s !== 'Cancelled');
                    if (targets.length === 0) return <p>Đơn ở trạng thái này không đổi được nữa.</p>;
                    return (
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <select className="sa-input" style={{ maxWidth: 260 }} value={nextStatus} onChange={e => setNextStatus(e.target.value)} data-testid="admin-order-status-select" aria-label="Trạng thái mới">
                          <option value="">— Chọn trạng thái đích —</option>
                          {targets.map(s => <option key={s} value={s}>{ORDER_STATUS_LABELS[s] ?? s}</option>)}
                        </select>
                        {nextStatus === 'Shipping' && (
                          <>
                            <input className="sa-input" style={{ maxWidth: 200 }} placeholder="Đơn vị vận chuyển" value={shipCarrier} onChange={e => setShipCarrier(e.target.value)} data-testid="admin-order-carrier-input" />
                            <input className="sa-input" style={{ maxWidth: 220 }} placeholder="Mã vận đơn (6–30 ký tự)" value={shipTracking} onChange={e => setShipTracking(e.target.value)} data-testid="admin-order-tracking-input" />
                          </>
                        )}
                        <input className="sa-input" style={{ maxWidth: 260 }} placeholder="Ghi chú (không bắt buộc)" value={statusNote} onChange={e => setStatusNote(e.target.value)} />
                      </div>
                    );
                  })()}
                  {orderDetailError && <p className="sa-error">{orderDetailError}</p>}
                </div>
              </FormShell>
            )}

            {returnTarget && (
              <FormShell
                width={680}
                testid="admin-return-detail"
                title={`Chi tiết trả hàng — ${returnTarget.orderDisplayCode ?? returnTarget.orderId}`}
                onClose={() => setReturnTarget(null)}
                footer={(
                  <>
                    <button type="button" className="sa-btn sa-btn-danger" data-testid="admin-return-reject-btn" onClick={() => void requestRejectReturn()}>Từ chối</button>
                    <button type="button" className="sa-btn" data-testid="admin-return-approve-btn" onClick={() => void requestApproveReturn()}>Duyệt</button>
                  </>
                )}
              >
                <div data-testid="admin-return-resolve">
                  <KvRow label="Sản phẩm" value={<strong>{returnTarget.productName} × {returnTarget.quantity}</strong>} />
                  <KvRow label="Mã đơn" value={returnTarget.orderDisplayCode ?? returnTarget.orderId} />
                  <KvRow label="Lý do khách" value={returnTarget.reason} />
                  {returnTarget.note && <KvRow label="Ghi chú khách" value={returnTarget.note} />}
                  <KvRow label="Số tiền hoàn" value={returnTarget.refundAmount ? fmtMoney(returnTarget.refundAmount) : '—'} />
                  <KvRow label="Trạng thái hoàn tiền" value={returnTarget.refundStatus ?? '—'} />
                  <KvRow label="Trạng thái" value={<Badge tone={returnStatusTone(returnTarget.status)}>{RETURN_STATUS_LABELS[returnTarget.status] ?? returnTarget.status}</Badge>} />
                  {returnTarget.adminNote && <KvRow label="Ghi chú admin" value={returnTarget.adminNote} />}
                  <p className="sa-muted-text">Duyệt: hoàn kho + tạo bản ghi hoàn tiền “Chờ hoàn tiền”. Từ chối: bắt buộc ghi lý do, đơn quay về Đã giao.</p>
                </div>
              </FormShell>
            )}

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

            {selectedReview && (
              <FormShell
                width={680}
                testid="admin-review-detail-modal"
                title={`Đánh giá — ${selectedReview.productName ?? 'Sản phẩm'}`}
                onClose={() => setSelectedReview(null)}
                footer={(
                  <>
                    <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setSelectedReview(null)}>Đóng</button>
                    <button type="button" className="sa-btn sa-btn-danger" data-testid="admin-review-delete-btn" onClick={() => void requestDeleteReview(selectedReview)}>Xóa đánh giá</button>
                  </>
                )}
              >
                <KvRow label="Sản phẩm" value={selectedReview.productName ?? '—'} />
                <KvRow label="Khách hàng" value={selectedReview.userName ?? '—'} />
                <KvRow label="Số sao" value={<span>{reviewStars(selectedReview.rating)} ({selectedReview.rating}/5)</span>} />
                <KvRow label="Nội dung" value={selectedReview.comment ?? '—'} />
                <KvRow label="Ngày tạo" value={fmtDate(selectedReview.createdAt)} />
              </FormShell>
            )}

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

            {productFormOpen && (
              <ProductForm
                initial={productForm}
                categories={categories}
                onSave={saveProduct}
                onRequestClose={requestCloseProduct}
                mode={productFormMode}
                onSwitchToEdit={() => setProductFormMode('edit')}
              />
            )}
            {catFormOpen && (
              <CategoryForm
                initial={catForm}
                onSave={saveCategory}
                onRequestClose={requestCloseCategory}
                mode={catFormMode}
                onSwitchToEdit={() => setCatFormMode('edit')}
              />
            )}
            {promoFormOpen && (
              <PromoForm
                initial={promoForm}
                categories={categories}
                onSave={savePromo}
                onRequestClose={requestClosePromo}
                mode={promoFormMode}
                onSwitchToEdit={() => setPromoFormMode('edit')}
              />
            )}
            {customerFormOpen && (
              <CustomerForm
                initial={customerForm}
                onSave={saveCustomer}
                onRequestClose={requestCloseCustomer}
                mode={customerFormMode}
                onSwitchToEdit={() => setCustomerFormMode('edit')}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
