import React, { useEffect, useRef, useState } from 'react';
import { PHONE_FORMAT_MSG, PHONE_RE, REQUIRED_MSG, discountPercent, formatDateTimeVN, formatDateVN, formatMoneyVND, parseMoney, randomPromoCode, slugify, validateEntityCode } from './formUtils';
import { CategoryPicker, FieldError, ImageUploader, MoneyInput, Req, Toggle, ViewImageGallery, imageItemFromUrl } from './FormControls';
import type { UploadImageItem } from './FormControls';
import { ArrowLeft, Banknote, Lock, Percent, Save, ShoppingBag, Sparkles, Truck } from 'lucide-react';
import { FormShell } from './FormShell';
import './product-form.css';
import { notify } from './notify';
import { confirmAction } from './ConfirmDialog';
import { fmt, messages, shortName } from './messages.vi';

/**
 * 4 form admin — đợt 18: quay về Drawer 560–640px (SP) / Modal max 560px
 * (DM/KM/KH), thay form trang riêng 2 cột đợt 17. Mỗi form thêm prop
 * `mode: 'create'|'edit'|'view'` + `onSwitchToEdit` (view -> edit, giữ dữ liệu).
 * Mỗi form tự giữ state field + validate realtime (blur) + khi bấm Lưu;
 * chỉ gọi onSave(payload) khi dữ liệu hợp lệ. onSave trả { ok, error, fieldErrors } —
 * lỗi server hiện trong form (fieldErrors -> message đỏ dưới đúng ô, error -> form),
 * không đóng form, giữ nguyên dữ liệu.
 * Chuỗi validate bắt buộc/email/SĐT lấy nguyên văn mẫu VCB (§2):
 *  trống -> "Vui lòng bổ sung thông tin bắt buộc."; SĐT sai -> "Số điện thoại không đúng định dạng.".
 * Toast thành công/trùng dữ liệu qua notify + messages.vi (đợt 18, W1).
 * Đóng form (ESC/X/Hủy) khi dirty: hỏi "Hủy các thay đổi?" qua confirmAction
 * của W1 (messages.confirm.discardForm, đúng 2 nút [Ở lại] + [Rời trang]);
 * xem requestDiscardConfirm — có fallback về onRequestClose(dirty) khi host
 * chưa mount. Ở chế độ xem đóng luôn, không hỏi.
 */

export type FormMode = 'create' | 'edit' | 'view';

/** Ngưỡng tồn kho thấp (đợt 25): dưới ngưỡng này SP hiện "Sắp hết hàng". */
const LOW_STOCK_THRESHOLD = 10;

// ---------- Helper dùng chung ----------

/** Kết quả lưu form: fieldErrors = lỗi BE đã map xuống từng field
 *  (vd trùng mã -> { code: "Mã sản phẩm đã tồn tại." }); cha (AdminPage)
 *  hiện thêm toast cùng nội dung — CẢ 2 kênh cùng lúc (mẫu VCB §2). */
export interface FormSaveResult { ok: boolean; error?: string; fieldErrors?: Record<string, string> }

/** Cuộn tới + focus ô lỗi đầu tiên (tìm theo testid trong form). */
const focusField = (formTestid: string, fieldTestid: string) => {
  const el = document.querySelector(
    `[data-testid="${formTestid}"] [data-testid="${fieldTestid}"]`,
  ) as HTMLElement | null;
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
  el?.focus();
};

const focusFirstError = (formTestid: string, errors: Record<string, string>, order: string[], testidOf: Record<string, string>) => {
  const first = order.find(f => errors[f]);
  if (first) focusField(formTestid, testidOf[first]);
};

/** Xóa lỗi của 1 field khỏi errors (đợt 25/26): lỗi tự biến mất khi người
 *  dùng sửa ô đó. Dùng dạng setErrors(prev => clearError(prev, field)) để
 *  tránh closure stale state (xem cảnh báo ở CategoryPicker). */
const clearError = (prev: Record<string, string>, field: string): Record<string, string> => {
  if (!(field in prev)) return prev;
  const next = { ...prev };
  delete next[field];
  return next;
};

/** Tiêu đề nhóm field trong form. className tùy chọn (đợt 24: section "Giá trị
 *  giảm" của form KM mang class pv-card để nhận style riêng). */
