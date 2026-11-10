import { API_BASE, getToken } from '../../../../Shared/utils/api';

/**
 * Helper dùng chung cho form admin (đợt redesign form + upload ảnh).
 * Chỉ chứa hàm thuần / gọi API upload — không động vào nghiệp vụ validate
 * hay payload của từng form (nằm trong AdminForms.tsx / AdminPage.tsx).
 */

/** Bỏ dấu tiếng Việt, lowercase, nối gạch ngang — dùng sinh slug danh mục. */
export const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150);

/** "319000" -> "319.000" (định dạng nghìn vi-VN, không có hậu tố đ). */
export const formatThousands = (digits: string): string => {
  const d = digits.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!d) return '';
  return Number(d).toLocaleString('vi-VN');
};

/** "319.000" / "319000" -> 319000 (số thô để gửi payload). */
export const parseMoney = (value: string): number => {
  const d = String(value ?? '').replace(/\D/g, '');
  return d === '' ? NaN : Number(d);
};

/** % giảm tự tính từ giá bán + giá gốc, null khi không tính được. */
export const discountPercent = (price: number, originalPrice: number | null): number | null => {
  if (!originalPrice || !(originalPrice > 0) || !(price > 0) || originalPrice <= price) return null;
  return Math.round((1 - price / originalPrice) * 100);
};

/** "319000" -> "319.000₫" (chế độ xem). Số không hợp lệ -> "—". */
export const formatMoneyVND = (value: number | string): string => {
  const n = typeof value === 'string' ? parseMoney(value) : value;
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return `${n.toLocaleString('vi-VN')}₫`;
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** ISO/date -> "dd/mm/yyyy" (chế độ xem). Trống -> "—", không parse được -> giữ nguyên. */
export const formatDateVN = (value: string): string => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** ISO/datetime -> "dd/mm/yyyy HH:mm"; date-only -> "dd/mm/yyyy" (chế độ xem). */
export const formatDateTimeVN = (value: string): string => {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDateVN(value);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${formatDateVN(value)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/** Sinh mã khuyến mãi ngẫu nhiên: 8 ký tự A-Z0-9. */
export const randomPromoCode = (length = 8): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const buf = new Uint32Array(length);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) crypto.getRandomValues(buf);
  else for (let i = 0; i < length; i++) buf[i] = Math.floor(Math.random() * chars.length);
  return Array.from(buf, n => chars[n % chars.length]).join('');
};

// ---------- Validate dùng chung (đợt 17 — chuỗi lấy nguyên văn từ mẫu VCB, §2) ----------

/** Trường bắt buộc để trống → message đỏ dưới từng ô (mẫu VCB, áp mọi form). */
export const REQUIRED_MSG = 'Vui lòng bổ sung thông tin bắt buộc.';
/** Email sai định dạng (mẫu VCB). */
export const EMAIL_FORMAT_MSG = 'Email không đúng định dạng.';
/** SĐT sai định dạng (mẫu VCB). */
export const PHONE_FORMAT_MSG = 'Số điện thoại không đúng định dạng.';

/** SĐT VN: bắt đầu bằng 0 + 9 chữ số (đúng validator BE). */
export const PHONE_RE = /^0\d{9}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mã thực thể (SP/DM/KH): 3–20 ký tự, chỉ chữ in hoa / chữ số / gạch ngang.
 *  Để trống khi tạo → backend tự sinh số tiếp theo (SP-xxxx / DM-xxxx / KH-xxxx). */
export const ENTITY_CODE_RE = /^[A-Z0-9-]{3,20}$/;
export const validateEntityCode = (code: string, label: string): string | null => {
  if (code === '') return null; // để trống = tự sinh
  return ENTITY_CODE_RE.test(code)
    ? null
    : `Mã ${label} phải có 3–20 ký tự, chỉ gồm chữ in hoa, chữ số và gạch ngang.`;
};

/** Mật khẩu mới theo đúng policy BE (PasswordPolicy.Validate): ≥8 ký tự,
 *  ≥1 chữ hoa, ≥1 chữ số, ≥1 ký tự đặc biệt. Trả message lỗi đầu tiên gặp. */
export const passwordPolicyError = (password: string): string | null => {
  if (!password || password.length < 8) return 'Mật khẩu phải có tối thiểu 8 ký tự.';
  if (!/[A-Z]/.test(password)) return 'Mật khẩu phải chứa ít nhất 1 ký tự chữ hoa (A-Z).';
  if (!/\d/.test(password)) return 'Mật khẩu phải chứa ít nhất 1 chữ số (0-9).';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt (ví dụ: !@#$%^&*...).';
  return null;
};

/**
 * Map message lỗi BE → key field để hiện message đỏ inline dưới đúng ô.
 * Trùng mã (đợt 17, mẫu VCB §2 — CẢ toast CẢ inline, cùng nội dung):
 *  "Mã sản phẩm đã tồn tại." / "Mã danh mục đã tồn tại." /
 *  "Mã khách hàng đã tồn tại." / "Mã giảm giá đã tồn tại." → 'code'.
 * Tương thích cả message cũ ("Mã {mã} đã tồn tại.", "Mã khuyến mãi đã tồn tại…")
 * và trùng slug/email/SĐT.
 * Trả null khi không map được field nào (caller hiện toast, không im lặng).
 */
export const duplicateFieldOf = (message: string): string | null => {
  const m = message ?? '';
  if (/Mã (sản phẩm|danh mục|khách hàng|giảm giá|khuyến mãi)\b/i.test(m)) return 'code';
  if (/Mã \S+ đã tồn tại/i.test(m)) return 'code';
  if (/Slug .* đã tồn tại/i.test(m)) return 'slug';
  if (/Email đã tồn tại/i.test(m)) return 'email';
  if (/Số điện thoại đã (tồn tại|được sử dụng)/i.test(m)) return 'phoneNumber';
  return null;
};

// ---------- Upload ảnh ----------

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 1600;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Validate client trước khi upload: định dạng + dung lượng. */
export const validateImageFile = (file: File): string | null => {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Định dạng không được hỗ trợ (chỉ PNG, JPG, WEBP).';
  if (file.size > MAX_IMAGE_BYTES) return 'Ảnh vượt quá 5MB.';
  return null;
};

/** Loại lỗi ảnh, để caller chọn đúng toast messages.vi §3.9
 *  (unsupportedFormat / tooLarge) thay vì chỉ chuỗi inline chung. */
export type ImageFileErrorKind = 'format' | 'size';
export const imageFileErrorKind = (file: File): ImageFileErrorKind | null => {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'format';
  if (file.size > MAX_IMAGE_BYTES) return 'size';
  return null;
};

/** Dung lượng file theo MB, 1 chữ số thập phân (cho toast §3.9: {x}MB). */
export const formatFileSizeMB = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1);

/**
 * Nén/resize client trước khi gửi: cạnh dài tối đa 1600px (canvas).
 * Môi trường không có canvas 2D (vd jsdom trong Vitest) thì trả file gốc.
 */
export const compressImage = async (file: File): Promise<File> => {
  try {
    if (typeof document === 'undefined') return file;
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= MAX_IMAGE_EDGE) { bitmap.close?.(); return file; }
    const scale = MAX_IMAGE_EDGE / longest;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close?.(); return file; }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, file.type || 'image/jpeg', 0.85));
    if (!blob) return file;
    return new File([blob], file.name, { type: blob.type || file.type });
  } catch {
    return file;
  }
};

