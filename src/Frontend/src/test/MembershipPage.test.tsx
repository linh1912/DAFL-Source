import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MembershipPage } from '../components/membership/MembershipPage';

const meGold = {
  tier: 'Gold',
  tierLabel: 'Vàng',
  availablePoints: 250,
  expiringSoonPoints: 50,
  totalSpent12m: 6000000,
  nextTierSpent: 15000000,
  nextTier: 'Diamond',
  nextTierLabel: 'Kim cương',
  spendPerPoint: 10000,
  maxPointsPercent: 20,
  freeShipThreshold: 99000,
  autoUsePoints: true,
  defaultPaymentMethod: 'PayOS',
  birthDate: null,
};

const pointsHistory = [
  { id: 'pt-1', type: 'EARN', points: 100, expiresAt: '2027-11-01T00:00:00Z', reason: 'Tích điểm đơn #1001', orderId: 'o1', createdAt: '2026-11-07T10:00:00Z' },
  { id: 'pt-2', type: 'USE', points: -50, expiresAt: null, reason: 'Dùng điểm giảm giá đơn #1002', orderId: 'o2', createdAt: '2026-11-08T10:00:00Z' },
];

const myVouchers = [
  { id: 'v1', code: 'VANG10', description: 'Giảm 10% cho hạng Vàng', discountType: 'Percentage', discountValue: 10, minOrderAmount: 0, maxDiscountAmount: 150000, expiryDate: '2026-12-31T00:00:00Z', minTier: 'Gold', isPersonal: false },
];

const birthdayVoucher = {
  id: 'v-sn',
  code: 'SN2026',
  description: 'Voucher sinh nhật',
  discountType: 'Percentage',
  discountValue: 15,
  minOrderAmount: 0,
  maxDiscountAmount: 150000,
  expiryDate: '2026-12-31T00:00:00Z',
  minTier: 'Gold',
  isPersonal: true,
};

interface MockOverrides {
  /** Body trả về cho PUT /api/membership/preferences. Mặc định: thành công. */
  preferences?: unknown;
  /** Body trả về cho POST /api/membership/birthday-voucher. Mặc định: thành công theo câu BE. */
  birthdayVoucher?: unknown;
}

function mockMembershipFetch(meBody: unknown, overrides: MockOverrides = {}) {
  // Sau khi nhận voucher sinh nhật thành công, GET /vouchers trả thêm mã SN2026 (mô phỏng load() refresh).
  let claimed = false;
  globalThis.fetch = vi.fn((url: any, init?: any) => {
    const urlStr = typeof url === 'string' ? url : url.url;
    const method = String(init?.method || 'GET').toUpperCase();
    const respond = (body: unknown) => Promise.resolve({ status: 200, json: () => Promise.resolve(body) } as unknown as Response);
    if (urlStr.includes('/api/membership/birthday-voucher') && method === 'POST') {
      const body = overrides.birthdayVoucher ?? {
        success: true,
        message: 'Đã phát voucher sinh nhật (giảm 15%, tối đa 150.000đ, hạn 30 ngày).',
        data: null,
      };
      if ((body as any)?.success) claimed = true;
      return respond(body);
    }
    if (urlStr.includes('/api/membership/preferences') && method === 'PUT') {
      return respond(overrides.preferences ?? { success: true, message: 'Đã cập nhật ngày sinh.', data: null });
    }
    if (urlStr.includes('/api/membership/me')) return respond(meBody);
    if (urlStr.includes('/api/membership/points')) return respond({ success: true, data: pointsHistory });
    if (urlStr.includes('/api/membership/vouchers')) {
      return respond({ success: true, data: claimed ? [...myVouchers, birthdayVoucher] : myVouchers });
    }
    return respond({ success: true, data: [] });
  });
}

