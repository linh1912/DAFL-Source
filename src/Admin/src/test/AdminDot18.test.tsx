import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminPage from '../components/admin/AdminPage';
import { ConfirmDialog, ConfirmDialogHost, confirmAction } from '../components/admin/ConfirmDialog';
import { ToastHost } from '../components/admin/Toast';
import { notify } from '../components/admin/notify';
import { messages, fmt, httpErrorMessage, shortName } from '../components/admin/messages.vi';

/**
 * Đợt 18 — test mới cho shared (messages.vi / notify / ToastHost /
 * ConfirmDialog), menu phẳng + badge, form XEM khuyến mãi, footer chi tiết
 * đơn có điều kiện, modal trả hàng, modal đổi mật khẩu, popup hội viên.
 * Đợt 18 wave D (17:42): menu PHẲNG (không dropdown), form CHỈ Drawer rộng,
 * popup spec A–H — các test cũ theo UI dropdown/Modal đã viết lại ở đây.
 */

const respond = (status: number, body: unknown) =>
  Promise.resolve({ status, json: () => Promise.resolve(body) } as unknown as Response);

const adminProfile = { id: 'admin-1', email: 'admin@dafl.vn', fullName: 'Super Admin', role: 'SuperAdmin' };

// ============================================================================
// A. messages.vi — fmt / httpErrorMessage / shortName (unit, không cần render)
// ============================================================================
describe('messages.vi (đợt 18)', () => {
  it('fmt: thay mọi placeholder {tên} {mã} {n}; placeholder lạ giữ nguyên', () => {
    expect(fmt(messages.toast.product.added.desc, { tên: 'Son kem 3CE' }))
      .toBe("Sản phẩm 'Son kem 3CE' đã được thêm vào danh sách.");
    expect(fmt(messages.confirm.deletePromo.message, { mã: 'SALE10' }))
      .toBe('Bạn sắp xóa mã **SALE10**. Khách hàng sẽ không thể sử dụng mã này nữa. Hành động này không thể hoàn tác.');
    expect(fmt('Đơn {mã đơn} chuyển sang {trạng thái}.', { 'mã đơn': 'DH-1001', 'trạng thái': 'Đã xác nhận' }))
      .toBe('Đơn DH-1001 chuyển sang Đã xác nhận.');
    // Placeholder không có trong params (lựa chọn "A | B") được giữ nguyên văn.
    expect(fmt('{cộng | trừ} {n} điểm', { n: 50 })).toBe('{cộng | trừ} 50 điểm');
    expect(fmt('{cộng | trừ} {n} điểm', { 'cộng | trừ': 'Cộng', n: 50 })).toBe('Cộng 50 điểm');
  });

  it('httpErrorMessage: map đúng bảng §4, KHÔNG bao giờ lộ mã HTTP hay chữ kỹ thuật', () => {
    expect(httpErrorMessage(0)).toEqual({ title: 'Mất kết nối', desc: 'Vui lòng kiểm tra mạng và thử lại.' });
    expect(httpErrorMessage(undefined)).toEqual({ title: 'Mất kết nối', desc: 'Vui lòng kiểm tra mạng và thử lại.' });
    expect(httpErrorMessage(400)).toEqual({ title: 'Dữ liệu chưa hợp lệ', desc: 'Vui lòng kiểm tra lại các trường được đánh dấu.' });
    expect(httpErrorMessage(422).title).toBe('Dữ liệu chưa hợp lệ');
    expect(httpErrorMessage(401)).toEqual({ title: 'Phiên đăng nhập đã hết hạn', desc: 'Vui lòng đăng nhập lại để tiếp tục.' });
    expect(httpErrorMessage(403)).toEqual({ title: 'Bạn không có quyền thực hiện', desc: 'Vui lòng liên hệ quản trị viên cấp cao.' });
    expect(httpErrorMessage(404)).toEqual({ title: 'Không tìm thấy dữ liệu', desc: 'Bản ghi có thể đã bị xóa. Danh sách sẽ được làm mới.' });
    expect(httpErrorMessage(409).title).toBe('Dữ liệu đã thay đổi');
    expect(httpErrorMessage(413).title).toBe('Tệp quá lớn');
    expect(httpErrorMessage(429).title).toBe('Thao tác quá nhanh');
    expect(httpErrorMessage(500)).toEqual({ title: 'Hệ thống đang gặp sự cố', desc: 'Chúng tôi chưa thể xử lý yêu cầu. Vui lòng thử lại sau.' });
    expect(httpErrorMessage(502).title).toBe('Hệ thống đang gặp sự cố');
    expect(httpErrorMessage(999).title).toBe('Đã xảy ra lỗi');
    // Message nghiệp vụ tiếng Việt của API được ưu tiên ở phần mô tả...
    expect(httpErrorMessage(400, 'Mã sản phẩm đã tồn tại.'))
      .toEqual({ title: 'Dữ liệu chưa hợp lệ', desc: 'Mã sản phẩm đã tồn tại.' });
    // ...nhưng message chứa chữ kỹ thuật thô thì bị bỏ, dùng mô tả mặc định.
    expect(httpErrorMessage(500, 'NullReferenceException at /api/admin/products'))
      .toEqual({ title: 'Hệ thống đang gặp sự cố', desc: 'Chúng tôi chưa thể xử lý yêu cầu. Vui lòng thử lại sau.' });
    expect(httpErrorMessage(500, 'Lỗi 500 ở endpoint /api/x')).toEqual({
      title: 'Hệ thống đang gặp sự cố', desc: 'Chúng tôi chưa thể xử lý yêu cầu. Vui lòng thử lại sau.',
    });
  });

  it('shortName: tên dài quá 40 ký tự thì cắt + "...", tên ngắn giữ nguyên', () => {
    expect(shortName('Son kem 3CE')).toBe('Son kem 3CE');
    const long = 'a'.repeat(50);
    expect(shortName(long)).toBe(`${'a'.repeat(40)}...`);
  });

  it('tiêu đề popup: câu hỏi kết thúc bằng "?", TRỪ 4 tiêu đề khẳng định chặn (A3/A5/C5/G4); mọi tiêu đề toast không có dấu "!"', () => {
    // Ngoại lệ spec A–H (đợt 18 wave D): tiêu đề chặn là câu khẳng định,
    // KHÔNG có "?": A3 chặn xóa DM, A5 chặn xóa KM, C5 chặn bật KM hết hạn,
    // G4 phiên hết hạn. Mọi tiêu đề popup còn lại phải là câu hỏi "?".
    const ASSERTION_TITLES = new Set([
      messages.confirm.deleteCategoryBlocked.title, // A3 'Không thể xóa danh mục'
      messages.confirm.deletePromoBlocked.title, // A5 'Không thể xóa khuyến mãi'
      messages.confirm.enablePromoBlocked.title, // C5 'Khuyến mãi đã hết hạn'
      messages.confirm.sessionExpired.title, // G4 'Phiên đăng nhập đã hết hạn'
    ]);
    expect(ASSERTION_TITLES.size).toBe(4);
    for (const c of Object.values(messages.confirm)) {
      if (ASSERTION_TITLES.has(c.title)) continue;
      expect(c.title.endsWith('?')).toBe(true);
    }
    // Ngoại lệ 22:37: toast toggle đổi trạng thái (SP/DM/KM) do Matthew viết
    // tay, title CÓ "!" — chỉ đúng 3 chuỗi này được phép chứa "!".
    expect(messages.toast.product.statusChanged.title).toBe('Đổi trạng thái sản phẩm thành công!');
    expect(messages.toast.category.statusChanged.title).toBe('Đổi trạng thái danh mục thành công!');
    expect(messages.toast.promo.statusChanged.title).toBe('Đổi trạng thái khuyến mãi thành công!');
    const ALLOWED_BANG = new Set([
      'Đổi trạng thái sản phẩm thành công!',
      'Đổi trạng thái danh mục thành công!',
      'Đổi trạng thái khuyến mãi thành công!',
    ]);
    const walk = (o: unknown): void => {
      if (typeof o === 'string') {
        if (ALLOWED_BANG.has(o)) return;
        expect(o).not.toContain('!');
        return;
      }
      if (o && typeof o === 'object') Object.values(o as Record<string, unknown>).forEach(walk);
    };
    walk(messages.toast);
    walk(messages.http);
  });
});

