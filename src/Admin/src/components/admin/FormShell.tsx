import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import './form-shell.css';

/**
 * FormShell — Khung Drawer dùng chung cho MỌI form admin (đợt 18 wave D,
 * Matthew chốt 17:42 — XÓA HẲN chế độ Modal giữa màn hình, ghi đè W2).
 *
 *   FormShell({ width?, title, description?, onClose, footer, children, testid })
 *   - Drawer trượt từ phải, bề rộng theo `width`: Sản phẩm 760px, các form
 *     còn lại (Danh mục / Khuyến mãi / Khách hàng / xem chi tiết đơn, trả hàng,
 *     hoàn tiền, đánh giá) 680px; mặc định 680px khi không truyền width.
 *   - Backdrop mờ + blur, animation 200ms, ESC đóng, header cột flex
 *     (tiêu đề + mô tả) + nút X tách riêng bên phải, body cuộn được, footer cố định.
 *   - Mobile (< 900px): bottom sheet 95vh.
 *   - Testids: `{testid}` container, `{testid}-close-btn`, `{testid}-title`.
 *   - Prop `mode` ('drawer' | 'modal') ĐÃ XÓA — mọi call site dùng `width`.
 *
 * Thêm 2 prop tùy chọn ngoài contract (để AdminForms dùng, W3 không cần động vào):
 *   - `formTestid`: data-testid của <form>/<div> bên trong (vd "admin-product-form").
 *   - `formMode`: giá trị cho thuộc tính data-form-mode="create|edit|view".
 *   - `onSubmit`: khi có -> nội dung bọc trong <form> (create/edit); khi không có
 *     (chế độ xem) -> bọc trong <div>, KHÔNG gắn submit, Enter không làm gì.
 * Đóng bằng ESC/X/footer đều đi qua onClose — cha quyết định có hỏi "chưa lưu"
 * không (onRequestClose(dirty)); KHÔNG đóng khi bấm ra ngoài overlay (tránh mất
 * dữ liệu đang nhập). Trap focus + autofocus ô đầu tiên, trả focus khi đóng.
 */
export interface FormShellProps {
  /** Bề rộng Drawer (px): 760 cho form Sản phẩm, 680 cho các form còn lại. Mặc định 680. */
  width?: number;
  title: string;
  description?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  testid: string;
  formTestid?: string;
  formMode?: 'create' | 'edit' | 'view';
  onSubmit?: (e: React.FormEvent) => void;
}

export function FormShell({ width, title, description, onClose, footer, children, testid, formTestid, formMode, onSubmit }: FormShellProps) {
  const titleId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(el.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ));
    // Autofocus ô nhập đầu tiên khi mở (không phải nút X ở header).
    const firstField = el.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
    (firstField ?? focusables()[0])?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCloseRef.current(); return; }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      prevActive?.focus?.();
    };
    // Chỉ chạy 1 lần khi mount (mở form).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inner = (
    <>
      <div className="fs-head">
        <div className="fs-head-text">
          <h3 id={titleId} data-testid={`${testid}-title`}>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        <button
          type="button"
          className="fs-close"
          data-testid={`${testid}-close-btn`}
          onClick={onClose}
          aria-label="Đóng"
          title="Đóng"
        >
          <X size={18} strokeWidth={2} />
        </button>
      </div>
      <div className="fs-body">{children}</div>
      {footer && <div className="fs-foot">{footer}</div>}
    </>
  );

  return (
    <div className="fs-overlay">
      <div
        ref={containerRef}
        className="fs-drawer"
        style={{ '--fs-width': `${width ?? 680}px` } as React.CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testid}
      >
        {onSubmit ? (
          <form onSubmit={onSubmit} data-testid={formTestid} data-form-mode={formMode} noValidate className="fs-shell">
            {inner}
          </form>
        ) : (
          <div data-testid={formTestid} data-form-mode={formMode} className="fs-shell">
            {inner}
          </div>
        )}
      </div>
    </div>
  );
}