const FormSection = ({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) => (
  <div className={`sa-form-section${className ? ` ${className}` : ''}`}>
    <h4 className="sa-form-section-title">{title}</h4>
    {children}
  </div>
);

/** Ô chỉ đọc ở chế độ xem: nền xám nhạt, chữ rõ, cho bôi đen/copy. */
const ViewInput = ({ id, testid, value }: { id: string; testid: string; value: string }) => (
  <input id={id} className="sa-input sa-view-input" value={value} data-testid={testid} readOnly />
);

/** Badge trạng thái ở chế độ xem (thay toggle/dropdown). */
const StatusBadge = ({ tone, label, testid }: {
  tone: 'green' | 'gray' | 'red' | 'yellow' | 'blue' | 'orange'; label: string; testid: string;
}) => (
  <span className={`fs-badge fs-badge-${tone}`} data-testid={testid}>{label}</span>
);

/** Khối chỉ đọc cuối form (chế độ xem): Ngày tạo / Ngày cập nhật / Người cập nhật.
 *  Chỉ hiện khi có dữ liệu (field nào trống thì ẩn dòng đó). */
const ViewMeta = ({ prefix, createdAt, updatedAt, updatedBy }: {
  prefix: string; createdAt?: string; updatedAt?: string; updatedBy?: string;
}) => {
  if (!createdAt && !updatedAt && !updatedBy) return null;
  return (
    <FormSection title="Lịch sử">
      <div className="fs-view-meta">
        {createdAt && (
          <div className="fs-view-meta-row">
            <span>Ngày tạo</span>
            <span data-testid={`${prefix}-created-at`}>{formatDateTimeVN(createdAt)}</span>
          </div>
        )}
        {updatedAt && (
          <div className="fs-view-meta-row">
            <span>Ngày cập nhật</span>
            <span data-testid={`${prefix}-updated-at`}>{formatDateTimeVN(updatedAt)}</span>
          </div>
        )}
        {updatedBy && (
          <div className="fs-view-meta-row">
            <span>Người cập nhật</span>
            <span data-testid={`${prefix}-updated-by`}>{updatedBy}</span>
          </div>
        )}
      </div>
    </FormSection>
  );
};

/** Toast cảnh báo trùng dữ liệu (inline + toast, mẫu VCB §2): chọn đúng chuỗi
 *  messages.vi theo field lỗi BE đã map (code/slug/name/email/phoneNumber). */
const notifyDuplicate = (entity: 'product' | 'category' | 'promo' | 'customer', fieldErrors: Record<string, string>) => {
  if (fieldErrors.code) {
    if (entity === 'product') notify.warning(messages.validate.duplicateProductCode, 'Vui lòng nhập mã khác.');
    else if (entity === 'category') notify.warning(messages.validate.duplicateCategoryCode, 'Vui lòng nhập mã khác.');
    else if (entity === 'promo') notify.warning(messages.toast.promo.duplicateCode.title, messages.toast.promo.duplicateCode.desc);
    else notify.warning(messages.validate.duplicateCustomerCode, 'Vui lòng nhập mã khác.');
  }
  if (fieldErrors.slug) notify.warning(messages.toast.category.duplicateSlug.title, messages.toast.category.duplicateSlug.desc);
  if (fieldErrors.name) notify.warning(messages.toast.product.duplicateName.title, messages.toast.product.duplicateName.desc);
  if (fieldErrors.email) notify.warning(messages.toast.customer.duplicateEmail.title, messages.toast.customer.duplicateEmail.desc);
  if (fieldErrors.phoneNumber) notify.warning(messages.toast.customer.duplicatePhone.title, messages.toast.customer.duplicatePhone.desc);
};

/** Giá trị trống ở chế độ xem hiện "—". */
const orDash = (v: string): string => (v.trim() === '' ? '—' : v.trim());

/**
 * Đóng form khi có thay đổi chưa lưu (đợt 18, §6.6): hỏi qua confirmAction
 * của W1 — "Hủy các thay đổi?" / "Các thay đổi bạn vừa nhập sẽ bị mất.",
 * đúng 2 nút [Ở lại] (trái) + [Rời trang] (phải). Xác nhận -> onRequestClose(false)
 * (đóng luôn, cha không hỏi lại); chưa sửa (dirty=false) -> đóng luôn.
 *
 * Fallback khi <ConfirmDialogHost/> chưa mount ở gốc AdminPage (W3 gắn ở sóng B):
 * confirmAction treo tới khi host mount; nếu sau 300ms vẫn không thấy dialog
 * trong DOM thì để cha hỏi bằng hộp xác nhận sẵn có qua onRequestClose(true)
 * (chuỗi cũ của cha, W3 sẽ đổi sang messages.confirm.discardForm) — form vẫn
 * đóng được, không treo. Khi host đã mount (bản tích hợp), dialog hiện ngay
 * nên không bao giờ rơi vào fallback. Cờ chống gọi chồng khi bấm ESC/X/Hủy
 * liên tiếp trong lúc popup đang mở.
 *
 * BUG #1 (đợt 24/25/26): KHÔNG được sleep 300ms rồi mới đọc kết quả
 * confirmAction — người dùng bấm [Ở lại]/[Rời trang] trong 300ms đó thì
 * promise đã resolve nhưng dialog đã đóng, kiểm tra dialogOpen sau sleep
 * nhầm thành "host chưa mount" và gọi onRequestClose(true) → cha mở lại
 * dialog lần 2. Vì vậy phải đua (race) promise với timeout 300ms: trả lời
 * trước 300ms thì tôn trọng ngay; chỉ khi hết 300ms chưa có câu trả lời
 * mới kiểm tra dialogOpen để quyết định fallback.
 */
let discardConfirmPending = false;
const requestDiscardConfirm = async (dirty: boolean, onRequestClose: (dirty: boolean) => void) => {
  if (!dirty) { onRequestClose(false); return; }
  if (discardConfirmPending) return;
  discardConfirmPending = true;
  try {
    const pending = confirmAction({
      title: messages.confirm.discardForm.title,
      message: messages.confirm.discardForm.message,
      confirmText: messages.confirm.discardForm.confirmText,
      cancelText: 'Ở lại',
      variant: 'warning',
    });
    // Đua câu trả lời với timeout 300ms (xem BUG #1 ở comment trên hàm):
    // bấm [Ở lại]/[Rời trang] trong 300ms đầu vẫn được tôn trọng, không
    // rơi vào fallback mở lại dialog lần 2.
    const answered = await Promise.race([
      pending.then(r => ({ settled: true as const, ...r })),
      new Promise<{ settled: false }>(resolve => {
        setTimeout(() => resolve({ settled: false }), 300);
      }),
    ]);
    if (answered.settled) {
      if (answered.confirmed) onRequestClose(false);
      return;
    }
    const dialogOpen = typeof document !== 'undefined'
      && !!document.querySelector('[data-testid="confirm-dialog"]');
    if (!dialogOpen) {
      onRequestClose(true);
      return;
    }
    const { confirmed } = await pending;
    if (confirmed) onRequestClose(false);
  } finally {
    discardConfirmPending = false;
  }
};

/** Nút "Quay lại" ở đầu trang form (đợt 25/26): form dirty -> hỏi "Hủy các
 *  thay đổi?" trước; chưa sửa -> history.back(), không có lịch sử thì về
 *  danh sách qua onRequestClose(false) (cha điều hướng). */
const goBackOrClose = (dirty: boolean, onRequestClose: (dirty: boolean) => void) => {
  if (dirty) { void requestDiscardConfirm(dirty, onRequestClose); return; }
  if (typeof window !== 'undefined' && window.history.length > 1) window.history.back();
  else onRequestClose(false);
};

/** Nút "Quay lại" dùng chung cho header sticky của 4 trang form
 *  (testid admin-{entity}-form-back-btn, thứ tự: Quay lại, Hủy, Lưu). */
const FormBackButton = ({ testid, onBack }: { testid: string; onBack: () => void }) => (
  <button type="button" className="sa-btn sa-btn-ghost sa-form-back-btn" data-testid={testid} onClick={onBack}>
    <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" /> Quay lại
  </button>
);

// ============================================================================
// 1. FORM SẢN PHẨM — Drawer 600px (đợt 18)
// ============================================================================

export interface ProductFormInitial {
  id: string; code: string; name: string; categoryId: string; price: string; originalPrice: string;
  stock: string; description: string; imageUrl: string; isActive: boolean;
  /** Danh sách ảnh đầy đủ (nếu có) — chế độ xem hiện gallery; thiếu thì dùng imageUrl. */
  imageUrls?: string[];
  /** Chế độ xem: hiện ở khối "Lịch sử" cuối form (chỉ khi có dữ liệu). */
  createdAt?: string; updatedAt?: string; updatedBy?: string;
}

export interface ProductSavePayload {
  id: string; code: string; name: string; categoryId: string; price: number; originalPrice: number | null;
  stock: number; description: string; imageUrl: string; imageUrls: string[]; isActive: boolean;
}

const PRODUCT_ERROR_TESTID: Record<string, string> = {
  code: 'admin-product-code-input',
  name: 'admin-product-name-input',
  categoryId: 'admin-product-category-select',
  price: 'admin-product-price-input',
  originalPrice: 'admin-product-original-price-input',
  stock: 'admin-product-stock-input',
};

export function ProductForm({ initial, categories, onSave, onRequestClose, mode: modeProp, onSwitchToEdit, variant }: {
  initial: ProductFormInitial;
  categories: Array<{ id: string; name: string }>;
  onSave: (payload: ProductSavePayload) => Promise<FormSaveResult>;
  onRequestClose: (dirty: boolean) => void;
  mode?: FormMode;
  onSwitchToEdit?: () => void;
  /** Đợt 21 — 'drawer' (FormShell 760px, đợt 18, mặc định) và 'page' (trang
   *  full page: header sticky có nút Lưu/Hủy ở trên cùng, KHÔNG Drawer).
   *  Nội dung form (trường + validate + upload + xem trước) dùng chung. */
  variant?: 'drawer' | 'page';
}) {
  const isPage = variant === 'page';
  const isEdit = initial.id !== '';
  const mode: FormMode = modeProp ?? (isEdit ? 'edit' : 'create');
  const isView = mode === 'view';
  const [code, setCode] = useState(initial.code);
  const [name, setName] = useState(initial.name);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [price, setPrice] = useState(initial.price.replace(/\D/g, ''));
  const [originalPrice, setOriginalPrice] = useState(initial.originalPrice.replace(/\D/g, ''));
  const [stock, setStock] = useState(initial.stock.replace(/\D/g, ''));
  const [description, setDescription] = useState(initial.description);
  const [isActive, setIsActive] = useState(initial.isActive);
  const initialUrls = initial.imageUrls && initial.imageUrls.length > 0
    ? initial.imageUrls
    : initial.imageUrl ? [initial.imageUrl] : [];
  const [images, setImages] = useState<UploadImageItem[]>(() => initialUrls.map(imageItemFromUrl));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);

  const readyUrls = images.filter(i => i.status === 'ready' && i.url).map(i => i.url);
  const dirty = isView ? false :
    code !== initial.code || name !== initial.name || categoryId !== initial.categoryId || price !== initial.price.replace(/\D/g, '') ||
    originalPrice !== initial.originalPrice.replace(/\D/g, '') || stock !== initial.stock.replace(/\D/g, '') ||
    description !== initial.description || isActive !== initial.isActive ||
    JSON.stringify(readyUrls) !== JSON.stringify(initialUrls);

  // Textarea mô tả tự giãn chiều cao theo nội dung.
  useEffect(() => {
    const el = descRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
  }, [description]);

  /** Stepper tồn kho giữ-chuột-tăng-liên-tục (đợt 25): pointerdown bước 1 lần
   *  rồi sau 400ms lặp mỗi 80ms; nhả chuột/rời nút/hủy thì dừng (dọn cả khi
   *  unmount). onClick chỉ chạy cho bàn phím (Enter/Space) — click chuột đã
   *  bước ở pointerdown nên bỏ qua nhờ cờ stockPointerUsedRef. */
  const stockHoldTimerRef = useRef<number | null>(null);
  const stockHoldIntervalRef = useRef<number | null>(null);
  const stockPointerUsedRef = useRef(false);
  const stopStockHold = () => {
    if (stockHoldTimerRef.current !== null) { window.clearTimeout(stockHoldTimerRef.current); stockHoldTimerRef.current = null; }
    if (stockHoldIntervalRef.current !== null) { window.clearInterval(stockHoldIntervalRef.current); stockHoldIntervalRef.current = null; }
  };
  useEffect(() => stopStockHold, []);
  const changeStock = (delta: number) => {
    setStock(prev => String(Math.max(0, (prev === '' ? 0 : Number(prev)) + delta)));
    setErrors(prev => clearError(prev, 'stock'));
  };
  const onStockStepPointerDown = (delta: 1 | -1) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    stockPointerUsedRef.current = true;
    changeStock(delta);
    stopStockHold();
    stockHoldTimerRef.current = window.setTimeout(() => {
      stockHoldIntervalRef.current = window.setInterval(() => changeStock(delta), 80);
    }, 400);
  };
  const onStockStepClick = (delta: 1 | -1) => () => {
    if (stockPointerUsedRef.current) { stockPointerUsedRef.current = false; return; }
    changeStock(delta);
  };

  const validateAll = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    const codeErr = validateEntityCode(code.trim().toUpperCase(), 'sản phẩm');
    if (codeErr) errs.code = codeErr;
    const n = name.trim();
    if (n.length === 0) errs.name = REQUIRED_MSG;
    else if (n.length < 3 || n.length > 120) errs.name = 'Tên sản phẩm phải có từ 3 đến 120 ký tự.';
    if (!categoryId) errs.categoryId = REQUIRED_MSG;
    const p = parseMoney(price);
    if (price === '') errs.price = REQUIRED_MSG;
    else if (!(p > 0)) errs.price = 'Giá bán phải lớn hơn 0.';
    if (originalPrice !== '') {
      const op = parseMoney(originalPrice);
      if (!(op > p)) errs.originalPrice = 'Giá gốc phải lớn hơn giá bán.';
    }
    if (stock === '') errs.stock = REQUIRED_MSG;
    else {
      const s = Number(stock);
      if (!Number.isInteger(s) || s < 0) errs.stock = 'Tồn kho phải là số nguyên ≥ 0.';
    }
    return errs;
  };

  const validateField = (field: string) => {
    const errs = validateAll();
    setErrors(prev => {
      const next = { ...prev };
      if (errs[field]) next[field] = errs[field];
      else delete next[field];
      return next;
    });
  };

  /** Áp lỗi server đã map field (vd trùng mã) xuống errors + toast cảnh báo + focus ô lỗi đầu. */
  const applyServerFieldErrors = (fieldErrors: Record<string, string>) => {
    setErrors(prev => ({ ...prev, ...fieldErrors }));
    notifyDuplicate('product', fieldErrors);
    focusFirstError('admin-product-form', fieldErrors,
      ['code', 'name', 'categoryId', 'price', 'originalPrice', 'stock'], PRODUCT_ERROR_TESTID);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const errs = validateAll();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      notify.warning(messages.toast.form.invalid.title, messages.toast.form.invalid.desc);
      focusFirstError('admin-product-form', errs,
        ['code', 'name', 'categoryId', 'price', 'originalPrice', 'stock'], PRODUCT_ERROR_TESTID);
      return;
    }
    setSubmitting(true);
    const res = await onSave({
      id: initial.id,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      categoryId,
      price: parseMoney(price),
      originalPrice: originalPrice === '' ? null : parseMoney(originalPrice),
      stock: Number(stock),
      description,
      imageUrl: readyUrls[0] ?? '',
      imageUrls: readyUrls,
      isActive,
    });
    setSubmitting(false);
    if (!res.ok) {
      if (res.fieldErrors && Object.keys(res.fieldErrors).length > 0) applyServerFieldErrors(res.fieldErrors);
      else setFormError(res.error || 'Không lưu được sản phẩm.');
      return;
    }
    // Thành công: toast chung "Đã lưu sản phẩm" (đợt 25/26 — không nêu tên SP);
    // cha đóng form + reload (form unmount, không cần làm gì thêm).
    notify.success(messages.toast.product.saved.title, messages.toast.product.saved.desc);
    const displayName = shortName(name.trim());
    if (Number(stock) === 0) {
      notify.info(messages.toast.product.outOfStock.title, fmt(messages.toast.product.outOfStock.desc, { tên: displayName }));
    }
  };

  const requestClose = () => void requestDiscardConfirm(dirty, onRequestClose);
  const handleBack = () => goBackOrClose(dirty, onRequestClose);
  /** Đợt 21 — trang full page không có FormShell nên tự lo autofocus ô đầu
   *  + ESC (FormShell làm việc này ở Drawer): ESC khi chưa sửa thì đóng ngay,
   *  đã sửa thì hỏi "Hủy các thay đổi?" qua requestClose. requestCloseRef
   *  tránh closure cũ (dirty) trong listener đăng ký 1 lần khi mount. */
  const pageFormRef = useRef<HTMLFormElement>(null);
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  useEffect(() => {
    if (!isPage) return;
    const first = pageFormRef.current?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); requestCloseRef.current(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPage]);
  const title = isPage
    ? (isView ? 'Chi tiết sản phẩm' : isEdit ? 'Chỉnh sửa sản phẩm' : 'Thêm mới sản phẩm')
    : (isView ? 'Chi tiết sản phẩm' : isEdit ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm');
  const subtitle: string | undefined = undefined;
  // Đợt 26: bỏ subtitle — tiêu đề đã đủ thông tin (không còn dòng mô tả dưới
  // tiêu đề form: "Thêm sản phẩm mới lên sàn." / "Chỉnh sửa thông tin sản phẩm
  // đang bán." / "Xem thông tin sản phẩm."). Header chỉ render <p> khi có subtitle.

  const priceNum = parseMoney(price);
  const origNum = originalPrice === '' ? null : parseMoney(originalPrice);
  const pct = discountPercent(Number.isNaN(priceNum) ? 0 : priceNum, origNum);
  const stockNum = stock === '' ? 0 : Number(stock);
  /** Nhãn trạng thái tồn kho cạnh stepper (đợt 25): ≥ ngưỡng Còn hàng, 1–9
   *  Sắp hết hàng, 0 Hết hàng; chưa nhập thì chưa hiện. */
  const stockStatus = stock === '' ? null
    : stockNum >= LOW_STOCK_THRESHOLD ? { tone: 'green', label: 'Còn hàng' }
    : stockNum >= 1 ? { tone: 'yellow', label: 'Sắp hết hàng' }
    : { tone: 'red', label: 'Hết hàng' };
  const categoryName = categories.find(c => c.id === categoryId)?.name ?? '';

  /** Nội dung form dùng chung cho cả 2 variant (đợt 21): Drawer (FormShell)
   *  và trang full page (form thường + header sticky). Chỉ khác cách bọc ngoài:
   *  Drawer xếp 1 cột theo thứ tự cũ (body), trang full page xếp lưới 2 cột
   *  (pageBody, đợt 25/26). Mỗi section tách thành const riêng để dùng chung. */
  const formErrorNode = formError && <p className="sa-error" role="alert">{formError}</p>;
  const basicSection = (
    <FormSection title="Thông tin cơ bản">
        <div className="sa-form-grid">
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-product-code">Mã SP</label>
            {isView ? (
              <ViewInput id="admin-product-code" testid="admin-product-code-input" value={orDash(code)} />
            ) : (
              <>
                <span className="sa-code-lock-wrap">
                  <input
                    id="admin-product-code"
                    className={`sa-input${errors.code ? ' sa-input-error' : ''}`}
                    value={code}
                    data-testid="admin-product-code-input"
                    aria-describedby={errors.code ? 'admin-product-code-error' : undefined}
                    disabled={isEdit}
                    placeholder="Để trống để tự sinh (SP-xxxx)"
                    maxLength={20}
                    onChange={e => { setCode(e.target.value.toUpperCase()); setErrors(prev => clearError(prev, 'code')); }}
                    onBlur={() => validateField('code')}
                  />
                  {isEdit && (
                    <span className="sa-code-lock" title="Mã sản phẩm không thể thay đổi">
                      <Lock size={16} strokeWidth={2} aria-hidden="true" />
                    </span>
                  )}
                </span>
                <FieldError id="admin-product-code-error" testid="admin-product-code-error" message={errors.code} />
              </>
            )}
          </div>
          <div className="sa-field sa-field-wide">
            <label className="sa-field-label" htmlFor="admin-product-name">Tên sản phẩm{!isView && <Req />}</label>
            {isView ? (
              <ViewInput id="admin-product-name" testid="admin-product-name-input" value={orDash(name)} />
            ) : (
              <>
                <input
                  id="admin-product-name"
                  className={`sa-input${errors.name ? ' sa-input-error' : ''}`}
                  value={name}
                  data-testid="admin-product-name-input"
                  aria-describedby={errors.name ? 'admin-product-name-error' : undefined}
                  maxLength={120}
                  onChange={e => { setName(e.target.value); setErrors(prev => clearError(prev, 'name')); }}
                  onBlur={() => validateField('name')}
                />
                <FieldError id="admin-product-name-error" testid="admin-product-name-error" message={errors.name} />
              </>
            )}
          </div>
          <div className="sa-field sa-field-wide">
            <label className="sa-field-label" htmlFor="admin-product-category">Danh mục{!isView && <Req />}</label>
            <CategoryPicker
              value={categoryId}
              categories={categories}
              onChange={v => {
                setCategoryId(v);
                // Xóa lỗi ngay khi đã chọn (validateField đọc state cũ trong cùng event nên không dùng ở đây).
                if (v) setErrors(prev => { const n = { ...prev }; delete n.categoryId; return n; });
              }}
              testid="admin-product-category-select"
              errorId={errors.categoryId ? 'admin-product-category-error' : undefined}
              disabled={isView}
              placeholder={isView ? '—' : 'Chọn danh mục'}
            />
            {!isView && <FieldError id="admin-product-category-error" testid="admin-product-category-error" message={errors.categoryId} />}
          </div>
        </div>
    </FormSection>
  );
  const priceSection = (
    <FormSection title="Giá & tồn kho">
        <div className="sa-form-grid">
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-product-price">Giá bán{!isView && <Req />}</label>
            {isView ? (
              <ViewInput id="admin-product-price" testid="admin-product-price-input" value={price === '' ? '—' : formatMoneyVND(price)} />
            ) : (
              <>
                <MoneyInput
                  id="admin-product-price"
                  value={price}
                  onChange={v => { setPrice(v); setErrors(prev => clearError(prev, 'price')); }}
                  testid="admin-product-price-input"
                  errorId={errors.price ? 'admin-product-price-error' : undefined}
                  error={!!errors.price}
                />
                <FieldError id="admin-product-price-error" testid="admin-product-price-error" message={errors.price} />
              </>
            )}
          </div>
          <div className="sa-field">
            <span className="sa-field-label-row">
              <label className="sa-field-label" htmlFor="admin-product-original-price">Giá gốc</label>
              {!isView && pct !== null && <span className="sa-discount-badge" data-testid="admin-product-discount-badge">-{pct}%</span>}
            </span>
            {isView ? (
              <ViewInput id="admin-product-original-price" testid="admin-product-original-price-input" value={originalPrice === '' ? '—' : formatMoneyVND(originalPrice)} />
            ) : (
              <>
                <MoneyInput
                  id="admin-product-original-price"
                  value={originalPrice}
                  onChange={v => { setOriginalPrice(v); setErrors(prev => clearError(prev, 'originalPrice')); }}
                  testid="admin-product-original-price-input"
                  errorId={errors.originalPrice ? 'admin-product-original-price-error' : undefined}
                  error={!!errors.originalPrice}
                />
                <FieldError id="admin-product-original-price-error" testid="admin-product-original-price-error" message={errors.originalPrice} />
              </>
            )}
          </div>
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-product-stock">Tồn kho{!isView && <Req />}</label>
            {isView ? (
              <ViewInput id="admin-product-stock" testid="admin-product-stock-input" value={stock === '' ? '—' : stock} />
            ) : (
              <>
                <span className="sa-stock-row">
                  <span className="sa-stepper">
                    <button
                      type="button"
                      className="sa-stepper-btn"
                      data-testid="admin-product-stock-minus-btn"
                      aria-label="Giảm tồn kho"
                      disabled={stockNum <= 0}
                      onPointerDown={onStockStepPointerDown(-1)}
                      onPointerUp={stopStockHold}
                      onPointerLeave={stopStockHold}
                      onPointerCancel={stopStockHold}
                      onClick={onStockStepClick(-1)}
                    >
                      −
                    </button>
                    <input
                      id="admin-product-stock"
                      className={`sa-input sa-stepper-input${errors.stock ? ' sa-input-error' : ''}`}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={stock}
                      data-testid="admin-product-stock-input"
                      aria-describedby={errors.stock ? 'admin-product-stock-error' : undefined}
                      onChange={e => { setStock(e.target.value.replace(/\D/g, '')); setErrors(prev => clearError(prev, 'stock')); }}
                      onBlur={() => validateField('stock')}
                      onKeyDown={e => {
                        if (e.key === 'ArrowUp') { e.preventDefault(); changeStock(1); }
                        else if (e.key === 'ArrowDown') { e.preventDefault(); changeStock(-1); }
                      }}
                    />
                    <button
                      type="button"
                      className="sa-stepper-btn"
                      data-testid="admin-product-stock-plus-btn"
                      aria-label="Tăng tồn kho"
                      onPointerDown={onStockStepPointerDown(1)}
                      onPointerUp={stopStockHold}
                      onPointerLeave={stopStockHold}
                      onPointerCancel={stopStockHold}
                      onClick={onStockStepClick(1)}
                    >
                      +
                    </button>
                  </span>
                  {stockStatus && (
                    <span className={`sa-stock-pill sa-stock-pill-${stockStatus.tone}`} data-testid="admin-product-stock-status">
                      <span className="sa-stock-dot" aria-hidden="true" />
                      {stockStatus.label}
                    </span>
                  )}
                </span>
                <FieldError id="admin-product-stock-error" testid="admin-product-stock-error" message={errors.stock} />
              </>
            )}
          </div>
        </div>
    </FormSection>
  );
  const statusSection = (
    <FormSection title="Trạng thái">
      <div className="sa-field">
        <span className="sa-field-label">Trạng thái</span>
        {isView ? (
          <StatusBadge
            tone={isActive ? 'green' : 'gray'}
            label={isActive ? 'Đang bán' : 'Đang ẩn'}
            testid="admin-product-status-badge"
          />
        ) : (
          <Toggle
            checked={isActive}
            onChange={setIsActive}
            testid="admin-product-status-toggle"
            label={isActive ? 'Đang bán' : 'Đã ẩn'}
          />
        )}
      </div>
    </FormSection>
  );
  const imageSection = (
    <FormSection title="Hình ảnh">
        {isView ? (
          <ViewImageGallery prefix="admin-product-image" urls={readyUrls} />
        ) : (
          <ImageUploader prefix="admin-product-image" images={images} onChange={setImages} multiple max={8} />
        )}
    </FormSection>
  );
  const descSection = (
    <FormSection title="Mô tả">
        <div className="sa-field">
          <label className="sa-field-label" htmlFor="admin-product-description">Mô tả</label>
          <textarea
            ref={descRef}
            id="admin-product-description"
            className={`sa-input sa-textarea-auto${isView ? ' sa-view-input' : ''}`}
            rows={3}
            value={isView ? orDash(description) : description}
            data-testid="admin-product-description-input"
            readOnly={isView}
            maxLength={2000}
            onChange={e => setDescription(e.target.value)}
          />
        </div>
    </FormSection>
  );
  const previewSection = !isView ? (
    <FormSection title="Xem trước" className="sa-product-preview-card">
          <div className="sa-product-preview" data-testid="admin-product-preview">
            {readyUrls[0]
              ? <img src={readyUrls[0]} alt="" className="sa-preview-img" />
              : <span className="sa-preview-img sa-preview-ph" aria-hidden="true"><ShoppingBag size={26} strokeWidth={1.8} /></span>}
            <span className="sa-preview-info">
              <strong>{name.trim() || 'Tên sản phẩm'}</strong>
              <small>{categoryName || 'Chưa chọn danh mục'}</small>
              <span className="sa-preview-price">
                <span className="sa-money">{Number.isNaN(priceNum) || priceNum <= 0 ? '—' : `${priceNum.toLocaleString('vi-VN')}đ`}</span>
                {origNum !== null && origNum > 0 && <s>{origNum.toLocaleString('vi-VN')}đ</s>}
                {pct !== null && <span className="sa-discount-badge">-{pct}%</span>}
              </span>
              <small>Tồn kho: {stock === '' ? '—' : stockNum}</small>
            </span>
          </div>
    </FormSection>
  ) : null;
  const viewMetaNode = isView ? (
    <ViewMeta prefix="admin-product" createdAt={initial.createdAt} updatedAt={initial.updatedAt} updatedBy={initial.updatedBy} />
  ) : null;
  /** Drawer: 1 cột theo thứ tự cũ (cơ bản, giá, trạng thái, hình ảnh, mô tả, xem trước). */
  const body = (
    <>
      {formErrorNode}
      {basicSection}
      {priceSection}
      {statusSection}
      {imageSection}
      {descSection}
      {previewSection}
      {viewMetaNode}
    </>
  );
  /** Trang full page (đợt 25/26): lưới 2 cột trái 1.6fr/phải 1fr — trái: thông
   *  tin cơ bản, mô tả, hình ảnh; phải: giá & tồn kho, trạng thái, xem trước
   *  (sticky, giữ nguyên nội dung preview). Dưới 960px 1 cột. */
  const pageBody = (
    <>
      {formErrorNode}
      <div className="sa-product-form-cols">
        <div className="sa-product-form-col">{basicSection}{descSection}{imageSection}</div>
        <div className="sa-product-form-col sa-product-form-col-side">{priceSection}{statusSection}{previewSection}</div>
      </div>
      {viewMetaNode}
    </>
  );

  /** Trang full page (đợt 21): header sticky chứa tiêu đề + nút Lưu/Hủy ở trên
   *  cùng, form là <form> thường (không Drawer/overlay, không FormShell). */
  if (isPage) {
    return (
      <form ref={pageFormRef} onSubmit={isView ? undefined : handleSubmit} data-testid="admin-product-form" data-form-mode={mode} noValidate className="sa-product-page-form">
        <div className="sa-product-page-head sa-page-sticky-head">
          <div className="sa-product-page-head-text">
            <h2 data-testid="admin-product-form-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="sa-product-page-head-actions">
            <FormBackButton testid="admin-product-form-back-btn" onBack={handleBack} />
            {isView ? (
              <>
                <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-product-cancel-btn" onClick={requestClose}>
                  Đóng
                </button>
                {onSwitchToEdit && (
                  <button type="button" className="sa-btn" data-testid="admin-product-edit-btn" onClick={onSwitchToEdit}>
                    Chỉnh sửa
                  </button>
                )}
              </>
            ) : (
              <>
                <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-product-cancel-btn" onClick={requestClose}>
                  Hủy
                </button>
                <button type="submit" className="sa-btn" data-testid="admin-product-save-btn" disabled={submitting || (isEdit && !dirty)}>
                  {submitting ? (<><span className="sa-btn-spinner" aria-hidden="true" /> Đang lưu...</>) : isEdit ? 'Lưu thay đổi' : 'Lưu'}
                </button>
              </>
            )}
          </div>
        </div>
        {pageBody}
      </form>
    );
  }

  return (
    <FormShell
      width={760}
      title={title}
      description={subtitle}
      testid="admin-product-form-modal"
      formTestid="admin-product-form"
      formMode={mode}
      onClose={requestClose}
      onSubmit={isView ? undefined : handleSubmit}
      footer={isView ? (
        <>
          <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-product-cancel-btn" onClick={requestClose}>
            Đóng
          </button>
          {onSwitchToEdit && (
            <button type="button" className="sa-btn" data-testid="admin-product-edit-btn" onClick={onSwitchToEdit}>
              Chỉnh sửa
            </button>
          )}
        </>
      ) : (
        <>
          <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-product-cancel-btn" onClick={requestClose}>
            Hủy
          </button>
          <button type="submit" className="sa-btn" data-testid="admin-product-save-btn" disabled={submitting || (isEdit && !dirty)}>
            {submitting ? (<><span className="sa-btn-spinner" aria-hidden="true" /> Đang lưu...</>) : isEdit ? 'Lưu thay đổi' : 'Lưu'}
          </button>
        </>
      )}
    >
      {body}
    </FormShell>
  );
}

