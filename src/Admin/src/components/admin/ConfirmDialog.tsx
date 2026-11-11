/**
 * ConfirmDialog — Popup xác nhận duy nhất của admin (đợt 18).
 *
 * QUY TẮC BẮT BUỘC (Matthew 16:27 + spec A–H 17:42): MỌI popup mặc định chỉ
 * có ĐÚNG 2 NÚT, không bao giờ 3 — footer luôn là [Hủy] trái + [Xác nhận cụ
 * thể] phải. Ngoại lệ theo spec mới: đóng form chưa lưu là [Ở lại] trái +
 * [Rời trang] phải (truyền cancelText="Ở lại", confirmText="Rời trang",
 * variant="warning"); A3 chặn xóa DM và G4 phiên hết hạn CHỈ 1 NÚT
 * (singleButton: true — footer chỉ còn nút xác nhận); A5/C5/G5 có nút trái
 * [Đóng]; D1 nút trái [Giữ đơn hàng]; G6 nút trái [Giữ bản của tôi].
 *
 * Icon variant dùng Lucide, KHÔNG emoji/dingbat: danger → Trash2, warning →
 * TriangleAlert, info → Info; nút đóng (toast) → X.
 *
 * Props mở rộng cho spec A–H:
 * - singleButton: chỉ 1 nút xác nhận (A3, G4). Nút Hủy bị ẩn hẳn.
 * - nonDismissable: không đóng bằng ESC, không bấm nền mờ (G4). Không có nút X.
 * - reasonMaxLength: giới hạn ký tự ô lý do + hiện bộ đếm "{n}/{max}"
 *   (testid confirm-dialog-reason-counter) — B1 khóa: 300.
 * - requireTypeToConfirm: gõ đúng chuỗi mới mở nút xác nhận; so sánh sau
 *   trim + lowercase nên "XOA" không phân biệt hoa thường (A7).
 * - linkAction: link phụ dưới nội dung (A3 "Xem sản phẩm trong danh mục") —
 *   bấm link thì đóng popup rồi gọi onClick (caller tự điều hướng); KHÔNG tự
 *   resolve thành confirmed.
 * - error: lỗi máy chủ hiện đỏ phía trên hàng nút (testid confirm-dialog-error).
 * - loading: nút xác nhận thành "Đang xử lý...", khóa cả 2 nút.
 *
 * HAI CÁCH DÙNG:
 *
 * 1) confirmAction — dùng cho hầu hết các chỗ (khóa/xóa/đổi trạng thái...).
 *    Không cần giữ state mở/đóng, chỉ cần mount <ConfirmDialogHost /> MỘT
 *    LẦN ở gốc AdminPage (cạnh <ToastHost />) rồi await:
 *
 *      import { confirmAction } from './ConfirmDialog';
 *      import { messages, fmt, shortName } from './messages.vi';
 *
 *      const { confirmed, reason } = await confirmAction({
 *        title: messages.confirm.deleteProduct.title,
 *        message: fmt(messages.confirm.deleteProduct.message, { tên: shortName(p.name) }),
 *        confirmText: messages.confirm.deleteProduct.confirmText,
 *        cancelText: 'Hủy',
 *        variant: 'danger',
 *        irreversible: true,
 *      });
 *      if (!confirmed) return;
 *      // ... gọi API xóa
 *
 *    - Khóa tài khoản (lý do bắt buộc, tối đa 300 ký tự, có bộ đếm — B1):
 *        await confirmAction({
 *          title: messages.confirm.lockCustomer.title,
 *          message: fmt(messages.confirm.lockCustomer.message, { tên: shortName(u.name), email: u.email }),
 *          confirmText: messages.confirm.lockCustomer.confirmText,
 *          variant: 'warning',
 *          requireReason: true,
 *          reasonLabel: messages.validate.lockReasonLabel, // "Lý do khóa *"
 *          reasonPlaceholder: 'Nhập lý do khóa tài khoản...',
 *          reasonError: messages.validate.lockReasonEmpty,
 *          reasonMaxLength: 300,
 *        });
 *    - Xóa tài khoản (gõ XOA để xác nhận — nút khóa tới khi gõ đúng, A7):
 *        await confirmAction({ ..., variant: 'danger', irreversible: true,
 *          requireTypeToConfirm: true, typeLabel: messages.validate.typeToConfirmLabel,
 *          typeExpected: 'XOA' });
 *    - Chặn xóa DM đang có SP (A3 — 1 nút + link sang tab SP):
 *        await confirmAction({ ..., variant: 'warning', singleButton: true,
 *          linkLabel: 'Xem sản phẩm trong danh mục',
 *          onLinkClick: () => { setProductCatFilter(c.id); setTab('products'); } });
 *    - Phiên hết hạn (G4 — 1 nút, không đóng được):
 *        await confirmAction({ ..., variant: 'warning', singleButton: true,
 *          nonDismissable: true });
 *        clearToken(); navigate('/login');
 *    - Đóng form chưa lưu: cancelText: 'Ở lại', confirmText: 'Rời trang',
 *      variant: 'warning' (không irreversible).
 *    confirmAction xếp hàng (queue): gọi nhiều lần liên tiếp thì các popup
 *    hiện lần lượt, mỗi lần resolve { confirmed, reason? } của riêng nó.
 *
 * 2) <ConfirmDialog /> có kiểm soát — dùng khi cần loading/error bất đồng
 *    bộ (vd bấm Xác nhận → gọi API trong popup, lỗi thì hiện trong popup):
 *      const [open, setOpen] = useState(false);
 *      const [busy, setBusy] = useState(false);
 *      const [err, setErr] = useState<string | null>(null);
 *      <ConfirmDialog open={open} loading={busy} error={err} ... />
 *    Khi loading: nút xác nhận hiện "Đang xử lý...", khóa cả 2 nút.
 *
 * Hành vi chung: autofocus nút Hủy (hoặc nút xác nhận khi singleButton),
 * ESC / bấm nền mờ → onCancel (trừ nonDismissable), focus trap trong dialog,
 * role="alertdialog" aria-modal="true". Message dạng string có dấu **...**
 * sẽ render phần đó in đậm (xem boldParts trong messages.vi).
 */

