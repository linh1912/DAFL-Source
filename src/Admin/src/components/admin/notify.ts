/**
 * notify — Kênh toast duy nhất của admin (đợt 18).
 *
 * Event emitter đơn giản: mọi chỗ trong admin gọi notify.success/warning/
 * error/info (hoặc notifyHttpError cho lỗi HTTP) thay vì tự quản state
 * toast riêng. ToastHost (Toast.tsx) subscribe và render.
 *
 * CÁCH DÙNG:
 *   import { notify } from './notify';
 *   import { messages, fmt, shortName } from './messages.vi';
 *
 *   notify.success(messages.toast.product.added.title,
 *     fmt(messages.toast.product.added.desc, { tên: shortName(p.name) }));
 *   notify.warning(messages.toast.promo.duplicateCode.title,
 *     messages.toast.promo.duplicateCode.desc);
 *
 *   // Lỗi HTTP — KHÔNG hiện mã HTTP, dùng bảng §4 trong messages.vi:
 *   notifyHttpError(res.status, body?.message);
 *   // 401 → toast "Phiên đăng nhập đã hết hạn": CALLER tự chuyển về trang
 *   // đăng nhập sau 3 giây (vd setTimeout(() => navigate('/login'), 3000)).
 *   // notifyHttpError KHÔNG tự redirect vì nó không biết router của caller.
 */

import { httpErrorMessage } from './messages.vi';

export type ToastKind = 'success' | 'warning' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  desc?: string;
}

type ToastListener = (toast: ToastItem) => void;

const listeners = new Set<ToastListener>();
let seq = 0;

/** ToastHost đăng ký để nhận toast mới. Trả hàm hủy đăng ký. */
export function subscribeToasts(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(kind: ToastKind, title: string, desc?: string): void {
  const toast: ToastItem = { id: ++seq, kind, title, desc: desc?.trim() ? desc : undefined };
  listeners.forEach(l => l(toast));
}

export const notify = {
  success(title: string, desc?: string): void {
    emit('success', title, desc);
  },
  warning(title: string, desc?: string): void {
    emit('warning', title, desc);
  },
  error(title: string, desc?: string): void {
    emit('error', title, desc);
  },
  info(title: string, desc?: string): void {
    emit('info', title, desc);
  },
};

/**
 * Hiện toast lỗi từ một lỗi HTTP theo bảng §4 (messages.vi):
 * mất mạng → "Mất kết nối", 401 → "Phiên đăng nhập đã hết hạn"...
 * Nếu API trả message nghiệp vụ tiếng Việt thì ưu tiên message đó ở mô tả.
 * KHÔNG hiện mã HTTP trong toast.
 */
export function notifyHttpError(status?: number, apiMessage?: string): void {
  const { title, desc } = httpErrorMessage(status, apiMessage);
  notify.error(title, desc);
}