// ============================================================================
// 2. FORM DANH MỤC — Modal max 560px (đợt 18; đợt 21 thêm variant="page"
//    cho trang full page /categories/*, nội dung form dùng chung).
// ============================================================================

export interface CategoryFormInitial {
  id: string; code: string; name: string; description: string; sortOrder: string;
  isActive: boolean; slug: string; iconUrl: string;
  /** Chế độ xem: hiện ở khối "Lịch sử" cuối form (chỉ khi có dữ liệu). */
  createdAt?: string; updatedAt?: string; updatedBy?: string;
}

export interface CategorySavePayload {
  id: string; code: string; name: string; description: string; sortOrder: number;
  isActive: boolean; slug: string; iconUrl: string;
}

const CATEGORY_ERROR_TESTID: Record<string, string> = {
  code: 'admin-category-code-input',
  name: 'admin-category-name-input',
  slug: 'admin-category-slug-input',
};

export function CategoryForm({ initial, onSave, onRequestClose, mode: modeProp, onSwitchToEdit, variant }: {
  initial: CategoryFormInitial;
  onSave: (payload: CategorySavePayload) => Promise<FormSaveResult>;
  onRequestClose: (dirty: boolean) => void;
  mode?: FormMode;
  onSwitchToEdit?: () => void;
  /** Đợt 21 — 'drawer' (FormShell 680px, đợt 18, mặc định) và 'page' (trang
   *  full page: header sticky có nút Lưu/Hủy ở trên cùng, KHÔNG Drawer).
   *  Nội dung form (trường + validate + upload) dùng chung. */
  variant?: 'drawer' | 'page';
}) {
  const isPage = variant === 'page';
  const isEdit = initial.id !== '';
  const mode: FormMode = modeProp ?? (isEdit ? 'edit' : 'create');
  const isView = mode === 'view';
  const [code, setCode] = useState(initial.code);
  const [name, setName] = useState(initial.name);
  // Khi sửa: giữ slug hiện có, không tự sinh đè. Khi tạo: tự sinh từ tên
  // cho tới khi người dùng sửa slug tay thì dừng.
  const [slug, setSlug] = useState(initial.slug);
  const [slugEdited, setSlugEdited] = useState(initial.id !== '');
  const [description, setDescription] = useState(initial.description);
  const [sortOrder, setSortOrder] = useState(initial.sortOrder);
  const [isActive, setIsActive] = useState(initial.isActive);
  const [images, setImages] = useState<UploadImageItem[]>(() =>
    initial.iconUrl ? [imageItemFromUrl(initial.iconUrl)] : []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const iconUrl = images.filter(i => i.status === 'ready' && i.url).map(i => i.url)[0] ?? '';
  const dirty = isView ? false :
    code !== initial.code || name !== initial.name || slug !== initial.slug || description !== initial.description ||
    sortOrder !== initial.sortOrder || isActive !== initial.isActive || iconUrl !== initial.iconUrl;

  const validateAll = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    const codeErr = validateEntityCode(code.trim().toUpperCase(), 'danh mục');
    if (codeErr) errs.code = codeErr;
    const n = name.trim();
    if (n.length === 0) errs.name = REQUIRED_MSG;
    else if (n.length < 2 || n.length > 150) errs.name = 'Tên danh mục phải có từ 2 đến 150 ký tự.';
    if (slug !== '' && !/^[a-z0-9-]+$/.test(slug)) errs.slug = 'Slug chỉ gồm chữ thường, số và gạch ngang.';
    return errs;
  };

  const validateField = (field: string) => {
    const errs = validateAll();
    setErrors(prev => {
      const next = { ...prev };
      if (errs[field]) next[field] = errs[field];
      else delete next[field];
      return next;
    });
  };

  /** Áp lỗi server đã map field (vd trùng mã) xuống errors + toast cảnh báo + focus ô lỗi đầu. */
  const applyServerFieldErrors = (fieldErrors: Record<string, string>) => {
    setErrors(prev => ({ ...prev, ...fieldErrors }));
    notifyDuplicate('category', fieldErrors);
    focusFirstError('admin-category-form', fieldErrors,
      ['code', 'name', 'slug'], CATEGORY_ERROR_TESTID);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const errs = validateAll();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      focusFirstError('admin-category-form', errs, ['code', 'name', 'slug'], CATEGORY_ERROR_TESTID);
      return;
    }
    setSubmitting(true);
    const res = await onSave({
      id: initial.id,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description,
      sortOrder: Number(sortOrder) || 0,
      isActive,
      slug: slug.trim(),
      iconUrl,
    });
    setSubmitting(false);
    if (!res.ok) {
      if (res.fieldErrors && Object.keys(res.fieldErrors).length > 0) applyServerFieldErrors(res.fieldErrors);
      else setFormError(res.error || 'Không lưu được danh mục.');
      return;
    }
    const displayName = shortName(name.trim());
    if (isEdit) {
      notify.success(messages.toast.category.updated.title, fmt(messages.toast.category.updated.desc, { tên: displayName }));
    } else {
      notify.success(messages.toast.category.added.title, fmt(messages.toast.category.added.desc, { tên: displayName }));
    }
  };

  const requestClose = () => void requestDiscardConfirm(dirty, onRequestClose);
  const handleBack = () => goBackOrClose(dirty, onRequestClose);
  /** Đợt 21 — trang full page không có FormShell nên tự lo autofocus ô đầu
   *  + ESC (FormShell làm việc này ở Drawer): ESC khi chưa sửa thì đóng ngay,
   *  đã sửa thì hỏi "Hủy các thay đổi?" qua requestClose. requestCloseRef
   *  tránh closure cũ (dirty) trong listener đăng ký 1 lần khi mount. */
  const pageFormRef = useRef<HTMLFormElement>(null);
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  useEffect(() => {
    if (!isPage) return;
    const first = pageFormRef.current?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); requestCloseRef.current(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPage]);
  const title = isPage
    ? (isView ? `Chi tiết danh mục ${code || name}` : isEdit ? 'Chỉnh sửa danh mục' : 'Thêm mới danh mục')
    : (isView ? 'Chi tiết danh mục' : isEdit ? 'Chỉnh sửa danh mục' : 'Thêm danh mục');
  /** Đợt 26: bỏ subtitle — tiêu đề đã đủ thông tin ("Thêm danh mục mới cho
   *  sàn." / "Chỉnh sửa thông tin danh mục." / "Xem thông tin danh mục."). */
  const subtitle: string | undefined = undefined;

  /** Nút footer dùng chung cho cả 2 variant (Drawer + trang full page):
   *  Drawer đặt ở footer FormShell, trang full page đặt ở header sticky. */
  const footer = isView ? (
    <>
      <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-category-cancel-btn" onClick={requestClose}>
        Đóng
      </button>
      {onSwitchToEdit && (
        <button type="button" className="sa-btn" data-testid="admin-category-edit-btn" onClick={onSwitchToEdit}>
          Chỉnh sửa
        </button>
      )}
    </>
  ) : (
    <>
      <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-category-cancel-btn" onClick={requestClose}>
        Hủy
      </button>
      <button type="submit" className="sa-btn" data-testid="admin-category-save-btn" disabled={submitting || (isEdit && !dirty)}>
        {submitting ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Lưu'}
      </button>
    </>
  );

  /** Nội dung form dùng chung cho cả 2 variant (đợt 21): Drawer (FormShell)
   *  và trang full page (form thường + header sticky). Chỉ khác cách bọc ngoài. */
  const body = (
    <>
      {formError && <p className="sa-error" role="alert">{formError}</p>}
      <FormSection title="Thông tin cơ bản">
        <div className="sa-form-grid">
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-category-code">Mã DM</label>
            {isView ? (
              <ViewInput id="admin-category-code" testid="admin-category-code-input" value={orDash(code)} />
            ) : (
              <>
                <input
                  id="admin-category-code"
                  className={`sa-input${errors.code ? ' sa-input-error' : ''}`}
                  value={code}
                  data-testid="admin-category-code-input"
                  aria-describedby={errors.code ? 'admin-category-code-error' : undefined}
                  disabled={isEdit}
                  placeholder="Để trống để tự sinh (DM-xxxx)"
                  maxLength={20}
                  title={isEdit ? 'Mã danh mục không thay đổi khi sửa' : undefined}
                  onChange={e => { setCode(e.target.value.toUpperCase()); setErrors(prev => clearError(prev, 'code')); }}
                  onBlur={() => validateField('code')}
                />
                <FieldError id="admin-category-code-error" testid="admin-category-code-error" message={errors.code} />
              </>
            )}
          </div>
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-category-name">Tên danh mục{!isView && <Req />}</label>
            {isView ? (
              <ViewInput id="admin-category-name" testid="admin-category-name-input" value={orDash(name)} />
            ) : (
              <>
                <input
                  id="admin-category-name"
                  className={`sa-input${errors.name ? ' sa-input-error' : ''}`}
                  value={name}
                  data-testid="admin-category-name-input"
                  aria-describedby={errors.name ? 'admin-category-name-error' : undefined}
                  maxLength={150}
                  onChange={e => {
                    const v = e.target.value;
                    setName(v);
                    setErrors(prev => clearError(prev, 'name'));
                    if (!slugEdited) setSlug(slugify(v));
                  }}
                  onBlur={() => validateField('name')}
                />
                <FieldError id="admin-category-name-error" testid="admin-category-name-error" message={errors.name} />
              </>
            )}
          </div>
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-category-slug">Slug</label>
            {isView ? (
              <ViewInput id="admin-category-slug" testid="admin-category-slug-input" value={orDash(slug)} />
            ) : (
              <>
                <input
                  id="admin-category-slug"
                  className={`sa-input${errors.slug ? ' sa-input-error' : ''}${isEdit ? ' sa-view-input' : ''}`}
                  value={slug}
                  data-testid="admin-category-slug-input"
                  aria-describedby={errors.slug ? 'admin-category-slug-error' : undefined}
                  readOnly={isEdit}
                  title={isEdit ? 'Slug không thay đổi khi sửa' : undefined}
                  onChange={e => { setSlug(e.target.value); setSlugEdited(true); setErrors(prev => clearError(prev, 'slug')); }}
                  onBlur={() => validateField('slug')}
                />
                <FieldError id="admin-category-slug-error" testid="admin-category-slug-error" message={errors.slug} />
              </>
            )}
          </div>
          <div className="sa-field sa-field-wide">
            <label className="sa-field-label" htmlFor="admin-category-description">Mô tả</label>
            {isView ? (
              <ViewInput id="admin-category-description" testid="admin-category-description-input" value={orDash(description)} />
            ) : (
              <input
                id="admin-category-description"
                className="sa-input"
                value={description}
                data-testid="admin-category-description-input"
                onChange={e => setDescription(e.target.value)}
              />
            )}
          </div>
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-category-sort-order">Thứ tự sắp xếp</label>
            {isView ? (
              <ViewInput id="admin-category-sort-order" testid="admin-category-sort-order-input" value={sortOrder === '' ? '—' : sortOrder} />
            ) : (
              <>
                <input
                  id="admin-category-sort-order"
                  className="sa-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={sortOrder}
                  data-testid="admin-category-sort-order-input"
                  onChange={e => setSortOrder(e.target.value.replace(/[^0-9]/g, ''))}
                />
              </>
            )}
          </div>
          <div className="sa-field">
            <span className="sa-field-label">Trạng thái</span>
            {isView ? (
              <StatusBadge
                tone={isActive ? 'green' : 'gray'}
                label={isActive ? 'Hiển thị' : 'Đang ẩn'}
                testid="admin-category-status-badge"
              />
            ) : (
              <Toggle
                checked={isActive}
                onChange={setIsActive}
                testid="admin-category-status-toggle"
                label={isActive ? 'Hiển thị' : 'Đang ẩn'}
              />
            )}
          </div>
        </div>
      </FormSection>
      <FormSection title="Hình ảnh">
        {isView ? (
          <ViewImageGallery prefix="admin-category-image" urls={iconUrl ? [iconUrl] : []} />
        ) : (
          <ImageUploader prefix="admin-category-image" images={images} onChange={setImages} multiple={false} max={1} />
        )}
      </FormSection>
      {isView && (
        <ViewMeta prefix="admin-category" createdAt={initial.createdAt} updatedAt={initial.updatedAt} updatedBy={initial.updatedBy} />
      )}
    </>
  );

  /** Trang full page (đợt 21): header sticky chứa tiêu đề + nút Lưu/Hủy ở trên
   *  cùng, form là <form> thường (không Drawer/overlay, không FormShell). */
  if (isPage) {
    return (
      <form ref={pageFormRef} onSubmit={isView ? undefined : handleSubmit} data-testid="admin-category-form" data-form-mode={mode} noValidate className="sa-promo-page-form">
        <div className="sa-promo-page-head sa-page-sticky-head">
          <div className="sa-promo-page-head-text">
            <h2 data-testid="admin-category-form-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="sa-promo-page-head-actions">
            <FormBackButton testid="admin-category-form-back-btn" onBack={handleBack} />
            {footer}
          </div>
        </div>
        {body}
      </form>
    );
  }

  return (
    <FormShell
      width={680}
      title={title}
      description={subtitle}
      testid="admin-category-form-modal"
      formTestid="admin-category-form"
      formMode={mode}
      onClose={requestClose}
      onSubmit={isView ? undefined : handleSubmit}
      footer={footer}
    >
      {body}
    </FormShell>
  );
}

