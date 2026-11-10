import React, { useEffect, useRef, useState } from 'react';
import { PHONE_FORMAT_MSG, PHONE_RE, REQUIRED_MSG, discountPercent, formatDateTimeVN, formatDateVN, formatMoneyVND, parseMoney, randomPromoCode, slugify, validateEntityCode } from './formUtils';
import { CategoryPicker, FieldError, ImageUploader, MoneyInput, Req, Toggle, ViewImageGallery, imageItemFromUrl } from './FormControls';
import type { UploadImageItem } from './FormControls';
import { Banknote, Percent, Save, ShoppingBag, Star, Truck } from 'lucide-react';
import { FormShell } from './FormShell';
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
 * Đóng form (ESC/X/Hủy) khi dirty: hỏi "Thoát mà chưa lưu?" qua confirmAction
 * của W1 (messages.confirm.discardForm, đúng 2 nút [Ở lại] + [Thoát]);
 * xem requestDiscardConfirm — có fallback về onRequestClose(dirty) khi host
 * chưa mount. Ở chế độ xem đóng luôn, không hỏi.
 */

export type FormMode = 'create' | 'edit' | 'view';

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

/** Tiêu đề nhóm field trong form. */
const FormSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="sa-form-section">
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
 * của W1 — "Thoát mà chưa lưu?" / "Các thay đổi bạn vừa nhập sẽ bị mất.",
 * đúng 2 nút [Ở lại] (trái) + [Thoát] (phải). Xác nhận -> onRequestClose(false)
 * (đóng luôn, cha không hỏi lại); chưa sửa (dirty=false) -> đóng luôn.
 *
 * Fallback khi <ConfirmDialogHost/> chưa mount ở gốc AdminPage (W3 gắn ở sóng B):
 * confirmAction treo tới khi host mount; nếu sau 300ms vẫn không thấy dialog
 * trong DOM thì để cha hỏi bằng hộp xác nhận sẵn có qua onRequestClose(true)
 * (chuỗi cũ của cha, W3 sẽ đổi sang messages.confirm.discardForm) — form vẫn
 * đóng được, không treo. Khi host đã mount (bản tích hợp), dialog hiện ngay
 * nên không bao giờ rơi vào fallback. Cờ chống gọi chồng khi bấm ESC/X/Hủy
 * liên tiếp trong lúc popup đang mở.
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
    await new Promise(r => setTimeout(r, 300));
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
    // Thành công: toast qua notify + messages.vi; cha đóng form + reload
    // (form unmount, không cần làm gì thêm).
    const displayName = shortName(name.trim());
    if (isEdit) {
      notify.success(messages.toast.product.updated.title, fmt(messages.toast.product.updated.desc, { tên: displayName }));
    } else {
      notify.success(messages.toast.product.added.title, fmt(messages.toast.product.added.desc, { tên: displayName }));
    }
    if (Number(stock) === 0) {
      notify.info(messages.toast.product.outOfStock.title, fmt(messages.toast.product.outOfStock.desc, { tên: displayName }));
    }
  };

  const requestClose = () => void requestDiscardConfirm(dirty, onRequestClose);
  /** Đợt 21 — trang full page không có FormShell nên tự lo autofocus ô đầu
   *  + ESC (FormShell làm việc này ở Drawer): ESC khi chưa sửa thì đóng ngay,
   *  đã sửa thì hỏi "Thoát mà chưa lưu?" qua requestClose. requestCloseRef
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
  const subtitle = isView ? 'Xem thông tin sản phẩm.'
    : isEdit ? 'Chỉnh sửa thông tin sản phẩm đang bán.' : 'Thêm sản phẩm mới lên sàn.';

  const priceNum = parseMoney(price);
  const origNum = originalPrice === '' ? null : parseMoney(originalPrice);
  const pct = discountPercent(Number.isNaN(priceNum) ? 0 : priceNum, origNum);
  const stockNum = stock === '' ? 0 : Number(stock);
  const categoryName = categories.find(c => c.id === categoryId)?.name ?? '';

  /** Nội dung form dùng chung cho cả 2 variant (đợt 21): Drawer (FormShell)
   *  và trang full page (form thường + header sticky). Chỉ khác cách bọc ngoài. */
  const body = (
    <>
      {formError && <p className="sa-error" role="alert">{formError}</p>}
      <FormSection title="Thông tin cơ bản">
        <div className="sa-form-grid">
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-product-code">Mã SP</label>
            {isView ? (
              <ViewInput id="admin-product-code" testid="admin-product-code-input" value={orDash(code)} />
            ) : (
              <>
                <input
                  id="admin-product-code"
                  className={`sa-input${errors.code ? ' sa-input-error' : ''}`}
                  value={code}
                  data-testid="admin-product-code-input"
                  aria-describedby={errors.code ? 'admin-product-code-error' : undefined}
                  disabled={isEdit}
                  placeholder="Để trống để tự sinh (SP-xxxx)"
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  onBlur={() => validateField('code')}
                />
                <span className="sa-field-meta"><span className="sa-hint">{isEdit ? 'Mã sản phẩm không thay đổi khi sửa.' : 'Để trống để tự sinh; nếu nhập: 3–20 ký tự, chỉ chữ in hoa, chữ số, gạch ngang.'}</span></span>
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
                  onChange={e => setName(e.target.value)}
                  onBlur={() => validateField('name')}
                />
                <span className="sa-field-meta">
                  <span className="sa-hint">Từ 3 đến 120 ký tự.</span>
                  <span className="sa-count" data-testid="admin-product-name-count">{name.length}/120</span>
                </span>
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
                  onChange={v => setPrice(v)}
                  testid="admin-product-price-input"
                  errorId={errors.price ? 'admin-product-price-error' : undefined}
                />
                <span className="sa-field-meta"><span className="sa-hint">Giá bán phải lớn hơn 0.</span></span>
                <FieldError id="admin-product-price-error" testid="admin-product-price-error" message={errors.price} />
              </>
            )}
          </div>
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-product-original-price">Giá gốc</label>
            {isView ? (
              <ViewInput id="admin-product-original-price" testid="admin-product-original-price-input" value={originalPrice === '' ? '—' : formatMoneyVND(originalPrice)} />
            ) : (
              <>
                <MoneyInput
                  id="admin-product-original-price"
                  value={originalPrice}
                  onChange={v => setOriginalPrice(v)}
                  testid="admin-product-original-price-input"
                  errorId={errors.originalPrice ? 'admin-product-original-price-error' : undefined}
                />
                <span className="sa-field-meta">
                  <span className="sa-hint">Không bắt buộc; phải lớn hơn giá bán.</span>
                  {pct !== null && <span className="sa-discount-badge" data-testid="admin-product-discount-badge">Giảm {pct}%</span>}
                </span>
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
                <span className="sa-stepper">
                  <button
                    type="button"
                    className="sa-stepper-btn"
                    data-testid="admin-product-stock-minus-btn"
                    aria-label="Giảm tồn kho"
                    onClick={() => setStock(String(Math.max(0, stockNum - 1)))}
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
                    onChange={e => setStock(e.target.value.replace(/\D/g, ''))}
                    onBlur={() => validateField('stock')}
                  />
                  <button
                    type="button"
                    className="sa-stepper-btn"
                    data-testid="admin-product-stock-plus-btn"
                    aria-label="Tăng tồn kho"
                    onClick={() => setStock(String(stockNum + 1))}
                  >
                    +
                  </button>
                </span>
                <span className="sa-field-meta"><span className="sa-hint">Số nguyên ≥ 0.</span></span>
                <FieldError id="admin-product-stock-error" testid="admin-product-stock-error" message={errors.stock} />
              </>
            )}
          </div>
          <div className="sa-field">
            <span className="sa-field-label">Trạng thái</span>
            {isView ? (
              <StatusBadge
                tone={isActive ? 'green' : 'gray'}
                label={isActive ? 'Đang bán' : 'Đang ẩn'}
                testid="admin-product-status-badge"
              />
            ) : (
              <>
                <Toggle
                  checked={isActive}
                  onChange={setIsActive}
                  testid="admin-product-status-toggle"
                  label={isActive ? 'Hiển thị / Đang bán' : 'Đang ẩn'}
                />
                <span className="sa-field-meta"><span className="sa-hint">Tắt để ẩn sản phẩm khỏi sàn.</span></span>
              </>
            )}
          </div>
        </div>
      </FormSection>
      <FormSection title="Hình ảnh">
        {isView ? (
          <ViewImageGallery prefix="admin-product-image" urls={readyUrls} />
        ) : (
          <>
            <ImageUploader prefix="admin-product-image" images={images} onChange={setImages} multiple max={8} />
            <p className="sa-hint">Kéo-thả thumbnail để đổi thứ tự — ảnh đầu tiên là ảnh chính. Bấm <Star size={14} strokeWidth={2} fill="currentColor" aria-hidden="true" style={{ verticalAlign: '-2px' }} /> để đặt ảnh chính.</p>
          </>
        )}
      </FormSection>
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
            onChange={e => setDescription(e.target.value)}
          />
          {!isView && (
            <span className="sa-field-meta">
              <span className="sa-hint">Mô tả chi tiết sản phẩm.</span>
              <span className="sa-count" data-testid="admin-product-description-count">{description.length}/2000</span>
            </span>
          )}
        </div>
      </FormSection>
      {!isView && (
        <FormSection title="Xem trước">
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
                {pct !== null && <span className="sa-discount-badge">Giảm {pct}%</span>}
              </span>
              <small>Tồn kho: {stock === '' ? '—' : stockNum}</small>
            </span>
          </div>
        </FormSection>
      )}
      {isView && (
        <ViewMeta prefix="admin-product" createdAt={initial.createdAt} updatedAt={initial.updatedAt} updatedBy={initial.updatedBy} />
      )}
    </>
  );

  /** Trang full page (đợt 21): header sticky chứa tiêu đề + nút Lưu/Hủy ở trên
   *  cùng, form là <form> thường (không Drawer/overlay, không FormShell). */
  if (isPage) {
    return (
      <form ref={pageFormRef} onSubmit={isView ? undefined : handleSubmit} data-testid="admin-product-form" data-form-mode={mode} noValidate className="sa-product-page-form">
        <div className="sa-product-page-head">
          <div className="sa-product-page-head-text">
            <h2 data-testid="admin-product-form-title">{title}</h2>
            <p>{subtitle}</p>
          </div>
          <div className="sa-product-page-head-actions">
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
                  {submitting ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Lưu'}
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
  /** Đợt 21 — trang full page không có FormShell nên tự lo autofocus ô đầu
   *  + ESC (FormShell làm việc này ở Drawer): ESC khi chưa sửa thì đóng ngay,
   *  đã sửa thì hỏi "Thoát mà chưa lưu?" qua requestClose. requestCloseRef
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
  const subtitle = isView ? 'Xem thông tin danh mục.'
    : isEdit ? 'Chỉnh sửa thông tin danh mục.' : 'Thêm danh mục mới cho sàn.';

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
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  onBlur={() => validateField('code')}
                />
                <span className="sa-field-meta"><span className="sa-hint">{isEdit ? 'Mã danh mục không thay đổi khi sửa.' : 'Để trống để tự sinh; nếu nhập: 3–20 ký tự, chỉ chữ in hoa, chữ số, gạch ngang.'}</span></span>
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
                  onChange={e => {
                    const v = e.target.value;
                    setName(v);
                    if (!slugEdited) setSlug(slugify(v));
                  }}
                  onBlur={() => validateField('name')}
                />
                <span className="sa-field-meta"><span className="sa-hint">Từ 2 đến 150 ký tự.</span></span>
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
                  onChange={e => { setSlug(e.target.value); setSlugEdited(true); }}
                  onBlur={() => validateField('slug')}
                />
                <span className="sa-field-meta"><span className="sa-hint">{isEdit ? 'Slug không thay đổi khi sửa.' : 'Tự sinh từ tên — sửa tay để giữ slug riêng.'}</span></span>
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
                <span className="sa-field-meta"><span className="sa-hint">Số càng nhỏ càng hiện trước.</span></span>
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
        <div className="sa-promo-page-head">
          <div className="sa-promo-page-head-text">
            <h2 data-testid="admin-category-form-title">{title}</h2>
            <p>{subtitle}</p>
          </div>
          <div className="sa-promo-page-head-actions">
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
  /** Đợt 21 — tiêu đề trang full page theo spec (ghi đè tiêu đề Drawer chỉ ở variant page). */
  const title = isPage
    ? (isView ? `Chi tiết khuyến mãi ${normInitial.code}` : isEdit ? 'Chỉnh sửa khuyến mãi' : 'Thêm mới khuyến mãi')
    : (isView ? `Chi tiết khuyến mãi ${normInitial.code}` : isEdit ? `Chỉnh sửa khuyến mãi ${normInitial.code}` : 'Tạo khuyến mãi mới');
  const subtitle = isPage
    ? (isView ? 'Xem thông tin khuyến mãi.'
      : isEdit
        ? 'Voucher Nháp: chỉ sửa được mô tả, giá trị giảm, đơn tối thiểu, trần giảm, ngày kết thúc và tổng lượt. Mã, loại giảm và phạm vi không đổi.'
        : 'Thiết lập thông tin và điều kiện áp dụng cho chương trình khuyến mãi')
    : (isView ? 'Xem thông tin khuyến mãi.'
      : isEdit
        ? 'Voucher Nháp: chỉ sửa được mô tả, giá trị giảm, đơn tối thiểu, trần giảm, ngày kết thúc và tổng lượt. Mã, loại giảm và phạm vi không đổi.'
        : 'Tạo ở trạng thái Nháp — bấm Kích hoạt để chạy.');

  const discountTypeBtn = (type: string, testid: string, label: string) => (
    <button
      key={type}
      type="button"
      role="radio"
      aria-checked={discountType === type}
      data-testid={testid}
      className={`sa-segmented-btn${discountType === type ? ' sa-segmented-active' : ''}`}
      disabled={isEdit}
      onClick={() => setDiscountType(type)}
    >
      {label}
    </button>
  );

  /** Radio card chọn loại giảm — CHỈ ở trang full page (đợt 21): bấm cả card để
   *  chọn, card chọn viền xanh lá + nền xanh nhạt + radio indicator, chỉ 1 lựa chọn. */
  const discountTypeCard = (type: string, testid: string, label: string, desc: string, icon: React.ReactNode) => (
    <button
      key={type}
      type="button"
      role="radio"
      aria-checked={discountType === type}
      data-testid={testid}
      className={`sa-radio-card${discountType === type ? ' sa-radio-card-selected' : ''}`}
      disabled={isEdit}
      onClick={() => setDiscountType(type)}
    >
      <span className="sa-radio-card-indicator" aria-hidden="true" />
      <span className="sa-radio-card-icon" aria-hidden="true">{icon}</span>
      <span className="sa-radio-card-text">
        <strong>{label}</strong>
        <small>{desc}</small>
      </span>
    </button>
  );

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
                    onChange={e => setCode(e.target.value.toUpperCase())}
                    onBlur={() => validateField('code')}
                  />
                  {!isPage && !isEdit && (
                    <button type="button" className="sa-btn sa-btn-ghost" data-testid="admin-promo-generate-code-btn" onClick={() => setCode(randomPromoCode())}>
                      Tạo mã ngẫu nhiên
                    </button>
                  )}
                </span>
                {!isPage && <span className="sa-field-meta"><span className="sa-hint">3–50 ký tự: chữ, số, gạch ngang/gạch dưới. Tự viết hoa khi gõ.</span></span>}
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
      <FormSection title="Giá trị giảm">
        <div className="sa-form-grid">
          <div className={`sa-field${isPage && !isView ? ' sa-field-wide' : ''}`}>
            <span className="sa-field-label" id="admin-promo-discount-type-label">Loại giảm{!isView && <Req />}</span>
            {isView ? (
              <ViewInput id="admin-promo-discount-type" testid="admin-promo-discount-type-value" value={DISCOUNT_TYPE_LABEL[discountType] ?? discountType} />
            ) : isPage ? (
              <span className="sa-radio-cards" role="radiogroup" aria-labelledby="admin-promo-discount-type-label">
                {discountTypeCard('Fixed', 'admin-promo-discount-type-fixed', 'Cố định', 'Giảm một số tiền cụ thể trên đơn hàng', <Banknote size={20} strokeWidth={2} aria-hidden="true" />)}
                {discountTypeCard('Percentage', 'admin-promo-discount-type-percent', 'Phần trăm', 'Giảm theo tỷ lệ phần trăm trên giá trị đơn hàng', <Percent size={20} strokeWidth={2} aria-hidden="true" />)}
                {discountTypeCard('FreeShip', 'admin-promo-discount-type-freeship', 'Miễn phí ship', 'Miễn phí phí vận chuyển cho đơn hàng', <Truck size={20} strokeWidth={2} aria-hidden="true" />)}
              </span>
            ) : (
              <>
                <span className="sa-segmented" role="radiogroup" aria-labelledby="admin-promo-discount-type-label">
                  {discountTypeBtn('Fixed', 'admin-promo-discount-type-fixed', 'Cố định')}
                  {discountTypeBtn('Percentage', 'admin-promo-discount-type-percent', 'Phần trăm')}
                  {discountTypeBtn('FreeShip', 'admin-promo-discount-type-freeship', 'Miễn phí ship')}
                </span>
                <span className="sa-field-meta"><span className="sa-hint">Sửa voucher Nháp không đổi được loại giảm.</span></span>
              </>
            )}
          </div>
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-promo-value">Giá trị giảm{!isView && !(isPage && discountType === 'FreeShip') && <Req />}</label>
            {isView ? (
              <ViewInput
                id="admin-promo-value"
                testid="admin-promo-value-input"
                value={discountValue.trim() === '' ? '—' : discountType === 'Percentage' ? `${discountValue.replace(/\D/g, '')}%` : formatMoneyVND(discountValue)}
              />
            ) : discountType === 'Percentage' ? (
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
                    onChange={e => setDiscountValue(e.target.value.replace(/\D/g, ''))}
                    onBlur={() => validateField('discountValue')}
                  />
                  <span className="sa-money-suffix" aria-hidden="true">%</span>
                </span>
                {!isPage && <span className="sa-field-meta"><span className="sa-hint">Từ 1 đến 100%.</span></span>}
                <FieldError id="admin-promo-value-error" testid="admin-promo-value-error" message={errors.discountValue} />
              </>
            ) : isPage && discountType === 'FreeShip' ? (
              <p className="sa-promo-freeship-note" data-testid="admin-promo-value-freeship-note">
                Miễn phí phí vận chuyển — không cần nhập giá trị.
              </p>
            ) : (
              <>
                <MoneyInput
                  id="admin-promo-value"
                  value={discountValue.replace(/\D/g, '')}
                  onChange={setDiscountValue}
                  testid="admin-promo-value-input"
                  errorId={errors.discountValue ? 'admin-promo-value-error' : undefined}
                  error={!!errors.discountValue}
                />
                {!isPage && <span className="sa-field-meta"><span className="sa-hint">{discountType === 'FreeShip' ? 'Miễn phí vận chuyển — giá trị 0.' : 'Số tiền giảm cố định.'}</span></span>}
                <FieldError id="admin-promo-value-error" testid="admin-promo-value-error" message={errors.discountValue} />
              </>
            )}
          </div>
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-promo-min-order">Đơn tối thiểu</label>
            {isView ? (
              <ViewInput id="admin-promo-min-order" testid="admin-promo-min-order-input" value={minOrderAmount === '' ? '—' : formatMoneyVND(minOrderAmount)} />
            ) : (
              <>
                <MoneyInput
                  id="admin-promo-min-order"
                  value={minOrderAmount}
                  onChange={setMinOrderAmount}
                  testid="admin-promo-min-order-input"
                  errorId={errors.minOrderAmount ? 'admin-promo-min-order-error' : undefined}
                  error={!!errors.minOrderAmount}
                />
                <FieldError id="admin-promo-min-order-error" testid="admin-promo-min-order-error" message={errors.minOrderAmount} />
              </>
            )}
          </div>
          {discountType === 'Percentage' && (
            <div className="sa-field">
              <label className="sa-field-label" htmlFor="admin-promo-max-discount">Giảm tối đa</label>
              {isView ? (
                <ViewInput id="admin-promo-max-discount" testid="admin-promo-max-discount-input" value={maxDiscountAmount === '' ? '—' : formatMoneyVND(maxDiscountAmount)} />
              ) : (
                <>
                  <MoneyInput
                    id="admin-promo-max-discount"
                    value={maxDiscountAmount}
                    onChange={setMaxDiscountAmount}
                    testid="admin-promo-max-discount-input"
                    errorId={errors.maxDiscountAmount ? 'admin-promo-max-discount-error' : undefined}
                    error={!!errors.maxDiscountAmount}
                  />
                  {!isPage && <span className="sa-field-meta"><span className="sa-hint">Không bắt buộc.</span></span>}
                  <FieldError id="admin-promo-max-discount-error" testid="admin-promo-max-discount-error" message={errors.maxDiscountAmount} />
                </>
              )}
            </div>
          )}
          <div className="sa-field">
            <label className="sa-field-label" htmlFor="admin-promo-max-uses">Số lượt dùng tối đa</label>
            {isView ? (
              <ViewInput id="admin-promo-max-uses" testid="admin-promo-max-uses-input" value={maxUses.trim() === '' ? '—' : maxUses.replace(/\D/g, '')} />
            ) : (
              <>
                <input
                  id="admin-promo-max-uses"
                  className={`sa-input${errors.maxUses ? ' sa-input-error' : ''}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={maxUses.replace(/\D/g, '')}
                  data-testid="admin-promo-max-uses-input"
                  aria-describedby={errors.maxUses ? 'admin-promo-max-uses-error' : undefined}
                  onChange={e => setMaxUses(e.target.value.replace(/\D/g, ''))}
                  onBlur={() => validateField('maxUses')}
                />
                {!isPage && <span className="sa-field-meta"><span className="sa-hint">Để trống = không giới hạn.</span></span>}
                <FieldError id="admin-promo-max-uses-error" testid="admin-promo-max-uses-error" message={errors.maxUses} />
              </>
            )}
          </div>
        </div>
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
                onChange={e => setStartDate(e.target.value)}
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
                  onChange={e => setExpiryDate(e.target.value)}
                  onBlur={() => validateField('expiryDate')}
                />
                {!isPage && <span className="sa-field-meta"><span className="sa-hint">Định dạng dd/mm/yyyy.</span></span>}
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
              onChange={e => setScopeType(e.target.value)}
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
                onChange={e => setScopeCategoryId(e.target.value)}
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
                  onChange={e => setScopeProductIds(e.target.value)}
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
      {/* Đợt 21 — (S4) Trạng thái: CHỈ ở trang full page. Tạo mới mặc định Nháp,
        KHÔNG tự kích hoạt (đã bỏ toggle + bỏ gọi activate sau tạo); sửa không đổi trạng thái. */}
      {isPage && !isView && (
        <FormSection title="Trạng thái">
          <p className="sa-promo-status-note" data-testid="admin-promo-status-text">
            {isEdit
              ? `Trạng thái hiện tại: ${normInitial.statusLabel ?? '—'}. Sửa khuyến mãi không đổi trạng thái — bật/tắt từ danh sách khuyến mãi.`
              : 'Nháp — khuyến mãi mới được tạo ở trạng thái Nháp. Bật khuyến mãi từ danh sách sau khi tạo.'}
          </p>
        </FormSection>
      )}
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
        <div className="sa-promo-page-head">
          <div className="sa-promo-page-head-text">
            <h2 data-testid="admin-promo-form-title">{title}</h2>
            <p>{subtitle}</p>
          </div>
          <div className="sa-promo-page-head-actions">
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
  /** Đợt 21 — trang full page không có FormShell nên tự lo autofocus ô đầu
   *  + ESC (FormShell làm việc này ở Drawer): ESC khi chưa sửa thì đóng ngay,
   *  đã sửa thì hỏi "Thoát mà chưa lưu?" qua requestClose. requestCloseRef
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
  const subtitle = isView ? 'Xem thông tin khách hàng.'
    : isEdit ? 'Mã khách hàng và email không thay đổi khi sửa.' : 'Thêm khách hàng mới.';

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
              />
            )}
            {!isView && <span className="sa-field-meta"><span className="sa-hint">Mã khách hàng không thay đổi khi sửa.</span></span>}
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
              />
            )}
            {!isView && <span className="sa-field-meta"><span className="sa-hint">Email là định danh đăng nhập — chỉ xem, không sửa.</span></span>}
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
                  onChange={e => setFullName(e.target.value)}
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
                  onChange={e => setPhoneNumber(e.target.value)}
                  onBlur={() => validateField('phoneNumber')}
                />
                <span className="sa-field-meta"><span className="sa-hint">Bắt đầu bằng 0, gồm 10 chữ số.</span></span>
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
        <div className="sa-promo-page-head">
          <div className="sa-promo-page-head-text">
            <h2 data-testid="admin-customer-form-title">{title}</h2>
            <p>{subtitle}</p>
          </div>
          <div className="sa-promo-page-head-actions">
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