// ============================================================================
// B. ConfirmDialog — component trực tiếp (đúng 2 nút, lý do, gõ XOA, ESC)
// ============================================================================
describe('ConfirmDialog (đợt 18)', () => {
  const base = {
    open: true,
    title: 'Xóa sản phẩm?',
    message: 'Bạn sắp xóa sản phẩm **Son kem 3CE**. Hành động này không thể hoàn tác.',
    confirmText: 'Xóa sản phẩm',
    cancelText: 'Hủy',
    variant: 'danger' as const,
  };

  it('footer CHỈ đúng 2 nút [Hủy] + [Xác nhận]; Hủy gọi onCancel, Xác nhận gọi onConfirm', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...base} onCancel={onCancel} onConfirm={onConfirm} />);
    const dialog = screen.getByTestId('confirm-dialog');
    expect(dialog).toHaveAttribute('role', 'alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getAllByRole('button')).toHaveLength(2);
    expect(screen.getByTestId('confirm-dialog-cancel-btn')).toHaveTextContent('Hủy');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Xóa sản phẩm');
    // Tên in đậm trong message render bằng <strong>.
    expect(within(screen.getByTestId('confirm-dialog-message')).getByText('Son kem 3CE').tagName).toBe('STRONG');
    // Nút Hủy được autofocus (tránh bấm nhầm nút xác nhận).
    expect(screen.getByTestId('confirm-dialog-cancel-btn')).toHaveFocus();

    fireEvent.click(screen.getByTestId('confirm-dialog-cancel-btn'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('irreversible: hiện dòng đỏ "Hành động này không thể hoàn tác."', () => {
    render(<ConfirmDialog {...base} irreversible onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.getByTestId('confirm-dialog')).toHaveTextContent('Hành động này không thể hoàn tác.');
  });

  it('requireReason: xác nhận khi lý do trống thì báo lỗi, không gọi onConfirm; nhập lý do thì gọi kèm lý do', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        {...base}
        title="Khóa tài khoản?"
        confirmText="Khóa tài khoản"
        variant="warning"
        requireReason
        reasonLabel="Lý do khóa"
        reasonPlaceholder="Nhập lý do khóa tài khoản..."
        reasonError="Vui lòng nhập lý do khóa."
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByTestId('confirm-dialog-reason-input')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    expect(screen.getByTestId('confirm-dialog-reason-error')).toHaveTextContent('Vui lòng nhập lý do khóa.');
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('confirm-dialog-reason-input'), { target: { value: 'Vi phạm điều khoản' } });
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    expect(onConfirm).toHaveBeenCalledWith('Vi phạm điều khoản');
  });

  it('requireTypeToConfirm XOA (A7): gõ XOA KHÔNG phân biệt hoa thường — "Xoa"/"xoa"/" XOA " đều mở nút (KHÔNG có UI xóa KH — test ở cấp component)', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        {...base}
        title="Xóa tài khoản?"
        message="Bạn sắp xóa tài khoản **Lan Anh** (lan@example.com)."
        confirmText="Xóa tài khoản"
        requireTypeToConfirm
        typeLabel="Nhập XOA để xác nhận"
        typeExpected="XOA"
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );
    const confirmBtn = screen.getByTestId('confirm-dialog-confirm-btn');
    const typeInput = screen.getByTestId('confirm-dialog-type-input');
    expect(confirmBtn).toBeDisabled();
    // Gõ sai chuỗi thì nút vẫn khóa.
    fireEvent.change(typeInput, { target: { value: 'XO' } });
    expect(confirmBtn).toBeDisabled();
    fireEvent.click(confirmBtn);
    expect(onConfirm).not.toHaveBeenCalled();
    // A7: không phân biệt hoa thường — "Xoa" mở nút (test cũ assert ngược là SAI).
    fireEvent.change(typeInput, { target: { value: 'Xoa' } });
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.change(typeInput, { target: { value: 'xoa' } });
    expect(confirmBtn).not.toBeDisabled();
    // Khoảng trắng thừa vẫn tính là đúng (trim).
    fireEvent.change(typeInput, { target: { value: ' XOA ' } });
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('ESC gọi onCancel; loading khóa cả 2 nút và hiện "Đang xử lý..."', () => {
    const onCancel = vi.fn();
    const { rerender } = render(<ConfirmDialog {...base} onCancel={onCancel} onConfirm={() => {}} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(<ConfirmDialog {...base} loading onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toBeDisabled();
    expect(screen.getByTestId('confirm-dialog-cancel-btn')).toBeDisabled();
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Đang xử lý...');
  });

  it('confirmAction + ConfirmDialogHost: Hủy resolve {confirmed:false}, Xác nhận resolve {confirmed:true, reason}', async () => {
    render(<ConfirmDialogHost />);
    let p1: Promise<{ confirmed: boolean; reason?: string }>;
    act(() => {
      p1 = confirmAction({ title: 'Xóa sản phẩm?', message: 'Xóa?', confirmText: 'Xóa sản phẩm' });
    });
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel-btn'));
    await expect(p1!).resolves.toEqual({ confirmed: false });

    let p2: Promise<{ confirmed: boolean; reason?: string }>;
    act(() => {
      p2 = confirmAction({
        title: 'Khóa tài khoản?',
        message: 'Khóa?',
        confirmText: 'Khóa tài khoản',
        requireReason: true,
        reasonLabel: 'Lý do khóa',
        reasonError: 'Vui lòng nhập lý do khóa.',
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog-reason-input')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('confirm-dialog-reason-input'), { target: { value: 'Spam' } });
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await expect(p2!).resolves.toEqual({ confirmed: true, reason: 'Spam' });
  });
});

// ============================================================================
// B2. ConfirmDialog — spec A–H (đợt 18 wave D): popup chặn 1 nút, link phụ,
// bộ đếm lý do 300, G4 không đóng được, lỗi server trong popup, "Đang xử lý..."
// ============================================================================
describe('ConfirmDialog — spec A–H (đợt 18 wave D)', () => {
  const base = {
    open: true,
    title: 'Xóa sản phẩm?',
    message: 'Bạn sắp xóa sản phẩm **Son kem 3CE**. Hành động này không thể hoàn tác.',
    confirmText: 'Xóa sản phẩm',
    cancelText: 'Hủy',
    variant: 'danger' as const,
  };

  it('A3: popup chặn chỉ 1 nút [Đã hiểu] (singleButton) — không có nút Hủy, autofocus nút xác nhận', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        {...base}
        title={messages.confirm.deleteCategoryBlocked.title}
        message={fmt(messages.confirm.deleteCategoryBlocked.message, { tên: 'Son môi', n: 3 })}
        confirmText={messages.confirm.deleteCategoryBlocked.confirmText}
        variant="warning"
        singleButton
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    const dialog = screen.getByTestId('confirm-dialog');
    expect(within(dialog).getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByTestId('confirm-dialog-cancel-btn')).toBeNull();
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Không thể xóa danh mục');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('Danh mục Son môi đang có 3 sản phẩm');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Đã hiểu');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveFocus();
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('A3: link phụ "Xem sản phẩm trong danh mục" (confirm-dialog-link) — bấm link gọi onClick, KHÔNG gọi onConfirm', () => {
    const onConfirm = vi.fn();
    const onLinkClick = vi.fn();
    render(
      <ConfirmDialog
        {...base}
        title={messages.confirm.deleteCategoryBlocked.title}
        message="Danh mục **Son môi** đang có 3 sản phẩm."
        confirmText="Đã hiểu"
        variant="warning"
        singleButton
        linkAction={{ label: 'Xem sản phẩm trong danh mục', onClick: onLinkClick }}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByTestId('confirm-dialog-link')).toHaveTextContent('Xem sản phẩm trong danh mục');
    fireEvent.click(screen.getByTestId('confirm-dialog-link'));
    expect(onLinkClick).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('A5/C5/G5: nút trái [Đóng] + nút phải cụ thể — chặn xóa KM [Đóng][Tắt khuyến mãi], chặn bật KM [Đóng][Chỉnh sửa khuyến mãi], mất mạng [Đóng][Thử lại]', () => {
    const cases = [
      { title: messages.confirm.deletePromoBlocked.title, message: fmt(messages.confirm.deletePromoBlocked.message, { mã: 'SALE20', n: 5 }), confirmText: messages.confirm.deletePromoBlocked.confirmText, cancelText: 'Đóng' },
      { title: messages.confirm.enablePromoBlocked.title, message: fmt(messages.confirm.enablePromoBlocked.message, { mã: 'SALE20', ngày: '31/12/2026' }), confirmText: messages.confirm.enablePromoBlocked.confirmText, cancelText: 'Đóng' },
      { title: messages.confirm.offlineRetry.title, message: messages.confirm.offlineRetry.message, confirmText: messages.confirm.offlineRetry.confirmText, cancelText: 'Đóng' },
    ];
    for (const c of cases) {
      const onConfirm = vi.fn();
      const { unmount } = render(
        <ConfirmDialog {...base} title={c.title} message={c.message} confirmText={c.confirmText} cancelText={c.cancelText} variant="warning" onCancel={() => {}} onConfirm={onConfirm} />,
      );
      expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent(c.title);
      expect(screen.getByTestId('confirm-dialog-cancel-btn')).toHaveTextContent('Đóng');
      expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent(c.confirmText);
      expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(2);
      unmount();
    }
  });

  it('B1: lý do khóa bắt buộc, tối đa 300 ký tự, CÓ bộ đếm (confirm-dialog-reason-counter) "n/300"', () => {
    render(
      <ConfirmDialog
        {...base}
        title="Khóa tài khoản?"
        confirmText="Khóa tài khoản"
        variant="warning"
        requireReason
        reasonLabel={messages.validate.lockReasonLabel}
        reasonPlaceholder="Nhập lý do khóa tài khoản..."
        reasonError={messages.validate.lockReasonEmpty}
        reasonMaxLength={300}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByTestId('confirm-dialog-reason-counter')).toHaveTextContent('0/300');
    expect(screen.getByTestId('confirm-dialog-reason-input')).toHaveAttribute('maxLength', '300');
    fireEvent.change(screen.getByTestId('confirm-dialog-reason-input'), { target: { value: 'Vi phạm' } });
    expect(screen.getByTestId('confirm-dialog-reason-counter')).toHaveTextContent('7/300');
    // Nhập đúng 300 ký tự thì bộ đếm dừng ở 300/300; ô nhập có maxLength=300
    // nên trình duyệt không cho gõ thêm (jsdom không ép maxLength khi set
    // value qua fireEvent nên chỉ khẳng định thuộc tính + bộ đếm ở mức 300).
    fireEvent.change(screen.getByTestId('confirm-dialog-reason-input'), { target: { value: 'x'.repeat(300) } });
    expect(screen.getByTestId('confirm-dialog-reason-counter')).toHaveTextContent('300/300');
  });

  it('G4: phiên hết hạn chỉ 1 nút [Đăng nhập lại], KHÔNG đóng được bằng ESC hay bấm nền', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { container } = render(
      <ConfirmDialog
        {...base}
        title={messages.confirm.sessionExpired.title}
        message={messages.confirm.sessionExpired.message}
        confirmText={messages.confirm.sessionExpired.confirmText}
        variant="warning"
        singleButton
        nonDismissable
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(1);
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Đăng nhập lại');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    // Bấm nền mờ (overlay) cũng không đóng.
    fireEvent.mouseDown(container.querySelector('.sa-confirm-overlay')!);
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('G1/D1: nút trái tùy biến — [Ở lại][Thoát] (đóng form chưa lưu), [Giữ đơn hàng][Hủy đơn hàng] (D1)', () => {
    const { rerender } = render(
      <ConfirmDialog {...base} title={messages.confirm.discardForm.title} message={messages.confirm.discardForm.message} confirmText="Thoát" cancelText="Ở lại" variant="warning" onCancel={() => {}} onConfirm={() => {}} />,
    );
    expect(screen.getByTestId('confirm-dialog-cancel-btn')).toHaveTextContent('Ở lại');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Thoát');
    rerender(
      <ConfirmDialog {...base} title={messages.confirm.cancelOrder.title} message="Bạn sắp hủy đơn **DH-1001**." confirmText="Hủy đơn hàng" cancelText="Giữ đơn hàng" variant="warning" onCancel={() => {}} onConfirm={() => {}} />,
    );
    expect(screen.getByTestId('confirm-dialog-cancel-btn')).toHaveTextContent('Giữ đơn hàng');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Hủy đơn hàng');
  });

  it('lỗi server hiện đỏ trong popup (confirm-dialog-error), popup KHÔNG đóng; loading khóa 2 nút + "Đang xử lý..."', () => {
    const { rerender } = render(
      <ConfirmDialog {...base} error="Hệ thống đang gặp sự cố. Vui lòng thử lại sau." onCancel={() => {}} onConfirm={() => {}} />,
    );
    expect(screen.getByTestId('confirm-dialog-error')).toHaveTextContent('Hệ thống đang gặp sự cố');
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    rerender(
      <ConfirmDialog {...base} loading error={null} onCancel={() => {}} onConfirm={() => {}} />,
    );
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Đang xử lý...');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toBeDisabled();
    expect(screen.getByTestId('confirm-dialog-cancel-btn')).toBeDisabled();
  });

  it('messages A–H: E1 nêu tên SP + số lượng, F2/F3 tách cộng/trừ, H2 chỉ cần tiêu đề + số lượng, E2 variant cam (warning)', () => {
    expect(fmt(messages.confirm.approveReturn.message, { 'tên sản phẩm': 'Son kem 3CE', n: 2, 'mã đơn': 'DH-2001' }))
      .toBe('Bạn sắp chấp nhận yêu cầu trả hàng **Son kem 3CE × 2** của đơn **DH-2001**.');
    expect(messages.confirm.addPoints.title).toBe('Xác nhận cộng điểm?');
    expect(messages.confirm.addPoints.confirmText).toBe('Xác nhận cộng điểm');
    expect(messages.confirm.subtractPoints.title).toBe('Xác nhận trừ điểm?');
    expect(messages.confirm.subtractPoints.confirmText).toBe('Xác nhận trừ điểm');
    expect(fmt(messages.confirm.deleteBulk.title, { n: 3, loại: 'sản phẩm' })).toBe('Xóa 3 sản phẩm?');
    expect(messages.confirm.deleteBulk.message).not.toContain('**');
    // G3 đăng xuất: tiêu đề + nút xác nhận riêng.
    expect(messages.confirm.logout.title).toBe('Đăng xuất?');
    expect(messages.confirm.logout.confirmText).toBe('Đăng xuất');
    // D2/D3 tách riêng: đích Đã xác nhận khác đích khác.
    expect(messages.confirm.confirmOrder.title).toBe('Xác nhận đơn?');
    expect(messages.confirm.changeOrderStatus.title).toBe('Cập nhật trạng thái?');
  });

  it('confirmAction queue: popup chặn (A3) xong mới hiện popup sau — không tràn queue', async () => {
    render(<ConfirmDialogHost />);
    let p1: Promise<{ confirmed: boolean; reason?: string }>;
    let p2: Promise<{ confirmed: boolean; reason?: string }>;
    act(() => {
      p1 = confirmAction({ title: 'Không thể xóa danh mục', message: 'Chặn.', confirmText: 'Đã hiểu', singleButton: true });
      p2 = confirmAction({ title: 'Xóa sản phẩm?', message: 'Xóa?', confirmText: 'Xóa sản phẩm' });
    });
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Không thể xóa danh mục');
    });
    expect(screen.queryByTestId('confirm-dialog-cancel-btn')).toBeNull();
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await expect(p1!).resolves.toEqual({ confirmed: true });
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Xóa sản phẩm?');
    });
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel-btn'));
    await expect(p2!).resolves.toEqual({ confirmed: false });
  });
});

// ============================================================================
// C. ToastHost + notify — tối đa 3, chống trùng, tự ẩn đúng thời gian
// ============================================================================
describe('ToastHost + notify (đợt 18)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('tối đa 3 toast, toast mới ở trên cùng; toast trùng (cùng loại + tiêu đề + mô tả) không hiện lần 2', () => {
    render(<ToastHost />);
    act(() => {
      notify.success('Đã thêm sản phẩm', "Sản phẩm 'A' đã được thêm vào danh sách.");
      notify.success('Đã thêm sản phẩm', "Sản phẩm 'A' đã được thêm vào danh sách.");
      notify.success('Đã cập nhật sản phẩm', "Thay đổi của 'B' đã được lưu.");
      notify.warning('Tên sản phẩm đã tồn tại', 'Vui lòng dùng tên khác.');
      notify.error('Đã xảy ra lỗi', 'Vui lòng thử lại.');
    });
    const toasts = screen.getAllByTestId('admin-toast');
    expect(toasts).toHaveLength(3);
    // Mới nhất ở trên cùng.
    expect(toasts[0]).toHaveAttribute('data-toast-kind', 'error');
    expect(toasts[0]).toHaveTextContent('Đã xảy ra lỗi');
    expect(toasts[1]).toHaveAttribute('data-toast-kind', 'warning');
    expect(toasts[2]).toHaveAttribute('data-toast-kind', 'success');
    expect(screen.getAllByTestId('admin-toast-title').map(el => el.textContent)).not.toContain('Đã thêm sản phẩm');
    // Toast trùng chỉ hiện 1 lần: tổng số toast sau 2 lần notify giống hệt là 1.
    expect(screen.queryAllByText("Sản phẩm 'A' đã được thêm vào danh sách.")).toHaveLength(0);
  });

  it('tự ẩn đúng thời gian: success/info 4s, warning 6s, error 8s', () => {
    render(<ToastHost />);
    act(() => {
      notify.success('OK', 'Xong.');
      notify.warning('Cảnh báo', 'Chú ý.');
      notify.error('Lỗi', 'Hỏng.');
    });
    expect(screen.getAllByTestId('admin-toast')).toHaveLength(3);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getAllByTestId('admin-toast')).toHaveLength(2);
    expect(screen.queryByText('OK')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getAllByTestId('admin-toast')).toHaveLength(1);
    expect(screen.queryByText('Cảnh báo')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByTestId('admin-toast')).toBeNull();
  });

  it('bấm nút đóng thì toast biến mất ngay', () => {
    render(<ToastHost />);
    act(() => {
      notify.success('OK', 'Xong.');
    });
    expect(screen.getByTestId('admin-toast')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('admin-toast-close'));
    expect(screen.queryByTestId('admin-toast')).toBeNull();
  });
});

// ============================================================================
// D/E. AdminPage — menu phẳng + badge, form XEM khuyến mãi, footer
// chi tiết đơn có điều kiện, modal trả hàng, modal đổi mật khẩu, popup hội viên
// ============================================================================

const ok = (data: unknown) => ({ success: true, data });

const daysAgoIso = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();

interface Dot18Mocks {
  pendingOrders?: number;
  returns?: Array<Record<string, unknown>>;
  reviews?: Array<Record<string, unknown>>;
  orders?: Array<Record<string, unknown>>;
  products?: Array<Record<string, unknown>>;
  categories?: Array<Record<string, unknown>>;
  promos?: Array<Record<string, unknown>>;
  customers?: Array<Record<string, unknown>>;
  tiers?: Array<Record<string, unknown>>;
  orderDetail?: Record<string, unknown>;
}

function mockFetchDot18(m: Dot18Mocks = {}) {
  const customers = m.customers ?? [];
  globalThis.fetch = vi.fn((url: any, init?: any) => {
    const urlStr = typeof url === 'string' ? url : url.url;
    const method = (init?.method ?? 'GET') as string;
    if (urlStr.includes('/api/admin/profile')) return respond(200, ok(adminProfile));
    if (urlStr.includes('/api/admin/dashboard')) {
      return respond(200, ok({
        revenueToday: 0, revenueThisMonth: 0, pendingOrders: m.pendingOrders ?? 0,
        newCustomers30d: 0, ordersByStatus: {}, lowStockProducts: [], expiringVouchers: [],
      }));
    }
    if (urlStr.includes('/api/admin/reports/revenue')) {
      return respond(200, ok({ byDay: [], topProducts: [], totalOrders: 0, cancelledOrders: 0, cancelRate: 0, voucherOrders: 0, voucherUsageRate: 0 }));
    }
    if (urlStr.includes('/api/admin/membership/config') && method === 'PUT') return respond(200, ok(m.tiers ?? []));
    if (urlStr.includes('/api/admin/membership/config')) return respond(200, ok(m.tiers ?? []));
    if (urlStr.includes('/api/admin/membership/') && urlStr.includes('/adjust-points')) return respond(200, ok(null));
    if (urlStr.includes('/api/admin/customers?search=')) {
      const q = new URL(urlStr, 'http://localhost').searchParams.get('search') ?? '';
      return respond(200, ok(customers.filter(c => String((c as Record<string, unknown>).email).toLowerCase().includes(q.toLowerCase()))));
    }
    if (urlStr.includes('/api/admin/customers')) return respond(200, ok(customers));
    if (urlStr.includes('/api/admin/evaluations')) return respond(200, ok(m.reviews ?? []));
    if (urlStr.includes('/api/admin/returns/') && urlStr.includes('/resolve')) return respond(200, ok(null));
    if (urlStr.includes('/api/admin/returns')) return respond(200, ok(m.returns ?? []));
    if (urlStr.includes('/api/admin/orders/') && urlStr.includes('/status')) return respond(200, ok(null));
    if (urlStr.includes('/api/admin/orders/')) return respond(200, ok(m.orderDetail ?? { order: null }));
    if (urlStr.includes('/api/admin/orders')) return respond(200, ok(m.orders ?? []));
    if (urlStr.includes('/api/admin/products')) return respond(200, ok(m.products ?? []));
    if (urlStr.includes('/api/admin/categories')) return respond(200, ok(m.categories ?? []));
    if (urlStr.includes('/api/admin/promotions')) return respond(200, ok(m.promos ?? []));
    return respond(200, ok([]));
  });
}

function renderAdmin() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/orders/:code" element={<AdminPage />} />
        {/* Đợt 21 — route KM full page (giữ đồng bộ với App.tsx). */}
        <Route path="/promotions/new" element={<AdminPage />} />
        <Route path="/promotions/:code/usages" element={<AdminPage />} />
        <Route path="/promotions/:code/edit" element={<AdminPage />} />
        <Route path="/promotions/:code" element={<AdminPage />} />
        {/* Đợt 21 — route DM/KH/Trả hàng/Đánh giá full page (giữ đồng bộ với App.tsx). */}
        <Route path="/categories/new" element={<AdminPage />} />
        <Route path="/categories/:code/edit" element={<AdminPage />} />
        <Route path="/categories/:code" element={<AdminPage />} />
        <Route path="/customers/:code/edit" element={<AdminPage />} />
        <Route path="/customers/:code" element={<AdminPage />} />
        <Route path="/returns/:code" element={<AdminPage />} />
        <Route path="/reviews/:id" element={<AdminPage />} />
        <Route path="/login" element={<div data-testid="login-page">Đăng nhập</div>} />
        <Route path="/" element={<div data-testid="home-page">Trang chủ</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const fetchCalls = () => (globalThis.fetch as unknown as { mock: { calls: Array<[unknown, { method?: string; body?: string } | undefined]> } }).mock.calls;
const calledWith = (urlPart: string, method: string) =>
  fetchCalls().some(([url, init]) => String(url).includes(urlPart) && (init?.method ?? 'GET') === method);

const openTab = async (testid: string) => {
  await waitFor(() => {
    expect(screen.getByTestId(testid)).toBeInTheDocument();
  });
  fireEvent.click(screen.getByTestId(testid));
};

const mkPromos = () => [
  { id: 'promo-draft', code: 'SALE10', description: 'Giảm 10%', discountType: 'Percentage', discountValue: 10, minOrderAmount: 0, maxDiscountAmount: null, startDate: null, expiryDate: '2026-12-31T00:00:00Z', maxUses: 100, usedCount: 0, maxUsesPerUser: 1, minTier: null, scopeType: 'All', status: 'Draft' },
  { id: 'promo-active', code: 'SALE20', description: 'Giảm 20%', discountType: 'Percentage', discountValue: 20, minOrderAmount: 100000, maxDiscountAmount: null, startDate: null, expiryDate: '2026-12-31T00:00:00Z', maxUses: 100, usedCount: 5, maxUsesPerUser: 1, minTier: null, scopeType: 'All', status: 'Active' },
];

const mkTiers = () => [
  { tier: 'Member', minSpent: 0, spendPerPoint: 10000, maxPointsPercent: 10, freeShipThreshold: 299000 },
  { tier: 'Silver', minSpent: 5000000, spendPerPoint: 10000, maxPointsPercent: 15, freeShipThreshold: 299000 },
  { tier: 'Gold', minSpent: 15000000, spendPerPoint: 8000, maxPointsPercent: 20, freeShipThreshold: 199000 },
  { tier: 'Diamond', minSpent: 30000000, spendPerPoint: 5000, maxPointsPercent: 30, freeShipThreshold: 0 },
];

describe('AdminPage — menu dropdown + badge (đợt 21, 22:18 — ghi đè menu phẳng đợt 18 wave D)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  // Doc CSS tu source (giong helper ban va 18.1 o cuoi file).
  const adminPageCss = () => {
    const candidates = [
      path.resolve(process.cwd(), 'src/components/admin/AdminPage.css'),
      path.resolve(process.cwd(), 'src/Admin/src/components/admin/AdminPage.css'),
    ];
    const found = candidates.find((p) => existsSync(p));
    if (!found) throw new Error(`Không tìm thấy AdminPage.css (cwd=${process.cwd()})`);
    return readFileSync(found, 'utf-8');
  };

  it('menu dropdown: tiêu đề nhóm là <button> có chevron phải + aria-expanded; mặc định ở tab Tổng quan mọi nhóm ĐÓNG; bấm mở/đóng từng nhóm, nhớ localStorage', async () => {
    mockFetchDot18({ pendingOrders: 3 });
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-orders')).toBeInTheDocument();
    });
    // Tên nhóm (dạng tiêu đề, KHÔNG in hoa); nhóm khách hàng đổi tên
    // "Quản lý khách hàng" → "Quản trị" (đợt 21).
    for (const [testid, label] of [
      ['admin-nav-group-sales', 'Bán hàng'],
      ['admin-nav-group-products', 'Quản lý sản phẩm'],
      ['admin-nav-group-customers', 'Quản trị'],
      ['admin-nav-group-system', 'Hệ thống'],
    ] as const) {
      const group = screen.getByTestId(testid);
      expect(group.tagName).toBe('BUTTON');
      expect(group).toHaveTextContent(label);
      // Chevron Lucide ở phía phải tiêu đề nhóm (svg con duy nhất của nút).
      expect(group.querySelector('svg')).not.toBeNull();
      expect(group.querySelector('.sa-nav-group-chevron')).not.toBeNull();
      expect(group.querySelector('button')).toBeNull();
      // Mặc định ở tab Tổng quan (không thuộc nhóm nào): mọi nhóm ĐÓNG.
      expect(group).toHaveAttribute('aria-expanded', 'false');
      expect(group.closest('.sa-nav-group')).not.toHaveClass('sa-open');
      expect(group).toHaveAttribute('aria-controls', `admin-nav-group-items-${testid.replace('admin-nav-group-', '')}`);
    }
    // 10 mục vẫn có trong DOM (thu lại bằng CSS, không gỡ khỏi DOM).
    for (const id of ['admin-nav-orders', 'admin-nav-returns', 'admin-nav-promotions', 'admin-nav-products', 'admin-nav-categories', 'admin-nav-reviews', 'admin-nav-customers', 'admin-nav-membership', 'admin-nav-logs']) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
      // Không icon/svg trước tên các mục con.
      expect(screen.getByTestId(id).querySelector('svg')).toBeNull();
    }
    // Bấm tiêu đề nhóm Bán hàng → mở; bấm lại → đóng; chỉ nhóm đó đổi.
    const sales = screen.getByTestId('admin-nav-group-sales');
    fireEvent.click(sales);
    expect(sales).toHaveAttribute('aria-expanded', 'true');
    expect(sales.closest('.sa-nav-group')).toHaveClass('sa-open');
    expect(screen.getByTestId('admin-nav-group-products')).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(sales);
    expect(sales).toHaveAttribute('aria-expanded', 'false');
    expect(sales.closest('.sa-nav-group')).not.toHaveClass('sa-open');
    // Trạng thái mở/đóng được ghi vào localStorage ngay khi bấm.
    fireEvent.click(screen.getByTestId('admin-nav-group-products'));
    expect(JSON.parse(localStorage.getItem('dafl_admin_nav_groups') ?? '{}')).toMatchObject({ sales: false, products: true });
    // Không badge tổng nhóm.
    for (const key of ['sales', 'products', 'customers', 'system']) {
      expect(screen.queryByTestId(`admin-nav-group-${key}-badge`)).toBeNull();
    }
  });

  it('menu dropdown: reload nhớ trạng thái mở/đóng từng nhóm qua localStorage', async () => {
    // Đã lưu trước: chỉ nhóm Bán hàng mở, các nhóm khác đóng.
    localStorage.setItem('dafl_admin_nav_groups', JSON.stringify({ sales: true, products: false, customers: false, system: false }));
    mockFetchDot18({ pendingOrders: 3 });
    const { unmount } = renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-orders')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-nav-group-sales')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('admin-nav-group-products')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('admin-nav-group-customers')).toHaveAttribute('aria-expanded', 'false');
    // Đóng nhóm Bán hàng rồi reload (unmount + render lại) → vẫn đóng.
    fireEvent.click(screen.getByTestId('admin-nav-group-sales'));
    expect(JSON.parse(localStorage.getItem('dafl_admin_nav_groups') ?? '{}')).toMatchObject({ sales: false });
    unmount();
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-orders')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-nav-group-sales')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('admin-nav-group-products')).toHaveAttribute('aria-expanded', 'false');
  });

  it('menu dropdown qua CSS (đợt 23, sidebar TỐI): tiêu đề nhóm 15px/600 KHÔNG in hoa, màu #e6f0ea; menu con 14px/500 #b9cdc0 thụt 12–16px + đường dọc trái; chevron xoay 180° khi mở; mở mượt 200ms ease-out; reduced-motion tắt hiệu ứng', () => {
    const css = adminPageCss();
    const titleRules = [...css.matchAll(/\.spark-admin\s+\.sa-nav-group-title\s*\{([^}]*)\}/g)].map(m => m[1]);
    expect(titleRules.length).toBeGreaterThan(0);
    expect(titleRules.some(r => r.includes('font-size: 15px'))).toBe(true);
    expect(titleRules.some(r => r.includes('font-weight: 600'))).toBe(true);
    expect(titleRules.some(r => r.includes('letter-spacing: 0'))).toBe(true);
    // KHÔNG in hoa (đợt 22 uppercase đã bỏ): không rule tiêu đề nào uppercase.
    expect(titleRules.some(r => r.includes('text-transform: uppercase'))).toBe(false);
    // Màu #e6f0ea trên nền tối: tương phản 13.15–15.68 (WCAG AA ≥ 4.5).
    expect(titleRules.some(r => r.includes('color: #e6f0ea'))).toBe(true);
    expect(titleRules.some(r => r.includes('padding: 10px 12px'))).toBe(true);
    // Chevron phải màu trung tính #8aa396 (tương phản 5.67–6.75, WCAG AA).
    const chevronRule = css.match(/\.spark-admin\s+\.sa-nav-group-chevron\s*\{([^}]*)\}/);
    expect(chevronRule).not.toBeNull();
    expect(chevronRule![1]).toContain('color: #8aa396');
    const btnRules = [...css.matchAll(/\.spark-admin\s+\.sa-nav-btn\s*\{([^}]*)\}/g)].map(m => m[1]);
    expect(btnRules.length).toBeGreaterThan(0);
    expect(btnRules.some(r => r.includes('font-size: 14px'))).toBe(true);
    expect(btnRules.some(r => r.includes('font-weight: 500'))).toBe(true);
    expect(btnRules.some(r => r.includes('color: #b9cdc0'))).toBe(true);
    expect(btnRules.some(r => r.includes('padding: 8px 12px'))).toBe(true);
    expect(btnRules.some(r => r.includes('border-radius: 8px'))).toBe(true);
    // Mục con thụt 12–16px so với menu cha: vùng mục con margin-left 12px +
    // đường dọc trái 1px mờ; chữ con bắt đầu ở 25px, tiêu đề ở 12px → thụt 13px.
    const itemsRule = css.match(/\.spark-admin\s+\.sa-nav-group-items\s*\{([^}]*)\}/);
    expect(itemsRule).not.toBeNull();
    expect(itemsRule![1]).toContain('margin-left: 12px');
    expect(itemsRule![1]).toContain('border-left: 1px solid rgba(255, 255, 255, 0.12)');
    // Menu cha KHÔNG đổi màu khi con đang active: không có rule .sa-open
    // nào đặt màu cho tiêu đề nhóm.
    expect(css).not.toMatch(/\.spark-admin\s+\.sa-nav-group\.sa-open\s+\.sa-nav-group-title\s*\{/);
    // Hover mục con: nền nhạt + chữ sáng hơn.
    const hoverRule = css.match(/\.spark-admin\s+\.sa-nav-btn:hover\s*\{([^}]*)\}/);
    expect(hoverRule).not.toBeNull();
    expect(hoverRule![1]).toContain('background: rgba(255, 255, 255, 0.06)');
    expect(hoverRule![1]).toContain('color: #e6f0ea');
    // Chevron xoay 180° khi nhóm mở + transition 200ms ease-out.
    expect(css).toMatch(/\.spark-admin\s+\.sa-nav-group\.sa-open\s+\.sa-nav-group-chevron\s*\{[^}]*transform:\s*rotate\(180deg\)/);
    expect(css).toMatch(/\.spark-admin\s+\.sa-nav-group-chevron\s*\{[^}]*transition:\s*transform 200ms ease-out/);
    // Vùng mục con mở/thu bằng grid-rows, ~200ms ease-out.
    expect(css).toMatch(/\.spark-admin\s+\.sa-nav-group-items\s*\{[^}]*grid-template-rows:\s*1fr;[^}]*transition:\s*grid-template-rows 200ms ease-out/);
    expect(css).toMatch(/\.spark-admin\s+\.sa-nav-group:not\(\.sa-open\)\s+\.sa-nav-group-items\s*\{[^}]*grid-template-rows:\s*0fr;[^}]*visibility:\s*hidden/);
    // prefers-reduced-motion tắt hiệu ứng mở/xoay (nằm trong block reduce).
    const reduceBlock = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/);
    expect(reduceBlock).not.toBeNull();
    expect(reduceBlock![1]).toContain('.sa-nav-group-chevron');
    expect(reduceBlock![1]).toContain('.sa-nav-group-items');
  });

  it('badge (đợt 21 bỏ badge đơn): KHÔNG có badge tổng nhóm; badge Trả 2 vẫn hiện; menu Đơn hàng KHÔNG còn badge dù pendingOrders = 3', async () => {
    mockFetchDot18({
      pendingOrders: 3,
      returns: [
        { id: 'r1', orderId: 'o1', orderDisplayCode: 'DH-2001', productId: 'p1', productName: 'Son kem', quantity: 1, reason: 'Lỗi', status: 'Pending', createdAt: daysAgoIso(1) },
        { id: 'r2', orderId: 'o2', orderDisplayCode: 'DH-2002', productId: 'p1', productName: 'Son lì', quantity: 1, reason: 'Đổi ý', status: 'Pending', createdAt: daysAgoIso(1) },
        { id: 'r3', orderId: 'o3', orderDisplayCode: 'DH-2003', productId: 'p1', productName: 'Kem', quantity: 1, reason: 'Lỗi', status: 'Approved', createdAt: daysAgoIso(1) },
      ],
    });
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-returns-badge')).toHaveTextContent('2');
    });
    // Đợt 21: menu Đơn hàng không còn badge số dù dashboard trả pendingOrders = 3.
    expect(screen.queryByTestId('admin-nav-orders-badge')).toBeNull();
    // Không badge tổng nhóm dù nhóm có badge con.
    expect(screen.queryByTestId('admin-nav-group-sales-badge')).toBeNull();
    expect(screen.queryByTestId('admin-nav-group-products-badge')).toBeNull();
  });

  it('spacing + màu menu TỐI qua CSS (đợt 23 + đợt 26): nhóm cách 16px, mục padding 8px 12px + cách 4px, Tổng quan cách nhóm đầu 16px; sidebar PHẲNG #0E2A1F (bỏ gradient), mục chọn nền xanh đậm + chữ lime #bff53c, badge giữ cam; drawer <960px', () => {
    const css = adminPageCss();
    expect(css).toMatch(/\.spark-admin\s+\.sa-nav-group\s*\{\s*margin-top:\s*16px;?\s*\}/);
    expect(css).toMatch(/\.spark-admin\s+\.sa-nav-overview\s*\{\s*margin-bottom:\s*0;?\s*\}/);
    // Chỉ có 1 kiểu ngắt nhóm (whitespace 14px): không còn rule nhóm kề nhau riêng.
    expect(css).not.toMatch(/\.spark-admin\s+\.sa-nav-group\s*\+\s*\.sa-nav-group\s*\{/);
    const btnRules = [...css.matchAll(/\.spark-admin\s+\.sa-nav-btn\s*\{([^}]*)\}/g)].map(m => m[1]);
    expect(btnRules.length).toBeGreaterThan(0);
    expect(btnRules.some(r => r.includes('padding: 8px 12px'))).toBe(true);
    expect(btnRules.some(r => /margin-bottom:\s*4px/.test(r))).toBe(true);
    const titleRules = [...css.matchAll(/\.spark-admin\s+\.sa-nav-group-title\s*\{([^}]*)\}/g)].map(m => m[1]);
    expect(titleRules.length).toBeGreaterThan(0);
    expect(titleRules.some(r => r.includes('padding: 10px 12px'))).toBe(true);
    // Sidebar TỐI (đợt 23 đảo ngược đợt 22 sáng; đợt 26 bỏ gradient đợt 20):
    // nền PHẲNG #0E2A1F, viền phải mờ trắng — không còn nền trắng, không gradient.
    const sidebarRule = css.match(/\.spark-admin\s+\.sa-sidebar\s*\{([^}]*)\}/);
    expect(sidebarRule).not.toBeNull();
    expect(sidebarRule![1]).toContain('background: #0E2A1F');
    expect(sidebarRule![1]).not.toContain('linear-gradient');
    expect(sidebarRule![1]).toContain('border-right: 1px solid rgba(255, 255, 255, 0.08)');
    expect(sidebarRule![1]).not.toContain('background: #ffffff');
    // Một font Inter cho toàn bộ menu: rule .sa-sidebar * ép font.
    expect(css).toMatch(/\.spark-admin\s+\.sa-sidebar,\s*\.spark-admin\s+\.sa-sidebar\s+\*\s*\{[^}]*font-family:\s*'Inter'/);
    // Mục chọn: nền xanh đậm rgba(22,163,74,0.22) + chữ lime #bff53c
    // (tương phản 9.69 trên nền active đã blend #0d3c22, WCAG AA) + thanh lime 3px.
    const activeRule = css.match(/\.spark-admin\s+\.sa-nav-btn\.sa-active\s*\{([^}]*)\}/);
    expect(activeRule).not.toBeNull();
    expect(activeRule![1]).toContain('background: rgba(22, 163, 74, 0.22)');
    expect(activeRule![1]).toContain('color: #bff53c');
    expect(activeRule![1]).toContain('font-weight: 600');
    const barRule = css.match(/\.spark-admin\s+\.sa-nav-btn::before\s*\{([^}]*)\}/);
    expect(barRule).not.toBeNull();
    expect(barRule![1]).toContain('width: 3px');
    expect(barRule![1]).toContain('background: #bff53c');
    // Badge giữ cam sáng: nền #FEF3C7 + chữ #92400E (tương phản 6.37), cao 20px, font 12px.
    const badgeRule = css.match(/\.spark-admin\s+\.sa-nav-badge\s*\{([^}]*)\}/);
    expect(badgeRule).not.toBeNull();
    expect(badgeRule![1]).toContain('background: #fef3c7');
    expect(badgeRule![1]).toContain('color: #92400e');
    expect(badgeRule![1]).toContain('height: 20px');
    expect(badgeRule![1]).toContain('font-size: 12px');
    // Badge KHÔNG đổi sang xanh lá/lime trên mục đang chọn.
    expect(css).not.toMatch(/\.spark-admin\s+\.sa-nav-btn\.sa-active\s+\.sa-nav-badge\s*\{/);
    // Drawer dưới 960px (đợt 23 đổi từ 1023px); không còn breakpoint 1023px
    // cho sidebar trong CSS.
    expect(css).toMatch(/@media\s*\(max-width:\s*959px\)\s*\{/);
    expect(css).not.toMatch(/@media\s*\(max-width:\s*1023px\)/);
    expect(css).toMatch(/@media\s*\(min-width:\s*960px\)\s*\{/);
  });

  it('badge: ẩn khi = 0 (chờ dashboard tải xong vẫn không có badge)', async () => {
    mockFetchDot18({ pendingOrders: 0 });
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-dashboard')).toBeInTheDocument();
    });
    // Chờ fetch dashboard hoàn tất rồi mới khẳng định badge ẩn (tránh pass rỗng).
    await waitFor(() => {
      expect(fetchCalls().some(([u]) => String(u).includes('/api/admin/dashboard'))).toBe(true);
    });
    await new Promise(r => setTimeout(r, 50));
    expect(screen.queryByTestId('admin-nav-orders-badge')).toBeNull();
    expect(screen.queryByTestId('admin-nav-returns-badge')).toBeNull();
    expect(screen.queryByTestId('admin-nav-reviews-badge')).toBeNull();
  });

  it('badge đơn (đợt 21): KHÔNG còn badge menu Đơn hàng dù pendingOrders > 99', async () => {
    mockFetchDot18({ pendingOrders: 150 });
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-dashboard')).toBeInTheDocument();
    });
    // Chờ fetch dashboard hoàn tất rồi mới khẳng định badge đơn vắng mặt.
    await waitFor(() => {
      expect(fetchCalls().some(([u]) => String(u).includes('/api/admin/dashboard'))).toBe(true);
    });
    await new Promise(r => setTimeout(r, 50));
    expect(screen.queryByTestId('admin-nav-orders-badge')).toBeNull();
  });

  it('badge đánh giá: mới = tạo trong 7 ngày qua (Evaluation không có cờ đã xử lý)', async () => {
    mockFetchDot18({
      reviews: [
        { id: 'rv-1', productId: 'p1', productName: 'Son kem', userId: 'u1', userName: 'Lan Anh', rating: 5, comment: 'Đẹp.', createdAt: daysAgoIso(2) },
        { id: 'rv-2', productId: 'p2', productName: 'Kem dưỡng', userId: 'u2', userName: 'Minh Quân', rating: 1, comment: 'Tệ.', createdAt: daysAgoIso(10) },
      ],
    });
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-reviews-badge')).toHaveTextContent('1');
    });
  });

  it('menu dropdown: bấm "Xem" ở "Đơn chờ xác nhận" trên dashboard đi thẳng tab Đơn + TỰ MỞ nhóm Bán hàng đang đóng', async () => {
    // localStorage đang đóng nhóm Bán hàng: điều hướng sang tab Đơn hàng
    // phải tự mở nhóm chứa nó (đợt 21).
    localStorage.setItem('dafl_admin_nav_groups', JSON.stringify({ sales: false, products: false, customers: false, system: false }));
    mockFetchDot18({ pendingOrders: 3 });
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-dashboard')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-nav-orders')).toBeInTheDocument();
    expect(screen.getByTestId('admin-nav-group-sales')).toHaveAttribute('aria-expanded', 'false');
    // Bấm "Xem" ở dòng "Đơn chờ xác nhận" trong khối "Cần xử lý ngay".
    fireEvent.click(screen.getByTestId('admin-dashboard-action-pending-orders-view'));
    await waitFor(() => {
      expect(screen.getByTestId('orders-search-input')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-nav-group-sales')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('admin-nav-group-sales').closest('.sa-nav-group')).toHaveClass('sa-open');
  });

  it('bấm mục menu điều hướng đúng tab (Sản phẩm / Nhật ký)', async () => {
    mockFetchDot18({});
    renderAdmin();
    await openTab('admin-nav-products');
    expect(screen.getByTestId('products-search-input')).toBeInTheDocument();
    await openTab('admin-nav-logs');
    expect(screen.getByTestId('logs-search-input')).toBeInTheDocument();
    expect(screen.getByTestId('admin-log-date-from')).toBeInTheDocument();
    expect(screen.getByTestId('admin-log-date-to')).toBeInTheDocument();
  });
});