// ============================================================================
// 3. FORM KHUYẾN MÃI — Modal max 560px (đợt 18; KHÔNG có field ảnh:
//    backend không có entity nào chứa ảnh khuyến mãi)
// ============================================================================

export interface PromoFormInitial {
  id: string; code: string; description: string; discountType: string; discountValue: string;
  minOrderAmount: string; maxDiscountAmount: string; startDate: string; expiryDate: string;
  maxUses: string; maxUsesPerUser: string; minTier: string; scopeType: string;
  scopeCategoryId: string; scopeProductIds: string;
  /** Chế độ xem: nhãn trạng thái (vd "Nháp", "Đang chạy") + khối "Lịch sử". */
  statusLabel?: string;
  createdAt?: string; updatedAt?: string; updatedBy?: string;
}

export interface PromoSavePayload extends PromoFormInitial {
  /** Chỉ ở chế độ tạo: kích hoạt ngay sau khi tạo thành công. */
  activateNow: boolean;
}

const PROMO_ERROR_TESTID: Record<string, string> = {
  code: 'admin-promo-code-input',
  discountValue: 'admin-promo-value-input',
  minOrderAmount: 'admin-promo-min-order-input',
  maxDiscountAmount: 'admin-promo-max-discount-input',
  maxUses: 'admin-promo-max-uses-input',
  startDate: 'admin-promo-start-input',
  expiryDate: 'admin-promo-expiry-input',
  scope: 'admin-promo-code-input',
};