describe('MembershipPage (/membership) — đợt 13, mục 2', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('hiện hạng, số dư điểm + giá trị quy đổi, quyền lợi theo hạng, lịch sử điểm và voucher', async () => {
    mockMembershipFetch({ success: true, data: meGold });
    render(<MembershipPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId('membership-page')).toBeInTheDocument();
    });
    // Hạng hiện tại + tiến độ lên hạng tiếp theo.
    expect(screen.getByTestId('membership-tier')).toHaveTextContent('Vàng');
    expect(screen.getByTestId('membership-tier')).toHaveTextContent('Kim cương');
    // Số dư điểm 250 = 250.000đ (1 điểm = 1.000đ).
    expect(screen.getByTestId('membership-points-balance')).toHaveTextContent('250 điểm');
    expect(screen.getByTestId('membership-tier')).toHaveTextContent(/250\.000/);
    expect(screen.getByTestId('membership-tier')).toHaveTextContent('sắp hết hạn: 50 điểm');
    // Quyền lợi lấy từ /me (không hard-code theo hạng).
    const benefits = screen.getByTestId('membership-benefits');
    expect(benefits).toHaveTextContent('10.000đ');
    expect(benefits).toHaveTextContent('20%');
    expect(benefits).toHaveTextContent(/99\.000/);
    expect(benefits).toHaveTextContent('Voucher sinh nhật');
    expect(screen.getByTestId('membership-tier-badge-Gold')).toHaveTextContent('Hạng của bạn');
    // Voucher của tôi.
    expect(screen.getByTestId('membership-voucher-VANG10')).toHaveTextContent('Giảm 10% cho hạng Vàng');
    // Lịch sử điểm: nhãn loại + dấu +/-.
    const history = screen.getByTestId('membership-history');
    expect(history).toHaveTextContent('Tích điểm');
    expect(history).toHaveTextContent('Dùng điểm');
    expect(screen.getByTestId('membership-history-item-pt-1')).toHaveTextContent('+100 điểm');
    expect(screen.getByTestId('membership-history-item-pt-2')).toHaveTextContent('-50 điểm');
  });

  it('chưa đăng nhập: hiện thông báo thay vì số liệu hội viên', async () => {
    mockMembershipFetch({ success: false, data: null, message: 'Bạn cần đăng nhập để xem hội viên.' });
    render(<MembershipPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId('membership-login-required')).toBeInTheDocument();
    });
    expect(screen.getByTestId('membership-login-required')).toHaveTextContent('Bạn cần đăng nhập để xem hội viên.');
    expect(screen.queryByTestId('membership-tier')).not.toBeInTheDocument();
    expect(screen.queryByTestId('membership-history')).not.toBeInTheDocument();
  });

  // --- Đợt 15, mục 3: ngày sinh & voucher sinh nhật ---

  it('ô ngày sinh điền sẵn từ dữ liệu /me (birthDate ISO → YYYY-MM-DD)', async () => {
    mockMembershipFetch({ success: true, data: { ...meGold, birthDate: '1998-05-20T00:00:00Z' } });
    render(<MembershipPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId('birthdate-section')).toBeInTheDocument();
    });
    expect(screen.getByTestId('birthdate-input')).toHaveValue('1998-05-20');
  });

  it('lưu ngày sinh thành công → hiện "Đã cập nhật ngày sinh."', async () => {
    mockMembershipFetch({ success: true, data: meGold });
    render(<MembershipPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId('birthdate-section')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('birthdate-input'), { target: { value: '1998-05-20' } });
    fireEvent.click(screen.getByTestId('birthdate-save-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('birthdate-success-msg')).toHaveTextContent('Đã cập nhật ngày sinh.');
    });
    // PUT đúng endpoint + body.
    const putCall = (globalThis.fetch as any).mock.calls.find(
      ([url, init]: [string, any]) =>
        String(url).includes('/api/membership/preferences') && String(init?.method).toUpperCase() === 'PUT',
    );
    expect(putCall).toBeDefined();
    expect(JSON.parse(putCall[1].body)).toEqual({ birthDate: '1998-05-20' });
  });

  it('lưu ngày sinh bị lỗi 90 ngày → hiện nguyên văn câu BE', async () => {
    mockMembershipFetch(
      { success: true, data: meGold },
      {
        preferences: {
          success: false,
          message: 'Ngày sinh chỉ được sửa 1 lần trong 90 ngày để chống trục lợi voucher sinh nhật.',
          data: null,
        },
      },
    );
    render(<MembershipPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId('birthdate-section')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('birthdate-input'), { target: { value: '1998-05-20' } });
    fireEvent.click(screen.getByTestId('birthdate-save-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('birthdate-error-msg')).toHaveTextContent(
        'Ngày sinh chỉ được sửa 1 lần trong 90 ngày để chống trục lợi voucher sinh nhật.',
      );
    });
  });

  it('nhận voucher sinh nhật thành công → hiện đúng câu BE + danh sách voucher refresh có mã mới', async () => {
    mockMembershipFetch({ success: true, data: { ...meGold, birthDate: '1998-05-20T00:00:00Z' } });
    render(<MembershipPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId('birthdate-section')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('claim-birthday-voucher-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('birthday-voucher-success-msg')).toHaveTextContent(
        'Đã phát voucher sinh nhật (giảm 15%, tối đa 150.000đ, hạn 30 ngày).',
      );
    });
    // load() sau khi nhận thành công → voucher mới hiện trong "Ưu đãi của tôi".
    await waitFor(() => {
      expect(screen.getByTestId('membership-voucher-SN2026')).toBeInTheDocument();
    });
    expect(screen.getByTestId('membership-voucher-SN2026')).toHaveTextContent('Voucher sinh nhật');
  });

  it('nhận voucher khi hạng Thường → hiện nguyên văn "Voucher sinh nhật chỉ dành cho hạng Vàng trở lên."', async () => {
    mockMembershipFetch(
      { success: true, data: { ...meGold, tier: 'Member', tierLabel: 'Thường', birthDate: '1998-05-20T00:00:00Z' } },
      {
        birthdayVoucher: {
          success: false,
          message: 'Voucher sinh nhật chỉ dành cho hạng Vàng trở lên.',
          data: null,
        },
      },
    );
    render(<MembershipPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId('birthdate-section')).toBeInTheDocument();
    });
    // Nút vẫn bấm được kể cả khi chưa đủ điều kiện (BE trả lỗi thật).
    fireEvent.click(screen.getByTestId('claim-birthday-voucher-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('birthday-voucher-error-msg')).toHaveTextContent(
        'Voucher sinh nhật chỉ dành cho hạng Vàng trở lên.',
      );
    });
  });
});
