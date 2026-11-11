/**
 * AdminDashboard — trang Tổng quan mới (đợt 18).
 *
 * DÙNG ĐÚNG endpoint hiện có, KHÔNG bịa số liệu:
 * - GET /api/admin/dashboard — đơn chờ xác nhận (Pending+Paid), SP sắp hết
 *   hàng (tồn khả dụng < 5, tối đa 10 — định nghĩa của BE), voucher sắp hết
 *   lượt dùng (>= 80%). ordersByStatus là TẤT CẢ thời gian nên KHÔNG dùng
 *   cho donut theo kỳ.
 * - GET /api/admin/reports/revenue?from&to (x2: kỳ hiện tại + kỳ trước) —
 *   KPI Doanh thu / Đơn hàng / Giá trị đơn TB / Tỷ lệ hủy, biểu đồ doanh thu,
 *   Sản phẩm bán chạy. ⚠️ Endpoint này đang LỖI trên máy Acer (BUG_DAFL_003):
 *   các khối phụ thuộc nó hiện trạng thái lỗi + nút "Thử lại" + toast lỗi
 *   chuẩn, các khối khác vẫn chạy. KHÔNG tự sửa BE.
 * - GET /api/admin/orders?from&to&pageSize=100 — đơn gần đây (8), donut
 *   trạng thái theo kỳ, dự phòng cho KPI Đơn hàng / Tỷ lệ hủy khi revenue lỗi.
 *   Giới hạn: tối đa 100 đơn/kỳ — vượt 100 thì donut + bảng chỉ tính trên
 *   100 đơn gần nhất và hiện ghi chú.
 * - GET /api/admin/customers?pageSize=100 — khách mới trong kỳ + phân bổ hạng.
 *   Sắp xếp mới nhất trước nên đếm khách mới trong kỳ là chính xác khi
 *   < 100 khách mới trong cả 2 kỳ; tổng khách chỉ chính xác khi < 100 khách.
 * - GET /api/admin/promotions?status=Active&pageSize=100 — KM đang chạy +
 *   KM sắp hết hạn (7 ngày).
 * - GET /api/admin/evaluations?pageSize=100 — đánh giá mới. Entity Evaluation
 *   KHÔNG có cờ "đã xử lý" nên "mới" = tạo trong 7 ngày qua (theo createdAt).
 * - GET /api/admin/returns — trả hàng chờ duyệt (status Pending) + số yêu cầu
 *   trả hàng trong kỳ.
 * - GET /api/admin/products?pageSize=100 — chỉ để lấy ảnh thumbnail cho
 *   Sản phẩm bán chạy (revenue.topProducts không có ảnh).
 *
 * Tích hợp: AdminPage.tsx KHÔNG sửa trong đợt này — xem patch text trong
 * báo cáo bàn giao (thay section dashboard cũ bằng <AdminDashboard ... />).
 * Props/callback xem AdminDashboardProps dưới đây.
 *
 * Dùng notify + messages.vi + shared (Badge/EmptyState) của W1 theo đúng
 * contract trong ~/workspace/dot18/COORDINATOR.md.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Label,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RotateCcw } from 'lucide-react';
import { apiJson } from '../../../../Shared/utils/api';
import { notifyHttpError } from './notify';
import { Badge, EmptyState } from './shared';
import './dashboard.css';

// ---------- Hằng số ----------
/** Múi giờ hiển thị: GMT+7 (Asia/Ho_Chi_Minh) — cố định để test ổn định. */
const TZ = 'Asia/Ho_Chi_Minh';
/** BE kẹp pageSize tối đa 100 cho mọi danh sách admin. */
const FETCH_PAGE_SIZE = 100;
/** Ngưỡng "sắp hết hàng" theo đúng BE (AdminDashboardDto: tồn khả dụng < 5). */
const LOW_STOCK_THRESHOLD = 5;
/** "Đánh giá mới" = tạo trong 7 ngày qua (Evaluation không có cờ đã xử lý). */
const NEW_REVIEW_DAYS = 7;
/** "Sắp hết hạn" = khuyến mãi hết hạn trong 7 ngày tới. */
const EXPIRING_PROMO_DAYS = 7;
/** Tự làm mới mỗi 5 phút khi tab đang mở. */
const AUTO_REFRESH_MS = 5 * 60 * 1000;
const SESSION_KEY = 'dafl-admin-dashboard-range';
const MAX_CUSTOM_DAYS = 365;

// ---------- Props (coordinator tích hợp vào AdminPage.tsx) ----------
export type DashboardTab =
  | 'dashboard' | 'orders' | 'products' | 'categories' | 'promotions'
  | 'customers' | 'reviews' | 'membership' | 'returns' | 'logs';

export interface DashboardNavFilter {
  /** Lọc trạng thái (đơn: Pending/Confirmed/...; KH: tier qua `tier`). */
  status?: string;
  /** Từ khóa tìm kiếm của tab đích (tên SP, mã KM...). */
  search?: string;
  /** Hạng hội viên: Member | Silver | Gold | Diamond. */
  tier?: string;
  /** Khoảng ngày ISO (yyyy-mm-dd) để tab đích lọc theo kỳ — BE đã hỗ trợ
   *  from/to ở /api/admin/orders; AdminPage cần truyền xuống loader. */
  from?: string;
  to?: string;
}

export interface DashboardOrderRow {
  id: string;
  orderDisplayCode?: string | null;
  orderCode: number;
  customerName: string;
  customerEmail: string;
  status: string;
  statusLabel?: string;
  paymentMethod: string;
  totalAmount: number;
  createdAt: string;
}

export interface AdminDashboardProps {
  /** Điều hướng sang tab khác + áp bộ lọc tương ứng (AdminPage: setTab +
   *  set các filter rồi gọi loader với overrides). */
  onNavigateTab: (tab: DashboardTab, filter?: DashboardNavFilter) => void;
  /** Bấm 1 đơn gần đây → mở form Xem chi tiết đơn (chỉ đọc, AdminPage:
   *  openOrderDetail(order.id)). */
  onOpenOrder: (order: DashboardOrderRow) => void;
  /** Bấm 1 SP (bán chạy / sắp hết hàng) → AdminPage: sang tab Sản phẩm +
   *  tìm theo tên SP (như nút 👁 cũ). Chỉ cần { id, name }. */
  onOpenProduct: (product: { id: string; name: string }) => void;
  /** Bấm 1 KM đang chạy → mặc định sang tab Khuyến mãi + tìm theo mã. */
  onOpenPromotion?: (promo: { code: string }) => void;
  /** Kỳ mặc định khi mở trang (mặc định '30d'). Chủ yếu phục vụ test. */
  initialRangeKey?: RangeKey;
}

// ---------- DTO (tên field theo đúng record C# — JSON camelCase) ----------
interface OverviewData {
  revenueToday?: number;
  revenueThisMonth?: number;
  pendingOrders?: number;
  newCustomers30d?: number;
  ordersByStatus?: Record<string, number>;
  lowStockProducts?: Array<{ id: string; name: string; stock: number }>;
  expiringVouchers?: Array<{ code: string; usedCount: number; maxUses?: number | null; expiryDate?: string | null }>;
}
interface RevenueReport {
  byDay?: Array<{ date: string; revenue: number; orders: number }>;
  topProducts?: Array<{ productId: string; productName: string; quantity: number; revenue: number }>;
  totalOrders?: number;
  cancelledOrders?: number;
  cancelRate?: number;
  voucherOrders?: number;
  voucherUsageRate?: number;
}
interface CustomerRow {
  id: string;
  email: string;
  fullName: string;
  membershipTier?: string | null;
  createdAt?: string | null;
}
interface PromoRow {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  expiryDate?: string | null;
  maxUses?: number | null;
  usedCount?: number;
  status: string;
}
interface ReviewRow { id: string; createdAt: string }
interface ReturnRow { id: string; status: string; createdAt: string }
interface ProductRow {
  id: string;
  name: string;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
}

// ---------- Định dạng (xuất ra để Vitest kiểm tra trực tiếp) ----------
const trimNum = (v: number): string =>
  v.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 1 });

/** Tiền đầy đủ: 319.000₫ (không khoảng trắng trước ₫). */
export const formatMoney = (n?: number | null): string =>
  `${Math.round(n ?? 0).toLocaleString('vi-VN')}₫`;

/** Tiền rút gọn từ 1 triệu trở lên: 12,4 triệu ₫ / 1,2 tỷ ₫; dưới 1 triệu giữ đủ số. */
export const formatMoneyCompact = (n?: number | null): string => {
  const v = n ?? 0;
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e9) return `${sign}${trimNum(a / 1e9)} tỷ ₫`;
  if (a >= 1e6) return `${sign}${trimNum(a / 1e6)} triệu ₫`;
  return formatMoney(v);
};

/** Rút gọn cho trục Y biểu đồ (không kèm ₫): 500 nghìn / 1 triệu / 1,2 tỷ. */
export const formatAxisMoney = (n?: number | null): string => {
  const v = n ?? 0;
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e9) return `${sign}${trimNum(a / 1e9)} tỷ`;
  if (a >= 1e6) return `${sign}${trimNum(a / 1e6)} triệu`;
  if (a >= 1e3) return `${sign}${trimNum(a / 1e3)} nghìn`;
  return String(Math.round(v));
};