/** Ngày kết thúc ở form là <input type="date"> nên chỉ lấy phần YYYY-MM-DD. */
const toDateOnly = (s: string) => (s && s.includes('T') ? s.slice(0, 10) : s);

export const DISCOUNT_TYPE_LABEL: Record<string, string> = {
  Fixed: 'Cố định',
  Percentage: 'Phần trăm',
  FreeShip: 'Miễn phí ship',
};

/** Đợt 21 — PromoForm có 2 cách hiển thị: 'drawer' (FormShell 680px, đợt 18,
 *  giữ nguyên cho tương thích) và 'page' (trang full page: header sticky có
 *  nút Lưu/Hủy ở trên cùng, section/card, radio card chọn loại giảm, KHÔNG
 *  nút "Tạo mã ngẫu nhiên", KHÔNG dòng hướng dẫn dưới textbox, KHÔNG toggle
 *  "Kích hoạt ngay sau khi tạo"). Chỉ module Khuyến mãi dùng variant page;
 *  SP/Danh mục/Khách hàng vẫn Drawer. */
export function PromoForm({ initial, categories, onSave, onRequestClose, mode: modeProp, onSwitchToEdit, variant }: {
  initial: PromoFormInitial;
  categories: Array<{ id: string; name: string }>;
  onSave: (payload: PromoSavePayload) => Promise<FormSaveResult>;
  onRequestClose: (dirty: boolean) => void;
  mode?: FormMode;
  onSwitchToEdit?: () => void;
  variant?: 'drawer' | 'page';
}) {
  const isPage = variant === 'page';
  const normInitial: PromoFormInitial = { ...initial, expiryDate: toDateOnly(initial.expiryDate) };
  const isEdit = normInitial.id !== '';
  const mode: FormMode = modeProp ?? (isEdit ? 'edit' : 'create');
  const isView = mode === 'view';
  const [code, setCode] = useState(normInitial.code);
  const [description, setDescription] = useState(normInitial.description);
  const [discountType, setDiscountType] = useState(normInitial.discountType);
  const [discountValue, setDiscountValue] = useState(normInitial.discountValue);
  const [minOrderAmount, setMinOrderAmount] = useState(normInitial.minOrderAmount.replace(/\D/g, ''));
  const [maxDiscountAmount, setMaxDiscountAmount] = useState(normInitial.maxDiscountAmount.replace(/\D/g, ''));
  const [startDate, setStartDate] = useState(normInitial.startDate);
  const [expiryDate, setExpiryDate] = useState(normInitial.expiryDate);
  const [maxUses, setMaxUses] = useState(normInitial.maxUses);
  const [maxUsesPerUser, setMaxUsesPerUser] = useState(normInitial.maxUsesPerUser);
  const [minTier, setMinTier] = useState(normInitial.minTier);
  const [scopeType, setScopeType] = useState(normInitial.scopeType);
  const [scopeCategoryId, setScopeCategoryId] = useState(normInitial.scopeCategoryId);
  const [scopeProductIds, setScopeProductIds] = useState(normInitial.scopeProductIds);
  const [activateNow, setActivateNow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dirty = isView ? false :
    code !== normInitial.code || description !== normInitial.description ||
    discountType !== normInitial.discountType || discountValue !== normInitial.discountValue ||
    minOrderAmount !== normInitial.minOrderAmount.replace(/\D/g, '') ||
    maxDiscountAmount !== normInitial.maxDiscountAmount.replace(/\D/g, '') ||
    startDate !== normInitial.startDate || expiryDate !== normInitial.expiryDate ||
    maxUses !== normInitial.maxUses || maxUsesPerUser !== normInitial.maxUsesPerUser ||
    minTier !== normInitial.minTier || scopeType !== normInitial.scopeType ||
    scopeCategoryId !== normInitial.scopeCategoryId || scopeProductIds !== normInitial.scopeProductIds ||
    activateNow;

  /** Validate khi lưu (đợt 21): lỗi hiện NGAY DƯỚI trường tương ứng + border đỏ.
   *  FreeShip ĐÃ CHỐT theo spec đợt 21: KHÔNG yêu cầu nhập giá trị (0 được phép)
   *  — chỉ Fixed/Percentage bắt buộc giá trị > 0 (Percentage ≤ 100). Trước đây
   *  validateAll bắt giá trị > 0 với MỌI loại giảm nên FreeShip luôn lỗi
   *  (điểm [CẦN XÁC MINH] cũ, nay đã chốt). Chế độ sửa cũng validate đầy đủ
   *  giá trị/trần/lượt/ngày như chế độ tạo (trước đây sửa chỉ kiểm đơn tối thiểu).
   *  So ngày theo phần YYYY-MM-DD: hết hạn phải SAU ngày bắt đầu. */
  const validateAll = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!discountType) errs.discountValue = REQUIRED_MSG;
    else if (discountType !== 'FreeShip') {
      const dv = Number(discountValue);
      if (discountValue.trim() === '') errs.discountValue = REQUIRED_MSG;
      else if (!(dv > 0) || (discountType === 'Percentage' && dv > 100)) {
        errs.discountValue = 'Giá trị giảm không hợp lệ (giảm % tối đa 100).';
      }
    }
    const minOrder = Number(minOrderAmount) || 0;
    if (minOrder < 0) errs.minOrderAmount = 'Đơn tối thiểu không được âm.';
    if (maxDiscountAmount.trim() !== '') {
      const md = Number(maxDiscountAmount);
      if (Number.isNaN(md) || md < 0) errs.maxDiscountAmount = 'Giảm tối đa không được âm.';
    }
    if (maxUses.trim() !== '') {
      const mu = Number(maxUses);
      if (!Number.isInteger(mu) || mu <= 0) errs.maxUses = 'Số lượt dùng tối đa phải là số nguyên dương.';
    }
    const startDay = startDate ? startDate.slice(0, 10) : '';
    const expiryDay = expiryDate ? expiryDate.slice(0, 10) : '';
    if (startDay && expiryDay && expiryDay <= startDay) {
      errs.expiryDate = 'Ngày hết hạn phải sau ngày bắt đầu.';
    }
    if (isEdit) return errs;
    const c = code.trim().toUpperCase();
    if (c === '') errs.code = REQUIRED_MSG;
    else if (!/^[A-Za-z0-9_-]{3,50}$/.test(c)) errs.code = 'Mã chỉ gồm chữ, số, gạch ngang/gạch dưới, từ 3 đến 50 ký tự.';
    if (scopeType === 'Category' && !scopeCategoryId) errs.scope = 'Voucher theo danh mục phải chọn danh mục.';
    if (scopeType === 'Product' && !scopeProductIds.trim()) errs.scope = 'Voucher theo sản phẩm phải chọn ít nhất 1 sản phẩm (nhập ID, cách nhau bằng dấu phẩy).';
    return errs;
  };

  const validateField = (field: string) => {
    const errs = validateAll();
    setErrors(prev => {
      const next = { ...prev };
      if (errs[field]) next[field] = errs[field];
      else delete next[field];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const errs = validateAll();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      focusFirstError('admin-promo-form', errs,
        ['code', 'discountValue', 'minOrderAmount', 'maxDiscountAmount', 'maxUses', 'startDate', 'expiryDate', 'scope'], PROMO_ERROR_TESTID);
      return;
    }
    setSubmitting(true);
    const res = await onSave({
      id: normInitial.id,
      code: code.trim().toUpperCase(),
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      startDate,
      expiryDate,
      maxUses,
      maxUsesPerUser,
      minTier,
      scopeType,
      scopeCategoryId,
      scopeProductIds,
      // Đợt 21: trang full page KHÔNG tự kích hoạt sau khi tạo (tạo mới mặc định
      // Nháp) — activateNow luôn false ở variant page; Drawer cũ giữ toggle.
      activateNow: isPage ? false : (!isEdit && activateNow),
    });
    setSubmitting(false);
    if (!res.ok) {
      if (res.fieldErrors && Object.keys(res.fieldErrors).length > 0) {
        setErrors(prev => ({ ...prev, ...res.fieldErrors }));
        notifyDuplicate('promo', res.fieldErrors);
        focusFirstError('admin-promo-form', res.fieldErrors,
          ['code', 'discountValue', 'minOrderAmount', 'maxDiscountAmount', 'maxUses', 'startDate', 'expiryDate', 'scope'], PROMO_ERROR_TESTID);
      } else setFormError(res.error || 'Không lưu được khuyến mãi.');
      return;
    }
    const displayCode = code.trim().toUpperCase();
    if (isEdit) {
      notify.success(messages.toast.promo.updated.title, fmt(messages.toast.promo.updated.desc, { mã: displayCode }));
    } else {
      notify.success(messages.toast.promo.added.title, fmt(messages.toast.promo.added.desc, { mã: displayCode }));
    }
  };

  const requestClose = () => void requestDiscardConfirm(dirty, onRequestClose);
  const handleBack = () => goBackOrClose(dirty, onRequestClose);
  /** Đợt 21 — tiêu đề trang full page theo spec (ghi đè tiêu đề Drawer chỉ ở variant page). */
  const title = isPage
    ? (isView ? `Chi tiết khuyến mãi ${normInitial.code}` : isEdit ? 'Chỉnh sửa khuyến mãi' : 'Thêm mới khuyến mãi')
    : (isView ? `Chi tiết khuyến mãi ${normInitial.code}` : isEdit ? `Chỉnh sửa khuyến mãi ${normInitial.code}` : 'Tạo khuyến mãi mới');
  /** Đợt 26: chỉ giữ subtitle khi mang thông tin thật — ở chế độ sửa, ghi rõ
   *  trường nào sửa được (mã/loại giảm/phạm vi không đổi). Các subtitle còn
   *  lại ("Tạo ở trạng thái Nháp — bấm Kích hoạt để chạy", "Thiết lập thông
   *  tin...", "Xem thông tin khuyến mãi.") đã bỏ. */
  const subtitle: string | undefined = !isView && isEdit
    ? 'Voucher Nháp: chỉ sửa được mô tả, giá trị giảm, đơn tối thiểu, trần giảm, ngày kết thúc và tổng lượt. Mã, loại giảm và phạm vi không đổi.'
    : undefined;

  /** Radio card chọn loại giảm (đợt 24 — dùng chung cả 2 variant page/drawer,
   *  thay segmented đợt 18 + radio card ngang đợt 21): bấm cả card để chọn;
   *  card chọn viền xanh lá #166534 + nền #ecf8ef + ring 3px xanh nhạt, icon
   *  đổi sang nền xanh đậm chữ trắng, radio tô đầy. testid/role/aria-checked
   *  giữ nguyên — test Vitest/Selenium phụ thuộc vào chúng. */
  const discountTypeCard = (type: string, testid: string, label: string, desc: string, icon: React.ReactNode) => (
    <button
      key={type}
      type="button"
      role="radio"
      aria-checked={discountType === type}
      data-testid={testid}
      className={`pv-type-card${discountType === type ? ' pv-type-card-selected' : ''}`}
      disabled={isEdit}
      onClick={() => setDiscountType(type)}
    >
      <span className="pv-type-top" aria-hidden="true">
        <span className="pv-type-icon">{icon}</span>
        <span className="pv-type-radio" />
      </span>
      <span className="pv-type-name">{label}</span>
      <span className="pv-type-desc">{desc}</span>
    </button>
  );

  /** Điều hướng radiogroup loại giảm bằng phím mũi tên (đợt 24): Trái/Lên =
   *  loại trước, Phải/Xuống = loại sau, quay vòng; focus đi theo lựa chọn.
   *  Chế độ sửa khóa loại giảm (disabled) nên không đổi. */
  const onDiscountTypeKeyDown = (e: React.KeyboardEvent) => {
    if (isEdit) return;
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const order = ['Fixed', 'Percentage', 'FreeShip'];
    const testidOf: Record<string, string> = {
      Fixed: 'admin-promo-discount-type-fixed',
      Percentage: 'admin-promo-discount-type-percent',
      FreeShip: 'admin-promo-discount-type-freeship',
    };
    const dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
    const next = order[(order.indexOf(discountType) + dir + order.length) % order.length];
    setDiscountType(next);
    const group = e.currentTarget as HTMLElement;
    group.querySelector<HTMLElement>(`[data-testid="${testidOf[next]}"]`)?.focus();
  };

  /** Đợt 24 — dải xem trước mức giảm (chỉ hiển thị, KHÔNG đổi state/validate):
   *  tính từ state đang nhập, cập nhật realtime. Quy tắc chốt:
   *  - Đơn tối thiểu 0/trống -> "cho mọi đơn hàng" (không hiện "cho đơn từ 0₫").
   *  - Phần trăm: không có giảm tối đa -> bỏ phần "(tối đa …)".
   *  - FreeShip chỉ cần đơn tối thiểu; chưa có giá trị giảm hợp lệ (Fixed/
   *    Percentage trống, = 0, % > 100, hoặc chưa chọn loại) -> câu muted
   *    "Nhập mức giảm để xem trước". */
  const dvDigits = discountValue.replace(/\D/g, '');
  const dvNum = dvDigits === '' ? NaN : Number(dvDigits);
  const minDigits = minOrderAmount.replace(/\D/g, '');
  const minNum = minDigits === '' ? 0 : Number(minDigits);
  const maxDigits = maxDiscountAmount.replace(/\D/g, '');
  const maxNum = maxDigits === '' ? 0 : Number(maxDigits);
  const minPart = minNum > 0 ? (<>đơn từ <strong>{formatMoneyVND(minDigits)}</strong></>) : 'mọi đơn hàng';
  let previewMuted = true;
  let previewContent: React.ReactNode = 'Nhập mức giảm để xem trước';
  if (discountType === 'Fixed' && dvNum > 0) {
    previewMuted = false;
    previewContent = (<>Giảm <strong>{formatMoneyVND(dvDigits)}</strong> cho {minPart}</>);
  } else if (discountType === 'Percentage' && dvNum >= 1 && dvNum <= 100) {
    previewMuted = false;
    previewContent = (
      <>Giảm <strong>{dvNum}%</strong>{maxNum > 0 ? (<> (tối đa <strong>{formatMoneyVND(maxDigits)}</strong>)</>) : null} cho {minPart}</>
    );
  } else if (discountType === 'FreeShip') {
    previewMuted = false;
    previewContent = (<>Miễn phí vận chuyển cho {minPart}</>);
  }

  /** Nội dung form dùng chung cho cả 2 variant (đợt 21): Drawer (FormShell) và
   *  trang full page (form thường + header sticky). Chỉ khác cách bọc ngoài. */
  const body = (
    <>
      {formError && <p className="sa-error" role="alert">{formError}</p>}
      {!isView && errors.scope && <p className="sa-error" role="alert">{errors.scope}</p>}
      <FormSection title="Thông tin cơ bản">
        <div className="sa-form-grid">
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-promo-code">Mã{!isView && <Req />}</label>
            {isView ? (
              <ViewInput id="admin-promo-code" testid="admin-promo-code-input" value={orDash(code)} />
            ) : (
              <>
                <span className="sa-code-row">
                  <input
                    id="admin-promo-code"
                    className={`sa-input${errors.code ? ' sa-input-error' : ''}`}
                    value={code}
                    data-testid="admin-promo-code-input"
                    aria-describedby={errors.code ? 'admin-promo-code-error' : undefined}
                    disabled={isEdit}
                    maxLength={50}
                    onChange={e => { setCode(e.target.value.toUpperCase()); setErrors(prev => clearError(prev, 'code')); }}
                    onBlur={() => validateField('code')}
                  />
                  {!isPage && !isEdit && (
                    <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-promo-generate-code-btn" onClick={() => setCode(randomPromoCode())}>
                      Tạo mã ngẫu nhiên
                    </button>
                  )}
                </span>
                <FieldError id="admin-promo-code-error" testid="admin-promo-code-error" message={errors.code} />
              </>
            )}
          </div>
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-promo-description">Mô tả</label>
            {isView ? (
              <ViewInput id="admin-promo-description" testid="admin-promo-description-input" value={orDash(description)} />
            ) : (
              <input
                id="admin-promo-description"
                className="sa-input"
                value={description}
                data-testid="admin-promo-description-input"
                onChange={e => setDescription(e.target.value)}
              />
            )}
          </div>
          {isView && normInitial.statusLabel && (
            <div className="sa-field">
              <span className="sa-field-label">Trạng thái</span>
              <StatusBadge tone="blue" label={normInitial.statusLabel} testid="admin-promo-status-badge" />
            </div>
          )}
        </div>
      </FormSection>
      <FormSection title="Giá trị giảm" className="pv-card">
        {isView ? (
          <div className="sa-form-grid">
            <div className="sa-field">
              <span className="sa-field-label">Loại giảm</span>
              <ViewInput id="admin-promo-discount-type" testid="admin-promo-discount-type-value" value={DISCOUNT_TYPE_LABEL[discountType] ?? discountType} />
            </div>
            <div className="sa-field">
              <label className="sa-field-label" htmlFor="admin-promo-value">Giá trị giảm</label>
              <ViewInput
                id="admin-promo-value"
                testid="admin-promo-value-input"
                value={discountValue.trim() === '' ? '—' : discountType === 'Percentage' ? `${discountValue.replace(/\D/g, '')}%` : formatMoneyVND(discountValue)}
              />
            </div>
            <div className="sa-field">
              <label className="sa-field-label" htmlFor="admin-promo-min-order">Đơn tối thiểu</label>
              <ViewInput id="admin-promo-min-order" testid="admin-promo-min-order-input" value={minOrderAmount === '' ? '—' : formatMoneyVND(minOrderAmount)} />
            </div>
            {discountType === 'Percentage' && (
              <div className="sa-field">
                <label className="sa-field-label" htmlFor="admin-promo-max-discount">Giảm tối đa</label>
                <ViewInput id="admin-promo-max-discount" testid="admin-promo-max-discount-input" value={maxDiscountAmount === '' ? '—' : formatMoneyVND(maxDiscountAmount)} />
              </div>
            )}
            <div className="sa-field">
              <label className="sa-field-label" htmlFor="admin-promo-max-uses">Số lượt dùng tối đa</label>
              <ViewInput id="admin-promo-max-uses" testid="admin-promo-max-uses-input" value={maxUses.trim() === '' ? '—' : maxUses.replace(/\D/g, '')} />
            </div>
          </div>
        ) : (
          <div className="pv-body">
            <div className="pv-step">
              <span className="sa-field-label pv-step-title" id="admin-promo-discount-type-label">Loại giảm<Req /></span>
              <span className="pv-type-grid" role="radiogroup" aria-labelledby="admin-promo-discount-type-label" onKeyDown={onDiscountTypeKeyDown}>
                {discountTypeCard('Fixed', 'admin-promo-discount-type-fixed', 'Cố định', 'Giảm một số tiền cụ thể trên đơn hàng', <Banknote size={20} strokeWidth={2} aria-hidden="true" />)}
                {discountTypeCard('Percentage', 'admin-promo-discount-type-percent', 'Phần trăm', 'Giảm theo tỷ lệ % trên giá trị đơn hàng', <Percent size={20} strokeWidth={2} aria-hidden="true" />)}
                {discountTypeCard('FreeShip', 'admin-promo-discount-type-freeship', 'Miễn phí ship', 'Miễn phí vận chuyển cho đơn hàng', <Truck size={20} strokeWidth={2} aria-hidden="true" />)}
              </span>
            </div>
            <div className="pv-step-divider" aria-hidden="true" />
            <div className="pv-step">
              <span className="sa-field-label pv-step-title">Mức giảm</span>
              <div className="pv-amounts" key={discountType}>
                <div className="pv-amounts-grid">
                  <div className={`sa-field pv-field${errors.discountValue ? ' pv-field-error' : ''}`}>
                    <label className="sa-field-label" htmlFor="admin-promo-value">Giá trị giảm{discountType !== 'FreeShip' && <Req />}</label>
                    {discountType === 'Percentage' ? (
                      <>
                        <span className="sa-money-wrap">
                          <input
                            id="admin-promo-value"
                            className={`sa-input sa-money-input${errors.discountValue ? ' sa-input-error' : ''}`}
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={discountValue.replace(/\D/g, '')}
                            data-testid="admin-promo-value-input"
                            aria-describedby={errors.discountValue ? 'admin-promo-value-error' : undefined}
                            onChange={e => { setDiscountValue(e.target.value.replace(/\D/g, '')); setErrors(prev => clearError(prev, 'discountValue')); }}
                            onBlur={() => validateField('discountValue')}
                          />
                          <span className="sa-money-suffix" aria-hidden="true">%</span>
                        </span>
                        <FieldError id="admin-promo-value-error" testid="admin-promo-value-error" message={errors.discountValue} />
                      </>
                    ) : discountType === 'FreeShip' ? null : (
                      <>
                        <MoneyInput
                          id="admin-promo-value"
                          value={discountValue.replace(/\D/g, '')}
                          onChange={v => { setDiscountValue(v); setErrors(prev => clearError(prev, 'discountValue')); }}
                          testid="admin-promo-value-input"
                          errorId={errors.discountValue ? 'admin-promo-value-error' : undefined}
                          error={!!errors.discountValue}
                        />
                        <FieldError id="admin-promo-value-error" testid="admin-promo-value-error" message={errors.discountValue} />
                      </>
                    )}
                  </div>
                  <div className={`sa-field pv-field${errors.minOrderAmount ? ' pv-field-error' : ''}`}>
                    <label className="sa-field-label" htmlFor="admin-promo-min-order">Đơn tối thiểu</label>
                    <MoneyInput
                      id="admin-promo-min-order"
                      value={minOrderAmount}
                      onChange={v => { setMinOrderAmount(v); setErrors(prev => clearError(prev, 'minOrderAmount')); }}
                      testid="admin-promo-min-order-input"
                      errorId={errors.minOrderAmount ? 'admin-promo-min-order-error' : undefined}
                      error={!!errors.minOrderAmount}
                    />
                    <FieldError id="admin-promo-min-order-error" testid="admin-promo-min-order-error" message={errors.minOrderAmount} />
                  </div>
                  {discountType === 'Percentage' && (
                    <div className={`sa-field pv-field${errors.maxDiscountAmount ? ' pv-field-error' : ''}`}>
                      <label className="sa-field-label" htmlFor="admin-promo-max-discount">Giảm tối đa</label>
                      <MoneyInput
                        id="admin-promo-max-discount"
                        value={maxDiscountAmount}
                        onChange={v => { setMaxDiscountAmount(v); setErrors(prev => clearError(prev, 'maxDiscountAmount')); }}
                        testid="admin-promo-max-discount-input"
                        errorId={errors.maxDiscountAmount ? 'admin-promo-max-discount-error' : undefined}
                        error={!!errors.maxDiscountAmount}
                      />
                      <FieldError id="admin-promo-max-discount-error" testid="admin-promo-max-discount-error" message={errors.maxDiscountAmount} />
                    </div>
                  )}
                </div>
                <div className="pv-maxuses-row">
                  <div className="sa-field pv-field">
                    <label className="sa-field-label" htmlFor="admin-promo-max-uses">Số lượt dùng tối đa</label>
                    <input
                      id="admin-promo-max-uses"
                      className={`sa-input${errors.maxUses ? ' sa-input-error' : ''}`}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={maxUses.replace(/\D/g, '')}
                      data-testid="admin-promo-max-uses-input"
                      aria-describedby={errors.maxUses ? 'admin-promo-max-uses-error' : undefined}
                      onChange={e => { setMaxUses(e.target.value.replace(/\D/g, '')); setErrors(prev => clearError(prev, 'maxUses')); }}
                      onBlur={() => validateField('maxUses')}
                    />
                    <FieldError id="admin-promo-max-uses-error" testid="admin-promo-max-uses-error" message={errors.maxUses} />
                  </div>
                </div>
              </div>
            </div>
            <p className={`pv-preview${previewMuted ? ' pv-preview-muted' : ''}`} data-testid="admin-promo-value-preview" role="status" aria-live="polite">
              <Sparkles size={18} strokeWidth={2} aria-hidden="true" />
              <span>{previewContent}</span>
            </p>
          </div>
        )}
      </FormSection>
      <FormSection title="Thời gian & phạm vi">
        <div className="sa-form-grid">
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-promo-start">Ngày bắt đầu</label>
            {isView ? (
              <ViewInput id="admin-promo-start" testid="admin-promo-start-input" value={formatDateTimeVN(startDate)} />
            ) : (
              <input
                id="admin-promo-start"
                className="sa-input"
                type="datetime-local"
                value={startDate}
                data-testid="admin-promo-start-input"
                disabled={isEdit}
                onChange={e => { setStartDate(e.target.value); setErrors(prev => clearError(prev, 'expiryDate')); }}
              />
            )}
          </div>
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-promo-expiry">Ngày hết hạn</label>
            {isView ? (
              <ViewInput id="admin-promo-expiry" testid="admin-promo-expiry-input" value={formatDateVN(expiryDate)} />
            ) : (
              <>
                <input
                  id="admin-promo-expiry"
                  className={`sa-input${errors.expiryDate ? ' sa-input-error' : ''}`}
                  type="date"
                  value={expiryDate}
                  data-testid="admin-promo-expiry-input"
                  aria-describedby={errors.expiryDate ? 'admin-promo-expiry-error' : undefined}
                  onChange={e => { setExpiryDate(e.target.value); setErrors(prev => clearError(prev, 'expiryDate')); }}
                  onBlur={() => validateField('expiryDate')}
                />
                <FieldError id="admin-promo-expiry-error" testid="admin-promo-expiry-error" message={errors.expiryDate} />
              </>
            )}
          </div>
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-promo-max-uses-per-user">Lượt dùng / người</label>
            {isView ? (
              <ViewInput id="admin-promo-max-uses-per-user" testid="admin-promo-max-uses-per-user-input" value={maxUsesPerUser.trim() === '' ? '—' : maxUsesPerUser} />
            ) : (
              <input
                id="admin-promo-max-uses-per-user"
                className="sa-input"
                type="number"
                min={1}
                value={maxUsesPerUser}
                disabled={isEdit}
                onChange={e => setMaxUsesPerUser(e.target.value)}
              />
            )}
          </div>
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-promo-min-tier">Hạng tối thiểu</label>
            <select
              id="admin-promo-min-tier"
              className={`sa-input${isView ? ' sa-view-input' : ''}`}
              value={minTier}
              disabled={isEdit || isView}
              onChange={e => setMinTier(e.target.value)}
            >
              <option value="">Không giới hạn hạng</option>
              <option value="Member">Thường</option>
              <option value="Silver">Bạc</option>
              <option value="Gold">Vàng</option>
              <option value="Diamond">Kim cương</option>
            </select>
          </div>
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-promo-scope">Phạm vi áp dụng</label>
            <select
              id="admin-promo-scope"
              className={`sa-input${isView ? ' sa-view-input' : ''}`}
              value={scopeType}
              disabled={isEdit || isView}
              onChange={e => { setScopeType(e.target.value); setErrors(prev => clearError(prev, 'scope')); }}
            >
              <option value="All">Toàn sàn</option>
              <option value="Category">Theo danh mục</option>
              <option value="Product">Theo sản phẩm</option>
            </select>
          </div>
          {scopeType === 'Category' && (
            <div className="sa-field sa-field-wide">
              <label className="sa-field-label" htmlFor="admin-promo-scope-category">Danh mục áp dụng</label>
              <select
                id="admin-promo-scope-category"
                className={`sa-input${isView ? ' sa-view-input' : ''}`}
                value={scopeCategoryId}
                disabled={isView}
                onChange={e => { setScopeCategoryId(e.target.value); setErrors(prev => clearError(prev, 'scope')); }}
              >
                <option value="">— Chọn danh mục —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {scopeType === 'Product' && (
            <div className="sa-field sa-field-wide">
              <label className="sa-field-label" htmlFor="admin-promo-scope-products">ID sản phẩm, cách nhau bằng dấu phẩy</label>
              {isView ? (
                <ViewInput id="admin-promo-scope-products" testid="admin-promo-scope-products-input" value={orDash(scopeProductIds)} />
              ) : (
                <input
                  id="admin-promo-scope-products"
                  className="sa-input"
                  value={scopeProductIds}
                  onChange={e => { setScopeProductIds(e.target.value); setErrors(prev => clearError(prev, 'scope')); }}
                />
              )}
            </div>
          )}
          {!isPage && !isEdit && !isView && (
            <div className="sa-field sa-field-wide">
              <span className="sa-field-label">Trạng thái</span>
              <Toggle
                checked={activateNow}
                onChange={setActivateNow}
                testid="admin-promo-status-toggle"
                label={activateNow ? 'Kích hoạt ngay sau khi tạo' : 'Tạo ở trạng thái Nháp'}
              />
            </div>
          )}
        </div>
      </FormSection>
      {isView && (
        <ViewMeta prefix="admin-promo" createdAt={normInitial.createdAt} updatedAt={normInitial.updatedAt} updatedBy={normInitial.updatedBy} />
      )}
    </>
  );

  /** Trang full page (đợt 21): header sticky chứa tiêu đề + nút Lưu/Hủy ở trên
   *  cùng, form là <form> thường (không Drawer/overlay, không FormShell). */
  if (isPage) {
    return (
      <form onSubmit={isView ? undefined : handleSubmit} data-testid="admin-promo-form" data-form-mode={mode} noValidate className="sa-promo-page-form">
        <div className="sa-promo-page-head sa-page-sticky-head">
          <div className="sa-promo-page-head-text">
            <h2 data-testid="admin-promo-form-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="sa-promo-page-head-actions">
            <FormBackButton testid="admin-promo-form-back-btn" onBack={handleBack} />
            {isView ? (
              <>
                <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-promo-cancel-btn" onClick={requestClose}>
                  Đóng
                </button>
                {onSwitchToEdit && (
                  <button type="button" className="sa-btn" data-testid="admin-promo-view-edit-btn" onClick={onSwitchToEdit}>
                    Chỉnh sửa
                  </button>
                )}
              </>
            ) : (
              <>
                <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-promo-cancel-btn" onClick={requestClose}>
                  Hủy
                </button>
                <button type="submit" className="sa-btn" data-testid="admin-promo-save-btn" disabled={submitting || (isEdit && !dirty)}>
                  <Save size={16} strokeWidth={2} aria-hidden="true" /> {submitting ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Lưu'}
                </button>
              </>
            )}
          </div>
        </div>
        {body}
      </form>
    );
  }

  return (
    <FormShell
      width={680}
      title={title}
      description={subtitle}
      testid="admin-promo-form-modal"
      formTestid="admin-promo-form"
      formMode={mode}
      onClose={requestClose}
      onSubmit={isView ? undefined : handleSubmit}
      footer={isView ? (
        <>
          <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-promo-cancel-btn" onClick={requestClose}>
            Đóng
          </button>
          {onSwitchToEdit && (
            <button type="button" className="sa-btn" data-testid="admin-promo-view-edit-btn" onClick={onSwitchToEdit}>
              Chỉnh sửa
            </button>
          )}
        </>
      ) : (
        <>
          <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-promo-cancel-btn" onClick={requestClose}>
            Hủy
          </button>
          <button type="submit" className="sa-btn" data-testid="admin-promo-save-btn" disabled={submitting || (isEdit && !dirty)}>
            {submitting ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Lưu'}
          </button>
        </>
      )}
    >
      {body}
    </FormShell>
  );
}

// ============================================================================
// 4. FORM SỬA KHÁCH HÀNG (đợt 17, Q1, mẫu VCB SCR_02/SCR_04) — Modal max 560px
//    (đợt 21 thêm variant="page" cho trang full page /customers/*, nội dung dùng chung).
//    Chỉ sửa (admin không tạo khách): Mã KH disable, Email chỉ xem (disabled),
//    sửa được Họ tên / SĐT / Địa chỉ.
//    Lưu -> PUT /api/admin/customers/{id}.
// ============================================================================

export interface CustomerFormInitial {
  id: string; code: string; fullName: string; email: string; phoneNumber: string; address: string;
  /** Chế độ xem: hiện ở khối "Lịch sử" cuối form (chỉ khi có dữ liệu). */
  createdAt?: string; updatedAt?: string; updatedBy?: string;
}

export interface CustomerSavePayload {
  id: string; fullName: string; phoneNumber: string | null; address: string | null;
}

const CUSTOMER_ERROR_TESTID: Record<string, string> = {
  fullName: 'admin-customer-name-input',
  phoneNumber: 'admin-customer-phone-input',
  address: 'admin-customer-address-input',
};

export function CustomerForm({ initial, onSave, onRequestClose, mode: modeProp, onSwitchToEdit, variant }: {
  initial: CustomerFormInitial;
  onSave: (payload: CustomerSavePayload) => Promise<FormSaveResult>;
  onRequestClose: (dirty: boolean) => void;
  mode?: FormMode;
  onSwitchToEdit?: () => void;
  /** Đợt 21 — 'drawer' (FormShell 680px, đợt 18, mặc định) và 'page' (trang
   *  full page: header sticky có nút Lưu/Hủy ở trên cùng, KHÔNG Drawer).
   *  Nội dung form (trường + validate) dùng chung. */
  variant?: 'drawer' | 'page';
}) {
  const isPage = variant === 'page';
  const isEdit = initial.id !== '';
  const mode: FormMode = modeProp ?? (isEdit ? 'edit' : 'create');
  const isView = mode === 'view';
  const [fullName, setFullName] = useState(initial.fullName);
  const [phoneNumber, setPhoneNumber] = useState(initial.phoneNumber);
  const [address, setAddress] = useState(initial.address);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dirty = isView ? false :
    fullName !== initial.fullName || phoneNumber !== initial.phoneNumber || address !== initial.address;

  const validateAll = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (fullName.trim().length === 0) errs.fullName = REQUIRED_MSG;
    const phone = phoneNumber.trim();
    if (phone !== '' && !PHONE_RE.test(phone)) errs.phoneNumber = PHONE_FORMAT_MSG;
    return errs;
  };

  const validateField = (field: string) => {
    const errs = validateAll();
    setErrors(prev => {
      const next = { ...prev };
      if (errs[field]) next[field] = errs[field];
      else delete next[field];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const errs = validateAll();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      focusFirstError('admin-customer-form', errs,
        ['fullName', 'phoneNumber', 'address'], CUSTOMER_ERROR_TESTID);
      return;
    }
    setSubmitting(true);
    const res = await onSave({
      id: initial.id,
      fullName: fullName.trim(),
      phoneNumber: phoneNumber.trim() === '' ? null : phoneNumber.trim(),
      address: address.trim() === '' ? null : address.trim(),
    });
    setSubmitting(false);
    if (!res.ok) {
      if (res.fieldErrors && Object.keys(res.fieldErrors).length > 0) {
        setErrors(prev => ({ ...prev, ...res.fieldErrors }));
        notifyDuplicate('customer', res.fieldErrors);
        focusFirstError('admin-customer-form', res.fieldErrors,
          ['fullName', 'phoneNumber', 'address'], CUSTOMER_ERROR_TESTID);
      } else setFormError(res.error || 'Không lưu được thông tin khách hàng.');
      return;
    }
    notify.success(messages.toast.customer.updated.title,
      fmt(messages.toast.customer.updated.desc, { tên: shortName(fullName.trim()) }));
    // Thành công: cha đóng form + reload (form unmount, không cần làm gì thêm).
  };

  const requestClose = () => void requestDiscardConfirm(dirty, onRequestClose);
  const handleBack = () => goBackOrClose(dirty, onRequestClose);
  /** Đợt 21 — trang full page không có FormShell nên tự lo autofocus ô đầu
   *  + ESC (FormShell làm việc này ở Drawer): ESC khi chưa sửa thì đóng ngay,
   *  đã sửa thì hỏi "Hủy các thay đổi?" qua requestClose. requestCloseRef
   *  tránh closure cũ (dirty) trong listener đăng ký 1 lần khi mount. */
  const pageFormRef = useRef<HTMLFormElement>(null);
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  useEffect(() => {
    if (!isPage) return;
    const first = pageFormRef.current?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); requestCloseRef.current(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPage]);
  const title = isPage
    ? (isView ? `Chi tiết khách hàng ${initial.code || fullName}` : 'Chỉnh sửa khách hàng')
    : (isView ? 'Chi tiết khách hàng' : isEdit ? 'Chỉnh sửa khách hàng' : 'Thêm khách hàng');
  /** Đợt 26: chỉ giữ subtitle ở chế độ sửa (ghi rõ mã + email không đổi);
   *  "Xem thông tin khách hàng." / "Thêm khách hàng mới." đã bỏ. */
  const subtitle: string | undefined = !isView && isEdit ? 'Mã khách hàng và email không thay đổi khi sửa.' : undefined;

  /** Nút footer dùng chung cho cả 2 variant (Drawer + trang full page):
   *  Drawer đặt ở footer FormShell, trang full page đặt ở header sticky. */
  const footer = isView ? (
    <>
      <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-customer-cancel-btn" onClick={requestClose}>
        Đóng
      </button>
      {onSwitchToEdit && (
        <button type="button" className="sa-btn" data-testid="admin-customer-edit-btn" onClick={onSwitchToEdit}>
          Chỉnh sửa
        </button>
      )}
    </>
  ) : (
    <>
      <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-customer-cancel-btn" onClick={requestClose}>
        Hủy
      </button>
      <button type="submit" className="sa-btn" data-testid="admin-customer-save-btn" disabled={submitting || (isEdit && !dirty)}>
        {submitting ? 'Đang lưu...' : 'Lưu thay đổi'}
      </button>
    </>
  );

  /** Nội dung form dùng chung cho cả 2 variant (đợt 21): Drawer (FormShell)
   *  và trang full page (form thường + header sticky). Chỉ khác cách bọc ngoài. */
  const body = (
    <>
      {formError && <p className="sa-error" role="alert">{formError}</p>}
      <FormSection title="Thông tin tài khoản">
        <div className="sa-form-grid">
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-customer-code">Mã KH</label>
            {isView ? (
              <ViewInput id="admin-customer-code" testid="admin-customer-code-input" value={orDash(initial.code)} />
            ) : (
              <input
                id="admin-customer-code"
                className="sa-input"
                value={initial.code}
                data-testid="admin-customer-code-input"
                disabled
                readOnly
                title="Mã khách hàng không thay đổi khi sửa"
              />
            )}
          </div>
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-customer-email">Email</label>
            {isView ? (
              <ViewInput id="admin-customer-email" testid="admin-customer-email-input" value={orDash(initial.email)} />
            ) : (
              <input
                id="admin-customer-email"
                className="sa-input"
                value={initial.email}
                data-testid="admin-customer-email-input"
                disabled
                readOnly
                title="Email là định danh đăng nhập — chỉ xem, không sửa"
              />
            )}
          </div>
        </div>
      </FormSection>
      <FormSection title="Thông tin cá nhân">
        <div className="sa-form-grid">
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-customer-name">Họ tên{!isView && <Req />}</label>
            {isView ? (
              <ViewInput id="admin-customer-name" testid="admin-customer-name-input" value={orDash(fullName)} />
            ) : (
              <>
                <input
                  id="admin-customer-name"
                  className={`sa-input${errors.fullName ? ' sa-input-error' : ''}`}
                  value={fullName}
                  data-testid="admin-customer-name-input"
                  aria-describedby={errors.fullName ? 'admin-customer-name-error' : undefined}
                  onChange={e => { setFullName(e.target.value); setErrors(prev => clearError(prev, 'fullName')); }}
                  onBlur={() => validateField('fullName')}
                />
                <FieldError id="admin-customer-name-error" testid="admin-customer-name-error" message={errors.fullName} />
              </>
            )}
          </div>
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-customer-phone">Số điện thoại</label>
            {isView ? (
              <ViewInput id="admin-customer-phone" testid="admin-customer-phone-input" value={orDash(phoneNumber)} />
            ) : (
              <>
                <input
                  id="admin-customer-phone"
                  className={`sa-input${errors.phoneNumber ? ' sa-input-error' : ''}`}
                  value={phoneNumber}
                  data-testid="admin-customer-phone-input"
                  aria-describedby={errors.phoneNumber ? 'admin-customer-phone-error' : undefined}
                  placeholder="0xxxxxxxxx"
                  onChange={e => { setPhoneNumber(e.target.value); setErrors(prev => clearError(prev, 'phoneNumber')); }}
                  onBlur={() => validateField('phoneNumber')}
                />
                <FieldError id="admin-customer-phone-error" testid="admin-customer-phone-error" message={errors.phoneNumber} />
              </>
            )}
          </div>
          <div className="sa-field sa-field-wide">
            <label className="sa-field-label" htmlFor="admin-customer-address">Địa chỉ</label>
            {isView ? (
              <ViewInput id="admin-customer-address" testid="admin-customer-address-input" value={orDash(address)} />
            ) : (
              <input
                id="admin-customer-address"
                className="sa-input"
                value={address}
                data-testid="admin-customer-address-input"
                onChange={e => setAddress(e.target.value)}
              />
            )}
          </div>
        </div>
      </FormSection>
      {isView && (
        <ViewMeta prefix="admin-customer" createdAt={initial.createdAt} updatedAt={initial.updatedAt} updatedBy={initial.updatedBy} />
      )}
    </>
  );

  /** Trang full page (đợt 21): header sticky chứa tiêu đề + nút Lưu/Hủy ở trên
   *  cùng, form là <form> thường (không Drawer/overlay, không FormShell). */
  if (isPage) {
    return (
      <form ref={pageFormRef} onSubmit={isView ? undefined : handleSubmit} data-testid="admin-customer-form" data-form-mode={mode} noValidate className="sa-promo-page-form">
        <div className="sa-promo-page-head sa-page-sticky-head">
          <div className="sa-promo-page-head-text">
            <h2 data-testid="admin-customer-form-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="sa-promo-page-head-actions">
            <FormBackButton testid="admin-customer-form-back-btn" onBack={handleBack} />
            {footer}
          </div>
        </div>
        {body}
      </form>
    );
  }

  return (
    <FormShell
      width={680}
      title={title}
      description={subtitle}
      testid="admin-customer-form-page"
      formTestid="admin-customer-form"
      formMode={mode}
      onClose={requestClose}
      onSubmit={isView ? undefined : handleSubmit}
      footer={footer}
    >
      {body}
    </FormShell>
  );
}