export interface UploadResult { ok: boolean; url?: string; error?: string }

/**
 * Upload 1 ảnh: POST /api/admin/upload, multipart/form-data, field "file".
 * Dùng XMLHttpRequest để có tiến độ upload thật (fetch không báo progress).
 * Lưu ý: KHÔNG dùng apiFetch ở đây vì nó tự gắn Content-Type: application/json
 * khi có body — FormData cần trình duyệt tự đặt boundary multipart.
 */
export const uploadImageFile = (
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> =>
  new Promise(resolve => {
    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/admin/upload`);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as { success?: boolean; message?: string; data?: { url?: string } | string };
        const url = typeof body.data === 'string' ? body.data : body.data?.url;
        if (xhr.status >= 200 && xhr.status < 300 && url) resolve({ ok: true, url });
        else resolve({ ok: false, error: body.message || `Upload thất bại (HTTP ${xhr.status}).` });
      } catch {
        resolve({ ok: false, error: 'Máy chủ trả về phản hồi không hợp lệ.' });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: 'Không thể kết nối đến máy chủ.' });
    xhr.ontimeout = () => resolve({ ok: false, error: 'Upload quá thời gian chờ.' });
    xhr.send(form);
  });

/** Preview ngay bằng URL.createObjectURL (fallback '' khi môi trường không hỗ trợ). */
export const objectUrlOf = (file: File): string => {
  try {
    return URL.createObjectURL(file);
  } catch {
    return '';
  }
};