/** Số lượng: 1.250 (tabular-nums qua CSS). */
export const formatNumber = (n?: number | null): string => (n ?? 0).toLocaleString('vi-VN');

/** Phần trăm 1 thập phân: 12,5%. */
export const formatPercent = (n?: number | null): string =>
  `${(n ?? 0).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const dtfDate = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const dtfTime = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const dtfDateTime = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});

/** dd/mm/yyyy (GMT+7); sai/rỗng → '—'. */
export const formatDateVn = (s?: string | null): string => {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '—' : dtfDate.format(d);
};

/** HH:mm (GMT+7). */
export const formatTimeVn = (d: Date): string => dtfTime.format(d);

/** dd/mm/yyyy HH:mm (GMT+7). */
export const formatDateTimeVn = (s?: string | null): string => {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '—' : dtfDateTime.format(d);
};

// ---------- So sánh kỳ trước (xuất ra để Vitest kiểm tra) ----------
export interface Comparison { text: string; tone: 'good' | 'bad' | 'neutral' }

/**
 * So sánh kỳ hiện tại với kỳ trước cùng độ dài.
 * - Không có dữ liệu kỳ trước → '—'.
 * - Kỳ trước = 0, kỳ này > 0 → 'Mới so với kỳ trước'.
 * - invert=true (tỷ lệ hủy/trả): tăng là xấu (đỏ), giảm là tốt (xanh).
 */
export function comparePeriods(
  current: number,
  previous: number | null | undefined,
  invert = false,
): Comparison {
  if (previous === null || previous === undefined) return { text: '—', tone: 'neutral' };
  if (previous === 0) {
    if (current === 0) return { text: '—', tone: 'neutral' };
    return { text: 'Mới so với kỳ trước', tone: invert ? 'bad' : 'good' };
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (pct === 0) return { text: 'Không đổi so với kỳ trước', tone: 'neutral' };
  const arrow = pct > 0 ? '↑' : '↓';
  const good = invert ? pct < 0 : pct > 0;
  return { text: `${arrow} ${formatPercent(Math.abs(pct))} so với kỳ trước`, tone: good ? 'good' : 'bad' };
}

// ---------- Khoảng thời gian ----------
export type RangeKey = 'today' | '7d' | '30d' | 'month' | 'custom';
export interface DateRange { key: RangeKey; from: Date; to: Date }

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number): Date => {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
};
const dayCount = (from: Date, to: Date): number =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000) + 1;
/** yyyy-mm-dd theo giờ địa phương (tránh lệch ngày do toISOString dùng UTC). */
export const isoDateLocal = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseISODate = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/** Kỳ hiện tại từ key + khoảng tùy chọn đã áp dụng. */
export function resolveRange(key: RangeKey, custom?: { from: string; to: string } | null): DateRange {
  const today = startOfDay(new Date());
  switch (key) {
    case 'today':
      return { key, from: today, to: today };
    case '7d':
      return { key, from: addDays(today, -6), to: today };
    case 'month':
      return { key, from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
    case 'custom':
      if (custom?.from && custom?.to) {
        return { key, from: startOfDay(parseISODate(custom.from)), to: startOfDay(parseISODate(custom.to)) };
      }
      return { key, from: addDays(today, -29), to: today };
    case '30d':
    default:
      return { key, from: addDays(today, -29), to: today };
  }
}

/** Kỳ trước cùng độ dài, kết thúc ngay trước kỳ hiện tại. Tháng này → tháng trước
 *  (tháng lịch, độ dài có thể khác 1 ngày — ghi chú ở dòng so sánh). */
export function previousRange(r: DateRange): DateRange {
  if (r.key === 'month') {
    const first = new Date(r.from.getFullYear(), r.from.getMonth() - 1, 1);
    const last = new Date(r.from.getFullYear(), r.from.getMonth(), 0);
    return { key: 'month', from: first, to: last };
  }
  const days = dayCount(r.from, r.to);
  const to = addDays(r.from, -1);
  return { key: r.key, from: addDays(to, -(days - 1)), to };
}

/** Validate khoảng tùy chọn: không chọn tương lai, tối đa 365 ngày.
 *  Sai → đúng chuỗi spec: 'Khoảng thời gian không hợp lệ.' */
export function validateCustomRange(fromStr: string, toStr: string): string | null {
  if (!fromStr || !toStr) return 'Khoảng thời gian không hợp lệ.';
  const from = parseISODate(fromStr);
  const to = parseISODate(toStr);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 'Khoảng thời gian không hợp lệ.';
  const today = startOfDay(new Date());
  if (from > to || to > today || from > today) return 'Khoảng thời gian không hợp lệ.';
  if (dayCount(from, to) > MAX_CUSTOM_DAYS) return 'Khoảng thời gian không hợp lệ.';
  return null;
}

// ---------- Biểu đồ: lấp đủ ngày + gom nhóm ----------
export interface ChartPoint {
  key: string;
  label: string;
  revenue: number;
  orders: number;
  prevRevenue: number;
  prevOrders: number;
}

/** Lấp đủ ngày trong khoảng (ngày không có đơn → doanh thu 0, số đơn 0). */
export function buildDailySeries(
  byDay: Array<{ date: string; revenue: number; orders: number }>,
  from: Date,
  to: Date,
): Array<{ key: string; label: string; revenue: number; orders: number }> {
  const map = new Map((byDay ?? []).map(d => [String(d.date).slice(0, 10), d]));
  const out: Array<{ key: string; label: string; revenue: number; orders: number }> = [];
  const cur = startOfDay(from);
  const end = startOfDay(to);
  while (cur <= end) {
    const key = isoDateLocal(cur);
    const found = map.get(key);
    out.push({
      key,
      label: `${cur.getDate()}/${cur.getMonth() + 1}`,
      revenue: found?.revenue ?? 0,
      orders: found?.orders ?? 0,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export type BucketMode = 'day' | 'week' | 'month';

/** Gom nhóm điểm ngày: ≤31 ngày giữ ngày; dài hơn gom tuần (7 ngày từ đầu kỳ)
 *  hoặc tháng (tháng lịch) khi > 120 ngày. */
export function bucketizeDaily(
  daily: Array<{ key: string; label: string; revenue: number; orders: number }>,
  mode: BucketMode,
): Array<{ key: string; label: string; revenue: number; orders: number }> {
  if (mode === 'day' || daily.length === 0) return daily;
  if (mode === 'week') {
    const out: Array<{ key: string; label: string; revenue: number; orders: number }> = [];
    for (let i = 0; i < daily.length; i += 7) {
      const chunk = daily.slice(i, i + 7);
      out.push({
        key: chunk[0].key,
        label: `Tuần ${chunk[0].label}`,
        revenue: chunk.reduce((s, p) => s + p.revenue, 0),
        orders: chunk.reduce((s, p) => s + p.orders, 0),
      });
    }
    return out;
  }
  // month: gom theo tháng lịch (key yyyy-mm-dd → yyyy-mm)
  const byMonth = new Map<string, { key: string; label: string; revenue: number; orders: number }>();
  for (const p of daily) {
    const ym = p.key.slice(0, 7);
    const cur = byMonth.get(ym);
    if (!cur) {
      const [y, m] = ym.split('-').map(Number);
      byMonth.set(ym, { key: `${ym}-01`, label: `${m}/${y}`, revenue: p.revenue, orders: p.orders });
    } else {
      cur.revenue += p.revenue;
      cur.orders += p.orders;
    }
  }
  return [...byMonth.values()];
}

// ---------- Donut trạng thái đơn ----------
export type DonutKey = 'pending' | 'processing' | 'completed' | 'cancelled' | 'returns';
export const DONUT_GROUPS: Array<{
  key: DonutKey;
  label: string;
  statuses: string[];
  color: string;
  /** Trạng thái đại diện để lọc tab Đơn hàng khi bấm vào dòng legend. */
  navStatus: string;
}> = [
  { key: 'pending', label: 'Chờ xác nhận', statuses: ['Pending', 'Paid'], color: '#d97706', navStatus: 'Pending' },
  { key: 'processing', label: 'Đang xử lý – giao hàng', statuses: ['Confirmed', 'Preparing', 'Shipping', 'Delivered'], color: '#2563eb', navStatus: 'Confirmed' },
  { key: 'completed', label: 'Hoàn thành', statuses: ['Completed'], color: '#16a34a', navStatus: 'Completed' },
  { key: 'cancelled', label: 'Đã hủy', statuses: ['Cancelled', 'Expired'], color: '#dc2626', navStatus: 'Cancelled' },
  { key: 'returns', label: 'Trả hàng', statuses: ['ReturnRequested'], color: '#4b5563', navStatus: 'ReturnRequested' },
];

/** Gom đơn theo 5 nhóm trạng thái (trạng thái lạ không thuộc nhóm nào thì bỏ
 *  qua — không bịa vào nhóm khác; tổng donut = tổng 5 nhóm). */
export function groupOrdersByStatus(
  orders: Array<{ status: string }>,
): Array<{ key: DonutKey; label: string; color: string; count: number; navStatus: string }> {
  return DONUT_GROUPS.map(g => ({
    key: g.key,
    label: g.label,
    color: g.color,
    navStatus: g.navStatus,
    count: orders.filter(o => g.statuses.includes(o.status)).length,
  }));
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  Pending: 'Chờ xử lý', Paid: 'Đã thanh toán', Confirmed: 'Đã xác nhận', Preparing: 'Đang chuẩn bị',
  Shipping: 'Đang giao', Delivered: 'Đã giao', Completed: 'Hoàn tất', ReturnRequested: 'Yêu cầu trả hàng',
  Cancelled: 'Đã hủy', Expired: 'Đã hết hạn',
};
export const orderStatusLabel = (s: string): string => ORDER_STATUS_LABELS[s] ?? s;

const TIER_LABELS: Record<string, string> = { Member: 'Thường', Silver: 'Bạc', Gold: 'Vàng', Diamond: 'Kim cương' };
const TIER_COLORS: Record<string, string> = { Member: '#6b7280', Silver: '#9ca3af', Gold: '#d97706', Diamond: '#2563eb' };

/** Màu nền avatar chữ cái: hash tên → 1 trong 8 màu, ổn định theo tên. */
const AVATAR_COLORS = ['#051c12', '#0e7490', '#b45309', '#be185d', '#4d7c0f', '#1d4ed8', '#7c3aed', '#9f1239'];
const avatarColor = (name: string): string => {
  let h = 0;
  for (const ch of name || '?') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
const avatarInitial = (name: string): string => (name?.trim()?.[0] ?? '?').toUpperCase();

// ---------- Component ----------
interface BlockState<T> { data: T | null; loading: boolean; error: boolean }
const idleBlock = <T,>(): BlockState<T> => ({ data: null, loading: true, error: false });

interface RevenueBlock { current: RevenueReport | null; previous: RevenueReport | null }

type FetchResult<T> = { data: T | null; status?: number; apiMessage?: string };

async function fetchApi<T>(url: string): Promise<FetchResult<T>> {
  try {
    const { status, body } = await apiJson<T>(url, { skipAuthHandler: true });
    if (body?.success && body.data !== null && body.data !== undefined) return { data: body.data as T };
    return { data: null, status, apiMessage: body?.message };
  } catch {
    return { data: null, status: 0 };
  }
}

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: 'today', label: 'Hôm nay' },
  { key: '7d', label: '7 ngày' },
  { key: '30d', label: '30 ngày' },
  { key: 'month', label: 'Tháng này' },
  { key: 'custom', label: 'Tùy chọn' },
];

function loadSavedRange(): { key: RangeKey; custom: { from: string; to: string } | null } {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return { key: '30d', custom: null };
    const parsed = JSON.parse(raw) as { key?: string; custom?: { from: string; to: string } | null };
    if (!parsed || !RANGE_OPTIONS.some(o => o.key === parsed.key)) return { key: '30d', custom: null };
    return { key: parsed.key as RangeKey, custom: parsed.custom ?? null };
  } catch {
    return { key: '30d', custom: null }; // sessionStorage lỗi → fallback state
  }
}

export function AdminDashboard(props: AdminDashboardProps) {
  const { onNavigateTab, onOpenOrder, onOpenProduct } = props;
  const onOpenPromotion = props.onOpenPromotion ?? (p => onNavigateTab('promotions', { search: p.code }));

  const [saved] = useState(loadSavedRange);
  const [rangeKey, setRangeKey] = useState<RangeKey>(props.initialRangeKey ?? saved.key);
  const [appliedCustom, setAppliedCustom] = useState<{ from: string; to: string } | null>(saved.custom);
  const [customFrom, setCustomFrom] = useState(saved.custom?.from ?? isoDateLocal(addDays(new Date(), -29)));
  const [customTo, setCustomTo] = useState(saved.custom?.to ?? isoDateLocal(new Date()));
  const [customError, setCustomError] = useState<string | null>(null);
  const [chartMetric, setChartMetric] = useState<'revenue' | 'orders'>('revenue');
  const [showChartTable, setShowChartTable] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const range = useMemo(() => resolveRange(rangeKey, appliedCustom), [rangeKey, appliedCustom]);
  const prevRange = useMemo(() => previousRange(range), [range]);
  const rangeFilter: DashboardNavFilter = useMemo(
    () => ({ from: isoDateLocal(range.from), to: isoDateLocal(range.to) }),
    [range],
  );

  const [overview, setOverview] = useState<BlockState<OverviewData>>(idleBlock);
  const [revenue, setRevenue] = useState<BlockState<RevenueBlock>>(idleBlock);
  const [orders, setOrders] = useState<BlockState<DashboardOrderRow[]>>(idleBlock);
  const [customers, setCustomers] = useState<BlockState<CustomerRow[]>>(idleBlock);
  const [promos, setPromos] = useState<BlockState<PromoRow[]>>(idleBlock);
  const [reviews, setReviews] = useState<BlockState<ReviewRow[]>>(idleBlock);
  const [returnsList, setReturnsList] = useState<BlockState<ReturnRow[]>>(idleBlock);
  const [products, setProducts] = useState<BlockState<ProductRow[]>>(idleBlock);

  const cancelledRef = useRef(false);
  const chartHoverRef = useRef(false);
  const hasAnyData = Boolean(
    overview.data || revenue.data || orders.data || customers.data
    || promos.data || reviews.data || returnsList.data || products.data,
  );

  // Lưu lựa chọn bộ lọc vào sessionStorage (fallback state khi storage lỗi).
  useEffect(() => {
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ key: rangeKey, custom: appliedCustom }));
    } catch {
      /* bỏ qua — state vẫn giữ lựa chọn trong phiên */
    }
  }, [rangeKey, appliedCustom]);

  // ---------- Loaders (mỗi khối độc lập: 1 khối lỗi không chặn khối khác) ----------
  const loadOverview = useCallback(async (silent: boolean) => {
    setOverview(b => ({ ...b, loading: true }));
    const r = await fetchApi<OverviewData>('/api/admin/dashboard');
    if (cancelledRef.current) return;
    if (r.data) setOverview({ data: r.data, loading: false, error: false });
    else {
      setOverview(b => ({ ...b, loading: false, error: true }));
      if (!silent) notifyHttpError(r.status, r.apiMessage);
    }
  }, []);

  const loadRevenue = useCallback(async (silent: boolean, cur: DateRange, prev: DateRange) => {
    setRevenue(b => ({ ...b, loading: true }));
    const url = (g: DateRange) =>
      `/api/admin/reports/revenue?from=${isoDateLocal(g.from)}&to=${isoDateLocal(g.to)}`;
    const [c, p] = await Promise.all([fetchApi<RevenueReport>(url(cur)), fetchApi<RevenueReport>(url(prev))]);
    if (cancelledRef.current) return;
    if (c.data) {
      // Kỳ trước lỗi thì chỉ mất dòng so sánh (hiện '—'), không toast, không lỗi khối.
      setRevenue({ data: { current: c.data, previous: p.data }, loading: false, error: false });
    } else {
      setRevenue(b => ({ ...b, loading: false, error: true }));
      if (!silent) notifyHttpError(c.status, c.apiMessage);
    }
  }, []);

  const loadOrders = useCallback(async (silent: boolean, cur: DateRange) => {
    setOrders(b => ({ ...b, loading: true }));
    const from = encodeURIComponent(new Date(cur.from.getFullYear(), cur.from.getMonth(), cur.from.getDate(), 0, 0, 0, 0).toISOString());
    const to = encodeURIComponent(new Date(cur.to.getFullYear(), cur.to.getMonth(), cur.to.getDate(), 23, 59, 59, 999).toISOString());
    const r = await fetchApi<DashboardOrderRow[]>(`/api/admin/orders?from=${from}&to=${to}&page=1&pageSize=${FETCH_PAGE_SIZE}`);
    if (cancelledRef.current) return;
    if (r.data) setOrders({ data: r.data, loading: false, error: false });
    else {
      setOrders(b => ({ ...b, loading: false, error: true }));
      if (!silent) notifyHttpError(r.status, r.apiMessage);
    }
  }, []);

  const loadCustomers = useCallback(async (silent: boolean) => {
    setCustomers(b => ({ ...b, loading: true }));
    const r = await fetchApi<CustomerRow[]>(`/api/admin/customers?page=1&pageSize=${FETCH_PAGE_SIZE}`);
    if (cancelledRef.current) return;
    if (r.data) setCustomers({ data: r.data, loading: false, error: false });
    else {
      setCustomers(b => ({ ...b, loading: false, error: true }));
      if (!silent) notifyHttpError(r.status, r.apiMessage);
    }
  }, []);

  const loadPromos = useCallback(async (silent: boolean) => {
    setPromos(b => ({ ...b, loading: true }));
    const r = await fetchApi<PromoRow[]>(`/api/admin/promotions?status=Active&page=1&pageSize=${FETCH_PAGE_SIZE}`);
    if (cancelledRef.current) return;
    if (r.data) setPromos({ data: r.data, loading: false, error: false });
    else {
      setPromos(b => ({ ...b, loading: false, error: true }));
      if (!silent) notifyHttpError(r.status, r.apiMessage);
    }
  }, []);

  const loadReviews = useCallback(async (silent: boolean) => {
    setReviews(b => ({ ...b, loading: true }));
    const r = await fetchApi<ReviewRow[]>(`/api/admin/evaluations?page=1&pageSize=${FETCH_PAGE_SIZE}`);
    if (cancelledRef.current) return;
    if (r.data) setReviews({ data: r.data, loading: false, error: false });
    else {
      setReviews(b => ({ ...b, loading: false, error: true }));
      if (!silent) notifyHttpError(r.status, r.apiMessage);
    }
  }, []);

  const loadReturns = useCallback(async (silent: boolean) => {
    setReturnsList(b => ({ ...b, loading: true }));
    const r = await fetchApi<ReturnRow[]>('/api/admin/returns');
    if (cancelledRef.current) return;
    if (r.data) setReturnsList({ data: r.data, loading: false, error: false });
    else {
      setReturnsList(b => ({ ...b, loading: false, error: true }));
      if (!silent) notifyHttpError(r.status, r.apiMessage);
    }
  }, []);

  const loadProducts = useCallback(async (silent: boolean) => {
    setProducts(b => ({ ...b, loading: true }));
    const r = await fetchApi<ProductRow[]>(`/api/admin/products?page=1&pageSize=${FETCH_PAGE_SIZE}`);
    if (cancelledRef.current) return;
    if (r.data) setProducts({ data: r.data, loading: false, error: false });
    else setProducts(b => ({ ...b, loading: false, error: true })); // chỉ lấy ảnh → lỗi thì dùng ô chữ cái, không toast
  }, []);

  const loadAll = useCallback(async (silent: boolean, cur: DateRange, prev: DateRange) => {
    setRefreshing(true);
    await Promise.all([
      loadOverview(silent), loadRevenue(silent, cur, prev), loadOrders(silent, cur),
      loadCustomers(silent), loadPromos(silent), loadReviews(silent), loadReturns(silent),
      loadProducts(silent),
    ]);
    if (!cancelledRef.current) {
      setUpdatedAt(new Date());
      setRefreshing(false);
    }
  }, [loadOverview, loadRevenue, loadOrders, loadCustomers, loadPromos, loadReviews, loadReturns, loadProducts]);

  // Tải lần đầu + khi đổi kỳ.
  useEffect(() => {
    cancelledRef.current = false;
    void loadAll(false, range, prevRange);
    return () => { cancelledRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from.getTime(), range.to.getTime()]);

  // Tự làm mới mỗi 5 phút khi tab đang mở; không làm mới khi tab ẩn hoặc
  // khi đang rê chuột / tương tác với biểu đồ.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden || chartHoverRef.current) return;
      void loadAll(true, range, prevRange);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [loadAll, range, prevRange]);

  const retryBlock = (which: string) => {
    if (which === 'overview') void loadOverview(false);
    else if (which === 'revenue') void loadRevenue(false, range, prevRange);
    else if (which === 'orders') void loadOrders(false, range);
    else if (which === 'customers') void loadCustomers(false);
    else if (which === 'promos') void loadPromos(false);
    else if (which === 'reviews') void loadReviews(false);
    else if (which === 'returns') void loadReturns(false);
  };

  // ---------- Dữ liệu suy ra ----------
  const inRange = useCallback((iso: string | null | undefined, from: Date, to: Date): boolean => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return false;
    return t >= startOfDay(from).getTime() && t <= new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999).getTime();
  }, []);

  const revenueCur = useMemo(
    () => (revenue.data?.current?.byDay ?? []).reduce((s, d) => s + (d.revenue ?? 0), 0),
    [revenue.data],
  );
  const revenuePrev = useMemo(
    () => (revenue.data?.previous?.byDay ?? []).reduce((s, d) => s + (d.revenue ?? 0), 0),
    [revenue.data],
  );
  const ordersCur = revenue.data?.current?.totalOrders;
  const ordersPrev = revenue.data?.previous?.totalOrders;
  /** Dự phòng khi revenue lỗi (BUG_DAFL_003): đếm đơn từ danh sách kỳ này
   *  (tối đa 100 — ghi chú ở dòng phụ). */
  const ordersFallback = orders.data ? orders.data.length : null;
  const ordersFallbackCapped = orders.data?.length === FETCH_PAGE_SIZE;
  const aovCur = ordersCur ? revenueCur / ordersCur : 0;
  const aovPrev = ordersPrev ? revenuePrev / ordersPrev : null;
  const cancelRateCur = revenue.data?.current?.cancelRate;
  const cancelRatePrev = revenue.data?.previous?.cancelRate;
  const cancelledCur = revenue.data?.current?.cancelledOrders ?? 0;

  const newCustomersCur = useMemo(
    () => (customers.data ?? []).filter(c => inRange(c.createdAt, range.from, range.to)).length,
    [customers.data, inRange, range],
  );
  const newCustomersPrev = useMemo(
    () => (customers.data ?? []).filter(c => inRange(c.createdAt, prevRange.from, prevRange.to)).length,
    [customers.data, inRange, prevRange],
  );
  const totalCustomers = customers.data?.length ?? null;
  const totalCustomersCapped = customers.data?.length === FETCH_PAGE_SIZE;

  const returnsInPeriod = useMemo(
    () => (returnsList.data ?? []).filter(r => inRange(r.createdAt, range.from, range.to)).length,
    [returnsList.data, inRange, range],
  );
  const pendingReturns = useMemo(
    () => (returnsList.data ?? []).filter(r => r.status === 'Pending').length,
    [returnsList.data],
  );

  const newReviews7d = useMemo(() => {
    const since = addDays(startOfDay(new Date()), -NEW_REVIEW_DAYS).getTime();
    return (reviews.data ?? []).filter(r => {
      const t = new Date(r.createdAt).getTime();
      return !Number.isNaN(t) && t >= since;
    }).length;
  }, [reviews.data]);

  const lowStock = overview.data?.lowStockProducts ?? [];
  const outOfStockCount = lowStock.filter(p => p.stock <= 0).length;

  const expiringPromos = useMemo(() => {
    const now = new Date();
    const limit = addDays(now, EXPIRING_PROMO_DAYS).getTime();
    return (promos.data ?? []).filter(p => {
      if (!p.expiryDate) return false;
      const t = new Date(p.expiryDate).getTime();
      return !Number.isNaN(t) && t >= now.getTime() && t <= limit;
    });
  }, [promos.data]);

  const tierMix = useMemo(() => {
    const counts: Record<string, number> = { Member: 0, Silver: 0, Gold: 0, Diamond: 0 };
    let other = 0;
    for (const c of customers.data ?? []) {
      const t = c.membershipTier ?? 'Member';
      if (t in counts) counts[t] += 1;
      else other += 1;
    }
    const rows = Object.keys(counts).map(k => ({ tier: k, label: TIER_LABELS[k], color: TIER_COLORS[k], count: counts[k] }));
    if (other > 0) rows.push({ tier: 'Other', label: 'Khác', color: '#9ca3af', count: other });
    return rows;
  }, [customers.data]);
  const tierTotal = tierMix.reduce((s, r) => s + r.count, 0);

  const donut = useMemo(() => groupOrdersByStatus(orders.data ?? []), [orders.data]);
  const donutTotal = donut.reduce((s, g) => s + g.count, 0);
  const ordersCapped = orders.data?.length === FETCH_PAGE_SIZE;

  const days = dayCount(range.from, range.to);
  const bucketMode: BucketMode = days <= 31 ? 'day' : days <= 120 ? 'week' : 'month';
  const chartPoints: ChartPoint[] = useMemo(() => {
    if (!revenue.data?.current) return [];
    const curDaily = buildDailySeries(revenue.data.current.byDay ?? [], range.from, range.to);
    const prevDaily = buildDailySeries(revenue.data.previous?.byDay ?? [], prevRange.from, prevRange.to);
    const curB = bucketizeDaily(curDaily, bucketMode);
    const prevB = bucketizeDaily(prevDaily, bucketMode);
    return curB.map((p, i) => ({
      ...p,
      prevRevenue: prevB[i]?.revenue ?? 0,
      prevOrders: prevB[i]?.orders ?? 0,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenue.data, range.from.getTime(), range.to.getTime(), prevRange.from.getTime(), prevRange.to.getTime(), bucketMode]);
  const chartHasData = chartPoints.some(p => p.revenue > 0 || p.orders > 0);

  const recentOrders = (orders.data ?? []).slice(0, 8);
  const topProducts = (revenue.data?.current?.topProducts ?? []).slice(0, 5);
  const productImage = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products.data ?? []) {
      const url = p.imageUrls?.[0] ?? p.imageUrl ?? null;
      if (url) map.set(p.id, url);
    }
    return map;
  }, [products.data]);
  const activePromos = (promos.data ?? []).slice(0, 4);

  // ---------- Hành vi bộ lọc ----------
  const applyRangeKey = (key: RangeKey) => {
    setRangeKey(key);
    setCustomError(null);
    if (key !== 'custom') setAppliedCustom(null);
    else if (!appliedCustom) {
      // Mở picker với mặc định 30 ngày gần nhất.
      setCustomFrom(isoDateLocal(addDays(new Date(), -29)));
      setCustomTo(isoDateLocal(new Date()));
    }
  };

  const applyCustom = () => {
    const err = validateCustomRange(customFrom, customTo);
    if (err) {
      setCustomError(err);
      return;
    }
    setCustomError(null);
    setAppliedCustom({ from: customFrom, to: customTo });
    setRangeKey('custom');
  };

  const todayIso = isoDateLocal(new Date());

  // ---------- Render phụ ----------
  const blockError = (testid: string, onRetry: () => void) => (
    <div className="db-block-error" data-testid={testid} role="alert">
      <p>Không tải được dữ liệu.</p>
      <button type="button" className="db-btn db-btn-ghost" onClick={onRetry} data-testid={`${testid}-retry`}>
        Thử lại
      </button>
    </div>
  );

  const skeleton = (testid: string, lines = 3) => (
    <div className="db-skeleton" data-testid={testid} role="status" aria-label="Đang tải dữ liệu">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="db-skeleton-line" />
      ))}
    </div>
  );

  const kpiCard = (p: {
    testid: string;
    label: string;
    value: string;
    valueTitle: string;
    sub: string;
    compare: Comparison;
    loading: boolean;
    hasData: boolean;
    error: boolean;
    onRetry: () => void;
    onClick: () => void;
  }) => {
    if (p.loading && !p.hasData) {
      return (
        <div className="db-card db-kpi" data-testid={`${p.testid}-skeleton`} role="status" aria-label={`Đang tải ${p.label}`}>
          <div className="db-skeleton-line db-skeleton-line--sm" />
          <div className="db-skeleton-line db-skeleton-line--lg" />
          <div className="db-skeleton-line db-skeleton-line--sm" />
        </div>
      );
    }
    if (p.error) {
      return (
        <div className="db-card db-kpi db-kpi--error" data-testid={`${p.testid}-error`} role="alert">
          <div className="db-kpi-label">{p.label}</div>
          <p className="db-kpi-error-text">Không tải được dữ liệu.</p>
          <button type="button" className="db-btn db-btn-ghost db-btn--sm" onClick={p.onRetry}>
            Thử lại
          </button>
        </div>
      );
    }
    return (
      <button
        type="button"
        className="db-card db-kpi"
        data-testid={p.testid}
        onClick={p.onClick}
        aria-label={`${p.label}: ${p.valueTitle}. ${p.sub}. ${p.compare.text}`}
        title={p.valueTitle}
      >
        <span className="db-kpi-label">{p.label}</span>
        <span className="db-kpi-value" title={p.valueTitle}>{p.value}</span>
        <span className="db-kpi-sub">{p.sub}</span>
        <span className={`db-compare db-compare--${p.compare.tone}`}>{p.compare.text}</span>
      </button>
    );
  };

  const actionRow = (p: {
    key: string;
    label: string;
    count: number | null;
    onView: () => void;
  }) => (
    <li className="db-action-row" key={p.key}>
      <span className="db-action-label">{p.label}</span>
      <span className="db-action-right">
        {p.count === null || p.count === 0 ? (
          <span className="db-action-zero" aria-label={`${p.label}: không có`}>—</span>
        ) : (
          <Badge tone="orange" testid={`admin-dashboard-action-${p.key}-count`}>{formatNumber(p.count)}</Badge>
        )}
        <button
          type="button"
          className="db-link"
          onClick={p.onView}
          data-testid={`admin-dashboard-action-${p.key}-view`}
          disabled={p.count === null || p.count === 0}
        >
          Xem
        </button>
      </span>
    </li>
  );

  const actionItems = [
    {
      key: 'pending-orders', label: 'Đơn chờ xác nhận',
      count: overview.data ? (overview.data.pendingOrders ?? 0) : null,
      onView: () => onNavigateTab('orders', { status: 'Pending' }),
    },
    {
      key: 'pending-returns', label: 'Trả hàng chờ duyệt',
      count: returnsList.data ? pendingReturns : null,
      onView: () => onNavigateTab('returns'),
    },
    {
      key: 'new-reviews', label: `Đánh giá mới (${NEW_REVIEW_DAYS} ngày qua)`,
      count: reviews.data ? newReviews7d : null,
      onView: () => onNavigateTab('reviews'),
    },
    {
      key: 'low-stock', label: `Sản phẩm sắp hết hàng (còn dưới ${LOW_STOCK_THRESHOLD})`,
      count: overview.data ? lowStock.length : null,
      onView: () => onNavigateTab('products'),
    },
    {
      key: 'out-of-stock', label: 'Sản phẩm hết hàng',
      count: overview.data ? outOfStockCount : null,
      onView: () => onNavigateTab('products'),
    },
    {
      key: 'expiring-promos', label: `Khuyến mãi sắp hết hạn (${EXPIRING_PROMO_DAYS} ngày)`,
      count: promos.data ? expiringPromos.length : null,
      onView: () => onNavigateTab('promotions'),
    },
  ];
  const actionCountsKnown = actionItems.every(a => a.count !== null);
  const actionAllClear = actionCountsKnown && actionItems.every(a => (a.count ?? 0) === 0);

  const revenueChartLabel =
    chartMetric === 'revenue' ? 'Doanh thu' : 'Số đơn';
  const chartAriaLabel =
    `Biểu đồ ${revenueChartLabel.toLowerCase()} theo ${bucketMode === 'day' ? 'ngày' : bucketMode === 'week' ? 'tuần' : 'tháng'}, ` +
    `kỳ ${formatDateVn(range.from.toISOString())} đến ${formatDateVn(range.to.toISOString())}`;

  return (
    <div
      className={`sa-dashboard${refreshing && hasAnyData ? ' db-refreshing' : ''}`}
      data-testid="admin-dashboard"
    >
      {/* ---------- Header ---------- */}
      <div className="db-head">
        <div className="db-head-titles">
          <h1 className="db-title">Tổng quan</h1>
        </div>
        <div className="db-head-actions">
          <div className="db-segmented" role="group" aria-label="Khoảng thời gian">
            {RANGE_OPTIONS.map(o => (
              <button
                key={o.key}
                type="button"
                className={`db-segmented-btn${rangeKey === o.key ? ' db-segmented-btn--active' : ''}`}
                aria-pressed={rangeKey === o.key}
                data-testid={`admin-dashboard-range-${o.key}`}
                onClick={() => applyRangeKey(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="db-icon-btn"
            data-testid="admin-dashboard-refresh-btn"
            onClick={() => void loadAll(false, range, prevRange)}
            aria-label="Làm mới"
            title="Làm mới"
            disabled={refreshing}
          >
            <span aria-hidden="true" className={refreshing ? 'db-spin' : ''}><RotateCcw size={16} strokeWidth={2} /></span>
          </button>
          <span className="db-updated" data-testid="admin-dashboard-updated-at">
            {updatedAt ? `Cập nhật lúc ${formatTimeVn(updatedAt)}` : 'Chưa cập nhật'}
          </span>
        </div>
      </div>

      {rangeKey === 'custom' && (
        <div className="db-custom" data-testid="admin-dashboard-custom-picker">
          <label className="db-custom-field">
            <span>Từ ngày</span>
            <input
              type="date"
              value={customFrom}
              max={todayIso}
              onChange={e => setCustomFrom(e.target.value)}
              data-testid="admin-dashboard-custom-from"
              aria-label="Từ ngày (ngày/tháng/năm)"
              aria-invalid={customError ? true : undefined}
            />
          </label>
          <label className="db-custom-field">
            <span>Đến ngày</span>
            <input
              type="date"
              value={customTo}
              max={todayIso}
              onChange={e => setCustomTo(e.target.value)}
              data-testid="admin-dashboard-custom-to"
              aria-label="Đến ngày (ngày/tháng/năm)"
              aria-invalid={customError ? true : undefined}
            />
          </label>
          <button
            type="button"
            className="db-btn db-btn-primary"
            onClick={applyCustom}
            data-testid="admin-dashboard-custom-apply"
          >
            Áp dụng
          </button>
          {customError && (
            <p className="db-field-error" role="alert" data-testid="admin-dashboard-custom-error">
              {customError}
            </p>
          )}
          <p className="db-custom-hint">Tối đa 365 ngày, không chọn ngày trong tương lai.</p>
        </div>
      )}

      {/* ---------- 5 KPI ---------- */}
      <div className="db-kpis" aria-label="Chỉ số chính">
        {kpiCard({
          testid: 'admin-dashboard-kpi-revenue',
          label: 'Doanh thu',
          value: formatMoneyCompact(revenueCur),
          valueTitle: formatMoney(revenueCur),
          sub: `Kỳ ${formatDateVn(range.from.toISOString())} – ${formatDateVn(range.to.toISOString())}`,
          compare: revenue.data?.previous ? comparePeriods(revenueCur, revenuePrev) : { text: '—', tone: 'neutral' },
          loading: revenue.loading,
          hasData: revenue.data !== null,
          error: revenue.error,
          onRetry: () => retryBlock('revenue'),
          onClick: () => onNavigateTab('orders', rangeFilter),
        })}
        {kpiCard({
          testid: 'admin-dashboard-kpi-orders',
          label: 'Đơn hàng',
          value: ordersCur !== undefined && ordersCur !== null
            ? formatNumber(ordersCur)
            : ordersFallback !== null ? formatNumber(ordersFallback) : '—',
          valueTitle: ordersCur !== undefined && ordersCur !== null
            ? `${formatNumber(ordersCur)} đơn`
            : ordersFallback !== null ? `${formatNumber(ordersFallback)} đơn (theo danh sách)` : 'Chưa có dữ liệu',
          sub: overview.data
            ? `${formatNumber(overview.data.pendingOrders ?? 0)} chờ xác nhận`
            : 'Đang tải số đơn chờ xác nhận',
          compare: ordersPrev !== undefined && ordersPrev !== null
            ? comparePeriods(ordersCur ?? 0, ordersPrev)
            : ordersFallback !== null ? { text: '—', tone: 'neutral' } : { text: '—', tone: 'neutral' },
          loading: revenue.loading && orders.loading,
          hasData: revenue.data !== null || orders.data !== null,
          error: revenue.error && orders.error,
          onRetry: () => retryBlock('revenue'),
          onClick: () => onNavigateTab('orders', rangeFilter),
        })}
        {kpiCard({
          testid: 'admin-dashboard-kpi-aov',
          label: 'Giá trị đơn trung bình',
          value: ordersCur ? formatMoneyCompact(Math.round(aovCur)) : '—',
          valueTitle: ordersCur ? formatMoney(Math.round(aovCur)) : 'Chưa có đơn hàng trong kỳ',
          sub: ordersCur ? `${formatNumber(ordersCur)} đơn trong kỳ` : 'Chưa có đơn hàng trong kỳ',
          compare: aovPrev !== null && aovPrev !== undefined ? comparePeriods(aovCur, aovPrev) : { text: '—', tone: 'neutral' },
          loading: revenue.loading,
          hasData: revenue.data !== null,
          error: revenue.error,
          onRetry: () => retryBlock('revenue'),
          onClick: () => onNavigateTab('orders', rangeFilter),
        })}
        {kpiCard({
          testid: 'admin-dashboard-kpi-customers',
          label: 'Khách hàng mới',
          value: formatNumber(newCustomersCur),
          valueTitle: `${formatNumber(newCustomersCur)} khách hàng mới`,
          sub: totalCustomers === null
            ? 'Đang tải tổng khách hàng'
            : totalCustomersCapped
              ? 'Trên 100 khách hàng'
              : `Tổng ${formatNumber(totalCustomers)} khách hàng`,
          compare: customers.data ? comparePeriods(newCustomersCur, newCustomersPrev) : { text: '—', tone: 'neutral' },
          loading: customers.loading,
          hasData: customers.data !== null,
          error: customers.error,
          onRetry: () => retryBlock('customers'),
          onClick: () => onNavigateTab('customers', rangeFilter),
        })}
        {kpiCard({
          testid: 'admin-dashboard-kpi-cancel-rate',
          label: 'Tỷ lệ hủy/trả hàng',
          value: cancelRateCur !== undefined && cancelRateCur !== null ? formatPercent(cancelRateCur) : '—',
          valueTitle: cancelRateCur !== undefined && cancelRateCur !== null
            ? `Tỷ lệ hủy đơn ${formatPercent(cancelRateCur)}`
            : 'Chưa có dữ liệu',
          sub: returnsList.data
            ? `${formatNumber(cancelledCur)} đơn đã hủy · ${formatNumber(returnsInPeriod)} yêu cầu trả hàng trong kỳ`
            : 'Đang tải số yêu cầu trả hàng',
          compare: cancelRatePrev !== undefined && cancelRatePrev !== null
            ? comparePeriods(cancelRateCur ?? 0, cancelRatePrev, true)
            : { text: '—', tone: 'neutral' },
          loading: revenue.loading,
          hasData: revenue.data !== null,
          error: revenue.error,
          onRetry: () => retryBlock('revenue'),
          onClick: () => onNavigateTab('orders', { status: 'Cancelled', ...rangeFilter }),
        })}
      </div>

      <div className="db-grid">
        {/* ---------- Biểu đồ doanh thu ---------- */}
        <section className="db-card db-span-8" aria-label="Biểu đồ doanh thu" data-testid="admin-dashboard-revenue-card">
          <div className="db-card-head">
            <h2 className="db-card-title">Doanh thu</h2>
            <div className="db-card-tools">
              <div className="db-segmented db-segmented--sm" role="group" aria-label="Chỉ số biểu đồ">
                <button
                  type="button"
                  className={`db-segmented-btn${chartMetric === 'revenue' ? ' db-segmented-btn--active' : ''}`}
                  aria-pressed={chartMetric === 'revenue'}
                  data-testid="admin-dashboard-chart-metric-revenue"
                  onClick={() => setChartMetric('revenue')}
                >
                  Doanh thu
                </button>
                <button
                  type="button"
                  className={`db-segmented-btn${chartMetric === 'orders' ? ' db-segmented-btn--active' : ''}`}
                  aria-pressed={chartMetric === 'orders'}
                  data-testid="admin-dashboard-chart-metric-orders"
                  onClick={() => setChartMetric('orders')}
                >
                  Số đơn
                </button>
              </div>
              <button
                type="button"
                className="db-btn db-btn-ghost db-btn--sm"
                onClick={() => setShowChartTable(v => !v)}
                aria-expanded={showChartTable}
                data-testid="admin-dashboard-chart-table-btn"
              >
                {showChartTable ? 'Ẩn dạng bảng' : 'Xem dạng bảng'}
              </button>
            </div>
          </div>
          {revenue.loading && !revenue.data ? (
            skeleton('admin-dashboard-revenue-skeleton', 4)
          ) : revenue.error ? (
            blockError('admin-dashboard-revenue-error', () => retryBlock('revenue'))
          ) : !chartHasData ? (
            <EmptyState
              title="Chưa có dữ liệu trong khoảng thời gian này"
              desc="Thử chọn khoảng thời gian khác."
              testid="admin-dashboard-revenue-empty"
            />
          ) : (
            <div
              className="db-chart"
              data-testid="admin-dashboard-revenue-chart"
              role="img"
              aria-label={chartAriaLabel}
              onMouseEnter={() => { chartHoverRef.current = true; }}
              onMouseLeave={() => { chartHoverRef.current = false; }}
            >
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartPoints} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dbAreaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#051c12" stopOpacity={0.16} />
                      <stop offset="100%" stopColor="#051c12" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={72}
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    tickFormatter={(v: number) => chartMetric === 'revenue' ? formatAxisMoney(v) : formatNumber(v)}
                  />
                  <Tooltip
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0]?.payload as ChartPoint | undefined;
                      if (!p) return null;
                      return (
                        <div className="db-tooltip">
                          <p className="db-tooltip-title">{label}</p>
                          <p>Doanh thu: <strong>{formatMoney(p.revenue)}</strong> ({formatNumber(p.orders)} đơn)</p>
                          <p className="db-tooltip-prev">
                            Kỳ trước: {formatMoney(p.prevRevenue)} ({formatNumber(p.prevOrders)} đơn)
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey={chartMetric === 'revenue' ? 'prevRevenue' : 'prevOrders'}
                    name="Kỳ trước"
                    stroke="#9ca3af"
                    strokeDasharray="5 5"
                    strokeWidth={1.5}
                    fill="none"
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey={chartMetric === 'revenue' ? 'revenue' : 'orders'}
                    name="Kỳ này"
                    stroke="#051c12"
                    strokeWidth={2.5}
                    fill={chartMetric === 'revenue' ? 'url(#dbAreaFill)' : 'none'}
                    dot={false}
                    activeDot={{ r: 4, fill: '#051c12', stroke: '#ffffff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="db-legend" aria-hidden="true">
                <span className="db-legend-item"><span className="db-legend-line db-legend-line--current" />Kỳ này</span>
                <span className="db-legend-item"><span className="db-legend-line db-legend-line--prev" />Kỳ trước</span>
              </div>
            </div>
          )}
          {showChartTable && chartPoints.length > 0 && (
            <div className="db-table-wrap">
              <table className="db-table" data-testid="admin-dashboard-chart-table">
                <thead>
                  <tr>
                    <th>{bucketMode === 'day' ? 'Ngày' : bucketMode === 'week' ? 'Tuần' : 'Tháng'}</th>
                    <th className="db-num">Doanh thu kỳ này</th>
                    <th className="db-num">Số đơn kỳ này</th>
                    <th className="db-num">Doanh thu kỳ trước</th>
                    <th className="db-num">Số đơn kỳ trước</th>
                  </tr>
                </thead>
                <tbody>
                  {chartPoints.map(p => (
                    <tr key={p.key}>
                      <td>{p.label}</td>
                      <td className="db-num db-money">{formatMoney(p.revenue)}</td>
                      <td className="db-num">{formatNumber(p.orders)}</td>
                      <td className="db-num db-money">{formatMoney(p.prevRevenue)}</td>
                      <td className="db-num">{formatNumber(p.prevOrders)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {ordersFallbackCapped && revenue.error && (
            <p className="db-note">Danh sách đơn trong kỳ vượt quá 100 đơn — số liệu dự phòng chỉ tính trên 100 đơn gần nhất.</p>
          )}
        </section>

        {/* ---------- Donut trạng thái đơn ---------- */}
        <section className="db-card db-span-4" aria-label="Đơn hàng theo trạng thái" data-testid="admin-dashboard-donut-card">
          <div className="db-card-head">
            <h2 className="db-card-title">Đơn hàng theo trạng thái</h2>
          </div>
          {orders.loading && !orders.data ? (
            skeleton('admin-dashboard-donut-skeleton', 4)
          ) : orders.error ? (
            blockError('admin-dashboard-donut-error', () => retryBlock('orders'))
          ) : donutTotal === 0 ? (
            <EmptyState
              title="Chưa có dữ liệu trong khoảng thời gian này"
              desc="Thử chọn khoảng thời gian khác."
              testid="admin-dashboard-donut-empty"
            />
          ) : (
            <>
              <div className="db-donut" data-testid="admin-dashboard-status-donut" role="img" aria-label={`Tổng ${formatNumber(donutTotal)} đơn hàng trong kỳ`}>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={donut.map(g => ({ name: g.label, value: g.count }))}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="62%"
                      outerRadius="88%"
                      paddingAngle={2}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {donut.map(g => (
                        <Cell key={g.key} fill={g.color} />
                      ))}
                      <Label
                        content={(p: any) => {
                          const cx = p?.viewBox?.cx ?? p?.cx;
                          const cy = p?.viewBox?.cy ?? p?.cy;
                          if (typeof cx !== 'number' || typeof cy !== 'number') return <g />;
                          return (
                            <g>
                              <text x={cx} y={cy - 2} textAnchor="middle" className="db-donut-total">{formatNumber(donutTotal)}</text>
                              <text x={cx} y={cy + 18} textAnchor="middle" className="db-donut-total-label">đơn hàng</text>
                            </g>
                          );
                        }}
                      />
                    </Pie>
                    <Tooltip
                      formatter={(value: any, name: any) => [`${formatNumber(Number(value))} đơn`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="db-donut-legend">
                {donut.map(g => (
                  <li key={g.key}>
                    <button
                      type="button"
                      className="db-donut-legend-btn"
                      data-testid={`admin-dashboard-donut-${g.key}`}
                      onClick={() => onNavigateTab('orders', { status: g.navStatus, ...rangeFilter })}
                      aria-label={`${g.label}: ${formatNumber(g.count)} đơn, ${formatPercent(donutTotal ? (g.count / donutTotal) * 100 : 0)} — xem đơn hàng`}
                    >
                      <span className="db-dot" style={{ background: g.color }} aria-hidden="true" />
                      <span className="db-donut-legend-label">{g.label}</span>
                      <span className="db-donut-legend-count">{formatNumber(g.count)}</span>
                      <span className="db-donut-legend-pct">{formatPercent(donutTotal ? (g.count / donutTotal) * 100 : 0)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {ordersCapped && (
                <p className="db-note">Tính trên 100 đơn gần nhất trong kỳ (kỳ này có trên 100 đơn).</p>
              )}
            </>
          )}
        </section>
      </div>

      {/* ---------- Cần xử lý ngay (LUÔN số liệu hiện tại, không theo kỳ) ---------- */}
      <section
        className={`db-card db-action-card${!actionAllClear ? ' db-action-card--has-items' : ''}`}
        aria-label="Cần xử lý ngay"
        data-testid="admin-dashboard-action-needed"
      >
        <div className="db-card-head">
          <h2 className="db-card-title">Cần xử lý ngay</h2>
          <span className="db-card-note">Số liệu hiện tại</span>
        </div>
        {actionAllClear ? (
          <p className="db-all-clear" role="status">Không có việc cần xử lý. Mọi thứ đang ổn.</p>
        ) : (
          <ul className="db-action-list">
            {actionItems.map(a => actionRow(a))}
          </ul>
        )}
        {(overview.error || returnsList.error || reviews.error || promos.error) && (
          <p className="db-note">Một vài số liệu chưa tải được — dòng tương ứng hiển thị “—”. Bấm “Làm mới” ở đầu trang để tải lại.</p>
        )}
      </section>

      <div className="db-grid">
        {/* ---------- Đơn hàng gần đây ---------- */}
        <section className="db-card db-span-7" aria-label="Đơn hàng gần đây" data-testid="admin-dashboard-recent-orders-card">
          <div className="db-card-head">
            <h2 className="db-card-title">Đơn hàng gần đây</h2>
            <button
              type="button"
              className="db-link"
              onClick={() => onNavigateTab('orders', rangeFilter)}
              data-testid="admin-dashboard-recent-orders-all"
            >
              Xem tất cả đơn hàng
            </button>
          </div>
          {orders.loading && !orders.data ? (
            skeleton('admin-dashboard-recent-orders-skeleton', 4)
          ) : orders.error ? (
            blockError('admin-dashboard-recent-orders-error', () => retryBlock('orders'))
          ) : recentOrders.length === 0 ? (
            <EmptyState
              title="Chưa có đơn hàng trong khoảng thời gian này"
              desc="Thử chọn khoảng thời gian khác."
              testid="admin-dashboard-recent-orders-empty"
            />
          ) : (
            <div className="db-table-wrap">
              <table className="db-table db-table--orders">
                <thead>
                  <tr>
                    <th>Mã đơn</th>
                    <th>Khách hàng</th>
                    <th>Trạng thái</th>
                    <th>Thanh toán</th>
                    <th className="db-num">Tổng tiền</th>
                    <th>Ngày đặt</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map(o => (
                    <tr
                      key={o.id}
                      className="db-clickable"
                      data-testid={`admin-dashboard-order-${o.id}`}
                      onClick={() => onOpenOrder(o)}
                      tabIndex={0}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onOpenOrder(o);
                        }
                      }}
                      aria-label={`Xem đơn ${o.orderDisplayCode ?? `#${o.orderCode}`} của ${o.customerName}`}
                    >
                      <td><span className="db-code">{o.orderDisplayCode ?? `#${o.orderCode}`}</span></td>
                      <td>
                        <span className="db-customer">
                          <span className="db-avatar" style={{ background: avatarColor(o.customerName) }} aria-hidden="true">
                            {avatarInitial(o.customerName)}
                          </span>
                          <span className="db-customer-info">
                            <span className="db-customer-name">{o.customerName}</span>
                            <span className="db-customer-email">{o.customerEmail}</span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <Badge
                          tone={
                            o.status === 'Completed' || o.status === 'Paid' || o.status === 'Delivered' ? 'green'
                            : o.status === 'Cancelled' || o.status === 'Expired' ? 'red'
                            : o.status === 'ReturnRequested' ? 'gray'
                            : o.status === 'Shipping' ? 'blue'
                            : 'yellow'
                          }
                        >
                          {o.statusLabel ?? orderStatusLabel(o.status)}
                        </Badge>
                      </td>
                      <td>{o.paymentMethod === 'COD' ? 'COD' : o.paymentMethod?.includes('PayOS') ? 'PayOS' : (o.paymentMethod || '—')}</td>
                      <td className="db-num db-money">{formatMoney(o.totalAmount)}</td>
                      <td>
                        <span className="db-date-two-line">
                          <span>{formatDateVn(o.createdAt)}</span>
                          <span className="db-time">{formatTimeVn(new Date(o.createdAt))}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ---------- Sản phẩm bán chạy ---------- */}
        <section className="db-card db-span-5" aria-label="Sản phẩm bán chạy" data-testid="admin-dashboard-top-products-card">
          <div className="db-card-head">
            <h2 className="db-card-title">Sản phẩm bán chạy</h2>
            <button
              type="button"
              className="db-link"
              onClick={() => onNavigateTab('products')}
              data-testid="admin-dashboard-top-products-all"
            >
              Xem tất cả sản phẩm
            </button>
          </div>
          {revenue.loading && !revenue.data ? (
            skeleton('admin-dashboard-top-products-skeleton', 4)
          ) : revenue.error ? (
            blockError('admin-dashboard-top-products-error', () => retryBlock('revenue'))
          ) : topProducts.length === 0 ? (
            <EmptyState
              title="Chưa có sản phẩm bán chạy trong khoảng thời gian này"
              desc="Thử chọn khoảng thời gian khác."
              testid="admin-dashboard-top-products-empty"
            />
          ) : (
            <ol className="db-top-list">
              {topProducts.map((p, i) => {
                const topQty = topProducts[0]?.quantity ?? 1;
                const img = productImage.get(p.productId);
                return (
                  <li key={p.productId}>
                    <button
                      type="button"
                      className="db-top-row"
                      data-testid={`admin-dashboard-top-product-${p.productId}`}
                      onClick={() => onOpenProduct({ id: p.productId, name: p.productName })}
                      aria-label={`Hạng ${i + 1}: ${p.productName}, đã bán ${formatNumber(p.quantity)}, doanh thu ${formatMoney(p.revenue)}`}
                    >
                      <span className={`db-rank${i === 0 ? ' db-rank--top' : ''}`} aria-hidden="true">{i + 1}</span>
                      {img ? (
                        <img className="db-thumb" src={img} alt="" width={40} height={40} loading="lazy" />
                      ) : (
                        <span className="db-thumb db-thumb--letter" style={{ background: avatarColor(p.productName) }} aria-hidden="true">
                          {avatarInitial(p.productName)}
                        </span>
                      )}
                      <span className="db-top-info">
                        <span className="db-top-name">{p.productName}</span>
                        <span className="db-top-meta">
                          Đã bán {formatNumber(p.quantity)} · {formatMoney(p.revenue)}
                        </span>
                        <span className="db-bar" aria-hidden="true">
                          <span className="db-bar-fill" style={{ width: `${Math.max(4, Math.round((p.quantity / Math.max(1, topQty)) * 100))}%` }} />
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      <div className="db-grid">
        {/* ---------- Sắp hết / hết hàng ---------- */}
        <section className="db-card db-span-4" aria-label="Sản phẩm sắp hết hàng" data-testid="admin-dashboard-low-stock-card">
          <div className="db-card-head">
            <h2 className="db-card-title">Sắp hết hàng</h2>
            <span className="db-card-note">Số liệu hiện tại</span>
          </div>
          {overview.loading && !overview.data ? (
            skeleton('admin-dashboard-low-stock-skeleton', 3)
          ) : overview.error ? (
            blockError('admin-dashboard-low-stock-error', () => retryBlock('overview'))
          ) : lowStock.length === 0 ? (
            <EmptyState
              title="Không có sản phẩm sắp hết hàng"
              desc="Mọi sản phẩm đều còn đủ tồn kho."
              testid="admin-dashboard-low-stock-empty"
            />
          ) : (
            <ul className="db-plain-list">
              {lowStock.slice(0, 5).map(p => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="db-plain-row"
                    data-testid={`admin-dashboard-low-stock-${p.id}`}
                    onClick={() => onOpenProduct({ id: p.id, name: p.name })}
                    aria-label={`${p.name}, còn ${p.stock} sản phẩm — xem sản phẩm`}
                  >
                    <span className="db-plain-name">{p.name}</span>
                    <Badge tone={p.stock <= 0 ? 'red' : 'orange'}>
                      {p.stock <= 0 ? 'Hết hàng' : `Còn ${formatNumber(p.stock)}`}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------- Phân bổ hạng hội viên ---------- */}
        <section className="db-card db-span-4" aria-label="Phân bổ hạng hội viên" data-testid="admin-dashboard-tier-mix-card">
          <div className="db-card-head">
            <h2 className="db-card-title">Phân bổ hạng hội viên</h2>
            <button
              type="button"
              className="db-link"
              onClick={() => onNavigateTab('membership')}
              data-testid="admin-dashboard-tier-mix-all"
            >
              Xem hội viên
            </button>
          </div>
          {customers.loading && !customers.data ? (
            skeleton('admin-dashboard-tier-mix-skeleton', 3)
          ) : customers.error ? (
            blockError('admin-dashboard-tier-mix-error', () => retryBlock('customers'))
          ) : tierTotal === 0 ? (
            <EmptyState
              title="Chưa có khách hàng"
              desc="Khi có khách hàng, phân bổ hạng sẽ hiển thị ở đây."
              testid="admin-dashboard-tier-mix-empty"
            />
          ) : (
            <>
              <div className="db-stacked-bar" role="img" aria-label={`Phân bổ hạng: ${tierMix.map(t => `${t.label} ${formatNumber(t.count)}`).join(', ')}`}>
                {tierMix.filter(t => t.count > 0).map(t => (
                  <span
                    key={t.tier}
                    className="db-stacked-seg"
                    style={{ width: `${(t.count / tierTotal) * 100}%`, background: t.color }}
                    title={`${t.label}: ${formatNumber(t.count)} (${formatPercent((t.count / tierTotal) * 100)})`}
                  />
                ))}
              </div>
              <ul className="db-plain-list">
                {tierMix.map(t => (
                  <li key={t.tier}>
                    <button
                      type="button"
                      className="db-plain-row"
                      data-testid={`admin-dashboard-tier-${t.tier}`}
                      onClick={() => onNavigateTab('customers', { tier: t.tier === 'Other' ? undefined : t.tier })}
                      aria-label={`Hạng ${t.label}: ${formatNumber(t.count)} khách hàng — xem khách hàng`}
                    >
                      <span className="db-dot" style={{ background: t.color }} aria-hidden="true" />
                      <span className="db-plain-name">{t.label}</span>
                      <span className="db-plain-count">{formatNumber(t.count)}</span>
                      <span className="db-plain-pct">{formatPercent(tierTotal ? (t.count / tierTotal) * 100 : 0)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {totalCustomersCapped && (
                <p className="db-note">Tính trên 100 khách mới nhất (đã có trên 100 khách hàng).</p>
              )}
            </>
          )}
        </section>

        {/* ---------- Khuyến mãi đang chạy ---------- */}
        <section className="db-card db-span-4" aria-label="Khuyến mãi đang chạy" data-testid="admin-dashboard-active-promos-card">
          <div className="db-card-head">
            <h2 className="db-card-title">Khuyến mãi đang chạy</h2>
            <button
              type="button"
              className="db-link"
              onClick={() => onNavigateTab('promotions')}
              data-testid="admin-dashboard-active-promos-all"
            >
              Xem tất cả khuyến mãi
            </button>
          </div>
          {promos.loading && !promos.data ? (
            skeleton('admin-dashboard-active-promos-skeleton', 3)
          ) : promos.error ? (
            blockError('admin-dashboard-active-promos-error', () => retryBlock('promos'))
          ) : activePromos.length === 0 ? (
            <EmptyState
              title="Không có khuyến mãi đang chạy"
              desc="Khi có mã đang hoạt động, mã sẽ hiển thị ở đây."
              testid="admin-dashboard-active-promos-empty"
            />
          ) : (
            <ul className="db-promo-list">
              {activePromos.map(p => {
                const expiring = p.expiryDate
                  ? (() => {
                    const t = new Date(p.expiryDate).getTime();
                    const now = Date.now();
                    return !Number.isNaN(t) && t >= now && t <= addDays(new Date(), EXPIRING_PROMO_DAYS).getTime();
                  })()
                  : false;
                const usagePct = p.maxUses ? Math.min(100, Math.round(((p.usedCount ?? 0) / p.maxUses) * 100)) : null;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="db-promo-row"
                      data-testid={`admin-dashboard-promo-${p.id}`}
                      onClick={() => onOpenPromotion({ code: p.code })}
                      aria-label={`Khuyến mãi ${p.code}, ${p.discountType === 'Percentage' ? `giảm ${p.discountValue}%` : `giảm ${formatMoney(p.discountValue)}`}${p.expiryDate ? `, hết hạn ${formatDateVn(p.expiryDate)}` : ''}`}
                    >
                      <span className="db-promo-main">
                        <span className="db-promo-code">{p.code}</span>
                        {expiring && <Badge tone="orange">Sắp hết hạn</Badge>}
                        <span className="db-promo-value">
                          {p.discountType === 'Percentage' ? `Giảm ${formatNumber(p.discountValue)}%` : `Giảm ${formatMoney(p.discountValue)}`}
                        </span>
                      </span>
                      <span className="db-promo-sub">
                        {usagePct !== null ? (
                          <>
                            <span className="db-bar" aria-hidden="true">
                              <span className="db-bar-fill" style={{ width: `${usagePct}%` }} />
                            </span>
                            <span>Đã dùng {formatNumber(p.usedCount ?? 0)}/{formatNumber(p.maxUses)}</span>
                          </>
                        ) : (
                          <span>Đã dùng {formatNumber(p.usedCount ?? 0)} lượt</span>
                        )}
                        <span>Hạn: {p.expiryDate ? formatDateVn(p.expiryDate) : 'Không có hạn'}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Ghi chú về lỗi endpoint doanh thu (BUG_DAFL_003) — chỉ hiện khi khối doanh thu lỗi,
          để admin biết cần kiểm tra log backend trên máy Acer. */}
      {revenue.error && (
        <p className="db-note db-note--warn" data-testid="admin-dashboard-revenue-bug-note" role="note">
          Báo cáo doanh thu chưa tải được — vui lòng kiểm tra log backend (máy chủ) rồi bấm “Thử lại”.
          Các chỉ số khác vẫn hiển thị bình thường.
        </p>
      )}
    </div>
  );
}