import React, { useEffect, useId, useRef, useState } from 'react';
import { Info, Trash2, TriangleAlert } from 'lucide-react';
import { boldParts, messages } from './messages.vi';

export type ConfirmVariant = 'danger' | 'warning' | 'info';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Nội dung — ReactNode, hoặc string có **...** để in đậm tên/mã. */
  message: React.ReactNode;
  confirmText: string;
  cancelText: string;
  variant: ConfirmVariant;
  /** Hiện dòng đỏ "Hành động này không thể hoàn tác." (popup xóa). */
  irreversible?: boolean;
  /** Bắt buộc nhập lý do trước khi xác nhận (khóa, hủy đơn, từ chối...). */
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** Chuỗi lỗi hiện khi bấm Xác nhận mà lý do còn trống. */
  reasonError?: string;
  /** Giới hạn ký tự ô lý do + hiện bộ đếm "{n}/{max}" (B1: 300). */
  reasonMaxLength?: number;
  /** Bắt buộc gõ đúng chuỗi xác nhận (vd "XOA") — nút xác nhận khóa tới khi gõ đúng. */
  requireTypeToConfirm?: boolean;
  typeLabel?: string;
  /** Chuỗi phải gõ đúng khi requireTypeToConfirm (vd "XOA"). So sánh sau
   *  trim + lowercase nên không phân biệt hoa thường (A7). */
  typeExpected?: string;
  /** Chỉ 1 nút xác nhận, ẩn hẳn nút Hủy (A3 chặn xóa DM, G4 phiên hết hạn). */
  singleButton?: boolean;
  /** Không đóng được bằng ESC hay bấm nền mờ (G4 phiên hết hạn). */
  nonDismissable?: boolean;
  /** Link phụ dưới nội dung (A3 "Xem sản phẩm trong danh mục"): bấm thì gọi
   *  onClick — caller tự đóng popup + điều hướng (không resolve confirmed). */
  linkAction?: { label: string; onClick: () => void };
  loading?: boolean;
  /** Lỗi máy chủ hiện trong popup (không đóng popup). */
  error?: string | null;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}

