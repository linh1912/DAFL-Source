/**
 * Toast — Host toast duy nhất của admin (đợt 18).
 *
 * Mount MỘT LẦN ở gốc AdminPage (trong .spark-admin, xem hướng dẫn ở cuối
 * file design-tokens.css / báo cáo bàn giao W1). Mọi chỗ khác chỉ gọi
 * notify.* — KHÔNG tự render toast riêng, KHÔNG giữ state toast cũ nữa.
 *
 * Hành vi (theo contract W1):
 * - Tối đa 3 toast, toast mới ở trên cùng, toast giống hệt (cùng loại +
 *   tiêu đề + mô tả) không hiện trùng.
 * - Tự ẩn: 4s (success/info), 6s (warning), 8s (lỗi); hover tạm dừng
 *   cả đếm ngược lẫn thanh tiến trình; trượt từ phải vào 200ms.
 * - Vị trí: fixed góc trên phải, KHÔNG đẩy nội dung trang.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Check, Info, TriangleAlert, X } from 'lucide-react';
import { subscribeToasts, type ToastItem, type ToastKind } from './notify';

const DURATION_MS: Record<ToastKind, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 8000,
};

/** Icon Lucide đơn sắc theo loại toast (đợt 18, 17:42 — không emoji/dingbat). */
const ICON: Record<ToastKind, React.ReactNode> = {
  success: <Check size={16} strokeWidth={2.5} aria-hidden="true" />,
  warning: <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" />,
  error: <X size={16} strokeWidth={2.5} aria-hidden="true" />,
  info: <Info size={16} strokeWidth={2} aria-hidden="true" />,
};

const ICON_LABEL: Record<ToastKind, string> = {
  success: 'Thành công',
  warning: 'Cảnh báo',
  error: 'Lỗi',
  info: 'Thông tin',
};

const MAX_TOASTS = 3;

function ToastCard({ toast, onClose }: { toast: ToastItem; onClose: (id: number) => void }) {
  const duration = DURATION_MS[toast.kind];
  const timerRef = useRef<number | null>(null);
  const deadlineRef = useRef<number>(Date.now() + duration);
  const remainingRef = useRef<number>(duration);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const arm = () => {
      deadlineRef.current = Date.now() + remainingRef.current;
      timerRef.current = window.setTimeout(() => onClose(toast.id), remainingRef.current);
    };
    arm();
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // Chỉ chạy khi mount; onClose ổn định (useCallback ở host).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pause = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    remainingRef.current = Math.max(0, deadlineRef.current - Date.now());
    setPaused(true);
  };
  const resume = () => {
    deadlineRef.current = Date.now() + remainingRef.current;
    timerRef.current = window.setTimeout(() => onClose(toast.id), remainingRef.current);
    setPaused(false);
  };

  const isAlert = toast.kind === 'error' || toast.kind === 'warning';

  return (
    <div
      className={`sa-toast-item sa-toast-item--${toast.kind}${paused ? ' sa-toast-item--paused' : ''}`}
      data-testid="admin-toast"
      data-toast-kind={toast.kind}
      role={isAlert ? 'alert' : 'status'}
      aria-live={isAlert ? 'assertive' : 'polite'}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <span className="sa-toast-icon" aria-hidden="true" title={ICON_LABEL[toast.kind]}>
        {ICON[toast.kind]}
      </span>
      <div className="sa-toast-body">
        <p className="sa-toast-title" data-testid="admin-toast-title">
          {toast.title}
        </p>
        {toast.desc && (
          <p className="sa-toast-desc" data-testid="admin-toast-desc">
            {toast.desc}
          </p>
        )}
      </div>
      <button
        type="button"
        className="sa-toast-close"
        data-testid="admin-toast-close"
        aria-label="Đóng thông báo"
        title="Đóng"
        onClick={() => onClose(toast.id)}
      >
        <X size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      <span
        className="sa-toast-progress"
        aria-hidden="true"
        style={{ animationDuration: `${duration}ms` }}
      />
    </div>
  );
}

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribeToasts(incoming => {
      setToasts(prev => {
        // Không trùng lặp: cùng loại + tiêu đề + mô tả thì bỏ qua.
        if (prev.some(t => t.kind === incoming.kind && t.title === incoming.title && t.desc === incoming.desc)) {
          return prev;
        }
        // Mới ở trên, tối đa 3.
        return [incoming, ...prev].slice(0, MAX_TOASTS);
      });
    });
  }, []);

  const dismiss = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <div className="sa-toast-host" data-testid="toast-host" aria-label="Thông báo hệ thống">
      {toasts.map(t => (
        <ToastCard key={t.id} toast={t} onClose={dismiss} />
      ))}
    </div>
  );
}