describe('AdminPage — form XEM khuyến mãi + footer đơn + trả hàng + đổi mật khẩu + hội viên (đợt 18)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('Khuyến mãi (đợt 21): bấm mắt mở TRANG Chi tiết full page (4 card, chỉ xem) + [Chỉnh sửa] sang trang sửa giữ dữ liệu', async () => {
    mockFetchDot18({ promos: mkPromos() });
    renderAdmin();
    await openTab('admin-nav-promotions');
    await waitFor(() => {
      expect(screen.getByText('SALE10')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Xem chi tiết khuyến mãi SALE10'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-promo-detail-page')).toBeInTheDocument();
    });
    // Trang chi tiết (không còn form view Drawer): breadcrumb + 4 card, không có form.
    expect(screen.queryByTestId('admin-promo-form-modal')).toBeNull();
    expect(screen.queryByTestId('admin-promo-form')).toBeNull();
    expect(screen.getByTestId('admin-promo-breadcrumb')).toHaveTextContent('Chi tiết');
    expect(screen.getByTestId('admin-promo-detail-code')).toHaveTextContent('SALE10');
    expect(screen.getByTestId('admin-promo-detail-general')).toHaveTextContent('Nháp');
    expect(screen.getByTestId('admin-promo-detail-general')).toHaveTextContent('Phần trăm');
    expect(screen.getByTestId('admin-promo-detail-general')).toHaveTextContent('10%');
    expect(screen.getByTestId('admin-promo-detail-conditions')).toBeInTheDocument();
    expect(screen.getByTestId('admin-promo-detail-time')).toBeInTheDocument();
    expect(screen.getByTestId('admin-promo-detail-stats')).toBeInTheDocument();
    expect(screen.getByTestId('admin-promo-detail-used-count')).toHaveTextContent('0');
    expect(screen.queryByTestId('admin-promo-save-btn')).toBeNull();
    // Nút [Chỉnh sửa] ở header trang chi tiết (voucher Nháp) → trang sửa giữ dữ liệu.
    const detailEditBtn = screen.getByTestId('admin-promo-detail-edit-btn');
    expect(detailEditBtn).toHaveTextContent('Chỉnh sửa');
    fireEvent.click(detailEditBtn);
    await waitFor(() => {
      expect(screen.getByTestId('admin-promo-edit-page')).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-promo-form')).toHaveAttribute('data-form-mode', 'edit');
    expect(screen.getByTestId('admin-promo-code-input')).toBeDisabled();
    expect(screen.getByTestId('admin-promo-description-input')).toHaveValue('Giảm 10%');
    expect(screen.getByTestId('admin-promo-save-btn')).toHaveTextContent('Lưu thay đổi');
  });

  const orderDetailFor = (status: string) => ({
    order: {
      id: 'o1', orderCode: 1001, orderDisplayCode: 'DH-1001', customerName: 'Khách 01',
      customerEmail: 'khach1@example.com', customerPhone: '0900000001', subTotal: 500000,
      totalAmount: 500000, status, createdAt: '2026-11-08T10:00:00Z',
      paymentMethod: 'COD', items: [], statusHistories: [],
    },
  });
  const mkOrders = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `o${i + 1}`, orderDisplayCode: `DH-${1001 + i}`, orderCode: 1001 + i,
      customerName: `Khách ${String(i + 1).padStart(2, '0')}`,
      customerEmail: `khach${i + 1}@example.com`,
      status: 'Pending', paymentMethod: 'COD', totalAmount: 500000, createdAt: '2026-11-08T10:00:00Z',
    }));

  it('Chi tiết đơn (đợt 21, trang riêng): đơn Pending → đích Đã xác nhận qua panel, KHÔNG popup D2, gọi POST', async () => {
    mockFetchDot18({ orders: mkOrders(1), orderDetail: orderDetailFor('Pending') });
    renderAdmin();
    await openTab('admin-nav-orders');
    await waitFor(() => {
      expect(screen.getByText('Khách 01')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-order-row-o1'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-order-detail-title')).toHaveTextContent('Đơn DH-1001');
    });
    expect(screen.getByTestId('admin-order-cancel-btn')).toHaveTextContent('Hủy đơn');
    expect(screen.getByTestId('admin-order-change-status-btn')).toHaveTextContent('Đổi trạng thái');
    // Đợt 21: panel đổi trạng thái thay popup D2 "Xác nhận đơn?" —
    // bấm [Đổi trạng thái] mở panel, chọn đích rồi [Xác nhận đổi] gọi POST.
    fireEvent.click(screen.getByTestId('admin-order-change-status-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-order-status-panel')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('admin-order-status-select'), { target: { value: 'Confirmed' } });
    fireEvent.click(screen.getByTestId('admin-order-status-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/orders/o1/status', 'POST')).toBe(true);
    });
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đã cập nhật đơn hàng');
    });
  });

  it('Chi tiết đơn (đợt 21, trang riêng): đơn Pending → đích Đã thanh toán qua panel, KHÔNG popup D3, gọi POST', async () => {
    mockFetchDot18({ orders: mkOrders(1), orderDetail: orderDetailFor('Pending') });
    renderAdmin();
    await openTab('admin-nav-orders');
    await waitFor(() => {
      expect(screen.getByText('Khách 01')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-order-row-o1'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-order-detail-title')).toHaveTextContent('Đơn DH-1001');
    });
    fireEvent.click(screen.getByTestId('admin-order-change-status-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-order-status-panel')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('admin-order-status-select'), { target: { value: 'Paid' } });
    fireEvent.click(screen.getByTestId('admin-order-status-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/orders/o1/status', 'POST')).toBe(true);
    });
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đã cập nhật đơn hàng');
    });
  });

  it('Chi tiết đơn (đợt 21, trang riêng): đơn Hoàn tất (terminal) thì cả 2 nút header đều disable, không có panel; breadcrumb về danh sách', async () => {
    mockFetchDot18({ orders: mkOrders(1), orderDetail: orderDetailFor('Completed') });
    renderAdmin();
    await openTab('admin-nav-orders');
    await waitFor(() => {
      expect(screen.getByText('Khách 01')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-order-row-o1'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-order-detail-title')).toHaveTextContent('Đơn DH-1001');
    });
    // Đợt 21: 2 nút header luôn hiện nhưng disable khi đơn kết thúc
    // (không còn nút [Đóng] ở footer như Drawer đợt 18).
    expect(screen.getByTestId('admin-order-cancel-btn')).toBeDisabled();
    expect(screen.getByTestId('admin-order-change-status-btn')).toBeDisabled();
    expect(screen.queryByTestId('admin-order-status-panel')).toBeNull();
    expect(screen.queryByTestId('admin-order-status-select')).toBeNull();
    // Đợt 25/26: breadcrumb "Đơn hàng" chỉ còn <span> (không bấm được); về danh
    // sách bằng nút [← Quay lại] đầu tiên (admin-order-detail-back-btn).
    expect(screen.getByTestId('admin-order-detail-breadcrumb')).toHaveTextContent('Đơn hàng');
    fireEvent.click(screen.getByTestId('admin-order-detail-back-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('admin-order-detail-title')).toBeNull();
    });
    expect(screen.getByTestId('orders-search-input')).toBeInTheDocument();
  });

  it('Trả hàng (đợt 21): TRANG CHI TIẾT full page chỉ có [Từ chối] + [Duyệt] ở đầu trang (không nút Hủy); duyệt qua PANEL INLINE gọi POST resolve', async () => {
    const rows = [
      { id: 'r1', orderId: 'o1', orderDisplayCode: 'DH-2001', productId: 'p1', productName: 'Son kem 3CE', quantity: 1, reason: 'Lỗi sản phẩm', status: 'Pending', createdAt: '2026-11-08T10:00:00Z' },
    ];
    mockFetchDot18({ returns: rows });
    renderAdmin();
    await openTab('admin-nav-returns');
    await waitFor(() => {
      expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Duyệt / Từ chối'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-return-detail-page')).toBeInTheDocument();
    });
    // Đợt 21: không còn Drawer chi tiết (admin-return-detail đã bỏ); nút
    // Duyệt/Từ chối ở ĐẦU trang, trong header sticky.
    expect(screen.queryByTestId('admin-return-detail')).toBeNull();
    const headBtns = within(screen.getByTestId('admin-return-detail-page')).getAllByRole('button')
      .filter(b => b.closest('.sa-promo-page-head-actions'));
    // Đợt 25/26: header sticky có thêm nút [← Quay lại] đầu tiên.
    expect(headBtns).toHaveLength(3);
    expect(screen.getByTestId('admin-return-detail-back-btn')).toHaveTextContent('Quay lại');
    expect(screen.getByTestId('admin-return-reject-btn')).toHaveTextContent('Từ chối');
    expect(screen.getByTestId('admin-return-approve-btn')).toHaveTextContent('Duyệt');
    // Bấm Duyệt → panel xác nhận INLINE (KHÔNG ConfirmDialog).
    fireEvent.click(screen.getByTestId('admin-return-approve-btn'));
    expect(screen.getByTestId('admin-return-approve-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    fireEvent.click(screen.getByTestId('admin-return-approve-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/returns/r1/resolve', 'POST')).toBe(true);
    });
    const call = fetchCalls().find(([url, init]) => String(url).includes('/api/admin/returns/r1/resolve'));
    expect(JSON.parse(String(call![1]!.body)).approve).toBe(true);
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đã duyệt yêu cầu trả hàng');
    });
  });

  it('Trả hàng (đợt 21): từ chối bắt buộc lý do trong PANEL INLINE; để trống thì chặn, nhập lý do thì POST resolve', async () => {
    const rows = [
      { id: 'r1', orderId: 'o1', orderDisplayCode: 'DH-2001', productId: 'p1', productName: 'Son kem 3CE', quantity: 1, reason: 'Lỗi sản phẩm', status: 'Pending', createdAt: '2026-11-08T10:00:00Z' },
    ];
    mockFetchDot18({ returns: rows });
    renderAdmin();
    await openTab('admin-nav-returns');
    await waitFor(() => {
      expect(screen.getByText('Son kem 3CE')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Duyệt / Từ chối'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-return-detail-page')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-return-reject-btn'));
    expect(screen.getByTestId('admin-return-reject-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    fireEvent.click(screen.getByTestId('admin-return-reject-confirm-btn'));
    expect(screen.getByTestId('admin-return-reject-error')).toHaveTextContent('Vui lòng nhập lý do từ chối.');
    expect(calledWith('/api/admin/returns/r1/resolve', 'POST')).toBe(false);
    fireEvent.change(screen.getByTestId('admin-return-reject-reason-input'), { target: { value: 'Sản phẩm không lỗi' } });
    fireEvent.click(screen.getByTestId('admin-return-reject-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/returns/r1/resolve', 'POST')).toBe(true);
    });
    const call = fetchCalls().find(([url, init]) => String(url).includes('/api/admin/returns/r1/resolve'));
    expect(JSON.parse(String(call![1]!.body))).toEqual({ approve: false, adminNote: 'Sản phẩm không lỗi' });
  });

  it('Đổi mật khẩu: modal giữa màn hình 560px, 3 hàng 1 cột, đúng 2 nút [Hủy] + [Đổi mật khẩu]; bấm X thì đóng', async () => {
    mockFetchDot18({});
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-user-menu-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-user-menu-btn'));
    fireEvent.click(await screen.findByTestId('admin-user-menu-profile'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-profile-page')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-change-password-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-change-password-modal')).toBeInTheDocument();
    });
    // Đợt 23 phần A: modal giữa màn hình (.sa-modal 560px), không còn Drawer
    // FormShell 680px; 3 hàng mỗi hàng 1 ô full width; không còn hint policy.
    const pwModal = screen.getByTestId('admin-change-password-modal');
    expect(pwModal).toHaveClass('sa-modal');
    expect(pwModal).toHaveClass('sa-profile-pw-modal');
    expect(pwModal.closest('.sa-modal-overlay')).not.toBeNull();
    expect(pwModal.closest('.fs-drawer')).toBeNull();
    const pwGrid = pwModal.querySelector('.sa-profile-pw-grid');
    expect(pwGrid).not.toBeNull();
    expect(pwGrid!.children).toHaveLength(3);
    expect(screen.queryByText('Tối thiểu 8 ký tự, gồm chữ hoa, chữ số và ký tự đặc biệt.')).toBeNull();
    expect(screen.getByTestId('admin-change-password-modal-title')).toHaveTextContent('Đổi mật khẩu');
    const footerBtns = within(screen.getByTestId('admin-change-password-modal')).getAllByRole('button')
      .filter(b => b.closest('.sa-modal-foot'));
    expect(footerBtns).toHaveLength(2);
    expect(screen.getByTestId('admin-change-password-cancel-btn')).toHaveTextContent('Hủy');
    expect(screen.getByTestId('admin-change-password-save-btn')).toHaveTextContent('Đổi mật khẩu');
    fireEvent.click(screen.getByTestId('admin-change-password-modal-close-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('admin-change-password-modal')).toBeNull();
    });
  });

  it('Hội viên: lưu cấu hình hạng qua ConfirmDialog 2 nút, PUT config + toast', async () => {
    mockFetchDot18({ tiers: mkTiers() });
    renderAdmin();
    await openTab('admin-nav-membership');
    await waitFor(() => {
      expect(screen.getByText('Thường (Member)')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Ngưỡng Gold'), { target: { value: '16000000' } });
    fireEvent.click(screen.getByTestId('admin-save-tiers-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Lưu cấu hình hạng?');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Lưu cấu hình');
    expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/membership/config', 'PUT')).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đã lưu cấu hình hạng');
    });
  });

  it('Hội viên: điều chỉnh điểm CỘNG qua popup riêng F2 "Xác nhận cộng điểm?" [Hủy][Xác nhận cộng điểm], POST adjust-points + toast', async () => {
    const customer = {
      id: 'u1', code: 'KH-001', email: 'lan@example.com', fullName: 'Lan Anh', phoneNumber: '0912345678',
      role: 'Customer', isLocked: false, membershipTier: 'Gold', totalSpent12m: 6000000, orderCount: 3,
      availablePoints: 250, createdAt: '2026-11-01T10:00:00Z', lastLoginAt: '2026-11-08T10:00:00Z',
    };
    mockFetchDot18({ tiers: mkTiers(), customers: [customer] });
    renderAdmin();
    await openTab('admin-nav-membership');
    await waitFor(() => {
      expect(screen.getByTestId('admin-adjust-points-form')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('admin-adjust-user-input'), { target: { value: 'lan@example.com' } });
    fireEvent.change(screen.getByTestId('admin-adjust-points-input'), { target: { value: '50' } });
    fireEvent.change(screen.getByTestId('admin-adjust-reason-input'), { target: { value: 'Thưởng sinh nhật' } });
    fireEvent.click(screen.getByTestId('admin-adjust-points-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Xác nhận cộng điểm?');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('cộng 50 điểm');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('lan@example.com');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('300 điểm');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Xác nhận cộng điểm');
    expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/membership/u1/adjust-points', 'POST')).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đã điều chỉnh điểm');
      expect(screen.getByTestId('admin-toast-desc')).toHaveTextContent('Cộng 50 điểm cho lan@example.com. Số dư mới: 300 điểm.');
    });
  });

  it('Hội viên: điều chỉnh điểm TRỪ qua popup riêng F3 "Xác nhận trừ điểm?" (cam) [Hủy][Xác nhận trừ điểm], POST adjust-points + toast', async () => {
    const customer = {
      id: 'u1', code: 'KH-001', email: 'lan@example.com', fullName: 'Lan Anh', phoneNumber: '0912345678',
      role: 'Customer', isLocked: false, membershipTier: 'Gold', totalSpent12m: 6000000, orderCount: 3,
      availablePoints: 250, createdAt: '2026-11-01T10:00:00Z', lastLoginAt: '2026-11-08T10:00:00Z',
    };
    mockFetchDot18({ tiers: mkTiers(), customers: [customer] });
    renderAdmin();
    await openTab('admin-nav-membership');
    await waitFor(() => {
      expect(screen.getByTestId('admin-adjust-points-form')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('admin-adjust-user-input'), { target: { value: 'lan@example.com' } });
    fireEvent.change(screen.getByTestId('admin-adjust-points-input'), { target: { value: '-50' } });
    fireEvent.change(screen.getByTestId('admin-adjust-reason-input'), { target: { value: 'Thu hồi điểm lỗi' } });
    fireEvent.click(screen.getByTestId('admin-adjust-points-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent('Xác nhận trừ điểm?');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('trừ 50 điểm');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('lan@example.com');
    expect(screen.getByTestId('confirm-dialog-message')).toHaveTextContent('200 điểm');
    expect(screen.getByTestId('confirm-dialog-confirm-btn')).toHaveTextContent('Xác nhận trừ điểm');
    expect(within(screen.getByTestId('confirm-dialog')).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm-btn'));
    await waitFor(() => {
      expect(calledWith('/api/admin/membership/u1/adjust-points', 'POST')).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByTestId('admin-toast-title')).toHaveTextContent('Đã điều chỉnh điểm');
      expect(screen.getByTestId('admin-toast-desc')).toHaveTextContent('Trừ 50 điểm cho lan@example.com. Số dư mới: 200 điểm.');
    });
  });

  it('Hội viên: hủy đơn ở chi tiết đơn (đợt 21, panel thay popup D1): [Giữ đơn] đóng panel, chưa nhập lý do thì báo lỗi, không gọi API', async () => {
    mockFetchDot18({ orders: mkOrders(1), orderDetail: orderDetailFor('Pending') });
    renderAdmin();
    await openTab('admin-nav-orders');
    await waitFor(() => {
      expect(screen.getByText('Khách 01')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('admin-order-row-o1'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-order-detail-title')).toHaveTextContent('Đơn DH-1001');
    });
    fireEvent.click(screen.getByTestId('admin-order-cancel-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-order-cancel-panel')).toBeInTheDocument();
    });
    // Đợt 21: panel hủy đơn thay popup D1 — nút trái là [Giữ đơn]
    // (không phải [Giữ đơn hàng] của popup D1), lý do hủy bắt buộc.
    expect(screen.getByTestId('admin-order-cancel-keep-btn')).toHaveTextContent('Giữ đơn');
    expect(screen.getByTestId('admin-order-cancel-confirm-btn')).toHaveTextContent('Xác nhận hủy đơn');
    expect(screen.getByTestId('admin-order-cancel-reason-input')).toBeInTheDocument();
    // Xác nhận khi để trống lý do → lỗi, panel vẫn mở, chưa gọi API.
    fireEvent.click(screen.getByTestId('admin-order-cancel-confirm-btn'));
    expect(screen.getByTestId('admin-order-cancel-error')).toHaveTextContent('Vui lòng nhập lý do hủy đơn.');
    expect(calledWith('/api/admin/orders/o1/cancel', 'POST')).toBe(false);
    // Bấm [Giữ đơn]: panel đóng, chi tiết vẫn hiện, không gọi API.
    fireEvent.click(screen.getByTestId('admin-order-cancel-keep-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('admin-order-cancel-panel')).toBeNull();
    });
    expect(calledWith('/api/admin/orders/o1/cancel', 'POST')).toBe(false);
    expect(screen.getByTestId('admin-order-detail-title')).toBeInTheDocument();
  });
});

// F. Bản vá 18.1 — viền focus mục menu (.sa-nav-btn), cập nhật đợt 23:
// Vấn đề: mục menu đang chọn bị khung viền XANH mặc định của trình duyệt
// (focus outline) bao quanh. Vá trong AdminPage.css:
//   .sa-nav-btn:focus { outline: none; }
//   .sa-nav-btn:focus-visible { outline: 2px solid #bff53c;
//                               outline-offset: 2px; }
// → bấm chuột không còn viền; chỉ đi bằng bàn phím mới hiện viền lime.
// Đợt 22 đổi sang #15803D vì xanh chanh chìm trên nền sidebar trắng mới;
// đợt 23 sidebar về TỐI nên #15803D lại chìm → đổi sang lime #bff53c
// (tương phản 11.93–14.22 trên nền gradient tối); offset 2px đồng nhất
// với tiêu đề nhóm.
// GIỚI HẠN jsdom: jsdom không áp stylesheet vào computed style nên không đo
// được outline thật sau click/focus; các test dưới đây khẳng định (a) 2 rule
// CSS tồn tại đúng nội dung trong AdminPage.css, (b) nút menu mang đúng class
// .sa-nav-btn, (c) bấm chuột vẫn điều hướng đúng tab, (d) focus bằng bàn phím
// đặt đúng activeElement và không sinh inline outline. Kiểm tra bằng mắt
// (bấm chuột không viền / Tab có viền lime) vẫn cần làm trên Acer.
// ============================================================================
describe('AdminPage — viền focus mục menu (bản vá 18.1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  // Doc CSS tu source (import.meta.url trong Vitest khong phai scheme file:
  // nen resolve tu process.cwd() voi fallback ca 2 cach chay: tu thu muc
  // workspace Admin (npm run test:admin) hoac tu thu muc src/ goc).
  const adminPageCss = () => {
    const candidates = [
      path.resolve(process.cwd(), 'src/components/admin/AdminPage.css'),
      path.resolve(process.cwd(), 'src/Admin/src/components/admin/AdminPage.css'),
    ];
    const found = candidates.find((p) => existsSync(p));
    if (!found) throw new Error(`Không tìm thấy AdminPage.css (cwd=${process.cwd()})`);
    return readFileSync(found, 'utf-8');
  };

  it('AdminPage.css: :focus tắt outline mặc định của trình duyệt trên .sa-nav-btn', () => {
    const css = adminPageCss();
    expect(css).toMatch(/\.spark-admin\s+\.sa-nav-btn:focus\s*\{\s*outline:\s*none;?\s*\}/);
  });

  it('AdminPage.css: :focus-visible hiện viền lime 2px, offset 2px trên .sa-nav-btn và .sa-nav-group-title', () => {
    const css = adminPageCss();
    const rule = css.match(/\.spark-admin\s+\.sa-nav-btn:focus-visible\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain('outline: 2px solid #bff53c');
    expect(rule![1]).toContain('outline-offset: 2px');
    const titleRule = css.match(/\.spark-admin\s+\.sa-nav-group-title:focus-visible\s*\{([^}]*)\}/);
    expect(titleRule).not.toBeNull();
    expect(titleRule![1]).toContain('outline: 2px solid #bff53c');
    expect(titleRule![1]).toContain('outline-offset: 2px');
  });

  it('AdminPage.tsx (đợt 23): nút hamburger phân biệt drawer <960px bằng matchMedia (max-width: 959px); không còn breakpoint 1023px', () => {
    const candidates = [
      path.resolve(process.cwd(), 'src/components/admin/AdminPage.tsx'),
      path.resolve(process.cwd(), 'src/Admin/src/components/admin/AdminPage.tsx'),
    ];
    const found = candidates.find((p) => existsSync(p));
    if (!found) throw new Error(`Không tìm thấy AdminPage.tsx (cwd=${process.cwd()})`);
    const tsx = readFileSync(found, 'utf-8');
    expect(tsx).toContain("window.matchMedia('(max-width: 959px)')");
    expect(tsx).not.toContain('1023px');
    // Tên nhóm thống nhất "Quản trị": không còn breadcrumb "Quản lý khách hàng".
    expect(tsx).not.toContain('root="Quản lý khách hàng"');
    expect(tsx.match(/root="Quản trị"/g)?.length).toBe(4);
  });

  it('bấm mục menu bằng chuột: điều hướng đúng tab, nút mang class .sa-nav-btn và không có outline inline', async () => {
    mockFetchDot18({});
    renderAdmin();
    await openTab('admin-nav-products');
    expect(screen.getByTestId('products-search-input')).toBeInTheDocument();
    const btn = screen.getByTestId('admin-nav-products');
    expect(btn.className).toContain('sa-nav-btn');
    // Outline (nếu có) chỉ đến từ stylesheet — component không đặt inline.
    expect((btn as HTMLElement).style.outline).toBe('');
  });

  it('focus bằng bàn phím: nút nhận focus (activeElement), không sinh outline inline — viền do rule :focus-visible quyết định', async () => {
    mockFetchDot18({});
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByTestId('admin-nav-orders')).toBeInTheDocument();
    });
    const btn = screen.getByTestId('admin-nav-orders');
    expect(btn.className).toContain('sa-nav-btn');
    btn.focus();
    expect(document.activeElement).toBe(btn);
    expect((btn as HTMLElement).style.outline).toBe('');
  });
});