const VARIANT_ICON: Record<ConfirmVariant, React.ReactNode> = {
  danger: <Trash2 size={24} strokeWidth={2} aria-hidden="true" />,
  warning: <TriangleAlert size={24} strokeWidth={2} aria-hidden="true" />,
  info: <Info size={24} strokeWidth={2} aria-hidden="true" />,
};

const VARIANT_LABEL: Record<ConfirmVariant, string> = {
  danger: 'Xác nhận xóa',
  warning: 'Cảnh báo',
  info: 'Xác nhận',
};

function renderMessage(message: React.ReactNode): React.ReactNode {
  if (typeof message !== 'string') return message;
  const parts = boldParts(message);
  return parts.map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : <React.Fragment key={i}>{p.text}</React.Fragment>));
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const {
    open, title, message, confirmText, cancelText, variant,
    irreversible, requireReason, reasonLabel, reasonPlaceholder, reasonError,
    reasonMaxLength, requireTypeToConfirm, typeLabel, typeExpected,
    singleButton, nonDismissable, linkAction, loading, error,
    onConfirm, onCancel,
  } = props;
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [reason, setReason] = useState('');
  const [typeInput, setTypeInput] = useState('');
  const [reasonTouchedError, setReasonTouchedError] = useState<string | null>(null);

  // Reset ô nhập mỗi lần mở lại.
  useEffect(() => {
    if (open) {
      setReason('');
      setTypeInput('');
      setReasonTouchedError(null);
    }
  }, [open ]);

  // Autofocus nút Hủy khi mở (1 nút thì focus nút xác nhận); ESC → hủy
  // (trừ nonDismissable); focus trap; trả focus khi đóng.
  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    // Autofocus nút Hủy (không phải nút xác nhận — tránh bấm nhầm). Popup
    // 1 nút (A3/G4) thì focus luôn nút xác nhận duy nhất.
    if (singleButton) confirmRef.current?.focus();
    else cancelRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (!loading && !nonDismissable) onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      const el = dialogRef.current;
      if (!el) return;
      const list = Array.from(
        el.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      prevActive?.focus?.();
    };
    // onCancel ổn định qua caller; chỉ chạy khi open/loading đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  if (!open) return null;

  const typeMismatch =
    !!requireTypeToConfirm &&
    typeInput.trim().toLowerCase() !== (typeExpected ?? '').trim().toLowerCase();
  const confirmDisabled = !!loading || typeMismatch;

  const handleConfirm = () => {
    if (loading) return;
    if (requireReason && reason.trim() === '') {
      setReasonTouchedError(reasonError ?? 'Vui lòng nhập lý do.');
      document.getElementById(`${messageId}-reason`)?.focus();
      return;
    }
    if (typeMismatch) return;
    onConfirm(requireReason ? reason.trim() : undefined);
  };

  return (
    <div
      className="sa-confirm-overlay"
      onMouseDown={e => {
        // Bấm nền mờ (không phải bấm vào dialog) → hủy (trừ popup không đóng được, G4).
        if (e.target === e.currentTarget && !loading && !nonDismissable) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="sa-confirm-dialog"
        data-testid="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        <span
          className={`sa-confirm-icon sa-confirm-icon--${variant}`}
          aria-hidden="true"
          title={VARIANT_LABEL[variant]}
        >
          {VARIANT_ICON[variant]}
        </span>
        <h2 className="sa-confirm-title" id={titleId} data-testid="confirm-dialog-title">
          {title}
        </h2>
        <div className="sa-confirm-message" id={messageId} data-testid="confirm-dialog-message">
          {renderMessage(message)}
        </div>

        {linkAction && (
          <button
            type="button"
            className="sa-confirm-link"
            data-testid="confirm-dialog-link"
            disabled={loading}
            onClick={() => linkAction.onClick()}
            style={{
              display: 'block', margin: '-8px auto 16px', padding: 0,
              border: 'none', background: 'none', cursor: 'pointer',
              font: 'inherit', fontSize: 14, fontWeight: 600,
              color: 'var(--sa-info)', textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            {linkAction.label}
          </button>
        )}

        {requireReason && (
          <div className="sa-confirm-field">
            <label className="sa-confirm-label" htmlFor={`${messageId}-reason`}>
              {reasonLabel ?? 'Lý do'}
            </label>
            <textarea
              id={`${messageId}-reason`}
              className={`sa-input sa-confirm-reason${reasonTouchedError ? ' sa-input-error' : ''}`}
              data-testid="confirm-dialog-reason-input"
              value={reason}
              placeholder={reasonPlaceholder}
              rows={3}
              maxLength={reasonMaxLength}
              disabled={loading}
              aria-invalid={!!reasonTouchedError}
              aria-describedby={reasonTouchedError ? `${messageId}-reason-error` : undefined}
              onChange={e => {
                setReason(e.target.value);
                if (reasonTouchedError) setReasonTouchedError(null);
              }}
            />
            {reasonMaxLength != null && (
              <p
                className="sa-confirm-counter"
                data-testid="confirm-dialog-reason-counter"
                aria-live="off"
                style={{
                  margin: '4px 0 0', fontSize: 12, lineHeight: '16px',
                  color: 'var(--sa-text-muted)', textAlign: 'right',
                }}
              >
                {reason.length}/{reasonMaxLength}
              </p>
            )}
            {reasonTouchedError && (
              <p
                className="sa-field-error"
                id={`${messageId}-reason-error`}
                data-testid="confirm-dialog-reason-error"
                role="alert"
              >
                <TriangleAlert size={14} aria-hidden="true" /> {reasonTouchedError}
              </p>
            )}
          </div>
        )}

        {requireTypeToConfirm && (
          <div className="sa-confirm-field">
            <label className="sa-confirm-label" htmlFor={`${messageId}-type`}>
              {typeLabel ?? 'Nhập để xác nhận'}
            </label>
            <input
              id={`${messageId}-type`}
              className="sa-input sa-confirm-type"
              data-testid="confirm-dialog-type-input"
              value={typeInput}
              placeholder={typeExpected ?? ''}
              disabled={loading}
              autoComplete="off"
              onChange={e => setTypeInput(e.target.value)}
            />
          </div>
        )}

        {irreversible && (
          <p className="sa-confirm-irreversible">{messages.validate.irreversible}</p>
        )}

        {error && (
          <p className="sa-confirm-error" data-testid="confirm-dialog-error" role="alert">
            {error}
          </p>
        )}

        {/* Mặc định ĐÚNG 2 NÚT — không bao giờ thêm nút thứ ba. Ngoại lệ
            spec A–H: singleButton (A3/G4) chỉ còn 1 nút xác nhận. */}
        <div className="sa-confirm-actions">
          {!singleButton && (
            <button
              ref={cancelRef}
              type="button"
              className="sa-confirm-cancel-btn"
              data-testid="confirm-dialog-cancel-btn"
              disabled={loading}
              onClick={onCancel}
            >
              {cancelText}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            className={`sa-confirm-confirm-btn sa-confirm-confirm-btn--${variant}`}
            data-testid="confirm-dialog-confirm-btn"
            disabled={confirmDisabled}
            onClick={handleConfirm}
          >
            {loading ? 'Đang xử lý...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- confirmAction: popup theo kiểu await, dùng host queue ----------

export interface ConfirmActionOptions {
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  irreversible?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonError?: string;
  reasonMaxLength?: number;
  requireTypeToConfirm?: boolean;
  typeLabel?: string;
  typeExpected?: string;
  /** Chỉ 1 nút xác nhận, ẩn hẳn nút Hủy (A3, G4). */
  singleButton?: boolean;
  /** Không đóng được bằng ESC hay bấm nền mờ (G4). */
  nonDismissable?: boolean;
  /** Nhãn link phụ dưới nội dung (A3) — kèm onLinkClick. */
  linkLabel?: string;
  /** Bấm link phụ: đóng popup, resolve { confirmed: false }, rồi gọi callback. */
  onLinkClick?: () => void;
}

interface PendingRequest extends ConfirmActionOptions {
  resolve: (result: { confirmed: boolean; reason?: string }) => void;
}

const hostListeners = new Set<(req: PendingRequest | null) => void>();
let currentRequest: PendingRequest | null = null;
const requestQueue: PendingRequest[] = [];

function publishCurrent() {
  hostListeners.forEach(l => l(currentRequest));
}

function showNext() {
  currentRequest = requestQueue.shift() ?? null;
  publishCurrent();
}

/**
 * Mở popup xác nhận và chờ kết quả. Trả { confirmed: true, reason? } khi
 * bấm nút xác nhận, { confirmed: false } khi bấm Hủy / ESC / nền mờ.
 * Cần <ConfirmDialogHost /> đã mount ở gốc AdminPage; nếu chưa mount thì
 * promise treo tới khi host mount và hiện popup (không tự tạo host).
 */
export function confirmAction(
  options: ConfirmActionOptions,
): Promise<{ confirmed: boolean; reason?: string }> {
  return new Promise(resolve => {
    requestQueue.push({ cancelText: 'Hủy', variant: 'warning', ...options, resolve });
    if (!currentRequest) showNext();
  });
}

export function ConfirmDialogHost() {
  const [current, setCurrent] = useState<PendingRequest | null>(currentRequest);
  // BUG #1: mỗi request chỉ được settle đúng 1 lần. ESC + click, bấm nền mờ
  // + click, hoặc double-click có thể gọi onConfirm/onCancel 2 lần trong
  // cùng 1 tick; lần gọi thứ 2 mà chạy showNext() thừa sẽ bật/nuốt mất
  // dialog đang xếp hàng tiếp theo (và để lại dialog tồn đọng). Guard theo
  // đúng object request đang hiện — request mới là object khác nên không
  // bị chặn.
  const settledRef = useRef<PendingRequest | null>(null);

  useEffect(() => {
    hostListeners.add(setCurrent);
    // Host mount sau khi đã có request chờ → hiện ngay.
    setCurrent(currentRequest);
    return () => {
      hostListeners.delete(setCurrent);
    };
  }, []);

  if (!current) return null;

  const req = current;
  const settle = (result: { confirmed: boolean; reason?: string }) => {
    if (settledRef.current === req) return;
    settledRef.current = req;
    showNext();
    req.resolve(result);
  };
  const handleConfirm = (reason?: string) => {
    settle({ confirmed: true, reason });
  };
  const handleCancel = () => {
    settle({ confirmed: false });
  };

  return (
    <ConfirmDialog
      open
      title={req.title}
      message={req.message}
      confirmText={req.confirmText}
      cancelText={req.cancelText ?? 'Hủy'}
      variant={req.variant ?? 'warning'}
      irreversible={req.irreversible}
      requireReason={req.requireReason}
      reasonLabel={req.reasonLabel}
      reasonPlaceholder={req.reasonPlaceholder}
      reasonError={req.reasonError}
      reasonMaxLength={req.reasonMaxLength}
      requireTypeToConfirm={req.requireTypeToConfirm}
      typeLabel={req.typeLabel}
      typeExpected={req.typeExpected}
      singleButton={req.singleButton}
      nonDismissable={req.nonDismissable}
      linkAction={
        req.linkLabel
          ? {
            label: req.linkLabel,
            onClick: () => {
              // Đóng popup + resolve { confirmed: false } rồi mới điều hướng.
              // Qua settle() để double-click link không gọi showNext() thừa.
              settle({ confirmed: false });
              req.onLinkClick?.();
            },
          }
          : undefined
      }
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );
}
